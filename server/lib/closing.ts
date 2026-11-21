import { and, eq, gte, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import {
  accounts,
  closings,
  inventory,
  journalEntries,
  journalLines,
  orders,
} from "../db/schema.ts";
import type { Account } from "../db/schema.ts";
import { AppError } from "../rpc/procedure.ts";
import type { Ctx } from "../rpc/procedure.ts";
import { DEBIT_NORMAL, MONEY_EPSILON, round2 } from "../../shared/constants.ts";
import { addDays } from "../../shared/dates.ts";
import { nextCounter } from "./counters.ts";
import { accountTotals, naturalBalance } from "./ledger.ts";
import {
  LEDGER_START_KEY,
  ledgerStartDay,
  lockedThrough,
  monthEndOf,
  nextMonth,
  periodEndOf,
  syncLedger,
} from "./ledger-sync.ts";
import { getSetting, setSetting } from "./settings.ts";
import { businessToday } from "./time.ts";

// ---------------------------------------------------------------- Drafts

export type OpeningDraft = {
  asOf: string;
  /** Natural balances by account code (accumulated depreciation is negative) */
  balances: Record<string, number | null>;
  /** Partners' contributed capital by account code */
  capitals: Record<string, number | null>;
  /** Courier money for orders shipped before the app */
  extraReceivable: number;
  /** How the difference (the result of the months not tracked) is shared */
  resultMode: "split" | "normal";
};

export type Explanation = { code: number; amount: number };
export type MonthDraft = {
  /** Actual balances typed at closing, by account code (blank = same as the books) */
  balances: Record<string, number | null>;
  /** Where each difference went, by account code; the rest is "Unidentified" */
  explanations: Record<string, Explanation[]>;
  /** Working partners' compensation, % of the full profit each */
  compensationOsamaPct: number;
  compensationHazarPct: number;
  /** No longer used: charity is owed (Charity payable) until it's paid. Kept so older drafts still read. */
  charityFromCode?: number;
  /**
   * What each partner takes out of this closing's profit, by capital account
   * code (the rest stays in as capital). Owed in Partners payable until paid.
   */
  withdrawals?: Record<string, number | null>;
};

export const CHARITY_PCT = 3;
/** Working partners' compensation: 15% of the profit in total, 10% to Hazar and 5% to Osama. */
export const DEFAULT_COMPENSATION = { osama: 5, hazar: 10 };
export type CompensationRates = { osama: number; hazar: number };

/** The rates last used at a closing, or the defaults. */
export function compensationRates(db: DB): CompensationRates {
  const num = (key: string, fallback: number) => {
    const n = Number(getSetting(db, key));
    return getSetting(db, key) !== undefined && Number.isFinite(n) ? n : fallback;
  };
  return {
    osama: num("compensation_osama_pct", DEFAULT_COMPENSATION.osama),
    hazar: num("compensation_hazar_pct", DEFAULT_COMPENSATION.hazar),
  };
}

type Line = {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string | null;
  /** Partners payable: the partner it's owed to (their capital account) */
  partnerAccountId?: string | null;
};

const isMonth = (p: string) => /^\d{4}-\d{2}$/.test(p);
const isDay = (p: string) => /^\d{4}-\d{2}-\d{2}$/.test(p) && new Date(`${p}T00:00:00Z`).toISOString().slice(0, 10) === p;
/** A closing period: a whole month ("2026-10") or up to a chosen day ("2026-11-15"). */
export const isPeriod = (p: string) => isMonth(p) || isDay(p);

/**
 * The days a closing covers: from the day after the previous closing (never
 * before the 1st of its month) to its last day.
 */
export function periodRange(db: DB, period: string): { start: string; end: string } {
  if (!isPeriod(period)) throw new AppError("BAD_REQUEST", "Choose a month or a day");
  const end = periodEndOf(period)!;
  const monthStart = `${end.slice(0, 7)}-01`;
  let prev: string | undefined;
  for (const r of db.select().from(closings).where(eq(closings.status, "locked")).all()) {
    if (r.period === period) continue;
    const e = periodEndOf(r.period, r.data);
    if (e && e < end && (!prev || e > prev)) prev = e;
  }
  const after = prev ? addDays(prev, 1) : monthStart;
  return { start: after > monthStart ? after : monthStart, end };
}

export function readClosing<T>(db: DB, period: string): { status: "draft" | "locked"; data: T } | undefined {
  const row = db.select().from(closings).where(eq(closings.period, period)).get();
  return row ? { status: row.status, data: JSON.parse(row.data) as T } : undefined;
}

export function writeDraft(db: DB, period: string, data: unknown, now: Date): void {
  const existing = db.select().from(closings).where(eq(closings.period, period)).get();
  if (existing?.status === "locked") {
    throw new AppError("BAD_REQUEST", "This period is closed. Reopen it to make changes.");
  }
  const json = JSON.stringify(data);
  if (existing) {
    db.update(closings)
      .set({ data: json, updatedAt: now.getTime() })
      .where(eq(closings.period, period))
      .run();
  } else {
    db.insert(closings)
      .values({ period, status: "draft", data: json, updatedAt: now.getTime() })
      .run();
  }
}

// ---------------------------------------------------------------- Accounts

type Chart = {
  all: Account[];
  byCode: Map<number, Account>;
  byKey: Map<string, Account>;
  capitals: Account[];
};

export function loadChart(db: DB): Chart {
  const all = db.select().from(accounts).all().sort((a, b) => a.code - b.code);
  const byKey = new Map<string, Account>();
  for (const a of all) if (a.systemKey) byKey.set(a.systemKey, a);
  return {
    all,
    byCode: new Map(all.map((a) => [a.code, a])),
    byKey,
    capitals: all.filter((a) => a.type === "equity" && a.group === "Partners' capital"),
  };
}

function mustKey(chart: Chart, key: string): Account {
  const a = chart.byKey.get(key);
  if (!a) throw new AppError("BAD_REQUEST", "An account the app needs is missing from the chart");
  return a;
}

/** Balance-sheet accounts you keep yourself (typed at closing). */
export const keptAccounts = (chart: Chart) =>
  chart.all.filter(
    (a) =>
      a.isActive &&
      !a.isAuto &&
      (a.type === "asset" || a.type === "liability"),
  );

/** Debit-terms change for a natural-balance change. */
const toDebit = (a: Pick<Account, "type">, natural: number) =>
  DEBIT_NORMAL[a.type] ? natural : -natural;

function line(accountId: string, debitTerms: number, memo?: string): Line | undefined {
  const n = round2(debitTerms);
  if (Math.abs(n) < MONEY_EPSILON) return undefined;
  return n > 0
    ? { accountId, debit: n, credit: 0, memo }
    : { accountId, debit: 0, credit: -n, memo };
}

const compact = (lines: (Line | undefined)[]) => lines.filter((l): l is Line => !!l);

/** Splits `amount` by weights to the cent; the rounding remainder goes to the biggest share. */
export function splitByShares(amount: number, weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  const shares =
    total > 0
      ? weights.map((w) => Math.max(0, w) / total)
      : weights.map(() => 1 / weights.length);
  const parts = shares.map((s) => round2(amount * s));
  const diff = round2(amount - parts.reduce((s, p) => s + p, 0));
  if (Math.abs(diff) >= MONEY_EPSILON) {
    const biggest = shares.indexOf(Math.max(...shares));
    parts[biggest] = round2(parts[biggest] + diff);
  }
  return parts;
}

function insertEntry(
  ctx: Ctx,
  e: { date: string; memo: string; source: "opening" | "closing"; sourceType: string; sourceId: string; lines: Line[] },
): void {
  if (e.lines.length < 2) return;
  const debits = round2(e.lines.reduce((s, l) => s + l.debit, 0));
  const credits = round2(e.lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(debits - credits) >= MONEY_EPSILON) {
    throw new AppError("INTERNAL", `Closing entry "${e.memo}" doesn't balance`);
  }
  const row = ctx.db
    .insert(journalEntries)
    .values({
      number: nextCounter(ctx.db, "journal_counter"),
      date: e.date,
      memo: e.memo,
      source: e.source,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      createdBy: ctx.user._id,
    })
    .returning({ id: journalEntries._id })
    .get();
  ctx.db
    .insert(journalLines)
    .values(e.lines.map((l, i) => ({ entryId: row.id, ...l, memo: l.memo ?? null, partnerAccountId: l.partnerAccountId ?? null, sort: i })))
    .run();
}

// ---------------------------------------------------------------- Partners

export type PartnerShare = {
  accountId: string;
  code: number;
  name: string;
  capital: number;
  sharePct: number;
};

/**
 * Each partner's share of a period: their capital weighted by the days they
 * held it (capital at the end of each day, added up over the period). Money
 * taken out mid-period stops earning from that day; money put in earns from
 * the day it arrives; an emptied account earns nothing. The period's own
 * closing entries don't count. `capital` is the average over the period.
 * Inactive accounts that held nothing in the period are left out.
 */
export function partnerShares(db: DB, chart: Chart, start: string, end: string): PartnerShare[] {
  const opening = accountTotals(db, addDays(start, -1));
  const ids = chart.capitals.map((a) => a._id);
  // Capital movements in the period, by day (credit adds capital)
  const moves = ids.length
    ? db
        .select({
          accountId: journalLines.accountId,
          date: journalEntries.date,
          net: sql<number>`coalesce(sum(${journalLines.credit} - ${journalLines.debit}), 0)`,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries._id, journalLines.entryId))
        .where(
          and(
            inArray(journalLines.accountId, ids),
            gte(journalEntries.date, start),
            lte(journalEntries.date, end),
            // This period's closing (profit to the partners) isn't capital they held during it
            or(isNull(journalEntries.sourceType), notInArray(journalEntries.sourceType, ["closing_pnl", "closing_share", "closing_withdrawal"])),
          ),
        )
        .groupBy(journalLines.accountId, journalEntries.date)
        .all()
    : [];
  const byDay = new Map<string, Map<string, number>>();
  for (const m of moves) {
    const d = byDay.get(m.accountId) ?? new Map<string, number>();
    d.set(m.date, m.net);
    byDay.set(m.accountId, d);
  }
  let days = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) days++;
  const caps = chart.capitals
    .map((a) => {
      let balance = naturalBalance(a, opening.get(a._id));
      let weight = 0;
      const changes = byDay.get(a._id);
      for (let d = start; d <= end; d = addDays(d, 1)) {
        balance += changes?.get(d) ?? 0;
        weight += Math.max(0, balance);
      }
      return { account: a, capital: days ? weight / days : 0 };
    })
    .filter((c) => c.account.isActive || c.capital >= MONEY_EPSILON);
  return sharesOf(caps);
}

