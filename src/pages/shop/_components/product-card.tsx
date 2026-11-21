import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { SizeFit } from "@shared/shop-age.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import type { ShopProduct } from "../_lib/shop-api.ts";
import { ProductImage } from "./product-image.tsx";
import { isLow } from "../_lib/sections.ts";

/** "Only 3 left", for sizes running low. */
export function LowStock({ units, className }: { units: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <p className={cn("text-xs font-semibold text-amber-700 dark:text-amber-400", className)}>
      {t("Only {{n}} left", { n: units })}
    </p>
  );
}

export function FitBadge({ fit, size, className }: { fit: SizeFit; size: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        fit === "now" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {fit === "now" ? t("Fits now") : t("Next size")}
      <span dir="ltr" className="font-normal opacity-90">
        {size}
      </span>
    </span>
  );
}

/** A product tile: photo, name, price and, for babies, which size fits. */
export function ProductCard({
  product: p,
  fit,
}: {
  product: ShopProduct;
  fit?: { fit: SizeFit; size: string } | null;
}) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const sizesInStock = p.options.filter((o) => o.maxQuantity > 0).length;
  return (
    <Link
      to={`/shop/p/${p.productId}`}
      className="group grid gap-2 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <div className="relative">
        <ProductImage
          url={p.imageUrl}
          alt={p.name}
          className="aspect-[4/5] w-full rounded-2xl border border-border transition-transform duration-300 group-hover:scale-[1.02]"
        />
        {fit && <FitBadge {...fit} className="absolute top-2 start-2 shadow-sm" />}
        {p.soldOut && (
          <span className="absolute top-2 end-2 rounded-full bg-foreground/80 px-2.5 py-1 text-xs font-semibold text-background">
            {t("Sold out")}
          </span>
        )}
      </div>
      <div className="grid gap-0.5 px-0.5">
        <h3 dir="auto" className="line-clamp-2 text-sm font-medium leading-snug sm:text-base">
          {p.name}
        </h3>
        <p className="font-semibold text-primary tabular-nums">{formatMoney(p.price)}</p>
        {p.soldOut ? null : p.hasSizes ? (
          <p className="text-xs text-muted-foreground">{t("{{n}} sizes available", { n: sizesInStock })}</p>
        ) : (
          isLow(p.options[0]?.maxQuantity ?? 0) && <LowStock units={p.options[0].maxQuantity} />
        )}
      </div>
    </Link>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid gap-2">
          <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export const PRODUCT_GRID = "grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4";
