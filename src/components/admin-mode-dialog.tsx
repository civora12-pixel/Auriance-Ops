import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
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
import { useAdminMode } from "@/lib/auth.tsx";
import { getErrorMessage } from "@/lib/api.ts";

/** Unlock destructive actions for 15 minutes by re-entering your own password. */
export default function AdminModeDialog({
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
        {/* Remounted on every open, so the password field always starts empty */}
        {open && (
          <AdminModeForm
            onDone={() => onOpenChange(false)}
            pending={pending}
            setPending={setPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdminModeForm({
  onDone,
  pending,
  setPending,
}: {
  onDone: () => void;
  pending: boolean;
  setPending: (p: boolean) => void;
}) {
  const { t } = useTranslation();
  const { enterAdminMode } = useAdminMode();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError(t("Enter your password"));
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await enterAdminMode(password);
      toast.success(t("Admin Mode is on for 15 minutes"));
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-destructive" />
          {t("Enter Admin Mode")}
        </DialogTitle>
        <DialogDescription>
          {t(
            "Admin Mode unlocks permanent actions such as deleting orders, products, stock movements and expenses, editing field visibility and downloading backups. It turns off by itself after 15 minutes.",
          )}
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor="admin-mode-password">
          {t("Your password")}
        </FieldLabel>
        <Input
          id="admin-mode-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? "admin-mode-error" : "admin-mode-hint"}
        />
        {error ? (
          <FieldError id="admin-mode-error">{error}</FieldError>
        ) : (
          <FieldDescription id="admin-mode-hint">
            {t("The password you sign in with.")}
          </FieldDescription>
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
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending && <Spinner />}
          {t("Enter Admin Mode")}
        </Button>
      </DialogFooter>
    </form>
  );
}
