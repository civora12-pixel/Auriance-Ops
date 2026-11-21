import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { csvAmount, downloadCsv } from "@/lib/csv.ts";
import { useFormat } from "@/lib/format.ts";
import { useFieldVisibility } from "@/hooks/use-field-visibility.ts";
import { STOCK_LEVEL_LABELS } from "@/lib/status.ts";
import type { StockItem } from "./stock-tab.tsx";

/** Downloads the stock rows currently shown (filters applied), with the visible columns. */
export default function ExportStockButton({
  rows,
}: {
  rows: StockItem[] | undefined;
}) {
  const { t } = useTranslation();
  const { isFieldVisible } = useFieldVisibility();
  const { today } = useFormat();

  const exportCsv = () => {
    if (!rows?.length) return;
    const show = (field: string) => isFieldVisible("inventory", field);
    const data = rows.map((i) => ({
      [t("Product")]: i.productName,
      [t("Variant")]: i.variantName ?? "",
      ...(show("sku") && { [t("SKU")]: i.sku }),
      [t("UOM")]: i.uom,
      [t("On Hand")]: i.onHand,
      [t("Returns in transit")]: i.inTransit,
      ...(show("avgCost") && { [t("Avg Cost")]: csvAmount(i.avgCost) }),
      ...(show("assetValue") && {
        [t("Asset Value")]: csvAmount(i.assetValue),
      }),
      ...(show("reorderAt") && { [t("Reorder At")]: i.reorderThreshold }),
      ...(show("status") && {
        [t("Status")]: t(STOCK_LEVEL_LABELS[i.stockStatus]),
      }),
      [t("Active")]: i.isActive ? t("Yes") : t("No"),
    }));
    downloadCsv(`stock-${today()}.csv`, data);
    toast.success(t("Exported {{count}} items", { count: rows.length }));
  };

  return (
    <Button variant="outline" onClick={exportCsv} disabled={!rows?.length}>
      <Download />
      {t("Export")}
    </Button>
  );
}
