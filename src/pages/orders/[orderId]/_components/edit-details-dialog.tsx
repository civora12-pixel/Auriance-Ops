import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button.tsx";
import {
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
import { MoneyInput } from "@/components/number-input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useFieldVisibility } from "@/hooks/use-field-visibility.ts";
import { api, getErrorMessage, isApiError, useMutation } from "@/lib/api.ts";
import { zMoneyField, zPhoneField } from "@/lib/forms.ts";
import { tk } from "@/lib/i18n.ts";
import {
  SALES_CHANNELS,
  SALES_CHANNEL_LABELS,
  round2,
} from "@shared/constants.ts";
import { FormAlert, FormDialog } from "../../_components/form-dialog.tsx";
import type { FormDialogControl } from "../../_components/form-dialog.tsx";
import {
  fieldId,
  focusFirstError,
  issuesToErrors,
} from "../../_lib/form-errors.ts";
import type { FieldErrors } from "../../_lib/form-errors.ts";
import type { OrderDetail } from "../_lib/order.ts";

const ID = "edit-order";

const schema = z.object({
  customer: z
    .string()
    .trim()
    .min(1, tk("Enter the customer's name"))
    .max(200, tk("Use at most 200 characters")),
  customerPhone: zPhoneField({ required: true }),
  customerPhone2: zPhoneField({ required: false }),
  address: z
    .string()
    .trim()
    .min(1, tk("Enter the delivery address"))
    .max(1000, tk("Use at most 1,000 characters")),
  channel: z.enum(SALES_CHANNELS, {
    error: tk("Choose where the order came from"),
  }),
  shippingFee: zMoneyField({ required: tk("Enter the shipping fee") }),
  shipmentNumber: z
    .string()
    .trim()
    .min(1, tk("Enter the shipment number"))
    .max(100, tk("Use at most 100 characters")),
  notes: z.string().trim().max(2000, tk("Use at most 2,000 characters")),
  shipmentNotes: z
    .string()
    .trim()
    .max(2000, tk("Use at most 2,000 characters")),
});
type Values = Record<
  | "customer"
  | "customerPhone"
  | "customerPhone2"
  | "address"
  | "channel"
  | "shippingFee"
  | "shipmentNumber"
  | "notes"
  | "shipmentNotes",
  string
>;

export function EditDetailsDialog({
  order,
  open,
  onOpenChange,
}: {
  order: OrderDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} className="sm:max-w-lg">
      {(control) => <EditDetailsForm order={order} {...control} />}
    </FormDialog>
  );
}

