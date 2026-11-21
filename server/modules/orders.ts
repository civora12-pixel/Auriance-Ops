import { noteReturnArrival } from "../lib/back-in-stock.ts";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import {
  financialEvents,
  inventoryMovements,
  orderLineItems,
  orderStatusHistory,
  orders,
  promoRedemptions,
  users,
} from "../db/schema.ts";
import type { LineItem, Order } from "../db/schema.ts";
import {
  AppError,
  mutation,
  noInput,
  query,
  zDay,
  zId,
  zMoney,
  zQty,
} from "../rpc/procedure.ts";
import type { Ctx } from "../rpc/procedure.ts";
import {
  requireAdmin,
  requireEdit,
  requireShipAccess,
  requireView,
} from "../lib/permissions.ts";
import { loadSellable } from "../lib/catalog.ts";
import {
  availableQty,
  blendCost,
  changeInTransit,
  findInventoryRow,
  writeOffLeftoverNotSellable,
  getInventoryRow,
  insertMovement,
  issuedUnitCost,
  releaseStock,
  reserveStock,
  updateInventory,
} from "../lib/movements.ts";
import type { InventoryRow } from "../db/schema.ts";
import { notify, notifyOrder, syncLowStockAlert } from "../lib/notifications.ts";
import {
  getProduct,
  getVariant,
  itemLabel,
  lineItemSnapshot,
  lookupMaps,
  resolveItemNames,
  userName,
} from "../lib/items.ts";
import { nextOrderNumber } from "../lib/counters.ts";
import { getTimeZone, moneyFormatter } from "../lib/settings.ts";
import { addDays, isValidDay, zonedDayStart } from "../../shared/dates.ts";
import { assertDay, businessToday } from "../lib/time.ts";
import { SEARCH_MAX, orderNumberOf, searchCondition } from "../lib/search.ts";
import {
  GENDERS,
  MONEY_EPSILON,
  ORDER_STATUSES,
  RETURNABLE_STATUSES,
  SALES_CHANNELS,
  SHIPPABLE_STATUSES,
  formatOrderNumber,
  round2,
} from "../../shared/constants.ts";
import type { Gender, OrderStatus } from "../../shared/constants.ts";
import { EGYPT_PHONE_RE, normalizePhone } from "../../shared/phone.ts";

const NOT_IN_CATALOG_NOTE = "Item no longer in catalog, no stock change";

const zCustomer = z
  .string()
  .trim()
  .min(1, "Customer name is required")
  .max(200);
const zPhone = z
  .string({ error: "Enter the customer's phone" })
  .transform(normalizePhone)
  .pipe(
    z
      .string()
      .min(1, "Enter the customer's phone")
      .regex(
        EGYPT_PHONE_RE,
        "Phone must be an Egyptian mobile (11 digits: 010, 011, 012 or 015) or a landline with its area code (10 digits, like 0238221076)",
      ),
  );
const zPhone2 = z
  .string()
  .optional()
  .transform((s) => (s ? normalizePhone(s) : ""))
  .pipe(
    z
      .string()
      .refine(
        (s) => s === "" || EGYPT_PHONE_RE.test(s),
        "Second phone must be an Egyptian mobile (11 digits) or a landline with its area code (10 digits)",
      ),
  )
  .transform((s) => s || null);
const zAddress = z.string().trim().min(1, "Address is required").max(1000);
const zChannel = z.enum(SALES_CHANNELS, {
  error: "Choose where the order came from",
});
const zShippingFee = zMoney;
const zShipment = z
  .string()
  .trim()
  .min(1, "Shipment number is required")
  .max(100);
const zLongText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((s) => s || null);
const zNote = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((s) => s || undefined);

export type PhoneHistory = {
  /** Earlier orders from these numbers (cancelled ones left out) */
  orders: number;
  /** Refused at the door: the whole order came back */
  refused: number;
  /** Some pieces came back */
  partlyReturned: number;
  /** The latest refused orders, newest first */
  refusedOrders: { _id: string; orderNumber: string; orderDate: string }[];
};

/**
 * What a customer's phone numbers did before: how many orders, and how many
 * were refused or partly returned. Moderators see it as a warning before
 * confirming or shipping (ask for a deposit, or skip the order).
 */
export function phoneHistory(
  db: Ctx["db"],
  phones: (string | null | undefined)[],
  exceptOrderId?: string,
): PhoneHistory {
  const nums = [...new Set(phones.filter((p): p is string => !!p).map(normalizePhone))].filter((p) => p.length >= 8);
  const empty = { orders: 0, refused: 0, partlyReturned: 0, refusedOrders: [] };
  if (!nums.length) return empty;
  const rows = db
    .select({ _id: orders._id, orderNumber: orders.orderNumber, orderDate: orders.orderDate, status: orders.status })
    .from(orders)
    .where(
      and(
        ne(orders.status, "cancelled"),
        or(inArray(orders.customerPhone, nums), inArray(orders.customerPhone2, nums)),
      ),
    )
    .orderBy(desc(orders.orderNumber))
    .all()
    .filter((o) => o._id !== exceptOrderId);
  const refused = rows.filter((o) => o.status === "returned");
  return {
    orders: rows.length,
    refused: refused.length,
    partlyReturned: rows.filter((o) => o.status === "partially_returned").length,
    refusedOrders: refused
      .slice(0, 5)
      .map((o) => ({ _id: o._id, orderNumber: formatOrderNumber(o.orderNumber), orderDate: o.orderDate })),
  };
}

export function mustGetOrder(ctx: Ctx, orderId: string): Order {
  const order = ctx.db
    .select()
    .from(orders)
    .where(eq(orders._id, orderId))
    .get();
  if (!order) throw new AppError("NOT_FOUND", "Order not found");
  return order;
}

export function orderLines(ctx: Ctx, orderId: string): LineItem[] {
  return ctx.db
    .select()
    .from(orderLineItems)
    .where(eq(orderLineItems.orderId, orderId))
    .orderBy(asc(orderLineItems._creationTime))
    .all();
}

export function addHistory(
  ctx: Ctx,
  orderId: string,
  status: OrderStatus,
  note?: string,
): void {
  ctx.db
    .insert(orderStatusHistory)
    .values({
      orderId,
      status,
      changedBy: ctx.user._id,
      changedAt: ctx.now.toISOString(),
      note: note ?? null,
    })
    .run();
}

/**
 * A shipment number belongs to one order. The only exception: a cancelled
 * order's number can be reused by its re-recorded copy (`activeOnly`), as long
 * as no other open, on-hold or shipped order holds it.
 */
function assertShipmentAvailable(
  ctx: Ctx,
  shipmentNumber: string,
  options: { exceptOrderId?: string; activeOnly?: boolean } = {},
): void {
  const existing = ctx.db
    .select({
      id: orders._id,
      orderNumber: orders.orderNumber,
      status: orders.status,
    })
    .from(orders)
    .where(
      sql`lower(${orders.shipmentNumber}) = ${shipmentNumber.toLowerCase()}`,
    )
    .all()
    .find(
      (o) =>
        o.id !== options.exceptOrderId &&
        (!options.activeOnly || o.status !== "cancelled"),
    );
  if (existing) {
    throw new AppError(
      "CONFLICT",
      `Shipment number "${shipmentNumber}" is already used by ${formatOrderNumber(existing.orderNumber)}`,
    );
  }
}

function linkedOrder(ctx: Ctx, orderId: string) {
  const o = ctx.db
    .select({
      _id: orders._id,
      orderNumber: orders.orderNumber,
      status: orders.status,
    })
    .from(orders)
    .where(eq(orders._id, orderId))
    .get();
  return o
    ? { ...o, displayOrderNumber: formatOrderNumber(o.orderNumber) }
    : null;
}

/** True when the line's product (and variant, if any) still exist. */
function isInCatalog(ctx: Ctx, line: LineItem): boolean {
  if (!getProduct(ctx.db, line.productId)) return false;
  return !line.variantId || Boolean(getVariant(ctx.db, line.variantId));
}

/**
 * Changes on-hand stock for an order event and logs a movement linked to the order.
 * - shipment: the units leave stock and the order's hold on them is released;
 * - swap_out: replacement units leave stock; only stock no other order holds can go;
 * - return / swap_in: units come back at the cost they left with (`unitCost`),
 *   re-averaging the item's weighted-average cost.
 */
function applyOrderMovement(
  ctx: Ctx,
  args: {
    productId: string;
    variantId: string | null;
    quantityChange: number;
    type: "shipment" | "return" | "swap_out" | "swap_in";
    orderId: string;
    label: string;
    /** Required for stock coming back (return, swap_in). */
    unitCost?: number;
    /** Shipment of an order that holds no stock (delayed): only free stock can go. */
    fromFreeStock?: boolean;
  },
): void {
  const row = getInventoryRow(ctx.db, args.productId, args.variantId);
  const qty = args.quantityChange;
  const patch: Partial<InventoryRow> = { onHand: row.onHand + qty };
  let unitCost = row.avgCost;
  if (qty < 0) {
    const units = -qty;
    if (args.type === "shipment" && args.fromFreeStock) {
      const free = Math.max(0, availableQty(row));
      if (units > free) {
        throw new AppError(
          "BAD_REQUEST",
          `Not enough free stock for ${args.label}: ${free} free, ${units} needed. The rest is held for other orders.`,
        );
      }
    } else if (args.type === "shipment") {
      if (units > row.onHand) {
        throw new AppError(
          "BAD_REQUEST",
          `Not enough stock for ${args.label}: ${row.onHand} on hand, ${units} needed`,
        );
      }
      patch.reserved = Math.max(0, row.reserved - units);
    } else if (units > availableQty(row)) {
      reserveStock(ctx.db, row, units, args.label); // throws the "held for other orders" message
    }
  } else {
    unitCost = args.unitCost ?? row.avgCost;
    patch.avgCost = blendCost(row.onHand, row.avgCost, qty, unitCost);
    noteReturnArrival(ctx, { productId: args.productId, variantId: args.variantId, quantity: qty, freeBefore: availableQty(row) });
  }
  updateInventory(ctx.db, row._id, patch);
  insertMovement(ctx.db, {
    productId: args.productId,
    variantId: args.variantId,
    type: args.type,
    quantityChange: qty,
    date: ctx.now.toISOString(),
    userId: ctx.user._id,
    orderId: args.orderId,
    // Out: the average cost at the time (cost of goods). Back: the cost it left with.
    unitCost,
  });
  syncLowStockAlert(ctx.db, args.productId, args.variantId);
}

