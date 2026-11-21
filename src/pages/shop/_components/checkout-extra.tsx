import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, Plus, Sparkles, X } from "lucide-react";
import type { Gender } from "@shared/constants.ts";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import { useCart } from "../_lib/cart.ts";
import { useCheckoutExtras } from "../_lib/shop-api.ts";
import type { ShopProduct } from "../_lib/shop-api.ts";
import { ProductImage } from "./product-image.tsx";

/**
 * "Forgot something?": like the sweets by a supermarket till, one small,
 * useful extra offered just before Place order. One tap adds it; it never
 * blocks the order and can be waved away.
 */
export function CheckoutExtra({ products, inCart }: { products: ShopProduct[]; inCart: Set<string> }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const ids = useCheckoutExtras();
  const cart = useCart();
  const [dismissed, setDismissed] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  const extras = (ids ?? [])
    .map((id) => products.find((p) => p.productId === id))
    .filter((p): p is ShopProduct => !!p && !p.soldOut && !p.offSeason && (!inCart.has(p.productId) || p.productId === added));
  const p = extras[0];
  if (dismissed || !p) return null;

  // One size and in stock: add straight from here; otherwise open the product to pick
  const one = !p.hasSizes ? p.options.find((o) => o.maxQuantity > 0) : undefined;
  const add = (gender: Gender | null) => {
    if (!one) return;
    cart.add(p.productId, one.variantId ?? null, gender, 1, one.maxQuantity);
    setAdded(p.productId);
  };
  const done = added === p.productId;

  return (
    <div className="checkout-extra relative overflow-hidden rounded-2xl border-2 border-dashed border-primary/40 bg-gradient-to-br from-[#fff4d6] via-[#ffe3ec] to-[#e3f1ff] p-4 text-[#3b2530] dark:from-[#3a2c12] dark:via-[#3a1b27] dark:to-[#132a40] dark:text-[#fbe9ef]">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute top-2 end-2 flex size-8 items-center justify-center rounded-full text-current/60 hover:bg-white/40"
        aria-label={t("No thanks")}
      >
        <X className="size-4" />
      </button>
      <p className="flex items-center gap-1.5 text-sm font-bold">
        <Sparkles className="size-4 text-primary" aria-hidden />
        {t("Little ones always need one more of these")}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <ProductImage url={p.imageUrl} alt="" className="size-16 shrink-0 rounded-xl bg-white/70" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug" dir="auto">
            {p.name}
          </p>
          <p className="text-sm tabular-nums opacity-80">{formatMoney(p.price)}</p>
        </div>
        {done ? (
          <span className="flex h-10 items-center gap-1 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white">
            <Check className="size-4" />
            {t("Added")}
          </span>
        ) : !one ? (
          <Link
            to={`/shop/p/${p.productId}`}
            className="extra-pop flex h-10 items-center gap-1 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            {t("Choose")}
          </Link>
        ) : p.needsGender ? (
          <div className="flex gap-1.5">
            {(["boys", "girls"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => add(g)}
                className={cn(
                  "extra-pop flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-white",
                  g === "boys" ? "bg-sky-600" : "bg-pink-600",
                )}
              >
                <Plus className="size-4" />
                {g === "boys" ? t("Boy") : t("Girl")}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => add(null)}
            className="extra-pop flex h-10 items-center gap-1 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="size-4" />
            {t("Add")}
          </button>
        )}
      </div>
    </div>
  );
}
