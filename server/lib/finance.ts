import { and, eq, gte, isNotNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import {
  expenses,
  financialEvents,
  inventoryMovements,
  orders,
} from "../db/schema.ts";
import type { Movement, Order } from "../db/schema.ts";
import { addDays, dayOf, zonedDayStart } from "../../shared/dates.ts";
import { MONEY_EPSILON, round2 } from "../../shared/constants.ts";
import type {
  ExpenseCategory,
  FinancialEventType,
  MovementType,
  RevenueBasis,
} from "../../shared/constants.ts";

/**
 * Revenue rules (shared by Finance, the dashboard and exports):
 * - an order counts on the day it first shipped (or was marked paid, on the "paid" basis);
 * - net revenue = order subtotals − discounts − refunds + swap price differences;
 * - refunds and swap differences count on the day they happened;
 * - on the "paid" basis, refunds, swaps and cost of goods only count for paid orders;
 * - cost of goods follows the order's stock movements; adjustments and write-offs are losses.
 * Days are calendar days in the business timezone.
 */

type DayRange = { fromDay: string; toDay: string };

export type FinanceData = {
  orders: (Pick<
    Order,
    | "_id"
    | "orderNumber"
    | "customer"
    | "subtotal"
    | "discountAmount"
    | "total"
    | "paymentStatus"
    | "paidAt"
    | "paymentMethod"
    | "orderDate"
  > & {
    day: string;
    revenueAt: string;
  })[];
  events: {
    orderId: string;
    type: FinancialEventType;
    amount: number;
    date: string;
    day: string;
  }[];
  movements: (Pick<
    Movement,
    | "_id"
    | "productId"
    | "variantId"
    | "orderId"
    | "type"
    | "quantityChange"
    | "unitCost"
    | "reason"
    | "notes"
    | "date"
  > & {
    day: string;
  })[];
  expenses: {
    _id: string;
    day: string;
    category: ExpenseCategory;
    amount: number;
    vendor: string | null;
    description: string;
  }[];
};

/** Instants bounding a range of business days: [start of fromDay, start of the day after toDay). */
export function instantBounds(
  range: DayRange,
  tz: string,
): { from: string; to: string } {
  return {
    from: zonedDayStart(range.fromDay, tz).toISOString(),
    to: zonedDayStart(addDays(range.toDay, 1), tz).toISOString(),
  };
}

/** Everything dated inside the range, with each row's business day attached. */
export function loadFinanceData(
  db: DB,
  range: DayRange,
  basis: RevenueBasis,
  tz: string,
): FinanceData {
  const { from, to } = instantBounds(range, tz);
  const revenueCol = basis === "shipped" ? orders.shippedAt : orders.paidAt;
  const orderRows = db
    .select({
      _id: orders._id,
      orderNumber: orders.orderNumber,
      customer: orders.customer,
      subtotal: orders.subtotal,
      discountAmount: orders.discountAmount,
      total: orders.total,
      paymentStatus: orders.paymentStatus,
      paidAt: orders.paidAt,
      paymentMethod: orders.paymentMethod,
      orderDate: orders.orderDate,
      revenueAt: revenueCol,
    })
    .from(orders)
    .where(
      and(
        isNotNull(revenueCol),
        gte(revenueCol, from),
        lt(revenueCol, to),
        ne(orders.status, "cancelled"),
      ),
    )
    .all();
  const eventRows = db
    .select({
      orderId: financialEvents.orderId,
      type: financialEvents.type,
      amount: financialEvents.amount,
      date: financialEvents.date,
    })
    .from(financialEvents)
    .where(and(gte(financialEvents.date, from), lt(financialEvents.date, to)))
    .all();
  const movementRows = db
    .select({
      _id: inventoryMovements._id,
      productId: inventoryMovements.productId,
      variantId: inventoryMovements.variantId,
      orderId: inventoryMovements.orderId,
      type: inventoryMovements.type,
      quantityChange: inventoryMovements.quantityChange,
      unitCost: inventoryMovements.unitCost,
      reason: inventoryMovements.reason,
      notes: inventoryMovements.notes,
      date: inventoryMovements.date,
    })
    .from(inventoryMovements)
    .where(
      and(
        gte(inventoryMovements.date, from),
        lt(inventoryMovements.date, to),
        sql`${inventoryMovements.type} in ('shipment','swap_out','return','swap_in','not_sellable_in','adjustment','write_off','return_in_transit','transit_write_off','return_write_off')`,
      ),
    )
    .all();
  const expenseRows = db
    .select({
      _id: expenses._id,
      day: expenses.date,
      category: expenses.category,
      amount: expenses.amount,
      vendor: expenses.vendor,
      description: expenses.description,
    })
    .from(expenses)
    .where(
      and(gte(expenses.date, range.fromDay), lte(expenses.date, range.toDay)),
    )
    .all();

  // On the paid basis an unpaid order isn't revenue yet, so neither are its refunds or costs
  const counts = (() => {
    if (basis === "shipped") return () => true;
    const paid = new Set(
      db
        .select({ _id: orders._id })
        .from(orders)
        .where(and(isNotNull(orders.paidAt), ne(orders.status, "cancelled")))
        .all()
        .map((o) => o._id),
    );
    return (orderId: string | null) => orderId === null || paid.has(orderId);
  })();

  return {
    orders: orderRows.map((o) => ({
      ...o,
      revenueAt: o.revenueAt!,
      day: dayOf(o.revenueAt!, tz),
    })),
    events: eventRows
      .filter((e) => counts(e.orderId))
      .map((e) => ({ ...e, day: dayOf(e.date, tz) })),
    movements: movementRows
      .filter((m) => counts(m.orderId))
      .map((m) => ({ ...m, day: dayOf(m.date, tz) })),
    expenses: expenseRows,
  };
}

const COGS_OUT: readonly MovementType[] = ["shipment", "swap_out"];
// Units coming back from customers reverse their cost as soon as the return is
// recorded, even while still in transit; damaged or lost ones then count as a loss
const COGS_BACK: readonly MovementType[] = [
  "return",
  "swap_in",
  "not_sellable_in",
  "return_in_transit",
  "return_write_off",
];

/** Cost of an order movement: + for stock out, − for stock coming back. */
export function cogsOf(m: {
  type: MovementType;
  quantityChange: number;
  unitCost: number;
}): number {
  const cost = Math.abs(m.quantityChange) * m.unitCost;
  if (COGS_OUT.includes(m.type)) return cost;
  if (COGS_BACK.includes(m.type)) return -cost;
  return 0;
}

/**
 * Stock losses (+) and gains (−) outside sales: adjustments both ways,
 * write-offs, and returns that came back damaged or were lost by the courier,
 * valued at the cost recorded on the movement.
 */
export function lossOf(m: {
  type: MovementType;
  quantityChange: number;
  unitCost: number;
}): number {
  if (m.type === "transit_write_off" || m.type === "return_write_off")
    return Math.abs(m.quantityChange) * m.unitCost;
  if (m.type !== "adjustment" && m.type !== "write_off") return 0;
  return -m.quantityChange * m.unitCost;
}

export type FinanceSummary = {
  orderCount: number;
  grossSales: number;
  discounts: number;
  discountCount: number;
  refunds: number;
  refundCount: number;
  swapAdjustments: number;
  swapCount: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number | null;
  inventoryLosses: number;
  expensesTotal: number;
  expensesByCategory: { category: ExpenseCategory; total: number }[];
  netProfit: number;
};

const within = (day: string, r: DayRange) => day >= r.fromDay && day <= r.toDay;

/** Profit and loss for one range of days, from pre-loaded data. */
export function summarize(data: FinanceData, range: DayRange): FinanceSummary {
  const orderRows = data.orders.filter((o) => within(o.day, range));
  const grossSales = orderRows.reduce((s, o) => s + o.subtotal, 0);
  const events = data.events.filter((e) => within(e.day, range));
  // Price corrections count with the discounts (a lower price is a discount, a higher one takes it back)
  const corrections = events.filter((e) => e.type === "price_correction");
  const discounted = orderRows.filter(
    (o) => Math.abs(o.discountAmount) >= MONEY_EPSILON,
  );
  const discounts =
    discounted.reduce((s, o) => s + o.discountAmount, 0) - corrections.reduce((s, e) => s + e.amount, 0);
  const refundEvents = events.filter((e) => e.type === "refund");
  const swapEvents = events.filter((e) => e.type === "swap_adjustment");
  const refunds = refundEvents.reduce((s, e) => s + e.amount, 0);
  const swapAdjustments = swapEvents.reduce((s, e) => s + e.amount, 0);
  const netRevenue = grossSales - discounts - refunds + swapAdjustments;

  const movements = data.movements.filter((m) => within(m.day, range));
  const cogs = movements.reduce((s, m) => s + cogsOf(m), 0);
  const inventoryLosses = movements.reduce((s, m) => s + lossOf(m), 0);
  const grossProfit = netRevenue - cogs;

  const byCategory = new Map<ExpenseCategory, number>();
  for (const e of data.expenses) {
    if (within(e.day, range))
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  }
  const expensesTotal = [...byCategory.values()].reduce((s, n) => s + n, 0);

  return {
    orderCount: orderRows.length,
    grossSales: round2(grossSales),
    discounts: round2(discounts),
    discountCount: discounted.length + corrections.length,
    refunds: round2(refunds),
    refundCount: refundEvents.length,
    swapAdjustments: round2(swapAdjustments),
    swapCount: swapEvents.length,
    netRevenue: round2(netRevenue),
    cogs: round2(cogs),
    grossProfit: round2(grossProfit),
    // Margin is meaningless without positive revenue
    marginPct:
      netRevenue > MONEY_EPSILON ? (grossProfit / netRevenue) * 100 : null,
    inventoryLosses: round2(inventoryLosses),
    expensesTotal: round2(expensesTotal),
    expensesByCategory: [...byCategory.entries()]
      .map(([category, total]) => ({ category, total: round2(total) }))
      .sort((a, b) => b.total - a.total),
    netProfit: round2(grossProfit - inventoryLosses - expensesTotal),
  };
}

/** Net revenue per business day (same definition as the P&L). */
export function netRevenueByDay(data: FinanceData): Map<string, number> {
  const byDay = new Map<string, number>();
  const add = (day: string, n: number) =>
    byDay.set(day, (byDay.get(day) ?? 0) + n);
  for (const o of data.orders) add(o.day, o.subtotal - o.discountAmount);
  for (const e of data.events)
    add(e.day, e.type === "refund" ? -e.amount : e.amount);
  return byDay;
}

/**
 * Shipped orders not paid yet with something still to collect (a full return
 * leaves nothing), as of now. A partly collected order waiting for its returned
 * pieces counts with what's still open (it closes when the pieces are recorded).
 */
export function receivables(db: DB): { total: number; count: number } {
  const open = sql<number>`case when ${orders.returnPending} then ${orders.total} - coalesce(${orders.paidAmount}, 0) else ${orders.total} end`;
  const row = db
    .select({
      total: sql<number>`coalesce(sum(${open}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(orders)
    .where(
      and(
        isNotNull(orders.shippedAt),
        or(ne(orders.paymentStatus, "paid"), eq(orders.returnPending, true)),
        ne(orders.status, "cancelled"),
        sql`${open} > ${MONEY_EPSILON}`,
      ),
    )
    .get();
  return { total: round2(row?.total ?? 0), count: row?.count ?? 0 };
}

/** Each calendar month overlapping the range, clipped to it. */
export function monthsIn(
  range: DayRange,
): { label: string; fromDay: string; toDay: string }[] {
  const months = [];
  let start = `${range.fromDay.slice(0, 7)}-01`;
  while (start <= range.toDay) {
    const [y, m] = start.split("-").map(Number);
    const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const end = addDays(next, -1);
    months.push({
      label: start.slice(0, 7),
      fromDay: start < range.fromDay ? range.fromDay : start,
      toDay: end > range.toDay ? range.toDay : end,
    });
    start = next;
  }
  return months;
}
