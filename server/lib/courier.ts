import { desc, eq, ne, sql } from "drizzle-orm";
import { orders, settlements } from "../db/schema.ts";
import type { Order } from "../db/schema.ts";
import { AppError } from "../rpc/procedure.ts";
import type { Ctx } from "../rpc/procedure.ts";
import { RETURNABLE_STATUSES, round2 } from "../../shared/constants.ts";
import { itemLabel } from "./items.ts";
import { addHistory, orderLines, recordReturn } from "../modules/orders.ts";
import { zonedDayStart } from "../../shared/dates.ts";
import { nextCounter } from "./counters.ts";
import { accountByKey, paymentAccounts } from "./ledger.ts";
import { lockedThrough } from "./ledger-sync.ts";
import { getTimeZone, moneyFormatter } from "./settings.ts";

export type SheetRow = {
  shipment: string;
  status: string;
  due: number;
  customer?: string;
  /**
   * How to treat the row: as proposed ("auto"; a shipment with no order in
   * the app is courier money from before the app) or left out ("skip").
   */
  treatment?: "auto" | "skip";
  /** Partial returns: the pieces that came back */
  returnLines?: { lineItemId: string; quantity: number }[];
  /** Partial return on an order with a custom total: the amount refunded */
  refund?: number;
  /** What the customer paid the courier (from the statement), if known */
  paid?: number | null;
  /**
   * Partial returns: "pieces" (choose the pieces now, the default) or "later"
   * (which pieces is not known yet: record the money now, the warehouse
   * records the pieces when they arrive)
   */
  partial?: "pieces" | "later";
  /** "later": what was collected for the pieces the customer kept */
  collected?: number;
};

export type Kind = "delivered" | "partial" | "returned";

/** What posting the row does. */
export type Action =
  /** Delivered: the order is marked paid */
  | "collect"
  /** Returned: the return is recorded in transit, unpaid shipping as a cost */
  | "return"
  /** Partly returned: the chosen pieces in transit, the rest collected */
  | "partial_return"
  /** Partly returned, pieces not known yet: the money collected now, the order waits for its pieces */
  | "partial_collect"
  /** Return already recorded in the app: only the shipping charge */
  | "returned"
  /** Not in the app: clears courier money from before the app */
  | "pre_app";

export type ReturnableLine = { lineItemId: string; name: string; returnable: number; unitPrice: number };

export type CheckedRow = {
  line: number;
  shipment: string;
  customer: string;
  statusText: string;
  kind: Kind | null;
  action: Action | null;
  orderId: string | null;
  orderNumber: string | null;
  ok: boolean;
  /** Needs a choice before it can post (pieces of a partial return) */
  needsInput: boolean;
  message: string | null;
  /** Posts fine, but the amounts look unusual */
  warning: string | null;
  /** Courier money for the order cleared from Accounts Receivable */
  receivable: number;
  /** What the courier transferred for this row (negative: they charged us) */
  due: number;
  /** Courier charges on a delivered order (receivable − due) */
  fee: number;
  /** Shipping we pay on a returned order */
  refused: number;
  /** A difference posted to the gain/loss account (the bank received a different amount) */
  unidentified?: number;
  /** Partial returns: the order's pieces that can come back */
  lines?: ReturnableLine[];
  /** Partial returns: the pieces chosen, and the refund worked out */
  returnLines?: { lineItemId: string; quantity: number }[];
  refund?: number;
  /** "later" partial returns: the suggested amount collected for the kept pieces */
  suggestedCollected?: number;
  /** The courier called it partial; posted as a full return (every piece came back) */
  asFullReturn?: boolean;
};

export const settlementNo = (n: number) => `CS-${String(n).padStart(4, "0")}`;
const orderNo = (n: number) => `ORD-${String(n).padStart(4, "0")}`;

/** The courier's status text → what happened to the shipment. */
export function kindOf(status: string): Kind | null {
  const s = status.trim().toLowerCase();
  const returned = s.includes("مرتجع") || s.includes("return") || s.includes("رفض") || s.includes("تهرب");
  const delivered = s.includes("تم التسليم") || s.includes("delivered") || s.includes("تسليم");
  if (delivered && returned) return "partial";
  if (returned) return "returned";
  if (delivered) return "delivered";
  return null;
}

const amountWarning = (receivable: number, fee: number) =>
  fee < -1
    ? "The courier sent more than the order total: check the amounts"
    : fee > receivable / 2
      ? "The courier kept more than half of the order: check the amounts"
      : null;

