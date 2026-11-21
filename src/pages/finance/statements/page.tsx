import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { isValidDay } from "@shared/dates.ts";
import { useUrlState } from "@/components/data-table.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { TableSkeleton } from "@/components/states.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { api, useQuery } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";

type Row = { account: { _id: string; code: number; name: string }; amount: number };

/** Finance → Statements: profit and loss, balance sheet, trial balance and partners. */
export default function StatementsPage() {
  const { t } = useTranslation();
  const { today } = useFormat();
  const now = today();
  const [state, update] = useUrlState({
    tab: "pl",
    from: `${now.slice(0, 7)}-01`,
    to: now,
    asof: now,
  });
  const from = isValidDay(state.from) ? state.from : `${now.slice(0, 7)}-01`;
  const to = isValidDay(state.to) ? state.to : now;
  const asOf = isValidDay(state.asof) ? state.asof : now;
  const ranged = state.tab === "pl" || state.tab === "partners";

  return (
    <PageBody>
      <PageHeader
        title={t("Statements")}
        description={t("Built from the journal: automatic entries, your entries and the monthly closings.")}
        actions={
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            {t("Print")}
          </Button>
        }
      />
      <Tabs value={state.tab} onValueChange={(tab) => update({ tab })}>
        <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
          <TabsList>
            <TabsTrigger value="pl">{t("Profit & loss")}</TabsTrigger>
            <TabsTrigger value="bs">{t("Balance sheet")}</TabsTrigger>
            <TabsTrigger value="tb">{t("Trial balance")}</TabsTrigger>
            <TabsTrigger value="partners">{t("Partners")}</TabsTrigger>
          </TabsList>
          {ranged ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="st-from" className="text-xs text-muted-foreground">
                  {t("From")}
                </Label>
                <Input id="st-from" type="date" value={from} onChange={(e) => update({ from: e.target.value })} className="w-40" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="st-to" className="text-xs text-muted-foreground">
                  {t("To")}
                </Label>
                <Input id="st-to" type="date" value={to} onChange={(e) => update({ to: e.target.value })} className="w-40" />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="st-asof" className="text-xs text-muted-foreground">
                {t("As of")}
              </Label>
              <Input id="st-asof" type="date" value={asOf} onChange={(e) => update({ asof: e.target.value })} className="w-40" />
            </div>
          )}
        </div>
        <TabsContent value="pl" className="mt-4">
          <IncomeStatement from={from} to={to} />
        </TabsContent>
        <TabsContent value="bs" className="mt-4">
          <BalanceSheet asOf={asOf} />
        </TabsContent>
        <TabsContent value="tb" className="mt-4">
          <TrialBalance asOf={asOf} />
        </TabsContent>
        <TabsContent value="partners" className="mt-4">
          <Partners from={from} to={to} />
        </TabsContent>
      </Tabs>
    </PageBody>
  );
}

function Section({ title, rows, total, negate }: { title: string; rows: Row[]; total: number; negate?: boolean }) {
  const { formatMoney } = useFormat();
  const sign = negate ? -1 : 1;
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={2} className="font-semibold">
          {title}
        </TableCell>
      </TableRow>
      {rows.map((r) => (
        <TableRow key={r.account._id}>
          <TableCell className="ps-6">
            <Link to={`/finance/accounts/${r.account._id}`} className="hover:underline">
              <span className="font-mono text-xs text-muted-foreground">{r.account.code}</span> {r.account.name}
            </Link>
          </TableCell>
          <TableCell className="text-end tabular-nums">{formatMoney(sign * r.amount)}</TableCell>
        </TableRow>
      ))}
      <TableRow>
        <TableCell className="ps-6 font-medium">{title}</TableCell>
        <TableCell className="text-end font-medium tabular-nums">{formatMoney(sign * total)}</TableCell>
      </TableRow>
    </>
  );
}

