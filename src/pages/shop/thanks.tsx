import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { useFormat } from "@/lib/format.ts";
import { whatsAppChatUrl } from "@/lib/whatsapp.ts";
import { useShopConfig, useShopMe } from "./_lib/shop-api.ts";
import type { PlacedOrder } from "./_lib/shop-api.ts";
import { SHOP_BUTTON } from "./_components/auth-card.tsx";
import { CheckoutSteps } from "./_components/checkout-steps.tsx";
import { cueBaby } from "./_lib/baby-cue.ts";

/** After Place order: the order number and a one-tap WhatsApp message to confirm it. */
export default function ShopThanks() {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const config = useShopConfig();
  const me = useShopMe();
  const placed = useLocation().state as PlacedOrder | null;
  // The baby waves goodbye (once the page and the baby are in place)
  useEffect(() => {
    if (!placed?.number) return;
    const id = window.setTimeout(() => cueBaby("order-placed"), 600);
    return () => window.clearTimeout(id);
  }, [placed?.number]);

  if (!placed?.number) {
    return (
      <div className="grid justify-items-center gap-4 py-16 text-center">
        <Button asChild className="rounded-full">
          <Link to="/shop">{t("Go to the shop")}</Link>
        </Button>
      </div>
    );
  }

  const total = formatMoney(placed.total + placed.shippingFee);
  const message = t("Hi, I'm {{name}}. I just placed order {{number}} on the website ({{total}}, cash on delivery). Please confirm it.", {
    name: placed.name,
    number: placed.number,
    total,
  });

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <CheckoutSteps step={2} done kind="baby" />
      <div className="grid justify-items-center gap-4 rounded-3xl border border-border bg-card p-6 text-center">
        <h1 className="font-display text-3xl font-bold text-shop-deep">{t("Thank you, {{name}}!", { name: placed.name })}</h1>
        <p>
          {t("Your order number is")} <span className="font-semibold" dir="ltr">{placed.number}</span>
        </p>
        <p className="text-muted-foreground">
          {t("Total {{total}}, paid in cash when it arrives. We'll message you on WhatsApp to confirm it before we ship.", {
            total,
          })}
        </p>
        {config?.whatsapp && (
          <Button asChild size="lg" className={`${SHOP_BUTTON} w-full bg-[#25d366] text-white hover:bg-[#1ebe5b]`}>
            <a href={whatsAppChatUrl(config.whatsapp, message)} target="_blank" rel="noreferrer">
              <MessageCircle />
              {t("Confirm on WhatsApp")}
            </a>
          </Button>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {me?.customer && (
            <Button asChild variant="outline" className="rounded-full bg-card">
              <Link to="/shop/account">{t("My orders")}</Link>
            </Button>
          )}
          <Button asChild variant="ghost" className="rounded-full">
            <Link to="/shop">{t("Continue shopping")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
