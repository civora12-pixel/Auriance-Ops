import { asc, isNull } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { returnArrivals } from "../db/schema.ts";
import type { Ctx } from "../rpc/procedure.ts";
import { getProduct, getVariant } from "./items.ts";
import { availableQty, findInventoryRow } from "./movements.ts";

/** A batch left unannounced this long after its last return is flagged. */
export const ANNOUNCE_REMINDER_MINUTES = 40;

/**
 * Remembers units a return put back in stock, with what was free to sell just
 * before, so the next "back in stock" message can list the sold-out items.
 */
export function noteReturnArrival(
  ctx: Pick<Ctx, "db" | "now" | "user">,
  item: { productId: string; variantId: string | null; quantity: number; freeBefore: number },
): void {
  if (item.quantity <= 0) return;
  ctx.db
    .insert(returnArrivals)
    .values({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      freeBefore: item.freeBefore,
      at: ctx.now.toISOString(),
      userId: ctx.user._id,
    })
    .run();
}

export type BackInStockItem = { productName: string; variantName: string | null; units: number };

/**
 * Returns not announced yet, as the message will list them: only items that
 * were sold out before the batch's first return, with the units still free to
 * sell now (waiting orders and new sales take theirs first).
 */
export function pendingBackInStock(db: DB, now: Date) {
  const rows = db.select().from(returnArrivals).where(isNull(returnArrivals.announcedAt)).orderBy(asc(returnArrivals.at)).all();
  const groups = new Map<string, { productId: string; variantId: string | null; returned: number; freeBefore: number }>();
  for (const r of rows) {
    const key = `${r.productId}|${r.variantId ?? ""}`;
    const g = groups.get(key);
    if (g) g.returned += r.quantity;
    // The first return of the batch tells whether the item was sold out
    else groups.set(key, { productId: r.productId, variantId: r.variantId, returned: r.quantity, freeBefore: r.freeBefore });
  }
  const items: BackInStockItem[] = [];
  for (const g of groups.values()) {
    if (g.freeBefore > 0) continue;
    const row = findInventoryRow(db, g.productId, g.variantId);
    if (!row) continue;
    const units = Math.min(g.returned, availableQty(row));
    if (units <= 0) continue;
    const product = getProduct(db, g.productId);
    if (!product) continue;
    const variant = g.variantId ? getVariant(db, g.variantId) : undefined;
    items.push({ productName: product.name, variantName: variant?.name ?? null, units });
  }
  items.sort((a, b) => a.productName.localeCompare(b.productName, "ar") || (a.variantName ?? "").localeCompare(b.variantName ?? "", "ar", { numeric: true }));
  const lastAt = rows.at(-1)?.at ?? null;
  const minutes = lastAt ? Math.floor((now.getTime() - Date.parse(lastAt)) / 60_000) : 0;
  return {
    items,
    units: items.reduce((s, i) => s + i.units, 0),
    /** Newest return in the batch: announcing clears everything up to it. */
    upTo: lastAt,
    minutesSinceLast: minutes,
    overdue: items.length > 0 && minutes >= ANNOUNCE_REMINDER_MINUTES,
  };
}
