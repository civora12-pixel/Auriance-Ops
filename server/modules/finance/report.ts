import { z } from "zod";
import { query, zDay } from "../../rpc/procedure.ts";
import { requireView } from "../../lib/permissions.ts";
import { accountByKey, accountTotals, naturalBalance } from "../../lib/ledger.ts";
import { monthsIn } from "../../lib/finance.ts";
import { dueSummary } from "../../lib/due.ts";
import { cashFlow } from "../../lib/cashflow.ts";
import { getSetting } from "../../lib/settings.ts";
import { LEDGER_START_KEY } from "../../lib/ledger-sync.ts";
import { businessToday } from "../../lib/time.ts";
import { round2 } from "../../../shared/constants.ts";
import { addDays, addMonths, isValidDay } from "../../../shared/dates.ts";
import { incomeFor } from "./statements.ts";

const MAX_SPAN_DAYS = 366 * 5;
const TREND_MONTHS = 12;

/** A from/to pair of business days, inclusive, from ≤ to. */
export const zDayRange = z
  .object({ fromDay: zDay, toDay: zDay })
  .refine((r) => isValidDay(r.fromDay) && isValidDay(r.toDay), "Enter valid dates")
  .refine((r) => r.fromDay <= r.toDay, "The start date must be on or before the end date")
  .refine((r) => r.fromDay >= addDays(r.toDay, -MAX_SPAN_DAYS), "Pick a range of at most 5 years");

export const reportRouter = {
  /** Money in and out by due date for the next weeks, with any gaps (see Finance → Cash flow). */
  cashFlow: query({
    input: z.object({ weeks: z.number().int().min(2).max(26).default(8) }),
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      return cashFlow(ctx.db, businessToday(ctx), args.weeks);
    },
  }),

  /**
   * The Overview, built from the journal (the same numbers as Statements):
   * profit and loss for the range, month by month, a 12-month trend, what the
   * courier owes, and what's coming due.
   */
  report: query({
    input: zDayRange,
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      const today = businessToday(ctx);
      const month = (r: { label: string; fromDay: string; toDay: string }) => {
        const p = incomeFor(ctx.db, r.fromDay, r.toDay);
        return {
          label: r.label,
          fromDay: r.fromDay,
          toDay: r.toDay,
          revenue: p.totalRevenue,
          costs: p.totalCosts,
          grossProfit: p.grossProfit,
          expenses: p.totalAdmin,
          netProfit: p.netProfit,
        };
      };
      const summary = incomeFor(ctx.db, args.fromDay, args.toDay);
      const trendRange = { fromDay: addMonths(args.toDay, -(TREND_MONTHS - 1)), toDay: args.toDay };
      const ar = accountByKey(ctx.db, "accounts_receivable");
      const totals = accountTotals(ctx.db, today);
      return {
        summary: {
          ...summary,
          marginPct: summary.totalRevenue > 0 ? round2((summary.grossProfit / summary.totalRevenue) * 100) : undefined,
        },
        months: monthsIn(args).map(month),
        trend: monthsIn(trendRange)
          .map(month)
          .map((m) => ({
            label: m.label,
            netRevenue: m.revenue,
            expenses: round2(m.costs + m.expenses),
            netProfit: m.netProfit,
          })),
        receivableBalance: ar ? naturalBalance(ar, totals.get(ar._id)) : 0,
        // Days before this are in the opening balances, not the journal
        ledgerStart: getSetting(ctx.db, LEDGER_START_KEY) ?? null,
        due: dueSummary(ctx.db, today),
      };
    },
  }),
};