function sharesOf(caps: { account: Account; capital: number }[]): PartnerShare[] {
  const total = caps.reduce((s, c) => s + Math.max(0, c.capital), 0);
  return caps.map((c) => ({
    accountId: c.account._id,
    code: c.account.code,
    name: c.account.name.replace(/^Capital – /, ""),
    capital: round2(c.capital),
    sharePct: total > 0 ? (Math.max(0, c.capital) / total) * 100 : 100 / caps.length,
  }));
}

export type Allocation = {
  result: number;
  charity: number;
  compensation: number;
  compensationOsama: number;
  compensationHazar: number;
  toPartners: number;
  partners: (PartnerShare & { amount: number })[];
};

/** Profit: 3% charity and the working partners' compensation first (both on the full profit), the rest by share. Loss: all by share. */
export function allocate(
  result: number,
  shares: PartnerShare[],
  rates: CompensationRates,
  applyDeductions = true,
): Allocation {
  const profit = result > 0 && applyDeductions;
  const charity = profit ? round2((result * CHARITY_PCT) / 100) : 0;
  const compensationOsama = profit ? round2((result * rates.osama) / 100) : 0;
  const compensationHazar = profit ? round2((result * rates.hazar) / 100) : 0;
  const compensation = round2(compensationOsama + compensationHazar);
  const toPartners = round2(result - charity - compensation);
  const parts = splitByShares(
    toPartners,
    shares.map((s) => s.sharePct),
  );
  return {
    result: round2(result),
    charity,
    compensation,
    compensationOsama,
    compensationHazar,
    toPartners,
    partners: shares.map((s, i) => ({ ...s, amount: parts[i] })),
  };
}

