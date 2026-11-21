import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils.ts";
import { GENDER_LABELS } from "@shared/constants.ts";
import type { Gender } from "@shared/constants.ts";

/** Text color for a size picked for boys (light blue) or girls (pink). */
export const GENDER_TEXT: Record<Gender, string> = {
  boys: "text-sky-600 dark:text-sky-400",
  girls: "text-pink-600 dark:text-pink-400",
};

/** Small "Boys" / "Girls" tag in the same color, readable on black-and-white prints too. */
export function GenderBadge({
  gender,
  className,
}: {
  gender: Gender | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!gender) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold [print-color-adjust:exact]",
        gender === "boys"
          ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
          : "border-pink-500/40 bg-pink-500/10 text-pink-700 dark:text-pink-300",
        className,
      )}
    >
      {t(GENDER_LABELS[gender])}
    </span>
  );
}
