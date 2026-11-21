import { useCallback } from "react";
import { audiencesFor, babiesOf } from "@shared/little-ones.ts";
import type { BabyKind } from "@shared/little-ones.ts";
import { updateGuest, useGuest } from "./guest.ts";
import { useShopAction, useShopMe } from "./shop-api.ts";

/**
 * The birthday ("My little ones") is switched off for now and kept for later;
 * the shop asks only who the customer shops for: a boy, a girl or twins.
 */
export const BIRTHDAYS_ON = false;

/** Who the customer shops for (account, or this device for guests), and the babies to draw for it. */
export function useShoppingFor() {
  const me = useShopMe();
  const guest = useGuest();
  const action = useShopAction();
  const customer = me?.customer;
  const kind: BabyKind | null = customer ? (customer.shoppingFor ?? null) : guest.shoppingFor;
  const save = useCallback(
    async (next: BabyKind | null) => {
      if (customer) await action("shopping-for", next ?? { gender: null, twins: null });
      else updateGuest({ shoppingFor: next });
    },
    [action, customer],
  );
  return {
    ready: me !== undefined,
    kind,
    /** One baby, or both twins, with their genders (null: not said) */
    babies: babiesOf(kind ?? { gender: null, twins: null }),
    /** Products for this choice: "boys", "girls", or both for a boy and a girl */
    audiences: audiencesFor(kind),
    save,
  };
}

/** How a choice reads: "Boy", "Girl", "Twins: a boy and a girl"… */
export function kindLabel(t: (k: string) => string, k: BabyKind): string {
  if (k.twins === "mixed") return t("Twins: a boy and a girl");
  if (k.twins === "boys") return t("Twins: two boys");
  if (k.twins === "girls") return t("Twins: two girls");
  return k.gender === "boys" ? t("A boy") : t("A girl");
}

