import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart.tsx";
import type { ChartConfig } from "@/components/ui/chart.tsx";
import { useFormat } from "@/lib/format.ts";
import { tk } from "@/lib/i18n.ts";
import { useLanguage } from "@/components/providers/language.tsx";

type Point = { label: string; total: number };
type Grain = "daily" | "weekly" | "monthly";

const GRAINS: {
  value: Grain;
  label: string;
  description: string;
  aria: string;
}[] = [
  {
    value: "daily",
    label: tk("Day"),
    description: tk("Last 14 days"),
    aria: tk("Sales per day, last 14 days. Total {{total}}."),
  },
  {
    value: "weekly",
    label: tk("Week"),
    description: tk("Last 8 weeks (Monday start)"),
    aria: tk("Sales per week, last 8 weeks (Monday start). Total {{total}}."),
  },
  {
    value: "monthly",
    label: tk("Month"),
    description: tk("Last 6 months"),
    aria: tk("Sales per month, last 6 months. Total {{total}}."),
  },
];

/** Shipped sales over time. One series, so no legend; the title names it. */
export default function SalesChart({
  daily,
  weekly,
  monthly,
}: Record<Grain, Point[]>) {
  const { t } = useTranslation();
  const { dir } = useLanguage();
  const rtl = dir === "rtl";
  const { formatMoney, formatMoneyCompact, formatShortDay, formatMonth } =
    useFormat();
  const chartConfig = {
    total: { label: t("Sales"), color: "var(--chart-2)" },
  } satisfies ChartConfig;
  const [grain, setGrain] = useState<Grain>("daily");
  const series = { daily, weekly, monthly }[grain];

  const tick = (label: string) =>
    grain === "monthly" ? formatMonth(label) : formatShortDay(label);
  const full = (label: string) =>
    grain === "monthly"
      ? formatMonth(label)
      : grain === "weekly"
        ? t("Week of {{day}}", { day: formatShortDay(label) })
        : formatShortDay(label);
  const data = series.map((p) => ({
    ...p,
    tick: tick(p.label),
    full: full(p.label),
  }));
  const total = series.reduce((sum, p) => sum + p.total, 0);
  const meta = GRAINS.find((g) => g.value === grain)!;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Sales")}</CardTitle>
        <CardDescription>
          {t(meta.description)} ·{" "}
          <span className="font-medium text-foreground tabular-nums">
            {formatMoney(total)}
          </span>
        </CardDescription>
        <CardAction>
          <Tabs value={grain} onValueChange={(v) => setGrain(v as Grain)}>
            <TabsList aria-label={t("Group sales by")}>
              {GRAINS.map((g) => (
                <TabsTrigger key={g.value} value={g.value}>
                  {t(g.label)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[240px] w-full"
          role="img"
          aria-label={t(meta.aria, { total: formatMoney(total) })}
        >
          <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.5} />
            <XAxis
              dataKey="tick"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={16}
              reversed={rtl}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={60}
              orientation={rtl ? "right" : "left"}
              tickFormatter={(v: number) => formatMoneyCompact(v)}
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={
                <ChartTooltipContent
                  hideIndicator
                  labelFormatter={(_, payload) =>
                    (payload?.[0]?.payload as { full?: string } | undefined)
                      ?.full
                  }
                  formatter={(value) => (
                    <span className="font-medium text-foreground tabular-nums">
                      {formatMoney(Number(value))}
                    </span>
                  )}
                />
              }
            />
            <Bar
              dataKey="total"
              fill="var(--color-total)"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
            />
          </BarChart>
        </ChartContainer>
        {/* Table view of the same numbers for screen readers */}
        <table className="sr-only">
          <caption>
            {t("Sales")} · {t(meta.description)}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t("Period")}</th>
              <th scope="col">{t("Sales")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.label}>
                <th scope="row">{p.full}</th>
                <td>{formatMoney(p.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
