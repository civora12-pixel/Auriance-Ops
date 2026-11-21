import { describe, expect, it } from "vitest";
import { checkPromo, normalizeCode, randomCode } from "./promo.ts";
import type { PromoRule } from "./promo.ts";

const rule = (r: Partial<PromoRule>): PromoRule => ({
  kind: "percent",
  value: 10,
  maxDiscount: null,
  minOrder: null,
  startsAt: null,
  endsAt: null,
  active: true,
  maxUses: null,
  oncePerCustomer: true,
  section: null,
  ...r,
});
const cart = (goods: number, extra: Partial<Parameters<typeof checkPromo>[1]> = {}) => ({
  goods,
  sectionGoods: goods,
  shippingFee: 70,
  now: new Date("2026-11-20T10:00:00Z"),
  uses: 0,
  usedByThisCustomer: false,
  ...extra,
});

describe("promo codes", () => {
  it("takes a % off, up to its cap, or a fixed amount, never more than the goods", () => {
    expect(checkPromo(rule({ value: 15 }), cart(1000))).toEqual({ ok: true, discount: 150, freeShipping: false });
    expect(checkPromo(rule({ value: 15, maxDiscount: 100 }), cart(1000))).toMatchObject({ discount: 100 });
    expect(checkPromo(rule({ kind: "amount", value: 50 }), cart(1000))).toMatchObject({ discount: 50 });
    expect(checkPromo(rule({ kind: "amount", value: 500 }), cart(300))).toMatchObject({ discount: 300 });
    expect(checkPromo(rule({ kind: "free_shipping" }), cart(300))).toEqual({ ok: true, discount: 0, freeShipping: true });
  });

  it("checks dates, the minimum order, uses and the section", () => {
    expect(checkPromo(rule({ active: false }), cart(1000))).toMatchObject({ ok: false, reason: "This code isn't active" });
    expect(checkPromo(rule({ startsAt: "2026-11-21T00:00:00Z" }), cart(1000))).toMatchObject({ reason: "This code isn't valid yet" });
    expect(checkPromo(rule({ endsAt: "2026-11-19T00:00:00Z" }), cart(1000))).toMatchObject({ reason: "This code has expired" });
    expect(checkPromo(rule({ minOrder: 500 }), cart(380))).toMatchObject({ reason: "Add {{amount}} more to use this code", vars: { amount: 120 } });
    expect(checkPromo(rule({ maxUses: 100 }), cart(1000, { uses: 100 }))).toMatchObject({ reason: "This code has already been used up" });
    expect(checkPromo(rule({}), cart(1000, { usedByThisCustomer: true }))).toMatchObject({ reason: "You've already used this code" });
    expect(checkPromo(rule({ oncePerCustomer: false }), cart(1000, { usedByThisCustomer: true }))).toMatchObject({ ok: true });
    // A section code discounts only that section's goods
    expect(checkPromo(rule({ value: 20, section: "women" }), cart(1000, { sectionGoods: 400 }))).toMatchObject({ discount: 80 });
    expect(checkPromo(rule({ section: "women" }), cart(1000, { sectionGoods: 0 }))).toMatchObject({ ok: false });
  });

  it("reads codes the same whatever the capitals, and makes readable random ones", () => {
    expect(normalizeCode(" eid 2026 ")).toBe("EID2026");
    const c = randomCode("vip", () => 0.5);
    expect(c).toMatch(/^VIP-[A-Z2-9]{6}$/);
    expect(c.slice(4)).not.toMatch(/[01IO]/);
  });
});
