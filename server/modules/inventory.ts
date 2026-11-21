import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import { inventoryMovements, orderLineItems, orders, returnArrivals } from "../db/schema.ts";
import { pendingBackInStock } from "../lib/back-in-stock.ts";
import {
  AppError,
  mutation,
  noInput,
  query,
  zDay,
  zId,
  zQty,
} from "../rpc/procedure.ts";
import type { Ctx } from "../rpc/procedure.ts";
import { canSeeCost, requireEdit, requireShipAccess, requireView } from "../lib/permissions.ts";
import {
  loadCatalog,
  loadSellable,
  stockLines,
  stockStatus,
} from "../lib/catalog.ts";
import {
  availableQty,
  blendCost,
  getInventoryRow,
  insertMovement,
  updateInventory,
  variantMatch,
} from "../lib/movements.ts";
import type { Movement } from "../db/schema.ts";
import type { MovementType } from "../../shared/constants.ts";
import { syncLowStockAlert } from "../lib/notifications.ts";
import { releaseHeldOrders } from "./orders.ts";
import { lookupMaps, resolveItemNames, userName } from "../lib/items.ts";
import { getTimeZone, moneyFormatter } from "../lib/settings.ts";
import { eventInstant } from "../lib/time.ts";
import { assertPaymentAccount } from "../lib/ledger.ts";
import {
  SEARCH_MAX,
  movementNumberOf,
  searchCondition,
} from "../lib/search.ts";
import { addDays, zonedDayStart } from "../../shared/dates.ts";
import {
  ADJUST_DIRECTIONS,
  ADJUST_DOWN_REASONS,
  ADJUST_REASONS,
  ADJUST_UP_REASONS,
  MONEY_EPSILON,
  MOVEMENT_TYPES,
  RESTOCK_TYPES,
  formatMovementNumber,
  formatOrderNumber,
  round2,
} from "../../shared/constants.ts";

const zOptVariant = z.string().min(1).max(64).nullish();
const zNotes = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((s) => s || null);

function inventoryItems(ctx: Ctx, opts: { lowOnly?: boolean }) {
  const catalog = loadCatalog(ctx.db);
  const items = [];
  for (const product of catalog.products) {
    if (opts.lowOnly && !product.isActive) continue;
    for (const { variant, row } of stockLines(product, catalog, {
      includeInactiveVariants: !opts.lowOnly,
    })) {
      const onHand = row?.onHand ?? 0;
      const avgCost = row?.avgCost ?? 0;
      const isActive = product.isActive && (variant?.isActive ?? true);
      const isLowStock = isActive && onHand < product.reorderThreshold;
      if (opts.lowOnly && !isLowStock) continue;
      items.push({
        key: variant ? `${product._id}:${variant._id}` : product._id,
        productId: product._id,
        productName: product.name,
        productSku: product.sku,
        sku: variant?.sku ?? product.sku,
        category: product.category,
        uom: product.uom,
        imageUrl: variant?.imageUrl ?? product.imageUrl,
        variantId: variant?._id ?? null,
        variantName: variant?.name ?? null,
        onHand,
        reserved: row?.reserved ?? 0,
        available: row ? availableQty(row) : 0,
        notSellable: row?.notSellable ?? 0,
        // Returns on their way back: not sellable yet, valued at their shipped cost
        inTransit: row?.inTransit ?? 0,
        inTransitValue: round2(
          (row?.inTransit ?? 0) * (row?.inTransitCost ?? 0),
        ),
        avgCost,
        assetValue: round2(onHand * avgCost),
        reorderThreshold: product.reorderThreshold,
        isActive,
        isLowStock,
        stockStatus: stockStatus(onHand, product.reorderThreshold),
        shortage: Math.max(0, product.reorderThreshold - onHand),
      });
    }
  }
  return items.sort(
    (a, b) =>
      a.productName.localeCompare(b.productName) ||
      (a.variantName ?? "").localeCompare(b.variantName ?? ""),
  );
}

