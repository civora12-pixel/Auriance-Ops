import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { MoneyInput, QuantityInput } from "@/components/number-input.tsx";
import { PhotoPicker } from "@/components/photo.tsx";
import { ShopSectionSelect } from "@/components/shop-section-select.tsx";
import type { ShopSection } from "@shared/constants.ts";
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { parseNumber, zMoneyField, zQuantityField } from "@/lib/forms.ts";
import { tk } from "@/lib/i18n.ts";
import { fieldId, focusFirstError, issueMap } from "./form-utils.ts";

export type EditableProduct = NonNullable<Output<typeof api.products.get>>;

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, tk("Enter a name"))
      .max(200, tk("Use at most 200 characters")),
    unitPrice: zMoneyField({ required: tk("Enter the selling price") }),
    uom: z
      .string()
      .trim()
      .min(1, tk("Enter a unit (each, pcs, kg…)"))
      .max(20, tk("Use at most 20 characters")),
    reorderThreshold: zQuantityField({
      min: 0,
      required: tk("Enter a reorder level (0 to turn alerts off)"),
    }),
    hasVariants: z.boolean(),
    openingQty: z.string(),
    openingCost: z.string(),
    variants: z.array(
      z.object({
        name: z.string().trim().min(1, tk("Enter a name")).max(200),
        openingQty: z.string(),
        openingCost: z.string(),
      }),
    ),
  })
  .superRefine((v, ctx) => {
    if (!v.hasVariants) {
      checkOpening(v, [], ctx);
      return;
    }
    v.variants.forEach((row, i) => checkOpening(row, ["variants", i], ctx));
    if (v.variants.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["variants"],
        message: tk("Add at least one variant, or turn variants off"),
      });
      return;
    }
    const seen = new Set<string>();
    v.variants.forEach((variant, i) => {
      const key = variant.name.toLowerCase();
      if (key && seen.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["variants", i, "name"],
          message: tk("This name is already used above"),
        });
      seen.add(key);
    });
  });

/**
 * Opening stock is optional; when a quantity is entered it must be a whole
 * number and the unit cost is required (stock value depends on it).
 */
function checkOpening(
  row: { openingQty: string; openingCost: string },
  path: (string | number)[],
  ctx: z.RefinementCtx,
) {
  const qtyText = row.openingQty.trim();
  if (!qtyText) return;
  const qty = parseNumber(qtyText);
  if (qty === undefined || !Number.isInteger(qty) || qty < 0) {
    ctx.addIssue({
      code: "custom",
      path: [...path, "openingQty"],
      message: tk("Enter a whole number, 0 or more"),
    });
    return;
  }
  if (qty === 0) return;
  const cost = parseNumber(row.openingCost);
  if (row.openingCost.trim() === "" || cost === undefined || cost < 0) {
    ctx.addIssue({
      code: "custom",
      path: [...path, "openingCost"],
      message: tk("Enter the unit cost of the opening stock"),
    });
  }
}

/** The opening stock to send, or undefined when none was entered. */
function openingOf(row: { openingQty: string; openingCost: string }) {
  const quantity = parseNumber(row.openingQty) ?? 0;
  if (quantity <= 0) return undefined;
  return { quantity, unitCost: parseNumber(row.openingCost) ?? 0 };
}

type VariantRow = {
  id: number;
  name: string;
  openingQty: string;
  openingCost: string;
};
let nextVariantId = 1;

