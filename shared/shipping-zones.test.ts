import { describe, expect, it } from "vitest";
import { GOVERNORATES } from "./courier-areas.ts";
import { LOWEST_SHIPPING_FEE, UNPRICED_GOVERNORATES, shippingFeeFor } from "./shipping-zones.ts";

describe("shipping fees by governorate", () => {
  it("prices every courier governorate, following the price list", () => {
    expect(UNPRICED_GOVERNORATES).toEqual([]);
    expect(GOVERNORATES.length).toBe(28);
    expect(shippingFeeFor("القاهرة")).toBe(70);
    expect(shippingFeeFor("جنوب الجيزه", "العياط")).toBe(70);
    expect(shippingFeeFor("الاسكندرية")).toBe(75);
    expect(shippingFeeFor("الجيزة", "طريق الاسكندرية الصحراوى")).toBe(75);
    expect(shippingFeeFor("الجيزة", "فيصل")).toBe(70);
    expect(shippingFeeFor("الشرقية")).toBe(80);
    expect(shippingFeeFor("السويس")).toBe(85);
    expect(shippingFeeFor("سوهاج")).toBe(95);
    expect(shippingFeeFor("أسوان")).toBe(100);
    expect(shippingFeeFor("البحر الأحمر", "الغردقة")).toBe(140);
    expect(shippingFeeFor("مدن جديده")).toBe(140);
    expect(shippingFeeFor("جنوب سيناء")).toBe(150);
    expect(shippingFeeFor("")).toBeNull();
    expect(LOWEST_SHIPPING_FEE).toBe(70);
  });
});
