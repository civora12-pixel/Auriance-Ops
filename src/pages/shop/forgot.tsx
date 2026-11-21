import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { getErrorMessage } from "@/lib/api.ts";
import { whatsAppChatUrl } from "@/lib/whatsapp.ts";
import { shopPost, useShopConfig } from "./_lib/shop-api.ts";
import { AuthCard, SHOP_BUTTON, SHOP_INPUT } from "./_components/auth-card.tsx";

/**
 * Forgot password: with a confirmed email, a reset link by email (once the
 * email service is on). Otherwise WhatsApp us and a moderator sends a link.
 */
export default function ShopForgot() {
  const { t } = useTranslation();
  const config = useShopConfig();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();

  const whatsapp = config?.whatsapp
    ? whatsAppChatUrl(config.whatsapp, t("Hi, I forgot my Auriance password. My account phone number is: "))
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await shopPost("forgot", { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthCard title={t("Forgot your password?")} error={error}>
      {config?.emailEnabled &&
        (sent ? (
          <p className="rounded-2xl bg-secondary p-4 text-sm text-secondary-foreground">
            {t("If that email is confirmed on an account, a reset link is on its way. Check your inbox (and spam).")}
          </p>
        ) : (
          <form onSubmit={submit} className="grid gap-3" noValidate>
            <Field>
              <FieldLabel htmlFor="email">{t("Your confirmed email")}</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={SHOP_INPUT}
              />
            </Field>
            <Button type="submit" size="lg" className={SHOP_BUTTON} disabled={pending || !email.trim()}>
              {pending && <Spinner />}
              {t("Email me a reset link")}
            </Button>
          </form>
        ))}
      <div className="grid gap-3 rounded-2xl border border-border p-4">
        <p className="text-sm">
          {config?.emailEnabled
            ? t("No email on your account? Message us on WhatsApp and we'll send you a link to choose a new password.")
            : t("Message us on WhatsApp and we'll send you a link to choose a new password.")}
        </p>
        {whatsapp ? (
          <Button asChild size="lg" variant="outline" className={`${SHOP_BUTTON} bg-card`}>
            <a href={whatsapp} target="_blank" rel="noreferrer">
              <MessageCircle />
              {t("Message us on WhatsApp")}
            </a>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{t("Contact us on our WhatsApp number.")}</p>
        )}
      </div>
      <Link to="/shop/signin" className="text-center text-sm text-primary underline-offset-4 hover:underline">
        {t("Back to sign in")}
      </Link>
    </AuthCard>
  );
}
