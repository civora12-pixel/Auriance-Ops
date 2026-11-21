import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { MONEY_EPSILON, round2 } from "@shared/constants.ts";
import { MoneyInput } from "@/components/number-input.tsx";
import { Button } from "@/components/ui/button.tsx";
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
import { Spinner } from "@/components/ui/spinner.tsx";
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { parseNumber } from "@/lib/forms.ts";
import { cn } from "@/lib/utils.ts";
import { AccountPicker } from "./account-picker.tsx";
import type { AccountRow } from "./account-picker.tsx";

export type JournalEntryRow = Output<typeof api.finance.journal.list>["items"][number];

type Line = {
  key: number;
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
};

let nextKey = 1;
const emptyLine = (): Line => ({
  key: nextKey++,
  accountId: "",
  debit: "",
  credit: "",
  memo: "",
});

/** New or edit a manual journal entry. Posting is only possible once debits equal credits. */
export default function EntryDialog({
  open,
  onOpenChange,
  entry,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: JournalEntryRow | null;
  accounts: AccountRow[] | undefined;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        {open && (
          <EntryForm
            entry={entry}
            accounts={accounts}
            close={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({
  entry,
  accounts,
  close,
}: {
  entry: JournalEntryRow | null;
  accounts: AccountRow[] | undefined;
  close: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const create = useMutation(api.finance.journal.create);
  const update = useMutation(api.finance.journal.update);

  const [date, setDate] = useState(entry?.date ?? format.today());
  const [memo, setMemo] = useState(entry?.memo ?? "");
  const [dueDay, setDueDay] = useState(entry?.dueDay ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    entry
      ? entry.lines.map((l) => ({
          key: nextKey++,
          accountId: l.accountId,
          debit: l.debit ? String(l.debit) : "",
          credit: l.credit ? String(l.credit) : "",
          memo: l.memo ?? "",
        }))
      : [emptyLine(), emptyLine()],
  );
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const amount = (s: string) => {
    const n = parseNumber(s);
    return n !== undefined && n > 0 ? round2(n) : 0;
  };
  const debits = round2(lines.reduce((s, l) => s + amount(l.debit), 0));
  const credits = round2(lines.reduce((s, l) => s + amount(l.credit), 0));
  const difference = round2(debits - credits);
  const balanced = Math.abs(difference) < MONEY_EPSILON && debits > 0;

  const lineProblem = (l: Line) => {
    if (!l.accountId) return t("Choose an account");
    const d = amount(l.debit);
    const c = amount(l.credit);
    if ((d > 0) === (c > 0)) return t("Enter a debit or a credit");
    return undefined;
  };
  const problems = lines.map(lineProblem);
  const valid =
    !!date && memo.trim() !== "" && lines.length >= 2 && problems.every((p) => !p) && balanced;

  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError(undefined);
    if (!valid) return;
    const payload = {
      date,
      memo: memo.trim(),
      dueDay: dueDay || null,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        debit: amount(l.debit),
        credit: amount(l.credit),
        memo: l.memo.trim() || undefined,
      })),
    };
    setPending(true);
    try {
      if (entry) {
        await update({ entryId: entry._id, ...payload });
        toast.success(t("Entry updated"));
      } else {
        await create(payload);
        toast.success(t("Entry posted"));
      }
      close();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>
          {entry
            ? t("Edit JV-{{n}}", { n: String(entry.number).padStart(4, "0") })
            : t("New journal entry")}
        </DialogTitle>
        <DialogDescription>
          {t("Debits must equal credits before the entry can be posted.")}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="grid gap-1.5">
          <Label htmlFor="je-date">{t("Date")}</Label>
          <Input
            id="je-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={pending}
            aria-invalid={(submitted && !date) || undefined}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="je-memo">{t("Description")}</Label>
          <Input
            id="je-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={t("e.g. Meta top-up on the credit card")}
            disabled={pending}
            aria-invalid={(submitted && !memo.trim()) || undefined}
          />
          {submitted && !memo.trim() && (
            <p className="text-sm text-destructive">{t("Enter a description")}</p>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="hidden grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_minmax(0,0.8fr)_2.25rem] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
          <span>{t("Account")}</span>
          <span>{t("Debit")}</span>
          <span>{t("Credit")}</span>
          <span>{t("Line note")}</span>
          <span />
        </div>
        {lines.map((l, i) => {
          const problem = submitted ? problems[i] : undefined;
          return (
            <div
              key={l.key}
              className="grid gap-2 rounded-lg border p-2 md:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_minmax(0,0.8fr)_2.25rem] md:items-start md:border-0 md:p-0"
            >
              <AccountPicker
                accounts={accounts}
                value={l.accountId || undefined}
                onChange={(accountId) => setLine(l.key, { accountId })}
                invalid={!!problem && !l.accountId}
                disabled={pending}
              />
              <div className="grid grid-cols-2 gap-2 md:contents">
                <MoneyInput
                  value={l.debit}
                  onChange={(v) => setLine(l.key, { debit: v, credit: v ? "" : l.credit })}
                  aria-label={t("Debit")}
                  placeholder={t("Debit")}
                  disabled={pending}
                />
                <MoneyInput
                  value={l.credit}
                  onChange={(v) => setLine(l.key, { credit: v, debit: v ? "" : l.debit })}
                  aria-label={t("Credit")}
                  placeholder={t("Credit")}
                  disabled={pending}
                />
              </div>
              <Input
                value={l.memo}
                onChange={(e) => setLine(l.key, { memo: e.target.value })}
                placeholder={t("Line note (optional)")}
                aria-label={t("Line note")}
                disabled={pending}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="justify-self-end text-muted-foreground"
                onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                disabled={pending || lines.length <= 2}
                aria-label={t("Remove line")}
              >
                <Trash2 />
              </Button>
              {problem && (
                <p className="text-sm text-destructive md:col-span-5">{problem}</p>
              )}
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => setLines((ls) => [...ls, emptyLine()])}
          disabled={pending || lines.length >= 200}
        >
          <Plus />
          {t("Add line")}
        </Button>
      </div>

      <dl className="grid gap-1 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-3">
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-muted-foreground">{t("Total debits")}</dt>
          <dd className="font-semibold tabular-nums">{format.formatMoney(debits)}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-muted-foreground">{t("Total credits")}</dt>
          <dd className="font-semibold tabular-nums">{format.formatMoney(credits)}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-muted-foreground">{t("Difference")}</dt>
          <dd
            className={cn(
              "font-semibold tabular-nums",
              balanced
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-destructive",
            )}
          >
            {balanced ? t("Balanced") : format.formatMoney(Math.abs(difference))}
          </dd>
        </div>
      </dl>

      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="je-due">
          {t("Due date")} <span className="font-normal text-muted-foreground">({t("optional")})</span>
        </Label>
        <Input id="je-due" type="date" value={dueDay} onChange={(e) => setDueDay(e.target.value)} disabled={pending} />
        <p className="text-xs text-muted-foreground">
          {t("For something you'll pay later, like a supplier on credit. It shows under Due dates on the Overview with a reminder the day before. Credit card charges get their due date automatically.")}
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={close} disabled={pending}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={pending || !balanced || (submitted && !valid)}>
          {pending && <Spinner />}
          {entry ? t("Save changes") : t("Post entry")}
        </Button>
      </DialogFooter>
    </form>
  );
}
