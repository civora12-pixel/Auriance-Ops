import type { api, Output } from "@/lib/api.ts";
import {
  MONEY_EPSILON,
  RETURNABLE_STATUSES,
  SHIPPABLE_STATUSES,
  round2,
} from "@shared/constants.ts";

export type OrderDetail = NonNullable<Output<typeof api.orders.get>>;
export type OrderLine = OrderDetail["lineItems"][number];

export function lineLabel(
  line: Pick<OrderLine, "productName" | "variantName">,
): string {
  return line.variantName
    ? `${line.productName} – ${line.variantName}`
    : line.productName;
}

/** What the order allows right now (mirrors the server rules). */
export function orderState(order: OrderDetail) {
  const units = (pick: (l: OrderLine) => number) =>
    order.lineItems.reduce((sum, l) => sum + pick(l), 0);
  const shippable = SHIPPABLE_STATUSES.includes(order.status);
  const anyShipped = order.lineItems.some((l) => l.shippedQuantity > 0);
  const remainingUnits = units((l) => l.remainingToShip);
  const returnableLines = order.lineItems.filter((l) => l.returnable > 0);
  return {
    shippable,
    anyShipped,
    remainingUnits,
    shippedUnits: units((l) => l.shippedQuantity),
    orderedUnits: units((l) => (l.isSwapReplacement ? 0 : l.quantity)),
    returnableLines,
    canReturn:
      RETURNABLE_STATUSES.includes(order.status) && returnableLines.length > 0,
    isHeld: order.status === "on_hold",
    // New and On hold orders can be cancelled while nothing has shipped
    canCancel:
      (order.status === "new" || order.status === "on_hold") && !anyShipped,
    canReopen: order.status === "cancelled",
    isPaid: order.paymentStatus === "paid",
  };
}

/**
 * The refund the server would give for returning `selected` units (lineItemId → qty),
 * or `null` when it needs a manual amount (partial return on an order with a custom total).
 */
export function autoRefund(
  order: OrderDetail,
  selected: Map<string, number>,
): { amount: number | null; isFull: boolean } {
  const isFull = order.lineItems.every(
    (l) => l.returnedQuantity + (selected.get(l._id) ?? 0) >= l.shippedQuantity,
  );
  if (order.hasManualTotal)
    return { amount: isFull ? round2(order.total) : null, isFull };
  const sum = order.lineItems.reduce(
    (acc, l) => acc + (selected.get(l._id) ?? 0) * l.unitPrice,
    0,
  );
  return { amount: round2(Math.min(sum, order.total)), isFull };
}

export const isZero = (n: number) => Math.abs(n) < MONEY_EPSILON;
