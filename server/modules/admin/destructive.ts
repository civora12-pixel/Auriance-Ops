import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  deletionLogs,
  inventoryMovements,
  orderLineItems,
  orders,
} from "../../db/schema.ts";
import { AppError, mutation, query, zId } from "../../rpc/procedure.ts";
import { requireAdmin, requireAdminMode } from "../../lib/permissions.ts";
import { reverseMovementStock } from "../../lib/movements.ts";
import { releaseHeldOrders, releaseOrderStock } from "../orders.ts";
import { syncLowStockAlert } from "../../lib/notifications.ts";
import { itemLabel, lookupMaps, userName } from "../../lib/items.ts";
import { moneyFormatter } from "../../lib/settings.ts";
import { logDeletion } from "../../lib/audit.ts";
import {
  MOVEMENT_TYPE_LABELS,
  ORDER_STATUS_LABELS,
  formatMovementNumber,
  formatOrderNumber,
} from "../../../shared/constants.ts";

const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

export const destructiveRouter = {
  /**
   * Deletes a stand-alone stock movement and reverses its effect. Movements that
   * belong to an order are changed through the order (return, or delete the order).
   */
  deleteMovement: mutation({
    input: z.object({ movementId: zId }),
    handler: (ctx, args) => {
      requireAdminMode(ctx);
      const movement = ctx.db
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements._id, args.movementId))
        .get();
      if (!movement) throw new AppError("NOT_FOUND", "Movement not found");
      if (movement.orderId) {
        const order = ctx.db
          .select({ n: orders.orderNumber })
          .from(orders)
          .where(eq(orders._id, movement.orderId))
          .get();
        throw new AppError(
          "CONFLICT",
          `This movement belongs to ${formatOrderNumber(order?.n)}. Return the items or delete the order instead.`,
        );
      }
      const reversed = reverseMovementStock(ctx.db, movement);
      if (reversed?.field === "on hand")
        syncLowStockAlert(ctx.db, movement.productId, movement.variantId);

      const { productMap, variantMap } = lookupMaps(ctx.db, {
        productIds: [movement.productId],
        variantIds: [movement.variantId],
      });
      const label = itemLabel({
        productName:
          productMap.get(movement.productId)?.name ?? "Unknown product",
        variantName: movement.variantId
          ? variantMap.get(movement.variantId)?.name
          : null,
      });
      logDeletion(ctx, {
        entityType: "movement",
        entityId: movement._id,
        summary: [
          formatMovementNumber(movement.movementNumber),
          MOVEMENT_TYPE_LABELS[movement.type],
          label,
          `qty: ${signed(movement.quantityChange)}`,
          `date: ${movement.date}`,
        ].join(" | "),
        stockEffect: reversed
          ? `Reversed ${signed(movement.quantityChange)} → ${reversed.field} now ${reversed.newQty}`
          : "No stock record left to reverse",
      });
      ctx.db
        .delete(inventoryMovements)
        .where(eq(inventoryMovements._id, movement._id))
        .run();
      releaseHeldOrders(ctx);
      return null;
    },
  }),

  /** Deletes an order with its lines, history, money events and alerts, reversing its stock movements. */
  deleteOrder: mutation({
    input: z.object({ orderId: zId }),
    handler: (ctx, args) => {
      requireAdminMode(ctx);
      const order = ctx.db
        .select()
        .from(orders)
        .where(eq(orders._id, args.orderId))
        .get();
      if (!order) throw new AppError("NOT_FOUND", "Order not found");

      // An open order holds stock for its unshipped units; let it go
      // Only New orders hold stock; On hold orders wait and hold nothing
      if (order.status === "new") {
        releaseOrderStock(
          ctx,
          ctx.db
            .select()
            .from(orderLineItems)
            .where(eq(orderLineItems.orderId, order._id))
            .all(),
        );
      }
      const movements = ctx.db
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements.orderId, order._id))
        .all();
      const { productMap, variantMap } = lookupMaps(ctx.db, {
        productIds: movements.map((m) => m.productId),
        variantIds: movements.map((m) => m.variantId),
      });
      // Newest first, so later movements are undone before the ones they depend on
      movements.sort((a, b) => b.movementNumber - a.movementNumber);
      const effects: string[] = [];
      for (const movement of movements) {
        const reversed = reverseMovementStock(ctx.db, movement);
        if (!reversed) continue;
        if (reversed.field === "on hand")
          syncLowStockAlert(ctx.db, movement.productId, movement.variantId);
        const label = itemLabel({
          productName:
            productMap.get(movement.productId)?.name ?? "Unknown product",
          variantName: movement.variantId
            ? variantMap.get(movement.variantId)?.name
            : null,
        });
        effects.push(
          `${label}: reversed ${signed(movement.quantityChange)} → ${reversed.field} ${reversed.newQty}`,
        );
      }

      const money = moneyFormatter(ctx.db);
      logDeletion(ctx, {
        entityType: "order",
        entityId: order._id,
        summary: [
          formatOrderNumber(order.orderNumber),
          order.customer,
          order.orderDate,
          money(order.total),
          `status: ${ORDER_STATUS_LABELS[order.status]}`,
          order.paymentStatus === "paid" ? "paid" : "unpaid",
        ].join(" | "),
        stockEffect: effects.length
          ? effects.join("; ")
          : "No stock movements to reverse",
      });
      // Lines, history, movements, money events and notifications cascade
      ctx.db.delete(orders).where(eq(orders._id, order._id)).run();
      releaseHeldOrders(ctx);
      return null;
    },
  }),

  /** Most recent deletions, for the audit log on the Team page. */
  listDeletionLogs: query({
    input: z
      .object({ limit: z.number().int().min(1).max(500).default(100) })
      .optional()
      .default({ limit: 100 }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      const logs = ctx.db
        .select()
        .from(deletionLogs)
        .orderBy(desc(deletionLogs._creationTime))
        .limit(args.limit)
        .all();
      const { userMap } = lookupMaps(ctx.db, {
        userIds: logs.map((l) => l.deletedBy),
      });
      return logs.map((log) => ({
        ...log,
        deletedByName: userName(userMap.get(log.deletedBy)),
      }));
    },
  }),
};
