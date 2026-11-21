import { useTranslation } from "react-i18next";
import type { ChildGender, Twins } from "@shared/little-ones.ts";
import { cn } from "@/lib/utils.ts";

export type BabyKind = { gender: ChildGender | null; twins: Twins | null };

/**
 * "Who are we shopping for?": a boy, a girl, or twins (two boys, two girls,
 * or one of each). The artwork and the suggested pieces follow the choice.
 */
export function BabyKindChoice({
  value,
  onChange,
  twinsOpen = false,
  onOpenTwins,
}: {
  value: BabyKind;
  onChange: (v: BabyKind) => void;
  /** Show which-twins even before one is picked (with onOpenTwins: "Twins" only opens it) */
  twinsOpen?: boolean;
  onOpenTwins?: () => void;
}) {
  const { t } = useTranslation();
  const kind = value.twins || twinsOpen ? "twins" : value.gender;
  const pill = (on: boolean, color: string) =>
    cn(
      "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
      on ? color : "border-input bg-card hover:border-primary",
    );
  return (
    <div className="grid gap-2">
      <div role="radiogroup" aria-label={t("Boy, girl or twins?")} className="flex flex-wrap gap-2">
        <button type="button" role="radio" aria-checked={kind === "boys"} onClick={() => onChange({ gender: "boys", twins: null })} className={pill(kind === "boys", "border-sky-500 bg-sky-500 text-white")}>
          {t("Boy")}
        </button>
        <button type="button" role="radio" aria-checked={kind === "girls"} onClick={() => onChange({ gender: "girls", twins: null })} className={pill(kind === "girls", "border-pink-500 bg-pink-500 text-white")}>
          {t("Girl")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={kind === "twins"}
          onClick={() => (onOpenTwins ? onOpenTwins() : onChange({ gender: null, twins: value.twins ?? "mixed" }))}
          className={pill(kind === "twins", "border-violet-500 bg-gradient-to-r from-sky-500 to-pink-500 text-white")}
        >
          {t("Twins")} 👶👶
        </button>
      </div>
      {(value.twins || twinsOpen) && (
        <div role="radiogroup" aria-label={t("Which twins?")} className="flex flex-wrap gap-2 ps-1">
          {(
            [
              ["boys", t("Two boys"), "border-sky-500 bg-sky-500 text-white"],
              ["girls", t("Two girls"), "border-pink-500 bg-pink-500 text-white"],
              ["mixed", t("A boy and a girl"), "border-violet-500 bg-gradient-to-r from-sky-500 to-pink-500 text-white"],
            ] as const
          ).map(([v, label, color]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={value.twins === v}
              onClick={() => onChange({ gender: v === "mixed" ? null : v, twins: v })}
              className={cn(pill(value.twins === v, color), "min-h-9 px-3 text-xs")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