/** Holds stock for every unshipped unit of an order (new order, or a cancelled one reopened). */
function reserveOrderStock(
  ctx: Ctx,
  items: {
    productId: string;
    variantId: string | null;
    quantity: number;
    label: string;
  }[],
): void {
  const totals = new Map<
    string,
    {
      productId: string;
      variantId: string | null;
      quantity: number;
      label: string;
    }
  >();
  for (const item of items) {
    if (item.quantity <= 0) continue;
    const key = `${item.productId}:${item.variantId ?? ""}`;
    const entry = totals.get(key);
    if (entry) entry.quantity += item.quantity;
    else totals.set(key, { ...item });
  }
  for (const item of totals.values()) {
    reserveStock(
      ctx.db,
      getInventoryRow(ctx.db, item.productId, item.variantId),
      item.quantity,
      item.label,
    );
  }
}

/** Unshipped units of an order's own lines (swap replacements always ship at once). */
export function unshippedUnits(lines: LineItem[]) {
  return lines
    .filter((l) => !l.isSwapReplacement && l.quantity > l.shippedQuantity)
    .map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      quantity: l.quantity - l.shippedQuantity,
      label: itemLabel(l),
    }));
}

/** Releases the hold an open order has on its unshipped units. */
export function releaseOrderStock(ctx: Ctx, lines: LineItem[]): void {
  for (const u of unshippedUnits(lines))
    releaseStock(ctx.db, u.productId, u.variantId, u.quantity);
}

const lineName = (line: LineItem) => itemLabel(line);

type Need = {
  productId: string;
  variantId: string | null;
  quantity: number;
  label: string;
};

/** Items the order needs that available stock (on hand minus what other orders hold) can't cover. */
function stockShortages(ctx: Pick<Ctx, "db">, items: Need[]) {
  const totals = new Map<string, Need>();
  for (const item of items) {
    if (item.quantity <= 0) continue;
    const key = `${item.productId}:${item.variantId ?? ""}`;
    const entry = totals.get(key);
    if (entry) entry.quantity += item.quantity;
    else totals.set(key, { ...item });
  }
  const short: { label: string; needed: number; available: number }[] = [];
  for (const item of totals.values()) {
    const product = getProduct(ctx.db, item.productId);
    const variant = item.variantId
      ? getVariant(ctx.db, item.variantId)
      : undefined;
    if (!product || (item.variantId && !variant)) {
      short.push({ label: item.label, needed: item.quantity, available: 0 });
      continue;
    }
    const row = findInventoryRow(ctx.db, item.productId, item.variantId);
    const available = Math.max(0, row ? availableQty(row) : 0);
    if (item.quantity > available)
      short.push({ label: item.label, needed: item.quantity, available });
  }
  return short;
}

const shortageText = (
  short: { label: string; needed: number; available: number }[],
) =>
  short
    .map((s) => `${s.label} (${s.needed} needed, ${s.available} available)`)
    .join(", ");

/** Delayed orders (the customer asked to ship later) hold no stock: regular orders come first. */
const holdsNoStock = (order: Pick<Order, "shipOn">): boolean => !!order.shipOn;

/**
 * Stock can never go negative: an order that available stock covers holds its
 * units and is New; otherwise the whole order waits On hold and holds nothing.
 */
function placeOrder(
  ctx: Ctx,
  items: Need[],
): { status: "new" | "on_hold"; shortage?: string } {
  const short = stockShortages(ctx, items);
  if (short.length) return { status: "on_hold", shortage: shortageText(short) };
  reserveOrderStock(ctx, items);
  return { status: "new" };
}

/**
 * Re-checks every On hold order, oldest order number first. Each one that
 * available stock now covers holds its units and becomes New. Runs after
 * anything that frees stock: restocks, returns, upward adjustments,
 * cancellations and swaps.
 */
export function releaseHeldOrders(ctx: Ctx): number {
  const held = ctx.db
    .select()
    .from(orders)
    .where(eq(orders.status, "on_hold"))
    .orderBy(asc(orders.orderNumber))
    .all();
  let released = 0;
  for (const order of held) {
    const items = unshippedUnits(orderLines(ctx, order._id));
    if (stockShortages(ctx, items).length) continue;
    reserveOrderStock(ctx, items);
    ctx.db
      .update(orders)
      .set({ status: "new" })
      .where(eq(orders._id, order._id))
      .run();
    addHistory(ctx, order._id, "new", "Stock is available, moved to New");
    notifyOrder(ctx.db, ctx.user._id, "order_released", order);
    released++;
  }
  return released;
}

/** What this order's units of the line's item cost when they shipped. */
function lineIssuedCost(ctx: Ctx, orderId: string, line: LineItem): number {
  const row = getInventoryRow(ctx.db, line.productId, line.variantId);
  return issuedUnitCost(
    ctx.db,
    orderId,
    line.productId,
    line.variantId,
    row.avgCost,
  );
}

/** A ship-later day must be after today, and within a year. */
function assertShipLater(ctx: Ctx, day: string): void {
  if (!isValidDay(day)) throw new AppError("BAD_REQUEST", "Enter a valid ship date");
  const today = businessToday(ctx);
  if (day <= today) throw new AppError("BAD_REQUEST", "The ship date must be after today");
  if (day > addDays(today, 366)) throw new AppError("BAD_REQUEST", "The ship date must be within a year");
}

/**
 * Ships the whole order: every unit leaves stock (one shipment movement per
 * line) and the order becomes Shipped. Orders never ship in parts.
 */
function shipOrder(ctx: Ctx, order: Order, note?: string): void {
  if (order.awaitingConfirmation) {
    throw new AppError(
      "BAD_REQUEST",
      "Confirm this website order first: add its shipment number.",
    );
  }
  if (!SHIPPABLE_STATUSES.includes(order.status)) {
    throw new AppError(
      "BAD_REQUEST",
      "Only New orders can be shipped. On hold orders are waiting for stock.",
    );
  }
  const lines = orderLines(ctx, order._id);
  let shippedUnits = 0;
  for (const line of lines) {
    const quantity = line.quantity - line.shippedQuantity;
    if (quantity <= 0) continue;
    if (!isInCatalog(ctx, line)) {
      throw new AppError(
        "BAD_REQUEST",
        `${lineName(line)} is no longer in the catalog, so it can't be shipped`,
      );
    }
    applyOrderMovement(ctx, {
      productId: line.productId,
      variantId: line.variantId,
      quantityChange: -quantity,
      type: "shipment",
      orderId: order._id,
      label: lineName(line),
      fromFreeStock: holdsNoStock(order),
    });
    ctx.db
      .update(orderLineItems)
      .set({ shippedQuantity: line.quantity })
      .where(eq(orderLineItems._id, line._id))
      .run();
    shippedUnits += quantity;
  }
  if (shippedUnits === 0)
    throw new AppError("BAD_REQUEST", "This order has nothing left to ship");

  // Revenue is recognised when the order ships
  ctx.db
    .update(orders)
    .set({
      status: "shipped",
      shippedAt: order.shippedAt ?? ctx.now.toISOString(),
    })
    .where(eq(orders._id, order._id))
    .run();
  addHistory(
    ctx,
    order._id,
    "shipped",
    note ?? `Shipped ${shippedUnits} unit(s)`,
  );
  notifyOrder(ctx.db, ctx.user._id, "order_shipped", order, order.customer);
}

function recordFinancialEvent(
  ctx: Ctx,
  orderId: string,
  type: "refund" | "swap_adjustment" | "price_correction",
  amount: number,
): void {
  if (Math.abs(amount) < MONEY_EPSILON) return;
  ctx.db
    .insert(financialEvents)
    .values({
      orderId,
      type,
      amount: round2(amount),
      date: ctx.now.toISOString(),
    })
    .run();
}

