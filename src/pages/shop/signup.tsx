import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { isEgyptianMobile } from "@shared/phone.ts";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { getErrorMessage } from "@/lib/api.ts";
import { useShopAction, useShopConfig, useShopMe } from "./_lib/shop-api.ts";
import type { ShopCustomer } from "./_lib/shop-api.ts";
import { AuthCard, SHOP_BUTTON, SHOP_INPUT } from "./_components/auth-card.tsx";
import { shopNext } from "./_lib/next.ts";

export default function ShopSignUp() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const me = useShopMe();
  const config = useShopConfig();
  const action = useShopAction();
  const next = shopNext(params.get("next"));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  if (me?.customer) return <Navigate to={next} replace />;
  const query = params.get("next") ? `?next=${encodeURIComponent(next)}` : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t("Enter your name"));
    if (!isEgyptianMobile(phone)) return setError(t("Enter an Egyptian mobile number, like 01012345678"));
    if (password.length < 8) return setError(t("Password must be at least 8 characters"));
    setPending(true);
    setError(undefined);
    try {
      const res = await action<{ customer: ShopCustomer }>("signup", {
        name: name.trim(),
        phone,
        email: email.trim() || undefined,
        password,
      });
      toast.success(t("Welcome, {{name}}!", { name: res.customer.name }), {
        description:
          res.customer.email && config?.emailEnabled
            ? t("We sent a link to your email. Open it to confirm your address.")
            : undefined,
      });
    } catch (err) {
      setError(getErrorMessage(err));
      setPending(false);
    }
  };

  if (config?.signupsPaused && !config.preview)
    return (
      <AuthCard title={t("Create an account")} description={t("New accounts are paused for now. You can still order as a guest.")}>
        <Button asChild size="lg" className={SHOP_BUTTON}>
          <Link to={`/shop/welcome${query}`}>{t("Continue")}</Link>
        </Button>
      </AuthCard>
    );

  return (
    <AuthCard
      title={t("Create an account")}
      description={t("Keep your details for faster orders and see your order history.")}
      error={error}
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="name">{t("Your name")}</FieldLabel>
            <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={SHOP_INPUT} />
          </Field>
          <Field>
            <FieldLabel htmlFor="phone">{t("Mobile number")}</FieldLabel>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              placeholder="01012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={SHOP_INPUT}
            />
            <FieldDescription>{t("You'll sign in with this number.")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="email">
              {t("Email")} <span className="font-normal text-muted-foreground">({t("optional")})</span>
            </FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={SHOP_INPUT}
            />
            <FieldDescription>
              {t("With a confirmed email you can reset your password yourself. Without one, message us on WhatsApp.")}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="password">{t("Password")}</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={SHOP_INPUT}
            />
            <FieldDescription>{t("At least 8 characters.")}</FieldDescription>
          </Field>
        </FieldGroup>
        <Button type="submit" size="lg" className={SHOP_BUTTON} disabled={pending}>
          {pending && <Spinner />}
          {t("Create account")}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t("Already have an account?")}{" "}
        <Link to={`/shop/signin${query}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {t("Sign in")}
        </Link>
      </p>
    </AuthCard>
  );
}
