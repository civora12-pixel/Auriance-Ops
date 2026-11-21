import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import { accounts, journalEntries, journalLines } from "../../db/schema.ts";
import type { Account } from "../../db/schema.ts";
import type { DB } from "../../db/client.ts";
import { query, zDay } from "../../rpc/procedure.ts";
import type { Ctx } from "../../rpc/procedure.ts";
import { requireView } from "../../lib/permissions.ts";
import { isBusinessEntry } from "../../lib/ledger.ts";
import { DEBIT_NORMAL, MONEY_EPSILON, round2 } from "../../../shared/constants.ts";
import { addDays } from "../../../shared/dates.ts";

const brief = (a: Account) => ({ _id: a._id, code: a.code, name: a.name, type: a.type, group: a.group });

/** Net debit (debit − credit) per account for entries matching `where`. */
function nets(ctx: Ctx, where: SQL[]): Map<string, number> {
  const rows = ctx.db
    .select({ accountId: journalLines.accountId, debit: journalLines.debit, credit: journalLines.credit })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries._id, journalLines.entryId))
    .where(where.length ? and(...where) : undefined)
    .all();
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.accountId, (out.get(r.accountId) ?? 0) + r.debit - r.credit);
  return out;
}

const natural = (a: Account, net: number) => round2(DEBIT_NORMAL[a.type] ? net : -net);
const nonZero = (n: number) => Math.abs(n) >= MONEY_EPSILON;

function chart(ctx: Ctx) {
  return ctx.db.select().from(accounts).all().sort((a, b) => a.code - b.code);
}

/**
 * Profit and loss for a period from the journal. Month-end closing and opening
 * entries are left out so closed months still show their results. The Overview
 * and Statements both use this, so they always agree.
 */
export function incomeFor(db: DB, fromDay: string, toDay: string) {
  const net = netsDb(db, [
    gte(journalEntries.date, fromDay),
    lte(journalEntries.date, toDay),
    isBusinessEntry(),
  ]);
  const rows = db
    .select()
    .from(accounts)
    .all()
    .sort((a, b) => a.code - b.code)
    .filter((a) => a.type === "revenue" || a.type === "expense")
    .map((a) => ({ account: brief(a), amount: natural(a, net.get(a._id) ?? 0) }))
    .filter((r) => nonZero(r.amount));
  const revenue = rows.filter((r) => r.account.type === "revenue");
  const costs = rows.filter((r) => r.account.type === "expense" && r.account.group === "Costs");
  const admin = rows.filter((r) => r.account.type === "expense" && r.account.group !== "Costs");
  const sum = (list: typeof rows) => round2(list.reduce((s, r) => s + r.amount, 0));
  const totalRevenue = sum(revenue);
  const totalCosts = sum(costs);
  const totalAdmin = sum(admin);
  return {
    revenue,
    costs,
    admin,
    totalRevenue,
    totalCosts,
    grossProfit: round2(totalRevenue - totalCosts),
    totalAdmin,
    netProfit: round2(totalRevenue - totalCosts - totalAdmin),
  };
}

function netsDb(db: DB, where: SQL[]): Map<string, number> {
  const rows = db
    .select({ accountId: journalLines.accountId, debit: journalLines.debit, credit: journalLines.credit })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries._id, journalLines.entryId))
    .where(where.length ? and(...where) : undefined)
    .all();
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.accountId, (out.get(r.accountId) ?? 0) + r.debit - r.credit);
  return out;
}

