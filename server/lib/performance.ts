import { and, eq, gte, isNotNull, lt, ne, sql } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { accounts, journalEntries, journalLines, orders } from "../db/schema.ts";
import { round2 } from "../../shared/constants.ts";
import { addDays, addMonths, monthOf, zonedDayStart } from "../../shared/dates.ts";
import { BENCHMARKS, BENCHMARK_LABEL, BENCHMARK_MONTHLY_SALES, monthlyGrowthPct } from "../../shared/benchmarks.ts";
import { isBusinessEntry } from "./ledger.ts";
import { dayBudget, ledgerSalesByDay } from "./day-performance.ts";

/**
 * The dashboard's performance figures. Each one carries the steps of its
 * calculation, with links to the orders and account ledgers behind them, so
 * any number can be opened and checked.
 */

import type { Metric, Step } from "../../shared/performance.ts";
export type { Benchmark, Metric, Step, StepLink } from "../../shared/performance.ts";

type Range = { fromDay: string; toDay: string };
type AccountRow = { _id: string; code: number; name: string; type: string; group: string; systemKey: string | null };

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
const div = (a: number, b: number) => (b > 0 ? a / b : null);

/** Stock count gains: they offset count losses among the costs, not "other income". */
const STOCK_GAIN_KEYS = new Set(["count_gain"]);

/** Debits and credits per account over a range of days (closing/opening entries left out). */
function totals(db: DB, r: Range): Map<string, { debit: number; credit: number }> {
  const rows = db
    .select({
      accountId: journalLines.accountId,
      debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
      credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries._id, journalLines.entryId))
    .where(and(gte(journalEntries.date, r.fromDay), sql`${journalEntries.date} <= ${r.toDay}`, isBusinessEntry()))
    .groupBy(journalLines.accountId)
    .all();
  return new Map(rows.map((x) => [x.accountId, { debit: x.debit, credit: x.credit }]));
}

/** Everything one period's figures are built from. */
function periodFigures(db: DB, chart: AccountRow[], r: Range) {
  const t = totals(db, r);
  const budget = dayBudget(db);
  const budgetCodes = new Set(budget.map((b) => b.accountCode).filter((c): c is number => c !== null));
  const get = (a: AccountRow) => t.get(a._id) ?? { debit: 0, credit: 0 };
  const line = (a: AccountRow, amount: number): Step => ({
    label: a.name,
    amount: round2(amount),
    sub: true,
    link: { kind: "account", accountId: a._id, ...r },
  });
  const salesAcc = chart.find((a) => a.systemKey === "sales");
  const returnsAcc = chart.find((a) => a.systemKey === "sales_returns");
  const cogsAcc = chart.find((a) => a.systemKey === "cogs");
  const marketingAcc = chart.find((a) => a.systemKey === "marketing");
  const refusedAcc = chart.find((a) => a.systemKey === "refused_shipping");
  const salesLines = chart.filter((a) => a.type === "revenue" && a.group === "Sales");
  const sales = round2(salesLines.reduce((s, a) => s + get(a).credit - get(a).debit, 0));
  const grossSales = salesAcc ? round2(get(salesAcc).credit - get(salesAcc).debit) : 0;
  const returns = returnsAcc ? round2(get(returnsAcc).debit - get(returnsAcc).credit) : 0;
  const cogs = cogsAcc ? round2(get(cogsAcc).debit - get(cogsAcc).credit) : 0;
  // Costs recorded in the period that the budget doesn't already cover: they move with sales.
  // Stock count gains sit here too, against count losses: a count corrected out
  // and back in (e.g. repacking) nets to nothing instead of moving break-even.
  const offsetsCosts = (a: AccountRow) => STOCK_GAIN_KEYS.has(a.systemKey ?? "");
  const variable = chart
    .filter((a) => (a.type === "expense" && a.systemKey !== "cogs" && !budgetCodes.has(a.code)) || offsetsCosts(a))
    .map((a) => ({ a, amount: round2(get(a).debit - get(a).credit) }))
    .filter((x) => Math.abs(x.amount) >= 0.005);
  const variableTotal = round2(variable.reduce((s, x) => s + x.amount, 0));
  const otherIncome = chart
    .filter((a) => a.type === "revenue" && a.group !== "Sales" && !offsetsCosts(a))
    .map((a) => ({ a, amount: round2(get(a).credit - get(a).debit) }))
    .filter((x) => Math.abs(x.amount) >= 0.005);
  const otherIncomeTotal = round2(otherIncome.reduce((s, x) => s + x.amount, 0));
  const contribution = round2(sales - cogs - variableTotal);
  const actualOf = (code: number | null) => {
    const a = code === null ? undefined : chart.find((x) => x.code === code);
    return a ? round2(get(a).debit - get(a).credit) : 0;
  };
  return {
    range: r,
    sales,
    grossSales,
    returns,
    cogs,
    variable,
    variableTotal,
    otherIncome,
    otherIncomeTotal,
    contribution,
    budget: budget.map((b) => ({ ...b, actual: actualOf(b.accountCode) })),
    marketing: marketingAcc ? round2(get(marketingAcc).debit - get(marketingAcc).credit) : 0,
    marketingAcc,
    refused: refusedAcc ? round2(get(refusedAcc).debit - get(refusedAcc).credit) : 0,
    refusedAcc,
    accounts: { salesAcc, returnsAcc, cogsAcc },
    lines: {
      sales: salesLines.map((a) => line(a, get(a).credit - get(a).debit)),
      cogs: cogsAcc ? line(cogsAcc, cogs) : null,
      variable: variable.map((x) => line(x.a, x.amount)),
      otherIncome: otherIncome.map((x) => line(x.a, x.amount)),
    },
  };
}

