import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { cn } from "@/lib/utils.ts";
import { useFormat } from "@/lib/format.ts";
import { tk } from "@/lib/i18n.ts";
import type { FinanceReport } from "./summary-cards.tsx";

const COLUMNS = [
  { key: "revenue", label: tk("Revenue") },
  { key: "costs", label: tk("Cost of sales") },
  { key: "grossProfit", label: tk("Gross profit") },
  { key: "expenses", label: tk("Expenses") },
  { key: "netProfit", label: tk("Net profit") },
] as const;

type Month = FinanceReport["months"][number];
const margin = (revenue: number, gross: number) => (revenue > 0 ? (gross / revenue) * 100 : undefined);

/** Month-by-month P&L of the selected period, newest first, with the period total. */
export default function MonthlyTable({
  months,
  summary,
}: {
  months: Month[];
  summary: FinanceReport["summary"];
}) {
  const totals: Record<(typeof COLUMNS)[number]["key"], number> = {
    revenue: summary.totalRevenue,
    costs: summary.totalCosts,
    grossProfit: summary.grossProfit,
    expenses: summary.totalAdmin,
    netProfit: summary.netProfit,
  };
  const { t } = useTranslation();
  const { formatMoney, formatMonth, formatShortDay, formatPercent } =
    useFormat();
  // Partial first/last months show their clipped days
  const monthLabel = (m: Month) => {
    const fullStart = m.fromDay.endsWith("-01");
    const lastDay = new Date(
      Date.UTC(Number(m.label.slice(0, 4)), Number(m.label.slice(5, 7)), 0),
    ).getUTCDate();
    const fullEnd = Number(m.toDay.slice(8, 10)) === lastDay;
    return fullStart && fullEnd
      ? formatMonth(m.label)
      : `${formatShortDay(m.fromDay)} – ${formatShortDay(m.toDay)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("By month")}</CardTitle>
        <CardDescription>
          {t("The selected period, one row per calendar month")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky start-0 bg-background">
                  {t("Month")}
                </TableHead>
                {COLUMNS.map((c) => (
                  <TableHead key={c.key} className="text-end whitespace-nowrap">
                    {t(c.label)}
                  </TableHead>
                ))}
                <TableHead className="text-end">{t("Margin")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...months].reverse().map((m) => (
                <TableRow key={m.label}>
                  <TableCell className="sticky start-0 bg-background font-medium whitespace-nowrap">
                    {monthLabel(m)}
                  </TableCell>
                  {COLUMNS.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(
                        "text-end whitespace-nowrap tabular-nums",
                        c.key === "netProfit" && "font-semibold",
                        c.key === "netProfit" &&
                          m.netProfit < 0 &&
                          "text-destructive",
                      )}
                    >
                      {formatMoney(m[c.key])}
                    </TableCell>
                  ))}
                  <TableCell className="text-end text-muted-foreground tabular-nums">
                    {formatPercent(margin(m.revenue, m.grossProfit))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {months.length > 1 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="sticky start-0 bg-muted font-semibold">
                    {t("Total")}
                  </TableCell>
                  {COLUMNS.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(
                        "text-end font-semibold whitespace-nowrap tabular-nums",
                        c.key === "netProfit" &&
                          summary.netProfit < 0 &&
                          "text-destructive",
                      )}
                    >
                      {formatMoney(totals[c.key])}
                    </TableCell>
                  ))}
                  <TableCell className="text-end tabular-nums">
                    {formatPercent(summary.marginPct)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
