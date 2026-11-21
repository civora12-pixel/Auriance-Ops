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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { ProductPicker } from "@/components/product-picker.tsx";
import type { SellableItem } from "@/components/product-picker.tsx";
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import {
  parseNumber,
  zOptionalMoneyField,
  zQuantityField,
} from "@/lib/forms.ts";
import {
  ADJUST_DOWN_REASONS,
  ADJUST_REASON_LABELS,
  ADJUST_UP_REASONS,
  formatMovementNumber,
} from "@shared/constants.ts";
import type { AdjustDirection, AdjustReason } from "@shared/constants.ts";
import {
  focusFirstError,
  issueMap,
} from "../../products/_components/form-utils.ts";

export default function AdjustDialog({
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
          <AdjustForm
            pending={pending}
            setPending={setPending}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({
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
  const { formatNumber, formatMoney, today } = useFormat();
  const adjust = useMutation(api.inventory.adjust);
  const maxDay = today();
  const [direction, setDirection] = useState<AdjustDirection>("decrease");
  const [item, setItem] = useState<SellableItem | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<AdjustReason | "">("");
  const [cost, setCost] = useState("");
  const [date, setDate] = useState(maxDay);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const increase = direction === "increase";
  const reasons: readonly AdjustReason[] = increase
    ? ADJUST_UP_REASONS
    : ADJUST_DOWN_REASONS;
  const onHand = item?.onHand ?? 0;
  const avgCost = item?.avgCost ?? 0;
  // An item that never had a cost needs one entered to add stock
  const needsCost = increase && !!item && !avgCost;
  const qty = parseNumber(quantity);
  const unitCost = needsCost ? parseNumber(cost) : avgCost;
  const amount =
    item && qty && unitCost !== undefined ? qty * unitCost : undefined;

  const changeDirection = (next: string) => {
    if (next !== "increase" && next !== "decrease") return;
    setDirection(next);
    setReason("");
    setErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const schema = z.object({
      item: z
        .string({ error: t("Choose a product") })
        .min(1, t("Choose a product")),
      quantity:
        item && !increase
          ? zQuantityField({
              max: Math.max(1, onHand),
              maxMessage: t("Only {{quantity}} {{uom}} on hand", {
                quantity: formatNumber(onHand),
                uom: item.uom,
              }),
            })
          : zQuantityField(),
      reason: z.enum(reasons as [AdjustReason, ...AdjustReason[]], {
        error: t("Choose a reason"),
      }),
      cost: zOptionalMoneyField(),
      date: z.string().min(1, t("Choose a date")),
    });
    const parsed = schema.safeParse({
      item: item?.key,
      quantity,
      reason: reason || undefined,
      cost,
      date,
    });
    const errs = parsed.success ? {} : issueMap(parsed.error);
    if (item && !increase && onHand === 0)
      errs.item ??= t("This item has no stock to remove");
    if (needsCost && parseNumber(cost) === undefined)
      errs.cost ??= t("This item has no cost yet. Enter the unit cost.");
    if (date > maxDay) errs.date ??= t("The date can't be in the future");
    if (reason === "other" && !notes.trim())
      errs.notes = t("Describe what happened");
    setErrors(errs);
    if (!parsed.success || Object.keys(errs).length)
      return focusFirstError(errs, prefix);
    if (!item) return;
    setPending(true);
    try {
      const res = await adjust({
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        direction,
        quantity: parsed.data.quantity,
        reason: parsed.data.reason,
        cost: needsCost ? parsed.data.cost : undefined,
        date: parsed.data.date,
        notes: notes.trim() || undefined,
      });
      const vars = {
        quantity: formatNumber(parsed.data.quantity),
        uom: item.uom,
        name: item.label,
      };
      toast.success(
        increase
          ? t("Added {{quantity}} {{uom}} of {{name}}", vars)
          : t("Removed {{quantity}} {{uom}} of {{name}}", vars),
        {
          description: t(
            "{{movement}} · {{amount}} · {{quantity}} on hand now",
            {
              movement: formatMovementNumber(res.movementNumber),
              amount: formatMoney(res.amount),
              quantity: formatNumber(res.onHand),
            },
          ),
        },
      );
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
        <DialogTitle>{t("Adjust stock")}</DialogTitle>
        <DialogDescription>
          {increase
            ? t(
                "Add stock found in a physical count. It's valued at the item's average cost. For new purchases, use Restock.",
              )
            : t("Remove stock that was lost, damaged or expired.")}
        </DialogDescription>
      </DialogHeader>

      <ToggleGroup
        type="single"
        variant="outline"
        value={direction}
        onValueChange={changeDirection}
        disabled={pending}
        className="w-full"
        aria-label={t("Adjustment type")}
      >
        <ToggleGroupItem value="decrease" className="flex-1">
          {t("Decrease")}
        </ToggleGroupItem>
        <ToggleGroupItem value="increase" className="flex-1">
          {t("Increase")}
        </ToggleGroupItem>
      </ToggleGroup>

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
              {increase ? t("Quantity to add") : t("Quantity to remove")}
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
                  {t("{{quantity}} {{uom}} on hand", {
                    quantity: formatNumber(onHand),
                    uom: item.uom,
                  })}
                </FieldDescription>
              )
            )}
          </Field>
          <Field data-invalid={!!errors.reason || undefined}>
            <FieldLabel htmlFor={`${prefix}reason`}>{t("Reason")}</FieldLabel>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as AdjustReason)}
              disabled={pending}
            >
              <SelectTrigger
                id={`${prefix}reason`}
                className="w-full"
                aria-invalid={!!errors.reason || undefined}
              >
                <SelectValue placeholder={t("Choose a reason")} />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(ADJUST_REASON_LABELS[r])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.reason && <FieldError>{t(errors.reason)}</FieldError>}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.date || undefined}>
            <FieldLabel htmlFor={`${prefix}date`}>{t("Date")}</FieldLabel>
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
          {needsCost ? (
            <Field data-invalid={!!errors.cost || undefined}>
              <FieldLabel htmlFor={`${prefix}cost`}>
                {t("Unit cost")}
              </FieldLabel>
              <MoneyInput
                id={`${prefix}cost`}
                value={cost}
                onChange={setCost}
                disabled={pending}
                aria-invalid={!!errors.cost || undefined}
              />
              {errors.cost ? (
                <FieldError>{t(errors.cost)}</FieldError>
              ) : (
                <FieldDescription>
                  {amount !== undefined
                    ? t("Amount {{amount}}", { amount: formatMoney(amount) })
                    : t("This item has no cost yet. Enter the unit cost.")}
                </FieldDescription>
              )}
            </Field>
          ) : (
            item && (
              <Field>
                <FieldLabel>{t("Amount")}</FieldLabel>
                <div className="flex h-9 items-center text-sm tabular-nums">
                  {amount !== undefined ? formatMoney(amount) : "—"}
                </div>
                <FieldDescription>
                  {t("At average cost {{amount}} a unit", {
                    amount: formatMoney(avgCost),
                  })}
                </FieldDescription>
              </Field>
            )
          )}
        </div>

        <Field data-invalid={!!errors.notes || undefined}>
          <FieldLabel htmlFor={`${prefix}notes`}>
            {reason === "other" ? t("Notes") : t("Notes (optional)")}
          </FieldLabel>
          <Textarea
            id={`${prefix}notes`}
            rows={2}
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
            disabled={pending}
            aria-invalid={!!errors.notes || undefined}
          />
          {errors.notes && <FieldError>{t(errors.notes)}</FieldError>}
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
        <Button
          type="submit"
          variant={increase ? "default" : "destructive"}
          disabled={pending}
        >
          {pending && <Spinner />}
          {increase ? t("Add stock") : t("Remove stock")}
        </Button>
      </DialogFooter>
    </form>
  );
}
