import { useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { api, getErrorMessage, useQuery } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import {
  DAY_RE,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@shared/constants.ts";
import type { PaymentMethod } from "@shared/constants.ts";

/**
 * Asks for the day the payment arrived, the account it arrived in (QNB,
 * Cash, a custody account…), and optionally how it was paid.
 * `onConfirm` gets a business day ("YYYY-MM-DD") and may throw: the error is shown
 * in the dialog, which stays open, so callers only toast on success.
 */
export default function MarkPaidDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description: string;
  confirmLabel?: string;
  onConfirm: (
    paidAt: string,
    method: PaymentMethod | undefined,
    accountId: string | undefined,
  ) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm" showCloseButton={!pending}>
        <MarkPaidForm
          title={title ?? t("Mark as paid")}
          description={description}
          confirmLabel={confirmLabel ?? t("Mark as paid")}
          pending={pending}
          setPending={setPending}
          onConfirm={onConfirm}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidForm({
  title,
  description,
  confirmLabel,
  pending,
  setPending,
  onConfirm,
  onDone,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  setPending: (pending: boolean) => void;
  onConfirm: (
    paidAt: string,
    method: PaymentMethod | undefined,
    accountId: string | undefined,
  ) => Promise<unknown>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const today = format.today();
  const [day, setDay] = useState(today);
  const [method, setMethod] = useState<PaymentMethod | "none">("none");
  // Money accounts you can post to: QNB first, then Cash, wallets, custody…
  const options = useQuery(api.finance.accounts.paymentOptions);
  // Where collected money can sit: cash, custody, banks and wallets (codes 10000–14999)
  const assets = (options ?? []).filter((a) => a.code >= 10000 && a.code < 15000);
  const [accountId, setAccountId] = useState<string>("");
  const chosen = accountId || assets[0]?._id || "";
  const [dayError, setDayError] = useState<string>();
  const [formError, setFormError] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!DAY_RE.test(day))
      return setDayError(t("Enter the date the payment arrived"));
    if (day > today)
      return setDayError(t("The payment date can't be in the future"));
    setDayError(undefined);
    setFormError(undefined);
    setPending(true);
    try {
      await onConfirm(day, method === "none" ? undefined : method, chosen || undefined);
      onDone();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Field data-invalid={!!dayError}>
          <FieldLabel htmlFor="paid-date">{t("Paid on")}</FieldLabel>
          <Input
            id="paid-date"
            type="date"
            max={today}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            aria-invalid={!!dayError}
            disabled={pending}
          />
          {dayError && <FieldError>{dayError}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="paid-account">{t("Received in")}</FieldLabel>
          <Select value={chosen} onValueChange={setAccountId} disabled={pending || !assets.length}>
            <SelectTrigger id="paid-account" className="w-full">
              <SelectValue placeholder={t("Loading…")} />
            </SelectTrigger>
            <SelectContent>
              {assets.map((a) => (
                <SelectItem key={a._id} value={a._id}>
                  {a.code} · {t(a.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="paid-method">{t("Payment method")}</FieldLabel>
          <Select
            value={method}
            onValueChange={(v) => setMethod(v as PaymentMethod | "none")}
            disabled={pending}
          >
            <SelectTrigger id="paid-method" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("Not specified")}</SelectItem>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(PAYMENT_METHOD_LABELS[m])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={pending}
        >
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : <CheckCircle2 />}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
