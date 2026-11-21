import { describe, expect, it } from "vitest";
import { rowsFromTable } from "./_lib.ts";

describe("courier sheet columns", () => {
  it("reads the courier's sheet as it comes", () => {
    const { rows, error } = rowsFromTable([
      ["رقم الطلب", "رقم الشحنة", "المرسل اليه", "المحافظة", "شركة الشحن", "حالة الأوردر", "الاجمالى", "المدفوع", "المستحق للعميل", "ملحوظة"],
      [42337, null, "عبدالله سيد سلام", "جنوب سيناء", "Auriance", "تم التسليم ودفع كلى", 1250, 1250, 1075, null],
      [43233, null, "أيه احمد", "الشرقية", "Auriance", "مرتجع ودفع الشحن", 820, 80, -5, null],
    ]);
    expect(error).toBeUndefined();
    expect(rows).toEqual([
      { shipment: "42337", status: "تم التسليم ودفع كلى", due: 1075, customer: "عبدالله سيد سلام" },
      { shipment: "43233", status: "مرتجع ودفع الشحن", due: -5, customer: "أيه احمد" },
    ]);
  });
  it("explains a sheet without the needed columns", () => {
    expect(rowsFromTable([["رقم الطلب", "الاسم"], [1, "x"]]).error).toBeTruthy();
  });
});
