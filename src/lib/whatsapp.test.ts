import { describe, expect, it } from "vitest";
import { backInStockMessage, orderWhatsAppMessage, whatsAppShareUrl } from "./whatsapp.ts";

const base = {
  orderDate: "2026-10-25",
  customer: "مدام ايمان محرم",
  customerPhone: "01283391731",
  address: "الجيزة - كمبوند ايون مراكز اكتوبر عمارة 4A شقة 3G",
  lineItems: [
    { quantity: 3, productName: "دفاية", variantName: "ابيض 18/24" },
    { quantity: 3, productName: "دفاية", variantName: "بيج 18/24" },
  ],
  total: 600,
  shippingFee: 70,
  repName: "هند",
  channel: "facebook" as const,
  shipmentNumber: "44011",
};

describe("WhatsApp message", () => {
  it("lays the order out like the group posts, with amounts to collect, shipping and total", () => {
    const text = orderWhatsAppMessage(base, "سيفورا كيدز");
    expect(text).toBe(
      [
        "25/10/2026",
        "مدام ايمان محرم",
        "01283391731",
        "الجيزة - كمبوند ايون مراكز اكتوبر عمارة 4A شقة 3G",
        "",
        "3 دفاية - ابيض 18/24",
        "3 دفاية - بيج 18/24",
        "",
        "670",
        "70",
        "600",
        "",
        "هند",
        "سيفورا كيدز",
        "فيسبوك",
        "44011",
      ].join("\n"),
    );
    const url = whatsAppShareUrl(text);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.split("=")[1])).toBe(text);
  });

  it("adds the second phone and notes, and writes free shipping on one line", () => {
    const text = orderWhatsAppMessage(
      {
        ...base,
        customerPhone2: "01154001922",
        notes: "الوان بناتي",
        shippingFee: 0,
        total: 1305,
        channel: "instagram",
      },
      "سيفورا كيدز",
    );
    expect(text).toContain("01283391731\n01154001922\n");
    expect(text).toContain(
      "3 دفاية - بيج 18/24\nالوان بناتي\n\n1305 والشحن مجانا\n\n",
    );
    expect(text.endsWith("انستجرام\n44011")).toBe(true);
  });

  it("adds boys or girls after the size, in Arabic", () => {
    const text = orderWhatsAppMessage(
      {
        ...base,
        lineItems: [
          { quantity: 1, productName: "سلوبيت كم", variantName: "6-12", gender: "boys" },
          { quantity: 2, productName: "سلوبيت كت", variantName: "0-3", gender: "girls" },
          { quantity: 1, productName: "واصلة سلوبيت", gender: null },
        ],
      },
      "سيفورا كيدز",
    );
    expect(text).toContain(
      "1 سلوبيت كم - 6-12 - أولادي\n2 سلوبيت كت - 0-3 - بناتي\n1 واصلة سلوبيت\n",
    );
  });

  it("writes the back-in-stock message with each item in bold", () => {
    const text = backInStockMessage([
      { productName: "دفاية بينك", variantName: "24-30", units: 2 },
      { productName: "طاقيه", variantName: null, units: 1 },
    ]);
    expect(text.startsWith("🟢🔔 *رجع متاح للبيع*\n")).toBe(true);
    expect(text).toContain("\n*• دفاية بينك - 24-30 (2 قطع)*\n*• طاقيه (1 قطعة)*\n");
  });
});
