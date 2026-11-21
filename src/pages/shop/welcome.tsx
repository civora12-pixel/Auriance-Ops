import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { updateGuest } from "./_lib/guest.ts";
import { shopNext } from "./_lib/next.ts";
import { useShopConfig, useShopMe } from "./_lib/shop-api.ts";
import { Crawler } from "./_components/crawler.tsx";
import { LogoWithPeekingBaby } from "./_components/peeking-baby.tsx";
import { SHOP_BUTTON } from "./_components/auth-card.tsx";

/** First visit: sign in, create an account, or continue as a guest. */
export default function ShopWelcome() {
  const config = useShopConfig();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const me = useShopMe();
  const next = shopNext(params.get("next"));
  if (me?.customer) return <Navigate to={next} replace />;
  const query = params.get("next") ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <div className="mx-auto grid w-full max-w-md justify-items-center gap-6 py-4 text-center">
      <LogoWithPeekingBaby />
      <div className="flex items-end gap-4">
        <Crawler kind="baby" state="waving" className="h-16 w-20" />
        <Crawler kind="cherries" state="waving" className="h-12 w-16" />
      </div>
      <div className="grid gap-1">
        <h1 className="font-display text-3xl font-bold text-shop-deep">{t("Welcome to Auriance")}</h1>
        <p className="text-muted-foreground">
          {t("Sign in to see your orders and keep your details for next time, or just start shopping.")}
        </p>
      </div>
      <div className="grid w-full gap-3">
        <Button asChild size="lg" className={SHOP_BUTTON}>
          <Link to={`/shop/signin${query}`}>{t("Sign in")}</Link>
        </Button>
        {!(config?.signupsPaused && !config.preview) && (
          <Button asChild size="lg" variant="outline" className={`${SHOP_BUTTON} bg-card`}>
            <Link to={`/shop/signup${query}`}>{t("Create an account")}</Link>
          </Button>
        )}
        <Button
          type="button"
          size="lg"
          variant="ghost"
          className={`${SHOP_BUTTON} text-shop-deep`}
          onClick={() => {
            updateGuest({ guest: true });
            navigate(next, { replace: true });
          }}
        >
          {t("Continue as guest")}
        </Button>
      </div>
    </div>
  );
}