/**
 * Matches each sheet row to its order and proposes what posting will do,
 * flagging anything that can't be posted. Nothing is changed here.
 */
export function checkSheet(ctx: Ctx, rows: SheetRow[]): CheckedRow[] {
  const active = ctx.db.select().from(orders).where(ne(orders.status, "cancelled")).all();
  const byShipment = new Map<string, Order>();
  for (const o of active) byShipment.set(o.shipmentNumber.trim().toLowerCase(), o);
  const seen = new Set<string>();
  return rows.map((r, i) => {
    const shipment = String(r.shipment ?? "").trim();
    const due = round2(Number(r.due) || 0);
    const kind = kindOf(r.status ?? "");
    const base: CheckedRow = {
      line: i + 2,
      shipment,
      customer: r.customer ?? "",
      statusText: r.status ?? "",
      kind,
      action: null,
      orderId: null,
      orderNumber: null,
      ok: false,
      needsInput: false,
      message: null,
      warning: null,
      receivable: 0,
      due,
      fee: 0,
      refused: 0,
    };
    const fail = (message: string) => ({ ...base, message });
    if (r.treatment === "skip") return fail("Left out of this settlement");
    if (!shipment) return fail("No shipment number");
    if (seen.has(shipment.toLowerCase())) return fail("This shipment is listed twice in the sheet");
    seen.add(shipment.toLowerCase());
    const o = byShipment.get(shipment.toLowerCase());
    if (!o) {
      // No order in the app: proposed as courier money from before the app
      // (already in the receivables balance); skip it if that's not right
      const warning = "No order in the app with this number";
      return due >= 0
        ? { ...base, ok: true, action: "pre_app" as const, receivable: due, warning }
        : { ...base, ok: true, action: "pre_app" as const, refused: round2(-due), warning };
    }
    const withOrder = { ...base, orderId: o._id, orderNumber: orderNo(o.orderNumber), customer: base.customer || o.customer };
    const failOrder = (message: string) => ({ ...withOrder, message });
    if (o.settlementId) return failOrder("Already in a posted courier settlement");
    if (!kind) return failOrder("Unknown courier status");
    if (!o.shippedAt) return failOrder("The order isn't shipped in the app");

    if (kind === "returned") {
      // Already recorded: only the shipping charge; otherwise the return is recorded now, in transit
      const action = o.status === "returned" ? ("returned" as const) : ("return" as const);
      if (action === "return" && !RETURNABLE_STATUSES.includes(o.status))
        return failOrder("The courier says it was returned: record the return in the app first");
      return { ...withOrder, ok: true, action, refused: round2(-due) };
    }
    if (o.paymentStatus === "paid") return failOrder("Already marked paid in the app");
    if (kind === "delivered" && (o.status === "returned" || o.status === "partially_returned"))
      return failOrder("The courier says delivered, but the app shows a return");

    if (kind === "partial" && o.status !== "partially_returned" && r.partial === "later") {
      // Which pieces came back isn't known yet: collect now, the warehouse records the pieces
      if (!RETURNABLE_STATUSES.includes(o.status)) return failOrder("Only shipped orders can be returned");
      const suggested = r.paid != null ? round2(Math.min(o.total, Math.max(0, r.paid - o.shippingFee))) : undefined;
      const ask = { ...withOrder, action: "partial_collect" as const, needsInput: true, suggestedCollected: suggested };
      const collected = r.collected ?? suggested;
      if (collected === undefined) return { ...ask, message: "Enter the amount collected for the pieces the customer kept" };
      if (collected > o.total + 0.005) return { ...ask, message: "The amount collected can't be more than the order total" };
      const receivable = round2(Math.max(0, collected));
      const fee = round2(receivable - due);
      return { ...ask, ok: true, receivable, fee, warning: amountWarning(receivable, fee) };
    }

    if (kind === "partial" && o.status !== "partially_returned") {
      // Which pieces came back is a judgement call: ask for them
      const lines: ReturnableLine[] = orderLines(ctx, o._id)
        .map((l) => ({
          lineItemId: l._id,
          name: itemLabel(l),
          returnable: l.shippedQuantity - l.returnedQuantity,
          unitPrice: l.unitPrice,
        }))
        .filter((l) => l.returnable > 0);
      const picked = (r.returnLines ?? []).filter((x) => x.quantity > 0);
      const ask = { ...withOrder, action: "partial_return" as const, needsInput: true, lines };
      if (!picked.length) return { ...ask, message: "Partly returned: choose the pieces that came back" };
      for (const p of picked) {
        const l = lines.find((x) => x.lineItemId === p.lineItemId);
        if (!l || p.quantity > l.returnable) return { ...ask, returnLines: picked, message: "Check the returned pieces" };
      }
      const all = lines.every((l) => (picked.find((p) => p.lineItemId === l.lineItemId)?.quantity ?? 0) >= l.returnable);
      if (all) {
        // The warehouse got everything back: a full return, whatever the courier's sheet says
        if (!RETURNABLE_STATUSES.includes(o.status))
          return { ...ask, returnLines: picked, message: "Only shipped orders can be returned" };
        return {
          ...withOrder,
          ok: true,
          action: "return" as const,
          lines,
          returnLines: picked,
          asFullReturn: true,
          refused: round2(-due),
          warning: "Posted as a full return: the courier's sheet says partial",
        };
      }
      let refund: number;
      if (o.hasManualTotal) {
        if (r.refund === undefined) {
          return { ...ask, returnLines: picked, message: "This order has a custom total: enter the refund for the returned pieces" };
        }
        refund = round2(Math.min(r.refund, o.total));
      } else {
        refund = round2(Math.min(picked.reduce((s, p) => s + p.quantity * lines.find((l) => l.lineItemId === p.lineItemId)!.unitPrice, 0), o.total));
      }
      const receivable = round2(o.total - refund);
      const fee = round2(receivable - due);
      return { ...ask, ok: true, returnLines: picked, refund, receivable, fee, warning: amountWarning(receivable, fee) };
    }

    // Delivered (or a partial return already recorded in the app)
    const receivable = round2(o.total);
    const fee = round2(receivable - due);
    return { ...withOrder, ok: true, action: "collect" as const, receivable, fee, warning: amountWarning(receivable, fee) };
  });
}

