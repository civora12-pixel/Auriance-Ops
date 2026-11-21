import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { getErrorMessage, request } from "@/lib/api.ts";
import { useShopAction } from "./_lib/shop-api.ts";
import { AuthCard, SHOP_BUTTON, SHOP_INPUT } from "./_components/auth-card.tsx";

/** A reset link (by email, or sent by the team on WhatsApp): choose a new password and sign in. */
export default function ShopReset() {
  const { t } = useTranslation();
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const action = useShopAction();
  const link = useQuery({
    queryKey: ["shop-reset", token],
    queryFn: () => request<{ name: string }>("GET", `/api/shop/reset/${encodeURIComponent(token)}`),
    retry: false,
  });
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  if (link.isPending)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6 text-primary" />
      </div>
    );
  if (link.isError)
    return (
      <AuthCard title={t("Link not working")} error={getErrorMessage(link.error)}>
        <Button asChild size="lg" variant="outline" className={SHOP_BUTTON}>
          <Link to="/shop/forgot">{t("Get a new link")}</Link>
        </Button>
      </AuthCard>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError(t("Password must be at least 8 characters"));
    setPending(true);
    setError(undefined);
    try {
      await action(`reset/${encodeURIComponent(token)}`, { password });
      toast.success(t("Password changed. You're signed in."));
      navigate("/shop", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setPending(false);
    }
  };

  return (
    <AuthCard
      title={t("Choose a new password")}
      description={t("For {{name}}'s account", { name: link.data.name })}
      error={error}
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field>
          <FieldLabel htmlFor="password">{t("New password")}</FieldLabel>
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
        <Button type="submit" size="lg" className={SHOP_BUTTON} disabled={pending}>
          {pending && <Spinner />}
          {t("Save and sign in")}
        </Button>
      </form>
    </AuthCard>
  );
}