/** Orders that went out in a range of days: how many, and their value when shipped (before returns). */
function shippedOrders(db: DB, r: Range, tz: string) {
  const from = zonedDayStart(r.fromDay, tz).toISOString();
  const to = zonedDayStart(addDays(r.toDay, 1), tz).toISOString();
  const row = db
    .select({
      count: sql<number>`count(*)`,
      value: sql<number>`coalesce(sum(${orders.subtotal} - ${orders.discountAmount}), 0)`,
    })
    .from(orders)
    .where(and(isNotNull(orders.shippedAt), gte(orders.shippedAt, from), lt(orders.shippedAt, to), ne(orders.status, "cancelled")))
    .get();
  return { count: row?.count ?? 0, value: round2(row?.value ?? 0) };
}

/** Sales in the books against the orders shipped in the same days: they should agree. */
export function salesCheck(db: DB, r: Range, tz: string): Metric & { sales: number; shippedValue: number; difference: number } {
  const chart = db.select().from(accounts).all() as AccountRow[];
  const p = periodFigures(db, chart, r);
  const shipped = shippedOrders(db, r, tz);
  const booked = p.accounts.salesAcc ? p.grossSales : 0;
  const difference = round2(booked - shipped.value);
  const steps: Step[] = [
    { label: "Orders shipped", count: shipped.count, amount: shipped.value, link: { kind: "shipped", ...r } },
    ...(p.accounts.salesAcc ? [{ ...p.lines.sales[0], label: "Sales in the books", sub: false } as Step] : []),
    { label: "Difference", amount: difference, strong: true },
  ];
  if (Math.abs(difference) >= 1)
    steps.push({
      label:
        "A difference comes from entries posted on another day: anything recorded after a day was closed goes to the next open day, and orders shipped before the books started aren't in them",
    });
  steps.push({ label: "Sales returns", amount: -p.returns, link: p.lines.sales[1]?.link });
  steps.push({ label: "Net sales", amount: p.sales, strong: true });
  return { steps, benchmarks: [], sales: p.sales, shippedValue: shipped.value, difference };
}

/** Fixed costs for the month: the budget, or what was actually spent when that's more. */
function fixedFor(p: ReturnType<typeof periodFigures>, share: number) {
  const lines = p.budget.map((b) => {
    const planned = round2(b.monthly * share);
    return { name: b.name, planned, actual: b.actual, used: Math.max(planned, b.actual) };
  });
  return { lines, total: round2(lines.reduce((s, l) => s + l.used, 0)) };
}

