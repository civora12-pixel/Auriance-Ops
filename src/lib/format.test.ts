import { describe, expect, it } from "vitest";
import { makeFormatters } from "./format.ts";

const usd = makeFormatters({ currency: "USD", locale: "en-US", timezone: "UTC" });
const cairo = makeFormatters({ currency: "EGP", locale: "en-US", timezone: "Africa/Cairo" });

describe("money", () => {
  it("formats with the currency and puts the sign before the symbol", () => {
    expect(usd.formatMoney(1234.5)).toBe("$1,234.50");
    expect(usd.formatMoney(-12)).toBe("-$12.00");
    expect(usd.currencySymbol).toBe("$");
  });

  it("uses the business currency, not dollars", () => {
    expect(cairo.formatMoney(10)).toContain("EGP");
    expect(cairo.formatMoney(10)).not.toContain("$");
  });

  it("shows a dash for missing amounts", () => {
    expect(usd.formatMoney(undefined)).toBe("—");
    expect(usd.formatMoney(Number.NaN)).toBe("—");
  });

  it("formats percentages and hides impossible ones", () => {
    expect(usd.formatPercent(12.345)).toBe("12.3%");
    expect(usd.formatPercent(Infinity)).toBe("—");
  });
});

describe("dates", () => {
  it("renders business days without shifting them by the browser timezone", () => {
    expect(usd.formatDay("2026-03-10")).toBe("Mar 10, 2026");
    expect(cairo.formatDay("2026-01-01")).toBe("Jan 1, 2026");
    expect(usd.formatMonth("2026-03")).toBe("Mar 2026");
  });

  it("maps an instant to the business day in the business timezone", () => {
    // 23:30 UTC on Mar 10 is already Mar 11 in Cairo (UTC+2)
    expect(cairo.dayOf("2026-03-10T23:30:00Z")).toBe("2026-03-11");
    expect(usd.dayOf("2026-03-10T23:30:00Z")).toBe("2026-03-10");
  });

  it("formats event times in the business timezone", () => {
    expect(cairo.formatDateTime("2026-03-10T10:00:00Z")).toBe("Mar 10, 2026, 12:00 PM");
    expect(usd.formatDateTime(undefined)).toBe("—");
    expect(usd.formatDateTime("not a date")).toBe("—");
  });

  it("describes recent instants relatively", () => {
    const now = Date.parse("2026-03-10T12:00:00Z");
    expect(usd.formatRelative(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(usd.formatRelative(now - 3 * 3600_000, now)).toBe("3 hours ago");
    expect(usd.formatRelative(now - 86400_000, now)).toBe("yesterday");
  });
});
