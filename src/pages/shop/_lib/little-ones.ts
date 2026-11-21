import type { TFunction } from "i18next";
import { useCallback } from "react";
import { babyTier, childAgeMonths } from "@shared/little-ones.ts";
import type { BabyTier, Child } from "@shared/little-ones.ts";
import { useFormat } from "@/lib/format.ts";
import { updateGuest, useGuest } from "./guest.ts";
import { useShopAction, useShopMe } from "./shop-api.ts";

export type LittleOne = Child & { ageMonths: number; tier: BabyTier };

/**
 * The children the customer shops for (account, or this device for guests),
 * with their age today, and which one is being shopped for now.
 */
export function useLittleOnes() {
  const me = useShopMe();
  const guest = useGuest();
  const action = useShopAction();
  const { today } = useFormat();
  const day = today();
  const customer = me?.customer;
  const children = customer ? (customer.children ?? []) : guest.children;
  const list: LittleOne[] = children.map((c) => {
    const ageMonths = childAgeMonths(c.birthday, day);
    return { ...c, ageMonths, tier: babyTier(ageMonths) };
  });
  const active = list.find((c) => c.id === guest.activeChildId) ?? list[0] ?? null;

  const save = useCallback(
    async (next: Child[]) => {
      if (customer) await action("children", { children: next });
      else updateGuest({ children: next });
    },
    [action, customer],
  );
  const setActive = useCallback((id: string) => updateGuest({ activeChildId: id }), []);

  return { ready: me !== undefined, children: list, active, save, setActive, today: day };
}

/** A short id for a new child. */
export const newChildId = () => Math.random().toString(36).slice(2, 10);

/** "8 months", "1 year 3 months", "3 years". */
export function ageLabel(t: TFunction, months: number): string {
  const m = Math.floor(months);
  if (m < 1) return t("{{n}} weeks", { n: Math.max(1, Math.floor(months * 4.35)) });
  if (m < 12) return t("{{n}} months", { n: m });
  const years = Math.floor(m / 12);
  const rest = m % 12;
  if (years >= 2 || rest === 0) return years === 1 ? t("1 year") : t("{{n}} years", { n: years });
  return t("1 year {{n}} months", { n: rest });
}