function allocationLines(chart: Chart, alloc: Allocation): { memo: string; lines: Line[] }[] {
  const summary = mustKey(chart, "income_summary");
  const out: { memo: string; lines: Line[] }[] = [];
  if (alloc.charity > 0) {
    // Owed until it's paid out (a journal entry from Charity payable to the bank)
    const charity = mustKey(chart, "charity_payable");
    out.push({
      memo: `Charity ${CHARITY_PCT}% of profit (owed until paid)`,
      lines: compact([line(summary._id, alloc.charity), line(charity._id, -alloc.charity)]),
    });
  }
  if (alloc.compensation > 0) {
    const osama = mustKey(chart, "compensation_osama");
    const hazar = mustKey(chart, "compensation_hazar");
    out.push({
      memo: "Working partners' compensation (owed to Hazar and Osama)",
      lines: compact([
        line(summary._id, alloc.compensation),
        line(osama._id, -alloc.compensationOsama),
        line(hazar._id, -alloc.compensationHazar),
      ]),
    });
  }
  if (Math.abs(alloc.toPartners) >= MONEY_EPSILON) {
    out.push({
      memo: alloc.toPartners > 0 ? "Profit shared by capital" : "Loss shared by capital",
      lines: compact([
        line(summary._id, alloc.toPartners),
        ...alloc.partners.map((p) => line(p.accountId, -p.amount)),
      ]),
    });
  }
  return out;
}

