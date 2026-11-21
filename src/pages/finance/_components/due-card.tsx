import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, CreditCard, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { addDays } from "@shared/dates.ts";
import { cn } from "@/lib/utils.ts";
import type { FinanceReport } from "./summary-cards.tsx";

type Due = FinanceReport["due"];

function When({ day, today }: { day: string; today: string }) {
  const { t } = useTranslation();
  const { formatDay } = useFormat();
  const late = day < today;
  const soon = !late && day <= addDays(today, 1);
  return (
    <span className="flex items-center gap-1.5">
      <span className="tabular-nums">{formatDay(day)}</span>
      {late && <Badge variant="destructive">{t("Overdue")}</Badge>}
      {soon && (
        <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          {day === today ? t("Today") : t("Tomorrow")}
        </Badge>
      )}
    </span>
  );
}

/**
 * What's coming due: courier money (two weeks after shipping), the credit card
 * (15th of the month) and payables given a due date. Reminders go out the day before.
 */
export function DueCard({ due }: { due: Due }) {
  const { t } = useTranslation();
  const { formatMoney, formatDay } = useFormat();
  const { canEdit } = useCurrentUser();
  const settle = useMutation(api.finance.journal.setSettled);
  const [busy, setBusy] = useState<string | null>(null);
  const r = due.receivables;

  const markSettled = async (entryId: string) => {
    setBusy(entryId);
    try {
      await settle({ entryId, settled: true });
      toast.success(t("Marked as paid"));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-5" />
          {t("Due dates")}
        </CardTitle>
        <CardDescription>{t("You get a notification the day before anything here is due.")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <section className="grid gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Truck className="size-4 text-muted-foreground" />
            {t("Courier collections (due 2 weeks after shipping)")}
          </h3>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {[
              { label: t("Not due yet"), v: r.notDue, tone: "" },
              { label: t("Due today or tomorrow"), v: r.dueSoon, tone: "text-amber-700 dark:text-amber-300" },
              { label: t("Overdue"), v: r.overdue, tone: "text-destructive" },
            ].map((b) => (
              <div key={b.label} className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">{b.label}</p>
                <p className={cn("font-semibold tabular-nums", b.v.count > 0 && b.tone)}>{formatMoney(b.v.amount)}</p>
                <p className="text-xs text-muted-foreground">{t("{{count}} orders", { count: b.v.count })}</p>
              </div>
            ))}
          </div>
          {r.overdue.orders.length > 0 && (
            <ul className="divide-y rounded-lg border text-sm">
              {r.overdue.orders.map((o) => (
                <li key={o.orderId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <Link to={`/orders/${o.orderId}`} className="min-w-0 hover:underline">
                    <span className="font-medium">{o.orderNumber}</span>{" "}
                    <span className="text-muted-foreground" dir="auto">
                      {o.customer}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t("Shipped {{day}} · {{n}} days late", { day: formatDay(o.shippedDay), n: o.daysLate })}
                    </span>
                  </Link>
                  <span className="tabular-nums">{formatMoney(o.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CreditCard className="size-4 text-muted-foreground" />
            {t("Credit card")}
          </h3>
          {due.creditCard.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nothing owed on the card.")}</p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {due.creditCard.map((c) => (
                <li key={c.dueDay} className="flex items-center justify-between gap-3 px-3 py-2">
                  <When day={c.dueDay} today={due.today} />
                  <span className="font-medium tabular-nums">{formatMoney(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {t("Purchases on the 1st–19th are due on the 15th of next month; from the 20th, on the 15th of the month after. Payments clear the oldest first.")}
          </p>
        </section>

        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">{t("Other payables")}</h3>
          {due.payables.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("None. Give a journal entry a due date to track it here.")}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {due.payables.map((p) => (
                <li key={p.entryId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <When day={p.dueDay} today={due.today} />
                    <span className="block text-xs text-muted-foreground" dir="auto">
                      {p.number} · {p.memo}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">{formatMoney(p.amount)}</span>
                    {canEdit("finance") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === p.entryId}
                        onClick={() => void markSettled(p.entryId)}
                      >
                        {busy === p.entryId ? <Spinner /> : <CheckCircle2 />}
                        {t("Mark paid")}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
