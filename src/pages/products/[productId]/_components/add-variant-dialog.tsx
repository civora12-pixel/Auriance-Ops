import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { PhotoPicker } from "@/components/photo.tsx";
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
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { AttributesEditor } from "./attributes-editor.tsx";
import { readAttributes } from "./attributes.ts";
import type { AttributeRow } from "./attributes.ts";

export type VariantParent = {
  _id: string;
  name: string;
  sku: string;
  uom: string;
  hasVariants: boolean;
  totalOnHand: number;
  notSellable: number;
};

export default function AddVariantDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: VariantParent;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open && (
          <AddVariantForm
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

function AddVariantForm({
  product,
  pending,
  setPending,
  onDone,
}: {
  product: VariantParent;
  pending: boolean;
  setPending: (p: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const prefix = `${useId()}-`;
  const { formatNumber } = useFormat();
  const addVariant = useMutation(api.products.addVariant);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<AttributeRow[]>([]);
  const [errors, setErrors] = useState<{
    name?: string;
    attributes?: string;
  }>({});
  const isFirst = !product.hasVariants;
  const movingStock =
    isFirst && (product.totalOnHand > 0 || product.notSellable > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = t("Enter a name (e.g. Small, Red)");
    const attrs = readAttributes(attributes);
    if (attrs.error) errs.attributes = attrs.error;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    try {
      await addVariant({
        productId: product._id,
        name: name.trim(),
        imageUrl: imageUrl ?? undefined,
        attributes: attrs.attributes,
      });
      toast.success(t('Variant "{{name}}" added', { name: name.trim() }));
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
        <DialogTitle>{t("Add variant")}</DialogTitle>
        <DialogDescription>
          {t(
            "A size, color or other option of {{name}}, with its own SKU and stock.",
            { name: product.name },
          )}
        </DialogDescription>
      </DialogHeader>

      {isFirst && (
        <Alert>
          <Info />
          <AlertTitle>
            {t("This turns {{name}} into a product with variants", {
              name: product.name,
            })}
          </AlertTitle>
          <AlertDescription>
            {movingStock
              ? product.notSellable
                ? t(
                    "Its current stock ({{quantity}} {{uom}}, plus {{notSellable}} not sellable), stock history and order lines move to this variant.",
                    {
                      quantity: formatNumber(product.totalOnHand),
                      uom: product.uom,
                      notSellable: formatNumber(product.notSellable),
                    },
                  )
                : t(
                    "Its current stock ({{quantity}} {{uom}}), stock history and order lines move to this variant.",
                    {
                      quantity: formatNumber(product.totalOnHand),
                      uom: product.uom,
                    },
                  )
              : t(
                  "Its stock history and order lines move to this variant.",
                )}{" "}
            {t("Add the other variants afterwards.")}
          </AlertDescription>
        </Alert>
      )}

      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.name || undefined}>
            <FieldLabel htmlFor={`${prefix}name`}>{t("Name")}</FieldLabel>
            <Input
              id={`${prefix}name`}
              autoFocus
              placeholder={t("e.g. Small")}
              value={name}
              maxLength={200}
              disabled={pending}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name || undefined}
            />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}sku`}>{t("SKU")}</FieldLabel>
            <Input
              id={`${prefix}sku`}
              value={t("Assigned automatically")}
              disabled
              readOnly
            />
            <FieldDescription>
              {t("Next after {{sku}}, like {{sku}}-01", { sku: product.sku })}
            </FieldDescription>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={`${prefix}photo`}>
            {t("Photo (optional)")}
          </FieldLabel>
          <PhotoPicker
            id={`${prefix}photo`}
            value={imageUrl}
            onChange={setImageUrl}
            label={name || product.name}
            disabled={pending}
          />
          <FieldDescription>
            {t("Leave empty to use the product photo.")}
          </FieldDescription>
        </Field>
        <Field data-invalid={!!errors.attributes || undefined}>
          <FieldLabel htmlFor={`${prefix}attributes`}>
            {t("Attributes (optional)")}
          </FieldLabel>
          <AttributesEditor
            rows={attributes}
            onChange={setAttributes}
            disabled={pending}
            idPrefix={prefix}
          />
          {errors.attributes && <FieldError>{errors.attributes}</FieldError>}
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
          {t("Add variant")}
        </Button>
      </DialogFooter>
    </form>
  );
}
