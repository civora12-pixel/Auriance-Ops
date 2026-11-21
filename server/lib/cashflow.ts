import { and, inArray, isNotNull, ne } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { accounts, orders } from "../db/schema.ts";
import { formatOrderNumber, round2 } from "../../shared/constants.ts";
import { RECEIVABLE_DAYS, addDays, dayOf } from "../../shared/dates.ts";
import { creditCardDue, customPayables } from "./due.ts";
import { accountTotals, naturalBalance } from "./ledger.ts";
import { getTimeZone } from "./settings.ts";

export type FlowItem = {
  day: string;
  kind: "collection" | "expected_collection" | "card" | "payable";
  label: string;
  amount: number;
  /** An order or journal entry to open */
  orderId?: string;
  entryId?: string;
};

export type Recommendation = { key: string; vars: Record<string, string | number> };

/** Shipped (or still to ship) orders the courier will pay for. */
const COLLECTABLE = ["shipped", "partially_returned", "swapped"] as const;
const OPEN = ["new", "on_hold"] as const;

/**
 * Money in and out by due date, from today: courier collections (two weeks
 * after shipping; orders not shipped yet two weeks from today or their order
 * day), the credit card on its due dates and payables given a due date. Paid
 * and settled amounts drop out as they're recorded, so this is always live.
 */
