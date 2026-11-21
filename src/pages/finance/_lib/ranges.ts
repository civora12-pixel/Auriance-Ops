import { addDays, addMonths, isValidDay } from "@shared/dates.ts";
import { tk } from "@/lib/i18n.ts";

/** Report periods. All are computed from "today" in the business timezone, not the browser's. */
export const RANGE_PRESETS = [
  "this_month",
  "last_month",
  "last_30",
  "last_90",
  "this_quarter",
  "this_year",
  "last_year",
  "custom",
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const PRESET_LABELS: Record<RangePreset, string> = {
  this_month: tk("This month"),
  last_month: tk("Last month"),
  last_30: tk("Last 30 days"),
  last_90: tk("Last 90 days"),
  this_quarter: tk("This quarter"),
  this_year: tk("This year"),
  last_year: tk("Last year"),
  custom: tk("Custom range"),
};

export type DayRange = { fromDay: string; toDay: string };

export function isRangePreset(value: string): value is RangePreset {
  return (RANGE_PRESETS as readonly string[]).includes(value);
}

/** The days of a preset period, ending today at the latest (no empty future days). */
export function presetRange(
  preset: Exclude<RangePreset, "custom">,
  today: string,
): DayRange {
  const monthStart = `${today.slice(0, 7)}-01`;
  const year = today.slice(0, 4);
  switch (preset) {
    case "this_month":
      return { fromDay: monthStart, toDay: today };
    case "last_month":
      return { fromDay: addMonths(today, -1), toDay: addDays(monthStart, -1) };
    case "last_30":
      return { fromDay: addDays(today, -29), toDay: today };
    case "last_90":
      return { fromDay: addDays(today, -89), toDay: today };
    case "this_quarter": {
      const month = Number(today.slice(5, 7));
      const quarterMonth = String(month - ((month - 1) % 3)).padStart(2, "0");
      return { fromDay: `${year}-${quarterMonth}-01`, toDay: today };
    }
    case "this_year":
      return { fromDay: `${year}-01-01`, toDay: today };
    case "last_year":
      return {
        fromDay: `${Number(year) - 1}-01-01`,
        toDay: `${Number(year) - 1}-12-31`,
      };
  }
}

const MAX_SPAN_DAYS = 366 * 5;

/** Same checks as the server's range validator, so a bad custom range never reaches it. Translate with t(). */
export function rangeError(range: DayRange): string | null {
  if (!isValidDay(range.fromDay) || !isValidDay(range.toDay))
    return tk("Enter valid start and end dates.");
  if (range.fromDay > range.toDay)
    return tk("The start date must be on or before the end date.");
  if (range.fromDay < addDays(range.toDay, -MAX_SPAN_DAYS))
    return tk("Pick a range of at most 5 years.");
  return null;
}
