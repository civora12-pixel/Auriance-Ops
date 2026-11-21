import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { inventory, inventoryMovements } from "../db/schema.ts";
import type { InventoryRow, Movement } from "../db/schema.ts";
import { AppError } from "../rpc/procedure.ts";
import { nextMovementNumber } from "./counters.ts";
import type { MovementType } from "../../shared/constants.ts";

/** Movement types that change the not-sellable quantity instead of on-hand stock. */
export const NOT_SELLABLE_MOVEMENT_TYPES: readonly MovementType[] = [
  "not_sellable_in",
  "write_off",
];

export function affectsNotSellable(type: MovementType): boolean {
  return NOT_SELLABLE_MOVEMENT_TYPES.includes(type);
}

export function variantMatch(
  column: typeof inventory.variantId | typeof inventoryMovements.variantId,
  variantId: string | null | undefined,
) {
  return variantId ? eq(column, variantId) : isNull(column);
}

export function findInventoryRow(
  db: DB,
  productId: string,
  variantId: string | null | undefined,
): InventoryRow | undefined {
  return db
    .select()
    .from(inventory)
    .where(
      and(
        eq(inventory.productId, productId),
        variantMatch(inventory.variantId, variantId),
      ),
    )
    .get();
}

export function getInventoryRow(
  db: DB,
  productId: string,
  variantId: string | null | undefined,
): InventoryRow {
  const row = findInventoryRow(db, productId, variantId);
  if (!row)
    throw new AppError("NOT_FOUND", "Inventory record not found for this item");
  return row;
}

export function updateInventory(
  db: DB,
  rowId: string,
  patch: Partial<InventoryRow>,
): void {
  db.update(inventory).set(patch).where(eq(inventory._id, rowId)).run();
}

export type NewMovement = Omit<
  typeof inventoryMovements.$inferInsert,
  "movementNumber" | "_id" | "_creationTime"
>;

export function insertMovement(db: DB, movement: NewMovement): Movement {
  return db
    .insert(inventoryMovements)
    .values({ ...movement, movementNumber: nextMovementNumber(db) })
    .returning()
    .get();
}

/**
 * Damaged returns are written off straight away now. Any units still sitting
 * in the old "not sellable" pile are written off once, at their own cost.
 */
export function writeOffLeftoverNotSellable(db: DB, userId: string): number {
  const rows = db
    .select()
    .from(inventory)
    .where(sql`${inventory.notSellable} > 0`)
    .all();
  for (const row of rows) {
    insertMovement(db, {
      productId: row.productId,
      variantId: row.variantId,
      type: "write_off",
      quantityChange: -row.notSellable,
      date: new Date().toISOString(),
      userId,
      notes: "Damaged stock written off (damaged items are no longer kept)",
      unitCost: row.notSellableCost,
    });
    updateInventory(db, row._id, { notSellable: 0 });
  }
  return rows.length;
}

/** Moves units into (+) or out of (−) the "returns in transit" pool of an item. */
export function changeInTransit(
  db: DB,
  productId: string,
  variantId: string | null,
  qty: number,
  unitCost: number,
): void {
  const row = getInventoryRow(db, productId, variantId);
  const next = row.inTransit + qty;
  if (next < 0) {
    throw new AppError(
      "CONFLICT",
      `Only ${row.inTransit} unit(s) of this item are in transit`,
    );
  }
  updateInventory(db, row._id, {
    inTransit: next,
    inTransitCost: blendCost(row.inTransit, row.inTransitCost, qty, unitCost),
  });
}

export type ReverseResult = {
  field: "on hand" | "not sellable";
  newQty: number;
} | null;

/**
 * Undoes a movement's stock effect on its inventory row. Refuses (instead of
 * silently clamping to 0) when the stock it added has already been used.
 * Returns null when the item's inventory row no longer exists.
 */