export function cashFlow(db: DB, today: string, weeks: number) {
  const tz = getTimeZone(db);
  const totals = accountTotals(db);
  const chart = db.select().from(accounts).all();
  const balance = (a: (typeof chart)[number]) => naturalBalance(a, totals.get(a._id));

  // Money on hand: cash, custody, bank and wallet accounts
  const cashAccounts = chart
    .filter(
      (a) =>
        a.type === "asset" &&
        a.code >= 10000 &&
        a.code < 15000 &&
        a.systemKey !== "accounts_receivable" &&
        !a.isAuto,
    )
    .map((a) => ({ code: a.code, name: a.name, balance: balance(a) }))
    .filter((a) => Math.abs(a.balance) >= 0.005 || a.code === 14001);
  const startCash = round2(cashAccounts.reduce((s, a) => s + a.balance, 0));

  const items: FlowItem[] = [];

  // Courier collections for shipped, unpaid orders
  const shipped = db
    .select()
    .from(orders)
    .where(and(isNotNull(orders.shippedAt), ne(orders.paymentStatus, "paid"), inArray(orders.status, [...COLLECTABLE])))
    .all();
  let tracked = 0;
  for (const o of shipped) {
    tracked += o.total;
    items.push({
      day: addDays(dayOf(o.shippedAt!, tz), RECEIVABLE_DAYS),
      kind: "collection",
      label: `${formatOrderNumber(o.orderNumber)} · ${o.customer}`,
      amount: round2(o.total),
      orderId: o._id,
    });
  }
  // Orders not shipped yet: collected about two weeks after they go out
  const open = db.select().from(orders).where(inArray(orders.status, [...OPEN])).all();
  for (const o of open) {
    const from = o.orderDate > today ? o.orderDate : today;
    items.push({
      day: addDays(from, RECEIVABLE_DAYS),
      kind: "expected_collection",
      label: `${formatOrderNumber(o.orderNumber)} · ${o.customer}`,
      amount: round2(o.total),
      orderId: o._id,
    });
  }
  for (const c of creditCardDue(db)) {
    items.push({ day: c.dueDay, kind: "card", label: "Credit card", amount: -c.amount });
  }
  const dated = customPayables(db);
  for (const p of dated) {
    items.push({ day: p.dueDay, kind: "payable", label: `${p.number} · ${p.memo}`, amount: -p.amount, entryId: p.entryId });
  }

  // Owed with no due date (not in the timeline): every payable account except the card,
  // less what's already listed with a due date
  const datedTotal = dated.reduce((s, p) => s + p.amount, 0);
  const undated = chart
    .filter((a) => a.type === "liability" && a.systemKey !== "credit_card")
    .map((a) => ({ code: a.code, name: a.name, balance: balance(a) }))
    .filter((a) => a.balance >= 0.005);
  const ap = undated.find((a) => a.code === 20001);
  if (ap) ap.balance = round2(Math.max(0, ap.balance - datedTotal));
  const owedUndated = undated.filter((a) => a.balance >= 0.005);

  // Courier money the app has no order for (from before the app)
  const arAccount = chart.find((a) => a.systemKey === "accounts_receivable");
  const arBalance = arAccount ? balance(arAccount) : 0;
  const untracked = round2(Math.max(0, arBalance - tracked));

  // Weekly buckets; anything already due lands in the first
  const horizonEnd = addDays(today, weeks * 7 - 1);
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const from = addDays(today, i * 7);
    return { from, to: addDays(from, 6), inflow: 0, outflow: 0, net: 0, closing: 0, items: [] as (FlowItem & { overdue: boolean })[] };
  });
  for (const item of items.sort((a, b) => a.day.localeCompare(b.day) || b.amount - a.amount)) {
    if (item.day > horizonEnd) continue;
    const index = item.day < today ? 0 : Math.floor((Date.parse(item.day) - Date.parse(today)) / (7 * 86_400_000));
    const b = buckets[index];
    b.items.push({ ...item, overdue: item.day < today });
    if (item.amount >= 0) b.inflow += item.amount;
    else b.outflow -= item.amount;
  }
  let running = startCash;
  for (const b of buckets) {
    b.inflow = round2(b.inflow);
    b.outflow = round2(b.outflow);
    b.net = round2(b.inflow - b.outflow);
    running = round2(running + b.net);
    b.closing = running;
  }
  const later = items.filter((i) => i.day > horizonEnd);

  const overdue = items.filter((i) => i.day < today && i.kind === "collection");
  const overdueAmount = round2(overdue.reduce((s, i) => s + i.amount, 0));
  const lowest = buckets.reduce((min, b) => (b.closing < min.closing ? b : min), buckets[0]);
  const gaps = buckets.filter((b) => b.closing < 0).map((b) => ({ from: b.from, to: b.to, shortBy: round2(-b.closing) }));
  const expectedShare = round2(
    items.filter((i) => i.kind === "expected_collection" && i.day <= horizonEnd).reduce((s, i) => s + i.amount, 0),
  );

  // Simple suggestions from the numbers; the decisions stay yours
  const tips: Recommendation[] = [];
  if (gaps.length) {
    const first = gaps[0];
    tips.push({ key: "gap", vars: { from: first.from, to: first.to, short: first.shortBy } });
  }
  if (overdueAmount > 0) tips.push({ key: "overdue", vars: { amount: overdueAmount, n: overdue.length } });
  const nextOut = items
    .filter((i) => i.amount < 0 && i.day >= today && i.day <= addDays(today, 7))
    .sort((a, b) => a.day.localeCompare(b.day))[0];
  if (nextOut) {
    tips.push({
      key: buckets[0].closing >= 0 ? "pay_ok" : "pay_short",
      vars: { amount: -nextOut.amount, day: nextOut.day, label: nextOut.kind === "card" ? "card" : nextOut.label },
    });
  }
  if (expectedShare > 0) tips.push({ key: "unshipped", vars: { amount: expectedShare } });
  const undatedTotal = round2(owedUndated.reduce((s, a) => s + a.balance, 0));
  if (undatedTotal > 0) {
    tips.push({
      key: lowest.closing - undatedTotal >= 0 ? "undated_ok" : "undated_wait",
      vars: { amount: undatedTotal },
    });
  }
  if (!gaps.length && !overdueAmount) tips.push({ key: "healthy", vars: { lowest: lowest.closing, day: lowest.to } });

  return {
    today,
    weeks,
    startCash,
    cashAccounts,
    buckets,
    totals: {
      inflow: round2(buckets.reduce((s, b) => s + b.inflow, 0)),
      outflow: round2(buckets.reduce((s, b) => s + b.outflow, 0)),
      endCash: buckets[buckets.length - 1]?.closing ?? startCash,
      lowest: { amount: lowest.closing, from: lowest.from, to: lowest.to },
      overdue: overdueAmount,
    },
    gaps,
    later: {
      inflow: round2(later.filter((i) => i.amount > 0).reduce((s, i) => s + i.amount, 0)),
      outflow: round2(-later.filter((i) => i.amount < 0).reduce((s, i) => s + i.amount, 0)),
    },
    untrackedCourierMoney: untracked,
    owedUndated,
    tips,
  };
}
