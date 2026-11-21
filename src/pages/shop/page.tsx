import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBabyAge } from "./_lib/baby-age.ts";
import { SECTION_BLURBS, SHOP_SECTIONS, crawlerFor, isKids, picksFor, productFit, sectionLabel } from "./_lib/sections.ts";
import { useCatalog } from "./_lib/shop-api.ts";
import { BabyAgeCard } from "./_components/baby-age-card.tsx";
import { ShoppingForCard } from "./_components/shopping-for-card.tsx";
import { BIRTHDAYS_ON, useShoppingFor } from "./_lib/shopping-for.ts";
import { Crawler } from "./_components/crawler.tsx";
import { PRODUCT_GRID, ProductCard, ProductGridSkeleton } from "./_components/product-card.tsx";
import { ProductImage } from "./_components/product-image.tsx";

/** Shop home: the three sections as big picture cards, and picks for the baby's age. */
export default function ShopHome() {
  const { t } = useTranslation();
  const products = useCatalog();
  const { ageMonths } = useBabyAge();

  const { kind, audiences } = useShoppingFor();
  // Picked for who they shop for (boy, girl or twins), or else for the baby's size
  const forKind = picksFor(products ?? [], audiences).map((p) => ({ p, fit: productFit(p, ageMonths) }));
  const picks = forKind.length
    ? forKind
    : (products ?? [])
        .map((p) => ({ p, fit: productFit(p, ageMonths) }))
        .filter((x) => x.fit)
        .sort((a, b) => (a.fit!.fit === b.fit!.fit ? 0 : a.fit!.fit === "now" ? -1 : 1))
        .slice(0, 8);
  const picksTitle =
    forKind.length && kind
      ? kind.twins
        ? t("Picked for your twins")
        : kind.gender === "boys"
          ? t("Picked for your boy")
          : t("Picked for your girl")
      : t("Picked for your baby");

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-shop-deep sm:text-4xl">{t("Shop")}</h1>
        <p className="text-muted-foreground">{t("Soft, comfy clothes for little ones")}</p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-3">
        {SHOP_SECTIONS.map((section) => {
          const inSection = (products ?? []).filter((p) => p.section === section);
          const cover = inSection.find((p) => p.imageUrl)?.imageUrl;
          return (
            <li key={section}>
              <Link
                to={`/shop/s/${section}`}
                className="group relative block overflow-hidden rounded-3xl border border-border bg-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                {cover ? (
                  <>
                    <ProductImage
                      url={cover}
                      alt=""
                      className="aspect-[16/10] w-full transition-transform duration-500 group-hover:scale-[1.03] sm:aspect-[4/5]"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent p-4 pt-16 text-white">
                      <h2 className="font-display text-2xl font-bold leading-tight">{t(sectionLabel(section))}</h2>
                      <p className="text-sm opacity-90">{t(SECTION_BLURBS[section])}</p>
                    </div>
                    <Crawler
                      kind={crawlerFor(section)}
                      state="idle"
                      className="absolute top-3 end-3 h-12 w-16 rounded-2xl bg-card/85 p-1.5 shadow-sm"
                    />
                  </>
                ) : (
                  // No photos yet: the section's character on the brand pink
                  <div className="flex aspect-[16/10] w-full flex-col justify-between bg-shop-band p-4 sm:aspect-[4/5]">
                    <Crawler
                      kind={crawlerFor(section)}
                      state="idle"
                      className="h-20 w-28 self-end transition-transform duration-500 group-hover:-translate-x-2 rtl:group-hover:translate-x-2 sm:mt-6 sm:h-28 sm:w-36 sm:self-center"
                    />
                    <div>
                      <h2 className="font-display text-2xl font-bold leading-tight text-shop-deep">
                        {t(sectionLabel(section))}
                      </h2>
                      <p className="text-sm text-muted-foreground">{t(SECTION_BLURBS[section])}</p>
                    </div>
                  </div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {products !== undefined && (BIRTHDAYS_ON ? products.some((p) => isKids(p.section) && p.hasSizes) && <BabyAgeCard /> : products.some((p) => isKids(p.section)) && <ShoppingForCard />)}

      {products === undefined ? (
        <ProductGridSkeleton count={4} />
      ) : picks.length > 0 ? (
        <section className="grid gap-4" aria-labelledby="picks-title">
          <h2 id="picks-title" className="font-display text-2xl font-bold text-shop-deep">
            {picksTitle}
          </h2>
          <ul className={PRODUCT_GRID}>
            {picks.map(({ p, fit }) => (
              <li key={p.productId}>
                <ProductCard product={p} fit={fit} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
