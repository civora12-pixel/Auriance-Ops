import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth.tsx";
import { addDays, dayOf, isValidDay, todayIn } from "@shared/dates.ts";

export type Formatters = ReturnType<typeof makeFormatters>;

/** Formatters bound to the business currency, locale and timezone (pure, for tests). */
export function makeFormatters(settings: { currency: string; locale: string; timezone: string }) {
  const { currency, locale, timezone } = settings;
  const money = new Intl.NumberFormat(locale, { style: "currency", currency });
  const compactMoney = new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const dayFmt = new Intl.DateTimeFormat(locale, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });
  const shortDayFmt = new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short", day: "numeric" });
  const monthFmt = new Intl.DateTimeFormat(locale, { timeZone: "UTC", year: "numeric", month: "short" });
  const dateTimeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const symbol = money.formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
  const fractionDigits = money.resolvedOptions().maximumFractionDigits ?? 2;

  const utcDay = (day: string) => new Date(`${day}T00:00:00Z`);

  return {
    currency,
    currencySymbol: symbol,
    fractionDigits,
    timezone,
    /** 1234.5 → "$1,234.50", −12 → "-$12.00" (sign placed by the locale) */
    formatMoney: (amount: number | null | undefined) => (amount == null || Number.isNaN(amount) ? "—" : money.format(amount)),
    formatMoneyCompact: (amount: number) => compactMoney.format(amount),
    formatNumber: (n: number) => number.format(n),
    /** 12.345 → "12.3%" */
    formatPercent: (pct: number | null | undefined) => (pct == null || !Number.isFinite(pct) ? "—" : percent.format(pct / 100)),
    /** A business day ("2026-03-10") → "Mar 10, 2026" */
    formatDay: (day: string | null | undefined) => {
      if (!day) return "—";
      const d = day.length > 10 ? dayOf(day, timezone) : day;
      return isValidDay(d) ? dayFmt.format(utcDay(d)) : day;
    },
    formatShortDay: (day: string) => (isValidDay(day) ? shortDayFmt.format(utcDay(day)) : day),
    /** "2026-03" → "Mar 2026" */
    formatMonth: (month: string) => monthFmt.format(utcDay(`${month}-01`)),
    /** An instant (ISO or ms) → "Mar 10, 2026, 2:15 PM" in the business timezone */
    formatDateTime: (instant: string | number | null | undefined) => {
      if (instant == null || instant === "") return "—";
      const d = new Date(instant);
      return Number.isNaN(d.getTime()) ? "—" : dateTimeFmt.format(d);
    },
    /** "3 minutes ago", "yesterday" */
    formatRelative: (instant: string | number, now = Date.now()) => {
      const diff = new Date(instant).getTime() - now;
      const abs = Math.abs(diff);
      if (abs < 60_000) return relative.format(0, "second"); // "now"
      if (abs < 3600_000) return relative.format(Math.round(diff / 60_000), "minute");
      if (abs < 86400_000) return relative.format(Math.round(diff / 3600_000), "hour");
      if (abs < 30 * 86400_000) return relative.format(Math.round(diff / 86400_000), "day");
      return dateTimeFmt.format(new Date(instant));
    },
    /** Today in the business timezone */
    today: () => todayIn(timezone),
    dayOf: (instant: string | number | Date) => dayOf(instant, timezone),
    addDays,
  };
}

/**
 * The formatting locale for the interface language: the business locale when it's
 * in that language, otherwise a default (Arabic month names with Western digits).
 */
export function localeFor(language: string, businessLocale: string): string {
  const isArabic = businessLocale.toLowerCase().startsWith("ar");
  if (language === "ar") return isArabic ? businessLocale : "ar-EG-u-nu-latn";
  return isArabic ? "en-US" : businessLocale;
}

/** Money, number and date formatting in the business's currency, locale and timezone. */
export function useFormat(): Formatters {
  const { settings } = useAuth();
  const { i18n } = useTranslation();
  const language = i18n.language;
  return useMemo(() => {
    try {
      return makeFormatters({ ...settings, locale: localeFor(language, settings.locale) });
    } catch {
      return makeFormatters({ currency: "USD", locale: language === "ar" ? "ar-EG-u-nu-latn" : "en-US", timezone: "UTC" });
    }
  }, [settings, language]);
}
