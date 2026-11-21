import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MoneyInput } from "@/components/number-input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { parseNumber } from "@/lib/forms.ts";
import { MONEY_EPSILON, round2 } from "@shared/constants.ts";
import type { OrderDetail } from "../_lib/order.ts";

/**
 * Admins: the order shipped with the wrong price on our side (the courier
 * collects the right one). Sets the right total; the books take the difference today.
 */
export function CorrectPriceDialog({
  order,
  open,
  onOpenChange,
}: {
  order: OrderDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const correct = useMutation(api.orders.correctPrice);
  const [total, setTotal] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const value = parseNumber(total);
  const difference = value === undefined ? undefined : round2(value - order.total);
  const totalError =
    total.trim() === ""
      ? t("Enter the right total")
      : value === undefined || value < 0
        ? t("Enter a valid amount")
        : Math.abs(difference!) < MONEY_EPSILON
          ? t("That's already the order's total")
          : undefined;
  const reasonError = reason.trim() ? undefined : t("Say why the price changed");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (totalError || reasonError) return;
    setPending(true);
    try {
      await correct({ orderId: order._id, total: value!, reason: reason.trim() });
      toast.success(t("Price corrected to {{total}}", { total: formatMoney(value!) }));
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("Correct the price")}</DialogTitle>
            <DialogDescription>
              {t(
                "For an order recorded at the wrong price when the courier collects the right one. The order keeps its shipment, items and stock; the books record the difference today.",
              )}
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={submitted && !!totalError}>
            <FieldLabel htmlFor="correct-total">{t("Right total (without shipping)")}</FieldLabel>
            <MoneyInput id="correct-total" value={total} onChange={setTotal} disabled={pending} autoFocus />
            {submitted && totalError ? (
              <FieldError>{totalError}</FieldError>
            ) : (
              <FieldDescription>
                {difference === undefined || Math.abs(difference) < MONEY_EPSILON
                  ? t("Now: {{total}}", { total: formatMoney(order.total) })
                  : t("Now: {{total}} · sales {{change}}", {
                      total: formatMoney(order.total),
                      change: `${difference > 0 ? "+" : "−"}${formatMoney(Math.abs(difference))}`,
                    })}
              </FieldDescription>
            )}
          </Field>
          <Field data-invalid={submitted && !!reasonError}>
            <FieldLabel htmlFor="correct-reason">{t("Reason")}</FieldLabel>
            <Input
              id="correct-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("Recorded at the wrong price")}
              maxLength={300}
              disabled={pending}
            />
            {submitted && reasonError && <FieldError>{reasonError}</FieldError>}
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {t("Correct the price")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
