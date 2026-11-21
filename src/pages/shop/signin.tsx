import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { getErrorMessage } from "@/lib/api.ts";
import { useShopAction, useShopMe } from "./_lib/shop-api.ts";
import { AuthCard, SHOP_BUTTON, SHOP_INPUT } from "./_components/auth-card.tsx";
import { shopNext } from "./_lib/next.ts";

export default function ShopSignIn() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const me = useShopMe();
  const action = useShopAction();
  const next = shopNext(params.get("next"));
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  if (me?.customer) return <Navigate to={next} replace />;
  const query = params.get("next") ? `?next=${encodeURIComponent(next)}` : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password) {
      setError(t("Enter your phone number (or email) and password"));
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await action("login", { login: login.trim(), password });
    } catch (err) {
      setError(getErrorMessage(err));
      setPending(false);
    }
  };

  return (
    <AuthCard title={t("Sign in")} error={error}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="login">{t("Phone number or email")}</FieldLabel>
            <Input
              id="login"
              autoComplete="username"
              inputMode="email"
              dir="ltr"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className={SHOP_INPUT}
              placeholder="01012345678"
            />
          </Field>
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">{t("Password")}</FieldLabel>
              <Link to="/shop/forgot" className="text-sm text-primary underline-offset-4 hover:underline">
                {t("Forgot password?")}
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={SHOP_INPUT}
            />
          </Field>
        </FieldGroup>
        <Button type="submit" size="lg" className={SHOP_BUTTON} disabled={pending}>
          {pending && <Spinner />}
          {t("Sign in")}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t("New here?")}{" "}
        <Link to={`/shop/signup${query}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {t("Create an account")}
        </Link>
      </p>
    </AuthCard>
  );
}
