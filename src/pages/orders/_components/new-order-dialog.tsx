import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { AlertTriangle, Check, History, Plus, Trash2 } from "lucide-react";
import { MoneyInput, QuantityInput } from "@/components/number-input.tsx";
import {
  ProductPicker,
  sellableKey,
  useSellableItems,
} from "@/components/product-picker.tsx";
import type { SellableItem } from "@/components/product-picker.tsx";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
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
import { Input } from "@/components/ui/input.tsx";
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
import { useFieldVisibility } from "@/hooks/use-field-visibility.ts";
import { api, getErrorMessage, isApiError, useMutation, useQuery } from "@/lib/api.ts";
import { RefusalWarning } from "@/components/refusal-warning.tsx";
import { isEgyptianMobile } from "@shared/phone.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import {
  parseNumber,
  zMoneyField,
  zPhoneField,
  zQuantityField,
} from "@/lib/forms.ts";
import { tk } from "@/lib/i18n.ts";
import { cn } from "@/lib/utils.ts";
import {
  DAY_RE,
  GENDERS,
  GENDER_LABELS,
  MONEY_EPSILON,
  SALES_CHANNELS,
  SALES_CHANNEL_LABELS,
  round2,
} from "@shared/constants.ts";
import type { Gender, SalesChannel } from "@shared/constants.ts";
import { FormAlert, FormDialog } from "./form-dialog.tsx";
import type { FormDialogControl } from "./form-dialog.tsx";
import {
  fieldId,
  focusFirstError,
  issuesToErrors,
} from "../_lib/form-errors.ts";
import type { FieldErrors } from "../_lib/form-errors.ts";
import {
  clearDraft,
  hasContent,
  loadDraft,
  saveDraft,
} from "../_lib/order-draft.ts";
import type { OrderDraft } from "../_lib/order-draft.ts";

const ID = "new-order";

/** Same colors as the size on the packing screen: light blue boys, pink girls. */
// The dark: classes matter: the outline button's dark-mode background would otherwise hide the choice
const GENDER_BUTTON_ON: Record<Gender, string> = {
  boys: "border-sky-500 bg-sky-500 text-white hover:bg-sky-600 hover:text-white dark:border-sky-500 dark:bg-sky-500 dark:hover:bg-sky-600",
  girls:
    "border-pink-500 bg-pink-500 text-white hover:bg-pink-600 hover:text-white dark:border-pink-500 dark:bg-pink-500 dark:hover:bg-pink-600",
};

type Line = {
  id: number;
  key: string;
  productId: string;
  variantId?: string;
  quantity: string;
  /** Boys or girls, for products that need it */
  gender?: Gender;
};

let nextLineId = 1;
const emptyLine = (): Line => ({
  id: nextLineId++,
  key: "",
  productId: "",
  quantity: "1",
});

const lineSchema = z
  .object({
    key: z.string().min(1, tk("Choose a product")),
    quantity: zQuantityField(),
    needsGender: z.boolean(),
    gender: z.enum(GENDERS).optional(),
  })
  .refine((l) => !l.needsGender || l.gender, {
    message: tk("Choose boys or girls"),
    path: ["gender"],
  });

function makeSchema(today: string, customTotal: boolean) {
  return z.object({
    orderDate: z
      .string()
      .regex(DAY_RE, tk("Enter the order date"))
      .refine((d) => d <= today, tk("The order date can't be in the future")),
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
    lineItems: z
      .array(lineSchema)
      .min(1, tk("Add at least one product"))
      .max(200, tk("An order can have at most 200 lines")),
    total: customTotal
      ? zMoneyField({ required: tk("Enter the order total") })
      : z.unknown(),
    notes: z.string().trim().max(2000, tk("Use at most 2,000 characters")),
    shipmentNotes: z
      .string()
      .trim()
      .max(2000, tk("Use at most 2,000 characters")),
    shipOn: z
      .string()
      .refine((d) => d === "" || DAY_RE.test(d), tk("Enter a valid ship date"))
      .refine((d) => d === "" || d > today, tk("The ship date must be after today")),
  });
}

