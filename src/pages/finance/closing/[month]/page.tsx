import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock, MessageSquareText, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { MoneyInput } from "@/components/number-input.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { PageSkeleton } from "@/components/states.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { useDebounce } from "@/hooks/use-debounce.ts";
import { api, useMutation, useQuery } from "@/lib/api.ts";
import type { Input as ApiInput, Output } from "@/lib/api.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import { AccountPicker } from "../../_components/account-picker.tsx";
import ReopenButton from "../_components/reopen-button.tsx";
import { AllocationTable, Line } from "../_components/summary.tsx";
import { moneyOrNull, periodLabel } from "../_lib.ts";

type Draft = ApiInput<typeof api.finance.closing.saveMonth>["draft"];
type Explanation = { code: number; amount: number };

const CHECKLIST = [
  "All sales are recorded and shipped orders are marked shipped",
  "All returns are recorded (and received ones confirmed)",
  "Courier collections are marked paid",
  "Pack material is counted",
  "The Meta ads balance is checked",
  "Stock matches the physical count",
  "Salaries and other payments are recorded",
];

/** One month's closing: the real balances, what explains the differences, and the result shared. */
export default function MonthClosingPage() {
  const { month = "" } = useParams();
  const refresh = useMutation(api.finance.closing.refresh);
  const [ready, setReady] = useState(false);
  // Post any month-end automatic entries (depreciation) before showing the figures
  useEffect(() => {
    void refresh().finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);
  const data = useQuery(api.finance.closing.month, ready ? { month } : "skip");
  if (!ready || data === undefined) return <PageSkeleton />;
  return <MonthForm key={`${month}-${data.status}`} month={month} data={data} />;
}

function MonthForm({ month, data }: { month: string; data: Output<typeof api.finance.closing.month> }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { formatMoney, formatDay, today } = useFormat();
  const { isAdmin, canEdit } = useCurrentUser();
  const locked = data.status === "locked";
  const editable = !locked && canEdit("finance");
  const save = useMutation(api.finance.closing.saveMonth);
  const lock = useMutation(api.finance.closing.lockMonth);
  const accounts = useQuery(api.finance.accounts.list, {});

  const [balances, setBalances] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(data.draft.balances).map(([k, v]) => [k, v == null ? "" : String(v)])),
  );
  const [explanations, setExplanations] = useState<Record<string, Explanation[]>>(data.draft.explanations);
  const [hazarPct, setHazarPct] = useState(String(data.draft.compensationHazarPct));
  const [osamaPct, setOsamaPct] = useState(String(data.draft.compensationOsamaPct));
  const [withdrawals, setWithdrawals] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(data.draft.withdrawals ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)])),
  );
  const [explaining, setExplaining] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [checks, setChecks] = useState<boolean[]>(CHECKLIST.map(() => false));

  const draft: Draft = {
    balances: Object.fromEntries(Object.entries(balances).map(([k, v]) => [k, moneyOrNull(v)])),
    explanations,
    compensationHazarPct: Math.min(100, Math.max(0, Number(hazarPct) || 0)),
    compensationOsamaPct: Math.min(100, Math.max(0, Number(osamaPct) || 0)),
    withdrawals: Object.fromEntries(
      Object.entries(withdrawals)
        .map(([k, v]) => [k, moneyOrNull(v)] as const)
        .filter(([, v]) => v == null || v >= 0),
    ),
  };
  const [debounced] = useDebounce(JSON.stringify(draft), 300);
  const live = useQuery(
    api.finance.closing.previewMonth,
    locked ? "skip" : { month, draft: JSON.parse(debounced) as Draft },
    { keepPrevious: true },
  );
  const p = live ?? data.preview;

  const initial = useRef(JSON.stringify(draft));
  const [autosave] = useDebounce(JSON.stringify(draft), 1500);
  useEffect(() => {
    if (!editable || autosave === initial.current) return;
    initial.current = autosave;
    void save({ month, draft: JSON.parse(autosave) as Draft }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave]);

  const byDay = /^\d{4}-\d{2}-\d{2}$/.test(month);
  // A month closes once it has ended; a closing on a chosen day can be up to today
  const ended = p ? (byDay ? p.end <= today() : p.end < today()) : false;
  const title = periodLabel(month, i18n.language, t, formatDay);
  const closeLabel = byDay ? t("Close up to {{date}}", { date: formatDay(month) }) : t("Close {{month}}", { month: title });

  if (locked || !p) {
    return (
      <PageBody>
        <PageHeader
          breadcrumbs={[{ label: t("Monthly closing"), to: "/finance/closing" }, { label: title }]}
          title={title}
          description={t("This period is closed. Its closing entries are in the journal.")}
          actions={
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                <Lock className="size-3" />
                {t("Closed")}
              </Badge>
              {isAdmin && <ReopenButton period={month} />}
            </div>
          }
        />
        <Button asChild variant="outline" className="w-fit">
          <Link to={`/finance/journal?source=closing&from=${month.slice(0, 7)}-01&to=${byDay ? month : `${month}-31`}`}>
            {t("See the closing entries")}
          </Link>
        </Button>
      </PageBody>
    );
  }

  const explainedFor = (code: number) => explanations[code] ?? [];
  const current = explaining === null ? undefined : p.kept.find((k) => k.account.code === explaining);

  return (
    <PageBody>
      <PageHeader
        breadcrumbs={[{ label: t("Monthly closing"), to: "/finance/closing" }, { label: title }]}
        title={closeLabel}
        description={t("{{from}} to {{to}}. Figures save as you type; nothing is posted until you close.", {
          from: formatDay(p.start),
          to: formatDay(p.end),
        })}
      />

      <div className="mx-auto grid w-full max-w-4xl gap-6">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("1. Before you start")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {CHECKLIST.map((item, i) => (
                <label key={item} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={checks[i]}
                    onCheckedChange={(c) => setChecks((cs) => cs.map((x, j) => (j === i ? c === true : x)))}
                  />
                  {t(item)}
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("2. From the app")}</CardTitle>
              <CardDescription>{t("Filled automatically by orders and stock.")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {p.automatic.map((a) => (
                <Line key={a.account._id} label={`${a.account.code} ${a.account.name}`} value={formatMoney(a.book)} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("3. Your balances on {{date}}", { date: formatDay(p.end) })}</CardTitle>
              <CardDescription>
                {t(
                  "Type the real balance from the statement, app or count. Leave blank if the books are right. Explain any difference; what's left goes to Unidentified difference.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="hidden grid-cols-[minmax(0,1fr)_8rem_10rem_8rem_8rem] gap-3 border-b pb-2 text-xs font-medium text-muted-foreground md:grid">
                <span>{t("Account")}</span>
                <span className="text-end">{t("Books")}</span>
                <span>{t("Actual")}</span>
                <span className="text-end">{t("Difference")}</span>
                <span />
              </div>
              <ul className="divide-y">
                {p.kept.map((k) => {
                  const code = k.account.code;
                  const has = Math.abs(k.difference) >= 0.005;
                  return (
                    <li
                      key={k.account._id}
                      className="grid grid-cols-2 items-center gap-x-3 gap-y-1.5 py-3 md:grid-cols-[minmax(0,1fr)_8rem_10rem_8rem_8rem] md:py-2"
                    >
                      <span className="col-span-2 md:col-span-1">
                        <span className="font-mono text-xs text-muted-foreground">{code}</span> {k.account.name}
                      </span>
                      <span className="text-sm text-muted-foreground tabular-nums md:text-end md:text-foreground">
                        <span className="md:hidden">{t("Books")}: </span>
                        {formatMoney(k.book)}
                      </span>
                      <span>
                        {editable ? (
                          <MoneyInput
                            value={balances[code] ?? ""}
                            onChange={(v) => setBalances((b) => ({ ...b, [code]: v }))}
                            placeholder={k.book.toFixed(2)}
                            aria-label={t("Actual balance of {{account}}", { account: k.account.name })}
                          />
                        ) : (
                          <span className="tabular-nums">{k.actual === null ? "—" : formatMoney(k.actual)}</span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "text-sm tabular-nums md:text-end",
                          has ? "font-medium" : "text-muted-foreground",
                          !has && "hidden md:block",
                        )}
                      >
                        {has ? formatMoney(k.difference) : "—"}
                        {has && k.unidentified > 0.005 && (
                          <span className="block text-xs font-normal text-amber-700 dark:text-amber-400">
                            {t("{{amount}} unidentified", { amount: formatMoney(k.unidentified) })}
                          </span>
                        )}
                        {k.unidentified < -0.005 && (
                          <span className="block text-xs font-normal text-destructive">
                            {t("Explained more than the difference")}
                          </span>
                        )}
                      </span>
                      <span className="md:text-end">
                        {has && editable && (
                          <Button variant="ghost" size="sm" onClick={() => setExplaining(code)}>
                            <MessageSquareText />
                            {explainedFor(code).length
                              ? t("Explained ({{n}})", { n: explainedFor(code).length })
                              : t("Explain")}
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("4. Result for {{month}}", { month: title })}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {p.pnlRows
                .filter((r) => r.account.type === "revenue")
                .map((r) => (
                  <Line key={r.account._id} label={r.account.name} value={formatMoney(r.amount)} />
                ))}
              <Line label={t("Revenue")} value={formatMoney(p.revenue)} strong />
              {p.pnlRows
                .filter((r) => r.account.type === "expense")
                .map((r) => (
                  <Line key={r.account._id} label={r.account.name} value={formatMoney(-r.amount)} />
                ))}
              <Line label={t("Costs & expenses")} value={formatMoney(-p.expenses)} strong />
              <Line
                label={p.result >= 0 ? t("Net profit") : t("Net loss")}
                value={formatMoney(p.result)}
                strong
                tone={p.result >= 0 ? "good" : "bad"}
              />
              {p.result > 0 && editable && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="cl-hazar">{t("Compensation % – Hazar")}</Label>
                    <Input id="cl-hazar" inputMode="decimal" value={hazarPct} onChange={(e) => setHazarPct(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="cl-osama">{t("Compensation % – Osama")}</Label>
                    <Input id="cl-osama" inputMode="decimal" value={osamaPct} onChange={(e) => setOsamaPct(e.target.value)} />
                  </div>
                </div>
              )}
              <AllocationTable allocation={p.allocation} byDays />
            </CardContent>
          </Card>
          {p.withdrawals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("Each partner's choice: take out or reinvest")}</CardTitle>
                <CardDescription>
                  {t(
                    "After asking each partner, enter what they take out of their profit share. The rest stays in as capital. What's taken out is owed to them (Partners payable) until it's paid.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {p.withdrawals.map((w) => {
                  const name = w.name.replace(/^Capital – /, "");
                  return (
                    <div key={w.code} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">{name}</p>
                        <p className="text-muted-foreground">
                          {t("Profit share {{amount}}", { amount: formatMoney(w.profit) })} ·{" "}
                          {w.error
                            ? <span className="text-destructive">{t(w.error)}</span>
                            : t("reinvests {{amount}}", { amount: formatMoney(w.reinvest) })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`wd-${w.code}`} className="text-sm whitespace-nowrap">
                          {t("Takes out")}
                        </Label>
                        <MoneyInput
                          id={`wd-${w.code}`}
                          value={withdrawals[w.code] ?? ""}
                          onChange={(v) => setWithdrawals((x) => ({ ...x, [w.code]: v }))}
                          placeholder="0"
                          className="w-32"
                          disabled={!editable}
                          aria-invalid={!!w.error}
                        />
                        {editable && (
                          <>
                            <Button type="button" size="sm" variant="outline" onClick={() => setWithdrawals((x) => ({ ...x, [w.code]: String(w.profit) }))}>
                              {t("All")}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setWithdrawals((x) => ({ ...x, [w.code]: "" }))}>
                              {t("None")}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="grid gap-1 text-sm">
                  <Line
                    label={t("Taken out (owed until paid)")}
                    value={formatMoney(p.withdrawals.reduce((s, w) => s + w.withdraw, 0))}
                  />
                  <Line label={t("Reinvested as capital")} value={formatMoney(p.withdrawals.reduce((s, w) => s + w.reinvest, 0))} />
                </div>
              </CardContent>
            </Card>
          )}
          {editable && (
            <div className="grid gap-2">
              {!ended && (
                <p className="text-sm text-muted-foreground">
                  {byDay ? t("You can close up to today, not a day in the future.") : t("You can close the month once it has ended.")}
                </p>
              )}
              {isAdmin && (
                <Button disabled={!ended || p.withdrawals.some((w) => w.error)} onClick={() => setConfirm(true)}>
                  <Lock />
                  {closeLabel}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {current && (
        <ExplainDialog
          key={current.account.code}
          accountName={`${current.account.code} ${current.account.name}`}
          difference={current.difference}
          accounts={(accounts ?? []).filter((a) => a.code !== current.account.code)}
          initial={explainedFor(current.account.code)}
          onSave={(list) => setExplanations((e) => ({ ...e, [current.account.code]: list }))}
          onClose={() => setExplaining(null)}
        />
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`${closeLabel}?`}
        description={t(
          "The differences are posted, revenue and expenses are closed, and the result is shared as shown. Nothing dated up to {{date}} can change after this (reopening needs Admin Mode).",
          { date: formatDay(p.end) },
        )}
        confirmLabel={closeLabel}
        onConfirm={async () => {
          await lock({ month, draft });
          navigate("/finance/closing");
        }}
        successMessage={byDay ? t("Closed up to {{date}}", { date: formatDay(month) }) : t("{{month}} closed", { month: title })}
      />
    </PageBody>
  );
}

function ExplainDialog({
  accountName,
  difference,
  accounts,
  initial,
  onSave,
  onClose,
}: {
  accountName: string;
  difference: number;
  accounts: Output<typeof api.finance.accounts.list>;
  initial: Explanation[];
  onSave: (list: Explanation[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const [rows, setRows] = useState(
    (initial.length ? initial : [{ code: 0, amount: 0 }]).map((x, i) => ({
      key: i,
      accountId: byCode.get(x.code)?._id ?? "",
      amount: x.amount ? String(x.amount) : "",
    })),
  );
  const total = rows.reduce((s, r) => s + (moneyOrNull(r.amount) ?? 0), 0);
  const left = Math.abs(difference) - total;
  const [error, setError] = useState<string>();

  const done = () => {
    if (left < -0.005) return setError(t("The explanations add up to more than the difference"));
    const list = rows
      .map((r) => ({
        code: accounts.find((a) => a._id === r.accountId)?.code ?? 0,
        amount: moneyOrNull(r.amount) ?? 0,
      }))
      .filter((x) => x.code && x.amount > 0);
    onSave(list);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Explain the difference")}</DialogTitle>
          <DialogDescription>
            {t("{{account}} is {{amount}} different from the books. Where did it go?", {
              account: accountName,
              amount: formatMoney(difference),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_9rem_2.25rem] gap-2">
              <AccountPicker
                accounts={accounts}
                value={r.accountId || undefined}
                onChange={(accountId) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, accountId } : x)))}
              />
              <MoneyInput
                value={r.amount}
                onChange={(amount) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, amount } : x)))}
                aria-label={t("Amount")}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
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
            onClick={() => setRows((rs) => [...rs, { key: Date.now(), accountId: "", amount: "" }])}
          >
            <Plus />
            {t("Add line")}
          </Button>
          <p className={cn("text-sm", left < -0.005 ? "text-destructive" : "text-muted-foreground")}>
            {t("Left as Unidentified difference: {{amount}}", { amount: formatMoney(Math.max(0, left)) })}
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={done}>{t("Done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

