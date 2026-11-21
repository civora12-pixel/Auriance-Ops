import { useTranslation } from "react-i18next";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import OverviewTab from "./_components/overview-tab.tsx";

/** Finance → Overview: profit and loss for a period. */
export default function Finance() {
  const { t } = useTranslation();
  return (
    <PageBody>
      <PageHeader
        title={t("Finance overview")}
        description={t("Profit and loss from the journal, what's coming due, and accounting exports")}
      />
      <OverviewTab />
    </PageBody>
  );
}
