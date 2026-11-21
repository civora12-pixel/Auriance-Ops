import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { cn } from "@/lib/utils.ts";
import { useFormat } from "@/lib/format.ts";
import type { Output, api } from "@/lib/api.ts";

export type FinanceReport = Output<typeof api.finance.report.report>;
type Summary = FinanceReport["summary"];
type Row = Summary["revenue"][number];

function Line({
  label,
  value,
  strong,
  muted,
  to,
}: {
  label: ReactNode;
  value: number;
  strong?: boolean;
  muted?: boolean;
  to?: string;
}) {
  const { formatMoney } = useFormat();
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 text-sm",
        strong && "mt-1 border-t pt-2 text-base font-semibold",
        muted && "text-muted-foreground",
      )}
    >
      {to ? (
        <Link to={to} className="hover:underline">
          {label}
        </Link>
      ) : (
        <span>{label}</span>
      )}
      <span className={cn("tabular-nums", strong && value < 0 && "text-destructive")}>{formatMoney(value)}</span>
    </div>
  );
}

function KpiCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <p
          className={cn(
            "text-2xl font-semibold tabular-nums tracking-tight",
            tone === "good" && "text-chart-3",
            tone === "bad" && "text-destructive",
          )}
        >
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function KpiRow({ report }: { report: FinanceReport }) {
  const { t } = useTranslation();
  const { formatMoney, formatPercent } = useFormat();
  const { summary } = report;
  const overdue = report.due.receivables.overdue;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard label={t("Revenue")} value={formatMoney(summary.totalRevenue)} hint={t("Sales after returns")} />
      <KpiCard
        label={t("Gross profit")}
        value={formatMoney(summary.grossProfit)}
        hint={
          summary.marginPct === undefined
            ? t("No revenue in this period")
            : t("{{margin}} margin", { margin: formatPercent(summary.marginPct) })
        }
      />
      <KpiCard
        label={t("Net profit")}
        value={formatMoney(summary.netProfit)}
        hint={t("After cost of sales and expenses")}
        tone={summary.netProfit > 0 ? "good" : summary.netProfit < 0 ? "bad" : undefined}
      />
      <KpiCard
        label={t("Receivables")}
        value={formatMoney(report.receivableBalance)}
        hint={
          overdue.count
            ? t("{{count}} orders overdue ({{amount}})", { count: overdue.count, amount: formatMoney(overdue.amount) })
            : t("Owed by the courier today; none overdue")
        }
      />
    </div>
  );
}

const accountLink = (r: Row) => `/finance/accounts/${r.account._id}`;
const accountName = (r: Row) => (
  <>
    <span className="font-mono text-xs text-muted-foreground">{r.account.code}</span> {r.account.name}
  </>
);

/** The period's profit and loss, account by account (the same as Statements). */
export function ProfitAndLossCard({ summary }: { summary: Summary }) {
  const { t } = useTranslation();
  const { formatPercent } = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Profit and loss")}</CardTitle>
        <CardDescription>{t("From the journal, the same as Statements")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {summary.revenue.map((r) => (
          <Line key={r.account._id} label={accountName(r)} value={r.amount} to={accountLink(r)} muted />
        ))}
        <Line label={t("Revenue")} value={summary.totalRevenue} strong />
        {summary.costs.map((r) => (
          <Line key={r.account._id} label={accountName(r)} value={-r.amount} to={accountLink(r)} muted />
        ))}
        <Line
          label={
            <>
              {t("Gross profit")}
              {summary.marginPct !== undefined && (
                <span className="ms-1.5 text-xs font-normal text-muted-foreground">
                  {t("{{margin}} margin", { margin: formatPercent(summary.marginPct) })}
                </span>
              )}
            </>
          }
          value={summary.grossProfit}
          strong
        />
        {summary.admin.map((r) => (
          <Line key={r.account._id} label={accountName(r)} value={-r.amount} to={accountLink(r)} muted />
        ))}
        <Line label={summary.netProfit >= 0 ? t("Net profit") : t("Net loss")} value={summary.netProfit} strong />
      </CardContent>
    </Card>
  );
}

/** Selling and admin expenses by account, biggest first. */
export function ExpensesByAccountCard({ summary }: { summary: Summary }) {
  const { t } = useTranslation();
  const { formatMoney, formatPercent } = useFormat();
  const rows = [...summary.admin].sort((a, b) => b.amount - a.amount);
  const total = summary.totalAdmin;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Expenses by account")}</CardTitle>
        <CardDescription>{t("Selling and admin expenses in this period")}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No expenses in this period.")}</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const pct = total > 0 ? (r.amount / total) * 100 : 0;
              return (
                <li key={r.account._id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <Link to={accountLink(r)} className="hover:underline">
                      {r.account.name}
                    </Link>
                    <span className="tabular-nums">
                      {formatMoney(r.amount)}
                      <span className="ms-1.5 text-xs text-muted-foreground">{formatPercent(pct)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
