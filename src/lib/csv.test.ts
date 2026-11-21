import { describe, expect, it } from "vitest";
import { csvSafe, toCsv } from "./csv.ts";

describe("csv", () => {
  it("neutralises formulas but keeps numbers", () => {
    expect(csvSafe("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(csvSafe("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvSafe("+20 100 000")).toBe("'+20 100 000");
    expect(csvSafe("-12.50")).toBe("-12.50");
    expect(csvSafe(-3)).toBe("-3");
    expect(csvSafe("Plain")).toBe("Plain");
    expect(csvSafe(undefined)).toBe("");
  });

  it("writes headers and quotes commas", () => {
    expect(toCsv([{ Name: "A, B", Qty: 2 }])).toBe('Name,Qty\r\n"A, B",2');
  });
});