export default function ProductFormDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this product; create a new one when omitted */
  product?: EditableProduct;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {open && (
          <ProductForm
            product={product}
            pending={pending}
            setPending={setPending}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({
  product,
  pending,
  setPending,
  onDone,
}: {
  product?: EditableProduct;
  pending: boolean;
  setPending: (p: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!product;
  const navigate = useNavigate();
  const prefix = `${useId()}-`;
  const createProduct = useMutation(api.products.create);
  const updateProduct = useMutation(api.products.update);

  const [values, setValues] = useState({
    name: product?.name ?? "",
    unitPrice: product ? String(product.unitPrice) : "",
    uom: product?.uom ?? t("each"),
    reorderThreshold: product ? String(product.reorderThreshold) : "10",
    hasVariants: false,
    needsGender: product?.needsGender ?? true,
    openingQty: "",
    openingCost: "",
  });
  const [shopSection, setShopSection] = useState<ShopSection | null>(product?.shopSection ?? null);
  const [maxPerOrder, setMaxPerOrder] = useState(product?.maxPerOrder ? String(product.maxPerOrder) : "");
  const [imageUrl, setImageUrl] = useState<string | null>(
    product?.imageUrl ?? null,
  );
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof values>(
    key: K,
    value: (typeof values)[K],
  ) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors(({ [key]: _, ...rest }) => rest);
  };
  const setVariant = (id: number, patch: Partial<VariantRow>) =>
    setVariants((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  const addVariant = () => {
    setVariants((rows) => [
      ...rows,
      { id: nextVariantId++, name: "", openingQty: "", openingCost: "" },
    ]);
    setErrors(({ variants: _, ...rest }) => rest);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      ...values,
      variants: values.hasVariants
        ? variants.map(({ name, openingQty, openingCost }) => ({
            name,
            openingQty,
            openingCost,
          }))
        : [],
    });
    if (!parsed.success) {
      const errs = issueMap(parsed.error);
      setErrors(errs);
      focusFirstError(errs, prefix);
      return;
    }
    const v = parsed.data;
    const fields = {
      name: v.name,
      unitPrice: v.unitPrice,
      uom: v.uom,
      reorderThreshold: v.reorderThreshold,
      imageUrl: imageUrl ?? undefined,
      needsGender: values.needsGender,
      shopSection,
      maxPerOrder: Number.parseInt(maxPerOrder, 10) > 0 ? Math.min(99, Number.parseInt(maxPerOrder, 10)) : null,
    };
    setPending(true);
    try {
      if (product) {
        await updateProduct({ productId: product._id, ...fields });
        toast.success(t("Product updated"));
      } else {
        const id = await createProduct({
          ...fields,
          opening: v.hasVariants ? undefined : openingOf(v),
          variants: v.hasVariants
            ? v.variants.map((row) => ({
                name: row.name,
                opening: openingOf(row),
              }))
            : undefined,
        });
        toast.success(t("{{name}} created", { name: v.name }), {
          action: {
            label: t("Open"),
            onClick: () => navigate(`/products/${id}`),
          },
        });
      }
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const err = (key: string) => (errors[key] ? t(errors[key]) : undefined);
  const invalid = (key: string) => (errors[key] ? true : undefined);

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {isEdit
            ? t("Edit {{name}}", { name: product.name })
            : t("New product")}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? t("Stock and variants are managed on the product page.")
            : t(
                "Enter the stock you have now with its unit cost, or leave it empty and restock later.",
              )}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={fieldId(prefix, "sku")}>{t("SKU")}</FieldLabel>
            <Input
              id={fieldId(prefix, "sku")}
              value={product?.sku ?? t("Assigned automatically")}
              disabled
              readOnly
            />
            <FieldDescription>
              {isEdit
                ? t("SKUs can't be changed.")
                : t(
                    "The next free number, like CIV-0001. Variants get -01, -02…",
                  )}
            </FieldDescription>
          </Field>
          <Field data-invalid={invalid("name")}>
            <FieldLabel htmlFor={fieldId(prefix, "name")}>
              {t("Name")}
            </FieldLabel>
            <Input
              id={fieldId(prefix, "name")}
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              disabled={pending}
              autoFocus
              maxLength={200}
              aria-invalid={invalid("name")}
            />
            {err("name") && <FieldError>{err("name")}</FieldError>}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field data-invalid={invalid("unitPrice")}>
            <FieldLabel htmlFor={fieldId(prefix, "unitPrice")}>
              {t("Selling price")}
            </FieldLabel>
            <MoneyInput
              id={fieldId(prefix, "unitPrice")}
              value={values.unitPrice}
              onChange={(v) => set("unitPrice", v)}
              disabled={pending}
              aria-invalid={invalid("unitPrice")}
            />
            {err("unitPrice") && <FieldError>{err("unitPrice")}</FieldError>}
          </Field>
          <Field data-invalid={invalid("uom")}>
            <FieldLabel htmlFor={fieldId(prefix, "uom")}>
              {t("Unit")}
            </FieldLabel>
            <Input
              id={fieldId(prefix, "uom")}
              value={values.uom}
              onChange={(e) => set("uom", e.target.value)}
              disabled={pending}
              maxLength={20}
              placeholder={t("each")}
              aria-invalid={invalid("uom")}
            />
            {err("uom") && <FieldError>{err("uom")}</FieldError>}
          </Field>
          <Field data-invalid={invalid("reorderThreshold")}>
            <FieldLabel htmlFor={fieldId(prefix, "reorderThreshold")}>
              {t("Reorder at")}
            </FieldLabel>
            <QuantityInput
              id={fieldId(prefix, "reorderThreshold")}
              value={values.reorderThreshold}
              onChange={(v) => set("reorderThreshold", v)}
              disabled={pending}
              aria-invalid={invalid("reorderThreshold")}
            />
            {err("reorderThreshold") && (
              <FieldError>{err("reorderThreshold")}</FieldError>
            )}
          </Field>
        </div>
        {!err("reorderThreshold") && (
          <p className="-mt-2 text-xs text-muted-foreground">
            {t(
              "You'll get a low-stock alert when stock drops below the reorder level.",
            )}
          </p>
        )}

        <Field>
          <FieldLabel htmlFor={fieldId(prefix, "photo")}>
            {t("Photo (optional)")}
          </FieldLabel>
          <PhotoPicker
            id={fieldId(prefix, "photo")}
            value={imageUrl}
            onChange={setImageUrl}
            label={values.name || t("Product photo")}
            disabled={pending}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`${prefix}shopSection`}>{t("Shop section")}</FieldLabel>
          <ShopSectionSelect
            id={`${prefix}shopSection`}
            value={shopSection}
            onChange={setShopSection}
            disabled={pending}
          />
          <FieldDescription>
            {t("Where customers find it on the website. Products not in the shop stay hidden there.")}
          </FieldDescription>
        </Field>

        {shopSection && (
          <Field>
            <FieldLabel htmlFor={`${prefix}maxPerOrder`}>{t("Most per website order (optional)")}</FieldLabel>
            <QuantityInput
              id={`${prefix}maxPerOrder`}
              value={maxPerOrder}
              onChange={setMaxPerOrder}
              disabled={pending}
              className="max-w-32"
            />
            <FieldDescription>
              {t("For limited stock: a customer can't put more than this in one order, all sizes and colors together. Leave empty for no limit.")}
            </FieldDescription>
          </Field>
        )}

        <Field orientation="horizontal" className="rounded-md border p-3">
          <Switch
            id={`${prefix}needsGender`}
            checked={values.needsGender}
            disabled={pending}
            onCheckedChange={(checked) => set("needsGender", checked)}
          />
          <div className="grid gap-1">
            <FieldLabel htmlFor={`${prefix}needsGender`}>
              {t("Needs boys or girls on orders")}
            </FieldLabel>
            <FieldDescription>
              {t(
                "Orders must say boys or girls for this product, and the size shows in blue or pink when packing. Turn off for items like diapers or heaters.",
              )}
            </FieldDescription>
          </div>
        </Field>

        {!isEdit && !values.hasVariants && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={invalid("openingQty")}>
              <FieldLabel htmlFor={fieldId(prefix, "openingQty")}>
                {t("Opening quantity (optional)")}
              </FieldLabel>
              <QuantityInput
                id={fieldId(prefix, "openingQty")}
                value={values.openingQty}
                onChange={(v) => set("openingQty", v)}
                disabled={pending}
                aria-invalid={invalid("openingQty")}
              />
              {err("openingQty") && (
                <FieldError>{err("openingQty")}</FieldError>
              )}
            </Field>
            <Field data-invalid={invalid("openingCost")}>
              <FieldLabel htmlFor={fieldId(prefix, "openingCost")}>
                {t("Unit cost")}
              </FieldLabel>
              <MoneyInput
                id={fieldId(prefix, "openingCost")}
                value={values.openingCost}
                onChange={(v) => set("openingCost", v)}
                disabled={pending || !values.openingQty.trim()}
                aria-invalid={invalid("openingCost")}
              />
              {err("openingCost") ? (
                <FieldError>{err("openingCost")}</FieldError>
              ) : (
                <FieldDescription>
                  {t("Required when you enter a quantity.")}
                </FieldDescription>
              )}
            </Field>
          </div>
        )}

        {!isEdit && (
          <div className="grid gap-3 rounded-md border p-3">
            <Field orientation="horizontal">
              <Switch
                id={`${prefix}hasVariants`}
                checked={values.hasVariants}
                disabled={pending}
                onCheckedChange={(checked) => {
                  set("hasVariants", checked);
                  if (checked && variants.length === 0) addVariant();
                }}
              />
              <FieldLabel
                htmlFor={`${prefix}hasVariants`}
                className="font-normal"
              >
                {t("This product comes in variants (size, color…)")}
              </FieldLabel>
            </Field>
            {values.hasVariants && (
              <div className="grid gap-2">
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Name, then the opening quantity and its unit cost. Leave the quantity empty to start at zero.",
                  )}
                </p>
                {variants.map((row, i) => (
                  <div key={row.id} className="flex items-start gap-2">
                    <Field
                      data-invalid={invalid(`variants.${i}.name`)}
                      className="flex-1"
                    >
                      <Input
                        id={fieldId(prefix, `variants.${i}.name`)}
                        aria-label={t("Variant {{number}} name", {
                          number: i + 1,
                        })}
                        placeholder={t("Name (e.g. Small)")}
                        value={row.name}
                        onChange={(e) =>
                          setVariant(row.id, { name: e.target.value })
                        }
                        disabled={pending}
                        aria-invalid={invalid(`variants.${i}.name`)}
                      />
                      {err(`variants.${i}.name`) && (
                        <FieldError>{err(`variants.${i}.name`)}</FieldError>
                      )}
                    </Field>
                    <Field
                      data-invalid={invalid(`variants.${i}.openingQty`)}
                      className="w-24"
                    >
                      <QuantityInput
                        id={fieldId(prefix, `variants.${i}.openingQty`)}
                        aria-label={t("Variant {{number}} opening quantity", {
                          number: i + 1,
                        })}
                        placeholder={t("Qty")}
                        value={row.openingQty}
                        onChange={(v) => setVariant(row.id, { openingQty: v })}
                        disabled={pending}
                        aria-invalid={invalid(`variants.${i}.openingQty`)}
                      />
                      {err(`variants.${i}.openingQty`) && (
                        <FieldError>
                          {err(`variants.${i}.openingQty`)}
                        </FieldError>
                      )}
                    </Field>
                    <Field
                      data-invalid={invalid(`variants.${i}.openingCost`)}
                      className="w-32"
                    >
                      <MoneyInput
                        id={fieldId(prefix, `variants.${i}.openingCost`)}
                        aria-label={t("Variant {{number}} unit cost", {
                          number: i + 1,
                        })}
                        placeholder={t("Unit cost")}
                        value={row.openingCost}
                        onChange={(v) => setVariant(row.id, { openingCost: v })}
                        disabled={pending || !row.openingQty.trim()}
                        aria-invalid={invalid(`variants.${i}.openingCost`)}
                      />
                      {err(`variants.${i}.openingCost`) && (
                        <FieldError>
                          {err(`variants.${i}.openingCost`)}
                        </FieldError>
                      )}
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("Remove variant {{number}}", {
                        number: i + 1,
                      })}
                      disabled={pending}
                      onClick={() =>
                        setVariants((rows) =>
                          rows.filter((r) => r.id !== row.id),
                        )
                      }
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                {err("variants") && (
                  <FieldError id={fieldId(prefix, "variants")}>
                    {err("variants")}
                  </FieldError>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={addVariant}
                  disabled={pending}
                >
                  <Plus />
                  {t("Add variant")}
                </Button>
              </div>
            )}
          </div>
        )}
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
          {isEdit ? t("Save changes") : t("Create product")}
        </Button>
      </DialogFooter>
    </form>
  );
}
