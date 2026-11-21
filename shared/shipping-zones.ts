import { COURIER_AREAS } from "./courier-areas.ts";

/**
 * What the customer pays for shipping, by governorate (the business's own
 * price list, not the courier's cost). A few areas are priced apart from
 * their governorate.
 */
export const SHIPPING_ZONES: readonly { fee: number; governorates: readonly string[] }[] = [
  { fee: 70, governorates: ["القاهرة", "الجيزة", "جنوب الجيزه"] },
  { fee: 75, governorates: ["الاسكندرية"] },
  {
    fee: 80,
    governorates: ["كفر الشيخ", "الدقهلية", "المنوفية", "القليوبية", "البحيرة", "الغربية", "دمياط", "الشرقية"],
  },
  { fee: 85, governorates: ["الإسماعيلية", "بورسعيد", "السويس"] },
  { fee: 95, governorates: ["الفيوم", "بني سويف", "المنيا", "أسيوط", "سوهاج"] },
  { fee: 100, governorates: ["قنا", "الأقصر", "أسوان"] },
  // The courier's "مدن جديده" holds the North Coast and Matrouh centres
  { fee: 140, governorates: ["الوادي الجديد", "مرسي مطروح", "مدن جديده", "البحر الأحمر"] },
  { fee: 150, governorates: ["جنوب سيناء"] },
];

/** Areas priced apart from their governorate: [governorate, area, fee] */
export const SHIPPING_AREA_FEES: readonly (readonly [string, string, number])[] = [
  // Listed under Giza by the courier, priced with Alexandria
  ["الجيزة", "طريق الاسكندرية الصحراوى", 75],
];

const BY_GOVERNORATE = new Map(SHIPPING_ZONES.flatMap((z) => z.governorates.map((g) => [g, z.fee] as const)));

/** The customer's shipping fee for a governorate (and area), or null when it isn't priced. */
export function shippingFeeFor(governorate: string | null | undefined, city?: string | null): number | null {
  if (!governorate) return null;
  const area = SHIPPING_AREA_FEES.find(([g, c]) => g === governorate && c === city);
  if (area) return area[2];
  return BY_GOVERNORATE.get(governorate) ?? null;
}

/** The cheapest fee, for "shipping from …" before the governorate is known. */
export const LOWEST_SHIPPING_FEE = Math.min(...SHIPPING_ZONES.map((z) => z.fee));

/** Every courier governorate has a price (checked by a test). */
export const UNPRICED_GOVERNORATES = Object.keys(COURIER_AREAS).filter((g) => !BY_GOVERNORATE.has(g));