// ---------------------------------------------------------------- Opening

/** Stock value, returns on the way and courier money the app knows of, as of the day before the ledger starts. */
function appOpeningFigures(db: DB, chart: Chart, extraReceivable: number) {
  const stock = db
    .select({
      value: sql<number>`coalesce(sum(${inventory.onHand} * ${inventory.avgCost}), 0)`,
      transit: sql<number>`coalesce(sum(${inventory.inTransit} * ${inventory.inTransitCost}), 0)`,
    })
    .from(inventory)
    .get();
  const receivable =
    db
      .select({ total: sql<number>`coalesce(sum(${orders.total}), 0)` })
      .from(orders)
      .where(
        and(
          isNotNull(orders.shippedAt),
          ne(orders.paymentStatus, "paid"),
          ne(orders.status, "cancelled"),
        ),
      )
      .get()?.total ?? 0;
  // Today's figures minus what the automatic entries have posted since the start
  const totals = accountTotals(db);
  const posted = (key: string) => {
    const a = mustKey(chart, key);
    return naturalBalance(a, totals.get(a._id));
  };
  return {
    inventory: round2((stock?.value ?? 0) - posted("inventory")),
    transit: round2((stock?.transit ?? 0) - posted("returns_in_transit")),
    receivable: round2(receivable - posted("accounts_receivable") + (extraReceivable || 0)),
  };
}

export function openingPreview(db: DB, draft: OpeningDraft) {
  const chart = loadChart(db);
  const app = appOpeningFigures(db, chart, draft.extraReceivable);
  const rows: { account: Account; balance: number; fromApp: boolean }[] = [];
  const autoValue: Record<string, number> = {
    inventory: app.inventory,
    returns_in_transit: app.transit,
    accounts_receivable: app.receivable,
  };
  for (const a of chart.all) {
    if (!a.isActive && !draft.balances[a.code]) continue;
    if (a.type !== "asset" && a.type !== "liability") continue;
    if (a.systemKey && a.systemKey in autoValue) {
      rows.push({ account: a, balance: autoValue[a.systemKey], fromApp: true });
    } else {
      rows.push({ account: a, balance: round2(Number(draft.balances[a.code] ?? 0)), fromApp: false });
    }
  }
  const assets = round2(rows.filter((r) => r.account.type === "asset").reduce((s, r) => s + r.balance, 0));
  const liabilities = round2(rows.filter((r) => r.account.type === "liability").reduce((s, r) => s + r.balance, 0));
  const caps = chart.capitals.map((a) => ({ account: a, capital: round2(Number(draft.capitals[a.code] ?? 0)) }));
  const capital = round2(caps.reduce((s, c) => s + c.capital, 0));
  const difference = round2(assets - liabilities - capital);
  const shares = sharesOf(caps);
  const alloc = allocate(
    difference,
    shares,
    compensationRates(db),
    draft.resultMode === "normal",
  );
  const missing = rows.filter((r) => !r.fromApp && draft.balances[r.account.code] == null).map((r) => r.account.code);
  return { asOf: draft.asOf, rows, assets, liabilities, capital, difference, shares, allocation: alloc, missing };
}

