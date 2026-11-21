import { useTranslation } from "react-i18next";
import type { Gender } from "@shared/constants.ts";
import { cn } from "@/lib/utils.ts";

/** "For a boy or a girl?": two big pills. */
export function GenderChoice({
  value,
  onChange,
  size = "md",
}: {
  value: Gender | null;
  onChange: (gender: Gender) => void;
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  const options: { value: Gender; label: string; on: string }[] = [
    { value: "boys", label: t("Boy"), on: "border-sky-500 bg-sky-500 text-white" },
    { value: "girls", label: t("Girl"), on: "border-pink-500 bg-pink-500 text-white" },
  ];
  return (
    <div role="radiogroup" aria-label={t("For a boy or a girl?")} className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full border font-medium transition-colors",
            size === "md" ? "min-h-11 min-w-20 px-4 text-sm" : "min-h-9 min-w-16 px-3 text-xs",
            value === o.value ? o.on : "border-input bg-card hover:border-primary",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
