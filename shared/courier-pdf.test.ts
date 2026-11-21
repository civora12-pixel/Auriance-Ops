import { describe, expect, it } from "vitest";
import { mergeRepeats, rowsFromStatement } from "./courier-pdf.ts";
import type { PdfGlyph } from "./courier-pdf.ts";

// The PDF draws Arabic in visual order: a word's letters come out reversed
const visual = (logical: string) => [...logical].reverse().join("");
const g = (text: string, x: number, top: number): PdfGlyph => ({
  str: /[؀-ۿ]/.test(text) ? visual(text) : text,
  x,
  top,
  width: text.length * 4,
});

const COLS = { order: 595, shipment: 560, date: 525, name: 450, area: 350, status: 283, total: 245, paid: 200, shipping: 150, due: 97, note: 23 };
const header = [
  g("الطلب", COLS.order - 10, 300),
  g("الشحنة", COLS.shipment - 12, 300),
  g("التاريخ", COLS.date - 14, 300),
  g("اليه", COLS.name - 8, 300),
  g("المحافظة", COLS.area - 16, 300),
  g("الحالة", COLS.status - 12, 300),
  g("الاجمالي", COLS.total - 16, 300),
  g("المدفوع", COLS.paid - 14, 300),
  g("الشحن", COLS.shipping - 10, 300),
  g("للعميل", COLS.due - 12, 300),
  g("ملحوظة", COLS.note - 12, 300),
];
function row(top: number, order: string, status: string[], total: string, paid: string, shipping: string, due: string) {
  return [
    g(order, COLS.order - 10, top),
    g("17-10-", COLS.date - 12, top - 4),
    g("2026", COLS.date - 8, top + 4),
    g("منى", COLS.name, top - 4),
    g("01012345678", COLS.name - 22, top + 4),
    g("القاهرة", COLS.area - 14, top),
    ...status.map((w, i) => g(w, COLS.status - 10, top - 6 + i * 4)),
    g(total, COLS.total - 6, top),
    g(paid, COLS.paid - 6, top),
    g(shipping, COLS.shipping - 4, top),
    g(due, COLS.due - 6, top),
  ];
}

describe("courier statement PDF", () => {
  it("reads each shipment's status and amounts from the table, in reading order", () => {
    const glyphs = [
      ...header,
      ...row(340, "50001", ["تم", "التسليم", "ودفع", "كلي"], "500", "500", "80", "420"),
      ...row(400, "50002", ["مرتجع", "ولم", "يدفع", "الشحن"], "300", "0", "80", "80-"),
      ...row(460, "50003", ["تم", "التسليم", "ومرتجع", "جزئى"], "600", "400", "80", "320"),
    ];
    const rows = rowsFromStatement([{ height: 792, glyphs }]);
    expect(rows.map((r) => [r.shipment, r.status, r.due, r.paid, r.shipping])).toEqual([
      ["50001", "تم التسليم ودفع كلي", 420, 500, 80],
      ["50002", "مرتجع ولم يدفع الشحن", -80, 0, 80],
      ["50003", "تم التسليم ومرتجع جزئي", 320, 400, 80],
    ]);
    expect(rows[0]).toMatchObject({ date: "17-10-2026", customer: "منى", phone: "01012345678" });
  });

  it("stops the last order at the statement's totals line", () => {
    const glyphs = [
      ...header,
      ...row(340, "50001", ["تم", "التسليم", "ودفع", "كلي"], "500", "500", "80", "420"),
      ...row(400, "50002", ["تم", "التسليم", "ودفع", "كلي"], "290", "290", "70", "220"),
      // The totals line under the table: "الإجمالي (2 أوردر)" and the sums
      g("الإجمالي", COLS.status - 40, 440),
      g("(2", COLS.status - 70, 440),
      g("أوردر)", COLS.status - 60, 440),
      g("22,260", COLS.total - 6, 440),
      g("20,100", COLS.paid - 6, 440),
      g("2,205", COLS.shipping - 4, 440),
      g("17,895", COLS.due - 6, 440),
      g("توقيع", COLS.name, 480),
    ];
    const rows = rowsFromStatement([{ height: 792, glyphs }]);
    expect(rows.map((r) => [r.shipment, r.total, r.paid, r.shipping, r.due])).toEqual([
      ["50001", 500, 500, 80, 420],
      ["50002", 290, 290, 70, 220],
    ]);
  });

  it("merges a shipment listed twice (refused, then delivered) into one delivered row", () => {
    const base = { date: "", customer: "", phone: "", total: 510 };
    const merged = mergeRepeats([
      { ...base, shipment: "1", status: "مرتجع ولم يدفع الشحن", paid: 0, shipping: 80, due: -80 },
      { ...base, shipment: "1", status: "تم التسليم ودفع كلي", paid: 510, shipping: 80, due: 430 },
    ]);
    expect(merged).toEqual([{ ...base, shipment: "1", status: "تم التسليم ودفع كلي", paid: 510, shipping: 160, due: 350 }]);
  });
});
