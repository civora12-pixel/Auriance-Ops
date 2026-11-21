import { KIDS_SECTIONS, SHOP_LOW_STOCK, SHOP_SECTIONS, SHOP_SECTION_LABELS, isShopSection } from "@shared/constants.ts";
import type { ShopSection } from "@shared/constants.ts";
import { sizeFits } from "@shared/shop-age.ts";
import type { SizeFit } from "@shared/shop-age.ts";
import type { CrawlerKind } from "../_components/crawler.tsx";
import type { ShopProduct } from "./shop-api.ts";

export { SHOP_SECTIONS, isShopSection };
export type { ShopSection };

export const sectionLabel = (s: ShopSection) => SHOP_SECTION_LABELS[s];

/** One line under each section's name (translated where shown). */
export const SECTION_BLURBS: Record<ShopSection, string> = {
  women: "Comfy pieces for mums",
  kids_clothes: "Soft basics and cute outfits for every day",
  kids_accessories: "Little extras that make every day easier",
};

export const isKids = (s: ShopSection) => KIDS_SECTIONS.includes(s);

/** Women's section: the logo's cherries; kids sections: the baby. */
export const crawlerFor = (s: ShopSection | undefined): CrawlerKind => (s === "women" ? "cherries" : "baby");

/** The best in-stock size match for a baby of this age: fits now beats the next size up. */
export function productFit(p: ShopProduct, ageMonths: number | null): { fit: SizeFit; size: string } | null {
  // Out of season or sold out: never suggested
  if (ageMonths === null || !isKids(p.section) || !p.hasSizes || p.offSeason || p.soldOut) return null;
  // Judged on every size, so "next" means the size after today's even when today's is sold out
  const fits = sizeFits(
    p.options.map((o) => o.name),
    ageMonths,
  );
  let best: { fit: SizeFit; size: string } | null = null;
  for (const o of p.options) {
    const fit = o.name ? fits.get(o.name) : undefined;
    if (o.maxQuantity <= 0 || !o.name || !fit) continue;
    if (fit === "now") return { fit, size: o.name };
    if (!best) best = { fit, size: o.name };
  }
  return best;
}

/** "Only 3 left": shown below SHOP_LOW_STOCK units, never the full count. */
export const isLow = (units: number) => units > 0 && units < SHOP_LOW_STOCK;

/**
 * How well a product suits who the customer shops for: 0 made for them
 * (boys / girls), 1 for boys and girls, 2 for the other gender. Nothing said: all 1.
 */
export function audienceRank(p: ShopProduct, audiences: ("boys" | "girls")[]): number {
  const a = p.audience ?? "both";
  if (!audiences.length || a === "both") return 1;
  return audiences.includes(a) ? 0 : 2;
}

/** The home page's "Picked for your boy / girl / twins": in stock, in season, made for them first. */
export function picksFor(products: ShopProduct[], audiences: ("boys" | "girls")[], max = 8): ShopProduct[] {
  const ok = products.filter((p) => isKids(p.section) && !p.soldOut && !p.offSeason);
  const made = ok.filter((p) => audienceRank(p, audiences) === 0);
  // Only once some products are tagged for them; then topped up with ones for boys and girls
  if (!made.length) return [];
  return [...made, ...ok.filter((p) => audienceRank(p, audiences) === 1)].slice(0, max);
}
