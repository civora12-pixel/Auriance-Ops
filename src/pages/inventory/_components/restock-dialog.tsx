import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { MoneyInput, QuantityInput } from "@/components/number-input.tsx";
import { ProductPicker } from "@/components/product-picker.tsx";
import type { SellableItem } from "@/components/product-picker.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import {
  parseNumber,
  zOptionalMoneyField,
  zQuantityField,
} from "@/lib/forms.ts";
import { tk } from "@/lib/i18n.ts";
import { RESTOCK_TYPES, RESTOCK_TYPE_LABELS } from "@shared/constants.ts";
import type { RestockType } from "@shared/constants.ts";
import {
  focusFirstError,
  issueMap,
} from "../../products/_components/form-utils.ts";

const schema = z.object({
  item: z
    .string({ error: tk("Choose a product") })
    .min(1, tk("Choose a product")),
  quantity: zQuantityField(),
  cost: zOptionalMoneyField().refine(
    (n) => n === undefined || Math.abs(Math.round(n * 100) - n * 100) < 1e-6,
    tk("Use at most 2 decimal places"),
  ),
  date: z.string().min(1, tk("Choose a date")),
});

export default function RestockDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open && (
          <RestockForm
            pending={pending}
            setPending={setPending}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RestockForm({
  pending,
  setPending,
  onDone,
}: {
  pending: boolean;
  setPending: (p: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const prefix = `${useId()}-`;
  const { formatMoney, formatNumber, today } = useFormat();
  const restock = useMutation(api.inventory.restock);
  const maxDay = today();
  const [item, setItem] = useState<SellableItem | null>(null);
  const [restockType, setRestockType] = useState<RestockType>("purchase");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [date, setDate] = useState(maxDay);
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const payFrom = useQuery(api.finance.accounts.paymentOptions);
  // Empty means the default account (QNB)
  const [paidFrom, setPaidFrom] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const qty = parseNumber(quantity);
  const unitCost = parseNumber(cost) ?? item?.avgCost ?? undefined;
  const newAvg =
    item &&
    qty &&
    qty > 0 &&
    unitCost !== undefined &&
    item.avgCost !== null &&
    item.avgCost !== undefined
      ? (item.onHand * item.avgCost + qty * unitCost) / (item.onHand + qty)
      : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ item: item?.key, quantity, cost, date });
    const errs = parsed.success ? {} : issueMap(parsed.error);
    if (date > maxDay) errs.date ??= t("The date can't be in the future");
    // Stock must enter at a cost; an item without one can't fall back on the average
    if (item && !item.avgCost && parseNumber(cost) === undefined)
      errs.cost ??= t("This item has no cost yet. Enter the unit cost.");
    setErrors(errs);
    if (!parsed.success || Object.keys(errs).length)
      return focusFirstError(errs, prefix);
    if (!item) return;
    setPending(true);
    try {
      const res = await restock({
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        restockType,
        quantity: parsed.data.quantity,
        cost: parsed.data.cost,
        date: parsed.data.date,
        supplier: supplier.trim() || undefined,
        notes: notes.trim() || undefined,
        paidFromAccountId:
          restockType === "purchase" && paidFrom ? paidFrom : undefined,
      });
      toast.success(t("Restocked {{name}}", { name: item.label }), {
        description: t("+{{quantity}} {{uom}} · {{onHand}} on hand now", {
          quantity: formatNumber(parsed.data.quantity),
          uom: item.uom,
          onHand: formatNumber(res.onHand),
        }),
      });
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("Restock")}</DialogTitle>
        <DialogDescription>
          {t(
            "Record stock that arrived. On-hand stock and the average cost update right away.",
          )}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.item || undefined}>
          <FieldLabel htmlFor={`${prefix}item`}>{t("Product")}</FieldLabel>
          <ProductPicker
            id={`${prefix}item`}
            value={item?.key}
            onChange={setItem}
            showPrice={false}
            disabled={pending}
            invalid={!!errors.item}
          />
          {errors.item && <FieldError>{t(errors.item)}</FieldError>}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.quantity || undefined}>
            <FieldLabel htmlFor={`${prefix}quantity`}>
              {item
                ? t("Quantity ({{uom}})", { uom: item.uom })
                : t("Quantity")}
            </FieldLabel>
            <QuantityInput
              id={`${prefix}quantity`}
              value={quantity}
              onChange={setQuantity}
              disabled={pending}
              aria-invalid={!!errors.quantity || undefined}
            />
            {errors.quantity ? (
              <FieldError>{t(errors.quantity)}</FieldError>
            ) : (
              item && (
                <FieldDescription>
                  {t("{{quantity}} on hand now", {
                    quantity: formatNumber(item.onHand),
                  })}
                </FieldDescription>
              )
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}type`}>{t("Type")}</FieldLabel>
            <Select
              value={restockType}
              onValueChange={(v) => setRestockType(v as RestockType)}
              disabled={pending}
            >
              <SelectTrigger id={`${prefix}type`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESTOCK_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(RESTOCK_TYPE_LABELS[type])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.cost || undefined}>
            <FieldLabel htmlFor={`${prefix}cost`}>
              {item && !item.avgCost
                ? t("Unit cost")
                : t("Unit cost (optional)")}
            </FieldLabel>
            <MoneyInput
              id={`${prefix}cost`}
              value={cost}
              onChange={setCost}
              disabled={pending}
              placeholder={
                item?.avgCost != null ? item.avgCost.toFixed(2) : "0.00"
              }
              aria-invalid={!!errors.cost || undefined}
            />
            {errors.cost ? (
              <FieldError>{t(errors.cost)}</FieldError>
            ) : (
              <FieldDescription>
                {qty && unitCost !== undefined
                  ? t("Total {{amount}}", {
                      amount: formatMoney(qty * unitCost),
                    })
                  : t("Blank keeps the current average cost")}
                {newAvg !== undefined &&
                  ` · ${t("new avg {{amount}}", { amount: formatMoney(newAvg) })}`}
              </FieldDescription>
            )}
          </Field>
          <Field data-invalid={!!errors.date || undefined}>
            <FieldLabel htmlFor={`${prefix}date`}>
              {t("Date received")}
            </FieldLabel>
            <Input
              id={`${prefix}date`}
              type="date"
              value={date}
              max={maxDay}
              onChange={(e) => setDate(e.target.value)}
              disabled={pending}
              aria-invalid={!!errors.date || undefined}
            />
            {errors.date && <FieldError>{t(errors.date)}</FieldError>}
          </Field>
        </div>

        {restockType === "purchase" && payFrom && payFrom.length > 0 && (
          <Field>
            <FieldLabel htmlFor={`${prefix}paid-from`}>{t("Paid from")}</FieldLabel>
            <Select
              value={paidFrom || payFrom[0]._id}
              onValueChange={setPaidFrom}
              disabled={pending}
            >
              <SelectTrigger id={`${prefix}paid-from`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {payFrom.map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.systemKey === "accounts_payable"
                      ? t("Not paid yet (Accounts Payable)")
                      : a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {t("Where the money came from. The accounts are updated automatically.")}
            </FieldDescription>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor={`${prefix}supplier`}>
            {t("Supplier (optional)")}
          </FieldLabel>
          <Input
            id={`${prefix}supplier`}
            value={supplier}
            maxLength={200}
            onChange={(e) => setSupplier(e.target.value)}
            disabled={pending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}notes`}>
            {t("Notes (optional)")}
          </FieldLabel>
          <Textarea
            id={`${prefix}notes`}
            rows={2}
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
            disabled={pending}
          />
        </Field>
      </FieldGroup>

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
          {pending && <Spinner />}
          {t("Restock")}
        </Button>
      </DialogFooter>
    </form>
  );
}
