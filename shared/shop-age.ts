/**
 * Baby sizes are age ranges in months ("0-3", "3-6", "6-12", "18/24"…).
 * These helpers read a size name as months and estimate how old a baby is now,
 * so the shop can feature the sizes that fit today and the next range up.
 */

export type MonthRange = { from: number; to: number };

const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

/** A size name as a month range, or null when it isn't an age size. */
export function parseMonths(raw: string | null | undefined): MonthRange | null {
  if (!raw) return null;
  const s = toLatinDigits(raw).toLowerCase().trim();
  if (/\b(nb|newborn)\b|حديث/.test(s)) return { from: 0, to: 1 };
  const years = /\b(y|yr|yrs|year|years)\b|\d\s*y\b|سن[ةه]|سنين|سنوات/.test(s);
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:m|mo|months?|شهر|شهور)?\s*(?:-|–|—|\/|to|الى|إلى|:)\s*(\d+(?:\.\d+)?)/);
  const scale = years ? 12 : 1;
  if (m) {
    const a = Number(m[1]) * scale;
    const b = Number(m[2]) * scale;
    if (b > a && b <= 72) return { from: a, to: b };
    return null;
  }
  const single = s.match(/^(\d+(?:\.\d+)?)\s*(m|mo|months?|شهر|شهور|y|years?)?$/);
  if (single && single[2]) {
    const n = Number(single[1]) * (/^y/.test(single[2]) ? 12 : 1);
    if (n <= 72) return { from: Math.max(0, n - 3), to: n };
  }
  return null;
}

const DAY_MS = 24 * 3600_000;
const MONTH_DAYS = 30.44;

/** Whole months between two YYYY-MM-DD days (fractional). */
export function monthsBetween(fromDay: string, toDay: string): number {
  const ms = Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, ms / DAY_MS / MONTH_DAYS) : 0;
}

export type AgeInputs = {
  /** "How old is your baby?" answer, in months, and the day it was given. */
  answer?: { months: number; day: string } | null;
  /** Baby sizes bought, with the order day. */
  purchases?: { size: string; day: string }[];
  today: string;
};

/**
 * Estimated age in months now, or null when nothing is known.
 * A given age wins; otherwise the most recent purchase: the baby was about the
 * middle of the smallest range bought that day, and has grown since.
 */
export function estimateAgeMonths({ answer, purchases = [], today }: AgeInputs): number | null {
  if (answer && Number.isFinite(answer.months)) {
    return answer.months + monthsBetween(answer.day, today);
  }
  let latest: { range: MonthRange; day: string } | null = null;
  for (const p of purchases) {
    const range = parseMonths(p.size);
    if (!range) continue;
    if (!latest || p.day > latest.day || (p.day === latest.day && range.from < latest.range.from)) {
      latest = { range, day: p.day };
    }
  }
  if (!latest) return null;
  return (latest.range.from + latest.range.to) / 2 + monthsBetween(latest.day, today);
}

export type SizeFit = "now" | "next";

/**
 * For one product's sizes: which fit the baby now, and which is the next size
 * up (only the range right after today's, or the closest one ahead within 6 months).
 */
export function sizeFits(sizes: (string | null | undefined)[], ageMonths: number): Map<string, SizeFit> {
  const fits = new Map<string, SizeFit>();
  const ranges = sizes
    .map((name) => ({ name, range: parseMonths(name) }))
    .filter((x): x is { name: string; range: MonthRange } => !!x.name && !!x.range);
  const now = ranges.filter((x) => ageMonths >= x.range.from && ageMonths < x.range.to);
  for (const x of now) fits.set(x.name, "now");
  const after = now.length ? Math.max(...now.map((x) => x.range.to)) - 0.5 : ageMonths;
  const ahead = ranges.filter((x) => !fits.has(x.name) && x.range.from >= after);
  if (!ahead.length) return fits;
  const nextFrom = Math.min(...ahead.map((x) => x.range.from));
  if (!now.length && nextFrom - ageMonths > 6) return fits;
  for (const x of ahead) if (x.range.from === nextFrom) fits.set(x.name, "next");
  return fits;
}

/** One size on its own: fits now, or starts within the next 6 months. */
export function sizeFit(size: string | null | undefined, ageMonths: number): SizeFit | null {
  return sizeFits([size], ageMonths).get(size ?? "") ?? null;
}

/** Oldest age the shop makes suggestions for. */
export const MAX_SUGGESTION_MONTHS = 48;