export const statementsRouter = {
  /** Every account's debits, credits and balance up to a day. */
  trialBalance: query({
    input: z.object({ asOfDay: zDay }),
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      const where = [lte(journalEntries.date, args.asOfDay)];
      const rows = ctx.db
        .select({ accountId: journalLines.accountId, debit: journalLines.debit, credit: journalLines.credit })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries._id, journalLines.entryId))
        .where(and(...where))
        .all();
      const totals = new Map<string, { debit: number; credit: number }>();
      for (const r of rows) {
        const t = totals.get(r.accountId) ?? { debit: 0, credit: 0 };
        t.debit += r.debit;
        t.credit += r.credit;
        totals.set(r.accountId, t);
      }
      const lines = chart(ctx)
        .map((a) => {
          const t = totals.get(a._id) ?? { debit: 0, credit: 0 };
          const net = round2(t.debit - t.credit);
          return {
            account: brief(a),
            debit: net > 0 ? net : 0,
            credit: net < 0 ? -net : 0,
          };
        })
        .filter((l) => nonZero(l.debit) || nonZero(l.credit));
      return {
        lines,
        debit: round2(lines.reduce((s, l) => s + l.debit, 0)),
        credit: round2(lines.reduce((s, l) => s + l.credit, 0)),
      };
    },
  }),

  /** Revenue, costs and expenses for a period (month-end closing entries left out so closed months still show). */
  incomeStatement: query({
    input: z.object({ fromDay: zDay, toDay: zDay }),
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      return incomeFor(ctx.db, args.fromDay, args.toDay);
    },
  }),

  /** What the business owns and owes on a day, and the partners' capital. */
  balanceSheet: query({
    input: z.object({ asOfDay: zDay }),
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      const net = nets(ctx, [lte(journalEntries.date, args.asOfDay)]);
      const all = chart(ctx);
      const row = (a: Account) => ({ account: brief(a), amount: natural(a, net.get(a._id) ?? 0) });
      const of = (type: Account["type"]) => all.filter((a) => a.type === type).map(row).filter((r) => nonZero(r.amount));
      const assets = of("asset");
      const liabilities = of("liability");
      const equity = of("equity");
      // Profit or loss not closed yet (the current month)
      const unclosed = round2(
        all
          .filter((a) => a.type === "revenue" || a.type === "expense")
          .reduce((s, a) => s - (net.get(a._id) ?? 0), 0),
      );
      const sum = (list: { amount: number }[]) => round2(list.reduce((s, r) => s + r.amount, 0));
      const totalAssets = sum(assets);
      const totalLiabilities = sum(liabilities);
      const totalEquity = round2(sum(equity) + unclosed);
      return {
        assets,
        liabilities,
        equity,
        unclosed,
        totalAssets,
        totalLiabilities,
        totalEquity,
        balanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01,
      };
    },
  }),

  /** Each partner's capital over a period: start, share of results, withdrawals and other changes, end. */
  partnerStatement: query({
    input: z.object({ fromDay: zDay, toDay: zDay }),
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      const partners = chart(ctx).filter((a) => a.type === "equity" && a.group === "Partners' capital");
      const ids = partners.map((a) => a._id);
      const before = nets(ctx, [lte(journalEntries.date, addDays(args.fromDay, -1)), inArray(journalLines.accountId, ids)]);
      const lines = ids.length
        ? ctx.db
            .select({
              accountId: journalLines.accountId,
              debit: journalLines.debit,
              credit: journalLines.credit,
              memo: journalLines.memo,
              sourceType: journalEntries.sourceType,
            })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalEntries._id, journalLines.entryId))
            .where(
              and(
                gte(journalEntries.date, args.fromDay),
                lte(journalEntries.date, args.toDay),
                inArray(journalLines.accountId, ids),
              ),
            )
            .all()
        : [];
      return partners.map((a) => {
        const own = lines.filter((l) => l.accountId === a._id);
        const credit = (l: (typeof own)[number]) => round2(l.credit - l.debit);
        const share = round2(
          own
            .filter((l) => l.sourceType === "closing_share" || l.sourceType === "opening_share")
            .reduce((s, l) => s + credit(l), 0),
        );
        const withdrawn = round2(
          own.filter((l) => l.memo === "Withdrawal chosen").reduce((s, l) => s - credit(l), 0),
        );
        const total = round2(own.reduce((s, l) => s + credit(l), 0));
        const opening = natural(a, before.get(a._id) ?? 0);
        return {
          account: brief(a),
          name: a.name.replace(/^Capital – /, ""),
          opening,
          share,
          withdrawn,
          other: round2(total - share + withdrawn),
          closing: round2(opening + total),
        };
      });
    },
  }),
};
