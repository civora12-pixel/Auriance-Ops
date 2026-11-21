/** "2026-11" → "November 2026" (or the Arabic month name). */
export function monthLabel(month: string, language: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** A closing period's name: "November 2026", or "Up to 15 Nov 2026" for a closing on a chosen day. */
export function periodLabel(
  period: string,
  language: string,
  t: (key: string, vars?: Record<string, unknown>) => string,
  formatDay: (day: string) => string,
): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(period) ? t("Up to {{date}}", { date: formatDay(period) }) : monthLabel(period, language);
}

/** Text in a money field → number, or null when blank. */
export function moneyOrNull(text: string): number | null {
  const clean = text.replace(/,/g, "").trim();
  if (clean === "") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}