export function postOpening(ctx: Ctx, draft: OpeningDraft): void {
  if (readClosing(ctx.db, "opening")?.status === "locked") {
    throw new AppError("BAD_REQUEST", "The opening balances are already posted");
  }
  const preview = openingPreview(ctx.db, draft);
  if (preview.missing.length) {
    throw new AppError("BAD_REQUEST", `Enter a balance for every account (missing: ${preview.missing.join(", ")})`);
  }
  const chart = loadChart(ctx.db);
  const lines = compact([
    ...preview.rows.map((r) => line(r.account._id, toDebit(r.account, r.balance))),
    ...chart.capitals.map((a) => line(a._id, -Number(draft.capitals[a.code] ?? 0))),
  ]);
  const summary = mustKey(chart, "income_summary");
  // Whatever doesn't fit is the result of the months that weren't tracked
  const diffLine = line(summary._id, -preview.difference);
  if (diffLine) lines.push(diffLine);
  insertEntry(ctx, {
    date: draft.asOf,
    memo: `Opening balances as of ${draft.asOf}`,
    source: "opening",
    sourceType: "opening",
    sourceId: "opening",
    lines,
  });
  for (const e of allocationLines(chart, preview.allocation)) {
    insertEntry(ctx, {
      date: draft.asOf,
      memo: `${e.memo} – result before ${addDays(draft.asOf, 1)}`,
      source: "opening",
      sourceType: "opening_share",
      sourceId: "opening",
      lines: e.lines,
    });
  }
  setSetting(ctx.db, LEDGER_START_KEY, addDays(draft.asOf, 1));
  ctx.db
    .update(closings)
    .set({ status: "locked", data: JSON.stringify(draft), lockedAt: ctx.now.getTime(), lockedBy: ctx.user._id })
    .where(eq(closings.period, "opening"))
    .run();
}

// ---------------------------------------------------------------- Months

export type PeriodRow = {
  period: string;
  kind: "month" | "day";
  start: string;
  end: string;
  status: "open" | "draft" | "locked";
};

/**
 * Every closing since the opening, month by month: closings on chosen days
 * inside a month come before the month itself.
 */
export function periodsToClose(db: DB, today: string): PeriodRow[] {
  const start = ledgerStartDay({ db });
  if (!start) return [];
  const rows = db.select().from(closings).all();
  const locked = lockedThrough(db);
  const out: PeriodRow[] = [];
  let month = start.slice(0, 7);
  // At least the first month, even before it begins
  const lastMonth = today.slice(0, 7) > month ? today.slice(0, 7) : month;
  while (month <= lastMonth) {
    const monthEnd = monthEndOf(month);
    const days = rows
      .filter((r) => isDay(r.period) && r.period.startsWith(`${month}-`))
      .sort((a, b) => a.period.localeCompare(b.period));
    for (const d of days) {
      // A draft for a day that's now inside a closed period is left out
      if (d.status !== "locked" && locked && d.period <= locked) continue;
      out.push({ period: d.period, kind: "day", ...periodRange(db, d.period), status: d.status });
    }
    const own = rows.find((r) => r.period === month);
    const coveredByDay = !!locked && locked >= monthEnd && own?.status !== "locked";
    if (!coveredByDay) {
      out.push({ period: month, kind: "month", ...periodRange(db, month), status: own?.status ?? "open" });
    }
    month = nextMonth(month);
  }
  return out;
}

const pnlTypes = new Set(["revenue", "expense"]);

