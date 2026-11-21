import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { useAuth } from "@/lib/auth.tsx";
import { getErrorMessage } from "@/lib/api.ts";

export const MIN_PASSWORD_LENGTH = 8;

export default function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <ChangePasswordForm
            onDone={() => onOpenChange(false)}
            pending={pending}
            setPending={setPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordForm({
  onDone,
  pending,
  setPending,
}: {
  onDone: () => void;
  pending: boolean;
  setPending: (p: boolean) => void;
}) {
  const { t } = useTranslation();
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{
    current?: string;
    next?: string;
    confirm?: string;
  }>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!current) errs.current = t("Enter your current password");
    if (next.length < MIN_PASSWORD_LENGTH)
      errs.next = t("Use at least {{min}} characters", {
        min: MIN_PASSWORD_LENGTH,
      });
    else if (next === current) errs.next = t("Choose a different password");
    if (confirm !== next) errs.confirm = t("Passwords don't match");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    try {
      await changePassword(current, next);
      toast.success(t("Password changed. Other devices were signed out."));
      onDone();
    } catch (err) {
      setErrors({ current: getErrorMessage(err) });
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{t("Change password")}</DialogTitle>
        <DialogDescription>
          {t("You'll stay signed in on this device.")}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.current || undefined}>
          <FieldLabel htmlFor="pw-current">{t("Current password")}</FieldLabel>
          <Input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            aria-invalid={!!errors.current || undefined}
          />
          {errors.current && <FieldError>{errors.current}</FieldError>}
        </Field>
        <Field data-invalid={!!errors.next || undefined}>
          <FieldLabel htmlFor="pw-new">{t("New password")}</FieldLabel>
          <Input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={!!errors.next || undefined}
          />
          {errors.next ? (
            <FieldError>{errors.next}</FieldError>
          ) : (
            <FieldDescription>
              {t("At least {{min}} characters.", { min: MIN_PASSWORD_LENGTH })}
            </FieldDescription>
          )}
        </Field>
        <Field data-invalid={!!errors.confirm || undefined}>
          <FieldLabel htmlFor="pw-confirm">
            {t("Confirm new password")}
          </FieldLabel>
          <Input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={!!errors.confirm || undefined}
          />
          {errors.confirm && <FieldError>{errors.confirm}</FieldError>}
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
          {t("Change password")}
        </Button>
      </DialogFooter>
    </form>
  );
}