export function sheetTotals(rows: CheckedRow[]) {
  const ok = rows.filter((r) => r.ok);
  const sum = (pick: (r: CheckedRow) => number) => round2(ok.reduce((s, r) => s + pick(r), 0));
  const count = (a: Action) => ok.filter((r) => r.action === a).length;
  return {
    rows: rows.length,
    ready: ok.length,
    problems: rows.length - ok.length,
    needsInput: rows.filter((r) => r.needsInput && !r.ok).length,
    net: sum((r) => r.due),
    receivable: sum((r) => r.receivable),
    fees: sum((r) => r.fee),
    refused: sum((r) => r.refused),
    collected: count("collect"),
    returns: count("return") + count("returned"),
    partials: count("partial_return") + count("partial_collect"),
    preApp: count("pre_app"),
  };
}

/**
 * Posts the sheet: returns recorded in transit (full, or the chosen pieces),
 * delivered orders marked paid, and one settlement whose journal entry
 * follows automatically: money to the bank, receivables cleared, courier
 * charges as costs, and any difference with what the bank received to the
 * gain/loss account used for balance differences.
 */
export function postSheet(
  ctx: Ctx,
  args: { date: string; accountId?: string; fileName?: string; rows: SheetRow[]; received?: number },
): { settlementId: string; number: string; posted: number; skipped: number; difference: number } {
  const locked = lockedThrough(ctx.db);
  if (locked && args.date <= locked) {
    throw new AppError("BAD_REQUEST", "That date is in a closed month");
  }
  const account = args.accountId
    ? paymentAccounts(ctx.db).find((a) => a._id === args.accountId && a.type === "asset")
    : accountByKey(ctx.db, "qnb");
  if (!account) throw new AppError("BAD_REQUEST", "Choose the account the money arrived in");
  const checked = checkSheet(ctx, args.rows);
  const ok = checked.filter((r) => r.ok);
  if (!ok.length) throw new AppError("BAD_REQUEST", "No rows are ready to post");

  // Returns first, so the orders' totals and stock are right
  for (const r of ok) {
    if (r.action !== "return" && r.action !== "partial_return") continue;
    const order = ctx.db.select().from(orders).where(eq(orders._id, r.orderId!)).get()!;
    const lines =
      r.action === "return"
        ? orderLines(ctx, order._id)
            .map((l) => ({ lineItemId: l._id, quantity: l.shippedQuantity - l.returnedQuantity, sellable: true }))
            .filter((l) => l.quantity > 0)
        : r.returnLines!.map((l) => ({ ...l, sellable: true }));
    try {
      recordReturn(ctx, order, {
        lines,
        inTransit: true,
        note: `Courier settlement: ${r.statusText}`,
        manualRefundAmount: r.action === "partial_return" && order.hasManualTotal ? r.refund : undefined,
      });
    } catch (e) {
      if (e instanceof AppError) throw new AppError(e.code, `${r.orderNumber}: ${e.message}`);
      throw e;
    }
  }

  const totals = sheetTotals(checked);
  // What the bank actually received, against the statement
  const difference = args.received === undefined ? 0 : round2(args.received - totals.net);
  const saved: CheckedRow[] = [...ok];
  if (Math.abs(difference) >= 0.005) {
    saved.push({
      line: 0,
      shipment: "",
      customer: "",
      statusText: "Difference with the bank",
      kind: null,
      action: null,
      orderId: null,
      orderNumber: null,
      ok: true,
      needsInput: false,
      message: null,
      warning: null,
      receivable: 0,
      due: difference,
      fee: 0,
      refused: 0,
      unidentified: round2(-difference),
    });
  }
  const number = nextCounter(ctx.db, "settlement_counter");
  const row = ctx.db
    .insert(settlements)
    .values({
      number,
      date: args.date,
      accountId: account._id,
      fileName: args.fileName ?? null,
      rows: JSON.stringify(saved),
      netAmount: round2(totals.net + difference),
      createdBy: ctx.user._id,
    })
    .returning({ id: settlements._id })
    .get();
  const paidAt = zonedDayStart(args.date, getTimeZone(ctx.db)).toISOString();
  const money = moneyFormatter(ctx.db);
  for (const r of ok) {
    if (!r.orderId) continue;
    if (r.action === "partial_collect") {
      // Partly collected: the rest closes when the warehouse records the returned pieces
      ctx.db
        .update(orders)
        .set({
          paymentStatus: "paid",
          paidAt,
          paidAmount: r.receivable,
          paymentMethod: "bank_transfer",
          settlementId: row.id,
          returnPending: true,
        })
        .where(eq(orders._id, r.orderId))
        .run();
      addHistory(
        ctx,
        r.orderId,
        "shipped",
        `Partly returned (courier settlement): ${money(r.receivable)} collected; the rest closes when the returned pieces are recorded`,
      );
      continue;
    }
    if (r.action === "return" || r.action === "returned") {
      ctx.db.update(orders).set({ settlementId: row.id }).where(eq(orders._id, r.orderId)).run();
      continue;
    }
    ctx.db
      .update(orders)
      .set({
        paymentStatus: "paid",
        paidAt,
        paidAmount: r.receivable,
        paymentMethod: "bank_transfer",
        settlementId: row.id,
      })
      .where(eq(orders._id, r.orderId))
      .run();
  }
  return { settlementId: row.id, number: settlementNo(number), posted: ok.length, skipped: checked.length - ok.length, difference };
}

