import { useState } from "react";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { api, getErrorMessage, useApiClient } from "@/lib/api.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { csvAmount, downloadCsv, fetchAllPages } from "@/lib/csv.ts";
import { useFormat } from "@/lib/format.ts";
import {
  ADJUST_REASON_LABELS,
  MOVEMENT_TYPE_LABELS,
  RESTOCK_TYPE_LABELS,
} from "@shared/constants.ts";
import type { AdjustReason, MovementType } from "@shared/constants.ts";

export type MovementFilters = {
  productId?: string;
  variantId?: string;
  types?: MovementType[];
  fromDay?: string;
  toDay?: string;
  dateBy?: "movement" | "recorded";
  search?: string;
};

/** Downloads every movement matching the current filters (all pages). */
export default function ExportMovementsButton({
  filters,
  disabled,
}: {
  filters: MovementFilters;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const client = useApiClient();
  const { canSeeCost } = useCurrentUser();
  const { formatDateTime, today } = useFormat();
  const [pending, setPending] = useState(false);

  const exportCsv = async () => {
    setPending(true);
    try {
      const items = await fetchAllPages((page, pageSize) =>
        client.query(api.inventory.listMovements, {
          ...filters,
          page,
          pageSize,
        }),
      );
      const rows = items.map((m) => ({
        [t("Movement ID")]: m.movementId,
        [t("Type")]: t(MOVEMENT_TYPE_LABELS[m.type]),
        [t("Restock Type")]: m.restockType
          ? t(RESTOCK_TYPE_LABELS[m.restockType])
          : "",
        [t("Product")]: m.productName,
        [t("Variant")]: m.variantName ?? "",
        [t("SKU")]: m.productSku,
        [t("Qty Change")]: m.quantityChange,
        [t("Date")]: formatDateTime(m.date),
        [t("Recorded at")]: formatDateTime(m._creationTime),
        [t("By")]: m.userName,
        [t("Order #")]: m.orderNumber ?? "",
        [t("Supplier")]: m.supplier ?? "",
        ...(canSeeCost && { [t("Unit Cost")]: csvAmount(m.unitCost) }),
        [t("Reason")]: m.reason
          ? t(ADJUST_REASON_LABELS[m.reason as AdjustReason] ?? m.reason)
          : "",
        [t("Notes")]: m.notes ?? "",
      }));
      downloadCsv(`stock-movements-${today()}.csv`, rows);
      toast.success(t("Exported {{count}} movements", { count: rows.length }));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={exportCsv}
      disabled={disabled || pending}
    >
      {pending ? <Spinner /> : <Download />}
      {t("Export")}
    </Button>
  );
}
