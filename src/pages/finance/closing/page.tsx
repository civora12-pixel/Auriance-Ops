import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarCheck, CalendarClock, HandCoins, Lock, Unlock } from "lucide-react";
import { MoneyInput } from "@/components/number-input.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { TableSkeleton } from "@/components/states.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { PartnersOwedCard } from "../_components/partners-owed.tsx";
import { parseNumber } from "@/lib/forms.ts";
import { addDays } from "@shared/dates.ts";
import { periodLabel } from "./_lib.ts";

/** Finance → Monthly closing: opening balances, each month's closing, and partners' capital. */
export default function ClosingHub() {
  const { t, i18n } = useTranslation();
  const { formatMoney, formatDay } = useFormat();
  const { canEdit, isAdmin } = useCurrentUser();
  const data = useQuery(api.finance.closing.overview);
  const accounts = useQuery(api.finance.accounts.list, {});
  const partners = (accounts ?? []).filter((a) => a.group === "Partners' capital");
  const owed = (accounts ?? []).filter((a) =>
    // Partners payable has its own card, partner by partner
    ["compensation_osama", "compensation_hazar", "loan_osama", "charity_payable"].includes(
      a.systemKey ?? "",
    ),
  );
  const totalCapital = partners.reduce((s, a) => s + a.balance, 0);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);

  return (
    <PageBody>
      <PageHeader
        title={t("Monthly closing")}
        description={t(
          "Close each month once its figures are in, or close up to any day (for example before a partner deposits or withdraws): type the real balances, explain the differences, and share the result between the partners.",
        )}
        actions={
          data?.opening?.status === "locked" && isAdmin ? (
            <Button variant="outline" onClick={() => setDayOpen(true)}>
              <CalendarClock />
              {t("Close up to a day")}
            </Button>
          ) : undefined
        }
      />

      {data === undefined ? (
        <TableSkeleton rows={4} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarCheck className="size-5" />
                {t("Periods")}
              </CardTitle>
              <CardDescription>
                {data.lockedThrough
                  ? t("Books closed up to {{date}}. Nothing dated on or before it can change.", {
                      date: formatDay(data.lockedThrough),
                    })
                  : t("Start by posting the opening balances.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <PeriodRow
                to="/finance/closing/opening"
                label={t("Opening balances")}
                sub={data.opening?.asOf ? t("as of {{date}}", { date: formatDay(data.opening.asOf) }) : undefined}
                status={data.opening?.status === "locked" ? "locked" : "draft"}
              />
              {data.periods.map((m) => (
                <PeriodRow
                  key={m.period}
                  to={`/finance/closing/${m.period}`}
                  label={periodLabel(m.period, i18n.language, t, formatDay)}
                  sub={
                    m.status !== "locked" && m.end >= data.today
                      ? t("in progress")
                      : m.kind === "month" && !m.start.endsWith("-01")
                        ? t("from {{date}}", { date: formatDay(m.start) })
                        : undefined
                  }
                  status={m.status}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HandCoins className="size-5" />
                {t("Partners' capital")}
              </CardTitle>
              <CardDescription>
                {t("Each partner's share of profit and loss follows their capital at the start of the period.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Partner")}</TableHead>
                    <TableHead className="text-end">{t("Capital")}</TableHead>
                    <TableHead className="text-end">{t("Share")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((a) => (
                    <TableRow key={a._id}>
                      <TableCell>
                        <Link to={`/finance/accounts/${a._id}`} className="hover:underline">
                          {a.name.replace(/^Capital – /, "")}
                        </Link>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{formatMoney(a.balance)}</TableCell>
                      <TableCell className="text-end tabular-nums text-muted-foreground">
                        {totalCapital > 0 ? `${((Math.max(0, a.balance) / totalCapital) * 100).toFixed(2)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell>{t("Total")}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatMoney(totalCapital)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
              {owed.some((a) => Math.abs(a.balance) >= 0.005) && (
                <div className="grid gap-1 rounded-md bg-muted/50 p-3 text-sm">
                  <p className="font-medium">{t("Owed to partners")}</p>
                  {owed
                    .filter((a) => Math.abs(a.balance) >= 0.005)
                    .map((a) => (
                      <p key={a._id} className="flex justify-between gap-2">
                        <span>{a.name}</span>
                        <span className="tabular-nums">{formatMoney(a.balance)}</span>
                      </p>
                    ))}
                </div>
              )}
              {canEdit("finance") && (
                <Button variant="outline" className="justify-self-start" onClick={() => setWithdrawOpen(true)}>
                  <HandCoins />
                  {t("Record a partner's withdrawal")}
                </Button>
              )}
            </CardContent>
          </Card>
          <PartnersOwedCard />
        </div>
      )}

      {dayOpen && data && (
        <CloseDayDialog
          min={data.lockedThrough ? addDays(data.lockedThrough, 1) : data.today}
          today={data.today}
          onClose={() => setDayOpen(false)}
        />
      )}

      {withdrawOpen && (
        <WithdrawDialog
          partners={partners.map((a) => ({ _id: a._id, name: a.name.replace(/^Capital – /, ""), balance: a.balance }))}
          today={data?.today ?? ""}
          onClose={() => setWithdrawOpen(false)}
        />
      )}
    </PageBody>
  );
}

function PeriodRow({
  to,
  label,
  sub,
  status,
}: {
  to: string;
  label: string;
  sub?: string;
  status: "open" | "draft" | "locked";
}) {
  const { t } = useTranslation();
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/50"
    >
      <span>
        <span className="font-medium">{label}</span>
        {sub && <span className="ms-2 text-xs text-muted-foreground">{sub}</span>}
      </span>
      {status === "locked" ? (
        <Badge variant="secondary">
          <Lock className="size-3" />
          {t("Closed")}
        </Badge>
      ) : status === "draft" ? (
        <Badge variant="outline">{t("Draft saved")}</Badge>
      ) : (
        <Badge variant="outline">
          <Unlock className="size-3" />
          {t("Open")}
        </Badge>
      )}
    </Link>
  );
}

function WithdrawDialog({
  partners,
  today,
  onClose,
}: {
  partners: { _id: string; name: string; balance: number }[];
  today: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const withdraw = useMutation(api.finance.closing.partnerWithdrawal);
  const [partner, setPartner] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const chosen = partners.find((p) => p._id === partner);

  const submit = async () => {
    const n = parseNumber(amount);
    if (!partner) return setError(t("Choose a partner"));
    if (!n || n <= 0) return setError(t("Enter an amount"));
    setPending(true);
    setError(undefined);
    try {
      await withdraw({ accountId: partner, amount: n, date });
      toast.success(t("Withdrawal recorded: owed to the partner until paid"));
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Record a partner's withdrawal")}</DialogTitle>
          <DialogDescription>
            {t(
              "The amount leaves the partner's capital and is owed to them in Partners payable until you pay it (Pay out, under \"Owed to each partner\").",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="wd-partner">{t("Partner")}</Label>
            <Select value={partner} onValueChange={setPartner}>
              <SelectTrigger id="wd-partner" className="w-full">
                <SelectValue placeholder={t("Choose a partner")} />
              </SelectTrigger>
              <SelectContent>
                {partners.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chosen && (
              <p className="text-xs text-muted-foreground">
                {t("Capital now {{amount}}", { amount: formatMoney(chosen.balance) })}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="wd-amount">{t("Amount")}</Label>
              <MoneyInput id="wd-amount" value={amount} onChange={setAmount} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wd-date">{t("Date")}</Label>
              <Input id="wd-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("Cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={pending}>
            {pending && <Spinner />}
            {t("Record withdrawal")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pick the last day to close up to (e.g. the day before a partner's deposit or withdrawal). */
function CloseDayDialog({ min, today, onClose }: { min: string; today: string; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [day, setDay] = useState(today < min ? min : today);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= min && day <= today;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Close up to a day")}</DialogTitle>
          <DialogDescription>
            {t(
              "Works like a month's closing: real balances, differences, then the result since the last closing is shared and the books lock up to that day. Use it before a partner deposits or withdraws, so the profit so far is shared by the old capital.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="close-day">{t("Close up to and including")}</Label>
          <Input id="close-day" type="date" min={min} max={today} value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button disabled={!valid} onClick={() => navigate(`/finance/closing/${day}`)}>
            {t("Continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
