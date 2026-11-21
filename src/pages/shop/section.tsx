import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { matchesSearch } from "@shared/search.ts";
import { OLD_SHOP_SECTIONS } from "@shared/constants.ts";
import { Input } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";
import { useBabyAge } from "./_lib/baby-age.ts";
import { SECTION_BLURBS, SHOP_SECTIONS, audienceRank, isKids, isShopSection, productFit, sectionLabel } from "./_lib/sections.ts";
import { useCatalog } from "./_lib/shop-api.ts";
import { BabyAgeCard } from "./_components/baby-age-card.tsx";
import { ShoppingForCard } from "./_components/shopping-for-card.tsx";
import { BIRTHDAYS_ON, useShoppingFor } from "./_lib/shopping-for.ts";
import { SectionArt } from "./_components/section-art.tsx";
import { PRODUCT_GRID, ProductCard, ProductGridSkeleton } from "./_components/product-card.tsx";

/** One shop section, with tabs to the others. Kids sections put the sizes that fit the baby first. */
export default function ShopSectionPage() {
  const { t } = useTranslation();
  const { section } = useParams();
  const products = useCatalog();
  const { ageMonths } = useBabyAge();
  const { audiences } = useShoppingFor();
  const [search, setSearch] = useState("");

  if (section && OLD_SHOP_SECTIONS[section]) return <Navigate to={`/shop/s/${OLD_SHOP_SECTIONS[section]}`} replace />;
  if (!isShopSection(section)) return <Navigate to="/shop" replace />;
  const kids = isKids(section);

  const shown = (products ?? [])
    .filter((p) => p.section === section)
    .filter((p) => matchesSearch(`${p.name} ${p.options.map((o) => o.name ?? "").join(" ")}`, search))
    .map((p) => ({ p, fit: productFit(p, ageMonths) }));
  // Fits now first, then the next size up, then everything else (newest first within each)
  // Made for who they shop for first (the other gender last), then by fit
  const rank = (f: (typeof shown)[number]["fit"]) => (f?.fit === "now" ? 0 : f?.fit === "next" ? 1 : 2);
  shown.sort((a, b) => audienceRank(a.p, audiences) - audienceRank(b.p, audiences) || rank(a.fit) - rank(b.fit));

  return (
    <div className="grid gap-6">
      <nav aria-label={t("Shop sections")} className="-mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          {SHOP_SECTIONS.map((s) => (
            <li key={s}>
              <Link
                to={`/shop/s/${s}`}
                aria-current={s === section ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center rounded-full border px-5 text-sm font-semibold whitespace-nowrap transition-colors",
                  s === section
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary",
                )}
              >
                {t(sectionLabel(s))}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-3 sm:flex sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <SectionArt section={section} />
          <div>
            <h1 className="font-display text-3xl font-bold text-shop-deep sm:text-4xl">{t(sectionLabel(section))}</h1>
            <p className="text-muted-foreground">{t(SECTION_BLURBS[section])}</p>
          </div>
        </div>
        <div className="relative sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search products")}
            aria-label={t("Search products")}
            className="h-11 rounded-full bg-card ps-9 text-base sm:text-sm"
          />
        </div>
      </div>

      {kids && products !== undefined && (BIRTHDAYS_ON ? shown.some((x) => x.p.hasSizes) && <BabyAgeCard /> : <ShoppingForCard />)}

      {products === undefined ? (
        <ProductGridSkeleton />
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          {search ? t("No products match your search.") : t("New pieces are on the way. Check back soon!")}
        </p>
      ) : (
        <ul className={PRODUCT_GRID}>
          {shown.map(({ p, fit }) => (
            <li key={p.productId}>
              <ProductCard product={p} fit={fit} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
