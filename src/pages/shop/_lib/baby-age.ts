import { useCallback } from "react";
import { MAX_SUGGESTION_MONTHS, estimateAgeMonths } from "@shared/shop-age.ts";
import { useFormat } from "@/lib/format.ts";
import { updateGuest, useGuest } from "./guest.ts";
import { useLittleOnes } from "./little-ones.ts";
import { useShopAction, useShopMe } from "./shop-api.ts";

/**
 * The baby's estimated age now: from the "How old is your baby?" answer, or
 * from the sizes bought (account: saved with the orders; guest: this device).
 */
export function useBabyAge() {
  const me = useShopMe();
  const guest = useGuest();
  const action = useShopAction();
  const { today } = useFormat();
  const customer = me?.customer;
  const day = today();

  const answer = customer
    ? customer.babyAgeMonths != null && customer.babyAgeDay
      ? { months: customer.babyAgeMonths, day: customer.babyAgeDay }
      : null
    : guest.babyAge;
  const purchases = customer ? (me?.sizes ?? []) : guest.sizes;
  // A child with a birthday wins over the older age answer and the sizes bought
  const { active } = useLittleOnes();
  const estimate = active ? active.ageMonths : estimateAgeMonths({ answer, purchases, today: day });
  const ageMonths = estimate !== null && estimate <= MAX_SUGGESTION_MONTHS ? estimate : null;

  const setAnswer = useCallback(
    async (months: number | null) => {
      if (customer) await action("baby-age", { months });
      else updateGuest({ babyAge: months === null ? null : { months, day } });
    },
    [action, customer, day],
  );

  return { ready: me !== undefined, ageMonths, answered: !!answer || !!active, setAnswer };
}
