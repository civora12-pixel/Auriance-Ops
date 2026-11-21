import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
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
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { getErrorMessage } from "@/lib/api.ts";

/** Edits a person's name: the one shown on orders and at the end of WhatsApp posts. */
export function NameDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: string;
  onSave: (name: string) => Promise<unknown>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {open && (
          <NameForm
            title={title}
            initial={initial}
            onSave={onSave}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NameForm({
  title,
  initial,
  onSave,
  onDone,
}: {
  title: string;
  initial: string;
  onSave: (name: string) => Promise<unknown>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (!value) {
      setError(t("Enter a name"));
      return;
    }
    setPending(true);
    try {
      await onSave(value);
      toast.success(t("Name saved"));
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {t(
            "Shown on the orders they record and at the end of every WhatsApp post. Write it the way the group should see it, e.g. in Arabic.",
          )}
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor="person-name">{t("Name")}</FieldLabel>
        <Input
          id="person-name"
          dir="auto"
          value={name}
          maxLength={100}
          autoFocus
          disabled={pending}
          onChange={(e) => {
            setName(e.target.value);
            setError(undefined);
          }}
          aria-invalid={!!error || undefined}
        />
        {error ? (
          <FieldError>{error}</FieldError>
        ) : (
          <FieldDescription>{t("e.g. هند")}</FieldDescription>
        )}
      </Field>
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
          {t("Save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
