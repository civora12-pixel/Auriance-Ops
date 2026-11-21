/** One line of the working behind a dashboard figure (see server/lib/performance.ts). */
export type StepLink =
  | { kind: "account"; accountId: string; fromDay: string; toDay: string }
  | { kind: "shipped"; fromDay: string; toDay: string };
export type Step = {
  /** English text, translated on the page; {{…}} placeholders come from `vars` */
  label: string;
  vars?: Record<string, string | number>;
  amount?: number;
  pct?: number;
  times?: number;
  count?: number;
  link?: StepLink;
  /** A subtotal or result line */
  strong?: boolean;
  sub?: boolean;
};
export type Benchmark = {
  label: string;
  vars?: Record<string, string | number>;
  amount?: number;
  pct?: number;
  times?: number;
  count?: number;
};
export type Metric = { steps: Step[]; benchmarks: Benchmark[] };
