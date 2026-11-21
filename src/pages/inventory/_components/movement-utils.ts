import { ADJUST_REASON_LABELS } from "@shared/constants.ts";
import type { AdjustReason, MovementType } from "@shared/constants.ts";
import i18n from "@/lib/i18n.ts";

/** Reason, supplier and notes of a movement as one line. */
export function movementDetails(m: {
  reason?: string;
  supplier?: string;
  notes?: string;
  type: MovementType;
}): string {
  const parts: string[] = [];
  if (m.type === "adjustment" && m.reason)
    parts.push(
      ADJUST_REASON_LABELS[m.reason as AdjustReason]
        ? i18n.t(ADJUST_REASON_LABELS[m.reason as AdjustReason])
        : m.reason,
    );
  if (m.supplier)
    parts.push(i18n.t("Supplier: {{supplier}}", { supplier: m.supplier }));
  if (m.notes) parts.push(m.notes);
  return parts.join(" · ");
}
