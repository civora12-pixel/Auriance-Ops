import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Minus, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useLanguage } from "@/components/providers/language.tsx";
import { sizeFits } from "@shared/shop-age.ts";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import { ProductImage } from "./_components/product-image.tsx";
import { AddedToCart } from "./_components/added-to-cart.tsx";
import { useBabyAge } from "./_lib/baby-age.ts";
import { useCart } from "./_lib/cart.ts";
import { crawlerFor, isKids, isLow, sectionLabel } from "./_lib/sections.ts";
import { LowStock } from "./_components/product-card.tsx";
import { useCatalog } from "./_lib/shop-api.ts";
import { cueBaby } from "./_lib/baby-cue.ts";
import { useLittleOnes } from "./_lib/little-ones.ts";
import { BIRTHDAYS_ON, useShoppingFor } from "./_lib/shopping-for.ts";
import { GenderChoice } from "./_components/gender-choice.tsx";
import type { Gender } from "@shared/constants.ts";

/** One product: photo, price, size choice and Add to cart. */
export default function ShopProduct() {
  const { t } = useTranslation();
  const { dir } = useLanguage();
  const { productId } = useParams();
  const { formatMoney } = useFormat();
  const products = useCatalog();
  const cart = useCart();
  const { ageMonths } = useBabyAge();
  const product = products?.find((p) => p.productId === productId);
  // Each add replays the little crawl into the bag
  const [added, setAdded] = useState(0);

  const [chosen, setChosen] = useState<string | null>(null);
  // Boy or girl starts from the child being shopped for; the customer can still change it
  const { active: littleOne } = useLittleOnes();
  const shoppingFor = useShoppingFor().kind;
  const child = BIRTHDAYS_ON ? littleOne : shoppingFor;
  const [picked, setGender] = useState<Gender | null>(null);
  const gender = picked ?? child?.gender ?? null;
  // Twins: two of everything by default
  const [quantity, setQuantity] = useState<number | null>(null);
  const twins = child?.twins ?? null;
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;

  if (products === undefined) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="aspect-[4/5] w-full rounded-3xl" />
        <div className="grid content-start gap-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-6 w-1/4" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }
  if (!product) {
    return (
      <div className="grid justify-items-center gap-4 py-16 text-center">
        <p className="text-muted-foreground">
          {t("This product isn't available right now.")}
        </p>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/shop">{t("Back to the shop")}</Link>
        </Button>
      </div>
    );
  }

  const kids = isKids(product.section);
  const fits =
    kids && ageMonths !== null
      ? sizeFits(
          product.options.map((o) => o.name),
          ageMonths,
        )
      : null;
  // A product without sizes sells from its single option
  const option = product.hasSizes
    ? product.options.find((o) => (o.variantId ?? null) === chosen)
    : product.options[0];
  // Limited products: what's left of the per-order limit after what's already in the cart
  const limitLeft = product.maxPerOrder ? Math.max(0, product.maxPerOrder - cart.productCount(product.productId)) : Infinity;
  const max = Math.min(option?.maxQuantity ?? 0, limitLeft);
  // Twins of the same gender: two of each by default (a boy and a girl get the one-for-each button)
  const qty = Math.min(quantity ?? (twins && twins !== "mixed" ? 2 : 1), Math.max(1, max));
  const photo = option?.imageUrl ?? product.imageUrl;

  const missingGender = product.needsGender && !gender;
  const add = () => {
    if (!option || max <= 0 || missingGender) return;
    cart.add(product.productId, option.variantId ?? null, product.needsGender ? gender : null, qty, max);
    setAdded((n) => n + 1);
    cueBaby("cart-added");
  };
  // A boy and a girl: one of each in one tap
  const addBoth = () => {
    if (!option || max < 2) return;
    cart.add(product.productId, option.variantId ?? null, "boys", 1, max);
    cart.add(product.productId, option.variantId ?? null, "girls", 1, max);
    setAdded((n) => n + 1);
    cueBaby("cart-added");
  };
  const offerBoth = product.needsGender && twins === "mixed" && !!option && max >= 2;

  return (
    <div className="grid gap-6">
      <Link
        to={`/shop/s/${product.section}`}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <Back className="size-4" aria-hidden />
        {t(sectionLabel(product.section))}
      </Link>
      <div className="grid gap-6 md:grid-cols-2 md:gap-10">
        <ProductImage
          url={photo}
          alt={product.name}
          className="aspect-[4/5] w-full rounded-3xl border border-border"
        />
        <div className="grid content-start gap-5">
          <div className="grid gap-1">
            <h1 dir="auto" className="font-display text-2xl font-bold leading-tight sm:text-3xl">
              {product.name}
            </h1>
            <p className="text-2xl font-semibold text-primary tabular-nums">
              {formatMoney(product.price)}
            </p>
          </div>

          {product.hasSizes && (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">{t("Choose a size")}</legend>
              <div className="flex flex-wrap gap-2">
                {product.options.map((o) => {
                  const soldOut = o.maxQuantity <= 0;
                  const selected = chosen === (o.variantId ?? null);
                  const fit = o.name ? fits?.get(o.name) : undefined;
                  return (
                    <button
                      key={o.variantId}
                      type="button"
                      disabled={soldOut}
                      aria-pressed={selected}
                      onClick={() => {
                        setChosen(o.variantId ?? null);
                        setQuantity(null); // back to the default: 1, or 2 for twins of the same gender
                      }}
                      className={cn(
                        "min-h-11 min-w-14 rounded-full border px-4 text-sm font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-card hover:border-primary",
                        fit && !selected && !soldOut && "border-primary ring-2 ring-primary/25",
                        soldOut &&
                          "cursor-not-allowed border-dashed bg-transparent text-muted-foreground line-through opacity-60 hover:border-input",
                      )}
                    >
                      <span dir="auto">{o.name}</span>
                      {!soldOut && isLow(o.maxQuantity) && (
                        <span className="block text-[10px] font-semibold leading-3 text-amber-700 dark:text-amber-400 [[aria-pressed=true]_&]:text-primary-foreground">
                          {t("{{n}} left", { n: o.maxQuantity })}
                        </span>
                      )}
                      {fit && !soldOut && (
                        <span className="block text-[10px] font-semibold leading-3 opacity-80">
                          {fit === "now" ? t("Fits now") : t("Next size")}
                        </span>
                      )}
                      {soldOut && <span className="sr-only"> ({t("Sold out")})</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {option && isLow(option.maxQuantity) && <LowStock units={option.maxQuantity} className="-mt-2 text-sm" />}
          {product.maxPerOrder && (
            <p className="-mt-2 rounded-xl bg-shop-soft/60 px-3 py-2 text-sm text-shop-deep">
              {limitLeft > 0
                ? t("Limited piece: up to {{n}} per order, so more moms can get one.", { n: product.maxPerOrder })
                : t("You have the most per order ({{n}}) in your cart.", { n: product.maxPerOrder })}
            </p>
          )}

          {product.needsGender && (
            <div className="grid gap-2">
              <span className="text-sm font-medium">{t("For a boy or a girl?")}</span>
              <GenderChoice value={gender} onChange={setGender} />
            </div>
          )}

          <div className="grid gap-2">
            <span className="text-sm font-medium">{t("Quantity")}</span>
            <div className="flex w-fit items-center rounded-full border border-input bg-card">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 rounded-full"
                onClick={() => setQuantity(Math.max(1, qty - 1))}
                disabled={qty <= 1}
                aria-label={t("Decrease quantity")}
              >
                <Minus />
              </Button>
              <span className="w-10 text-center font-semibold tabular-nums" aria-live="polite">
                {qty}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 rounded-full"
                onClick={() => setQuantity(Math.min(max, qty + 1))}
                disabled={!option || qty >= max}
                aria-label={t("Increase quantity")}
              >
                <Plus />
              </Button>
            </div>
          </div>

          <Button
            type="button"
            size="lg"
            className="h-12 rounded-full text-base"
            onClick={add}
            disabled={!option || max <= 0 || missingGender}
          >
            <ShoppingBag />
            {product.hasSizes && !option
              ? t("Choose a size first")
              : missingGender
                ? t("Choose boy or girl")
                : t("Add to cart")}
          </Button>
          {offerBoth && (
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="-mt-1 h-12 rounded-full border-2 border-violet-400 bg-gradient-to-r from-sky-50 to-pink-50 text-base text-shop-deep dark:from-sky-950/40 dark:to-pink-950/40"
              onClick={addBoth}
            >
              👶👶 {t("One for each twin (boy and girl)")}
            </Button>
          )}
          {added > 0 && <AddedToCart key={added} kind={crawlerFor(product.section)} />}
        </div>
      </div>
    </div>
  );
}
