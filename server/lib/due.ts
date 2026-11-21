import { and, asc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { accounts, journalEntries, journalLines, orders, remindersSent } from "../db/schema.ts";
import { formatOrderNumber, round2 } from "../../shared/constants.ts";
import { RECEIVABLE_DAYS, addDays, creditCardDueDay, dayOf, todayIn } from "../../shared/dates.ts";
import { notify } from "./notifications.ts";
import { getTimeZone, moneyFormatter } from "./settings.ts";

/** Orders still collectable from the courier (shipped, not paid, not fully returned). */
const COLLECTABLE = ["shipped", "partially_returned", "swapped"] as const;

export type ReceivableOrder = {
  orderId: string;
  orderNumber: string;
  customer: string;
  shippedDay: string;
  dueDay: string;
  amount: number;
  daysLate: number;
};

/** Shipped, unpaid orders, each due two weeks after shipping. */
export function receivablesDue(db: DB, today: string) {
  const tz = getTimeZone(db);
  const rows = db
    .select()
    .from(orders)
    .where(
      and(
        isNotNull(orders.shippedAt),
        ne(orders.paymentStatus, "paid"),
        inArray(orders.status, [...COLLECTABLE]),
      ),
    )
    .orderBy(asc(orders.shippedAt))
    .all();
  const list: ReceivableOrder[] = rows.map((o) => {
    const shippedDay = dayOf(o.shippedAt!, tz);
    const dueDay = addDays(shippedDay, RECEIVABLE_DAYS);
    const late = Math.round((Date.parse(today) - Date.parse(dueDay)) / 86_400_000);
    return {
      orderId: o._id,
      orderNumber: formatOrderNumber(o.orderNumber),
      customer: o.customer,
      shippedDay,
      dueDay,
      amount: round2(o.total),
      daysLate: Math.max(0, late),
    };
  });
  const sum = (l: ReceivableOrder[]) => round2(l.reduce((s, o) => s + o.amount, 0));
  const overdue = list.filter((o) => o.dueDay < today);
  const dueSoon = list.filter((o) => o.dueDay >= today && o.dueDay <= addDays(today, 1));
  const notDue = list.filter((o) => o.dueDay > addDays(today, 1));
  return {
    count: list.length,
    total: sum(list),
    notDue: { count: notDue.length, amount: sum(notDue) },
    dueSoon: { count: dueSoon.length, amount: sum(dueSoon) },
    overdue: { count: overdue.length, amount: sum(overdue), orders: overdue.slice(0, 50) },
  };
}

/**
 * What's still owed on the credit card, by due date. Payments clear the oldest
 * charges first. Charges in entries that carry their own due date are left to
 * the custom list.
 */
export function creditCardDue(db: DB): { dueDay: string; amount: number }[] {
  const card = db.select().from(accounts).where(eq(accounts.systemKey, "credit_card")).get();
  if (!card) return [];
  const lines = db
    .select({ date: journalEntries.date, dueDay: journalEntries.dueDay, debit: journalLines.debit, credit: journalLines.credit })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries._id, journalLines.entryId))
    .where(eq(journalLines.accountId, card._id))
    .orderBy(asc(journalEntries.date), asc(journalEntries.number))
    .all();
  const charges: { dueDay: string; left: number }[] = [];
  let paid = 0;
  for (const l of lines) {
    if (l.credit > 0 && !l.dueDay) charges.push({ dueDay: creditCardDueDay(l.date), left: l.credit });
    if (l.debit > 0) paid += l.debit;
  }
  for (const c of charges) {
    const take = Math.min(c.left, paid);
    c.left -= take;
    paid -= take;
  }
  const byDay = new Map<string, number>();
  for (const c of charges) if (c.left >= 0.005) byDay.set(c.dueDay, (byDay.get(c.dueDay) ?? 0) + c.left);
  return [...byDay]
    .map(([dueDay, amount]) => ({ dueDay, amount: round2(amount) }))
    .sort((a, b) => a.dueDay.localeCompare(b.dueDay));
}