const listInput = z.object({
  statuses: z.array(z.enum(ORDER_STATUSES)).optional(),
  /** "due": shipped, unpaid and something left to collect (the dashboard's receivables) */
  payment: z.enum(["paid", "unpaid", "due"]).optional(),
  /** Only orders nobody posted to the WhatsApp group (cancelled ones excluded) */
  notPostedToWhatsApp: z.boolean().optional(),
  /** Only orders with a return announced but not yet received */
  returning: z.boolean().optional(),
  /** Only website orders still waiting to be confirmed with the customer */
  needsConfirmation: z.boolean().optional(),
  /** Open orders the customer asked to ship later. */
  delayed: z.boolean().optional(),
  /** Partly collected through the courier, waiting for the returned pieces. */
  returnPending: z.boolean().optional(),
  search: z.string().trim().max(SEARCH_MAX).optional(),
  fromDay: zDay.optional(),
  toDay: zDay.optional(),
  /** What the dates filter on: the order date (default) or the day it shipped */
  dateBy: z.enum(["order", "shipped"]).optional(),
  sort: z.enum(["number", "date", "customer", "total"]).default("number"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
});

/** Filters shared by the list and the export. Status is applied separately so tabs can show counts. */
export function orderFilters(
  args: Pick<
    z.infer<typeof listInput>,
    | "payment"
    | "notPostedToWhatsApp"
    | "returning"
    | "needsConfirmation"
    | "delayed"
    | "returnPending"
    | "search"
    | "fromDay"
    | "toDay"
    | "dateBy"
  >,
  timeZone = "UTC",
): SQL[] {
  const where: SQL[] = [];
  if (args.payment === "due") {
    where.push(eq(orders.paymentStatus, "unpaid"));
    where.push(isNotNull(orders.shippedAt));
    where.push(ne(orders.status, "cancelled"));
    where.push(gt(orders.total, MONEY_EPSILON));
  } else if (args.payment) where.push(eq(orders.paymentStatus, args.payment));
  if (args.notPostedToWhatsApp) {
    where.push(isNull(orders.whatsappPostedAt));
    where.push(ne(orders.status, "cancelled"));
  }
  if (args.returning) {
    where.push(
      sql`exists (select 1 from order_line_items li where li.order_id = ${orders._id} and li.in_transit_quantity > 0)`,
    );
  }
  if (args.returnPending) where.push(eq(orders.returnPending, true));
  if (args.delayed) {
    where.push(isNotNull(orders.shipOn));
    where.push(inArray(orders.status, ["new", "on_hold"]));
  }
  if (args.needsConfirmation) {
    where.push(eq(orders.awaitingConfirmation, true));
    where.push(ne(orders.status, "cancelled"));
  }
  if (args.dateBy === "shipped") {
    // Shipped on those days (in the business time zone); cancelled orders didn't really go out
    if (args.fromDay || args.toDay) {
      where.push(isNotNull(orders.shippedAt));
      where.push(ne(orders.status, "cancelled"));
    }
    if (args.fromDay) where.push(gte(orders.shippedAt, zonedDayStart(args.fromDay, timeZone).toISOString()));
    if (args.toDay) where.push(lt(orders.shippedAt, zonedDayStart(addDays(args.toDay, 1), timeZone).toISOString()));
  } else {
    if (args.fromDay) where.push(gte(orders.orderDate, args.fromDay));
    if (args.toDay) where.push(lte(orders.orderDate, args.toDay));
  }
  const search = searchCondition(
    args.search,
    (like) =>
      or(
        sql`lower(${orders.customer}) like ${like}`,
        sql`lower(${orders.shipmentNumber}) like ${like}`,
        sql`lower(coalesce(${orders.customerPhone}, '')) like ${like}`,
        sql`lower(coalesce(${orders.customerPhone2}, '')) like ${like}`,
      )!,
    (alternative) => {
      const num = orderNumberOf(alternative);
      return num ? eq(orders.orderNumber, num) : undefined;
    },
  );
  if (search) where.push(search);
  return where;
}

const SORT_COLUMNS = {
  number: orders.orderNumber,
  date: orders.orderDate,
  customer: sql`lower(${orders.customer})`,
  total: orders.total,
};

const zReturnLine = z.object({
  lineItemId: zId,
  quantity: zQty,
  /** False: came back damaged and is written off straight away. */
  sellable: z.boolean(),
});

/**
 * Records a return. The sale is reversed at once, in transit or not (refund =
 * revenue reversal). Refund:
 * - a manual amount when given (up to the order's current total);
 * - custom-total orders: the full current total on a full return, otherwise a manual amount is required;
 * - otherwise the returned units at their line price, capped at the current total.
 * Stock: received units go back to stock at the cost they shipped with
 * (damaged ones are written off); units in transit wait in the "in transit"
 * pool until they're received or written off.
 */
export function recordReturn(
  ctx: Ctx,
  order: Order,
  args: {
    lines: z.infer<typeof zReturnLine>[];
    inTransit: boolean;
    note?: string;
    manualRefundAmount?: number;
  },
) {
  if (!RETURNABLE_STATUSES.includes(order.status)) {
    throw new AppError("BAD_REQUEST", "Only shipped orders can be returned");
  }
  const lines = orderLines(ctx, order._id);
  const seen = new Set<string>();
  let calcRefund = 0;
  let units = 0;
  let damagedUnits = 0;
  const deletedItems: string[] = [];

  for (const input of args.lines) {
    if (seen.has(input.lineItemId))
      throw new AppError("BAD_REQUEST", "Each line can only be listed once");
    seen.add(input.lineItemId);
    const line = lines.find((l) => l._id === input.lineItemId);
    if (!line)
      throw new AppError("NOT_FOUND", "Line item not found on this order");
    const remaining = line.shippedQuantity - line.returnedQuantity;
    if (input.quantity > remaining) {
      throw new AppError(
        "BAD_REQUEST",
        `You can return up to ${remaining} unit(s) of ${lineName(line)} (shipped and not yet returned)`,
      );
    }
    if (!isInCatalog(ctx, line)) {
      // Deleted product/variant: the refund still applies, stock is skipped
      deletedItems.push(lineName(line));
    } else {
      const unitCost = lineIssuedCost(ctx, order._id, line);
      if (args.inTransit) {
        changeInTransit(
          ctx.db,
          line.productId,
          line.variantId,
          input.quantity,
          unitCost,
        );
        insertMovement(ctx.db, {
          productId: line.productId,
          variantId: line.variantId,
          type: "return_in_transit",
          quantityChange: input.quantity,
          date: ctx.now.toISOString(),
          userId: ctx.user._id,
          orderId: order._id,
          unitCost,
          notes: "Return announced, in transit",
        });
      } else if (input.sellable) {
        applyOrderMovement(ctx, {
          productId: line.productId,
          variantId: line.variantId,
          quantityChange: input.quantity,
          type: "return",
          orderId: order._id,
          label: lineName(line),
          unitCost,
        });
      } else {
        // Damaged: written off on the spot, never back in stock
        insertMovement(ctx.db, {
          productId: line.productId,
          variantId: line.variantId,
          type: "return_write_off",
          quantityChange: input.quantity,
          date: ctx.now.toISOString(),
          userId: ctx.user._id,
          orderId: order._id,
          unitCost,
          notes: "Returned damaged, written off",
        });
        damagedUnits += input.quantity;
      }
    }
    line.returnedQuantity += input.quantity;
    if (args.inTransit) line.inTransitQuantity += input.quantity;
    ctx.db
      .update(orderLineItems)
      .set({
        returnedQuantity: line.returnedQuantity,
        inTransitQuantity: line.inTransitQuantity,
      })
      .where(eq(orderLineItems._id, line._id))
      .run();
    calcRefund += input.quantity * line.unitPrice;
    units += input.quantity;
  }

  const isFullReturn = lines.every(
    (l) => l.returnedQuantity >= l.shippedQuantity,
  );
  let refund: number;
  if (order.returnPending) {
    // Partly collected through the courier: the returned pieces close exactly what's still open
    refund = Math.max(0, order.total - (order.paidAmount ?? 0));
  } else if (args.manualRefundAmount !== undefined) {
    if (args.manualRefundAmount > order.total + MONEY_EPSILON) {
      throw new AppError(
        "BAD_REQUEST",
        "The refund can't be more than the order's current total",
      );
    }
    refund = args.manualRefundAmount;
  } else if (order.hasManualTotal) {
    if (!isFullReturn) {
      throw new AppError(
        "BAD_REQUEST",
        "This order has a custom total, so enter the refund amount for a partial return.",
      );
    }
    refund = order.total;
  } else {
    refund = Math.min(calcRefund, order.total);
  }
  refund = round2(Math.min(refund, order.total));

  const status: OrderStatus = isFullReturn ? "returned" : "partially_returned";
  ctx.db
    .update(orders)
    .set({
      status,
      refundedAmount: round2(order.refundedAmount + refund),
      total: round2(order.total - refund),
      returnPending: false,
    })
    .where(eq(orders._id, order._id))
    .run();
  recordFinancialEvent(ctx, order._id, "refund", refund);

  const money = moneyFormatter(ctx.db);
  const kind = isFullReturn ? "Full" : "Partial";
  const summary = args.inTransit
    ? `${kind} return in transit (${units} unit(s)), refund ${money(refund)}`
    : damagedUnits
      ? `${kind} return, refund ${money(refund)}; ${damagedUnits} damaged unit(s) written off`
      : `${kind} return, refund ${money(refund)}`;
  addHistory(
    ctx,
    order._id,
    status,
    args.note ? `${summary}. ${args.note}` : summary,
  );
  for (const name of deletedItems)
    addHistory(ctx, order._id, status, `${NOT_IN_CATALOG_NOTE} (${name})`);
  notifyOrder(
    ctx.db,
    ctx.user._id,
    "order_returned",
    order,
    `${order.customer}: ${summary.toLowerCase()}`,
  );
  return { refund, status };
}

/**
 * Closes a return in transit: received (back in stock, or written off when
 * damaged) or lost (written off). The sale was already reversed when it went
 * into transit. Limited to some lines when given. Returns the units settled.
 */
function settleInTransit(
  ctx: Ctx,
  order: Order,
  item: { outcome: "received" | "lost"; damagedLineItemIds?: string[]; lineItemIds?: string[] },
): number {
  const damaged = new Set(item.damagedLineItemIds ?? []);
  const only = item.lineItemIds ? new Set(item.lineItemIds) : null;
  const lines = orderLines(ctx, order._id).filter((l) => l.inTransitQuantity > 0 && (!only || only.has(l._id)));
  if (!lines.length) {
    throw new AppError("BAD_REQUEST", `${formatOrderNumber(order.orderNumber)} has no return in transit`);
  }
  let units = 0;
  let back = 0;
  let lost = 0;
  for (const line of lines) {
    const qty = line.inTransitQuantity;
    if (isInCatalog(ctx, line)) {
      const unitCost = lineIssuedCost(ctx, order._id, line);
      changeInTransit(ctx.db, line.productId, line.variantId, -qty, unitCost);
      const toStock = item.outcome === "received" && !damaged.has(line._id);
      if (toStock) {
        const row = getInventoryRow(ctx.db, line.productId, line.variantId);
        noteReturnArrival(ctx, { productId: line.productId, variantId: line.variantId, quantity: qty, freeBefore: availableQty(row) });
        updateInventory(ctx.db, row._id, {
          onHand: row.onHand + qty,
          avgCost: blendCost(row.onHand, row.avgCost, qty, unitCost),
        });
        syncLowStockAlert(ctx.db, line.productId, line.variantId);
      }
      insertMovement(ctx.db, {
        productId: line.productId,
        variantId: line.variantId,
        type: toStock ? "transit_received" : "transit_write_off",
        quantityChange: toStock ? qty : -qty,
        date: ctx.now.toISOString(),
        userId: ctx.user._id,
        orderId: order._id,
        unitCost,
        notes: item.outcome === "lost" ? "Lost in transit" : toStock ? "Return received" : "Return received damaged",
      });
      if (toStock) back += qty;
      else lost += qty;
    } else lost += qty;
    ctx.db.update(orderLineItems).set({ inTransitQuantity: 0 }).where(eq(orderLineItems._id, line._id)).run();
    units += qty;
  }
  addHistory(
    ctx,
    order._id,
    order.status,
    item.outcome === "lost"
      ? `Return lost in transit: ${lost} unit(s) written off`
      : lost
        ? `Return received: ${back} unit(s) back in stock, ${lost} damaged and written off`
        : `Return received: ${back} unit(s) back in stock`,
  );
  return units;
}

export const ordersRouter = {
  list: query({
    input: listInput,
    handler: (ctx, args) => {
      requireView(ctx, "orders");
      const base = orderFilters(args, getTimeZone(ctx.db));
      const where = [...base];
      if (args.statuses?.length)
        where.push(inArray(orders.status, args.statuses));
      const filter = where.length ? and(...where) : undefined;

      const total =
        ctx.db.select({ n: count() }).from(orders).where(filter).get()?.n ?? 0;
      const statusCounts = Object.fromEntries(
        ORDER_STATUSES.map((s) => [s, 0]),
      ) as Record<OrderStatus, number>;
      for (const r of ctx.db
        .select({ status: orders.status, n: count() })
        .from(orders)
        .where(base.length ? and(...base) : undefined)
        .groupBy(orders.status)
        .all()) {
        statusCounts[r.status] = r.n;
      }

      const sortCol = SORT_COLUMNS[args.sort];
      const direction = args.dir === "asc" ? asc : desc;
      const rows = ctx.db
        .select({
          order: orders,
          lineItemCount: sql<number>`(select count(*) from order_line_items li where li.order_id = ${orders._id})`,
          unitCount: sql<number>`(select coalesce(sum(li.quantity), 0) from order_line_items li where li.order_id = ${orders._id} and li.is_swap_replacement = 0)`,
          returningUnits: sql<number>`(select coalesce(sum(li.in_transit_quantity), 0) from order_line_items li where li.order_id = ${orders._id})`,
          repName: sql<string | null>`coalesce(${users.name}, ${users.email})`,
        })
        .from(orders)
        .leftJoin(users, eq(users._id, orders.repId))
        .where(filter)
        .orderBy(direction(sortCol), direction(orders.orderNumber))
        .limit(args.pageSize)
        .offset((args.page - 1) * args.pageSize)
        .all();

      // Earlier refusals by the same numbers, for a warning badge on open orders
      const refusedPhones = new Map<string, number>();
      const open = rows.filter((r) => r.order.status === "new" || r.order.status === "on_hold");
      const phones = [...new Set(open.flatMap((r) => [r.order.customerPhone, r.order.customerPhone2]).filter((p): p is string => !!p))];
      if (phones.length) {
        for (const o of ctx.db
          .select({ id: orders._id, p1: orders.customerPhone, p2: orders.customerPhone2 })
          .from(orders)
          .where(and(eq(orders.status, "returned"), or(inArray(orders.customerPhone, phones), inArray(orders.customerPhone2, phones))))
          .all()) {
          for (const p of [o.p1, o.p2]) if (p) refusedPhones.set(p, (refusedPhones.get(p) ?? 0) + 1);
        }
      }
      const refusedBefore = (o: Order) =>
        o.status === "new" || o.status === "on_hold"
          ? Math.max(refusedPhones.get(o.customerPhone ?? "") ?? 0, refusedPhones.get(o.customerPhone2 ?? "") ?? 0)
          : 0;
      return {
        items: rows.map((r) => ({
          ...r.order,
          refusedBefore: refusedBefore(r.order),
          displayOrderNumber: formatOrderNumber(r.order.orderNumber),
          repName: r.repName ?? "Unknown user",
          lineItemCount: r.lineItemCount,
          unitCount: r.unitCount,
          returningUnits: r.returningUnits,
        })),
        total,
        page: args.page,
        pageSize: args.pageSize,
        statusCounts,
      };
    },
  }),

  get: query({
    input: z.object({ orderId: z.string() }),
    handler: (ctx, args) => {
      requireView(ctx, "orders");
      // Null (not an error) so an open page shows "not found" after deletion
      const order = ctx.db
        .select()
        .from(orders)
        .where(eq(orders._id, args.orderId))
        .get();
      if (!order) return null;
      const lines = orderLines(ctx, order._id);
      const history = ctx.db
        .select()
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.orderId, order._id))
        .orderBy(
          asc(orderStatusHistory.changedAt),
          asc(orderStatusHistory._creationTime),
        )
        .all();
      const events = ctx.db
        .select()
        .from(financialEvents)
        .where(eq(financialEvents.orderId, order._id))
        .orderBy(asc(financialEvents.date))
        .all();
      const { productMap, variantMap, userMap } = lookupMaps(ctx.db, {
        productIds: lines.map((l) => l.productId),
        variantIds: lines.map((l) => l.variantId),
        userIds: [order.repId, ...history.map((h) => h.changedBy)],
      });
      return {
        ...order,
        displayOrderNumber: formatOrderNumber(order.orderNumber),
        repName: userName(userMap.get(order.repId)),
        customerHistory: phoneHistory(ctx.db, [order.customerPhone, order.customerPhone2], order._id),
        lineItems: lines.map((line) => {
          const product = productMap.get(line.productId);
          const variant = line.variantId
            ? variantMap.get(line.variantId)
            : undefined;
          return {
            ...line,
            ...resolveItemNames(product, variant, line),
            sku: variant?.sku ?? product?.sku ?? line.productSku,
            // The variant's photo, else the product's
            productImageUrl: variant?.imageUrl ?? product?.imageUrl ?? null,
            inCatalog:
              Boolean(product) && (!line.variantId || Boolean(variant)),
            remainingToShip: line.quantity - line.shippedQuantity,
            returnable: line.shippedQuantity - line.returnedQuantity,
          };
        }),
        history: history.map((h) => ({
          ...h,
          changedByName: userName(userMap.get(h.changedBy)),
        })),
        financialEvents: events,
        // What an On hold order is waiting for
        shortages:
          order.status === "on_hold"
            ? stockShortages(ctx, unshippedUnits(lines))
            : [],
        rerecordedFrom: order.rerecordedFromId
          ? linkedOrder(ctx, order.rerecordedFromId)
          : null,
        rerecordedAs: ctx.db
          .select({
            _id: orders._id,
            orderNumber: orders.orderNumber,
            status: orders.status,
          })
          .from(orders)
          .where(eq(orders.rerecordedFromId, order._id))
          .all()
          .map((o) => ({
            ...o,
            displayOrderNumber: formatOrderNumber(o.orderNumber),
          })),
      };
    },
  }),

  create: mutation({
    input: z.object({
      orderDate: zDay,
      customer: zCustomer,
      customerPhone: zPhone,
      customerPhone2: zPhone2,
      address: zAddress,
      channel: zChannel,
      shippingFee: zShippingFee,
      shipmentNumber: zShipment,
      total: zMoney,
      notes: zLongText,
      shipmentNotes: zLongText,
      /** The customer asked to ship later: the day they want it shipped. */
      shipOn: zDay.nullish(),
      // Re-records a cancelled order: may keep that order's shipment number
      rerecordFromId: zId.optional(),
      lineItems: z
        // Prices come from the catalog; the order total is the only amount the client sets
        .array(
          z.object({
            productId: zId,
            variantId: zId.nullish(),
            quantity: zQty,
            /** Required for products that need it; ignored for the rest. */
            gender: z.enum(GENDERS).nullish(),
          }),
        )
        .min(1, "Add at least one product")
        .max(200),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "orders");
      assertDay(ctx, args.orderDate, "order date", 1);
      if (args.shipOn) assertShipLater(ctx, args.shipOn);
      const source = args.rerecordFromId
        ? mustGetOrder(ctx, args.rerecordFromId)
        : undefined;
      if (source && source.status !== "cancelled") {
        throw new AppError(
          "BAD_REQUEST",
          "Only cancelled orders can be re-recorded",
        );
      }
      const keepsSourceNumber =
        source !== undefined &&
        source.shipmentNumber.toLowerCase() ===
          args.shipmentNumber.toLowerCase();
      assertShipmentAvailable(ctx, args.shipmentNumber, {
        activeOnly: keepsSourceNumber,
      });

      const lines = args.lineItems.map((item) => {
        const { product, variant } = loadSellable(
          ctx.db,
          item.productId,
          item.variantId,
          { requireActive: true },
        );
        if (product.needsGender && !item.gender) {
          throw new AppError(
            "BAD_REQUEST",
            `Choose boys or girls for ${itemLabel({
              productName: product.name,
              variantName: variant?.name ?? null,
            })}`,
          );
        }
        const unitPrice = round2(product.unitPrice);
        return {
          item,
          product,
          variant,
          gender: product.needsGender ? (item.gender ?? null) : null,
          unitPrice,
          subtotal: round2(item.quantity * unitPrice),
        };
      });
      // The same item twice only as one boys line and one girls line
      const seenLines = new Set<string>();
      for (const l of lines) {
        const key = `${l.product._id}:${l.variant?._id ?? ""}:${l.gender ?? ""}`;
        if (seenLines.has(key)) {
          const label = itemLabel({ productName: l.product.name, variantName: l.variant?.name ?? null });
          throw new AppError("BAD_REQUEST", `${label} is added twice: change the quantity on one line instead`);
        }
        seenLines.add(key);
      }
      // Hold the stock now so two orders can't promise the same units; if
      // any item is short, the whole order waits On hold instead. A delayed
      // order holds nothing (regular orders come first) and is always New.
      const placement: ReturnType<typeof placeOrder> = args.shipOn
        ? { status: "new" }
        : placeOrder(
            ctx,
            lines.map(({ item, product, variant }) => ({
              productId: product._id,
              variantId: variant?._id ?? null,
              quantity: item.quantity,
              label: itemLabel({
                productName: product.name,
                variantName: variant?.name ?? null,
              }),
            })),
          );
      const subtotal = round2(lines.reduce((sum, l) => sum + l.subtotal, 0));
      const total = round2(args.total);
      const discountAmount = round2(subtotal - total);
      const hasManualTotal = Math.abs(discountAmount) >= MONEY_EPSILON;

      const order = ctx.db
        .insert(orders)
        .values({
          orderNumber: nextOrderNumber(ctx.db),
          orderDate: args.orderDate,
          customer: args.customer,
          customerPhone: args.customerPhone,
          customerPhone2: args.customerPhone2,
          address: args.address,
          channel: args.channel,
          shippingFee: round2(args.shippingFee),
          shipmentNumber: args.shipmentNumber,
          repId: ctx.user._id,
          status: placement.status,
          subtotal,
          discountAmount,
          total,
          originalTotal: total,
          notes: args.notes,
          shipmentNotes: args.shipmentNotes,
          hasManualTotal,
          rerecordedFromId: source?._id ?? null,
          shipOn: args.shipOn ?? null,
        })
        .returning()
        .get();
      ctx.db
        .insert(orderLineItems)
        .values(
          lines.map(
            ({ item, product, variant, gender, unitPrice, subtotal }) => ({
              orderId: order._id,
              productId: product._id,
              variantId: variant?._id ?? null,
              gender,
              quantity: item.quantity,
              unitPrice,
              subtotal,
              ...lineItemSnapshot(product, variant),
            }),
          ),
        )
        .run();
      if (source) {
        addHistory(
          ctx,
          order._id,
          "new",
          `Re-recorded from ${formatOrderNumber(source.orderNumber)}`,
        );
        addHistory(
          ctx,
          source._id,
          "cancelled",
          `Re-recorded as ${formatOrderNumber(order.orderNumber)}`,
        );
      } else addHistory(ctx, order._id, "new", "Order created");
      if (args.shipOn) {
        addHistory(ctx, order._id, "new", `Delayed by the customer: ship on ${args.shipOn}`);
      }
      if (placement.status === "on_hold") {
        addHistory(
          ctx,
          order._id,
          "on_hold",
          `Waiting for stock: ${placement.shortage}`,
        );
        notifyOrder(
          ctx.db,
          ctx.user._id,
          "order_on_hold",
          order,
          `${order.customer}: ${placement.shortage}`,
        );
      } else notifyOrder(ctx.db, ctx.user._id, "order_new", order);
      return order._id;
    },
  }),

  /** Edits customer and shipping details after the order was created. */
  updateDetails: mutation({
    input: z.object({
      orderId: zId,
      customer: zCustomer,
      customerPhone: zPhone,
      customerPhone2: zPhone2,
      address: zAddress.optional(),
      channel: zChannel.optional(),
      shippingFee: zShippingFee.optional(),
      shipmentNumber: zShipment,
      notes: zLongText,
      shipmentNotes: zLongText,
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "orders");
      const order = mustGetOrder(ctx, args.orderId);
      if (
        args.shipmentNumber.toLowerCase() !== order.shipmentNumber.toLowerCase()
      ) {
        assertShipmentAvailable(ctx, args.shipmentNumber, {
          exceptOrderId: order._id,
        });
      }
      const labels: Record<string, string> = {
        customer: "customer",
        customerPhone: "phone",
        customerPhone2: "second phone",
        address: "address",
        channel: "channel",
        shippingFee: "shipping fee",
        shipmentNumber: "shipment number",
        notes: "notes",
        shipmentNotes: "shipment notes",
      };
      const patch = {
        customer: args.customer,
        customerPhone: args.customerPhone,
        customerPhone2: args.customerPhone2,
        address: args.address ?? order.address,
        channel: args.channel ?? order.channel,
        shippingFee:
          args.shippingFee !== undefined
            ? round2(args.shippingFee)
            : order.shippingFee,
        shipmentNumber: args.shipmentNumber,
        notes: args.notes,
        shipmentNotes: args.shipmentNotes,
      };
      const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter(
        (k) => (patch[k] ?? null) !== (order[k] ?? null),
      );
      if (!changed.length) return null;
      ctx.db.update(orders).set(patch).where(eq(orders._id, order._id)).run();
      addHistory(
        ctx,
        order._id,
        order.status,
        `Updated ${changed.map((k) => labels[k]).join(", ")}`,
      );
      return null;
    },
  }),

  /**
   * The warehouse's packing queue: New and On hold orders, oldest first, with
   * what to pick for each (photos, variant, quantity). No prices or costs.
   */
  packingQueue: query({
    input: noInput,
    handler: (ctx) => {
      requireView(ctx, "orders");
      const open = ctx.db
        .select()
        .from(orders)
        .where(
          and(
            inArray(orders.status, ["new", "on_hold"]),
            eq(orders.awaitingConfirmation, false),
          ),
        )
        // Regular orders first, then delayed ones (soonest ship date first), then On hold
        .orderBy(
          sql`case when ${orders.status} = 'on_hold' then 2 when ${orders.shipOn} is not null then 1 else 0 end`,
          asc(orders.shipOn),
          asc(orders.orderDate),
          asc(orders.orderNumber),
        )
        .all();
      if (!open.length) return [];
      const lines = ctx.db
        .select()
        .from(orderLineItems)
        .where(
          inArray(
            orderLineItems.orderId,
            open.map((o) => o._id),
          ),
        )
        .orderBy(asc(orderLineItems._creationTime))
        .all();
      const { productMap, variantMap, userMap } = lookupMaps(ctx.db, {
        productIds: lines.map((l) => l.productId),
        variantIds: lines.map((l) => l.variantId),
        userIds: open.map((o) => o.repId),
      });
      return open.map((o) => ({
        _id: o._id,
        displayOrderNumber: formatOrderNumber(o.orderNumber),
        orderDate: o.orderDate,
        createdAt: new Date(o._creationTime).toISOString(),
        status: o.status,
        customer: o.customer,
        customerPhone: o.customerPhone,
        customerPhone2: o.customerPhone2,
        address: o.address,
        channel: o.channel,
        shipmentNumber: o.shipmentNumber,
        notes: o.notes,
        shipmentNotes: o.shipmentNotes,
        shipOn: o.shipOn,
        // A delayed order holds nothing: what free stock can't cover right now
        stockShort:
          o.status === "new" && holdsNoStock(o)
            ? stockShortages(ctx, unshippedUnits(lines.filter((l) => l.orderId === o._id)))
            : [],
        repName: userName(userMap.get(o.repId)),
        totalWithShipping: round2(o.total + o.shippingFee),
        items: lines
          .filter((l) => l.orderId === o._id && l.quantity > l.shippedQuantity)
          .map((l) => {
            const product = productMap.get(l.productId);
            const variant = l.variantId
              ? variantMap.get(l.variantId)
              : undefined;
            return {
              lineItemId: l._id,
              productId: l.productId,
              variantId: l.variantId,
              ...resolveItemNames(product, variant, l),
              sku: variant?.sku ?? product?.sku ?? l.productSku,
              imageUrl: variant?.imageUrl ?? product?.imageUrl ?? null,
              gender: l.gender,
              quantity: l.quantity - l.shippedQuantity,
            };
          }),
      }));
    },
  }),

  /** Records that the order was posted to the WhatsApp group (any order that isn't cancelled). */
  markWhatsAppPosted: mutation({
    input: z.object({ orderId: zId }),
    handler: (ctx, args) => {
      requireEdit(ctx, "orders");
      const order = mustGetOrder(ctx, args.orderId);
      if (order.status === "cancelled") {
        throw new AppError(
          "BAD_REQUEST",
          "Cancelled orders can't be posted to WhatsApp",
        );
      }
      const first = !order.whatsappPostedAt;
      ctx.db
        .update(orders)
        .set({ whatsappPostedAt: ctx.now.toISOString() })
        .where(eq(orders._id, order._id))
        .run();
      addHistory(
        ctx,
        order._id,
        order.status,
        first ? "Posted to WhatsApp" : "Posted to WhatsApp again",
      );
      return null;
    },
  }),

  /**
   * Status changes people make. "Shipped" ships the whole order (New only).
   * Cancel works on New and On hold orders while nothing has shipped and the
   * order isn't paid. "New" reopens a cancelled order: it goes through the same
   * stock check as a new order, so it may land On hold. On hold itself is set
   * and cleared only by the stock check.
   */
  /** A phone number's earlier orders, for the warning in the new-order form. */
  phoneHistory: query({
    input: z.object({ phones: z.array(z.string().max(40)).max(2) }),
    handler: (ctx, args) => {
      requireView(ctx, "orders");
      return phoneHistory(ctx.db, args.phones);
    },
  }),

  /**
   * Confirms a website order after talking to the customer: its real shipment
   * number (and shipping fee, if it changed). It can then be packed and shipped.
   */
  /**
   * Admins: fix the price of a shipped order that isn't paid yet (it was
   * recorded wrong; the courier collects the right amount). The order keeps its
   * shipment, items and stock; the books get the difference on today's date.
   */
  correctPrice: mutation({
    input: z.object({
      orderId: zId,
      total: z.number().finite().min(0, "The total can't be negative").max(10_000_000),
      reason: z.string().trim().min(1, "Say why the price changed").max(300),
    }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      const order = mustGetOrder(ctx, args.orderId);
      if (order.status !== "shipped") {
        throw new AppError("BAD_REQUEST", "Only shipped orders (not returned) can have their price corrected");
      }
      if (order.paymentStatus === "paid") {
        throw new AppError("BAD_REQUEST", "This order is already paid: its price can't be corrected");
      }
      const total = round2(args.total);
      const difference = round2(total - order.total);
      if (Math.abs(difference) < MONEY_EPSILON) {
        throw new AppError("BAD_REQUEST", "That's already the order's total");
      }
      ctx.db
        .update(orders)
        .set({ total, hasManualTotal: true })
        .where(eq(orders._id, order._id))
        .run();
      recordFinancialEvent(ctx, order._id, "price_correction", difference);
      const money = moneyFormatter(ctx.db);
      addHistory(
        ctx,
        order._id,
        order.status,
        `Price corrected from ${money(order.total)} to ${money(total)}: ${args.reason}`,
      );
      return null;
    },
  }),

  /**
   * Sets, changes or (null) removes the day the customer wants a New / On hold
   * order shipped. It stays in the packing queue, marked Delayed.
   */
  setShipOn: mutation({
    input: z.object({ orderId: zId, shipOn: zDay.nullable() }),
    handler: (ctx, args) => {
      requireEdit(ctx, "orders");
      const order = mustGetOrder(ctx, args.orderId);
      if (order.status !== "new" && order.status !== "on_hold") {
        throw new AppError("BAD_REQUEST", "Only New or On hold orders can get a ship date");
      }
      if (order.awaitingConfirmation) {
        throw new AppError("BAD_REQUEST", "Confirm this website order first: add its shipment number.");
      }
      if (args.shipOn === order.shipOn) return null;
      if (args.shipOn) assertShipLater(ctx, args.shipOn);
      const lines = orderLines(ctx, order._id);

      if (args.shipOn && order.shipOn) {
        // Just a new day: still delayed, still holding nothing
        ctx.db.update(orders).set({ shipOn: args.shipOn }).where(eq(orders._id, order._id)).run();
        addHistory(ctx, order._id, order.status, `Ship date moved from ${order.shipOn} to ${args.shipOn}`);
        return null;
      }

      if (args.shipOn) {
        // Delayed now: it lets go of its stock (other orders come first) and is New
        const held = order.status === "new";
        if (held) releaseOrderStock(ctx, lines);
        ctx.db.update(orders).set({ shipOn: args.shipOn, status: "new" }).where(eq(orders._id, order._id)).run();
        addHistory(ctx, order._id, "new", `Delayed by the customer: ship on ${args.shipOn}`);
        if (held) releaseHeldOrders(ctx);
        return null;
      }

      // Not delayed anymore: it needs its stock like a new order, or waits On hold
      const placement = placeOrder(ctx, unshippedUnits(lines));
      ctx.db.update(orders).set({ shipOn: null, status: placement.status }).where(eq(orders._id, order._id)).run();
      addHistory(ctx, order._id, "new", "No longer delayed: ship as usual");
      if (placement.status === "on_hold") {
        addHistory(ctx, order._id, "on_hold", `Waiting for stock: ${placement.shortage}`);
        notifyOrder(ctx.db, ctx.user._id, "order_on_hold", order, `${order.customer}: ${placement.shortage}`);
      }
      return null;
    },
  }),

  confirmWebOrder: mutation({
    input: z.object({
      orderId: zId,
      shipmentNumber: zShipment,
      shippingFee: zShippingFee.optional(),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "orders");
      const order = mustGetOrder(ctx, args.orderId);
      if (!order.awaitingConfirmation) {
        throw new AppError("BAD_REQUEST", "This order is already confirmed");
      }
      if (order.status === "cancelled") {
        throw new AppError("BAD_REQUEST", "This order is cancelled");
      }
      assertShipmentAvailable(ctx, args.shipmentNumber, { exceptOrderId: order._id });
      ctx.db
        .update(orders)
        .set({
          awaitingConfirmation: false,
          shipmentNumber: args.shipmentNumber,
          // The moderator who confirmed becomes the order's rep
          repId: ctx.user._id,
          ...(args.shippingFee === undefined ? {} : { shippingFee: round2(args.shippingFee) }),
        })
        .where(eq(orders._id, order._id))
        .run();
      addHistory(ctx, order._id, order.status, "Confirmed with the customer");
      return null;
    },
  }),

  /**
   * Website orders waiting for confirmation, as rows for the courier's bulk
   * upload. Marks them as exported so the next sheet only has new ones
   * (unless `includeExported`).
   */
  courierSheet: mutation({
    input: z.object({ includeExported: z.boolean().optional() }),
    handler: (ctx, args) => {
      requireEdit(ctx, "orders");
      const list = ctx.db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.awaitingConfirmation, true),
            ne(orders.status, "cancelled"),
            ...(args.includeExported ? [] : [isNull(orders.courierExportedAt)]),
          ),
        )
        .orderBy(asc(orders.orderNumber))
        .all();
      if (!list.length) return [];
      const lines = ctx.db
        .select()
        .from(orderLineItems)
        .where(
          inArray(
            orderLineItems.orderId,
            list.map((o) => o._id),
          ),
        )
        .orderBy(asc(orderLineItems._creationTime))
        .all();
      ctx.db
        .update(orders)
        .set({ courierExportedAt: ctx.now.getTime() })
        .where(
          inArray(
            orders._id,
            list.map((o) => o._id),
          ),
        )
        .run();
      return list.map((o) => {
        const own = lines.filter((l) => l.orderId === o._id && !l.isSwapReplacement);
        return {
          orderId: o._id,
          orderNumber: formatOrderNumber(o.orderNumber),
          recipient: o.customer,
          phone: o.customerPhone ?? "",
          phone2: o.customerPhone2 ?? "",
          governorate: o.governorate ?? "",
          city: o.city ?? "",
          address: o.address ?? "",
          content: own.map(courierLine).join(" + "),
          pieces: own.reduce((sum, l) => sum + l.quantity, 0),
          // What the courier collects: the order and its shipping
          collect: round2(o.total + o.shippingFee),
          notes: o.notes ?? "",
        };
      });
    },
  }),

  /** Confirms several website orders at once, each with its shipment number from the courier. */
  confirmWebOrders: mutation({
    input: z.object({
      items: z
        .array(z.object({ orderId: zId, shipmentNumber: zShipment }))
        .min(1, "Enter at least one shipment number")
        .max(200),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "orders");
      const seen = new Set<string>();
      for (const item of args.items) {
        const key = item.shipmentNumber.toLowerCase();
        if (seen.has(key)) {
          throw new AppError("BAD_REQUEST", `Shipment number "${item.shipmentNumber}" is entered twice`);
        }
        seen.add(key);
      }
      for (const item of args.items) {
        const order = mustGetOrder(ctx, item.orderId);
        if (!order.awaitingConfirmation || order.status === "cancelled") continue;
        assertShipmentAvailable(ctx, item.shipmentNumber, { exceptOrderId: order._id });
        ctx.db
          .update(orders)
          .set({ awaitingConfirmation: false, shipmentNumber: item.shipmentNumber, repId: ctx.user._id })
          .where(eq(orders._id, order._id))
          .run();
        addHistory(ctx, order._id, order.status, "Confirmed with the customer");
      }
      return null;
    },
  }),

  updateStatus: mutation({
    input: z.object({
      orderId: zId,
      status: z.enum(["shipped", "cancelled", "new"]),
      note: zNote,
    }),
    handler: (ctx, args) => {
      if (args.status === "shipped") requireShipAccess(ctx);
      else requireEdit(ctx, "orders");
      const order = mustGetOrder(ctx, args.orderId);
      if (args.status === order.status) return null;

      if (args.status === "shipped") {
        shipOrder(ctx, order, args.note);
        return null;
      }
      const lines = orderLines(ctx, order._id);
      if (args.status === "cancelled") {
        if (order.status !== "new" && order.status !== "on_hold") {
          throw new AppError(
            "BAD_REQUEST",
            "Only new or on-hold orders can be cancelled. Shipped orders must be returned instead.",
          );
        }
        if (lines.some((l) => l.shippedQuantity > 0)) {
          throw new AppError(
            "BAD_REQUEST",
            "Some items have already shipped. Return them instead of cancelling.",
          );
        }
        if (order.paymentStatus === "paid") {
          throw new AppError(
            "BAD_REQUEST",
            "This order is marked as paid. Refund the customer and mark it unpaid before cancelling.",
          );
        }
        // Only New orders hold stock; On hold and delayed orders hold nothing
        const held = order.status === "new" && !holdsNoStock(order);
        if (held) releaseOrderStock(ctx, lines);
        ctx.db
          .update(orders)
          .set({ status: "cancelled" })
          .where(eq(orders._id, order._id))
          .run();
        addHistory(ctx, order._id, "cancelled", args.note);
        notifyOrder(ctx.db, ctx.user._id, "order_cancelled", order);
        if (held) releaseHeldOrders(ctx);
        return null;
      }

      // Reopen
      if (order.status !== "cancelled") {
        throw new AppError(
          "BAD_REQUEST",
          "Only cancelled orders can be reopened",
        );
      }
      // A re-recorded copy may already hold this shipment number
      assertShipmentAvailable(ctx, order.shipmentNumber, {
        exceptOrderId: order._id,
        activeOnly: true,
      });
      const placement: ReturnType<typeof placeOrder> = holdsNoStock(order)
        ? { status: "new" }
        : placeOrder(ctx, unshippedUnits(lines));
      ctx.db
        .update(orders)
        .set({ status: placement.status })
        .where(eq(orders._id, order._id))
        .run();
      addHistory(ctx, order._id, "new", args.note ?? "Order reopened");
      if (placement.status === "on_hold") {
        addHistory(
          ctx,
          order._id,
          "on_hold",
          `Waiting for stock: ${placement.shortage}`,
        );
        notifyOrder(
          ctx.db,
          ctx.user._id,
          "order_on_hold",
          order,
          `${order.customer}: ${placement.shortage}`,
        );
      }
      return null;
    },
  }),

  /**
   * Returns shipped units from the order page (received now, or announced by
   * the courier and still in transit). See {@link recordReturn} for the refund.
   */
  returnLineItems: mutation({
    input: z.object({
      orderId: zId,
      lines: z
        .array(zReturnLine)
        .min(1, "Select at least one item to return")
        .max(200),
      inTransit: z.boolean().optional(),
      note: zNote,
      manualRefundAmount: zMoney.optional(),
    }),
    handler: (ctx, args) => {
      requireShipAccess(ctx);
      const result = recordReturn(ctx, mustGetOrder(ctx, args.orderId), {
        lines: args.lines,
        inTransit: args.inTransit ?? false,
        note: args.note,
        manualRefundAmount: args.manualRefundAmount,
      });
      releaseHeldOrders(ctx);
      return result;
    },
  }),

  /**
   * Finds shipped orders for the batch returns screen. Numbers are separated
   * by "|" (or new lines and commas); each can be a shipment number or an
   * order number (ORD-0012 or 12).
   */
  findForReturn: query({
    input: z.object({ numbers: z.string().max(20_000) }),
    handler: (ctx, args) => {
      requireShipAccess(ctx);
      const tokens = [
        ...new Set(
          args.numbers
            .split(/[|,\n\r\t]+/)
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      ].slice(0, 300);
      return tokens.map((token) => {
        const byShipment = ctx.db
          .select()
          .from(orders)
          .where(sql`lower(${orders.shipmentNumber}) = ${token.toLowerCase()}`)
          .all();
        // Prefer the active order when a cancelled copy shares the number
        let order: Order | undefined =
          byShipment.find((o) => o.status !== "cancelled") ?? byShipment[0];
        if (!order) {
          const num = orderNumberOf(token);
          if (num)
            order = ctx.db
              .select()
              .from(orders)
              .where(eq(orders.orderNumber, num))
              .get();
        }
        if (!order) return { token, error: "Not found" as const };
        const lines = orderLines(ctx, order._id);
        const { productMap, variantMap } = lookupMaps(ctx.db, {
          productIds: lines.map((l) => l.productId),
          variantIds: lines.map((l) => l.variantId),
        });
        const returnable = lines
          .filter((l) => l.shippedQuantity - l.returnedQuantity > 0)
          .map((l) => {
            const product = productMap.get(l.productId);
            const variant = l.variantId
              ? variantMap.get(l.variantId)
              : undefined;
            return {
              lineItemId: l._id,
              ...resolveItemNames(product, variant, l),
              imageUrl: variant?.imageUrl ?? product?.imageUrl ?? null,
              unitPrice: l.unitPrice,
              returnable: l.shippedQuantity - l.returnedQuantity,
            };
          });
        // Already announced by the courier: received here closes them
        const transit = lines
          .filter((l) => l.inTransitQuantity > 0)
          .map((l) => {
            const product = productMap.get(l.productId);
            const variant = l.variantId ? variantMap.get(l.variantId) : undefined;
            return {
              lineItemId: l._id,
              ...resolveItemNames(product, variant, l),
              imageUrl: variant?.imageUrl ?? product?.imageUrl ?? null,
              quantity: l.inTransitQuantity,
            };
          });
        const base = {
          token,
          orderId: order._id,
          displayOrderNumber: formatOrderNumber(order.orderNumber),
          shipmentNumber: order.shipmentNumber,
          customer: order.customer,
          status: order.status,
          total: order.total,
          hasManualTotal: order.hasManualTotal,
          inTransitUnits: lines.reduce((s, l) => s + l.inTransitQuantity, 0),
          lines: returnable,
          transit,
        };
        if (!RETURNABLE_STATUSES.includes(order.status) && !transit.length)
          return { ...base, error: "Not shipped" as const };
        if (!returnable.length && !transit.length)
          return { ...base, error: "Already returned" as const };
        return base;
      });
    },
  }),

  /**
   * Records several returns at once, all or nothing. Each order is either
   * received now or in transit (announced by the courier). Leaving out the
   * lines returns everything still out with the customer.
   */
  batchReturn: mutation({
    input: z.object({
      returns: z
        .array(
          z.object({
            orderId: zId,
            inTransit: z.boolean(),
            lines: z.array(zReturnLine).max(200).optional(),
            manualRefundAmount: zMoney.optional(),
            /**
             * Received now: pieces the courier already announced (in transit)
             * that arrived. They close the in-transit return; damaged ones are written off.
             */
            transitReceived: z
              .array(z.object({ lineItemId: zId, damaged: z.boolean().optional() }))
              .max(200)
              .optional(),
          }),
        )
        .min(1, "Choose at least one order")
        .max(300),
      note: zNote,
    }),
    handler: (ctx, args) => {
      requireShipAccess(ctx);
      const seen = new Set<string>();
      let received = 0;
      let inTransit = 0;
      for (const r of args.returns) {
        if (seen.has(r.orderId))
          throw new AppError(
            "BAD_REQUEST",
            "Each order can only be listed once",
          );
        seen.add(r.orderId);
        let order = mustGetOrder(ctx, r.orderId);
        const arrived = r.inTransit ? [] : (r.transitReceived ?? []);
        if (arrived.length) {
          try {
            settleInTransit(ctx, order, {
              outcome: "received",
              lineItemIds: arrived.map((a) => a.lineItemId),
              damagedLineItemIds: arrived.filter((a) => a.damaged).map((a) => a.lineItemId),
            });
          } catch (e) {
            if (e instanceof AppError)
              throw new AppError(e.code, `${formatOrderNumber(order.orderNumber)}: ${e.message}`);
            throw e;
          }
          received++;
          // Only the in-transit pieces arrived: nothing new to return
          if (!r.lines?.length) continue;
          order = mustGetOrder(ctx, r.orderId);
        }
        const lines =
          r.lines ??
          orderLines(ctx, order._id)
            .filter((l) => l.shippedQuantity > l.returnedQuantity)
            .map((l) => ({
              lineItemId: l._id,
              quantity: l.shippedQuantity - l.returnedQuantity,
              sellable: true,
            }));
        if (!lines.length) {
          throw new AppError(
            "BAD_REQUEST",
            `${formatOrderNumber(order.orderNumber)} has nothing left to return`,
          );
        }
        try {
          recordReturn(ctx, order, {
            lines,
            inTransit: r.inTransit,
            note: args.note,
            manualRefundAmount: r.manualRefundAmount,
          });
        } catch (e) {
          // Say which order failed, so the batch can be fixed
          if (e instanceof AppError)
            throw new AppError(
              e.code,
              `${formatOrderNumber(order.orderNumber)}: ${e.message}`,
            );
          throw e;
        }
        if (r.inTransit) inTransit++;
        else received++;
      }
      releaseHeldOrders(ctx);
      return { received, inTransit };
    },
  }),

  /** Orders with returns still on their way back, oldest first. */
  returnsInTransit: query({
    input: noInput,
    handler: (ctx) => {
      requireShipAccess(ctx);
      const lines = ctx.db
        .select()
        .from(orderLineItems)
        .where(sql`${orderLineItems.inTransitQuantity} > 0`)
        .all();
      if (!lines.length) return [];
      const orderIds = [...new Set(lines.map((l) => l.orderId))];
      const list = ctx.db
        .select()
        .from(orders)
        .where(inArray(orders._id, orderIds))
        .all();
      const since = new Map(
        ctx.db
          .select({
            orderId: inventoryMovements.orderId,
            at: sql<string>`max(${inventoryMovements.date})`,
          })
          .from(inventoryMovements)
          .where(
            and(
              inArray(inventoryMovements.orderId, orderIds),
              eq(inventoryMovements.type, "return_in_transit"),
            ),
          )
          .groupBy(inventoryMovements.orderId)
          .all()
          .map((r) => [r.orderId, r.at]),
      );
      const { productMap, variantMap } = lookupMaps(ctx.db, {
        productIds: lines.map((l) => l.productId),
        variantIds: lines.map((l) => l.variantId),
      });
      return list
        .map((o) => ({
          orderId: o._id,
          displayOrderNumber: formatOrderNumber(o.orderNumber),
          orderNumber: o.orderNumber,
          shipmentNumber: o.shipmentNumber,
          customer: o.customer,
          since: since.get(o._id) ?? null,
          lines: lines
            .filter((l) => l.orderId === o._id)
            .map((l) => {
              const product = productMap.get(l.productId);
              const variant = l.variantId
                ? variantMap.get(l.variantId)
                : undefined;
              return {
                lineItemId: l._id,
                ...resolveItemNames(product, variant, l),
                imageUrl: variant?.imageUrl ?? product?.imageUrl ?? null,
                quantity: l.inTransitQuantity,
              };
            }),
        }))
        .sort((a, b) => (a.since ?? "").localeCompare(b.since ?? ""));
    },
  }),

  /**
   * Settles returns in transit: received (back in stock, or written off if
   * damaged) or lost (written off). The sale was already reversed.
   */
  resolveInTransit: mutation({
    input: z.object({
      orders: z
        .array(
          z.object({
            orderId: zId,
            outcome: z.enum(["received", "lost"]),
            // Received, but these lines came back damaged: written off
            damagedLineItemIds: z.array(zId).max(200).optional(),
          }),
        )
        .min(1, "Choose at least one order")
        .max(300),
    }),
    handler: (ctx, args) => {
      requireShipAccess(ctx);
      let units = 0;
      for (const item of args.orders) {
        units += settleInTransit(ctx, mustGetOrder(ctx, item.orderId), {
          outcome: item.outcome,
          damagedLineItemIds: item.damagedLineItemIds,
        });
      }
      releaseHeldOrders(ctx);
      return { units };
    },
  }),

  /**
   * Swaps returned units for another product/variant shipped out immediately.
   * Price difference = replacement value − refund for the returned units
   * (positive: the customer pays more; negative: they get money back).
   */
  swapLineItem: mutation({
    input: z.object({
      orderId: zId,
      returnLineItemId: zId,
      returnQuantity: zQty,
      returnSellable: z.boolean(),
      replacementProductId: zId,
      replacementVariantId: zId.nullish(),
      replacementQuantity: zQty,
      replacementUnitPrice: zMoney,
      note: zNote,
      /** Refund for the returned units; required on custom-total orders. */
      manualRefundAmount: zMoney.optional(),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "orders");
      const order = mustGetOrder(ctx, args.orderId);
      if (!RETURNABLE_STATUSES.includes(order.status)) {
        throw new AppError("BAD_REQUEST", "Only shipped orders can be swapped");
      }
      const line = orderLines(ctx, order._id).find(
        (l) => l._id === args.returnLineItemId,
      );
      if (!line)
        throw new AppError("NOT_FOUND", "Line item not found on this order");
      const remaining = line.shippedQuantity - line.returnedQuantity;
      if (args.returnQuantity > remaining) {
        throw new AppError(
          "BAD_REQUEST",
          `You can swap up to ${remaining} unit(s) of ${lineName(line)} (shipped and not yet returned)`,
        );
      }
      const { product, variant } = loadSellable(
        ctx.db,
        args.replacementProductId,
        args.replacementVariantId,
        {
          requireActive: true,
        },
      );

      const replacementSubtotal = round2(
        args.replacementQuantity * args.replacementUnitPrice,
      );
      const returnedValue = round2(args.returnQuantity * line.unitPrice);
      let refund: number;
      if (args.manualRefundAmount !== undefined)
        refund = args.manualRefundAmount;
      else if (order.hasManualTotal) {
        throw new AppError(
          "BAD_REQUEST",
          "This order has a custom total, so enter the refund for the swapped items.",
        );
      } else refund = returnedValue;
      const priceDifference = round2(replacementSubtotal - refund);
      if (order.total + priceDifference < -MONEY_EPSILON) {
        throw new AppError(
          "BAD_REQUEST",
          "The refund can't be more than the order's current total plus the replacement",
        );
      }

      const inCatalog = isInCatalog(ctx, line);
      const returnCost = inCatalog ? lineIssuedCost(ctx, order._id, line) : 0;
      if (inCatalog && args.returnSellable) {
        applyOrderMovement(ctx, {
          productId: line.productId,
          variantId: line.variantId,
          quantityChange: args.returnQuantity,
          type: "swap_in",
          orderId: order._id,
          label: lineName(line),
          unitCost: returnCost,
        });
      } else if (inCatalog) {
        // Came back damaged: written off on the spot, never back in stock
        insertMovement(ctx.db, {
          productId: line.productId,
          variantId: line.variantId,
          type: "return_write_off",
          quantityChange: args.returnQuantity,
          date: ctx.now.toISOString(),
          userId: ctx.user._id,
          orderId: order._id,
          unitCost: returnCost,
          notes: "Swapped, came back damaged: written off",
        });
      }
      const snapshot = lineItemSnapshot(product, variant);
      applyOrderMovement(ctx, {
        productId: product._id,
        variantId: variant?._id ?? null,
        quantityChange: -args.replacementQuantity,
        type: "swap_out",
        orderId: order._id,
        label: itemLabel(snapshot),
      });
      ctx.db
        .update(orderLineItems)
        .set({ returnedQuantity: line.returnedQuantity + args.returnQuantity })
        .where(eq(orderLineItems._id, line._id))
        .run();
      ctx.db
        .insert(orderLineItems)
        .values({
          orderId: order._id,
          productId: product._id,
          variantId: variant?._id ?? null,
          quantity: args.replacementQuantity,
          unitPrice: round2(args.replacementUnitPrice),
          subtotal: replacementSubtotal,
          // Replacements go out with the swap
          shippedQuantity: args.replacementQuantity,
          isSwapReplacement: true,
          replacesLineItemId: line._id,
          ...snapshot,
        })
        .run();

      ctx.db
        .update(orders)
        .set({
          status: "swapped",
          total: Math.max(0, round2(order.total + priceDifference)),
          swapPriceDifference: round2(
            order.swapPriceDifference + priceDifference,
          ),
        })
        .where(eq(orders._id, order._id))
        .run();
      recordFinancialEvent(ctx, order._id, "swap_adjustment", priceDifference);

      const money = moneyFormatter(ctx.db);
      const diff =
        Math.abs(priceDifference) < MONEY_EPSILON
          ? "no price difference"
          : priceDifference > 0
            ? `customer pays ${money(priceDifference)} more`
            : `customer refunded ${money(-priceDifference)}`;
      const summary = `Swapped ${args.returnQuantity} × ${lineName(line)} for ${args.replacementQuantity} × ${itemLabel(snapshot)}, ${diff}`;
      addHistory(
        ctx,
        order._id,
        "swapped",
        args.note ? `${summary}. ${args.note}` : summary,
      );
      if (!inCatalog)
        addHistory(
          ctx,
          order._id,
          "swapped",
          `${NOT_IN_CATALOG_NOTE} (${lineName(line)})`,
        );
      notifyOrder(
        ctx.db,
        ctx.user._id,
        "order_swapped",
        order,
        `${order.customer}: ${diff}`,
      );
      releaseHeldOrders(ctx);
      return { priceDifference };
    },
  }),
};

