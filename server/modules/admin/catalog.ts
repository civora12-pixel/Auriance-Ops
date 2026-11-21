import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  inventory,
  inventoryMovements,
  orderLineItems,
  orderStatusHistory,
  orders,
  productVariants,
  products,
} from "../../db/schema.ts";
import type {
  InventoryRow,
  LineItem,
  Movement,
  Product,
  ProductVariant,
} from "../../db/schema.ts";
import { AppError, mutation, query, zId } from "../../rpc/procedure.ts";
import type { Ctx } from "../../rpc/procedure.ts";
import { requireAdmin, requireAdminMode } from "../../lib/permissions.ts";
import { getProduct, getVariant, itemLabel } from "../../lib/items.ts";
import { logDeletion } from "../../lib/audit.ts";
import { OPEN_STATUSES, formatOrderNumber } from "../../../shared/constants.ts";

type Target =
  | { kind: "product"; productId: string }
  | { kind: "variant"; variantId: string };

const zTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("product"), productId: zId }),
  z.object({ kind: z.literal("variant"), variantId: zId }),
]);

type Impact = {
  label: string;
  product: Product;
  variant: ProductVariant | undefined;
  variants: ProductVariant[];
  inventoryRows: InventoryRow[];
  removableMovements: Movement[];
  orderMovements: Movement[];
  lineItems: LineItem[];
  blockingOrders: string[];
};

/** What deleting a product or variant would remove, keep, or be blocked by. */
function loadImpact(ctx: Ctx, target: Target): Impact {
  let product: Product | undefined;
  let variant: ProductVariant | undefined;
  if (target.kind === "variant") {
    variant = getVariant(ctx.db, target.variantId);
    if (!variant) throw new AppError("NOT_FOUND", "Variant not found");
    product = getProduct(ctx.db, variant.productId);
  } else {
    product = getProduct(ctx.db, target.productId);
  }
  if (!product) throw new AppError("NOT_FOUND", "Product not found");

  const variants = variant
    ? [variant]
    : ctx.db
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, product._id))
        .all();
  const inventoryRows = ctx.db
    .select()
    .from(inventory)
    .where(
      and(
        eq(inventory.productId, product._id),
        variant ? eq(inventory.variantId, variant._id) : undefined,
      ),
    )
    .all();
  const movements = ctx.db
    .select()
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.productId, product._id),
        variant ? eq(inventoryMovements.variantId, variant._id) : undefined,
      ),
    )
    .all();
  const lineItems = ctx.db
    .select()
    .from(orderLineItems)
    .where(
      and(
        eq(orderLineItems.productId, product._id),
        variant ? eq(orderLineItems.variantId, variant._id) : undefined,
      ),
    )
    .all();

  const orderIds = [...new Set(lineItems.map((l) => l.orderId))];
  const blockingOrders = orderIds.length
    ? ctx.db
        .select({ orderNumber: orders.orderNumber })
        .from(orders)
        .where(
          and(
            inArray(orders._id, orderIds),
            inArray(orders.status, [...OPEN_STATUSES]),
          ),
        )
        .all()
        .map((o) => o.orderNumber)
        .sort((a, b) => a - b)
        .map(formatOrderNumber)
    : [];

  return {
    label: itemLabel({ productName: product.name, variantName: variant?.name }),
    product,
    variant,
    variants,
    inventoryRows,
    removableMovements: movements.filter((m) => !m.orderId),
    orderMovements: movements.filter((m) => m.orderId),
    lineItems,
    blockingOrders,
  };
}

/** Stock, movements or orders: the item has a history and can only be made inactive. */
function hasActivity(impact: Impact): boolean {
  return (
    impact.removableMovements.length > 0 ||
    impact.orderMovements.length > 0 ||
    impact.lineItems.length > 0 ||
    impact.inventoryRows.some(
      (r) => r.onHand !== 0 || r.notSellable !== 0 || r.reserved !== 0,
    )
  );
}

function preview(impact: Impact) {
  return {
    hasActivity: hasActivity(impact),
    label: impact.label,
    variants: impact.variant ? 0 : impact.variants.length,
    stockRows: impact.inventoryRows.length,
    onHand: impact.inventoryRows.reduce((s, r) => s + r.onHand, 0),
    notSellable: impact.inventoryRows.reduce((s, r) => s + r.notSellable, 0),
    movements: impact.removableMovements.length,
    orderLines: impact.lineItems.length,
    orderMovements: impact.orderMovements.length,
    blockingOrders: impact.blockingOrders,
  };
}

