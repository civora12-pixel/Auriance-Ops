import { useState } from "react";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { api, getErrorMessage, useApiClient } from "@/lib/api.ts";
import { csvAmount, downloadCsv } from "@/lib/csv.ts";
import { useFormat } from "@/lib/format.ts";

/** Downloads every product and variant SKU as a spreadsheet-friendly CSV. */
export default function ExportSkusButton() {
  const { t } = useTranslation();
  const client = useApiClient();
  const { today } = useFormat();
  const [busy, setBusy] = useState(false);

  const exportCsv = async () => {
    setBusy(true);
    try {
      const rows = await client.query(api.products.skuList, undefined);
      downloadCsv(
        `sku-list-${today()}.csv`,
        rows.map((r) => ({
          [t("SKU")]: r.sku,
          [t("Product")]: r.product,
          [t("Variant")]: r.variant ?? "",
          [t("Selling price")]: csvAmount(r.unitPrice),
          [t("Active")]: r.isActive ? t("Yes") : t("No"),
        })),
      );
      toast.success(t("Downloaded {{n}} SKUs", { n: rows.length }));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" onClick={() => void exportCsv()} disabled={busy}>
      {busy ? <Spinner /> : <Download />}
      {t("SKU list")}
    </Button>
  );
}
