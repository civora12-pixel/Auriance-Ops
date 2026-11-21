import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import type { BabyKind } from "@shared/little-ones.ts";
import { Button } from "@/components/ui/button.tsx";
import { getErrorMessage } from "@/lib/api.ts";
import { updateGuest, useGuest } from "../_lib/guest.ts";
import { kindLabel, useShoppingFor } from "../_lib/shopping-for.ts";
import { BabyKindChoice } from "./baby-kind-choice.tsx";
import { GrowingBaby } from "./growing-baby.tsx";

/**
 * "Who are you shopping for?": boy, girl or twins, asked straight away. The
 * babies drawn around the shop and the "Picked for…" suggestions follow it.
 */
export function ShoppingForCard() {
  const { t } = useTranslation();
  const guest = useGuest();
  const { kind, babies, save } = useShoppingFor();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BabyKind>({ gender: null, twins: null });
  const [twinsOpen, setTwinsOpen] = useState(false);
  if (!kind && guest.hideAgeAsk) return null;

  // A boy or a girl is settled in one tap; "Twins" first asks which twins
  const choose = async (k: BabyKind) => {
    setDraft(k);
    try {
      await save(k);
      setEditing(false);
      setTwinsOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const asking = !kind || editing;
  return (
    <section className="flex items-center gap-3 rounded-3xl border bg-card p-4 shadow-sm sm:gap-5 sm:p-5">
      <div aria-hidden className="flex shrink-0 -space-x-5 rtl:space-x-reverse">
        {babies.map((g, i) => (
          <GrowingBaby key={i} tier={2} gender={g} className={babies.length > 1 ? "h-14 w-14 sm:h-16 sm:w-16" : "h-16 w-16 sm:h-20 sm:w-20"} />
        ))}
      </div>
      <div className="grid min-w-0 flex-1 gap-2">
        {asking ? (
          <>
            <h2 className="font-display text-lg font-semibold text-shop-deep">{t("Who are you shopping for?")}</h2>
            <BabyKindChoice
              value={editing || !kind ? draft : kind}
              onChange={(k) => void choose(k)}
              twinsOpen={twinsOpen}
              onOpenTwins={() => setTwinsOpen(true)}
            />
            {!kind && (
              <button
                type="button"
                className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => updateGuest({ hideAgeAsk: true })}
              >
                {t("Not now")}
              </button>
            )}
            {editing && (
              <button type="button" className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => setEditing(false)}>
                {t("Cancel")}
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-shop-deep">{t("Shopping for:")}</span>
            <span className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-secondary-foreground">{kindLabel(t, kind)}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => {
                setDraft(kind);
                setEditing(true);
              }}
            >
              <Pencil />
              {t("Change")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
