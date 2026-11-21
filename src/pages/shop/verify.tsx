import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { getErrorMessage } from "@/lib/api.ts";
import { shopPost } from "./_lib/shop-api.ts";
import { AuthCard, SHOP_BUTTON } from "./_components/auth-card.tsx";

/** The email confirmation link. */
export default function ShopVerify() {
  const { t } = useTranslation();
  const { token = "" } = useParams();
  const queryClient = useQueryClient();
  const [state, setState] = useState<"pending" | "done" | string>("pending");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    shopPost(`verify/${encodeURIComponent(token)}`)
      .then(() => {
        setState("done");
        void queryClient.invalidateQueries({ queryKey: ["shop"] });
      })
      .catch((err: unknown) => setState(getErrorMessage(err)));
  }, [token, queryClient]);

  if (state === "pending")
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6 text-primary" />
      </div>
    );
  return (
    <AuthCard
      title={state === "done" ? t("Email confirmed") : t("Link not working")}
      description={state === "done" ? t("We'll use it if you ever need to reset your password.") : undefined}
      error={state === "done" ? undefined : state}
    >
      <Button asChild size="lg" className={SHOP_BUTTON}>
        <Link to="/shop">{t("Go to the shop")}</Link>
      </Button>
    </AuthCard>
  );
}
