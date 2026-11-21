import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
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
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { MIN_PASSWORD_LENGTH } from "@/components/change-password-dialog.tsx";
import { useAuth } from "@/lib/auth.tsx";
import { getErrorMessage, request } from "@/lib/api.ts";
import { AuthShell } from "./auth-shell.tsx";

type LinkInfo = { kind: "invite" | "reset"; email: string; name: string };

/** Accept an invite (choose a password) or reset a password, from a one-time link. */
export default function LinkPage() {
  const { t } = useTranslation();
  const { token = "" } = useParams();
  const info = useQuery({
    queryKey: ["auth", "link", token],
    queryFn: () =>
      request<LinkInfo>("GET", `/api/auth/link/${encodeURIComponent(token)}`),
    retry: false,
    staleTime: Infinity,
  });

  if (info.isPending) {
    return (
      <AuthShell title={t("Checking your link…")}>
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </AuthShell>
    );
  }
  if (info.isError) {
    return (
      <AuthShell title={t("Link not valid")}>
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            {getErrorMessage(info.error)}
          </p>
          <Button asChild variant="outline">
            <Link to="/login">{t("Go to sign in")}</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }
  return <LinkForm token={token} info={info.data} />;
}

function LinkForm({ token, info }: { token: string; info: LinkInfo }) {
  const { t } = useTranslation();
  const { acceptLink } = useAuth();
  const navigate = useNavigate();
  const invite = info.kind === "invite";
  const [name, setName] = useState(info.name);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (invite && !name.trim()) errs.name = t("Enter your name");
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
      await acceptLink(token, {
        password,
        name: invite ? name.trim() : undefined,
      });
      navigate("/", { replace: true });
    } catch (err) {
      setFormError(getErrorMessage(err));
      setPending(false);
    }
  };

  return (
    <AuthShell
      title={invite ? t("Join the team") : t("Set a new password")}
      description={
        invite ? (
          <Trans
            i18nKey="Choose a password for <b>{{email}}</b>"
            values={{ email: info.email }}
            components={{ b: <span className="font-medium text-foreground" /> }}
          />
        ) : (
          <Trans
            i18nKey="For <b>{{email}}</b>"
            values={{ email: info.email }}
            components={{ b: <span className="font-medium text-foreground" /> }}
          />
        )
      }
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        {/* Lets password managers save the right username */}
        <input
          type="email"
          autoComplete="username"
          value={info.email}
          readOnly
          hidden
        />
        <FieldGroup className="gap-4">
          {invite && (
            <Field data-invalid={!!errors.name || undefined}>
              <FieldLabel htmlFor="name">{t("Your name")}</FieldLabel>
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!errors.name || undefined}
              />
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </Field>
          )}
          <Field data-invalid={!!errors.password || undefined}>
            <FieldLabel htmlFor="password">
              {invite ? t("Password") : t("New password")}
            </FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus={!invite}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password || undefined}
            />
            {errors.password ? (
              <FieldError>{errors.password}</FieldError>
            ) : (
              <FieldDescription>
                {t("At least {{min}} characters.", {
                  min: MIN_PASSWORD_LENGTH,
                })}
              </FieldDescription>
            )}
          </Field>
          <Field data-invalid={!!errors.confirm || undefined}>
            <FieldLabel htmlFor="confirm">{t("Confirm password")}</FieldLabel>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={!!errors.confirm || undefined}
            />
            {errors.confirm && <FieldError>{errors.confirm}</FieldError>}
          </Field>
        </FieldGroup>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Spinner />}
          {invite ? t("Join and sign in") : t("Save and sign in")}
        </Button>
      </form>
    </AuthShell>
  );
}