/**
 * On start-up, re-checks On hold orders (e.g. after an update changed the
 * rules). Changes are recorded under the first admin account.
 */
export function releaseHeldOrdersOnStartup(db: Ctx["db"]): number {
  const admin = db
    .select()
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true)))
    .orderBy(asc(users._creationTime))
    .get();
  if (!admin) return 0;
  return db.transaction(() => {
    // Damaged stock isn't kept any more: clear what's left of the old pile
    writeOffLeftoverNotSellable(db, admin._id);
    return releaseHeldOrders({
      db,
      user: admin,
      session: {} as Ctx["session"],
      now: new Date(),
    });
  });
}

/** Boys/girls as written for the courier and the group, in Arabic. */
const GENDERS_AR: Record<Gender, string> = { boys: "أولادي", girls: "بناتي" };

/** One line of "order content" for the courier: "2 × سلوبيت كم (0-3) بناتي". */
function courierLine(l: LineItem): string {
  const size = l.variantName ? ` (${l.variantName})` : "";
  const gender = l.gender ? ` ${GENDERS_AR[l.gender]}` : "";
  return `${l.quantity} × ${l.productName}${size}${gender}`;
}

export type WebOrderInput = {
  customerAccountId: string | null;
  customer: string;
  phone: string;
  phone2: string | null;
  address: string;
  governorate: string;
  city: string;
  notes: string | null;
  shippingFee: number;
  lines: { productId: string; variantId: string | null; quantity: number; gender: Gender | null }[];
  /** A promo code that passed its checks: its discount on the goods, or free shipping */
  promo?: { promoId: string; code: string; discount: number; freeShipping: boolean } | null;
};

