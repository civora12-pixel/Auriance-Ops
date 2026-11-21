import { useTranslation } from "react-i18next";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import MovementTab from "../_components/movement-tab.tsx";

/** Inventory → Movements: every restock, shipment, return, swap and adjustment. */
export default function MovementsPage() {
  const { t } = useTranslation();
  return (
    <PageBody>
      <PageHeader
        title={t("Movements")}
        description={t("Every restock, shipment, return, swap and adjustment, newest first.")}
      />
      <MovementTab />
    </PageBody>
  );
}