/** Manual entries given a due date and not marked settled yet: what they put on payable accounts. */
export function customPayables(db: DB) {
  const entries = db
    .select()
    .from(journalEntries)
    .where(and(isNotNull(journalEntries.dueDay), isNull(journalEntries.settledAt)))
    .orderBy(asc(journalEntries.dueDay))
    .all();
  if (!entries.length) return [];
  const liability = new Set(
    db
      .select({ id: accounts._id })
      .from(accounts)
      .where(eq(accounts.type, "liability"))
      .all()
      .map((a) => a.id),
  );
  const lines = db
    .select()
    .from(journalLines)
    .where(
      inArray(
        journalLines.entryId,
        entries.map((e) => e._id),
      ),
    )
    .all();
  return entries.map((e) => {
    const own = lines.filter((l) => l.entryId === e._id);
    const owed = own.filter((l) => liability.has(l.accountId)).reduce((s, l) => s + l.credit, 0);
    const total = own.reduce((s, l) => s + l.debit, 0);
    return {
      entryId: e._id,
      number: `JV-${String(e.number).padStart(4, "0")}`,
      date: e.date,
      memo: e.memo,
      dueDay: e.dueDay!,
      // What it put on payable accounts; the entry total when it touched none
      amount: round2(owed > 0 ? owed : total),
    };
  });
}

/** Everything due, for the Overview. */
export function dueSummary(db: DB, today: string) {
  return {
    today,
    receivables: receivablesDue(db, today),
    creditCard: creditCardDue(db),
    payables: customPayables(db),
  };
}

function once(db: DB, key: string): boolean {
  const done = db.select().from(remindersSent).where(eq(remindersSent.key, key)).get();
  if (done) return false;
  db.insert(remindersSent).values({ key }).run();
  return true;
}

/**
 * One day before something is due, tells everyone with finance access:
 * credit card payments, payables with a due date, and orders reaching two
 * weeks unpaid. Safe to run often: each reminder goes out once.
 */
export function sendDueReminders(db: DB, now = new Date()): number {
  const today = todayIn(getTimeZone(db), now);
  const tomorrow = addDays(today, 1);
  const money = moneyFormatter(db);
  let sent = 0;
  const send = (key: string, title: string, body: string, link: string) => {
    if (!once(db, key)) return;
    notify(db, "finance", { type: "payment_due", title, body, link });
    sent++;
  };
  // Due tomorrow, or today if the reminder couldn't go out yesterday
  const soon = (day: string) => day === tomorrow || day === today;

  for (const c of creditCardDue(db)) {
    if (!soon(c.dueDay)) continue;
    send(
      `card:${c.dueDay}`,
      `Credit card payment due ${c.dueDay}`,
      money(c.amount),
      "/finance",
    );
  }
  for (const p of customPayables(db)) {
    if (!soon(p.dueDay)) continue;
    send(`payable:${p.entryId}:${p.dueDay}`, `Payment due ${p.dueDay}`, `${p.memo} · ${money(p.amount)}`, "/finance");
  }
  const due = receivablesDueOn(db, tomorrow);
  if (due.count) {
    send(
      `collect:${tomorrow}`,
      `Courier collection due ${tomorrow}: ${due.count} orders`,
      money(due.amount),
      "/finance",
    );
  }
  return sent;
}

/** Unpaid orders whose two weeks end on `day`. */
function receivablesDueOn(db: DB, day: string) {
  const tz = getTimeZone(db);
  const list = db
    .select({ total: orders.total, shippedAt: orders.shippedAt })
    .from(orders)
    .where(and(isNotNull(orders.shippedAt), ne(orders.paymentStatus, "paid"), inArray(orders.status, [...COLLECTABLE])))
    .all()
    .filter((o) => addDays(dayOf(o.shippedAt!, tz), RECEIVABLE_DAYS) === day);
  return { count: list.length, amount: round2(list.reduce((s, o) => s + o.total, 0)) };
}