/**
 * An order placed on the website (cash on delivery). It holds its stock right
 * away but waits as "Needs confirmation" until a moderator talks to the
 * customer and adds the shipment number. Never put on hold: if something just
 * sold out, the customer is asked to update the cart instead.
 */
export function placeWebOrder(ctx: Ctx, input: WebOrderInput) {
  const lines = input.lines.map((item) => {
    const { product, variant } = loadSellable(ctx.db, item.productId, item.variantId, { requireActive: true });
    if (!product.shopSection) throw new AppError("BAD_REQUEST", "Product not found");
    const label = itemLabel({ productName: product.name, variantName: variant?.name ?? null });
    if (product.needsGender && !item.gender) {
      throw new AppError("BAD_REQUEST", `Choose boys or girls for ${label}`);
    }
    const unitPrice = round2(product.unitPrice);
    return {
      item,
      product,
      variant,
      label,
      gender: product.needsGender ? item.gender : null,
      unitPrice,
      subtotal: round2(item.quantity * unitPrice),
    };
  });
  // Limited products: at most N per order, all sizes and colors together
  const perProduct = new Map<string, { product: (typeof lines)[number]["product"]; quantity: number }>();
  for (const l of lines) {
    const row = perProduct.get(l.product._id) ?? { product: l.product, quantity: 0 };
    row.quantity += l.item.quantity;
    perProduct.set(l.product._id, row);
  }
  for (const { product, quantity } of perProduct.values()) {
    if (product.maxPerOrder && quantity > product.maxPerOrder) {
      throw new AppError("BAD_REQUEST", `You can order up to ${product.maxPerOrder} of ${product.name} per order`);
    }
  }
  const needs = lines.map(({ item, product, variant, label }) => ({
    productId: product._id,
    variantId: variant?._id ?? null,
    quantity: item.quantity,
    label,
  }));
  const short = stockShortages(ctx, needs);
  if (short.length) {
    throw new AppError(
      "CONFLICT",
      `Sorry, not enough left of: ${short.map((s) => s.label).join(", ")}. Update your cart and try again.`,
    );
  }
  reserveOrderStock(ctx, needs);
  const subtotal = round2(lines.reduce((sum, l) => sum + l.subtotal, 0));
  const promo = input.promo ?? null;
  const discount = promo ? round2(Math.min(promo.discount, subtotal)) : 0;
  const orderNumber = nextOrderNumber(ctx.db);
  const order = ctx.db
    .insert(orders)
    .values({
      orderNumber,
      orderDate: businessToday(ctx),
      customer: input.customer,
      customerPhone: input.phone,
      customerPhone2: input.phone2,
      address: input.address,
      governorate: input.governorate,
      city: input.city,
      channel: "website",
      shippingFee: promo?.freeShipping ? 0 : round2(input.shippingFee),
      promoCode: promo?.code ?? null,
      // Placeholder until the moderator adds the courier's number
      shipmentNumber: `WEB-${formatOrderNumber(orderNumber)}`,
      repId: ctx.user._id,
      status: "new",
      subtotal,
      // A promo discount is kept like an agreed total (as on Operations orders)
      discountAmount: discount,
      total: round2(subtotal - discount),
      originalTotal: round2(subtotal - discount),
      notes: input.notes,
      hasManualTotal: discount >= MONEY_EPSILON,
      customerAccountId: input.customerAccountId,
      awaitingConfirmation: true,
    })
    .returning()
    .get();
  ctx.db
    .insert(orderLineItems)
    .values(
      lines.map(({ item, product, variant, gender, unitPrice, subtotal }) => ({
        orderId: order._id,
        productId: product._id,
        variantId: variant?._id ?? null,
        gender,
        quantity: item.quantity,
        unitPrice,
        subtotal,
        ...lineItemSnapshot(product, variant),
      })),
    )
    .run();
  addHistory(ctx, order._id, "new", "Order placed on the website");
  if (promo) {
    ctx.db
      .insert(promoRedemptions)
      .values({ promoId: promo.promoId, orderId: order._id, phone: normalizePhone(input.phone), discount, freeShipping: promo.freeShipping })
      .run();
  }
  // Everyone with orders access sees it as unread (no team member placed it)
  notify(ctx.db, "orders", {
    type: "order_new",
    title: `Website order, needs confirmation: ${formatOrderNumber(order.orderNumber)}`,
    body: order.customer,
    link: `/orders/${order._id}`,
    orderId: order._id,
  });
  return order;
}
