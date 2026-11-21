import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Banknote } from "lucide-react";
import { MoneyInput } from "@/components/number-input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { parseNumber } from "@/lib/forms.ts";
import { cn } from "@/lib/utils.ts";

type Owed = { accountId: string; name: string; owed: number };

/**
 * Partners payable, partner by partner: what each one took out and hasn't
 * been paid yet, with a Pay out button. Shows nothing when nothing is owed.
 */
export function PartnersOwedCard({ className, always = false }: { className?: string; always?: boolean }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const { canEdit } = useCurrentUser();
  const data = useQuery(api.finance.closing.partnersOwed, undefined);
  const [paying, setPaying] = useState<Owed | null>(null);
  if (!data || (!always && data.partners.length === 0 && !data.unassigned)) return null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t("Owed to each partner")}</CardTitle>
        <CardDescription>{t("Profit or capital partners took out and haven't been paid yet (Partners payable).")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {data.partners.length === 0 && !data.unassigned && (
          <p className="text-sm text-muted-foreground">{t("Nothing is owed to the partners.")}</p>
        )}
        {data.partners.map((r) => (
          <div key={r.accountId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
            <span className="font-medium">{r.name}</span>
            <span className="ms-auto tabular-nums">{formatMoney(r.owed)}</span>
            {canEdit("finance") && r.owed > 0 && (
              <Button size="sm" variant="outline" onClick={() => setPaying(r)}>
                <Banknote />
                {t("Pay out")}
              </Button>
            )}
          </div>
        ))}
        {!!data.unassigned && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            <span>{t("Not assigned to a partner (entered by hand)")}</span>
            <span className="tabular-nums">{formatMoney(data.unassigned)}</span>
          </div>
        )}
        {(data.partners.length > 1 || !!data.unassigned) && (
          <div className={cn("flex justify-between border-t pt-2 text-sm font-semibold")}>
            <span>{t("Total")}</span>
            <span className="tabular-nums">{formatMoney(data.total)}</span>
          </div>
        )}
      </CardContent>
      {paying && <PayoutDialog partner={paying} onClose={() => setPaying(null)} />}
    </Card>
  );
}

function PayoutDialog({ partner, onClose }: { partner: Owed; onClose: () => void }) {
  const { t } = useTranslation();
  const { formatMoney, today } = useFormat();
  const options = useQuery(api.finance.accounts.paymentOptions, undefined);
  const pay = useMutation(api.finance.closing.partnerPayout);
  const [amount, setAmount] = useState(String(partner.owed));
  const [from, setFrom] = useState("");
  const [date, setDate] = useState(today());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const fromId = from || options?.[0]?._id || "";

  const submit = async () => {
    const n = parseNumber(amount);
    if (!n || n <= 0) return setError(t("Enter an amount"));
    if (n > partner.owed + 0.005) return setError(t("More than what's owed"));
    if (!fromId) return setError(t("Choose the account it's paid from"));
    setPending(true);
    setError(undefined);
    try {
      await pay({ partnerAccountId: partner.accountId, amount: n, fromAccountId: fromId, date });
      toast.success(t("Paid {{amount}} to {{name}}", { amount: formatMoney(n), name: partner.name }));
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
          <DialogTitle>{t("Pay {{name}}", { name: partner.name })}</DialogTitle>
          <DialogDescription>{t("Owed {{amount}}. Pay all of it or part; the rest stays owed.", { amount: formatMoney(partner.owed) })}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="po-amount">{t("Amount")}</Label>
              <MoneyInput id="po-amount" value={amount} onChange={setAmount} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="po-date">{t("Date")}</Label>
              <Input id="po-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="po-from">{t("Paid from")}</Label>
            <Select value={fromId} onValueChange={setFrom}>
              <SelectTrigger id="po-from" className="w-full">
                <SelectValue placeholder={t("Choose the account it's paid from")} />
              </SelectTrigger>
              <SelectContent>
                {(options ?? []).map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.code} {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {t("Record payment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
