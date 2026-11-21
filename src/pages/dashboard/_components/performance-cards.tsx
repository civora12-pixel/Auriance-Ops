import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CalendarRange, Megaphone, RotateCcw, Scale, ShoppingBag, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { api, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import { BreakdownDialog, StepsList } from "./breakdown.tsx";
import type { Metric } from "./breakdown.tsx";

type Perf = Output<typeof api.dashboard.performance>;
type Tone = "good" | "bad" | "warn" | undefined;

const TONE: Record<NonNullable<Tone>, string> = {
  good: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-destructive",
};

/** A figure card; tapping it opens the working behind the figure. */
export function MetricCard({
  label,
  value,
  tone,
  icon,
  hint,
  children,
  onOpen,
}: {
  label: string;
  value: string;
  tone?: Tone;
  icon: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block h-full rounded-xl text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label={t("{{label}}: show how it's worked out", { label })}
    >
      <Card className="h-full gap-2 py-4 transition-colors hover:bg-muted/40">
        <CardContent className="space-y-1.5 px-4">
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>{label}</span>
            <span className="[&_svg]:size-4" aria-hidden>
              {icon}
            </span>
          </div>
          <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", tone && TONE[tone])}>{value}</p>
          {children}
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </CardContent>
      </Card>
    </button>
  );
}

function Progress({ pct }: { pct: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
      <div
        className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-600" : pct >= 70 ? "bg-amber-500" : "bg-destructive")}
        style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
      />
    </div>
  );
}

type Open = { title: string; description?: string; metric: Metric } | null;

/** Break-even, marketing return, growth, returns and orders: finance only. */
export function PerformanceCards() {
  const { t } = useTranslation();
  const { formatMoney, formatPercent, formatNumber, formatDay } = useFormat();
  const data = useQuery(api.dashboard.performance, undefined, { refetchInterval: 60_000 });
  const [open, setOpen] = useState<Open>(null);

  if (data === undefined)
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );

  const p: Perf = data;
  const be = p.breakEvenMonth;
  const ye = p.breakEvenYear;
  const mr = p.marketingReturn;
  const signedPct = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${formatPercent(v)}`);

  return (
    <section aria-label={t("Performance")} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <MetricCard
        label={t("Break-even this month")}
        icon={<Scale />}
        value={be.progressPct == null ? "—" : formatPercent(be.progressPct)}
        tone={be.progressPct == null ? undefined : be.progressPct >= 100 ? "good" : "warn"}
        hint={
          be.breakEven == null
            ? t("Shows once this month has sales")
            : be.reachedOn
              ? t("Reached on {{day}}", { day: formatDay(be.reachedOn) })
              : be.perDay != null
                ? t("{{toGo}} to go · about {{perDay}} a day", { toGo: formatMoney(be.toGo), perDay: formatMoney(be.perDay) })
                : t("{{toGo}} short", { toGo: formatMoney(be.toGo) })
        }
        onOpen={() => setOpen({ title: t("Break-even this month"), metric: be })}
      >
        {be.progressPct != null && <Progress pct={be.progressPct} />}
        {be.breakEven != null && (
          <p className="text-xs text-muted-foreground">
            {t("{{sales}} of {{target}} needed", { sales: formatMoney(be.sales), target: formatMoney(be.breakEven) })}
          </p>
        )}
      </MetricCard>

      <MetricCard
        label={t("Year at this pace")}
        icon={<CalendarRange />}
        value={formatMoney(ye.projected)}
        tone={ye.breakEven == null ? undefined : ye.projected >= ye.breakEven ? "good" : "bad"}
        hint={
          ye.breakEven == null
            ? t("Shows once the year has sales")
            : t("Break-even for a year: {{amount}}", { amount: formatMoney(ye.breakEven) })
        }
        onOpen={() =>
          setOpen({
            title: t("Break-even for the year"),
            description: t("From {{day}} to today", { day: formatDay(ye.fromDay) }),
            metric: ye,
          })
        }
      />

      <MetricCard
        label={t("Sales per pound of marketing")}
        icon={<Megaphone />}
        value={mr.times == null || be.sales <= 0 ? "—" : `${formatNumber(mr.times)}×`}
        tone={mr.times == null || mr.needed == null ? undefined : mr.times >= mr.needed ? "good" : "bad"}
        hint={
          be.sales <= 0
            ? t("Shows once this month has sales")
            : mr.needed == null
            ? t("Set the marketing budget to compare")
            : t("Needs {{times}}× to break even", { times: formatNumber(mr.needed) })
        }
        onOpen={() => setOpen({ title: t("Sales per pound of marketing"), metric: mr })}
      />

      <MetricCard
        label={t("Growth on last month")}
        icon={<TrendingUp />}
        value={signedPct(p.growth.pct)}
        tone={p.growth.pct == null ? undefined : p.growth.pct >= 0 ? "good" : "bad"}
        hint={
          p.growth.monthlyPct == null
            ? t("Average growth shows after two full months")
            : t("Average {{pct}} a month", { pct: signedPct(p.growth.monthlyPct) })
        }
        onOpen={() => setOpen({ title: t("Growth"), description: t("This month at its current pace"), metric: p.growth })}
      />

      <MetricCard
        label={t("Returns this month")}
        icon={<RotateCcw />}
        value={formatPercent(p.returnsCost.pct)}
        tone={p.returnsCost.pct == null ? undefined : p.returnsCost.pct <= 10 ? "good" : p.returnsCost.pct <= 15 ? "warn" : "bad"}
        hint={t("{{amount}} returned · {{refused}} refused shipping", {
          amount: formatMoney(p.returnsCost.cost - p.returnsCost.refused),
          refused: formatMoney(p.returnsCost.refused),
        })}
        onOpen={() => setOpen({ title: t("Returns this month"), metric: p.returnsCost })}
      />

      <MetricCard
        label={t("Average order value")}
        icon={<ShoppingBag />}
        value={formatMoney(p.orders.aov)}
        hint={t("{{count}} orders this month · {{perDay}} a day", {
          count: formatNumber(p.orders.count),
          perDay: formatNumber(p.orders.perDay),
        })}
        onOpen={() => setOpen({ title: t("Orders this month"), metric: p.orders })}
      />

      {open && (
        <BreakdownDialog title={open.title} description={open.description} onClose={() => setOpen(null)}>
          <StepsList steps={open.metric.steps} benchmarks={open.metric.benchmarks} />
        </BreakdownDialog>
      )}
    </section>
  );
}