/** Movement types that change on-hand stock (the ones the average cost moves with). */
const ON_HAND_TYPES: readonly MovementType[] = [
  "restock",
  "shipment",
  "return",
  "swap_out",
  "swap_in",
  "adjustment",
  "back_to_sellable",
  "transit_received",
];

/**
 * How much of a restock's cost error is still in today's stock value. Under
 * the weighted average the error spreads over every unit in stock at the
 * time; units leaving (sales, write-offs) take their share with them, while
 * new purchases at their own cost only dilute it per unit.
 */
function remainingCostError(
  ctx: Ctx,
  batch: Movement,
  batchError: number,
): { error: number; unitsCarrying: number } {
  const history = ctx.db
    .select()
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.productId, batch.productId),
        variantMatch(inventoryMovements.variantId, batch.variantId),
        inArray(inventoryMovements.type, [...ON_HAND_TYPES]),
      ),
    )
    .orderBy(asc(inventoryMovements.movementNumber))
    .all();
  let units = 0;
  let error = 0;
  let started = false;
  for (const m of history) {
    const q = m.quantityChange;
    if (m._id === batch._id) {
      units += q;
      error = batchError;
      started = true;
      continue;
    }
    if (!started) {
      units += q;
      continue;
    }
    const isPurchase = m.type === "restock";
    if (!isPurchase && units > 0) {
      // Sales and write-offs remove their share; returns and adjustments at
      // the average bring the same per-unit error back
      error *= Math.max(0, units + q) / units;
    }
    units = Math.max(0, units + q);
    if (units === 0) error = 0;
  }
  return { error, unitsCarrying: units };
}

