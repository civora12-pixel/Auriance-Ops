import { and, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import {
  accounts,
  closings,
  settlements,
  financialEvents,
  inventoryMovements,
  journalEntries,
  journalLines,
  orders,
  productVariants,
  products,
} from "../db/schema.ts";
import type { Account, Movement, Order } from "../db/schema.ts";
import type { Ctx } from "../rpc/procedure.ts";
import { MONEY_EPSILON, round2 } from "../../shared/constants.ts";
import { addDays, dayOf, zonedDayStart } from "../../shared/dates.ts";
import { nextCounter } from "./counters.ts";
import { getSetting, getTimeZone } from "./settings.ts";

/**
 * Automatic ledger entries mirror the operational records: every shipped
 * order, payment, refund and stock movement dated on or after the ledger start
 * day has exactly one entry. After every change the entries are rebuilt from
 * the records, so editing, undoing or deleting an operation updates the books
 * too. Days before the start are covered by the opening balances.
 */

export const LEDGER_START_KEY = "ledger_start_day";

type Line = { accountId: string; debit: number; credit: number };
type Expected = {
  sourceType: string;
  sourceId: string;
  date: string;
  memo: string;
  lines: Line[];
};

export const formatOrderNo = (n: number) => `ORD-${String(n).padStart(4, "0")}`;
const formatMovementNo = (n: number) => `MV-${String(n).padStart(4, "0")}`;

/** Two-line entry: `amount` debited to one account and credited to the other (swapped if negative). */
function pair(debitTo: string, creditTo: string, amount: number): Line[] {
  const a = round2(amount);
  if (Math.abs(a) < MONEY_EPSILON) return [];
  return a > 0
    ? [
        { accountId: debitTo, debit: a, credit: 0 },
        { accountId: creditTo, debit: 0, credit: a },
      ]
    : [
        { accountId: creditTo, debit: -a, credit: 0 },
        { accountId: debitTo, debit: 0, credit: -a },
      ];
}

export function ledgerStartDay(ctx: Pick<Ctx, "db">): string | undefined {
  return getSetting(ctx.db, LEDGER_START_KEY);
}

/** What the automatic entries should be right now, from the operational records. */
export function expectedEntries(
  ctx: Pick<Ctx, "db">,
  now: Date = new Date(),
): Expected[] {
  const start = ledgerStartDay(ctx);
  if (!start) return [];
  const db = ctx.db;
  const tz = getTimeZone(db);
  const startInstant = zonedDayStart(start, tz).toISOString();
  const keyed = new Map<string, Account>();
  for (const a of db.select().from(accounts).all()) {
    if (a.systemKey) keyed.set(a.systemKey, a);
  }
  const k = (key: string) => keyed.get(key)?._id;
  const need = [
    "accounts_receivable",
    "inventory",
    "returns_in_transit",
    "sales",
    "sales_returns",
    "cogs",
    "count_gain",
    "count_loss",
    "lost_in_transit",
    "damaged_writeoff",
    "qnb",
    "cash",
  ];
  // Someone removed an account the app relies on: post nothing rather than guess
  if (need.some((key) => !k(key))) return [];
  const AR = k("accounts_receivable")!;
  const INV = k("inventory")!;
  const TRANSIT = k("returns_in_transit")!;
  const SALES = k("sales")!;
  const RETURNS = k("sales_returns")!;
  const COGS = k("cogs")!;
  const GAIN = k("count_gain")!;
  const LOSS = k("count_loss")!;
  const LOST = k("lost_in_transit")!;
  const DAMAGED = k("damaged_writeoff")!;
  const QNB = k("qnb")!;
  const CASH = k("cash")!;

  const out: Expected[] = [];
  const day = (iso: string) => dayOf(iso, tz);

  // Names for descriptions
  const productNames = new Map(
    db.select({ id: products._id, name: products.name }).from(products).all().map((p) => [p.id, p.name]),
  );
  const variantNames = new Map(
    db
      .select({ id: productVariants._id, name: productVariants.name })
      .from(productVariants)
      .all()
      .map((v) => [v.id, v.name]),
  );
  const itemName = (m: Pick<Movement, "productId" | "variantId">) => {
    const p = productNames.get(m.productId) ?? "Deleted product";
    const v = m.variantId ? variantNames.get(m.variantId) : undefined;
    return v ? `${p} – ${v}` : p;
  };
  const orderNo = new Map(
    db
      .select({ id: orders._id, n: orders.orderNumber })
      .from(orders)
      .all()
      .map((o) => [o.id, formatOrderNo(o.n)]),
  );

  // ---- Sales: an order is revenue on the day it first shipped
  const shipped = db
    .select()
    .from(orders)
    .where(
      and(
        isNotNull(orders.shippedAt),
        gte(orders.shippedAt, startInstant),
        ne(orders.status, "cancelled"),
      ),
    )
    .all();
  for (const o of shipped) {
    const lines = pair(AR, SALES, o.subtotal - o.discountAmount);
    if (lines.length)
      out.push({
        sourceType: "order_sale",
        sourceId: o._id,
        date: day(o.shippedAt!),
        memo: `${formatOrderNo(o.orderNumber)} · sale to ${o.customer}`,
        lines,
      });
  }

  // ---- Collections: the amount collected goes to the bank (cash payments to Cash)
  const paid = db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.paymentStatus, "paid"),
        isNotNull(orders.paidAt),
        gte(orders.paidAt, startInstant),
        ne(orders.status, "cancelled"),
      ),
    )
    .all();
  for (const o of paid as Order[]) {
    // Paid through a courier sheet: the settlement's entry covers it
    if (o.settlementId) continue;
    // The account chosen when marking it paid (e.g. a custody account); otherwise by method
    const to = (o.paidAccountId && db.select().from(accounts).where(eq(accounts._id, o.paidAccountId)).get()?._id) ||
      (o.paymentMethod === "cash" ? CASH : QNB);
    const lines = pair(to, AR, o.paidAmount ?? o.total);
    if (lines.length)
      out.push({
        sourceType: "order_payment",
        sourceId: o._id,
        date: day(o.paidAt!),
        memo: `${formatOrderNo(o.orderNumber)} · collected from ${o.customer}`,
        lines,
      });
  }

  // ---- Courier settlement sheets: net money in, receivables cleared, courier charges as costs
  const FEES = k("shipping_fees");
  const REFUSED = k("refused_shipping") ?? FEES;
  for (const st of db.select().from(settlements).where(gte(settlements.date, start)).all()) {
    const rows = JSON.parse(st.rows) as {
      receivable: number;
      due: number;
      fee: number;
      refused: number;
      unidentified?: number;
    }[];
    const sum = (pick: (r: (typeof rows)[number]) => number) =>
      round2(rows.reduce((t, r) => t + pick(r), 0));
    const net: Line[] = [];
    const add = (accountId: string | undefined, debitTerms: number) => {
      const n = round2(debitTerms);
      if (!accountId || Math.abs(n) < MONEY_EPSILON) return;
      net.push(n > 0 ? { accountId, debit: n, credit: 0 } : { accountId, debit: 0, credit: -n });
    };
    add(st.accountId, sum((r) => r.due));
    add(FEES, sum((r) => r.fee));
    add(REFUSED, sum((r) => r.refused));
    // What the bank received differs from the statement: same gain/loss account as balance differences
    add(k("unidentified"), sum((r) => r.unidentified ?? 0));
    add(AR, -sum((r) => r.receivable));
    if (net.length >= 2)
      out.push({
        sourceType: "settlement",
        sourceId: st._id,
        date: st.date,
        memo: `Courier settlement CS-${String(st.number).padStart(4, "0")}: ${rows.filter((r) => r.receivable || r.fee || r.refused).length} shipments`,
        lines: net,
      });
  }

  // ---- Refunds and swap price differences
  const events = db
    .select()
    .from(financialEvents)
    .where(gte(financialEvents.date, startInstant))
    .all();
  for (const e of events) {
    const no = orderNo.get(e.orderId) ?? "Order";
    const lines =
      e.type === "refund"
        ? pair(RETURNS, AR, e.amount)
        : e.amount >= 0
          ? pair(AR, SALES, e.amount)
          : e.type === "price_correction"
            ? // Charged too much: the sale itself was smaller (not a return)
              pair(SALES, AR, -e.amount)
            : pair(RETURNS, AR, -e.amount);
    if (lines.length)
      out.push({
        sourceType: "order_event",
        sourceId: e._id,
        date: day(e.date),
        memo:
          e.type === "refund"
            ? `${no} · returned (sale reversed)`
            : e.type === "price_correction"
              ? `${no} · price corrected`
              : `${no} · swap price difference`,
        lines,
      });
  }

  // ---- Stock movements
  const movements = db
    .select()
    .from(inventoryMovements)
    .where(gte(inventoryMovements.date, startInstant))
    .all();
  const restocks = new Map(
    db
      .select({
        id: inventoryMovements._id,
        date: inventoryMovements.date,
      })
      .from(inventoryMovements)
      .where(
        inArray(
          inventoryMovements._id,
          movements.map((m) => m.relatedMovementId).filter((x): x is string => !!x),
        ),
      )
      .all()
      .map((r) => [r.id, r.date]),
  );
  for (const m of movements) {
    const qty = Math.abs(m.quantityChange);
    const value = qty * m.unitCost;
    const ord = m.orderId ? `${orderNo.get(m.orderId) ?? "Order"} · ` : "";
    const what = `${qty} × ${itemName(m)}`;
    let lines: Line[] = [];
    let memo = "";
    switch (m.type) {
      case "shipment":
        lines = pair(COGS, INV, value);
        memo = `${ord}cost of ${what} shipped`;
        break;
      case "swap_out":
        lines = pair(COGS, INV, value);
        memo = `${ord}swap: ${what} sent`;
        break;
      case "swap_in":
        lines = pair(INV, COGS, value);
        memo = `${ord}swap: ${what} back in stock`;
        break;
      case "return":
      case "not_sellable_in":
        lines = pair(INV, COGS, value);
        memo = `${ord}return: ${what} back in stock`;
        break;
      case "return_in_transit":
        lines = pair(TRANSIT, COGS, value);
        memo = `${ord}return on its way: ${what}`;
        break;
      case "transit_received":
        lines = pair(INV, TRANSIT, value);
        memo = `${ord}return received: ${what} back in stock`;
        break;
      case "transit_write_off": {
        const damaged = (m.notes ?? "").toLowerCase().includes("damaged");
        lines = pair(damaged ? DAMAGED : LOST, TRANSIT, value);
        memo = damaged
          ? `${ord}return arrived damaged: ${what} written off`
          : `${ord}return lost in transit: ${what} written off`;
        break;
      }
      case "return_write_off":
        // The sale's cost moves from cost of goods to a loss; the item never reaches stock
        lines = pair(DAMAGED, COGS, value);
        memo = `${ord}returned damaged: ${what} written off`;
        break;
      case "write_off":
        lines = pair(DAMAGED, INV, value);
        memo = `Written off: ${what}`;
        break;
      case "adjustment":
        lines =
          m.quantityChange >= 0
            ? pair(INV, GAIN, value)
            : pair(LOSS, INV, value);
        memo = `Stock ${m.quantityChange >= 0 ? "count gain" : "count loss"}: ${what}${m.reason ? ` (${m.reason})` : ""}`;
        break;
      case "restock": {
        const from =
          m.restockType === "purchase"
            ? (m.paidFromAccountId ?? QNB)
            : GAIN;
        lines = pair(INV, from, qty * m.unitCost);
        memo =
          m.restockType === "purchase"
            ? `Purchase: ${what}${m.supplier ? ` from ${m.supplier}` : ""}`
            : `Stock added: ${what}`;
        break;
      }
      case "cost_correction": {
        if (m.stockValueChange === null && m.purchaseValueChange === null) break;
        const stock = m.stockValueChange ?? 0;
        const purchaseDate = m.relatedMovementId ? restocks.get(m.relatedMovementId) : undefined;
        if (purchaseDate && purchaseDate >= startInstant) {
          // The purchase entry now carries the corrected cost; units already sold left at the old one
          lines = pair(COGS, INV, (m.purchaseValueChange ?? 0) - stock);
        } else {
          lines = pair(INV, GAIN, stock);
        }
        memo = `Cost corrected: ${itemName(m)}`;
        break;
      }
      default:
        break;
    }
    if (lines.length)
      out.push({
        sourceType: "movement",
        sourceId: m._id,
        date: day(m.date),
        memo: `${memo} (${formatMovementNo(m.movementNumber)})`,
        lines,
      });
  }
  // ---- Monthly depreciation of the shelves, posted on each month end that has passed
  const shelves = keyed.get("shelves");
  const accumulated = keyed.get("accumulated_depreciation");
  const depreciation = keyed.get("depreciation");
  const today = dayOf(now, tz);
  if (shelves && accumulated && depreciation) {
    const lifeMonths = Number(getSetting(db, "shelves_life_months") ?? 60);
    const balanceAt = (accountId: string, asOf: string) => {
      const row = db
        .select({
          net: sql<number>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)`,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries._id, journalLines.entryId))
        .where(
          and(
            eq(journalLines.accountId, accountId),
            lte(journalEntries.date, asOf),
            ne(journalEntries.source, "auto"),
          ),
        )
        .get();
      return round2(row?.net ?? 0);
    };
    let month = start.slice(0, 7);
    let used = -balanceAt(accumulated._id, addDays(start, -1));
    for (;;) {
      const end = monthEndOf(month);
      if (end > today) break;
      const cost = balanceAt(shelves._id, end);
      const amount = round2(Math.min(cost / lifeMonths, Math.max(0, cost - used)));
      if (amount >= MONEY_EPSILON) {
        out.push({
          sourceType: "depreciation",
          sourceId: month,
          date: end,
          memo: `Shelves depreciation – ${month}`,
          lines: pair(depreciation._id, accumulated._id, amount),
        });
        used = round2(used + amount);
      }
      month = nextMonth(month);
    }
  }

  return out.filter((e) => e.date >= start);
}

export const monthEndOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
export const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
};

type Net = Map<string, number>;
const netOf = (lines: Line[]): Net => {
  const net: Net = new Map();
  for (const l of lines) net.set(l.accountId, round2((net.get(l.accountId) ?? 0) + l.debit - l.credit));
  return net;
};
const linesOf = (net: Net): Line[] => {
  const out: Line[] = [];
  for (const [accountId, n] of net) {
    if (Math.abs(n) < MONEY_EPSILON) continue;
    out.push(n > 0 ? { accountId, debit: n, credit: 0 } : { accountId, debit: 0, credit: -n });
  }
  // Debits first, like a hand-written entry
  return out.sort((a, b) => b.debit - a.debit);
};
const sameLines = (a: Line[], b: Line[]) =>
  a.length === b.length &&
  a.every(
    (l, i) =>
      l.accountId === b[i].accountId &&
      Math.abs(l.debit - b[i].debit) < MONEY_EPSILON &&
      Math.abs(l.credit - b[i].credit) < MONEY_EPSILON,
  );

/** The last day nothing may change any more (closed months and the opening), if any. */
/**
 * The last day a closing covers: the opening's "as of" day, a month's last day
 * ("2026-10"), or the day itself for a closing on any date ("2026-11-15").
 */
export function periodEndOf(period: string, data?: string): string | undefined {
  if (period === "opening") return data ? (JSON.parse(data) as { asOf?: string }).asOf : undefined;
  return /^\d{4}-\d{2}$/.test(period) ? monthEndOf(period) : period;
}

export function lockedThrough(db: Ctx["db"]): string | undefined {
  const rows = db.select().from(closings).where(eq(closings.status, "locked")).all();
  let last: string | undefined;
  for (const r of rows) {
    const day = periodEndOf(r.period, r.data);
    if (day && (!last || day > last)) last = day;
  }
  return last;
}

const LATE = "late:";
const baseType = (t: string | null) => (t ?? "").replace(/^late:/, "");

/**
 * Brings the automatic entries in line with the records: adds missing ones,
 * updates changed ones (keeping their JV number) and removes ones whose record
 * is gone. Entries in a closed month never change: a later difference is
 * posted as a separate "late" entry on the first open day instead.
 * Runs inside every mutation's transaction.
 */
export function syncLedger(
  ctx: Pick<Ctx, "db"> & { now?: Date },
): { added: number; updated: number; removed: number } {
  const db = ctx.db;
  const now = ctx.now ?? new Date();
  const expected = expectedEntries(ctx, now);
  const locked = lockedThrough(db);
  const firstOpen = locked ? addDays(locked, 1) : undefined;
  const isLocked = (day: string) => !!locked && day <= locked;

  const existing = db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.source, "auto"))
    .all();
  const allLines = existing.length
    ? db
        .select()
        .from(journalLines)
        .where(
          inArray(
            journalLines.entryId,
            existing.map((e) => e._id),
          ),
        )
        .all()
    : [];
  const linesByEntry = new Map<string, Line[]>();
  for (const l of [...allLines].sort((a, b) => a.sort - b.sort)) {
    const list = linesByEntry.get(l.entryId) ?? [];
    list.push({ accountId: l.accountId, debit: l.debit, credit: l.credit });
    linesByEntry.set(l.entryId, list);
  }

  // Group by record: the original entry and any late corrections belong together
  const keyOf = (type: string | null, id: string | null) => `${baseType(type)}:${id}`;
  const groups = new Map<string, { exp?: Expected; have: typeof existing }>();
  for (const e of expected) {
    groups.set(keyOf(e.sourceType, e.sourceId), { exp: e, have: [] });
  }
  for (const e of existing) {
    const key = keyOf(e.sourceType, e.sourceId);
    const g = groups.get(key) ?? { have: [] };
    g.have.push(e);
    groups.set(key, g);
  }

  let added = 0;
  let updated = 0;
  let removed = 0;
  const writeLines = (entryId: string, ls: Line[]) => {
    db.delete(journalLines).where(eq(journalLines.entryId, entryId)).run();
    if (ls.length)
      db.insert(journalLines)
        .values(ls.map((l, i) => ({ entryId, ...l, sort: i })))
        .run();
  };

  for (const { exp, have } of groups.values()) {
    const lockedHave = have.filter((e) => isLocked(e.date));
    const openHave = have.filter((e) => !isLocked(e.date));
    let want: Expected | undefined;
    if (!lockedHave.length) {
      if (exp && !isLocked(exp.date)) want = exp;
      else if (exp) {
        // Dated in a closed month but recorded after closing
        want = {
          ...exp,
          sourceType: LATE + exp.sourceType,
          date: firstOpen!,
          memo: `${exp.memo} – dated ${exp.date}, after closing`,
        };
      }
    } else {
      const net = netOf(exp?.lines ?? []);
      for (const e of lockedHave)
        for (const [acc, n] of netOf(linesByEntry.get(e._id) ?? []))
          net.set(acc, round2((net.get(acc) ?? 0) - n));
      const lines = linesOf(net);
      if (lines.length) {
        const sample = exp ?? lockedHave[0];
        want = {
          sourceType: LATE + baseType(sample.sourceType),
          sourceId: sample.sourceId!,
          date: exp && !isLocked(exp.date) ? exp.date : firstOpen!,
          memo: `Correction after closing: ${exp?.memo ?? lockedHave[0].memo}`,
          lines,
        };
      }
    }

    const [keep, ...extra] = openHave;
    for (const e of extra) {
      db.delete(journalEntries).where(eq(journalEntries._id, e._id)).run();
      removed++;
    }
    if (!want) {
      if (keep) {
        db.delete(journalEntries).where(eq(journalEntries._id, keep._id)).run();
        removed++;
      }
      continue;
    }
    if (!keep) {
      const row = db
        .insert(journalEntries)
        .values({
          number: nextCounter(db, "journal_counter"),
          date: want.date,
          memo: want.memo,
          source: "auto",
          sourceType: want.sourceType,
          sourceId: want.sourceId,
          createdBy: null,
        })
        .returning({ id: journalEntries._id })
        .get();
      writeLines(row.id, want.lines);
      added++;
      continue;
    }
    const haveLines = linesByEntry.get(keep._id) ?? [];
    const linesChanged = !sameLines(haveLines, want.lines);
    if (
      keep.date !== want.date ||
      keep.memo !== want.memo ||
      keep.sourceType !== want.sourceType ||
      linesChanged
    ) {
      db.update(journalEntries)
        .set({
          date: want.date,
          memo: want.memo,
          sourceType: want.sourceType,
          updatedAt: now.getTime(),
        })
        .where(eq(journalEntries._id, keep._id))
        .run();
      if (linesChanged) writeLines(keep._id, want.lines);
      updated++;
    }
  }
  return { added, updated, removed };
}
