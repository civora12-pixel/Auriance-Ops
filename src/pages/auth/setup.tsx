import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { MIN_PASSWORD_LENGTH } from "@/components/change-password-dialog.tsx";
import { useAuth } from "@/lib/auth.tsx";
import { getErrorMessage } from "@/lib/api.ts";
import { AuthShell } from "./auth-shell.tsx";

/** First run: create the owner account. Only reachable while there are no users. */
export default function SetupPage() {
  const { t } = useTranslation();
  const { me, setup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  if (me && !me.needsSetup)
    return <Navigate to={me.user ? "/" : "/login"} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t("Enter your name");
    if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      errs.email = t("Enter a valid email");
    if (password.length < MIN_PASSWORD_LENGTH)
      errs.password = t("Use at least {{min}} characters", {
        min: MIN_PASSWORD_LENGTH,
      });
    if (confirm !== password) errs.confirm = t("Passwords don't match");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    setFormError(undefined);
    try {
      await setup({ name: name.trim(), email: email.trim(), password });
    } catch (err) {
      setFormError(getErrorMessage(err));
      setPending(false);
    }
  };

  const field = (
    id: string,
    label: string,
    input: React.ReactNode,
    hint?: string,
  ) => (
    <Field data-invalid={!!errors[id] || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {input}
      {errors[id] ? (
        <FieldError>{errors[id]}</FieldError>
      ) : (
        hint && <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  );

  return (
    <AuthShell
      title={t("Create the admin account")}
      description={t(
        "This is the owner account. You can invite your team once you're in.",
      )}
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <FieldGroup className="gap-4">
          {field(
            "name",
            t("Your name"),
            <Input
              id="name"
              autoComplete="name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name || undefined}
            />,
          )}
          {field(
            "email",
            t("Email"),
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email || undefined}
            />,
          )}
          {field(
            "password",
            t("Password"),
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password || undefined}
            />,
            t("At least {{min}} characters.", { min: MIN_PASSWORD_LENGTH }),
          )}
          {field(
            "confirm",
            t("Confirm password"),
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={!!errors.confirm || undefined}
            />,
          )}
        </FieldGroup>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Spinner />}
          {t("Create account")}
        </Button>
      </form>
    </AuthShell>
  );
}
