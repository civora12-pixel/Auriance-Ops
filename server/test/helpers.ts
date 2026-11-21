import { openDatabase } from "../db/client.ts";
import type { DB } from "../db/client.ts";
import { users } from "../db/schema.ts";
import type { User } from "../db/schema.ts";
import { ensureDefaultSettings, getTimeZone } from "../lib/settings.ts";
import { loadFinanceData, summarize } from "../lib/finance.ts";
import { loadEnv } from "../env.ts";
import { createCaller } from "../rpc/caller.ts";
import { AppError } from "../rpc/procedure.ts";
import type { Permissions } from "../../shared/constants.ts";

/** Fresh in-memory database with default settings (UTC, USD). */
export function testDb(env: Record<string, string> = {}): DB {
  const db = openDatabase(":memory:");
  ensureDefaultSettings(db, loadEnv({ APP_TIMEZONE: "UTC", APP_CURRENCY: "USD", ...env }));
  return db;
}

let n = 0;
export function addUser(db: DB, role: "admin" | "member", permissions?: Permissions): User {
  n++;
  return db
    .insert(users)
    .values({ email: `user${n}@example.com`, name: `User ${n}`, role, permissions: permissions ?? null, passwordHash: null })
    .returning()
    .get();
}

/** A mutable clock shared by callers, so tests can move time forward. */
export function clock(start = "2026-03-10T10:00:00.000Z") {
  let t = new Date(start).getTime();
  return {
    now: () => new Date(t),
    set: (iso: string) => (t = new Date(iso).getTime()),
    advance: (ms: number) => (t += ms),
  };
}

export function setup(options: { elevated?: boolean; start?: string } = {}) {
  const db = testDb();
  const time = clock(options.start);
  const admin = addUser(db, "admin");
  const api = createCaller(db, admin, {
    now: time.now,
    session: options.elevated ? { elevatedUntil: Number.MAX_SAFE_INTEGER } : {},
  });
  const as = (user: User, elevated = false) =>
    createCaller(db, user, { now: time.now, session: elevated ? { elevatedUntil: Number.MAX_SAFE_INTEGER } : {} });
  return { db, time, admin, api, as };
}

/** Runs fn and returns the AppError it throws (fails the test otherwise). */
export function appError(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("Expected an AppError");
}

/** A product with optional variants, stocked at `stock` units per line with `cost` each. */
export function stockedProduct(
  api: ReturnType<typeof setup>["api"],
  opts: { sku: string; price?: number; stock?: number; cost?: number; variants?: string[]; threshold?: number; needsGender?: boolean },
) {
  const productId = api.products.create({
    sku: opts.sku,
    name: `Product ${opts.sku}`,
    category: "General",
    unitPrice: opts.price ?? 10,
    uom: "pcs",
    reorderThreshold: opts.threshold ?? 0,
    // Off unless a test is about boys/girls lines, so orders need no gender
    needsGender: opts.needsGender ?? false,
    variants: opts.variants?.map((v) => ({ sku: `${opts.sku}-${v}`, name: v })),
  });
  const product = api.products.get({ productId })!;
  const variantIds = product.variants.map((v) => v._id);
  for (const variantId of variantIds.length ? variantIds : [undefined]) {
    if (opts.stock) {
      api.inventory.restock({ productId, variantId, restockType: "purchase", quantity: opts.stock, cost: opts.cost ?? 4 });
    }
  }
  return { productId, variantIds };
}

/** The order-and-stock profit summary (the calculation the dashboard uses), for checking order and stock math. */
export function orderSummary(db: DB, range: { fromDay: string; toDay: string }) {
  return { summary: summarize(loadFinanceData(db, range, "shipped", getTimeZone(db)), range) };
}
