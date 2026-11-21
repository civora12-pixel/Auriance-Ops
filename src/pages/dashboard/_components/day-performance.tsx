import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { addDays } from "@shared/dates.ts";
import { MoneyInput } from "@/components/number-input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { useLanguage } from "@/components/providers/language.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { parseNumber } from "@/lib/forms.ts";
import { cn } from "@/lib/utils.ts";
import { linkTo } from "../_lib/links.ts";
import { SalesCheckDialog } from "./breakdown.tsx";

type Day = Output<typeof api.dashboard.dayPerformance>;
type BudgetItem = Output<typeof api.dashboard.dayBudget>[number];

/**
 * Day performance: one day's profit or loss at a glance. Sales and cost of
 * goods come from that day's entries (recorded later too); fixed costs that
 * are booked at month end count as 1/30 of their monthly budget; other costs
 * recorded on that date are added.
 */
export function DayPerformance({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const rtl = useLanguage().dir === "rtl";
  const { formatDay, today } = useFormat();
  const [day, setDay] = useState(today());
  const [editing, setEditing] = useState(false);
  const data = useQuery(api.dashboard.dayPerformance, { day }, { keepPrevious: true });
  const isToday = day === (data?.today ?? today());
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-5" />
          {t("Day performance")}
        </CardTitle>
        <CardDescription className="col-start-1">
          {t("Sales and cost of goods for the day, with a day's share (1/30) of the monthly fixed costs.")}
        </CardDescription>
        {/* On phones the date controls sit under the title so the next-day button stays on screen */}
        <CardAction className="col-start-1 row-span-1 row-start-3 flex items-center gap-1 justify-self-start sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end">
          <Button variant="outline" size="icon" aria-label={t("Previous day")} onClick={() => setDay(addDays(day, -1))}>
            <Prev />
          </Button>
          <Input
            type="date"
            value={day}
            max={data?.today}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            className="h-9 w-[9.5rem]"
            aria-label={t("Day")}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label={t("Next day")}
            disabled={isToday}
            onClick={() => setDay(addDays(day, 1))}
          >
            <Next />
          </Button>
          {!isToday && (
            <Button variant="ghost" size="sm" onClick={() => setDay(data?.today ?? today())}>
              {t("Today")}
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {data === undefined ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <Body data={data} canEdit={canEdit} onEdit={() => setEditing(true)} label={formatDay(day)} />
        )}
      </CardContent>
      {editing && <BudgetDialog onClose={() => setEditing(false)} />}
    </Card>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
  sub,
}: {
  label: React.ReactNode;
  value: string;
  strong?: boolean;
  tone?: "good" | "bad" | "muted";
  sub?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3",
        sub ? "ps-4 text-xs text-muted-foreground" : "text-sm",
        strong && "border-t pt-2 font-semibold",
      )}
    >
      <span className="min-w-0">{label}</span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          tone === "good" && "text-emerald-700 dark:text-emerald-400",
          tone === "bad" && "text-destructive",
          tone === "muted" && "text-muted-foreground line-through decoration-1",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** A line that opens its account's entries for the day. */
function Ledger({ id, day, children }: { id: string; day: string; children: React.ReactNode }) {
  return (
    <Link to={linkTo({ kind: "account", accountId: id, fromDay: day, toDay: day })} className="underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

function Body({ data, canEdit, onEdit, label }: { data: Day; canEdit: boolean; onEdit: () => void; label: string }) {
  const { t } = useTranslation();
  const { formatMoney, formatPercent } = useFormat();
  const minus = (n: number) => formatMoney(-n);
  const profit = data.result >= 0;
  const [check, setCheck] = useState(false);
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
      {check && <SalesCheckDialog fromDay={data.day} toDay={data.day} title={t("Sales on {{day}}", { day: label })} onClose={() => setCheck(false)} />}
      <div className="grid gap-1.5">
        <Row
          label={
            <button type="button" className="inline-flex items-center gap-1 underline-offset-4 hover:underline" onClick={() => setCheck(true)}>
              {t("Sales")}
              <ExternalLink className="size-3" aria-hidden />
            </button>
          }
          value={formatMoney(data.sales)}
        />
        {data.salesLines.length > 1 &&
          data.salesLines.map((l) => <Row key={l.code} sub label={<Ledger id={l.accountId} day={data.day}>{t(l.name)}</Ledger>} value={formatMoney(l.amount)} />)}
        <Row
          label={data.cogsAccountId ? <Ledger id={data.cogsAccountId} day={data.day}>{t("Cost of goods sold")}</Ledger> : t("Cost of goods sold")}
          value={minus(data.cogs)}
        />
        <Row
          strong
          label={
            <>
              {t("Gross profit")}
              {data.grossMarginPct !== null && (
                <span className="ms-1.5 text-xs font-normal text-muted-foreground">
                  {formatPercent(data.grossMarginPct)}
                </span>
              )}
            </>
          }
          value={formatMoney(data.grossProfit)}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{t("Fixed costs (a day of the monthly budget)")}</span>
          {canEdit && (
            <Button variant="ghost" size="sm" className="h-7" onClick={onEdit}>
              <Pencil />
              {t("Edit")}
            </Button>
          )}
        </div>
        {data.budget.map((b) => (
          <Row
            key={b.id}
            sub
            label={t("{{name}} ({{monthly}} a month)", { name: t(b.name), monthly: formatMoney(b.monthly) })}
            value={minus(b.daily)}
          />
        ))}
        <Row label={t("Fixed costs for the day")} value={minus(data.budgetTotal)} />
        {data.recorded.length > 0 && (
          <>
            <span className="mt-2 text-sm font-medium">{t("Other costs recorded on this day")}</span>
            {data.recorded.map((r) => (
              <Row
                key={r.code}
                sub
                label={
                  <Ledger id={r.accountId} day={data.day}>
                    {r.inBudget ? t("{{name}} (already in the budget)", { name: t(r.name) }) : t(r.name)}
                  </Ledger>
                }
                value={minus(r.amount)}
                tone={r.inBudget ? "muted" : undefined}
              />
            ))}
            <Row label={t("Other costs")} value={minus(data.otherCosts)} />
          </>
        )}
        {data.otherIncomeLines.length > 0 && (
          <>
            <span className="mt-2 text-sm font-medium">{t("Other income recorded on this day")}</span>
            {data.otherIncomeLines.map((r) => (
              <Row key={r.code} sub label={<Ledger id={r.accountId} day={data.day}>{t(r.name)}</Ledger>} value={formatMoney(r.amount)} />
            ))}
            <Row label={t("Other income")} value={formatMoney(data.otherIncome)} />
          </>
        )}
      </div>
      <div
        className={cn(
          "grid content-center gap-1 rounded-xl border p-4 text-center",
          profit ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5",
        )}
      >
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium">{profit ? t("Day profit") : t("Day loss")}</span>
        <span
          className={cn(
            "text-2xl font-bold whitespace-nowrap tabular-nums sm:text-3xl",
            profit ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
          )}
        >
          {formatMoney(data.result)}
        </span>
        {data.breakEvenSales != null && data.sales > 0 && (
          <span className="mt-1 text-xs text-muted-foreground">
            {t("Sales needed to cover the day's costs at this margin: {{amount}}", {
              amount: formatMoney(data.breakEvenSales),
            })}
          </span>
        )}
        {data.sales === 0 && <span className="mt-1 text-xs text-muted-foreground">{t("No sales recorded on this day.")}</span>}
      </div>
    </div>
  );
}

let nextId = 1;
type Draft = { key: number; id: string; name: string; monthly: string; accountId: string };

function BudgetDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const budget = useQuery(api.dashboard.dayBudget, undefined, { refetchInterval: false });
  const accounts = useQuery(api.finance.accounts.list, {});
  const save = useMutation(api.dashboard.setDayBudget);
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [pending, setPending] = useState(false);
  const expenseAccounts = (accounts ?? []).filter((a) => a.type === "expense" && a.systemKey !== "cogs");
  const list: Draft[] =
    rows ??
    (budget ?? []).map((b: BudgetItem) => ({
      key: nextId++,
      id: b.id,
      name: t(b.name),
      monthly: String(b.monthly),
      accountId: expenseAccounts.find((a) => a.code === b.accountCode)?._id ?? "",
    }));
  const set = (key: number, patch: Partial<Draft>) => setRows(list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const total = list.reduce((s, r) => s + (parseNumber(r.monthly) ?? 0), 0);

  const submit = async () => {
    setPending(true);
    try {
      await save({
        items: list.map((r) => ({
          id: r.id,
          name: r.name.trim(),
          monthly: parseNumber(r.monthly) ?? 0,
          accountCode: expenseAccounts.find((a) => a._id === r.accountId)?.code ?? null,
        })),
      });
      toast.success(t("Budget saved"));
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Monthly fixed costs")}</DialogTitle>
          <DialogDescription>
            {t(
              "Each day carries 1/30 of these. Link a cost to its account so the real entry, when you record it, isn't counted twice.",
            )}
          </DialogDescription>
        </DialogHeader>
        {budget === undefined ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="grid gap-2">
            <div className="hidden grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)_2.25rem] gap-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>{t("Cost")}</span>
              <span>{t("A month")}</span>
              <span>{t("Account")}</span>
              <span />
            </div>
            {list.map((r) => (
              <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_8rem_2.25rem] gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)_2.25rem]">
                <Input value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} aria-label={t("Cost")} dir="auto" />
                <MoneyInput value={r.monthly} onChange={(v) => set(r.key, { monthly: v })} aria-label={t("A month")} />
                <select
                  value={r.accountId}
                  onChange={(e) => set(r.key, { accountId: e.target.value })}
                  aria-label={t("Account")}
                  className="order-last col-span-2 h-9 rounded-md border border-input bg-background px-2 text-sm sm:order-none sm:col-span-1"
                >
                  <option value="">{t("No account")}</option>
                  {expenseAccounts.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.code} {t(a.name)}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRows(list.filter((x) => x.key !== r.key))}
                  aria-label={t("Remove line")}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() =>
                setRows([...list, { key: nextId++, id: `c${Date.now()}`, name: "", monthly: "", accountId: "" }])
              }
            >
              <Plus />
              {t("Add a cost")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("{{month}} a month · {{day}} a day", {
                month: formatMoney(total),
                day: formatMoney(Math.round((total / 30) * 100) / 100),
              })}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("Cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={pending || budget === undefined}>
            {pending && <Spinner />}
            {t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
