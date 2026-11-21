import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { accounts, journalEntries, journalLines } from "../db/schema.ts";
import { round2 } from "../../shared/constants.ts";
import { getSetting, setSetting } from "./settings.ts";
import { isBusinessEntry } from "./ledger.ts";

/**
 * Fixed costs that are only recorded at month end (salaries, marketing,
 * subscriptions…), as a monthly budget: a day carries 1/30 of each, so a single
 * day shows whether its sales really made a profit.
 */
export type BudgetItem = { id: string; name: string; monthly: number; accountCode: number | null };

export const DAYS_PER_MONTH = 30;
const BUDGET_KEY = "day_budget";

export const DEFAULT_BUDGET: BudgetItem[] = [
  { id: "salaries", name: "Salaries", monthly: 8000, accountCode: 60001 },
  { id: "marketing", name: "Marketing", monthly: 35000, accountCode: 50003 },
  // Claude ($23) and the domain (about $11 a year), at EGP 55 to the dollar
  { id: "subscriptions", name: "Subscriptions", monthly: 1315, accountCode: 60003 },
  { id: "other", name: "Other running costs", monthly: 2000, accountCode: 60002 },
  { id: "depreciation", name: "Depreciation", monthly: 90, accountCode: 60006 },
];

export function dayBudget(db: DB): BudgetItem[] {
  const raw = getSetting(db, BUDGET_KEY);
  if (raw === undefined) return DEFAULT_BUDGET;
  try {
    const list = JSON.parse(raw) as BudgetItem[];
    return Array.isArray(list) ? list : DEFAULT_BUDGET;
  } catch {
    return DEFAULT_BUDGET;
  }
}

export function saveDayBudget(db: DB, items: BudgetItem[]): void {
  setSetting(db, BUDGET_KEY, JSON.stringify(items));
}

/** Sales and sales returns: the revenue accounts under the "Sales" heading. */
const isSalesAccount = (a: { type: string; group: string }) => a.type === "revenue" && a.group === "Sales";

/**
 * Net sales (sales − returns) per day from the journal, the same figure the
 * Day performance and Finance show. Closing and opening entries don't count.
 */
export function ledgerSalesByDay(db: DB, fromDay: string, toDay: string): Map<string, number> {
  const sales = new Set(
    db
      .select()
      .from(accounts)
      .all()
      .filter(isSalesAccount)
      .map((a) => a._id),
  );
  const rows = db
    .select({
      date: journalEntries.date,
      accountId: journalLines.accountId,
      net: sql<number>`coalesce(sum(${journalLines.credit} - ${journalLines.debit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries._id, journalLines.entryId))
    .where(and(gte(journalEntries.date, fromDay), lte(journalEntries.date, toDay), isBusinessEntry()))
    .groupBy(journalEntries.date, journalLines.accountId)
    .all();
  const out = new Map<string, number>();
  for (const r of rows) if (sales.has(r.accountId)) out.set(r.date, round2((out.get(r.date) ?? 0) + r.net));
  return out;
}

/**
 * One day's profit or loss: sales and cost of goods for the day (from the
 * journal, so entries recorded later for that date count too), a day's share
 * of the monthly budget, and any other costs and income recorded on that
 * date. A cost whose account has a budget line is covered by the budget, so
 * it isn't counted twice. Gains such as an inventory count gain are other
 * income, not sales, so they don't flatter the gross margin.
 */
export function dayPerformance(db: DB, day: string) {
  const rows = db
    .select({
      accountId: journalLines.accountId,
      debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
      credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries._id, journalLines.entryId))
    // Closing and opening entries move balances around; they aren't the day's business
    .where(and(eq(journalEntries.date, day), isBusinessEntry()))
    .groupBy(journalLines.accountId)
    .all();
  const chart = new Map(db.select().from(accounts).all().map((a) => [a._id, a]));
  const budget = dayBudget(db);
  const budgetCodes = new Set(budget.map((b) => b.accountCode).filter((c): c is number => c !== null));

  let sales = 0;
  let cogs = 0;
  const salesLines: { accountId: string; code: number; name: string; amount: number }[] = [];
  const incomeLines: { accountId: string; code: number; name: string; amount: number }[] = [];
  const recorded: { accountId: string; code: number; name: string; amount: number; inBudget: boolean }[] = [];
  let cogsAccountId: string | null = null;
  for (const r of rows) {
    const a = chart.get(r.accountId);
    if (!a) continue;
    if (a.type === "revenue") {
      const amount = round2(r.credit - r.debit);
      if (Math.abs(amount) < 0.005) continue;
      if (isSalesAccount(a)) {
        sales += amount;
        salesLines.push({ accountId: a._id, code: a.code, name: a.name, amount });
      } else incomeLines.push({ accountId: a._id, code: a.code, name: a.name, amount });
    } else if (a.type === "expense") {
      const amount = round2(r.debit - r.credit);
      if (Math.abs(amount) < 0.005) continue;
      if (a.systemKey === "cogs") {
        cogs += amount;
        cogsAccountId = a._id;
      } else recorded.push({ accountId: a._id, code: a.code, name: a.name, amount, inBudget: budgetCodes.has(a.code) });
    }
  }
  const budgetLines = budget.map((b) => ({ ...b, daily: round2(b.monthly / DAYS_PER_MONTH) }));
  const budgetTotal = round2(budgetLines.reduce((s, b) => s + b.daily, 0));
  const otherCosts = round2(recorded.filter((r) => !r.inBudget).reduce((s, r) => s + r.amount, 0));
  const otherIncome = round2(incomeLines.reduce((s, r) => s + r.amount, 0));
  sales = round2(sales);
  cogs = round2(cogs);
  const grossProfit = round2(sales - cogs);
  const result = round2(grossProfit + otherIncome - budgetTotal - otherCosts);
  return {
    day,
    sales,
    salesLines: salesLines.sort((a, b) => a.code - b.code),
    cogs,
    cogsAccountId,
    grossProfit,
    grossMarginPct: sales > 0 ? round2((grossProfit / sales) * 100) : null,
    budget: budgetLines,
    budgetTotal,
    recorded: recorded.sort((a, b) => a.code - b.code),
    otherCosts,
    otherIncomeLines: incomeLines.sort((a, b) => a.code - b.code),
    otherIncome,
    result,
    // Sales needed to cover the day's fixed costs at today's gross margin
    breakEvenSales:
      sales > 0 && grossProfit > 0 ? round2((Math.max(0, budgetTotal + otherCosts - otherIncome) * sales) / grossProfit) : null,
  };
}
