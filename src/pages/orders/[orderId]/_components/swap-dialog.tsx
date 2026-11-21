import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MoneyInput, QuantityInput } from "@/components/number-input.tsx";
import {
  ProductPicker,
  useSellableItems,
} from "@/components/product-picker.tsx";
import type { SellableItem } from "@/components/product-picker.tsx";
import { Button } from "@/components/ui/button.tsx";
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
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { parseNumber } from "@/lib/forms.ts";
import i18n from "@/lib/i18n.ts";
import { MONEY_EPSILON, round2 } from "@shared/constants.ts";
import { FormAlert, FormDialog } from "../../_components/form-dialog.tsx";
import type { FormDialogControl } from "../../_components/form-dialog.tsx";
import { lineLabel } from "../_lib/order.ts";
import type { OrderDetail } from "../_lib/order.ts";

export function SwapDialog({
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
      {(control) => <SwapForm order={order} {...control} />}
    </FormDialog>
  );
}

/** Whole number in [min, max], or an error message. */
function wholeNumber(
  value: string,
  min: number,
  max: number,
  maxMessage: string,
): string | undefined {
  if (!value.trim()) return i18n.t("Enter a quantity");
  const n = parseNumber(value);
  if (n === undefined || !Number.isInteger(n))
    return i18n.t("Use a whole number");
  if (n < min) return i18n.t("Must be at least {{min}}", { min });
  if (n > max) return maxMessage;
  return undefined;
}

function moneyError(value: string, required: string): string | undefined {
  if (!value.trim()) return required;
  const n = parseNumber(value);
  if (n === undefined) return i18n.t("Enter a valid number");
  if (n < 0) return i18n.t("Can't be negative");
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6)
    return i18n.t("Use at most 2 decimal places");
  return undefined;
}

