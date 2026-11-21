import { describe, expect, it } from "vitest";
import { ageWindow, babyTier, celebration, childAgeMonths, validChildren } from "./little-ones.ts";

describe("little ones", () => {
  it("works out age, look and size window from the birthday", () => {
    const today = "2026-10-31";
    // Born Oct 1 this year: one month old, a newborn, sizes 0–3
    const a = childAgeMonths("2026-10-01", today);
    expect(a).toBeGreaterThan(0.9);
    expect(a).toBeLessThan(1.1);
    expect(babyTier(a)).toBe(0);
    expect(ageWindow(a)).toEqual({ from: 0, to: 3, unit: "months" });
    // Born Oct 31 last year: exactly 12 months, first steps, sizes 12–15
    const b = childAgeMonths("2025-10-31", today);
    expect(b).toBe(12);
    expect(babyTier(b)).toBe(3);
    expect(ageWindow(b)).toEqual({ from: 12, to: 15, unit: "months" });
    expect(babyTier(childAgeMonths("2024-05-01", today))).toBe(4);
    expect(babyTier(4)).toBe(1);
    expect(babyTier(8)).toBe(2);
  });

  it("celebrates birthdays (for 3 days) and the first monthiversaries", () => {
    expect(celebration("2025-10-31", "2026-10-31")).toEqual({ kind: "birthday", years: 1 });
    expect(celebration("2025-10-29", "2026-10-31")).toEqual({ kind: "birthday", years: 1 });
    expect(celebration("2025-10-20", "2026-10-31")).toBeNull();
    expect(celebration("2026-04-30", "2026-10-31")).toEqual({ kind: "months", months: 6 });
    expect(celebration("2026-10-31", "2026-10-31")).toBeNull();
    // Across the new year
    expect(celebration("2024-12-30", "2026-01-01")).toEqual({ kind: "birthday", years: 1 });
  });

  it("accepts real birthdays only", () => {
    const today = "2026-10-31";
    expect(validChildren([{ id: "a", birthday: "2026-01-02", gender: "girls", name: " Malak " }], today)).toEqual([
      { id: "a", birthday: "2026-01-02", gender: "girls", name: "Malak", twins: null },
    ]);
    expect(validChildren([{ id: "a", birthday: "2027-01-02", gender: null }], today)).toBeNull();
    expect(validChildren([{ id: "a", birthday: "2019-01-02", gender: null }], today)).toBeNull();
    expect(validChildren([{ id: "a", birthday: "2026-02-30", gender: null }], today)).toBeNull();
  });
});

describe("twins", () => {
  it("keeps twins and their genders, and turns them into two babies", async () => {
    const { validChildren, parseChildren, babiesOf } = await import("./little-ones.ts");
    const list = validChildren(
      [
        { id: "a", name: "Ali & Omar", birthday: "2026-03-01", gender: "girls", twins: "boys" },
        { id: "b", name: null, birthday: "2026-03-01", gender: "boys", twins: "mixed" },
        { id: "c", name: null, birthday: "2026-03-01", gender: "girls", twins: "triplets" },
      ],
      "2026-11-07",
    )!;
    // Same-gender twins take the twins' gender; mixed twins have none; nonsense is a single child
    expect(list.map((c) => [c.gender, c.twins])).toEqual([
      ["boys", "boys"],
      [null, "mixed"],
      ["girls", null],
    ]);
    expect(list.map(babiesOf)).toEqual([["boys", "boys"], ["boys", "girls"], ["girls"]]);
    // Saved lists from before twins read back as single children
    expect(parseChildren(JSON.stringify([{ id: "x", name: null, birthday: "2026-01-01", gender: "boys" }]))[0]).toMatchObject({ twins: null });
  });
});
