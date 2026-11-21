import { deletionLogs } from "../db/schema.ts";
import type { Ctx } from "../rpc/procedure.ts";
import type { DeletionEntityType } from "../../shared/constants.ts";

/** Records a permanent deletion in the audit log (kept after the record is gone). */
export function logDeletion(
  ctx: Ctx,
  entry: { entityType: DeletionEntityType; entityId: string; summary: string; stockEffect: string },
): void {
  ctx.db
    .insert(deletionLogs)
    .values({
      entityType: entry.entityType,
      entityId: entry.entityId,
      entitySummary: entry.summary,
      deletedBy: ctx.user._id,
      deletedAt: ctx.now.toISOString(),
      stockEffect: entry.stockEffect,
    })
    .run();
}
