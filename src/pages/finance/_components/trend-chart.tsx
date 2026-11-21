import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart.tsx";
import type { ChartConfig } from "@/components/ui/chart.tsx";
import { useFormat } from "@/lib/format.ts";
import { useLanguage } from "@/components/providers/language.tsx";
import type { FinanceReport } from "./summary-cards.tsx";

const SERIES = ["netRevenue", "expenses", "netProfit"] as const;

/** 12 months ending with the period's last month. All series share one money axis. */
export default function TrendChart({
  trend,
}: {
  trend: FinanceReport["trend"];
}) {
  const { t } = useTranslation();
  const rtl = useLanguage().dir === "rtl";
  const { formatMoney, formatMoneyCompact, formatMonth } = useFormat();
  const chartConfig = {
    netRevenue: { label: t("Net revenue"), color: "var(--chart-2)" },
    expenses: { label: t("Expenses"), color: "var(--chart-1)" },
    netProfit: { label: t("Net profit"), color: "var(--chart-3)" },
  } satisfies ChartConfig;
  const data = trend.map((m) => ({ ...m, month: formatMonth(m.label) }));
  const hasNegative = trend.some((m) => m.netProfit < 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("12-month trend")}</CardTitle>
        <CardDescription>
          {trend.length > 0 &&
            `${formatMonth(trend[0].label)} – ${formatMonth(trend[trend.length - 1].label)}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[260px] w-full"
          role="img"
          aria-label={t(
            "Net revenue, expenses and net profit per month for the last 12 months. The monthly figures are in the table below.",
          )}
        >
          <LineChart
            data={data}
            margin={{ left: rtl ? 12 : 4, right: rtl ? 4 : 12, top: 8 }}
          >
            <CartesianGrid vertical={false} strokeOpacity={0.5} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              reversed={rtl}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              orientation={rtl ? "right" : "left"}
              tickFormatter={(v: number) => formatMoneyCompact(v)}
            />
            {hasNegative && <ReferenceLine y={0} stroke="var(--border)" />}
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                          className="size-2.5 rounded-[2px]"
                          style={{ background: `var(--color-${String(name)})` }}
                          aria-hidden
                        />
                        {chartConfig[name as keyof typeof chartConfig]?.label ??
                          name}
                      </span>
                      <span className="font-medium text-foreground tabular-nums">
                        {formatMoney(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {SERIES.map((key) => (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
