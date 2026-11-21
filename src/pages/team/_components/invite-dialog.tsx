import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.tsx";
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
import { PERMISSION_PRESETS } from "@shared/constants.ts";
import type { Permissions, Role } from "@shared/constants.ts";
import { PermissionsFields } from "./permissions-fields.tsx";
import { ShareLink } from "./share-link.tsx";
import type { SharedLink } from "./share-link.tsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {open && (
          <InviteForm
            onDone={() => onOpenChange(false)}
            pending={pending}
            setPending={setPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({
  onDone,
  pending,
  setPending,
}: {
  onDone: () => void;
  pending: boolean;
  setPending: (p: boolean) => void;
}) {
  const { t } = useTranslation();
  const invite = useMutation(api.users.invite);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [permissions, setPermissions] = useState<Permissions>(
    () =>
      structuredClone(PERMISSION_PRESETS.moderator.permissions) as Permissions,
  );
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    form?: string;
  }>({});
  const [link, setLink] = useState<SharedLink | null>(null);

  if (link) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            {t("{{name}} was added", { name: link.name })}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Send them this invite link (by chat or email). They'll choose a password and sign in.",
            )}
          </DialogDescription>
        </DialogHeader>
        <ShareLink link={link} />
        <DialogFooter>
          <Button onClick={onDone}>{t("Done")}</Button>
        </DialogFooter>
      </>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = t("Enter a name");
    if (!EMAIL_RE.test(email.trim()))
      errs.email = t("Enter a valid email address");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    try {
      const res = await invite({
        name: name.trim(),
        email: email.trim(),
        role,
        permissions,
      });
      setLink({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        kind: "invite",
        path: res.path,
        expiresAt: res.expiresAt,
      });
    } catch (err) {
      setErrors({ form: getErrorMessage(err) });
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{t("Add a teammate")}</DialogTitle>
        <DialogDescription>
          {t(
            "You'll get a one-time invite link to send them. It expires in 7 days.",
          )}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.name || undefined}>
          <FieldLabel htmlFor="invite-name">{t("Name")}</FieldLabel>
          <Input
            id="invite-name"
            autoFocus
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.name || undefined}
            maxLength={100}
          />
          {errors.name && <FieldError>{errors.name}</FieldError>}
        </Field>
        <Field data-invalid={!!errors.email || undefined}>
          <FieldLabel htmlFor="invite-email">{t("Email")}</FieldLabel>
          <Input
            id="invite-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email || undefined}
            maxLength={200}
          />
          {errors.email ? (
            <FieldError>{errors.email}</FieldError>
          ) : (
            <FieldDescription>
              {t("They'll sign in with this address.")}
            </FieldDescription>
          )}
        </Field>
        <FieldSet className="gap-3">
          <FieldLegend variant="label">{t("Role")}</FieldLegend>
          <RadioGroup
            value={role}
            onValueChange={(v) => setRole(v as Role)}
            disabled={pending}
          >
            <Field orientation="horizontal">
              <RadioGroupItem value="member" id="invite-role-member" />
              <FieldContent>
                <FieldLabel
                  htmlFor="invite-role-member"
                  className="font-normal"
                >
                  {t("Member")}
                </FieldLabel>
                <FieldDescription>
                  {t("Opens only the sections you choose.")}
                </FieldDescription>
              </FieldContent>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem value="admin" id="invite-role-admin" />
              <FieldContent>
                <FieldLabel htmlFor="invite-role-admin" className="font-normal">
                  {t("Admin")}
                </FieldLabel>
                <FieldDescription>
                  {t("Full access, including finance, team and settings.")}
                </FieldDescription>
              </FieldContent>
            </Field>
          </RadioGroup>
        </FieldSet>
        {role === "member" && (
          <PermissionsFields
            idPrefix="invite"
            value={permissions}
            onChange={setPermissions}
            disabled={pending}
          />
        )}
        {errors.form && (
          <p role="alert" className="text-sm text-destructive">
            {errors.form}
          </p>
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
          {t("Add and get link")}
        </Button>
      </DialogFooter>
    </form>
  );
}