function EditDetailsForm({
  order,
  pending,
  setPending,
  close,
}: { order: OrderDetail } & FormDialogControl) {
  const { t } = useTranslation();
  const { isFieldVisible } = useFieldVisibility();
  const show = (field: string) => isFieldVisible("orders", field);
  const updateDetails = useMutation(api.orders.updateDetails);
  const [values, setValues] = useState<Values>({
    customer: order.customer,
    customerPhone: order.customerPhone ?? "",
    customerPhone2: order.customerPhone2 ?? "",
    address: order.address ?? "",
    channel: order.channel ?? "",
    shippingFee: String(order.shippingFee ?? 0),
    shipmentNumber: order.shipmentNumber,
    notes: order.notes ?? "",
    shipmentNotes: order.shipmentNotes ?? "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  const set = (key: keyof Values, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(({ [key]: _, ...rest }) => rest);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = schema.safeParse(values);
    if (!result.success) {
      const next = issuesToErrors(result.error);
      setErrors(next);
      focusFirstError(ID, next);
      return;
    }
    const v = result.data;
    setFormError(undefined);
    setPending(true);
    try {
      // Hidden fields keep their current value (the server clears anything left out)
      await updateDetails({
        orderId: order._id,
        customer: v.customer,
        shipmentNumber: v.shipmentNumber,
        customerPhone: v.customerPhone,
        customerPhone2: v.customerPhone2 || undefined,
        address: v.address,
        channel: v.channel,
        shippingFee: round2(v.shippingFee as number),
        notes: v.notes || undefined,
        shipmentNotes: v.shipmentNotes || undefined,
      });
      toast.success(t("Order details saved"));
      close();
    } catch (err) {
      if (isApiError(err, "CONFLICT"))
        setErrors({ shipmentNumber: err.message });
      else setFormError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const input = (
    key: keyof Values,
    label: string,
    opts: { required?: boolean; type?: string } = {},
  ) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={fieldId(ID, key)}>
        {label}
        {!opts.required && (
          <span className="font-normal text-muted-foreground">
            {t("(optional)")}
          </span>
        )}
      </FieldLabel>
      <Input
        id={fieldId(ID, key)}
        type={opts.type ?? "text"}
        value={values[key]}
        onChange={(e) => set(key, e.target.value)}
        autoComplete="off"
        aria-invalid={!!errors[key]}
        disabled={pending}
      />
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );

  const textarea = (key: keyof Values, label: string) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={fieldId(ID, key)}>
        {label}{" "}
        <span className="font-normal text-muted-foreground">
          {t("(optional)")}
        </span>
      </FieldLabel>
      <Textarea
        id={fieldId(ID, key)}
        value={values[key]}
        onChange={(e) => set(key, e.target.value)}
        rows={3}
        aria-invalid={!!errors[key]}
        disabled={pending}
      />
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{t("Edit order details")}</DialogTitle>
        <DialogDescription>
          {t(
            "Items and prices can't be changed here. Use returns and swaps for that.",
          )}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {input("customer", t("Customer name"), { required: true })}
          {input("customerPhone", t("Phone"), { type: "tel", required: true })}
          {input("customerPhone2", t("Second phone"), { type: "tel" })}
          {input("shipmentNumber", t("Shipment number"), { required: true })}
          <Field data-invalid={!!errors.channel}>
            <FieldLabel htmlFor={fieldId(ID, "channel")}>
              {t("Ordered via")}
            </FieldLabel>
            <Select
              value={values.channel}
              onValueChange={(v) => set("channel", v)}
              disabled={pending}
            >
              <SelectTrigger
                id={fieldId(ID, "channel")}
                className="w-full"
                aria-invalid={!!errors.channel}
              >
                <SelectValue placeholder={t("Choose a channel")} />
              </SelectTrigger>
              <SelectContent>
                {SALES_CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(SALES_CHANNEL_LABELS[c])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.channel && <FieldError>{errors.channel}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.shippingFee}>
            <FieldLabel htmlFor={fieldId(ID, "shippingFee")}>
              {t("Shipping fee")}
            </FieldLabel>
            <MoneyInput
              id={fieldId(ID, "shippingFee")}
              value={values.shippingFee}
              onChange={(v) => set("shippingFee", v)}
              aria-invalid={!!errors.shippingFee}
              disabled={pending}
            />
            {errors.shippingFee && (
              <FieldError>{errors.shippingFee}</FieldError>
            )}
          </Field>
        </div>
        <Field data-invalid={!!errors.address}>
          <FieldLabel htmlFor={fieldId(ID, "address")}>
            {t("Delivery address")}
          </FieldLabel>
          <Textarea
            id={fieldId(ID, "address")}
            value={values.address}
            onChange={(e) => set("address", e.target.value)}
            rows={2}
            aria-invalid={!!errors.address}
            disabled={pending}
          />
          {errors.address && <FieldError>{errors.address}</FieldError>}
        </Field>
        {show("notes") && textarea("notes", t("Notes"))}
        {show("shipmentNotes") &&
          textarea("shipmentNotes", t("Shipment notes"))}
      </FieldGroup>
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
          {t("Save changes")}
        </Button>
      </DialogFooter>
    </form>
  );
}
