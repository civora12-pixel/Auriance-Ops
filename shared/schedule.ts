/**
 * Orders the customer asked to ship later ("Delayed"). They're packed like any
 * other order; the packing queue lists them after the regular orders and
 * before On hold, with a big Delayed label and the day to ship.
 */

type MaybeDelayed = { status: string; shipOn?: string | null };

/** An open order the customer asked to ship on a later day. */
export const isDelayed = (o: MaybeDelayed): boolean =>
  !!o.shipOn && (o.status === "new" || o.status === "on_hold");

/** Whole days from `today` to the ship date (negative: the day has passed). */
export function daysUntil(shipOn: string, today: string): number {
  const ms = Date.parse(`${shipOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}
