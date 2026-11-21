import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import type { Permissions } from "@shared/constants.ts";
import { PermissionsFields } from "./permissions-fields.tsx";

export type AccessTarget = {
  _id: string;
  name: string;
  permissions: Permissions;
};

/** Edit a member's sections and status permission. */
export default function AccessDialog({
  member,
  onClose,
}: {
  member: AccessTarget | null;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open={member !== null}
      onOpenChange={(open) => !open && !pending && onClose()}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {member && (
          <AccessForm
            key={member._id}
            member={member}
            onDone={onClose}
            pending={pending}
            setPending={setPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AccessForm({
  member,
  onDone,
  pending,
  setPending,
}: {
  member: AccessTarget;
  onDone: () => void;
  pending: boolean;
  setPending: (p: boolean) => void;
}) {
  const { t } = useTranslation();
  const setPermissions = useMutation(api.users.setPermissions);
  const [value, setValue] = useState<Permissions>(member.permissions);
  const [error, setError] = useState<string>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      await setPermissions({
        userId: member._id,
        permissions: value,
      });
      toast.success(t("Access updated for {{name}}", { name: member.name }));
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
        <DialogTitle>
          {t("Access for {{name}}", { name: member.name })}
        </DialogTitle>
        <DialogDescription>
          {t("Changes apply the next time their screen refreshes.")}
        </DialogDescription>
      </DialogHeader>
      <PermissionsFields
        idPrefix={`access-${member._id}`}
        value={value}
        onChange={setValue}
        disabled={pending}
      />
      {Object.keys(value.access).length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t(
            "With no sections, {{name}} can sign in but sees a “waiting for access” page.",
            { name: member.name },
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
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
          {t("Save access")}
        </Button>
      </DialogFooter>
    </form>
  );
}
