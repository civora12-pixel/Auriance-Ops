import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PackageMinus, PackagePlus, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { useCurrentUser } from "@/lib/auth.tsx";
import RestockDialog from "./_components/restock-dialog.tsx";
import BulkRestockDialog from "./_components/bulk-restock-dialog.tsx";
import StockTab from "./_components/stock-tab.tsx";
import AdjustDialog from "./_components/adjust-dialog.tsx";
import ReturnsDialog from "./_components/returns-dialog.tsx";

/** Inventory → Stock: on-hand quantities and value, plus everything that changes them. */
export default function InventoryPage() {
  const { t } = useTranslation();
  const { canEdit, canShip } = useCurrentUser();
  const canChange = canEdit("inventory");
  const [dialog, setDialog] = useState<
    "restock" | "bulk" | "adjust" | "returns" | null
  >(null);
  const dialogProps = (name: NonNullable<typeof dialog>) => ({
    open: dialog === name,
    onOpenChange: (open: boolean) => setDialog(open ? name : null),
  });

  return (
    <PageBody>
      <PageHeader
        title={t("Stock")}
        description={t(
          "On-hand stock per item, what's held for open orders, returns on the way, and its value.",
        )}
        actions={
          (canChange || canShip) && (
            <>
              {canShip && (
                <Button variant="outline" onClick={() => setDialog("returns")}>
                  <Undo2 />
                  {t("Returns")}
                </Button>
              )}
              {canChange && (
                <>
                  <Button variant="outline" onClick={() => setDialog("adjust")}>
                    <PackageMinus />
                    {t("Adjust stock")}
                  </Button>
                  <Button variant="outline" onClick={() => setDialog("bulk")}>
                    <Upload />
                    {t("Bulk restock")}
                  </Button>
                  <Button onClick={() => setDialog("restock")}>
                    <PackagePlus />
                    {t("Restock")}
                  </Button>
                </>
              )}
            </>
          )
        }
      />
      <StockTab />
      {canChange && (
        <>
          <RestockDialog {...dialogProps("restock")} />
          <BulkRestockDialog {...dialogProps("bulk")} />
          <AdjustDialog {...dialogProps("adjust")} />
        </>
      )}
      {canShip && <ReturnsDialog {...dialogProps("returns")} />}
    </PageBody>
  );
}
