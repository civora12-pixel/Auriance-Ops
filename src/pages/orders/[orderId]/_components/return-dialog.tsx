import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MoneyInput, QuantityInput } from "@/components/number-input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { parseNumber } from "@/lib/forms.ts";
import { cn } from "@/lib/utils.ts";
import {
  MONEY_EPSILON,
  ORDER_STATUS_LABELS,
  round2,
} from "@shared/constants.ts";
import { FormAlert, FormDialog } from "../../_components/form-dialog.tsx";
import type { FormDialogControl } from "../../_components/form-dialog.tsx";
import { autoRefund, lineLabel } from "../_lib/order.ts";
import type { OrderDetail } from "../_lib/order.ts";

type Row = { checked: boolean; quantity: string; sellable: boolean };

export function ReturnDialog({
  order,
  open,
  onOpenChange,
}: {
  order: OrderDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} className="sm:max-w-xl">
      {(control) => <ReturnForm order={order} {...control} />}
    </FormDialog>
  );
}

function ReturnForm({
  order,
  pending,
  setPending,
  close,
}: { order: OrderDetail } & FormDialogControl) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const returnItems = useMutation(api.orders.returnLineItems);
  const lines = order.lineItems.filter((l) => l.returnable > 0);
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l._id,
        {
          checked: lines.length === 1,
          quantity: String(l.returnable),
          sellable: true,
        },
      ]),
    ),
  );
  const [note, setNote] = useState("");
  // Announced by the courier but not here yet, or physically received
  const [inTransit, setInTransit] = useState(false);
  const [override, setOverride] = useState(false);
  const [manual, setManual] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string>();

  const patch = (id: string, change: Partial<Row>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...change } }));

  // Per-line quantity errors
  const qtyErrors: Record<string, string> = {};
  const selected = new Map<string, number>();
  for (const l of lines) {
    const row = rows[l._id];
    if (!row.checked) continue;
    const n = parseNumber(row.quantity);
    if (n === undefined || !Number.isInteger(n) || n < 1)
      qtyErrors[l._id] = t("Enter a whole number, at least 1");
    else if (n > l.returnable)
      qtyErrors[l._id] = t("Only {{count}} can be returned", {
        count: l.returnable,
      });
    else selected.set(l._id, n);
  }

  // Partly collected through the courier: the returned pieces close exactly what's still open
  const pendingRest = order.returnPending ? Math.max(0, round2(order.total - (order.paidAmount ?? 0))) : null;
  const calc = autoRefund(order, selected);
  const auto = pendingRest !== null ? { ...calc, amount: pendingRest } : calc;
  const needsManual = auto.amount === null;
  const useManual = pendingRest === null && (override || needsManual);
  const manualValue = parseNumber(manual);
  const refund = useManual ? manualValue : (auto.amount ?? undefined);

  let refundError: string | undefined;
  if (useManual) {
    if (manual.trim() === "") refundError = t("Enter the refund amount");
    else if (manualValue === undefined || manualValue < 0)
      refundError = t("Enter a valid amount");
    else if (Math.abs(Math.round(manualValue * 100) - manualValue * 100) > 1e-6)
      refundError = t("Use at most 2 decimal places");
    else if (manualValue > order.total + MONEY_EPSILON)
      refundError = t("Can't be more than the current total, {{total}}", {
        total: formatMoney(order.total),
      });
  }
  const noneSelected =
    selected.size === 0 && Object.keys(qtyErrors).length === 0;
  const valid = !noneSelected && !Object.keys(qtyErrors).length && !refundError;
  const show = (msg: string | undefined) => (submitted ? msg : undefined);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    setFormError(undefined);
    setPending(true);
    try {
      const res = await returnItems({
        orderId: order._id,
        lines: [...selected].map(([lineItemId, quantity]) => ({
          lineItemId,
          quantity,
          sellable: inTransit || rows[lineItemId].sellable,
        })),
        inTransit,
        note: note.trim() || undefined,
        manualRefundAmount: useManual ? round2(manualValue ?? 0) : undefined,
      });
      toast.success(
        res.refund > 0
          ? t("Return recorded. Refund {{amount}} to the customer.", {
              amount: formatMoney(res.refund),
            })
          : t("Return recorded"),
      );
      close();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{t("Return items")}</DialogTitle>
        <DialogDescription>
          {t(
            "The sale is reversed now, even if the items are still on their way. Received items go back to stock; damaged ones are written off.",
          )}
        </DialogDescription>
      </DialogHeader>

      <ToggleGroup
        type="single"
        variant="outline"
        value={inTransit ? "transit" : "received"}
        onValueChange={(v) => v && setInTransit(v === "transit")}
        className="w-full"
        disabled={pending}
        aria-label={t("Where are the items?")}
      >
        <ToggleGroupItem value="received" className="flex-1">
          {t("Received in the warehouse")}
        </ToggleGroupItem>
        <ToggleGroupItem value="transit" className="flex-1">
          {t("In transit (courier sheet)")}
        </ToggleGroupItem>
      </ToggleGroup>

      <ul className="grid gap-3">
        {lines.map((l) => {
          const row = rows[l._id];
          const id = `return-${l._id}`;
          return (
            <li
              key={l._id}
              className={cn(
                "grid gap-3 rounded-lg border p-3",
                row.checked && "border-primary/40 bg-muted/30",
              )}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  id={`${id}-check`}
                  checked={row.checked}
                  onCheckedChange={(v) => patch(l._id, { checked: v === true })}
                  disabled={pending}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <Label htmlFor={`${id}-check`} className="block truncate">
                    {lineLabel(l)}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {l.sku} ·{" "}
                    {t("{{price}} each", { price: formatMoney(l.unitPrice) })} ·{" "}
                    {t("{{count}} returnable", { count: l.returnable })}
                    {!l.inCatalog &&
                      ` · ${t("no longer in the catalog, stock won't change")}`}
                  </p>
                </div>
              </div>
              {row.checked && (
                <div className="flex flex-wrap items-start gap-4 ps-7">
                  <Field
                    data-invalid={!!show(qtyErrors[l._id])}
                    className="w-auto gap-1"
                  >
                    <FieldLabel htmlFor={`${id}-qty`} className="text-xs">
                      {t("Quantity")}
                    </FieldLabel>
                    <QuantityInput
                      id={`${id}-qty`}
                      value={row.quantity}
                      onChange={(v) => patch(l._id, { quantity: v })}
                      className="w-20"
                      aria-invalid={!!show(qtyErrors[l._id])}
                      disabled={pending}
                    />
                    {show(qtyErrors[l._id]) && (
                      <FieldError>{qtyErrors[l._id]}</FieldError>
                    )}
                  </Field>
                  {!inTransit && (
                    <Field orientation="horizontal" className="w-auto pt-6">
                      <Switch
                        id={`${id}-sellable`}
                        checked={row.sellable}
                        onCheckedChange={(v) => patch(l._id, { sellable: v })}
                        disabled={pending || !l.inCatalog}
                      />
                      <FieldLabel
                        htmlFor={`${id}-sellable`}
                        className="font-normal"
                      >
                        {row.sellable
                          ? t("Back to stock")
                          : t("Damaged, write off")}
                      </FieldLabel>
                    </Field>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {submitted && noneSelected && (
        <FieldError>{t("Select at least one item to return")}</FieldError>
      )}

      <div className="grid gap-3 rounded-lg bg-muted/50 p-4">
        {pendingRest !== null ? (
          <p className="text-sm text-muted-foreground">
            {t("The courier collected {{collected}} for the pieces kept. This return closes the {{rest}} still open, whatever pieces came back.", {
              collected: formatMoney(order.paidAmount ?? 0),
              rest: formatMoney(pendingRest),
            })}
          </p>
        ) : needsManual ? (
          <p className="text-sm text-muted-foreground">
            {t(
              "This order has a custom total, so enter the refund for a partial return.",
            )}
          </p>
        ) : (
          <Field orientation="horizontal">
            <Switch
              id="return-override"
              checked={override}
              onCheckedChange={setOverride}
              disabled={pending}
            />
            <FieldLabel htmlFor="return-override" className="font-normal">
              {t("Enter a different refund amount")}
            </FieldLabel>
          </Field>
        )}
        {useManual && (
          <Field data-invalid={!!show(refundError)}>
            <FieldLabel htmlFor="return-refund">
              {t("Refund amount")}
            </FieldLabel>
            <MoneyInput
              id="return-refund"
              value={manual}
              onChange={setManual}
              aria-invalid={!!show(refundError)}
              disabled={pending}
            />
            {show(refundError) ? (
              <FieldError>{refundError}</FieldError>
            ) : (
              <FieldDescription>
                {t("Up to {{total}}, the order's current total.", {
                  total: formatMoney(order.total),
                })}
              </FieldDescription>
            )}
          </Field>
        )}
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("Refund")}</dt>
            <dd className="font-medium tabular-nums">{formatMoney(refund)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("New order total")}</dt>
            <dd className="tabular-nums">
              {refund === undefined
                ? "—"
                : formatMoney(Math.max(0, round2(order.total - refund)))}
            </dd>
          </div>
          {selected.size > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("Order becomes")}</dt>
              <dd>
                {auto.isFull
                  ? t(ORDER_STATUS_LABELS.returned)
                  : t(ORDER_STATUS_LABELS.partially_returned)}
              </dd>
            </div>
          )}
        </dl>
        {order.paymentStatus === "unpaid" &&
          refund !== undefined &&
          refund > 0 && (
            <p className="text-xs text-muted-foreground">
              {t(
                "The order isn't marked as paid yet, so this lowers what the customer owes.",
              )}
            </p>
          )}
      </div>

      <Field>
        <FieldLabel htmlFor="return-note">
          {t("Reason")}{" "}
          <span className="font-normal text-muted-foreground">
            {t("(optional)")}
          </span>
        </FieldLabel>
        <Textarea
          id="return-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder={t("Wrong size, damaged in transit…")}
          disabled={pending}
        />
      </Field>

      <FormAlert message={formError} />
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={close}
          disabled={pending}
        >
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {t("Record return")}
        </Button>
      </DialogFooter>
    </form>
  );
}
