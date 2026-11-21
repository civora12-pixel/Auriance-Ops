import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { products, promoCodes, promoRedemptions } from "../db/schema.ts";
import type { PromoCode } from "../db/schema.ts";
import { round2 } from "../../shared/constants.ts";
import { normalizePhone } from "../../shared/phone.ts";
import { checkPromo, normalizeCode } from "../../shared/promo.ts";
import type { PromoCheck } from "../../shared/promo.ts";

export type CartLine = { productId: string; variantId: string | null; quantity: number };

export const findPromo = (db: DB, code: string): PromoCode | undefined =>
  db.select().from(promoCodes).where(eq(promoCodes.code, normalizeCode(code))).get();

/** How many orders used a code, and whether this phone already did. */
export function promoUses(db: DB, promoId: string, phone: string | null) {
  const uses = db.select({ n: sql<number>`count(*)` }).from(promoRedemptions).where(eq(promoRedemptions.promoId, promoId)).get()?.n ?? 0;
  const mine = phone
    ? (db
        .select({ n: sql<number>`count(*)` })
        .from(promoRedemptions)
        .where(and(eq(promoRedemptions.promoId, promoId), eq(promoRedemptions.phone, normalizePhone(phone))))
        .get()?.n ?? 0)
    : 0;
  return { uses, usedByThisCustomer: mine > 0 };
}

/** The cart's goods (at today's prices), and the part from one section. */
function cartGoods(db: DB, lines: CartLine[], section: string | null) {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const rows = ids.length ? db.select().from(products).where(inArray(products._id, ids)).all() : [];
  const byId = new Map(rows.map((p) => [p._id, p]));
  let goods = 0;
  let sectionGoods = 0;
  for (const l of lines) {
    const p = byId.get(l.productId);
    if (!p) continue;
    const amount = l.quantity * p.unitPrice;
    goods += amount;
    if (!section || p.shopSection === section) sectionGoods += amount;
  }
  return { goods: round2(goods), sectionGoods: round2(sectionGoods) };
}

/**
 * Whether a code works for a cart now, and what it gives. The phone is the
 * customer's (for "once per customer"); without it that check waits for checkout.
 */
export function evaluatePromo(
  db: DB,
  input: { code: string; lines: CartLine[]; phone: string | null; shippingFee: number; now: Date },
): (PromoCheck & { promo?: PromoCode }) | { ok: false; reason: string; vars?: undefined; promo?: undefined } {
  const promo = findPromo(db, input.code);
  if (!promo) return { ok: false, reason: "We don't recognise this code" };
  const { goods, sectionGoods } = cartGoods(db, input.lines, promo.section);
  const { uses, usedByThisCustomer } = promoUses(db, promo._id, input.phone);
  const check = checkPromo(promo, { goods, sectionGoods, shippingFee: input.shippingFee, now: input.now, uses, usedByThisCustomer });
  return { ...check, promo };
}

/** The reason a code didn't work, as a sentence (amounts filled in). */
export function promoMessage(r: { reason: string; vars?: Record<string, string | number> }, money: (n: number) => string): string {
  return r.reason.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const v = r.vars?.[k];
    return typeof v === "number" ? money(v) : String(v ?? "");
  });
}
