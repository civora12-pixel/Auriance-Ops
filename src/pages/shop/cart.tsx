import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { round2 } from "@shared/constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useFormat } from "@/lib/format.ts";
import { useCartRows } from "./_lib/cart-lines.ts";
import { crawlerFor } from "./_lib/sections.ts";
import { useCatalog, useShopConfig, useShopMe } from "./_lib/shop-api.ts";
import { shippingFeeFor } from "@shared/shipping-zones.ts";
import { CheckoutSteps } from "./_components/checkout-steps.tsx";
import { GenderChoice } from "./_components/gender-choice.tsx";
import { OrderSums } from "./_components/order-sums.tsx";
import { ProductImage } from "./_components/product-image.tsx";

/** The cart, checked against live stock, then on to checkout. */
export default function ShopCart() {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const navigate = useNavigate();
  const products = useCatalog();
  const me = useShopMe();
  const config = useShopConfig();
  const { cart, rows, ready, subtotal, missingGender } = useCartRows(products);

  if (products === undefined) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="grid justify-items-center gap-4 py-16 text-center">
        <ShoppingBag className="size-12 text-shop-icon" aria-hidden />
        <h1 className="font-display text-2xl font-bold">{t("Your cart is empty")}</h1>
        <Button asChild className="rounded-full">
          <Link to="/shop">{t("Start shopping")}</Link>
        </Button>
      </div>
    );
  }

  const shipping = shippingFeeFor(me?.customer?.governorate, me?.customer?.city);
  const kind = crawlerFor(ready.length && ready.every((r) => r.product?.section === "women") ? "women" : undefined);

  return (
    <div className="grid gap-6">
      {config?.ordersPaused && !config.preview && (
        <p role="status" className="rounded-2xl bg-secondary p-4 text-center text-sm font-medium text-secondary-foreground">
          {t("We've paused new orders for a short while. Please try again soon.")}
        </p>
      )}
      <CheckoutSteps step={0} kind={kind} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="grid gap-4">
          <h1 className="font-display text-3xl font-bold text-shop-deep">{t("Your cart")}</h1>
          <ul className="grid gap-3">
            {rows.map(({ line, key, product, option, max, quantity, needsGender, limited }) => {
              const unavailable = !product || max <= 0;
              return (
                <li key={key} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
                  <ProductImage
                    url={option?.imageUrl ?? product?.imageUrl}
                    alt={product?.name ?? ""}
                    className="aspect-[4/5] w-20 shrink-0 rounded-xl"
                  />
                  <div className="grid min-w-0 flex-1 content-between gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {product ? (
                          <Link
                            to={`/shop/p/${product.productId}`}
                            dir="auto"
                            className="line-clamp-2 font-medium hover:underline"
                          >
                            {product.name}
                          </Link>
                        ) : (
                          <p className="text-muted-foreground">{t("Product no longer available")}</p>
                        )}
                        {option?.name && (
                          <p className="text-sm text-muted-foreground">
                            {t("Size")}: <span dir="auto">{option.name}</span>
                          </p>
                        )}
                        {product && unavailable && !limited && (
                          <p className="text-sm font-medium text-destructive">{t("Sold out")}</p>
                        )}
                        {(limited || !unavailable) && line.quantity > max && (
                          <p className="text-xs text-muted-foreground">
                            {limited
                              ? t("Up to {{n}} per order for this piece, quantity lowered", { n: product?.maxPerOrder ?? max })
                              : t("Only {{n}} left, quantity lowered", { n: max })}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="-me-1 -mt-1 shrink-0 text-muted-foreground"
                        onClick={() => cart.remove(key)}
                        aria-label={t("Remove from cart")}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    {product?.needsGender && !unavailable && (
                      <div className="grid gap-1">
                        {needsGender && (
                          <span className="text-xs font-medium text-destructive">{t("Choose boy or girl")}</span>
                        )}
                        <GenderChoice size="sm" value={line.gender} onChange={(g) => cart.setGender(key, g)} />
                      </div>
                    )}
                    {!unavailable && (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center rounded-full border border-input">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-9 rounded-full"
                            onClick={() => cart.setQuantity(key, quantity - 1)}
                            aria-label={t("Decrease quantity")}
                          >
                            <Minus />
                          </Button>
                          <span className="w-8 text-center text-sm font-semibold tabular-nums">{quantity}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-9 rounded-full"
                            onClick={() => cart.setQuantity(key, Math.min(max, quantity + 1))}
                            disabled={quantity >= max}
                            aria-label={t("Increase quantity")}
                          >
                            <Plus />
                          </Button>
                        </div>
                        <span className="font-semibold tabular-nums">
                          {formatMoney(round2(quantity * (product?.price ?? 0)))}
                        </span>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="grid gap-4 rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-28 lg:mt-12">
          <OrderSums subtotal={subtotal} shipping={shipping} />
          <p className="text-sm text-muted-foreground">
            {t("You pay cash on delivery. We'll confirm your order on WhatsApp.")}
          </p>
          <Button
            type="button"
            size="lg"
            className="h-12 rounded-full text-base"
            disabled={ready.length === 0 || missingGender}
            onClick={() => navigate("/shop/checkout")}
          >
            {missingGender ? t("Choose boy or girl") : t("Checkout")}
          </Button>
          <Button asChild variant="ghost" className="rounded-full">
            <Link to="/shop">{t("Continue shopping")}</Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}