/** Undoes a settlement: its orders go back to unpaid and its entry disappears. */
export function removeSettlement(ctx: Ctx, settlementId: string): void {
  const s = ctx.db.select().from(settlements).where(eq(settlements._id, settlementId)).get();
  if (!s) throw new AppError("NOT_FOUND", "Settlement not found");
  const locked = lockedThrough(ctx.db);
  if (locked && s.date <= locked) {
    throw new AppError("BAD_REQUEST", "That date is in a closed month");
  }
  ctx.db
    .update(orders)
    .set({
      paymentStatus: sql`case when ${orders.paymentStatus} = 'paid' and ${orders.status} <> 'returned' then 'unpaid' else ${orders.paymentStatus} end`,
      paidAt: sql`case when ${orders.status} <> 'returned' then null else ${orders.paidAt} end`,
      paidAmount: sql`case when ${orders.status} <> 'returned' then null else ${orders.paidAmount} end`,
      paymentMethod: sql`case when ${orders.status} <> 'returned' then null else ${orders.paymentMethod} end`,
      settlementId: null,
      returnPending: false,
    })
    .where(eq(orders.settlementId, settlementId))
    .run();
  ctx.db.delete(settlements).where(eq(settlements._id, settlementId)).run();
}

export function listSettlements(ctx: Ctx) {
  return ctx.db
    .select()
    .from(settlements)
    .orderBy(desc(settlements.number))
    .all()
    .map((s) => {
      const rows = JSON.parse(s.rows) as CheckedRow[];
      return {
        _id: s._id,
        number: settlementNo(s.number),
        date: s.date,
        fileName: s.fileName,
        netAmount: s.netAmount,
        orders: rows.filter((r) => r.line !== 0).length,
        fees: round2(rows.reduce((t, r) => t + r.fee + r.refused, 0)),
      };
    });
}
