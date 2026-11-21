import { useTranslation } from "react-i18next";
import { NotFoundState } from "@/components/states.tsx";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <NotFoundState
        title={t("Page not found")}
        description={t(
          "The page you're looking for doesn't exist or has moved.",
        )}
      />
    </div>
  );
}
