import { and, eq, inArray, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { accounts, journalEntries, journalLines } from "../db/schema.ts";
import type { Account } from "../db/schema.ts";
import { AppError } from "../rpc/procedure.ts";
import type { Ctx } from "../rpc/procedure.ts";
import { DEBIT_NORMAL, MONEY_EPSILON, round2 } from "../../shared/constants.ts";
import type { JournalSource } from "../../shared/constants.ts";
import { nextCounter } from "./counters.ts";

export type LineInput = {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string | null;
};

export type EntryInput = {
  date: string;
  memo: string;
  source: JournalSource;
  sourceType?: string | null;
  sourceId?: string | null;
  lines: LineInput[];
  /** Manual entries: when what they owe must be paid */
  dueDay?: string | null;
};

/**
 * Closing moves revenue and expenses into equity, and opening entries carry
 * balances in: neither is business done on its date. Closing adjustments (real
 * differences found at closing) do count.
 */
export const NOT_BUSINESS_SOURCE_TYPES = ["closing_pnl", "closing_share", "closing_withdrawal", "opening", "opening_share"];
export const isBusinessEntry = (): SQL =>
  // Manual entries have no source type; NOT IN alone would drop them
  or(isNull(journalEntries.sourceType), notInArray(journalEntries.sourceType, NOT_BUSINESS_SOURCE_TYPES))!;

export const accountLabel = (a: Pick<Account, "code" | "name">) =>
  `${a.code} ${a.name}`;

/**
 * The rules every entry follows, manual or automatic: at least two lines, each
 * line a debit or a credit (not both, not zero), and debits equal to credits.
 * Manual entries may only use active accounts the app doesn't fill itself.
 */
export function checkLines(
  db: DB,
  lines: LineInput[],
  opts: { manual: boolean },
): LineInput[] {
  if (lines.length < 2) {
    throw new AppError("BAD_REQUEST", "An entry needs at least two lines");
  }
  const clean = lines.map((l) => ({
    ...l,
    debit: round2(l.debit || 0),
    credit: round2(l.credit || 0),
    memo: l.memo?.trim() || null,
  }));
  for (const l of clean) {
    if (l.debit < 0 || l.credit < 0) {
      throw new AppError("BAD_REQUEST", "Amounts can't be negative");
    }
    if ((l.debit > 0) === (l.credit > 0)) {
      throw new AppError(
        "BAD_REQUEST",
        "Each line needs either a debit or a credit amount",
      );
    }
  }
  const debits = round2(clean.reduce((s, l) => s + l.debit, 0));
  const credits = round2(clean.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(debits - credits) >= MONEY_EPSILON) {
    throw new AppError(
      "BAD_REQUEST",
      `The entry isn't balanced: debits ${debits} and credits ${credits}`,
    );
  }
  const ids = [...new Set(clean.map((l) => l.accountId))];
  const found = db
    .select()
    .from(accounts)
    .where(inArray(accounts._id, ids))
    .all();
  const byId = new Map(found.map((a) => [a._id, a]));
  for (const id of ids) {
    const account = byId.get(id);
    if (!account) throw new AppError("BAD_REQUEST", "Account not found");
    if (opts.manual && !account.isActive) {
      throw new AppError(
        "BAD_REQUEST",
        `${accountLabel(account)} is inactive`,
      );
    }
    if (opts.manual && account.isAuto) {
      throw new AppError(
        "BAD_REQUEST",
        `${accountLabel(account)} is filled automatically and can't be used in a manual entry`,
      );
    }
  }
  return clean;
}

/**
 * Which partner a manual entry's Partners payable lines belong to: the one
 * partner's capital in the same entry (a withdrawal), else the partner it
 * belonged to before an edit. Otherwise it stays unassigned.
 */
function payablePartner(db: DB, lines: LineInput[], before: string | null): { payableId: string; partner: string | null } | null {
  const ids = [...new Set(lines.map((l) => l.accountId))];
  const rows = db.select().from(accounts).where(inArray(accounts._id, ids)).all();
  const payable = rows.find((a) => a.systemKey === "partners_payable");
  if (!payable) return null;
  const capitals = rows.filter((a) => a.type === "equity" && a.group === "Partners' capital");
  return { payableId: payable._id, partner: capitals.length === 1 ? capitals[0]._id : before };
}

function insertLines(db: DB, entryId: string, lines: LineInput[], partnerBefore: string | null = null) {
  const tag = payablePartner(db, lines, partnerBefore);
  db.insert(journalLines)
    .values(
      lines.map((l, i) => ({
        entryId,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        memo: l.memo ?? null,
        partnerAccountId: tag && l.accountId === tag.payableId ? tag.partner : null,
        sort: i,
      })),
    )
    .run();
}

/** Writes a checked entry and its lines; returns the new entry's id. */
export function postEntry(ctx: Ctx, input: EntryInput): string {
  const lines = checkLines(ctx.db, input.lines, {
    manual: input.source === "manual",
  });
  const entry = ctx.db
    .insert(journalEntries)
    .values({
      number: nextCounter(ctx.db, "journal_counter"),
      date: input.date,
      memo: input.memo.trim(),
      source: input.source,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      createdBy: ctx.user._id,
      dueDay: input.dueDay ?? null,
    })
    .returning({ id: journalEntries._id })
    .get();
  insertLines(ctx.db, entry.id, lines);
  return entry.id;
}

/** Replaces a manual entry's date, memo and lines (keeps its number). */
export function replaceEntry(
  ctx: Ctx,
  entryId: string,
  input: Pick<EntryInput, "date" | "memo" | "lines" | "dueDay">,
): void {
  const lines = checkLines(ctx.db, input.lines, { manual: true });
  ctx.db
    .update(journalEntries)
    .set({
      date: input.date,
      memo: input.memo.trim(),
      updatedAt: ctx.now.getTime(),
      dueDay: input.dueDay ?? null,
    })
    .where(eq(journalEntries._id, entryId))
    .run();
  // Keep the partner a Partners payable amount belongs to across edits
  const tags = [
    ...new Set(
      ctx.db
        .select({ p: journalLines.partnerAccountId })
        .from(journalLines)
        .where(eq(journalLines.entryId, entryId))
        .all()
        .map((r) => r.p)
        .filter((p): p is string => !!p),
    ),
  ];
  ctx.db.delete(journalLines).where(eq(journalLines.entryId, entryId)).run();
  insertLines(ctx.db, entryId, lines, tags.length === 1 ? tags[0] : null);
}

/**
 * Debit and credit totals per account, up to and including `asOfDay` when
 * given. Balances are shown the natural way round: assets and expenses as
 * debits minus credits, the rest as credits minus debits.
 */
export function accountTotals(
  db: DB,
  asOfDay?: string,
): Map<string, { debit: number; credit: number }> {
  const rows = db
    .select({
      accountId: journalLines.accountId,
      debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
      credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries._id, journalLines.entryId))
    .where(asOfDay ? and(lte(journalEntries.date, asOfDay)) : undefined)
    .groupBy(journalLines.accountId)
    .all();
  return new Map(
    rows.map((r) => [
      r.accountId,
      { debit: round2(r.debit), credit: round2(r.credit) },
    ]),
  );
}

export function naturalBalance(
  account: Pick<Account, "type">,
  totals: { debit: number; credit: number } | undefined,
): number {
  if (!totals) return 0;
  const net = totals.debit - totals.credit;
  return round2(DEBIT_NORMAL[account.type] ? net : -net);
}

/** Accounts a purchase can be paid from: cash, banks, custody, the card, payables, partner loans. */
export function paymentAccounts(db: DB): Account[] {
  return db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.isActive, true),
        eq(accounts.isAuto, false),
        inArray(accounts.type, ["asset", "liability"]),
      ),
    )
    .all()
    .sort((a, b) => a.code - b.code);
}

export function assertPaymentAccount(db: DB, accountId: string): Account {
  const account = paymentAccounts(db).find((a) => a._id === accountId);
  if (!account) {
    throw new AppError("BAD_REQUEST", "Choose the account the purchase was paid from");
  }
  return account;
}

export function accountByKey(db: DB, systemKey: string): Account | undefined {
  return db.select().from(accounts).where(eq(accounts.systemKey, systemKey)).get();
}
