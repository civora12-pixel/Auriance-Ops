import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Lightbulb, Wallet } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { useUrlState } from "@/components/data-table.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { TableSkeleton } from "@/components/states.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart.tsx";
import type { ChartConfig } from "@/components/ui/chart.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { useLanguage } from "@/components/providers/language.tsx";
import { api, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";

type CashFlow = Output<typeof api.finance.report.cashFlow>;
type Item = CashFlow["buckets"][number]["items"][number];
type Tip = CashFlow["tips"][number];

const WEEK_CHOICES = ["4", "8", "12"] as const;

/**
 * Finance → Cash flow: cash on hand, then money in and out week by week on its
 * due date, with the weeks where cash would run short. Paid and settled amounts
 * drop out by themselves, and the page refreshes on its own.
 */
export default function CashFlowPage() {
  const { t } = useTranslation();
  const [state, update] = useUrlState({ weeks: "8" });
  const weeks = WEEK_CHOICES.includes(state.weeks as (typeof WEEK_CHOICES)[number]) ? Number(state.weeks) : 8;
  const data = useQuery(api.finance.report.cashFlow, { weeks });

  return (
    <PageBody>
      <PageHeader
        title={t("Cash flow")}
        description={t("Money coming in and going out on its due date, from today. Paid amounts drop off by themselves.")}
        actions={
          <ToggleGroup
            type="single"
            variant="outline"
            value={String(weeks)}
            onValueChange={(v) => v && update({ weeks: v })}
            aria-label={t("Weeks ahead")}
          >
            {WEEK_CHOICES.map((w) => (
              <ToggleGroupItem key={w} value={w} className="px-3">
                {t("{{n}} weeks", { n: w })}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />
      {data === undefined ? <TableSkeleton /> : <CashFlowBody data={data} />}
    </PageBody>
  );
}

function CashFlowBody({ data }: { data: CashFlow }) {
  const { t } = useTranslation();
  const { formatMoney, formatDay } = useFormat();
  const low = data.totals.lowest;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Wallet} label={t("Cash now")} value={formatMoney(data.startCash)} hint={t("Bank, wallet and cash accounts")} />
        <Kpi
          icon={ArrowDownLeft}
          label={t("Coming in")}
          value={formatMoney(data.totals.inflow)}
          hint={data.totals.overdue > 0 ? t("{{amount}} of it overdue", { amount: formatMoney(data.totals.overdue) }) : t("Courier collections")}
        />
        <Kpi icon={ArrowUpRight} label={t("Going out")} value={formatMoney(data.totals.outflow)} hint={t("Credit card and dated payables")} />
        <Kpi
          icon={AlertTriangle}
          label={t("Lowest balance")}
          value={formatMoney(low.amount)}
          hint={t("Week of {{day}}", { day: formatDay(low.from) })}
          danger={low.amount < 0}
        />
      </div>

      {data.gaps.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("Cash runs short in {{n}} of the next {{weeks}} weeks", { n: data.gaps.length, weeks: data.weeks })}</AlertTitle>
          <AlertDescription>
            <ul className="grid gap-0.5">
              {data.gaps.map((g) => (
                <li key={g.from}>
                  {t("{{from}} – {{to}}: short by {{amount}}", {
                    from: formatDay(g.from),
                    to: formatDay(g.to),
                    amount: formatMoney(g.shortBy),
                  })}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <FlowChart data={data} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Tips tips={data.tips} />
        <Outside data={data} />
      </div>

      <Weeks data={data} />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  danger?: boolean;
}) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="size-4" />
          {label}
        </CardDescription>
        <CardTitle className={cn("text-2xl tabular-nums", danger && "text-destructive")}>{value}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

function FlowChart({ data }: { data: CashFlow }) {
  const { t } = useTranslation();
  const rtl = useLanguage().dir === "rtl";
  const { formatMoney, formatMoneyCompact, formatShortDay } = useFormat();
  const config = {
    inflow: { label: t("Coming in"), color: "var(--chart-2)" },
    outflow: { label: t("Going out"), color: "var(--chart-1)" },
    closing: { label: t("Cash at week end"), color: "var(--chart-3)" },
  } satisfies ChartConfig;
  const rows = data.buckets.map((b) => ({ week: formatShortDay(b.from), inflow: b.inflow, outflow: b.outflow, closing: b.closing }));
  const negative = data.buckets.some((b) => b.closing < 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Week by week")}</CardTitle>
        <CardDescription>{t("Bars: money in and out each week. Line: cash left at the end of the week.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={config}
          className="aspect-auto h-[280px] w-full"
          role="img"
          aria-label={t("Money in, money out and cash left for each week. The same figures are listed below.")}
        >
          <ComposedChart data={rows} margin={{ left: rtl ? 12 : 4, right: rtl ? 4 : 12, top: 8 }} barGap={2}>
            <CartesianGrid vertical={false} strokeOpacity={0.5} />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} reversed={rtl} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              orientation={rtl ? "right" : "left"}
              tickFormatter={(v: number) => formatMoneyCompact(v)}
            />
            {negative && <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="4 4" />}
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="size-2.5 rounded-[2px]" style={{ background: `var(--color-${String(name)})` }} aria-hidden />
                        {config[name as keyof typeof config]?.label ?? name}
                      </span>
                      <span className="font-medium text-foreground tabular-nums">{formatMoney(Number(value))}</span>
                    </div>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="inflow" fill="var(--color-inflow)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="outflow" fill="var(--color-outflow)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Line dataKey="closing" type="monotone" stroke="var(--color-closing)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function useTipText() {
  const { t } = useTranslation();
  const { formatMoney, formatDay } = useFormat();
  const money = (v: string | number) => formatMoney(Number(v));
  return (tip: Tip) => {
    const v = tip.vars;
    switch (tip.key) {
      case "gap":
        return t("Cash runs short by {{amount}} in the week of {{day}}. Follow up on courier money, ship waiting orders sooner, or plan extra funds before then.", {
          amount: money(v.short),
          day: formatDay(String(v.from)),
        });
      case "overdue":
        return t("{{amount}} of courier money is overdue ({{n}} orders). Ask the courier about it.", { amount: money(v.amount), n: v.n });
      case "pay_ok":
        return t("{{amount}} is due on {{day}} ({{what}}). There's enough cash for it.", {
          amount: money(v.amount),
          day: formatDay(String(v.day)),
          what: v.label === "card" ? t("Credit card") : v.label,
        });
      case "pay_short":
        return t("{{amount}} is due on {{day}} ({{what}}) and cash won't cover it in time.", {
          amount: money(v.amount),
          day: formatDay(String(v.day)),
          what: v.label === "card" ? t("Credit card") : v.label,
        });
      case "unshipped":
        return t("{{amount}} of the money expected depends on orders that aren't shipped yet. Shipping them on time keeps this plan.", {
          amount: money(v.amount),
        });
      case "undated_ok":
        return t("{{amount}} is owed with no due date. Even your lowest balance could cover it.", { amount: money(v.amount) });
      case "undated_wait":
        return t("{{amount}} is owed with no due date. Better to wait for collections before paying it.", { amount: money(v.amount) });
      case "healthy":
        return t("No gaps ahead. The lowest your cash gets is {{amount}}, around {{day}}.", {
          amount: money(v.lowest),
          day: formatDay(String(v.day)),
        });
      default:
        return tip.key;
    }
  };
}

function Tips({ tips }: { tips: Tip[] }) {
  const { t } = useTranslation();
  const text = useTipText();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="size-4" />
          {t("Suggestions")}
        </CardTitle>
        <CardDescription>{t("From the numbers above. The decisions are yours.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid list-disc gap-2 ps-5 text-sm">
          {tips.map((tip) => (
            <li key={tip.key}>{text(tip)}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Outside({ data }: { data: CashFlow }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const Row = ({ label, amount, to }: { label: string; amount: number; to?: string }) => (
    <li className="flex justify-between gap-3 text-sm">
      {to ? (
        <Link to={to} className="hover:underline">
          {label}
        </Link>
      ) : (
        <span>{label}</span>
      )}
      <span className="tabular-nums">{formatMoney(amount)}</span>
    </li>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Not in the timeline")}</CardTitle>
        <CardDescription>{t("Amounts with no due date, or due after these weeks.")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">{t("Owed, no due date")}</h3>
          {data.owedUndated.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nothing")}</p>
          ) : (
            <ul className="grid gap-1">
              {data.owedUndated.map((a) => (
                <Row key={a.code} label={`${a.code} · ${t(a.name)}`} amount={a.balance} />
              ))}
            </ul>
          )}
        </div>
        <ul className="grid gap-1 border-t pt-3">
          {data.untrackedCourierMoney > 0 && (
            <Row label={t("Courier money from before the app (no order to date it)")} amount={data.untrackedCourierMoney} />
          )}
          <Row label={t("Coming in after these weeks")} amount={data.later.inflow} />
          <Row label={t("Going out after these weeks")} amount={data.later.outflow} />
        </ul>
        <div className="grid gap-1.5 border-t pt-3">
          <h3 className="text-xs font-medium text-muted-foreground">{t("Cash now, by account")}</h3>
          <ul className="grid gap-1">
            {data.cashAccounts.map((a) => (
              <Row key={a.code} label={`${a.code} · ${t(a.name)}`} amount={a.balance} />
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function Weeks({ data }: { data: CashFlow }) {
  const { t } = useTranslation();
  const { formatMoney, formatDay } = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("What's in each week")}</CardTitle>
        <CardDescription>{t("Anything already overdue is counted in the first week.")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {data.buckets.map((b, i) => (
          <details key={b.from} className="group rounded-lg border" open={i === 0 && b.items.length > 0 && b.items.length <= 12}>
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
              <span className="font-medium">
                {formatDay(b.from)} – {formatDay(b.to)}
                {b.closing < 0 && (
                  <Badge variant="destructive" className="ms-2">
                    {t("Short")}
                  </Badge>
                )}
              </span>
              <span className="flex flex-wrap gap-x-4 tabular-nums text-muted-foreground">
                <span>
                  {t("In")} {formatMoney(b.inflow)}
                </span>
                <span>
                  {t("Out")} {formatMoney(b.outflow)}
                </span>
                <span className={cn("font-medium text-foreground", b.closing < 0 && "text-destructive")}>
                  {t("Cash")} {formatMoney(b.closing)}
                </span>
              </span>
            </summary>
            {b.items.length === 0 ? (
              <p className="border-t px-3 py-2 text-sm text-muted-foreground">{t("Nothing due this week.")}</p>
            ) : (
              <ul className="grid divide-y border-t">
                {b.items.map((item, j) => (
                  <FlowRow key={`${item.orderId ?? item.entryId ?? item.kind}-${j}`} item={item} />
                ))}
              </ul>
            )}
          </details>
        ))}
      </CardContent>
    </Card>
  );
}

function FlowRow({ item }: { item: Item }) {
  const { t } = useTranslation();
  const { formatMoney, formatDay } = useFormat();
  const kind = {
    collection: t("Courier collection"),
    expected_collection: t("Not shipped yet"),
    card: t("Credit card"),
    payable: t("Payable"),
  }[item.kind];
  const label = item.kind === "card" ? t("Credit card") : item.label;
  const to = item.orderId ? `/orders/${item.orderId}` : item.entryId ? "/finance/journal" : undefined;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="tabular-nums text-muted-foreground">{formatDay(item.day)}</span>
        {to ? (
          <Link to={to} className="truncate hover:underline" dir="auto">
            {label}
          </Link>
        ) : (
          <span dir="auto">{label}</span>
        )}
        <Badge variant="outline" className="font-normal">
          {kind}
        </Badge>
        {item.overdue && <Badge variant="destructive">{t("Overdue")}</Badge>}
      </span>
      <span className={cn("tabular-nums", item.amount < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>
        {item.amount < 0 ? "−" : "+"}
        {formatMoney(Math.abs(item.amount))}
      </span>
    </li>
  );
}
