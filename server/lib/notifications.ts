import { eq, lt } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import {
  notifications,
  productVariants,
  products,
  users,
} from "../db/schema.ts";
import type { Order } from "../db/schema.ts";
import { canView } from "./permissions.ts";
import { findInventoryRow, updateInventory } from "./movements.ts";
import { formatOrderNumber } from "../../shared/constants.ts";
import type { NotificationType, Section } from "../../shared/constants.ts";

type Alert = {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  orderId?: string;
  /** Who did it; their own copy arrives already read, as a confirmation in the shared feed. */
  actorId?: string;
};

/** Sends one alert to every active admin and every active user with access to the section, the person who did it included. */
export function notify(
  db: DB,
  section: Section,
  alert: Alert,
  linkFor?: (user: typeof users.$inferSelect) => string,
): void {
  const recipients = db
    .select()
    .from(users)
    .where(eq(users.isActive, true))
    .all();
  const createdAt = new Date().toISOString();
  const rows = recipients
    .filter((u) => canView(u, section))
    .map((u) => ({
      userId: u._id,
      type: alert.type,
      title: alert.title,
      body: alert.body,
      link: linkFor ? linkFor(u) : (alert.link ?? null),
      orderId: alert.orderId ?? null,
      actorId: alert.actorId ?? null,
      read: alert.actorId !== undefined && u._id === alert.actorId,
      createdAt,
    }));
  if (rows.length) db.insert(notifications).values(rows).run();
}

/** Notifications are kept for 30 days, then deleted. */
const KEEP_DAYS = 30;

export function pruneNotifications(db: DB, now = new Date()): number {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString();
  return db
    .delete(notifications)
    .where(lt(notifications.createdAt, cutoff))
    .run().changes;
}

const ORDER_ALERTS = {
  order_new: "New order",
  order_shipped: "Order shipped",
  order_returned: "Order returned",
  order_swapped: "Order swapped",
  order_cancelled: "Order cancelled",
  order_on_hold: "On hold, waiting for stock",
  order_released: "Stock arrived, order moved to New",
} as const satisfies Partial<Record<NotificationType, string>>;

export function notifyOrder(
  db: DB,
  actorId: string,
  type: keyof typeof ORDER_ALERTS,
  order: Order,
  detail?: string,
): void {
  notify(db, "orders", {
    actorId,
    type,
    title: `${ORDER_ALERTS[type]}: ${formatOrderNumber(order.orderNumber)}`,
    body: detail ?? order.customer,
    link: `/orders/${order._id}`,
    orderId: order._id,
  });
}

/**
 * Call after any on-hand change. Alerts once when an active item drops below its
 * reorder threshold, and re-arms when it goes back to or above it.
 */
export function syncLowStockAlert(
  db: DB,
  productId: string,
  variantId: string | null | undefined,
): void {
  const row = findInventoryRow(db, productId, variantId);
  const product = db
    .select()
    .from(products)
    .where(eq(products._id, productId))
    .get();
  if (!row || !product) return;
  const variant = variantId
    ? db
        .select()
        .from(productVariants)
        .where(eq(productVariants._id, variantId))
        .get()
    : undefined;

  const active =
    product.isActive && (!variantId || (variant?.isActive ?? false));
  const isLow = active && row.onHand < product.reorderThreshold;
  if (isLow && !row.lowStockAlerted) {
    const label = variant ? `${product.name} – ${variant.name}` : product.name;
    updateInventory(db, row._id, { lowStockAlerted: true });
    notify(
      db,
      "inventory",
      {
        type: "low_stock",
        title: `Low stock: ${label}`,
        body: `${row.onHand} ${product.uom} left, reorder at ${product.reorderThreshold}`,
      },
      // Users without Products access land on the stock table instead
      (u) =>
        canView(u, "inventory")
          ? `/products/${productId}`
          : `/inventory?search=${encodeURIComponent(product.sku)}`,
    );
  } else if (!isLow && row.lowStockAlerted) {
    updateInventory(db, row._id, { lowStockAlerted: false });
  }
}