/** Everything the closing screen shows for one month, with the draft applied. */
export function monthPreview(db: DB, month: string, draft: MonthDraft) {
  const { start, end } = periodRange(db, month);
  const chart = loadChart(db);
  const totals = accountTotals(db, end);
  const before = accountTotals(db, addDays(start, -1));
  const book = (a: Account) => naturalBalance(a, totals.get(a._id));

  // Balances you keep: what the books say vs what you typed
  const kept = keptAccounts(chart).map((a) => {
    const typed = draft.balances[a.code];
    const actual = typed === null || typed === undefined ? null : round2(Number(typed));
    const difference = actual === null ? 0 : round2(actual - book(a));
    const explained = (draft.explanations[a.code] ?? []).filter(
      (x) => chart.byCode.has(x.code) && Math.abs(x.amount) >= MONEY_EPSILON,
    );
    const explainedTotal = round2(explained.reduce((s, x) => s + x.amount, 0));
    return {
      account: a,
      book: book(a),
      actual,
      difference,
      explanations: explained,
      unidentified: round2(Math.abs(difference) - explainedTotal),
    };
  });
  const automatic = chart.all
    .filter((a) => a.isAuto && (a.type === "asset" || a.type === "liability"))
    .map((a) => ({ account: a, book: book(a) }));

  // Adjustment entries for the differences
  const unidentified = mustKey(chart, "unidentified");
  const adjustments = kept
    .filter((k) => Math.abs(k.difference) >= MONEY_EPSILON)
    .map((k) => {
      const d = toDebit(k.account, k.difference);
      const sign = d > 0 ? -1 : 1; // the other side of the entry
      const lines = compact([
        line(k.account._id, d),
        ...k.explanations.map((x) => line(chart.byCode.get(x.code)!._id, sign * x.amount, "Explained at closing")),
        line(unidentified._id, sign * k.unidentified),
      ]);
      return { account: k.account, lines };
    });

  // Profit or loss for the month, including the adjustments
  const pnl = new Map<string, number>();
  for (const a of chart.all) {
    if (!pnlTypes.has(a.type)) continue;
    const now = totals.get(a._id) ?? { debit: 0, credit: 0 };
    const was = before.get(a._id) ?? { debit: 0, credit: 0 };
    pnl.set(a._id, round2(now.debit - now.credit - (was.debit - was.credit)));
  }
  for (const adj of adjustments)
    for (const l of adj.lines)
      if (pnl.has(l.accountId)) pnl.set(l.accountId, round2(pnl.get(l.accountId)! + l.debit - l.credit));
  const pnlRows = chart.all
    .filter((a) => pnlTypes.has(a.type))
    .map((a) => ({ account: a, amount: round2(DEBIT_NORMAL[a.type] ? pnl.get(a._id)! : -pnl.get(a._id)!) }))
    .filter((r) => Math.abs(r.amount) >= MONEY_EPSILON);
  const revenue = round2(pnlRows.filter((r) => r.account.type === "revenue").reduce((s, r) => s + r.amount, 0));
  const expenses = round2(pnlRows.filter((r) => r.account.type === "expense").reduce((s, r) => s + r.amount, 0));
  const result = round2(revenue - expenses);

  const shares = partnerShares(db, chart, start, end);
  const allocation = allocate(result, shares, {
    osama: draft.compensationOsamaPct,
    hazar: draft.compensationHazarPct,
  });
  const withdrawals = closingWithdrawals(allocation, draft);
  return { month, start, end, kept, automatic, adjustments, pnlRows, pnl, revenue, expenses, result, shares, allocation, withdrawals };
}

/**
 * Each partner's choice at the closing: how much of their profit share they
 * take out (owed in Partners payable until paid); the rest is reinvested.
 */
export function closingWithdrawals(alloc: Allocation, draft: MonthDraft) {
  return alloc.partners
    .filter((p) => p.amount >= MONEY_EPSILON)
    .map((p) => {
      const typed = draft.withdrawals?.[p.code];
      const withdraw = typed == null ? 0 : round2(Number(typed));
      const error =
        !Number.isFinite(withdraw) || withdraw < 0
          ? "Enter a valid amount"
          : withdraw > p.amount + MONEY_EPSILON
            ? "More than this partner's profit share"
            : undefined;
      return {
        accountId: p.accountId,
        code: p.code,
        name: p.name,
        profit: p.amount,
        withdraw: error ? 0 : withdraw,
        reinvest: error ? p.amount : round2(p.amount - withdraw),
        error,
      };
    });
}