export const inventoryRouter = {
  /**
   * Returned units not yet announced to the moderators: the sold-out items
   * that are free to sell again, for one WhatsApp message per batch.
   */
  backInStock: query({
    input: noInput,
    handler: (ctx) => {
      requireShipAccess(ctx);
      return pendingBackInStock(ctx.db, ctx.now);
    },
  }),

  /** The batch was sent (or cleared): returns up to `upTo` leave the list. */
  announceBackInStock: mutation({
    input: z.object({ upTo: z.string().min(1).max(40) }),
    handler: (ctx, args) => {
      requireShipAccess(ctx);
      const done = ctx.db
        .update(returnArrivals)
        .set({ announcedAt: ctx.now.toISOString() })
        .where(and(isNull(returnArrivals.announcedAt), lte(returnArrivals.at, args.upTo)))
        .run();
      return { cleared: done.changes };
    },
  }),

  list: query({
    input: noInput,
    handler: (ctx) => {
      requireView(ctx, "inventory");
      return inventoryItems(ctx, {});
    },
  }),

  lowStock: query({
    input: noInput,
    handler: (ctx) => {
      requireView(ctx, "inventory", "dashboard");
      return inventoryItems(ctx, { lowOnly: true });
    },
  }),

  listMovements: query({
    input: z.object({
      productId: zId.optional(),
      variantId: zId.optional(),
      types: z.array(z.enum(MOVEMENT_TYPES)).optional(),
      fromDay: zDay.optional(),
      toDay: zDay.optional(),
      /** Filter the days by the movement's date (default) or by when it was recorded */
      dateBy: z.enum(["movement", "recorded"]).optional(),
      search: z.string().trim().max(SEARCH_MAX).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(200).default(50),
    }),
    handler: (ctx, args) => {
      requireView(ctx, "inventory");
      const tz = getTimeZone(ctx.db);
      const m = inventoryMovements;
      const where: SQL[] = [];
      if (args.productId) where.push(eq(m.productId, args.productId));
      if (args.variantId) where.push(eq(m.variantId, args.variantId));
      if (args.types?.length) where.push(inArray(m.type, args.types));
      if (args.dateBy === "recorded") {
        if (args.fromDay) where.push(gte(m._creationTime, zonedDayStart(args.fromDay, tz).getTime()));
        if (args.toDay) where.push(lt(m._creationTime, zonedDayStart(addDays(args.toDay, 1), tz).getTime()));
      } else {
        if (args.fromDay)
          where.push(gte(m.date, zonedDayStart(args.fromDay, tz).toISOString()));
        if (args.toDay)
          where.push(
            lt(m.date, zonedDayStart(addDays(args.toDay, 1), tz).toISOString()),
          );
      }
      const search = searchCondition(
        args.search,
        (like) =>
          or(
            sql`lower(coalesce(${m.notes}, '')) like ${like}`,
            sql`lower(coalesce(${m.supplier}, '')) like ${like}`,
            sql`${m.productId} in (select id from products where lower(name) like ${like} or lower(sku) like ${like})`,
            sql`${m.variantId} in (select id from product_variants where lower(name) like ${like} or lower(sku) like ${like})`,
          )!,
        (alternative) => {
          const num = movementNumberOf(alternative);
          if (!num) return undefined;
          return or(
            eq(m.movementNumber, num),
            sql`${m.orderId} in (select id from orders where order_number = ${num})`,
          );
        },
      );
      if (search) where.push(search);
      const filter = where.length ? and(...where) : undefined;
      const total =
        ctx.db.select({ n: count() }).from(m).where(filter).get()?.n ?? 0;
      const rows = ctx.db
        .select()
        .from(m)
        .where(filter)
        .orderBy(
          ...(args.dateBy === "recorded"
            ? [desc(m._creationTime), desc(m.movementNumber)]
            : [desc(m.date), desc(m.movementNumber)]),
        )
        .limit(args.pageSize)
        .offset((args.page - 1) * args.pageSize)
        .all();

      const { productMap, variantMap, userMap } = lookupMaps(ctx.db, {
        productIds: rows.map((r) => r.productId),
        variantIds: rows.map((r) => r.variantId),
        userIds: rows.map((r) => r.userId),
      });
      const orderIds = [
        ...new Set(rows.map((r) => r.orderId).filter((x): x is string => !!x)),
      ];
      const orderMap = new Map(
        orderIds.length
          ? ctx.db
              .select({ id: orders._id, orderNumber: orders.orderNumber })
              .from(orders)
              .where(inArray(orders._id, orderIds))
              .all()
              .map((o) => [o.id, o.orderNumber])
          : [],
      );
      // Saved names on order lines, for movements whose product/variant was deleted
      const lines = orderIds.length
        ? ctx.db
            .select()
            .from(orderLineItems)
            .where(inArray(orderLineItems.orderId, orderIds))
            .all()
        : [];

      const items = rows.map((r) => {
        const product = productMap.get(r.productId);
        const variant = r.variantId ? variantMap.get(r.variantId) : undefined;
        const saved =
          !product || (r.variantId && !variant)
            ? lines.find(
                (l) =>
                  l.orderId === r.orderId &&
                  l.productId === r.productId &&
                  l.variantId === r.variantId,
              )
            : undefined;
        const names = resolveItemNames(product, variant, saved);
        const orderNumber = r.orderId ? orderMap.get(r.orderId) : undefined;
        return {
          ...r,
          movementId: formatMovementNumber(r.movementNumber),
          productName: names.productName,
          productSku: variant?.sku ?? names.productSku,
          variantName: names.variantName,
          category: product?.category ?? "",
          productExists: Boolean(product),
          userName: userName(userMap.get(r.userId)),
          orderNumber:
            orderNumber !== undefined ? formatOrderNumber(orderNumber) : null,
          // Admins see what a movement was worth; cost is hidden from everyone else
          unitCost: canSeeCost(ctx.user) ? r.unitCost : null,
          cost: canSeeCost(ctx.user) ? r.cost : null,
        };
      });
      return { items, total, page: args.page, pageSize: args.pageSize };
    },
  }),

  /**
   * Fixes the unit cost of a restock (or opening stock) entered wrongly. The
   * average cost is corrected for the batch's units still in stock; units
   * already sold keep the cost they left with, so past profit doesn't change.
   */
  correctCost: mutation({
    input: z.object({
      movementId: zId,
      unitCost: z
        .number({ error: "Enter the correct unit cost" })
        .finite()
        .min(0, "Unit cost can't be negative"),
      notes: zNotes,
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      const movement = ctx.db
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements._id, args.movementId))
        .get();
      if (!movement) throw new AppError("NOT_FOUND", "Movement not found");
      if (movement.type !== "restock") {
        throw new AppError(
          "BAD_REQUEST",
          "Only restocks and opening stock can have their cost corrected",
        );
      }
      const oldCost = movement.unitCost;
      const newCost = round2(args.unitCost);
      if (Math.abs(newCost - oldCost) < MONEY_EPSILON) return null;
      const row = getInventoryRow(
        ctx.db,
        movement.productId,
        movement.variantId,
      );
      const { error, unitsCarrying } = remainingCostError(
        ctx,
        movement,
        (newCost - oldCost) * movement.quantityChange,
      );
      const stillInStock = Math.min(unitsCarrying, row.onHand);
      const avgCost =
        row.onHand > 0
          ? Math.max(0, row.avgCost + error / row.onHand)
          : row.avgCost;
      updateInventory(ctx.db, row._id, { avgCost });
      // What the ledger needs: the purchase's value change and the stock value change
      const stockValueChange = round2((avgCost - row.avgCost) * row.onHand);
      const purchaseValueChange = round2(
        (newCost - oldCost) * movement.quantityChange,
      );
      ctx.db
        .update(inventoryMovements)
        .set({
          unitCost: newCost,
          cost: movement.cost === null ? null : newCost,
        })
        .where(eq(inventoryMovements._id, movement._id))
        .run();
      const money = moneyFormatter(ctx.db);
      insertMovement(ctx.db, {
        productId: movement.productId,
        variantId: movement.variantId,
        type: "cost_correction",
        quantityChange: 0,
        date: ctx.now.toISOString(),
        userId: ctx.user._id,
        unitCost: avgCost,
        relatedMovementId: movement._id,
        purchaseValueChange,
        stockValueChange,
        notes:
          `${formatMovementNumber(movement.movementNumber)}: unit cost ${money(oldCost)} → ${money(newCost)}, ` +
          `applied to ${stillInStock} unit(s) in stock` +
          (args.notes ? `. ${args.notes}` : ""),
      });
      return { avgCost: round2(avgCost), unitsCorrected: stillInStock };
    },
  }),

  restock: mutation({
    input: z.object({
      productId: zId,
      variantId: zOptVariant,
      restockType: z.enum(RESTOCK_TYPES),
      quantity: zQty,
      date: z.string().max(40).optional(),
      supplier: zNotes,
      /** Purchase cost per unit. Defaults to the current average cost. */
      cost: z
        .number()
        .finite()
        .min(0, "Unit cost can't be negative")
        .optional(),
      notes: zNotes,
      /** Purchases: the ledger account it was paid from (QNB when left out) */
      paidFromAccountId: zId.optional(),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      if (args.paidFromAccountId) assertPaymentAccount(ctx.db, args.paidFromAccountId);
      const { product, variant } = loadSellable(
        ctx.db,
        args.productId,
        args.variantId,
      );
      const row = getInventoryRow(ctx.db, product._id, variant?._id);
      // Weighted average cost
      const unitCost = args.cost ?? requireKnownCost(row.avgCost);
      const newOnHand = row.onHand + args.quantity;
      updateInventory(ctx.db, row._id, {
        onHand: newOnHand,
        avgCost: blendCost(row.onHand, row.avgCost, args.quantity, unitCost),
      });
      const movement = insertMovement(ctx.db, {
        productId: product._id,
        variantId: variant?._id ?? null,
        type: "restock",
        restockType: args.restockType,
        quantityChange: args.quantity,
        date: eventInstant(ctx, args.date),
        userId: ctx.user._id,
        supplier: args.supplier,
        cost: args.cost ?? null,
        notes: args.notes,
        unitCost,
        paidFromAccountId:
          args.restockType === "purchase" ? (args.paidFromAccountId ?? null) : null,
      });
      syncLowStockAlert(ctx.db, product._id, variant?._id);
      releaseHeldOrders(ctx);
      return {
        movementId: movement._id,
        movementNumber: movement.movementNumber,
        onHand: newOnHand,
      };
    },
  }),

  /**
   * Corrects stock outside purchases and orders:
   * - decrease: lost, damaged, expired… valued at the average cost (a loss);
   * - increase: count correction, found… valued at the average cost (a gain),
   *   which leaves the average unchanged. An item with no cost yet needs one.
   */
  adjust: mutation({
    input: z.object({
      productId: zId,
      variantId: zOptVariant,
      direction: z.enum(ADJUST_DIRECTIONS).default("decrease"),
      quantity: zQty,
      date: z.string().max(40).optional(),
      reason: z.enum(ADJUST_REASONS),
      /** Unit cost for an increase on an item that has no average cost yet. */
      cost: z
        .number()
        .finite()
        .min(0, "Unit cost can't be negative")
        .optional(),
      notes: zNotes,
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      const { product, variant } = loadSellable(
        ctx.db,
        args.productId,
        args.variantId,
      );
      const row = getInventoryRow(ctx.db, product._id, variant?._id);
      const increase = args.direction === "increase";
      const allowed: readonly string[] = increase
        ? ADJUST_UP_REASONS
        : ADJUST_DOWN_REASONS;
      if (!allowed.includes(args.reason)) {
        throw new AppError(
          "BAD_REQUEST",
          "That reason doesn't fit this kind of adjustment",
        );
      }

      let onHand: number;
      let unitCost: number;
      if (increase) {
        unitCost =
          row.avgCost > 0
            ? row.avgCost
            : (args.cost ?? requireKnownCost(row.avgCost));
        onHand = row.onHand + args.quantity;
        updateInventory(ctx.db, row._id, {
          onHand,
          avgCost: blendCost(row.onHand, row.avgCost, args.quantity, unitCost),
        });
      } else {
        if (row.onHand < args.quantity) {
          throw new AppError(
            "BAD_REQUEST",
            `Only ${row.onHand} ${product.uom} on hand. You can't remove more than that.`,
          );
        }
        unitCost = row.avgCost;
        onHand = row.onHand - args.quantity;
        updateInventory(ctx.db, row._id, { onHand });
      }
      const movement = insertMovement(ctx.db, {
        productId: product._id,
        variantId: variant?._id ?? null,
        type: "adjustment",
        quantityChange: increase ? args.quantity : -args.quantity,
        date: eventInstant(ctx, args.date),
        userId: ctx.user._id,
        reason: args.reason,
        notes: args.notes,
        unitCost,
      });
      syncLowStockAlert(ctx.db, product._id, variant?._id);
      releaseHeldOrders(ctx);
      return {
        movementId: movement._id,
        movementNumber: movement.movementNumber,
        onHand,
        amount: round2(args.quantity * unitCost),
      };
    },
  }),
};

/**
 * Stock has to enter at a cost. An item that has never had one can't take its
 * cost from the average, so the user must enter it (0 is allowed, on purpose).
 */
export function requireKnownCost(avgCost: number): number {
  if (avgCost > 0) return avgCost;
  throw new AppError(
    "BAD_REQUEST",
    "This item has no cost yet. Enter the unit cost.",
  );
}