/** Removes catalog records while keeping order lines (with their saved names) and order-linked movements. */
function performDeletion(ctx: Ctx, target: Target): null {
  requireAdminMode(ctx);
  const impact = loadImpact(ctx, target);
  if (hasActivity(impact)) {
    throw new AppError(
      "CONFLICT",
      `"${impact.label}" has stock, movements or orders, so it can't be deleted. Mark it inactive instead.`,
    );
  }
  if (impact.blockingOrders.length) {
    throw new AppError(
      "CONFLICT",
      `"${impact.label}" is on orders that are New or On hold: ${impact.blockingOrders.join(", ")}. Ship or cancel them first.`,
    );
  }
  const { product, variant } = impact;
  const now = ctx.now.toISOString();

  // Note the removal on every order that had the item (line items keep their saved names)
  const variantNames = new Map(impact.variants.map((v) => [v._id, v.name]));
  const notes = new Map<string, Set<string>>();
  for (const line of impact.lineItems) {
    const label = itemLabel({
      productName: product.name,
      variantName: line.variantId
        ? (variantNames.get(line.variantId) ?? line.variantName)
        : null,
    });
    notes.set(line.orderId, (notes.get(line.orderId) ?? new Set()).add(label));
  }
  if (notes.size) {
    const statusById = new Map(
      ctx.db
        .select({ id: orders._id, status: orders.status })
        .from(orders)
        .where(inArray(orders._id, [...notes.keys()]))
        .all()
        .map((o) => [o.id, o.status]),
    );
    for (const [orderId, labels] of notes) {
      const status = statusById.get(orderId);
      if (!status) continue;
      for (const label of labels) {
        ctx.db
          .insert(orderStatusHistory)
          .values({
            orderId,
            status,
            changedBy: ctx.user._id,
            changedAt: now,
            note: `Item removed from catalog: ${label}`,
          })
          .run();
      }
    }
  }

  const removedOnHand = impact.inventoryRows.reduce((s, r) => s + r.onHand, 0);
  if (impact.removableMovements.length) {
    ctx.db
      .delete(inventoryMovements)
      .where(
        inArray(
          inventoryMovements._id,
          impact.removableMovements.map((m) => m._id),
        ),
      )
      .run();
  }
  // Inventory rows go with their product/variant (foreign key cascade)
  if (variant) {
    ctx.db
      .delete(productVariants)
      .where(eq(productVariants._id, variant._id))
      .run();
    const remaining = ctx.db
      .select({ id: productVariants._id })
      .from(productVariants)
      .where(eq(productVariants.productId, product._id))
      .get();
    if (!remaining) {
      // Last variant removed: the product goes back to product-level stock
      ctx.db
        .update(products)
        .set({ hasVariants: false })
        .where(eq(products._id, product._id))
        .run();
      const base = ctx.db
        .select({ id: inventory._id })
        .from(inventory)
        .where(
          and(
            eq(inventory.productId, product._id),
            isNull(inventory.variantId),
          ),
        )
        .get();
      if (!base)
        ctx.db
          .insert(inventory)
          .values({ productId: product._id, variantId: null })
          .run();
    }
  } else {
    ctx.db.delete(products).where(eq(products._id, product._id)).run();
  }

  const sku = variant?.sku ?? product.sku;
  logDeletion(ctx, {
    entityType: variant ? "variant" : "product",
    entityId: variant?._id ?? product._id,
    summary: `${impact.label} | ${sku}${variant ? "" : ` | variants: ${impact.variants.length}`}`,
    stockEffect:
      `Removed ${impact.inventoryRows.length} stock row(s) (${removedOnHand} on hand) and ` +
      `${impact.removableMovements.length} movement(s); kept ${impact.lineItems.length} order line(s) ` +
      `and ${impact.orderMovements.length} order movement(s)`,
  });
  return null;
}

export const catalogAdminRouter = {
  /** Counts of what a deletion removes and keeps, shown before confirming. */
  deletionPreview: query({
    input: z.object({ target: zTarget }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      // Already deleted (the dialog may refetch right after a delete): nothing to preview
      try {
        return preview(loadImpact(ctx, args.target));
      } catch (e) {
        if (e instanceof AppError && e.code === "NOT_FOUND") return null;
        throw e;
      }
    },
  }),

  deleteProduct: mutation({
    input: z.object({ productId: zId }),
    handler: (ctx, args) =>
      performDeletion(ctx, { kind: "product", productId: args.productId }),
  }),

  deleteVariant: mutation({
    input: z.object({ variantId: zId }),
    handler: (ctx, args) =>
      performDeletion(ctx, { kind: "variant", variantId: args.variantId }),
  }),
};
