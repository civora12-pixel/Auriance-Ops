import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { useAuth } from "@/lib/auth.tsx";
import { getErrorMessage } from "@/lib/api.ts";
import { AuthShell } from "./auth-shell.tsx";
import { safeNext } from "./safe-next.ts";

export default function LoginPage() {
  const { t } = useTranslation();
  const { me, login } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  if (me?.needsSetup) return <Navigate to="/setup" replace />;
  if (me?.user) return <Navigate to={next} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError(t("Enter your email and password"));
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      // Navigates away once the session is loaded (the Navigate above)
      await login(email.trim(), password);
    } catch (err) {
      setError(getErrorMessage(err));
      setPending(false);
    }
  };

  return (
    <AuthShell
      title={t("Sign in")}
      description={t("Use the email and password your admin set up for you.")}
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="email">{t("Email")}</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">{t("Password")}</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </FieldGroup>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Spinner />}
          {t("Sign in")}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t("Forgot your password? Ask an admin for a reset link.")}
        </p>
      </form>
    </AuthShell>
  );
}
