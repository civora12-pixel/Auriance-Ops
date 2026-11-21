import { ORDER_STATUS_LABELS } from "@shared/constants.ts";
import type { OrderStatus } from "@shared/constants.ts";

export { ORDER_STATUS_LABELS as STATUS_LABELS };

/** Badge colours per order status (always shown with the label, never colour alone). */
export const STATUS_STYLES: Record<OrderStatus, string> = {
  new: "bg-secondary text-secondary-foreground border-border",
  on_hold: "bg-chart-1/15 text-chart-1 border-chart-1/40",
  shipped: "bg-chart-3/15 text-chart-3 border-chart-3/40",
  partially_returned: "bg-chart-2/15 text-chart-2 border-chart-2/40",
  returned: "bg-chart-4/15 text-chart-4 border-chart-4/40",
  swapped: "bg-chart-5/15 text-chart-5 border-chart-5/40",
  cancelled: "bg-muted text-muted-foreground border-border line-through decoration-1",
};

export function statusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderStatus] ?? status;
}

export type StockLevel = "out" | "low" | "ok";

/** Same rule as the server: out at 0, low below the reorder threshold. */
export function stockLevel(onHand: number, threshold: number): StockLevel {
  if (onHand <= 0) return "out";
  if (onHand < threshold) return "low";
  return "ok";
}

export const STOCK_LEVEL_LABELS: Record<StockLevel, string> = { out: "Out of stock", low: "Low stock", ok: "In stock" };
export const STOCK_LEVEL_STYLES: Record<StockLevel, string> = {
  out: "bg-destructive/10 text-destructive border-destructive/30",
  low: "bg-chart-1/15 text-chart-1 border-chart-1/40",
  ok: "bg-chart-3/15 text-chart-3 border-chart-3/40",
};
