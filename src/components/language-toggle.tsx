import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { useLanguage } from "@/components/providers/language.tsx";
import { LANGUAGES } from "@/lib/i18n.ts";
import { cn } from "@/lib/utils.ts";

/** Switches between English and Arabic; shows the language you'd switch to, in that language. */
export function LanguageToggle({
  className,
  compact,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const other = LANGUAGES.find((l) => l.code !== language)!;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("gap-1.5", className)}
      onClick={() => setLanguage(other.code)}
      aria-label={t("Switch language to {{language}}", {
        language: other.label,
      })}
      title={t("Switch language to {{language}}", { language: other.label })}
    >
      <Languages aria-hidden />
      <span lang={other.code} className={cn(compact && "hidden sm:inline")}>
        {other.label}
      </span>
    </Button>
  );
}