/** A cancelled order copied into the form, to record it again with fixes. */
export type RerecordSource = {
  orderId: string;
  displayOrderNumber: string;
  customer: string;
  customerPhone: string | null | undefined;
  customerPhone2: string | null | undefined;
  address: string | null | undefined;
  channel: string | null | undefined;
  shippingFee: number | null | undefined;
  shipmentNumber: string;
  notes: string | null | undefined;
  shipmentNotes: string | null | undefined;
  total: number;
  hasManualTotal: boolean;
  lines: {
    productId: string;
    variantId: string | null | undefined;
    quantity: number;
    gender: Gender | null | undefined;
  }[];
};

export default function NewOrderDialog({
  open,
  onOpenChange,
  rerecord,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rerecord?: RerecordSource;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-3xl"
    >
      {(control) => <NewOrderForm {...control} rerecord={rerecord} />}
    </FormDialog>
  );
}

const emptyValues = (today: string): OrderDraft["values"] => ({
  orderDate: today,
  customer: "",
  customerPhone: "",
  customerPhone2: "",
  address: "",
  channel: "",
  shippingFee: "",
  shipmentNumber: "",
  notes: "",
  shipmentNotes: "",
  shipOn: "",
});

function NewOrderForm({
  pending,
  setPending,
  close,
  requestClose,
  setCloseGuard,
  rerecord,
}: FormDialogControl & { rerecord?: RerecordSource }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const format = useFormat();
  const today = format.today();
  const { isFieldVisible } = useFieldVisibility();
  const show = (field: string) => isFieldVisible("orders", field);
  const items = useSellableItems();
  const createOrder = useMutation(api.orders.create);
  // Drafts are for new orders only; a re-record starts from the cancelled order
  const userId = useCurrentUser().user?._id;
  const draftUser = rerecord ? undefined : userId;
  const [restored] = useState(() =>
    draftUser ? loadDraft(draftUser) : undefined,
  );
  const [restoredAt, setRestoredAt] = useState(restored?.savedAt);

  const [values, setValues] = useState<OrderDraft["values"]>(() =>
    restored
      ? restored.values
      : rerecord
        ? {
            orderDate: today,
            customer: rerecord.customer ?? "",
            customerPhone: rerecord.customerPhone ?? "",
            customerPhone2: rerecord.customerPhone2 ?? "",
            address: rerecord.address ?? "",
            channel: rerecord.channel ?? "",
            shippingFee:
              rerecord.shippingFee === null ||
              rerecord.shippingFee === undefined
                ? ""
                : String(rerecord.shippingFee),
            shipmentNumber: rerecord.shipmentNumber ?? "",
            notes: rerecord.notes ?? "",
            shipmentNotes: rerecord.shipmentNotes ?? "",
            shipOn: "",
          }
        : emptyValues(today),
  );
  // Earlier refusals by these numbers (checked once a number looks complete)
  const checkPhones = [values.customerPhone, values.customerPhone2].filter((p) => isEgyptianMobile(p ?? "")) as string[];
  const phoneCheck = useQuery(
    api.orders.phoneHistory,
    checkPhones.length ? { phones: checkPhones } : "skip",
    { refetchInterval: false },
  );
  const [lines, setLines] = useState<Line[]>(() =>
    restored?.lines.length
      ? restored.lines.map((l) => ({ ...l, id: nextLineId++ }))
      : rerecord?.lines.length
        ? rerecord.lines.map((l) => ({
            id: nextLineId++,
            key: sellableKey(l.productId, l.variantId),
            productId: l.productId,
            variantId: l.variantId ?? undefined,
            quantity: String(l.quantity),
            gender: l.gender ?? undefined,
          }))
        : [emptyLine()],
  );
  // Off by default: the date only shows when the customer asked to delay shipping
  const [delayOn, setDelayOn] = useState(() => !!values.shipOn);
  const [customTotal, setCustomTotal] = useState(
    restored ? restored.customTotal : (rerecord?.hasManualTotal ?? false),
  );
  const [total, setTotal] = useState(
    restored
      ? restored.total
      : rerecord?.hasManualTotal
        ? String(rerecord.total)
        : "",
  );
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const snapshot = (): OrderDraft => ({
    savedAt: Date.now(),
    values,
    lines: lines.map(({ key, productId, variantId, quantity, gender }) => ({
      key,
      productId,
      variantId,
      quantity,
      gender,
    })),
    customTotal,
    total,
  });
  const dirty = hasContent({ values, lines, total }, today);

  // Save as they type, once there's a customer name
  useEffect(() => {
    if (!draftUser || pending) return;
    if (values.customer.trim()) saveDraft(draftUser, snapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftUser, values, lines, customTotal, total]);

  // Closing a form with something in it asks first
  useEffect(() => {
    setCloseGuard(
      dirty && !pending
        ? () => {
            setConfirmClose(true);
            return false;
          }
        : undefined,
    );
    return () => setCloseGuard(undefined);
  }, [dirty, pending, setCloseGuard]);

  const discard = () => {
    if (draftUser) clearDraft(draftUser);
    setValues(emptyValues(today));
    setLines([emptyLine()]);
    setDelayOn(false);
    setCustomTotal(false);
    setTotal("");
    setErrors({});
    setSubmitted(false);
    setFormError(undefined);
    setRestoredAt(undefined);
  };
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string>();

  const itemsByKey = useMemo(
    () => new Map((items ?? []).map((i) => [i.key, i])),
    [items],
  );
  const needsGender = (line: Line) =>
    itemsByKey.get(line.key)?.needsGender ?? false;
  // Prices are fixed by the catalog; only the order total can be changed
  const priceOf = (line: Line) => itemsByKey.get(line.key)?.unitPrice ?? 0;
  const subtotal = round2(
    lines.reduce(
      (sum, l) => sum + (parseNumber(l.quantity) ?? 0) * priceOf(l),
      0,
    ),
  );
  const finalTotal = customTotal ? parseNumber(total) : subtotal;
  const difference =
    finalTotal === undefined ? 0 : round2(subtotal - finalTotal);
  const shippingFee = parseNumber(values.shippingFee);
  // What the courier collects on delivery: our total plus their shipping fee
  const toCollect =
    finalTotal === undefined
      ? undefined
      : round2(finalTotal + (shippingFee ?? 0));

  const validate = (
    nextValues = values,
    nextLines = lines,
    nextCustom = customTotal,
    nextTotal = total,
    nextDelay = delayOn,
  ) => {
    const result = makeSchema(today, nextCustom).safeParse({
      ...nextValues,
      lineItems: nextLines.map((l) => ({
        ...l,
        needsGender: needsGender(l),
      })),
      total: nextTotal,
    });
    const errors: Record<string, string> = result.success ? {} : issuesToErrors(result.error);
    if (nextDelay && !nextValues.shipOn && !errors.shipOn) errors.shipOn = t("Choose the day to ship, or switch the delay off");
    // The same item twice only for the other gender (one boys line, one girls line)
    const seenLine = new Map<string, number>();
    nextLines.forEach((l, i) => {
      if (!l.key) return;
      const k = `${l.key}|${needsGender(l) ? (l.gender ?? "") : ""}`;
      if (needsGender(l) && !l.gender) return;
      if (seenLine.has(k)) {
        errors[`lineItems.${i}.${needsGender(l) ? "gender" : "key"}`] = needsGender(l)
          ? t("Already added for {{gender}} on line {{n}}: change that line's quantity instead", {
              gender: t(GENDER_LABELS[l.gender!]),
              n: seenLine.get(k)! + 1,
            })
          : t("Already added on line {{n}}: change that line's quantity instead", { n: seenLine.get(k)! + 1 });
      } else seenLine.set(k, i);
    });
    return result.success && !Object.keys(errors).length
      ? { data: result.data, errors: {} }
      : { data: undefined, errors };
  };

  // After the first submit, errors update as the user fixes them
  const revalidate = (...args: Parameters<typeof validate>) => {
    if (submitted) setErrors(validate(...args).errors);
  };

  const setValue = (key: keyof typeof values, value: string) => {
    const next = { ...values, [key]: value };
    setValues(next);
    revalidate(next);
  };

  const updateLines = (next: Line[]) => {
    setLines(next);
    revalidate(values, next);
  };

  /** The gender another line already uses for this item, if any. */
  const takenGender = (lineId: number, key: string): Gender | undefined =>
    lines.find((l) => l.id !== lineId && l.key === key && l.gender)?.gender;

  const pick = (lineId: number, item: SellableItem) => {
    // Same item already on another line: this line gets the other gender
    const taken = item.needsGender ? takenGender(lineId, item.key) : undefined;
    const other: Gender | undefined = taken ? (taken === "boys" ? "girls" : "boys") : undefined;
    updateLines(
      lines.map((l) =>
        l.id === lineId
          ? {
              ...l,
              key: item.key,
              productId: item.productId,
              variantId: item.variantId,
              // Keep the choice when switching to another item that needs it
              gender: item.needsGender ? (other ?? (l.gender === taken ? undefined : l.gender)) : undefined,
            }
          : l,
      ),
    );
  };

  const setGender = (lineId: number, gender: Gender) =>
    updateLines(lines.map((l) => (l.id === lineId ? { ...l, gender } : l)));

  const setQuantity = (lineId: number, quantity: string) =>
    updateLines(lines.map((l) => (l.id === lineId ? { ...l, quantity } : l)));

  /** Switching the delay off clears the date: the order ships as usual. */
  const toggleDelay = (on: boolean) => {
    setDelayOn(on);
    const next = on ? values : { ...values, shipOn: "" };
    setValues(next);
    if (submitted) setErrors(validate(next, lines, customTotal, total, on).errors);
  };

  const toggleCustomTotal = (on: boolean) => {
    setCustomTotal(on);
    const nextTotal = on && total === "" ? String(subtotal) : total;
    setTotal(nextTotal);
    revalidate(values, lines, on, nextTotal);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError(undefined);
    const { data, errors: nextErrors } = validate();
    setErrors(nextErrors);
    if (!data) {
      focusFirstError(ID, nextErrors);
      return;
    }
    setPending(true);
    try {
      const orderId = await createOrder({
        orderDate: data.orderDate,
        customer: data.customer,
        customerPhone: data.customerPhone,
        customerPhone2: data.customerPhone2 || undefined,
        address: data.address,
        channel: data.channel,
        shippingFee: round2(data.shippingFee as number),
        shipmentNumber: data.shipmentNumber,
        total: round2(customTotal ? (data.total as number) : subtotal),
        notes: show("notes") ? data.notes || undefined : undefined,
        shipmentNotes: show("shipmentNotes")
          ? data.shipmentNotes || undefined
          : undefined,
        lineItems: lines.map((l, i) => ({
          productId: l.productId,
          variantId: l.variantId,
          quantity: data.lineItems[i].quantity,
          gender: needsGender(l) ? l.gender : undefined,
        })),
        shipOn: delayOn && data.shipOn ? data.shipOn : undefined,
        rerecordFromId: rerecord?.orderId,
      });
      if (draftUser) clearDraft(draftUser);
      toast.success(t("Order created"));
      close();
      // The order page opens the WhatsApp post straight away
      navigate(`/orders/${orderId}?post=1`);
    } catch (err) {
      if (isApiError(err, "CONFLICT")) {
        setErrors((prev) => ({ ...prev, shipmentNumber: err.message }));
        document.getElementById(fieldId(ID, "shipmentNumber"))?.focus();
      } else {
        setFormError(getErrorMessage(err));
      }
    } finally {
      setPending(false);
    }
  };

  const textField = (
    key: keyof typeof values,
    label: string,
    opts: {
      required?: boolean;
      placeholder?: string;
      type?: string;
      autoComplete?: string;
      min?: string;
      max?: string;
      hint?: string;
    } = {},
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
        onChange={(e) => setValue(key, e.target.value)}
        placeholder={opts.placeholder}
        autoComplete={opts.autoComplete ?? "off"}
        aria-invalid={!!errors[key]}
        min={opts.min}
        max={opts.max ?? (opts.type === "date" ? today : undefined)}
        disabled={pending}
      />
      {errors[key] ? <FieldError>{errors[key]}</FieldError> : opts.hint && <FieldDescription>{opts.hint}</FieldDescription>}
    </Field>
  );

  /**
   * Items a line can't pick: already on another line, unless it needs boys or
   * girls and only one gender is used so far (then it's offered for the other).
   */
  const excludedFor = (line: Line) => {
    const others = lines.filter((l) => l.id !== line.id && l.key);
    return [...new Set(others.map((l) => l.key))].filter((key) => {
      if (!itemsByKey.get(key)?.needsGender) return true;
      return others.filter((l) => l.key === key).length >= 2;
    });
  };
  /** Units of an item across all lines (boys and girls share the stock). */
  const qtyOfItem = (key: string) =>
    lines.filter((l) => l.key === key).reduce((s, l) => s + (parseNumber(l.quantity) ?? 0), 0);

  return (
    <form onSubmit={submit} className="grid gap-6" noValidate>
      <DialogHeader>
        <DialogTitle>
          {rerecord
            ? t("Re-record {{order}}", { order: rerecord.displayOrderNumber })
            : t("New order")}
        </DialogTitle>
        <DialogDescription>
          {rerecord
            ? t(
                "A new order with the same shipment number. Fix what was wrong; the cancelled order stays as it is and the two are linked.",
              )
            : t(
                "Stock is held for the order now and deducted when it ships. If any item is short, the whole order waits On hold.",
              )}
        </DialogDescription>
      </DialogHeader>

      {restoredAt !== undefined && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-900 dark:text-sky-200">
          <span className="flex items-center gap-1.5">
            <History className="size-4 shrink-0" aria-hidden />
            {t("Draft restored, saved {{time}}", {
              time: format.formatDateTime(restoredAt),
            })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => setRestoredAt(undefined)}
          >
            {t("OK")}
          </Button>
        </div>
      )}

      <FieldSet>
        <FieldLegend>{t("Customer & shipment")}</FieldLegend>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          {textField("customer", t("Customer name"), {
            required: true,
            autoComplete: "off",
          })}
          {textField("customerPhone", t("Phone"), {
            type: "tel",
            required: true,
            placeholder: "01xxxxxxxxx",
          })}
          {textField("customerPhone2", t("Second phone"), {
            type: "tel",
            placeholder: "01xxxxxxxxx",
          })}
          <RefusalWarning history={phoneCheck} className="sm:col-span-2" />
          {textField("shipmentNumber", t("Shipment number"), {
            required: true,
            placeholder: t("e.g. AWB or tracking number"),
          })}
          <Field data-invalid={!!errors.channel}>
            <FieldLabel htmlFor={fieldId(ID, "channel")}>
              {t("Ordered via")}
            </FieldLabel>
            <Select
              value={values.channel}
              onValueChange={(v) => setValue("channel", v as SalesChannel)}
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
          <Field data-invalid={!!errors.address} className="sm:col-span-2">
            <FieldLabel htmlFor={fieldId(ID, "address")}>
              {t("Delivery address")}
            </FieldLabel>
            <Textarea
              id={fieldId(ID, "address")}
              value={values.address}
              onChange={(e) => setValue("address", e.target.value)}
              placeholder={t("Area, street, building, landmark…")}
              rows={2}
              aria-invalid={!!errors.address}
              disabled={pending}
            />
            {errors.address && <FieldError>{errors.address}</FieldError>}
          </Field>
          {textField("orderDate", t("Order date"), {
            required: true,
            type: "date",
          })}
          <Field orientation="horizontal">
            <Switch
              id={fieldId(ID, "delay")}
              checked={delayOn}
              onCheckedChange={toggleDelay}
              disabled={pending}
            />
            <div className="grid gap-1">
              <FieldLabel htmlFor={fieldId(ID, "delay")}>{t("Customer asked to delay shipping")}</FieldLabel>
              <FieldDescription>
                {delayOn
                  ? t("Packed like any other order, with a big Delayed label and this date. Switch off to ship as usual.")
                  : t("Leave off for a normal order.")}
              </FieldDescription>
            </div>
          </Field>
          {delayOn &&
            textField("shipOn", t("Ship on"), {
              type: "date",
              required: true,
              min: format.addDays(today, 1),
              max: "9999-12-31",
            })}
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>{t("Items")}</FieldLegend>
        <div className="grid gap-3">
          {lines.map((line, index) => {
            const item = itemsByKey.get(line.key);
            const qty = parseNumber(line.quantity) ?? 0;
            const short = item && qtyOfItem(line.key) > item.available;
            const taken = item?.needsGender ? takenGender(line.id, line.key) : undefined;
            const err = (field: string) =>
              errors[`lineItems.${index}.${field}`];
            return (
              <div key={line.id} className="grid gap-3 rounded-lg border p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_9rem_auto] sm:items-start">
                  <Field data-invalid={!!err("key")}>
                    <FieldLabel
                      htmlFor={fieldId(ID, `lineItems.${index}.key`)}
                      className="sm:sr-only"
                    >
                      {t("Product")}
                    </FieldLabel>
                    <ProductPicker
                      id={fieldId(ID, `lineItems.${index}.key`)}
                      value={line.key || undefined}
                      onChange={(picked) => pick(line.id, picked)}
                      exclude={excludedFor(line)}
                      warnOutOfStock
                      invalid={!!err("key")}
                      disabled={pending}
                    />
                    {err("key") && <FieldError>{err("key")}</FieldError>}
                  </Field>
                  <Field data-invalid={!!err("quantity")}>
                    <FieldLabel
                      htmlFor={fieldId(ID, `lineItems.${index}.quantity`)}
                      className="sm:sr-only"
                    >
                      {t("Quantity")}
                    </FieldLabel>
                    <QuantityInput
                      id={fieldId(ID, `lineItems.${index}.quantity`)}
                      value={line.quantity}
                      onChange={(v) => setQuantity(line.id, v)}
                      aria-invalid={!!err("quantity")}
                      aria-label={t("Quantity")}
                      disabled={pending}
                    />
                    {err("quantity") && (
                      <FieldError>{err("quantity")}</FieldError>
                    )}
                  </Field>
                  <div className="grid gap-1 sm:h-9 sm:content-center sm:text-end">
                    <span className="text-xs text-muted-foreground sm:sr-only">
                      {t("Unit price")}
                    </span>
                    <span
                      className="text-sm tabular-nums"
                      aria-label={t("Unit price")}
                    >
                      {item ? format.formatMoney(item.unitPrice) : "—"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="justify-self-end text-muted-foreground"
                    onClick={() =>
                      updateLines(lines.filter((l) => l.id !== line.id))
                    }
                    disabled={pending || lines.length === 1}
                    aria-label={
                      item
                        ? t("Remove {{item}}", { item: item.label })
                        : t("Remove line")
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
                {item?.needsGender && (
                  <Field data-invalid={!!err("gender")}>
                    <div
                      role="radiogroup"
                      id={fieldId(ID, `lineItems.${index}.gender`)}
                      aria-label={t("Boys or girls")}
                      aria-invalid={!!err("gender")}
                      tabIndex={-1}
                      className="grid grid-cols-2 gap-2 sm:max-w-xs"
                    >
                      {GENDERS.map((g) => {
                        const on = line.gender === g;
                        // The other line already has this gender for the same item
                        const usedElsewhere = taken === g && !on;
                        return (
                          <Button
                            key={g}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            variant="outline"
                            disabled={pending || usedElsewhere}
                            title={usedElsewhere ? t("Already on another line: change that line's quantity") : undefined}
                            onClick={() => setGender(line.id, g)}
                            className={cn(
                              on && GENDER_BUTTON_ON[g],
                              !!err("gender") && !on && "border-destructive",
                            )}
                          >
                            {on && <Check aria-hidden />}
                            {t(GENDER_LABELS[g])}
                          </Button>
                        );
                      })}
                    </div>
                    {err("gender") && <FieldError>{err("gender")}</FieldError>}
                  </Field>
                )}
                {(item || short) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    {short ? (
                      <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                        {t(
                          "Only {{available}} {{uom}} available ({{reserved}} held for other orders). This order will be recorded On hold until stock arrives.",
                          {
                            available: format.formatNumber(
                              Math.max(0, item.available),
                            ),
                            reserved: format.formatNumber(item.reserved),
                            uom: item.uom,
                          },
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {t("{{available}} {{uom}} available", {
                          available: format.formatNumber(
                            Math.max(0, item?.available ?? 0),
                          ),
                          uom: item?.uom ?? "",
                        })}
                      </span>
                    )}
                    <span className="font-medium tabular-nums">
                      {format.formatMoney(round2(qty * priceOf(line)))}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {errors.lineItems && <FieldError>{errors.lineItems}</FieldError>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => updateLines([...lines, emptyLine()])}
            disabled={pending || lines.length >= 200}
          >
            <Plus />
            {t("Add product")}
          </Button>
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend>{t("Pricing")}</FieldLegend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-4">
            <Field orientation="horizontal">
              <Switch
                id={fieldId(ID, "customTotal")}
                checked={customTotal}
                onCheckedChange={toggleCustomTotal}
                disabled={pending}
              />
              <div className="grid gap-1">
                <FieldLabel htmlFor={fieldId(ID, "customTotal")}>
                  {t("Custom total")}
                </FieldLabel>
                <FieldDescription>
                  {t(
                    "Item prices come from the product catalog. Set a different total for bundles or discounts.",
                  )}
                </FieldDescription>
              </div>
            </Field>
            {customTotal && (
              <Field data-invalid={!!errors.total}>
                <FieldLabel htmlFor={fieldId(ID, "total")}>
                  {t("Order total")}
                </FieldLabel>
                <MoneyInput
                  id={fieldId(ID, "total")}
                  value={total}
                  onChange={(v) => {
                    setTotal(v);
                    revalidate(values, lines, customTotal, v);
                  }}
                  aria-invalid={!!errors.total}
                  disabled={pending}
                />
                {errors.total && <FieldError>{errors.total}</FieldError>}
              </Field>
            )}
            <Field data-invalid={!!errors.shippingFee}>
              <FieldLabel htmlFor={fieldId(ID, "shippingFee")}>
                {t("Shipping fee")}
              </FieldLabel>
              <MoneyInput
                id={fieldId(ID, "shippingFee")}
                value={values.shippingFee}
                onChange={(v) => setValue("shippingFee", v)}
                aria-invalid={!!errors.shippingFee}
                disabled={pending}
              />
              {errors.shippingFee ? (
                <FieldError>{errors.shippingFee}</FieldError>
              ) : (
                <FieldDescription>
                  {t(
                    "Paid by the customer to the courier on delivery. Not part of your sales.",
                  )}
                </FieldDescription>
              )}
            </Field>
          </div>
          <dl className="grid content-start gap-2 rounded-lg bg-muted/50 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("Items subtotal")}</dt>
              <dd className="tabular-nums">{format.formatMoney(subtotal)}</dd>
            </div>
            {Math.abs(difference) >= MONEY_EPSILON && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  {difference > 0 ? t("Discount") : t("Surcharge")}
                </dt>
                <dd
                  className={cn(
                    "tabular-nums",
                    difference > 0 && "text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  {difference > 0 ? "−" : "+"}
                  {format.formatMoney(Math.abs(difference))}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
              <dt>{t("Total")}</dt>
              <dd className="tabular-nums">{format.formatMoney(finalTotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("Shipping fee")}</dt>
              <dd className="tabular-nums">
                {format.formatMoney(shippingFee ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
              <dt>{t("To collect on delivery")}</dt>
              <dd className="tabular-nums">{format.formatMoney(toCollect)}</dd>
            </div>
          </dl>
        </div>
      </FieldSet>

      {(show("notes") || show("shipmentNotes")) && (
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          {show("notes") && (
            <Field data-invalid={!!errors.notes}>
              <FieldLabel htmlFor={fieldId(ID, "notes")}>
                {t("Notes")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("(optional)")}
                </span>
              </FieldLabel>
              <Textarea
                id={fieldId(ID, "notes")}
                value={values.notes}
                onChange={(e) => setValue("notes", e.target.value)}
                placeholder={t("Anything the team should know")}
                rows={3}
                aria-invalid={!!errors.notes}
                disabled={pending}
              />
              {errors.notes && <FieldError>{errors.notes}</FieldError>}
            </Field>
          )}
          {show("shipmentNotes") && (
            <Field data-invalid={!!errors.shipmentNotes}>
              <FieldLabel htmlFor={fieldId(ID, "shipmentNotes")}>
                {t("Shipment notes")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("(optional)")}
                </span>
              </FieldLabel>
              <Textarea
                id={fieldId(ID, "shipmentNotes")}
                value={values.shipmentNotes}
                onChange={(e) => setValue("shipmentNotes", e.target.value)}
                placeholder={t("Address details, delivery window…")}
                rows={3}
                aria-invalid={!!errors.shipmentNotes}
                disabled={pending}
              />
              {errors.shipmentNotes && (
                <FieldError>{errors.shipmentNotes}</FieldError>
              )}
            </Field>
          )}
        </FieldGroup>
      )}

      <FormAlert message={formError} />
      <DialogFooter className="gap-2">
        {dirty && draftUser && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive sm:me-auto"
            onClick={() => setConfirmDiscard(true)}
            disabled={pending}
          >
            <Trash2 />
            {t("Discard draft")}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={requestClose}
          disabled={pending}
        >
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {t("Create order")}
        </Button>
      </DialogFooter>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Close this order?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {draftUser
                ? t(
                    "Keep it as a draft to finish later on this device, or discard what you entered.",
                  )
                : t("What you entered will be lost.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmClose(false)}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (draftUser) clearDraft(draftUser);
                setConfirmClose(false);
                close();
              }}
            >
              {t("Discard")}
            </Button>
            {draftUser && (
              <Button
                type="button"
                onClick={() => {
                  saveDraft(draftUser, snapshot());
                  setConfirmClose(false);
                  close();
                  toast.success(t("Draft saved"));
                }}
              >
                {t("Keep draft")}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Discard this draft?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Everything you entered is cleared and the form starts fresh.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDiscard(false)}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                discard();
                setConfirmDiscard(false);
                toast.success(t("Draft discarded"));
              }}
            >
              {t("Discard")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