export function lockMonth(ctx: Ctx, month: string, draft: MonthDraft): void {
  // Month-end automatic entries (depreciation) must be in before closing
  syncLedger(ctx);
  const locked = lockedThrough(ctx.db);
  const opening = readClosing<OpeningDraft>(ctx.db, "opening");
  if (opening?.status !== "locked") {
    throw new AppError("BAD_REQUEST", "Post the opening balances first");
  }
  const { end } = periodRange(ctx.db, month);
  if (locked && end <= locked) throw new AppError("BAD_REQUEST", "This period is already closed");
  const prevEnd = addDays(`${end.slice(0, 7)}-01`, -1);
  if (locked && locked < prevEnd) {
    throw new AppError("BAD_REQUEST", "Close the earlier months first");
  }
  if (end > businessToday(ctx)) {
    throw new AppError("BAD_REQUEST", "You can close up to today, not a day in the future");
  }
  const p = monthPreview(ctx.db, month, draft);
  for (const k of p.kept) {
    if (k.unidentified < -MONEY_EPSILON) {
      throw new AppError(
        "BAD_REQUEST",
        `The explanations for ${k.account.code} ${k.account.name} add up to more than its difference`,
      );
    }
  }
  const bad = p.withdrawals.find((w) => w.error);
  if (bad) throw new AppError("BAD_REQUEST", `${bad.name.replace(/^Capital – /, "")} can't take out more than their profit share`);
  const chart = loadChart(ctx.db);
  // Kinds: differences (real income and costs), the revenue/expense close, and the sharing
  const tag = { source: "closing" as const, sourceId: month, date: end };
  for (const adj of p.adjustments) {
    insertEntry(ctx, {
      ...tag,
      sourceType: "closing_adjust",
      memo: `Closing balance of ${adj.account.code} ${adj.account.name}`,
      lines: adj.lines,
    });
  }
  // Revenue and expenses into the income summary
  const summary = mustKey(chart, "income_summary");
  const closeLines = compact([
    ...[...p.pnl.entries()].map(([accountId, net]) => line(accountId, -net)),
    line(summary._id, [...p.pnl.values()].reduce((s, n) => s + n, 0)),
  ]);
  const label = isMonth(month) ? month : `${p.start} to ${p.end}`;
  insertEntry(ctx, { ...tag, sourceType: "closing_pnl", memo: `Revenue and expenses closed for ${label}`, lines: closeLines });
  for (const e of allocationLines(chart, p.allocation)) {
    insertEntry(ctx, { ...tag, sourceType: "closing_share", memo: `${e.memo} – ${label}`, lines: e.lines });
  }
  // Partners who take profit out: from their capital to Partners payable (owed until paid)
  const takers = p.withdrawals.filter((w) => w.withdraw >= MONEY_EPSILON);
  if (takers.length) {
    const payable = mustKey(chart, "partners_payable");
    insertEntry(ctx, {
      ...tag,
      sourceType: "closing_withdrawal",
      memo: `Profit taken out by partners (owed until paid) – ${label}`,
      lines: takers.flatMap((w) =>
        compact([
          line(w.accountId, w.withdraw, "Withdrawal chosen"),
          { ...line(payable._id, -w.withdraw, `Owed to ${w.name.replace(/^Capital – /, "")}`)!, partnerAccountId: w.accountId },
        ]),
      ),
    });
  }
  setSetting(ctx.db, "compensation_osama_pct", String(draft.compensationOsamaPct));
  setSetting(ctx.db, "compensation_hazar_pct", String(draft.compensationHazarPct));
  writeDraft(ctx.db, month, draft, ctx.now);
  ctx.db
    .update(closings)
    .set({ status: "locked", lockedAt: ctx.now.getTime(), lockedBy: ctx.user._id })
    .where(eq(closings.period, month))
    .run();
}

/** Undoes the last closing (or the opening, if no month is closed): its entries go and the period opens again. */
export function reopen(ctx: Ctx, period: string): void {
  const row = readClosing(ctx.db, period);
  if (row?.status !== "locked") throw new AppError("BAD_REQUEST", "This period isn't closed");
  // Closings (months and days), latest last
  const lockedPeriods = ctx.db
    .select()
    .from(closings)
    .where(and(eq(closings.status, "locked"), ne(closings.period, "opening")))
    .all()
    .map((r) => ({ period: r.period, end: periodEndOf(r.period, r.data) ?? "" }))
    .sort((a, b) => a.end.localeCompare(b.end));
  if (period === "opening" ? lockedPeriods.length > 0 : lockedPeriods.at(-1)?.period !== period) {
    throw new AppError("BAD_REQUEST", "Reopen the later closings first");
  }
  ctx.db
    .delete(journalEntries)
    .where(
      period === "opening"
        ? and(eq(journalEntries.source, "opening"))
        : and(eq(journalEntries.source, "closing"), eq(journalEntries.sourceId, period)),
    )
    .run();
  ctx.db.update(closings).set({ status: "draft", lockedAt: null, lockedBy: null }).where(eq(closings.period, period)).run();
}