export function reverseMovementStock(
  db: DB,
  movement: Movement,
): ReverseResult {
  const row = findInventoryRow(db, movement.productId, movement.variantId);
  if (!row) return null;
  const qty = movement.quantityChange;
  const cost = movement.unitCost;

  if (movement.type === "cost_correction") {
    throw new AppError(
      "CONFLICT",
      "A cost correction can't be deleted. Correct the cost again instead.",
    );
  }
  if (movement.type === "return_write_off") {
    // Written off straight away: nothing went into stock
    return { field: "on hand", newQty: row.onHand };
  }
  if (movement.type === "return_in_transit") {
    const newQty = row.inTransit - qty;
    if (newQty < 0) throw insufficient("in transit", row.inTransit, qty);
    updateInventory(db, row._id, {
      inTransit: newQty,
      inTransitCost: blendCost(row.inTransit, row.inTransitCost, -qty, cost),
    });
    return { field: "on hand", newQty: row.onHand };
  }
  if (movement.type === "transit_write_off") {
    // qty is negative (left the transit pool); put it back
    updateInventory(db, row._id, {
      inTransit: row.inTransit - qty,
      inTransitCost: blendCost(row.inTransit, row.inTransitCost, -qty, cost),
    });
    return { field: "on hand", newQty: row.onHand };
  }
  if (movement.type === "transit_received") {
    const newQty = row.onHand - qty;
    if (newQty < 0) throw insufficient("on hand", row.onHand, qty);
    updateInventory(db, row._id, {
      onHand: newQty,
      avgCost: blendCost(row.onHand, row.avgCost, -qty, cost),
      inTransit: row.inTransit + qty,
      inTransitCost: blendCost(row.inTransit, row.inTransitCost, qty, cost),
    });
    return { field: "on hand", newQty };
  }
  if (movement.type === "back_to_sellable") {
    // Moved units go back from on hand to not sellable, at the cost they moved with
    const newQty = row.onHand - qty;
    if (newQty < 0) throw insufficient("on hand", row.onHand, qty);
    updateInventory(db, row._id, {
      onHand: newQty,
      avgCost: blendCost(row.onHand, row.avgCost, -qty, cost),
      notSellable: row.notSellable + qty,
      notSellableCost: blendCost(
        row.notSellable,
        row.notSellableCost,
        qty,
        cost,
      ),
    });
    return { field: "on hand", newQty };
  }
  if (affectsNotSellable(movement.type)) {
    const newQty = row.notSellable - qty;
    if (newQty < 0) throw insufficient("not sellable", row.notSellable, qty);
    updateInventory(db, row._id, {
      notSellable: newQty,
      notSellableCost: blendCost(
        row.notSellable,
        row.notSellableCost,
        -qty,
        cost,
      ),
    });
    return { field: "not sellable", newQty };
  }
  const newQty = row.onHand - qty;
  if (newQty < 0) throw insufficient("on hand", row.onHand, qty);
  // Take the movement's value back out of (or put it back into) the weighted average
  updateInventory(db, row._id, {
    onHand: newQty,
    avgCost: blendCost(row.onHand, row.avgCost, -qty, cost),
  });
  return { field: "on hand", newQty };
}

/**
 * Weighted-average unit cost after adding `qty` units at `unitCost` (or removing
 * them, when qty is negative) to `onHand` units valued at `avgCost`.
 * With nothing left, the last average is kept for the next movement.
 */
export function blendCost(
  onHand: number,
  avgCost: number,
  qty: number,
  unitCost: number,
): number {
  const newQty = onHand + qty;
  if (newQty <= 0) return avgCost;
  return Math.max(0, (onHand * avgCost + qty * unitCost) / newQty);
}

/** Stock that can still be promised to a new order: on hand minus what open orders hold. */
export function availableQty(
  row: Pick<InventoryRow, "onHand" | "reserved">,
): number {
  return row.onHand - row.reserved;
}

/** Holds stock for an open order. Fails when other orders already hold it. */
export function reserveStock(
  db: DB,
  row: InventoryRow,
  qty: number,
  label: string,
): void {
  const available = availableQty(row);
  if (qty > available) {
    throw new AppError(
      "BAD_REQUEST",
      `Not enough stock for ${label}: ${Math.max(0, available)} available ` +
        `(${row.onHand} on hand, ${row.reserved} held for other orders), ${qty} needed`,
    );
  }
  updateInventory(db, row._id, { reserved: row.reserved + qty });
}

/** Releases stock an open order was holding (cancelled, deleted). */
export function releaseStock(
  db: DB,
  productId: string,
  variantId: string | null,
  qty: number,
): void {
  const row = findInventoryRow(db, productId, variantId);
  if (!row || qty <= 0) return;
  updateInventory(db, row._id, { reserved: Math.max(0, row.reserved - qty) });
}

/**
 * The cost at which an order's units of an item left the warehouse: the
 * weighted average of its shipment and swap-out movements for that item.
 * Returned units come back at this cost so cost of goods reverses exactly.
 */
export function issuedUnitCost(
  db: DB,
  orderId: string,
  productId: string,
  variantId: string | null,
  fallback: number,
): number {
  const issued = db
    .select({
      quantityChange: inventoryMovements.quantityChange,
      unitCost: inventoryMovements.unitCost,
    })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.orderId, orderId),
        eq(inventoryMovements.productId, productId),
        variantMatch(inventoryMovements.variantId, variantId),
        inArray(inventoryMovements.type, ["shipment", "swap_out"]),
      ),
    )
    .all();
  const units = issued.reduce((s, m) => s + Math.abs(m.quantityChange), 0);
  if (units === 0) return fallback;
  return (
    issued.reduce((s, m) => s + Math.abs(m.quantityChange) * m.unitCost, 0) /
    units
  );
}

function insufficient(field: string, current: number, qty: number): AppError {
  return new AppError(
    "CONFLICT",
    `Can't undo this movement: it would leave ${field} stock at ${current - qty}. ` +
      `Only ${current} unit(s) are ${field} now.`,
  );
}
