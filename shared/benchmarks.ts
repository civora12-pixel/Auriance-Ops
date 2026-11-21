/**
 * What "normal" looked like before the app: monthly figures from the
 * accounting workbook (Civora_Accounting.xlsx, January–July 2026), with every
 * return moved back to the month of its sale (matched by invoice number) and
 * July allowed its late returns at the April–June rate. Used as the yardstick
 * on the dashboard until the app has enough history of its own.
 */
export const BENCHMARK_LABEL = "Jan–Jul 2026, before the app";

/** Net sales (sales − returns) per month, EGP. */
export const BENCHMARK_MONTHLY_SALES: { month: string; sales: number }[] = [
  { month: "2026-01", sales: 131735 },
  { month: "2026-02", sales: 102326 },
  { month: "2026-03", sales: 78480 },
  { month: "2026-04", sales: 170608 },
  { month: "2026-05", sales: 125285 },
  { month: "2026-06", sales: 121540 },
  { month: "2026-07", sales: 138950 },
];

export const BENCHMARKS = {
  /** Average net sales a month */
  monthlySales: 124132,
  /** What's left of each pound of sales after the goods, packing and per-order costs */
  contributionPct: 41.1,
  /** Share of sales (before returns) that came back */
  returnRatePct: 14.7,
  /** Refused-delivery shipping as a share of net sales */
  refusedShippingPct: 1.4,
  /** Sales per pound of marketing: Jan–Mar (20k a month) and Apr–Jul (48k a month) */
  marketingReturnEarly: 5.1,
  marketingReturnLate: 2.9,
  /** Target return rate */
  returnRateTargetPct: 10,
} as const;

/** Average compound growth a month between the first and last month of a series (null under two months). */
export function monthlyGrowthPct(series: number[]): number | null {
  const s = series.filter((v) => v > 0);
  if (s.length < 2) return null;
  return (Math.pow(s[s.length - 1] / s[0], 1 / (s.length - 1)) - 1) * 100;
}