export function performance(db: DB, today: string, tz: string, ledgerStart: string | undefined) {
  const chart = db.select().from(accounts).all() as AccountRow[];
  const monthStart = `${monthOf(today)}-01`;
  const monthEnd = addDays(addMonths(today, 1), -1);
  const daysInMonth = daysBetween(monthStart, monthEnd);
  const daysGone = daysBetween(monthStart, today);
  const m = periodFigures(db, chart, { fromDay: monthStart, toDay: today });
  const fixed = fixedFor(m, 1);
  const cmPct = div(m.contribution, m.sales);
  const breakEven = cmPct && cmPct > 0 ? round2(Math.max(0, fixed.total - m.otherIncomeTotal) / cmPct) : null;
  const projected = round2((m.sales / daysGone) * daysInMonth);
  const projectedResult = cmPct !== null ? round2(projected * cmPct + m.otherIncomeTotal - fixed.total) : null;
  const daysLeft = daysInMonth - daysGone;
  const toGo = breakEven !== null ? round2(Math.max(0, breakEven - m.sales)) : null;
  // The day sales passed break-even
  let reachedOn: string | null = null;
  if (breakEven !== null && m.sales >= breakEven) {
    let run = 0;
    const byDay = ledgerSalesByDay(db, monthStart, today);
    for (let d = monthStart; d <= today; d = addDays(d, 1)) {
      run += byDay.get(d) ?? 0;
      if (run >= breakEven) {
        reachedOn = d;
        break;
      }
    }
  }
  const contributionSteps = (p: typeof m): Step[] => [
    { label: "Net sales", amount: p.sales, strong: true },
    ...p.lines.sales,
    { label: "Cost of goods sold", amount: -p.cogs, link: p.lines.cogs?.link },
    ...(p.variable.length ? [{ label: "Costs that come with sales", amount: -p.variableTotal } as Step] : []),
    ...p.lines.variable.map((s) => ({ ...s, amount: -(s.amount ?? 0) })),
    { label: "Left after the cost of sales", amount: p.contribution, strong: true },
    { label: "Kept from each pound of sales", pct: p.sales > 0 ? round2((p.contribution / p.sales) * 100) : undefined },
  ];

  const breakEvenMonth: Metric & {
    sales: number;
    breakEven: number | null;
    progressPct: number | null;
    projected: number;
    projectedResult: number | null;
    toGo: number | null;
    perDay: number | null;
    reachedOn: string | null;
    daysLeft: number;
  } = {
    sales: m.sales,
    breakEven,
    progressPct: breakEven ? round2((m.sales / breakEven) * 100) : null,
    projected,
    projectedResult,
    toGo,
    perDay: toGo !== null && daysLeft > 0 ? round2(toGo / daysLeft) : null,
    reachedOn,
    daysLeft,
    steps: [
      ...contributionSteps(m),
      { label: "Fixed costs this month", amount: -fixed.total, strong: true },
      ...fixed.lines.map((l) => ({
        label: l.actual > l.planned ? "{{name}} (spent more than budgeted)" : "{{name}}",
        vars: { name: l.name },
        amount: -l.used,
        sub: true,
      })),
      ...(m.otherIncomeTotal ? [{ label: "Other income", amount: m.otherIncomeTotal } as Step, ...m.lines.otherIncome] : []),
      {
        label: "Break-even sales = fixed costs ÷ share kept",
        amount: breakEven ?? undefined,
        strong: true,
      },
      { label: "Sales so far", amount: m.sales, pct: breakEven ? round2((m.sales / breakEven) * 100) : undefined },
      { label: "At this pace by month end ({{days}} days)", vars: { days: daysInMonth }, amount: projected },
      { label: "Result at this pace", amount: projectedResult ?? undefined, strong: true },
    ],
    benchmarks: [
      { label: "Average sales a month, {{period}}", vars: { period: BENCHMARK_LABEL }, amount: BENCHMARKS.monthlySales },
      { label: "Share kept from each pound of sales, {{period}}", vars: { period: BENCHMARK_LABEL }, pct: BENCHMARKS.contributionPct },
    ],
  };

  // The year: from January (or the day the books started) to today
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const yFrom = ledgerStart && ledgerStart > yearStart ? ledgerStart : yearStart;
  const yDays = daysBetween(yFrom, today);
  const y = periodFigures(db, chart, { fromDay: yFrom, toDay: today });
  const monthlyFixed = fixedFor(y, 1).lines.reduce((s, l) => s + l.planned, 0);
  const yFixed = round2((monthlyFixed * 12 * yDays) / 365);
  const yCm = div(y.contribution, y.sales);
  const yBreakEven = yCm && yCm > 0 ? round2((monthlyFixed * 12) / yCm) : null;
  const yProjected = round2((y.sales / yDays) * 365);
  const yResult = yCm !== null ? round2(y.contribution + y.otherIncomeTotal - yFixed) : null;
  const breakEvenYear: Metric & { sales: number; breakEven: number | null; projected: number; resultSoFar: number | null; fromDay: string } = {
    sales: y.sales,
    breakEven: yBreakEven,
    projected: yProjected,
    resultSoFar: yResult,
    fromDay: yFrom,
    steps: [
      ...contributionSteps(y),
      { label: "Fixed costs a year (12 × the monthly budget)", amount: -round2(monthlyFixed * 12), strong: true },
      { label: "Break-even sales for a year", amount: yBreakEven ?? undefined, strong: true },
      { label: "Sales a year at this pace ({{days}} days so far)", vars: { days: yDays }, amount: yProjected },
      { label: "Fixed costs for the days so far", amount: -yFixed },
      { label: "Result so far", amount: yResult ?? undefined, strong: true },
    ],
    benchmarks: [
      { label: "A year at the {{period}} average", vars: { period: BENCHMARK_LABEL }, amount: BENCHMARKS.monthlySales * 12 },
    ],
  };

  // Marketing: sales brought in for each pound spent this month
  const marketingBudget = m.budget.find((b) => b.accountCode === m.marketingAcc?.code)?.monthly ?? 0;
  const spentSoFar = m.marketing > 0 ? m.marketing : round2((marketingBudget * daysGone) / daysInMonth);
  const fromBudget = !(m.marketing > 0);
  const roas = div(m.sales, spentSoFar);
  const needed = breakEven !== null && marketingBudget > 0 ? round2(breakEven / Math.max(marketingBudget, m.marketing)) : null;
  const marketingReturn: Metric & { times: number | null; needed: number | null; fromBudget: boolean } = {
    times: roas !== null ? round2(roas) : null,
    needed,
    fromBudget,
    steps: [
      { label: "Net sales this month", amount: m.sales, strong: true },
      fromBudget
        ? { label: "Marketing so far (not recorded yet: {{days}} of {{total}} days of the budget)", vars: { days: daysGone, total: daysInMonth }, amount: spentSoFar }
        : { label: "Marketing recorded this month", amount: spentSoFar, link: m.marketingAcc ? { kind: "account", accountId: m.marketingAcc._id, fromDay: monthStart, toDay: today } : undefined },
      { label: "Sales for each pound of marketing", times: roas !== null ? round2(roas) : undefined, strong: true },
      { label: "Needed to break even (break-even sales ÷ the month's marketing)", times: needed ?? undefined },
    ],
    benchmarks: [
      { label: "Jan–Mar 2026 (about 20k a month of marketing)", times: BENCHMARKS.marketingReturnEarly },
      { label: "Apr–Jul 2026 (about 48k a month of marketing)", times: BENCHMARKS.marketingReturnLate },
    ],
  };

  // Growth: this month at its pace against last month, and the average monthly growth
  const months: { month: string; sales: number }[] = [];
  for (let i = 6; i >= 1; i--) {
    const start = addMonths(today, -i);
    const end = addDays(addMonths(start, 1), -1);
    if (ledgerStart && end < ledgerStart) continue;
    const from = ledgerStart && ledgerStart > start ? ledgerStart : start;
    const s = [...ledgerSalesByDay(db, from, end).values()].reduce((a, b) => a + b, 0);
    // A month the books only partly cover isn't a fair point
    if (from === start) months.push({ month: start.slice(0, 7), sales: round2(s) });
  }
  const last = months.at(-1);
  const growthPct = last && last.sales > 0 ? round2(((projected - last.sales) / last.sales) * 100) : null;
  const cmgr = monthlyGrowthPct(months.map((x) => x.sales));
  const benchCmgr = monthlyGrowthPct(BENCHMARK_MONTHLY_SALES.map((x) => x.sales));
  const growth: Metric & { pct: number | null; monthlyPct: number | null } = {
    pct: growthPct,
    monthlyPct: cmgr !== null ? round2(cmgr) : null,
    steps: [
      { label: "This month at its pace", amount: projected },
      last
        ? { label: "Last month ({{month}})", vars: { month: last.month }, amount: last.sales }
        : { label: "Last month isn't fully in the books yet" },
      { label: "Change", pct: growthPct ?? undefined, strong: true },
      ...months.map((x) => ({ label: "{{month}}", vars: { month: x.month }, amount: x.sales, sub: true })),
      cmgr !== null
        ? { label: "Average growth a month over these months", pct: round2(cmgr), strong: true }
        : { label: "Average growth a month needs two full months in the books" },
    ],
    benchmarks: [
      { label: "Average growth a month, {{period}}", vars: { period: BENCHMARK_LABEL }, pct: benchCmgr !== null ? round2(benchCmgr) : undefined },
    ],
  };

  // Returns: share of sales that came back, and the shipping paid on refused deliveries
  const returnPct = m.grossSales > 0 ? round2((m.returns / m.grossSales) * 100) : null;
  const returnsCost: Metric & { pct: number | null; refused: number; cost: number } = {
    pct: returnPct,
    refused: m.refused,
    cost: round2(m.returns + m.refused),
    steps: [
      { label: "Sales before returns", amount: m.grossSales, link: m.lines.sales[0]?.link },
      { label: "Sales returns", amount: m.returns, link: m.lines.sales[1]?.link },
      { label: "Returned share of sales", pct: returnPct ?? undefined, strong: true },
      {
        label: "Refused-delivery shipping",
        amount: m.refused,
        link: m.refusedAcc ? { kind: "account", accountId: m.refusedAcc._id, fromDay: monthStart, toDay: today } : undefined,
      },
    ],
    benchmarks: [
      { label: "Returned share, {{period}}", vars: { period: BENCHMARK_LABEL }, pct: BENCHMARKS.returnRatePct },
      { label: "Target", pct: BENCHMARKS.returnRateTargetPct },
      { label: "Refused shipping share of sales, {{period}}", vars: { period: BENCHMARK_LABEL }, pct: BENCHMARKS.refusedShippingPct },
    ],
  };

  // Orders: how many went out and their average value, against last month
  const tzRange = { fromDay: monthStart, toDay: today };
  const now = shippedOrders(db, tzRange, tz);
  const lastStart = addMonths(today, -1);
  const lastEnd = addDays(monthStart, -1);
  const prev = shippedOrders(db, { fromDay: lastStart, toDay: lastEnd }, tz);
  const prevDays = daysBetween(lastStart, lastEnd);
  const aov = now.count ? round2(now.value / now.count) : null;
  const prevAov = prev.count ? round2(prev.value / prev.count) : null;
  const ordersMetric: Metric & { aov: number | null; perDay: number; count: number } = {
    aov,
    perDay: round2(now.count / daysGone),
    count: now.count,
    steps: [
      { label: "Orders shipped this month", count: now.count, amount: now.value, link: { kind: "shipped", ...tzRange } },
      { label: "Average order value", amount: aov ?? undefined, strong: true },
      { label: "Orders a day ({{days}} days)", vars: { days: daysGone }, count: round2(now.count / daysGone), strong: true },
    ],
    benchmarks: prev.count
      ? [
          { label: "Last month: average order value", amount: prevAov ?? undefined },
          { label: "Last month: orders a day", count: round2(prev.count / prevDays) },
        ]
      : [],
  };

  return {
    month: { fromDay: monthStart, toDay: today, daysInMonth, daysGone },
    breakEvenMonth,
    breakEvenYear,
    marketingReturn,
    growth,
    returnsCost,
    orders: ordersMetric,
  };
}

export type Performance = ReturnType<typeof performance>;
