// Calendar-day helpers that work in a named IANA timezone (no dependencies).
// A "day" is a YYYY-MM-DD string in the business timezone; an "instant" is an ISO string.

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of the timezone from UTC at the given instant. */
export function tzOffsetMs(timeZone: string, at: Date): number {
  const parts: Record<string, number> = {};
  for (const p of partsFormatter(timeZone).formatToParts(at)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The calendar day (YYYY-MM-DD) of an instant in the timezone. */
export function dayOf(instant: Date | string | number, timeZone: string): string {
  const d = new Date(instant);
  const shifted = new Date(d.getTime() + tzOffsetMs(timeZone, d));
  return shifted.toISOString().slice(0, 10);
}

export function todayIn(timeZone: string, now: Date = new Date()): string {
  return dayOf(now, timeZone);
}

/** The instant a calendar day starts in the timezone. */
export function zonedDayStart(day: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  // Two passes handle DST changes around midnight
  let guess = utcMidnight - tzOffsetMs(timeZone, new Date(utcMidnight));
  guess = utcMidnight - tzOffsetMs(timeZone, new Date(guess));
  return new Date(guess);
}

/** Noon on that day in the timezone — a safe instant for "this happened on day X". */
export function zonedNoon(day: string, timeZone: string): Date {
  return new Date(zonedDayStart(day, timeZone).getTime() + 12 * 3600_000);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** First day of the month, `n` months from the month of `day`. */
export function addMonths(day: string, n: number): string {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** Monday-based week start of a day. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Credit card purchases on the 1st–19th are due on the 15th of next month; from the 20th, on the 15th of the month after. */
export function creditCardDueDay(day: string): string {
  const d = Number(day.slice(8, 10));
  return `${addMonths(day, d <= 19 ? 1 : 2).slice(0, 7)}-15`;
}

/** Shipped orders are due from the courier two weeks after shipping. */
export const RECEIVABLE_DAYS = 14;

/** A wall-clock time in a time zone ("2026-11-20T10:00") as an instant. */
export function zonedTime(local: string, timeZone: string): Date {
  const [day, time = "00:00"] = local.split("T");
  const [y, mo, d] = day.split("-").map(Number);
  const [h, m] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, m);
  // Two passes handle a DST change near that time
  let guess = wall - tzOffsetMs(timeZone, new Date(wall));
  guess = wall - tzOffsetMs(timeZone, new Date(guess));
  return new Date(guess);
}

/** An instant as a wall-clock time in a time zone, for datetime-local inputs ("2026-11-20T10:00"). */
export function localTimeOf(instant: string | Date, timeZone: string): string {
  const d = new Date(instant);
  const local = new Date(d.getTime() + tzOffsetMs(timeZone, d));
  return local.toISOString().slice(0, 16);
}