function SwapForm({
  order,
  pending,
  setPending,
  close,
}: { order: OrderDetail } & FormDialogControl) {
  const { t } = useTranslation();
  const { formatMoney, formatNumber } = useFormat();
  const swap = useMutation(api.orders.swapLineItem);
  const items = useSellableItems();
  const lines = order.lineItems.filter((l) => l.returnable > 0);

  const [lineId, setLineId] = useState(lines.length === 1 ? lines[0]._id : "");
  const [returnQty, setReturnQty] = useState("1");
  const [returnSellable, setReturnSellable] = useState(true);
  const [replacement, setReplacement] = useState<SellableItem>();
  const [replacementQty, setReplacementQty] = useState("1");
  const [price, setPrice] = useState("");
  const [override, setOverride] = useState(false);
  const [manual, setManual] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string>();

  const line = lines.find((l) => l._id === lineId);
  // Fresh stock for the picked replacement (the picker's item may be from an older fetch)
  const replacementItem = replacement
    ? (items?.find((i) => i.key === replacement.key) ?? replacement)
    : undefined;
  const useManual = order.hasManualTotal || override;

  const rq = parseNumber(returnQty) ?? 0;
  const nq = parseNumber(replacementQty) ?? 0;
  const unitPrice = parseNumber(price) ?? 0;
  const refund = useManual
    ? parseNumber(manual)
    : line
      ? round2(rq * line.unitPrice)
      : undefined;
  const replacementValue = round2(nq * unitPrice);
  const difference =
    refund === undefined ? undefined : round2(replacementValue - refund);

  const errors: Record<string, string | undefined> = {
    line: line ? undefined : t("Choose the item being swapped"),
    returnQty: line
      ? wholeNumber(
          returnQty,
          1,
          line.returnable,
          t("Only {{count}} can be swapped", { count: line.returnable }),
        )
      : undefined,
    replacement: replacementItem ? undefined : t("Choose the replacement"),
    replacementQty:
      wholeNumber(
        replacementQty,
        1,
        1_000_000,
        t("That quantity is too large"),
      ) ??
      (replacementItem && nq > replacementItem.available
        ? t("Only {{available}} {{uom}} available", {
            available: formatNumber(Math.max(0, replacementItem.available)),
            uom: replacementItem.uom,
          })
        : undefined),
    price: moneyError(price, t("Enter a price")),
    refund: useManual
      ? moneyError(manual, t("Enter the refund for the returned units"))
      : undefined,
  };
  if (
    !errors.refund &&
    difference !== undefined &&
    order.total + difference < -MONEY_EPSILON
  ) {
    errors.refund = t(
      "The refund can't be more than the order's current total plus the replacement",
    );
  }
  const valid = Object.values(errors).every((e) => !e);
  const show = (key: string) => (submitted ? errors[key] : undefined);

  const pickReplacement = (item: SellableItem) => {
    setReplacement(item);
    setPrice(String(item.unitPrice));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid || !line || !replacementItem) return;
    setFormError(undefined);
    setPending(true);
    try {
      const res = await swap({
        orderId: order._id,
        returnLineItemId: line._id,
        returnQuantity: rq,
        returnSellable,
        replacementProductId: replacementItem.productId,
        replacementVariantId: replacementItem.variantId,
        replacementQuantity: nq,
        replacementUnitPrice: round2(unitPrice),
        manualRefundAmount: useManual ? round2(refund ?? 0) : undefined,
        note: note.trim() || undefined,
      });
      const diff = res.priceDifference;
      toast.success(
        diff > MONEY_EPSILON
          ? t("Swap recorded. The customer pays {{amount}} more.", {
              amount: formatMoney(diff),
            })
          : diff < -MONEY_EPSILON
            ? t("Swap recorded. Refund {{amount}} to the customer.", {
                amount: formatMoney(-diff),
              })
            : t("Swap recorded"),
      );
      close();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{t("Swap an item")}</DialogTitle>
        <DialogDescription>
          {t(
            "Take back shipped units and send a replacement right away. Stock moves both ways and the price difference adjusts the order total.",
          )}
        </DialogDescription>
      </DialogHeader>

      <FieldSet>
        <FieldLegend variant="label">{t("Coming back")}</FieldLegend>
        <FieldGroup className="gap-4">
          <Field data-invalid={!!show("line")}>
            <FieldLabel htmlFor="swap-line" className="sr-only">
              {t("Item being swapped")}
            </FieldLabel>
            <Select
              value={lineId}
              onValueChange={(v) => {
                setLineId(v);
                setReturnQty("1");
              }}
              disabled={pending}
            >
              <SelectTrigger
                id="swap-line"
                className="w-full"
                aria-invalid={!!show("line")}
              >
                <SelectValue
                  placeholder={t("Choose the item being swapped…")}
                />
              </SelectTrigger>
              <SelectContent>
                {lines.map((l) => (
                  <SelectItem key={l._id} value={l._id}>
                    {lineLabel(l)} ·{" "}
                    {t("{{shipped}} shipped, {{price}} each", {
                      shipped: l.returnable,
                      price: formatMoney(l.unitPrice),
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {show("line") && <FieldError>{errors.line}</FieldError>}
          </Field>
          <div className="flex flex-wrap items-start gap-4">
            <Field data-invalid={!!show("returnQty")} className="w-auto">
              <FieldLabel htmlFor="swap-return-qty">{t("Quantity")}</FieldLabel>
              <QuantityInput
                id="swap-return-qty"
                value={returnQty}
                onChange={setReturnQty}
                className="w-24"
                aria-invalid={!!show("returnQty")}
                disabled={pending}
              />
              {show("returnQty") && <FieldError>{errors.returnQty}</FieldError>}
            </Field>
            <Field orientation="horizontal" className="w-auto pt-7">
              <Switch
                id="swap-sellable"
                checked={returnSellable}
                onCheckedChange={setReturnSellable}
                disabled={pending || (line ? !line.inCatalog : false)}
              />
              <FieldLabel htmlFor="swap-sellable" className="font-normal">
                {returnSellable ? t("Back to stock") : t("Damaged, write off")}
              </FieldLabel>
            </Field>
          </div>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">{t("Going out")}</FieldLegend>
        <FieldGroup className="gap-4">
          <Field data-invalid={!!show("replacement")}>
            <FieldLabel htmlFor="swap-replacement" className="sr-only">
              {t("Replacement")}
            </FieldLabel>
            <ProductPicker
              id="swap-replacement"
              value={replacement?.key}
              onChange={pickReplacement}
              warnOutOfStock
              invalid={!!show("replacement")}
              disabled={pending}
              placeholder={t("Choose the replacement…")}
            />
            {show("replacement") && (
              <FieldError>{errors.replacement}</FieldError>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!show("replacementQty")}>
              <FieldLabel htmlFor="swap-replacement-qty">
                {t("Quantity")}
              </FieldLabel>
              <QuantityInput
                id="swap-replacement-qty"
                value={replacementQty}
                onChange={setReplacementQty}
                aria-invalid={!!show("replacementQty")}
                disabled={pending}
              />
              {show("replacementQty") ? (
                <FieldError>{errors.replacementQty}</FieldError>
              ) : (
                replacementItem && (
                  <FieldDescription>
                    {t("{{available}} {{uom}} available", {
                      available: formatNumber(
                        Math.max(0, replacementItem.available),
                      ),
                      uom: replacementItem.uom,
                    })}
                  </FieldDescription>
                )
              )}
            </Field>
            <Field data-invalid={!!show("price")}>
              <FieldLabel htmlFor="swap-price">{t("Unit price")}</FieldLabel>
              <MoneyInput
                id="swap-price"
                value={price}
                onChange={setPrice}
                aria-invalid={!!show("price")}
                disabled={pending}
              />
              {show("price") && <FieldError>{errors.price}</FieldError>}
            </Field>
          </div>
        </FieldGroup>
      </FieldSet>

      <div className="grid gap-3 rounded-lg bg-muted/50 p-4">
        {order.hasManualTotal ? (
          <p className="text-sm text-muted-foreground">
            {t(
              "This order has a custom total, so enter how much the returned units were worth.",
            )}
          </p>
        ) : (
          <Field orientation="horizontal">
            <Switch
              id="swap-override"
              checked={override}
              onCheckedChange={setOverride}
              disabled={pending}
            />
            <FieldLabel htmlFor="swap-override" className="font-normal">
              {t("Enter a different refund for the returned units")}
            </FieldLabel>
          </Field>
        )}
        {useManual && (
          <Field data-invalid={!!show("refund")}>
            <FieldLabel htmlFor="swap-refund">
              {t("Refund for returned units")}
            </FieldLabel>
            <MoneyInput
              id="swap-refund"
              value={manual}
              onChange={setManual}
              aria-invalid={!!show("refund")}
              disabled={pending}
            />
            {show("refund") && <FieldError>{errors.refund}</FieldError>}
          </Field>
        )}
        {!useManual && show("refund") && (
          <FieldError>{errors.refund}</FieldError>
        )}
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("Returned units")}</dt>
            <dd className="tabular-nums">
              {refund === undefined ? "—" : `−${formatMoney(refund)}`}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("Replacement")}</dt>
            <dd className="tabular-nums">+{formatMoney(replacementValue)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t pt-2 font-medium">
            <dt>
              {difference === undefined
                ? t("Difference")
                : difference > MONEY_EPSILON
                  ? t("Customer pays more")
                  : difference < -MONEY_EPSILON
                    ? t("Refund to customer")
                    : t("No price difference")}
            </dt>
            <dd className="tabular-nums">
              {difference === undefined
                ? "—"
                : formatMoney(Math.abs(difference))}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("New order total")}</dt>
            <dd className="tabular-nums">
              {difference === undefined
                ? "—"
                : formatMoney(Math.max(0, round2(order.total + difference)))}
            </dd>
          </div>
        </dl>
      </div>

      <Field>
        <FieldLabel htmlFor="swap-note">
          {t("Note")}{" "}
          <span className="font-normal text-muted-foreground">
            {t("(optional)")}
          </span>
        </FieldLabel>
        <Textarea
          id="swap-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder={t("Exchanged for another size…")}
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
          {t("Record swap")}
        </Button>
      </DialogFooter>
    </form>
  );
}