function Total({ label, value, tone }: { label: string; value: number; tone?: boolean }) {
  const { formatMoney } = useFormat();
  return (
    <TableRow className="border-t-2">
      <TableCell className="font-semibold">{label}</TableCell>
      <TableCell
        className={cn(
          "text-end font-semibold tabular-nums",
          tone && (value >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"),
        )}
      >
        {formatMoney(value)}
      </TableCell>
    </TableRow>
  );
}

function IncomeStatement({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation();
  const data = useQuery(api.finance.statements.incomeStatement, { fromDay: from, toDay: to }, { keepPrevious: true });
  if (!data) return <TableSkeleton rows={8} />;
  return (
    <Card className="py-0">
      <CardContent className="px-0">
        <Table>
          <TableBody>
            <Section title={t("Revenue")} rows={data.revenue} total={data.totalRevenue} />
            <Section title={t("Cost of sales")} rows={data.costs} total={data.totalCosts} negate />
            <Total label={t("Gross profit")} value={data.grossProfit} tone />
            <Section title={t("Selling & admin expenses")} rows={data.admin} total={data.totalAdmin} negate />
            <Total label={data.netProfit >= 0 ? t("Net profit") : t("Net loss")} value={data.netProfit} tone />
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function BalanceSheet({ asOf }: { asOf: string }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const data = useQuery(api.finance.statements.balanceSheet, { asOfDay: asOf }, { keepPrevious: true });
  if (!data) return <TableSkeleton rows={8} />;
  return (
    <div className="grid gap-4">
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableBody>
              <Section title={t("Assets")} rows={data.assets} total={data.totalAssets} />
              <Section title={t("Liabilities")} rows={data.liabilities} total={data.totalLiabilities} />
              <Section title={t("Equity")} rows={data.equity} total={data.totalEquity - data.unclosed} />
              {Math.abs(data.unclosed) >= 0.005 && (
                <TableRow>
                  <TableCell className="ps-6 italic">{t("Profit or loss not closed yet")}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatMoney(data.unclosed)}</TableCell>
                </TableRow>
              )}
              <Total label={t("Liabilities + equity")} value={data.totalLiabilities + data.totalEquity} />
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className={cn("text-sm", data.balanced ? "text-muted-foreground" : "font-medium text-destructive")}>
        {data.balanced
          ? t("Balanced: assets equal liabilities plus equity.")
          : t("Not balanced: check the journal for a problem.")}
      </p>
    </div>
  );
}

function TrialBalance({ asOf }: { asOf: string }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const data = useQuery(api.finance.statements.trialBalance, { asOfDay: asOf }, { keepPrevious: true });
  if (!data) return <TableSkeleton rows={8} />;
  return (
    <Card className="py-0">
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Account")}</TableHead>
              <TableHead className="text-end">{t("Debit")}</TableHead>
              <TableHead className="text-end">{t("Credit")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.lines.map((l) => (
              <TableRow key={l.account._id}>
                <TableCell>
                  <Link to={`/finance/accounts/${l.account._id}`} className="hover:underline">
                    <span className="font-mono text-xs text-muted-foreground">{l.account.code}</span> {l.account.name}
                  </Link>
                </TableCell>
                <TableCell className="text-end tabular-nums">{l.debit ? formatMoney(l.debit) : ""}</TableCell>
                <TableCell className="text-end tabular-nums">{l.credit ? formatMoney(l.credit) : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>{t("Total")}</TableCell>
              <TableCell className="text-end tabular-nums">{formatMoney(data.debit)}</TableCell>
              <TableCell className="text-end tabular-nums">{formatMoney(data.credit)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

function Partners({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const data = useQuery(api.finance.statements.partnerStatement, { fromDay: from, toDay: to }, { keepPrevious: true });
  if (!data) return <TableSkeleton rows={8} />;
  const sum = (pick: (r: NonNullable<typeof data>[number]) => number) => data.reduce((s, r) => s + pick(r), 0);
  return (
    <Card className="py-0">
      <CardContent className="overflow-x-auto px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Partner")}</TableHead>
              <TableHead className="text-end">{t("Start")}</TableHead>
              <TableHead className="text-end">{t("Share of results")}</TableHead>
              <TableHead className="text-end">{t("Withdrawn")}</TableHead>
              <TableHead className="text-end">{t("Other")}</TableHead>
              <TableHead className="text-end">{t("End")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r) => (
              <TableRow key={r.account._id}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-end tabular-nums">{formatMoney(r.opening)}</TableCell>
                <TableCell className={cn("text-end tabular-nums", r.share < 0 && "text-destructive")}>
                  {formatMoney(r.share)}
                </TableCell>
                <TableCell className="text-end tabular-nums">{formatMoney(-r.withdrawn)}</TableCell>
                <TableCell className="text-end tabular-nums">{formatMoney(r.other)}</TableCell>
                <TableCell className="text-end font-medium tabular-nums">{formatMoney(r.closing)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>{t("Total")}</TableCell>
              <TableCell className="text-end tabular-nums">{formatMoney(sum((r) => r.opening))}</TableCell>
              <TableCell className="text-end tabular-nums">{formatMoney(sum((r) => r.share))}</TableCell>
              <TableCell className="text-end tabular-nums">{formatMoney(-sum((r) => r.withdrawn))}</TableCell>
              <TableCell className="text-end tabular-nums">{formatMoney(sum((r) => r.other))}</TableCell>
              <TableCell className="text-end tabular-nums">{formatMoney(sum((r) => r.closing))}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