/** A partner takes some of their capital: it moves to Partners payable until it's paid out. */
export function partnerWithdrawal(ctx: Ctx, accountId: string, amount: number, date: string): void {
  const chart = loadChart(ctx.db);
  const capital = chart.capitals.find((a) => a._id === accountId);
  if (!capital) throw new AppError("BAD_REQUEST", "Choose a partner");
  const payable = mustKey(chart, "partners_payable");
  const locked = lockedThrough(ctx.db);
  if (locked && date <= locked) throw new AppError("BAD_REQUEST", "That date is in a closed month");
  const lines = compact([
    line(capital._id, amount, "Withdrawal chosen"),
    { ...line(payable._id, -amount, `Owed to ${capital.name.replace(/^Capital – /, "")}`)!, partnerAccountId: capital._id },
  ]);
  const row = ctx.db
    .insert(journalEntries)
    .values({
      number: nextCounter(ctx.db, "journal_counter"),
      date,
      memo: `${capital.name.replace(/^Capital – /, "")} withdraws ${round2(amount)} (owed until paid)`,
      source: "manual",
      createdBy: ctx.user._id,
    })
    .returning({ id: journalEntries._id })
    .get();
  ctx.db
    .insert(journalLines)
    .values(lines.map((l, i) => ({ entryId: row.id, ...l, memo: l.memo ?? null, partnerAccountId: l.partnerAccountId ?? null, sort: i })))
    .run();
}

/**
 * What Partners payable owes each partner (withdrawals not paid out yet).
 * Amounts posted to it without a partner (manual entries) show as unassigned.
 */
export function partnersOwed(db: DB) {
  const chart = loadChart(db);
  const payable = mustKey(chart, "partners_payable");
  const rows = db
    .select({
      partner: journalLines.partnerAccountId,
      owed: sql<number>`coalesce(sum(${journalLines.credit} - ${journalLines.debit}), 0)`,
    })
    .from(journalLines)
    .where(eq(journalLines.accountId, payable._id))
    .groupBy(journalLines.partnerAccountId)
    .all();
  const byId = new Map(rows.map((r) => [r.partner, round2(r.owed)]));
  const partners = chart.capitals
    .map((a) => ({ accountId: a._id, name: a.name.replace(/^Capital – /, ""), owed: byId.get(a._id) ?? 0 }))
    .filter((r) => Math.abs(r.owed) >= MONEY_EPSILON);
  const unassigned = byId.get(null) ?? 0;
  return {
    accountId: payable._id,
    partners,
    unassigned: Math.abs(unassigned) >= MONEY_EPSILON ? unassigned : 0,
    total: round2(partners.reduce((s, r) => s + r.owed, 0) + unassigned),
  };
}

/** Pays a partner what they're owed (or part of it): Partners payable to the bank or cash account it's paid from. */
export function partnerPayout(
  ctx: Ctx,
  args: { partnerAccountId: string; amount: number; fromAccountId: string; date: string },
): void {
  const chart = loadChart(ctx.db);
  const partner = chart.capitals.find((a) => a._id === args.partnerAccountId);
  if (!partner) throw new AppError("BAD_REQUEST", "Choose a partner");
  const from = chart.all.find((a) => a._id === args.fromAccountId);
  if (!from || from.type !== "asset" || from.isAuto || !from.isActive) {
    throw new AppError("BAD_REQUEST", "Choose the bank or cash account it's paid from");
  }
  const locked = lockedThrough(ctx.db);
  if (locked && args.date <= locked) throw new AppError("BAD_REQUEST", "That date is in a closed month");
  const amount = round2(args.amount);
  const owed = partnersOwed(ctx.db).partners.find((r) => r.accountId === partner._id)?.owed ?? 0;
  if (amount > owed + MONEY_EPSILON) {
    throw new AppError("BAD_REQUEST", `More than what's owed to ${partner.name.replace(/^Capital – /, "")}`);
  }
  const payable = mustKey(chart, "partners_payable");
  const name = partner.name.replace(/^Capital – /, "");
  const row = ctx.db
    .insert(journalEntries)
    .values({
      number: nextCounter(ctx.db, "journal_counter"),
      date: args.date,
      memo: `${name} paid ${amount} (profit withdrawal)`,
      source: "manual",
      createdBy: ctx.user._id,
    })
    .returning({ id: journalEntries._id })
    .get();
  ctx.db
    .insert(journalLines)
    .values([
      { entryId: row.id, accountId: payable._id, debit: amount, credit: 0, partnerAccountId: partner._id, memo: `Paid to ${name}`, sort: 0 },
      { entryId: row.id, accountId: from._id, debit: 0, credit: amount, sort: 1 },
    ])
    .run();
}

