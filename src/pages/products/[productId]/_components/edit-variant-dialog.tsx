import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Field,
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
import { AttributesEditor } from "./attributes-editor.tsx";
import { readAttributes, toAttributeRows } from "./attributes.ts";
import type { AttributeRow } from "./attributes.ts";

export type EditableVariant = {
  _id: string;
  sku: string;
  name: string;
  attributes?: Record<string, string>;
};

export default function EditVariantDialog({
  variant,
  onClose,
}: {
  variant: EditableVariant | null;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open={!!variant}
      onOpenChange={(next) => !next && !pending && onClose()}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {variant && (
          <EditVariantForm
            key={variant._id}
            variant={variant}
            pending={pending}
            setPending={setPending}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditVariantForm({
  variant,
  pending,
  setPending,
  onDone,
}: {
  variant: EditableVariant;
  pending: boolean;
  setPending: (p: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const prefix = `${useId()}-`;
  const updateVariant = useMutation(api.products.updateVariant);
  const [name, setName] = useState(variant.name);
  const [attributes, setAttributes] = useState<AttributeRow[]>(() =>
    toAttributeRows(variant.attributes),
  );
  const [errors, setErrors] = useState<{
    name?: string;
    attributes?: string;
  }>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = t("Enter a name");
    const attrs = readAttributes(attributes);
    if (attrs.error) errs.attributes = attrs.error;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    try {
      await updateVariant({
        variantId: variant._id,
        name: name.trim(),
        attributes: attrs.attributes ?? {},
      });
      toast.success(t("Variant updated"));
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
        <DialogTitle>{t("Edit variant")}</DialogTitle>
        <DialogDescription>
          {t(
            "Changes show on new orders. Existing orders keep the name they were placed with.",
          )}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.name || undefined}>
            <FieldLabel htmlFor={`${prefix}name`}>{t("Name")}</FieldLabel>
            <Input
              id={`${prefix}name`}
              autoFocus
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
            <Input id={`${prefix}sku`} value={variant.sku} disabled readOnly />
          </Field>
        </div>
        <Field data-invalid={!!errors.attributes || undefined}>
          <FieldLabel htmlFor={`${prefix}attributes`}>
            {t("Attributes")}
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
          {t("Save changes")}
        </Button>
      </DialogFooter>
    </form>
  );
}
