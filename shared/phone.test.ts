import { describe, expect, it } from "vitest";
import { isEgyptianMobile, normalizePhone } from "./phone.ts";

describe("Egyptian mobile numbers", () => {
  it("accepts 11-digit 010/011/012/015 numbers in any digits", () => {
    expect(normalizePhone("٠١٢٨٣٣٩١٧٣١")).toBe("01283391731");
    expect(normalizePhone("+20 115 400 1922")).toBe("01154001922");
    expect(isEgyptianMobile("0101 684 0867")).toBe(true);
    expect(isEgyptianMobile("01554001922")).toBe(true);
  });
  it("rejects anything else", () => {
    for (const bad of [
      "0115400192",
      "011540019222",
      "01354001922",
      "0223456789",
      "abc",
    ])
      expect(isEgyptianMobile(bad)).toBe(false);
  });
});
