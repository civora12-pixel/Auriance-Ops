import { z } from "zod";
import { mutation, noInput, query, zDay, zId } from "../../rpc/procedure.ts";
import { requireAdminMode, requireEdit, requireView } from "../../lib/permissions.ts";
import { checkSheet, listSettlements, postSheet, removeSettlement, sheetTotals } from "../../lib/courier.ts";

const zRows = z
  .array(
    z.object({
      shipment: z.string().trim().max(100),
      status: z.string().trim().max(200),
      due: z.number().finite().min(-1e9).max(1e9),
      customer: z.string().trim().max(200).optional(),
      treatment: z.enum(["auto", "skip"]).optional(),
      returnLines: z.array(z.object({ lineItemId: zId, quantity: z.number().int().min(0).max(1000) })).max(50).optional(),
      refund: z.number().finite().min(0).max(1e9).optional(),
      paid: z.number().finite().min(-1e9).max(1e9).nullish(),
      partial: z.enum(["pieces", "later"]).optional(),
      collected: z.number().finite().min(0).max(1e9).optional(),
    }),
  )
  .min(1, "The sheet has no rows")
  .max(2000, "Upload at most 2,000 rows at a time");

export const courierRouter = {
  /** Matches an uploaded sheet to orders, without posting anything. */
  check: query({
    input: z.object({ rows: zRows }),
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      const rows = checkSheet(ctx, args.rows);
      return { rows, totals: sheetTotals(rows) };
    },
  }),

  post: mutation({
    input: z.object({
      date: zDay,
      accountId: zId.optional(),
      fileName: z.string().trim().max(200).optional(),
      rows: zRows,
      /** What actually arrived in the bank; a difference goes to the gain/loss account */
      received: z.number().finite().min(-1e9).max(1e9).optional(),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "finance");
      return postSheet(ctx, args);
    },
  }),

  list: query({
    input: noInput,
    handler: (ctx) => {
      requireView(ctx, "finance");
      return listSettlements(ctx);
    },
  }),

  /** Admin Mode: undo a settlement posted by mistake. */
  remove: mutation({
    input: z.object({ settlementId: zId }),
    handler: (ctx, args) => {
      requireAdminMode(ctx);
      removeSettlement(ctx, args.settlementId);
      return null;
    },
  }),
};
