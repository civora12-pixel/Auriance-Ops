import type { Ctx } from "../rpc/procedure.ts";
import { AppError } from "../rpc/procedure.ts";
import { getTimeZone } from "./settings.ts";
import { addDays, isValidDay, todayIn, zonedNoon } from "../../shared/dates.ts";

/** Today's calendar day in the business timezone. */
export function businessToday(ctx: Ctx): string {
  return todayIn(getTimeZone(ctx.db), ctx.now);
}

/**
 * Normalises a user-entered date to an ISO instant. A business day (YYYY-MM-DD)
 * becomes noon that day, or "now" when it's today. Dates in the future are refused.
 */
export function eventInstant(ctx: Ctx, value: string | undefined, label = "date"): string {
  if (!value) return ctx.now.toISOString();
  const tz = getTimeZone(ctx.db);
  if (isValidDay(value)) {
    const today = todayIn(tz, ctx.now);
    if (value > today) throw new AppError("BAD_REQUEST", `The ${label} can't be in the future`);
    return value === today ? ctx.now.toISOString() : zonedNoon(value, tz).toISOString();
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new AppError("BAD_REQUEST", `Enter a valid ${label}`);
  // A minute of slack for clock differences between browser and server
  if (ms > ctx.now.getTime() + 60_000) throw new AppError("BAD_REQUEST", `The ${label} can't be in the future`);
  return new Date(Math.min(ms, ctx.now.getTime())).toISOString();
}

/** Validates a business day that may be at most `maxDaysAhead` days after today. */
export function assertDay(ctx: Ctx, day: string, label: string, maxDaysAhead = 0): string {
  if (!isValidDay(day)) throw new AppError("BAD_REQUEST", `Enter a valid ${label}`);
  if (day > addDays(businessToday(ctx), maxDaysAhead)) {
    throw new AppError("BAD_REQUEST", `The ${label} can't be in the future`);
  }
  return day;
}
