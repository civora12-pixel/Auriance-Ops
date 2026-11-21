import { paymentAccounts } from "../lib/ledger.ts";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { orders } from "../db/schema.ts";
import type { Order } from "../db/schema.ts";
import { AppError, mutation, zId } from "../rpc/procedure.ts";
import type { Ctx } from "../rpc/procedure.ts";
import { requireEdit } from "../lib/permissions.ts";
import { eventInstant } from "../lib/time.ts";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "../../shared/constants.ts";
import type { PaymentMethod } from "../../shared/constants.ts";
import { addHistory, mustGetOrder } from "./orders.ts";

const MAX_BULK = 200;
const zPaidAt = z.string().max(40).optional();
const zMethod = z.enum(PAYMENT_METHODS).optional();
/** The account the money arrived in (any asset account you can post to, e.g. QNB, Cash, a custody account) */
const zAccount = zId.optional();

/** The chosen account, checked: an active, non-automatic asset account. */
function receivingAccount(ctx: Ctx, accountId: string | undefined) {
  if (!accountId) return null;
  // Cash, custody, banks and wallets
  const account = paymentAccounts(ctx.db).find(
    (a) => a._id === accountId && a.type === "asset" && a.code >= 10000 && a.code < 15000,
  );
  if (!account) throw new AppError("BAD_REQUEST", "Choose the account the money arrived in");
  return account;
}

function markOrderPaid(
  ctx: Ctx,
  order: Order,
  paidAt: string,
  method: PaymentMethod | undefined,
  account: { _id: string; name: string } | null,
): void {
  if (order.status === "cancelled") throw new AppError("BAD_REQUEST", "Cancelled orders can't be marked as paid");
  ctx.db
    .update(orders)
    .set({
      paymentStatus: "paid",
      paidAt,
      paidAmount: order.total,
      paymentMethod: method ?? null,
      paidAccountId: account?._id ?? null,
    })
    .where(eq(orders._id, order._id))
    .run();
  const how = [method ? PAYMENT_METHOD_LABELS[method] : null, account?.name].filter(Boolean).join(", ");
  addHistory(ctx, order._id, order.status, how ? `Marked paid (${how})` : "Marked paid");
}

export const paymentsRouter = {
  /** Sets one order's payment status from the order page. */
  setPayment: mutation({
    input: z.object({
      orderId: zId,
      status: z.enum(["paid", "unpaid"]),
      paidAt: zPaidAt,
      method: zMethod,
      accountId: zAccount,
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "finance");
      const order = mustGetOrder(ctx, args.orderId);
      if (args.status === "unpaid") {
        // Allowed on cancelled orders too, so a refunded payment can be undone
        if (order.paymentStatus === "unpaid") return null;
        if (order.settlementId) {
          throw new AppError(
            "BAD_REQUEST",
            "This order was paid through a courier settlement. Undo the settlement instead.",
          );
        }
        ctx.db
          .update(orders)
          .set({ paymentStatus: "unpaid", paidAt: null, paidAmount: null, paymentMethod: null, paidAccountId: null })
          .where(eq(orders._id, order._id))
          .run();
        addHistory(ctx, order._id, order.status, "Marked unpaid");
        return null;
      }
      markOrderPaid(ctx, order, eventInstant(ctx, args.paidAt, "paid date"), args.method, receivingAccount(ctx, args.accountId));
      return null;
    },
  }),

  /** Bulk "Mark as paid" from the Orders list. Already-paid and cancelled orders are skipped. */
  markPaid: mutation({
    input: z.object({
      orderIds: z
        .array(zId)
        .min(1, "Select at least one order")
        .max(MAX_BULK, `Select at most ${MAX_BULK} orders at a time`),
      paidAt: zPaidAt,
      method: zMethod,
      accountId: zAccount,
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "finance");
      const paidAt = eventInstant(ctx, args.paidAt, "paid date");
      const account = receivingAccount(ctx, args.accountId);
      let updated = 0;
      for (const orderId of new Set(args.orderIds)) {
        const order = ctx.db.select().from(orders).where(eq(orders._id, orderId)).get();
        if (!order || order.paymentStatus === "paid" || order.status === "cancelled") continue;
        markOrderPaid(ctx, order, paidAt, args.method, account);
        updated++;
      }
      return { updated };
    },
  }),
};
