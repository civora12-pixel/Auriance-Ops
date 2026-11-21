import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { Crawler } from "./crawler.tsx";
import type { CrawlerKind } from "./crawler.tsx";

/** After Add to cart: the character crawls into the bag, which pops. Still with reduced motion. */
export function AddedToCart({ kind }: { kind: CrawlerKind }) {
  const { t } = useTranslation();
  const [arrived, setArrived] = useState(false);
  const reduced =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) {
      setArrived(true);
      return;
    }
    const id = window.setTimeout(() => setArrived(true), 1100);
    return () => window.clearTimeout(id);
  }, [reduced]);

  const width = kind === "baby" ? "4.5rem" : "3.5rem";
  return (
    <div
      role="status"
      className="relative h-16 overflow-hidden rounded-2xl bg-secondary"
      style={{ ["--crawler-w" as string]: width }}
    >
      <Crawler
        kind={kind}
        state={arrived ? "waving" : "crawling"}
        className={cn("absolute top-2 h-12 w-[var(--crawler-w)]", reduced ? "start-[calc(100%-8rem)]" : "crawler-run start-0")}
      />
      <span className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-semibold text-secondary-foreground opacity-0 transition-opacity duration-300 data-[on=true]:opacity-100 rtl:translate-x-1/2" data-on={arrived}>
        {t("Added to your cart")}
      </span>
      <Link
        to="/shop/cart"
        className={cn(
          "absolute top-1/2 end-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-card text-shop-deep shadow-sm",
        )}
        aria-label={t("View cart")}
      >
        <ShoppingBag className={cn("size-6", arrived && !reduced && "crawler-bag-pop")} />
      </Link>
    </div>
  );
}
