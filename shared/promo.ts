/**
 * Promo codes for the website: what a code gives, when it works, and the
 * checks a customer's cart must pass. Used by the server (the final word) and
 * the Promo codes page (to describe a code).
 */
import { round2 } from "./constants.ts";
import type { ShopSection } from "./constants.ts";

export const PROMO_KINDS = ["percent", "amount", "free_shipping"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];
export const PROMO_KIND_LABELS: Record<PromoKind, string> = {
  percent: "% off",
  amount: "Amount off",
  free_shipping: "Free shipping",
};

export type PromoRule = {
  kind: PromoKind;
  /** Percent (1–100) or amount in EGP; unused for free shipping */
  value: number;
  /** Most a % code takes off (EGP); null = no cap */
  maxDiscount: number | null;
  /** Order (goods) must reach this (EGP); null = any order */
  minOrder: number | null;
  /** Works from / until (instants, ISO); null = no limit */
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  /** Uses in total; null = no limit (1 for each generated private code) */
  maxUses: number | null;
  /** Each phone number can use it once */
  oncePerCustomer: boolean;
  /** Only goods from this section count (and get the discount); null = the whole order */
  section: ShopSection | null;
};

/** Codes are letters (A–Z) and numbers, with dashes allowed; capitals don't matter. */
export const normalizeCode = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");
export const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,29}$/;

export type PromoCheck =
  | { ok: true; discount: number; freeShipping: boolean }
  | { ok: false; reason: string; vars?: Record<string, string | number> };

/**
 * Whether a code works for this cart right now, and what it takes off.
 * `goods` is the cart total before shipping; `sectionGoods` the part from the
 * code's section (equal to `goods` when the code has none).
 */
export function checkPromo(
  rule: PromoRule,
  cart: { goods: number; sectionGoods: number; shippingFee: number; now: Date; uses: number; usedByThisCustomer: boolean },
): PromoCheck {
  const t = cart.now.getTime();
  if (!rule.active) return { ok: false, reason: "This code isn't active" };
  if (rule.startsAt && t < Date.parse(rule.startsAt)) return { ok: false, reason: "This code isn't valid yet" };
  if (rule.endsAt && t > Date.parse(rule.endsAt)) return { ok: false, reason: "This code has expired" };
  if (rule.maxUses !== null && cart.uses >= rule.maxUses) return { ok: false, reason: "This code has already been used up" };
  if (rule.oncePerCustomer && cart.usedByThisCustomer) return { ok: false, reason: "You've already used this code" };
  if (rule.minOrder !== null && cart.goods < rule.minOrder)
    return { ok: false, reason: "Add {{amount}} more to use this code", vars: { amount: round2(rule.minOrder - cart.goods) } };
  if (rule.section && cart.sectionGoods <= 0) return { ok: false, reason: "This code is for another section of the shop" };
  if (rule.kind === "free_shipping") return { ok: true, discount: 0, freeShipping: true };
  let discount = rule.kind === "percent" ? (cart.sectionGoods * rule.value) / 100 : rule.value;
  if (rule.kind === "percent" && rule.maxDiscount !== null) discount = Math.min(discount, rule.maxDiscount);
  // Never more than the goods it applies to
  discount = round2(Math.min(discount, cart.sectionGoods));
  return { ok: true, discount, freeShipping: false };
}

/** A line describing a code, e.g. "15% off, up to EGP 100 · orders over EGP 500". Parts are i18n keys. */
export function promoParts(rule: Pick<PromoRule, "kind" | "value" | "maxDiscount" | "minOrder" | "section">) {
  const parts: { key: string; vars?: Record<string, string | number> }[] = [];
  if (rule.kind === "percent")
    parts.push(rule.maxDiscount !== null ? { key: "{{pct}}% off, up to {{max}}", vars: { pct: rule.value, max: rule.maxDiscount } } : { key: "{{pct}}% off", vars: { pct: rule.value } });
  else if (rule.kind === "amount") parts.push({ key: "{{amount}} off", vars: { amount: rule.value } });
  else parts.push({ key: "Free shipping" });
  if (rule.minOrder !== null) parts.push({ key: "orders over {{amount}}", vars: { amount: rule.minOrder } });
  return parts;
}

/** Random private codes: easy to read out (no 0/O or 1/I), e.g. EID-7F3KQ2. */
export function randomCode(prefix: string, rand: () => number = Math.random): string {
  const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += ABC[Math.floor(rand() * ABC.length)];
  const p = normalizeCode(prefix).replace(/-+$/, "");
  return p ? `${p}-${s}` : s;
}
