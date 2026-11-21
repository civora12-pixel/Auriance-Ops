import { describe, expect, it } from "vitest";
import { estimateAgeMonths, monthsBetween, parseMonths, sizeFit, sizeFits } from "./shop-age.ts";

describe("parseMonths", () => {
  it("reads common baby size names", () => {
    expect(parseMonths("0-3")).toEqual({ from: 0, to: 3 });
    expect(parseMonths("3-6M")).toEqual({ from: 3, to: 6 });
    expect(parseMonths("6 - 12 months")).toEqual({ from: 6, to: 12 });
    expect(parseMonths("18/24")).toEqual({ from: 18, to: 24 });
    expect(parseMonths("٦-٩ شهور")).toEqual({ from: 6, to: 9 });
    expect(parseMonths("1-2 years")).toEqual({ from: 12, to: 24 });
    expect(parseMonths("Newborn")).toEqual({ from: 0, to: 1 });
    expect(parseMonths("12M")).toEqual({ from: 9, to: 12 });
  });

  it("ignores sizes that aren't ages", () => {
    expect(parseMonths("S")).toBeNull();
    expect(parseMonths("XL")).toBeNull();
    expect(parseMonths("42")).toBeNull();
    expect(parseMonths(null)).toBeNull();
    expect(parseMonths("12-6")).toBeNull();
  });
});

describe("estimateAgeMonths", () => {
  it("grows the given age with time", () => {
    expect(monthsBetween("2026-01-01", "2026-07-02")).toBeCloseTo(5.98, 1);
    const age = estimateAgeMonths({ answer: { months: 2, day: "2026-01-01" }, today: "2026-07-02" });
    expect(age).toBeCloseTo(8, 0);
  });

  it("uses the latest purchase, smallest size that day", () => {
    // Bought 0-3 (and 3-6 ahead) half a year ago: about 7.5 months now, so 6-9 fits
    const age = estimateAgeMonths({
      purchases: [
        { size: "0-3", day: "2026-01-01" },
        { size: "3-6", day: "2026-01-01" },
        { size: "S", day: "2026-02-01" },
      ],
      today: "2026-07-02",
    })!;
    expect(age).toBeGreaterThan(7);
    expect(age).toBeLessThan(8);
    expect(sizeFit("6-9", age)).toBe("now");
    expect(sizeFit("9-12", age)).toBe("next");
    expect(sizeFit("0-3", age)).toBeNull();
    expect(sizeFit("18/24", age)).toBeNull();
  });

  it("marks only the next range up as the next size", () => {
    const fits = sizeFits(["0-3", "3-6", "6-9", "9-12", "S"], 4.5);
    expect(Object.fromEntries(fits)).toEqual({ "3-6": "now", "6-9": "next" });
    // Nothing fits now: the closest range ahead, if it starts within 6 months
    expect(Object.fromEntries(sizeFits(["6-12", "12-18"], 3))).toEqual({ "6-12": "next" });
    expect(Object.fromEntries(sizeFits(["18/24"], 3))).toEqual({});
  });

  it("knows nothing without an answer or baby sizes", () => {
    expect(estimateAgeMonths({ purchases: [{ size: "M", day: "2026-01-01" }], today: "2026-02-01" })).toBeNull();
  });
});
