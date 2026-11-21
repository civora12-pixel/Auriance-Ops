import type { DB } from "../db/client.ts";

/**
 * Monotonic counters kept in app_settings. Numbers are never reused, even after
 * the newest order or movement is deleted.
 */
export function nextCounter(db: DB, key: "order_counter" | "movement_counter" | "journal_counter" | "settlement_counter"): number {
  const row = db.$client
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, '1')
       ON CONFLICT (key) DO UPDATE SET value = CAST(value AS INTEGER) + 1
       RETURNING value`,
    )
    .get(key) as { value: string | number };
  return Number(row.value);
}

export const nextOrderNumber = (db: DB) => nextCounter(db, "order_counter");
export const nextMovementNumber = (db: DB) => nextCounter(db, "movement_counter");
