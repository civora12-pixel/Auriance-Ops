import { useSyncExternalStore } from "react";
import { parseChildren, parseKind } from "@shared/little-ones.ts";
import type { BabyKind, Child } from "@shared/little-ones.ts";

/**
 * What a guest's device remembers: that they chose to shop as a guest, their
 * baby's age if they told us, and the baby sizes they ordered (kept on this
 * device only, for the age suggestions).
 */
export type GuestState = {
  guest: boolean;
  babyAge: { months: number; day: string } | null;
  sizes: { size: string; day: string }[];
  /** Said "Not now" to the age question */
  hideAgeAsk: boolean;
  /** "My little ones" (guests; accounts keep theirs in the account) */
  children: Child[];
  /** The child being shopped for, on this device */
  activeChildId: string | null;
  /** Hid the baby that walks around the shop */
  hideBaby: boolean;
  /** Shopping for a boy, a girl or twins (guests; accounts keep it in the account) */
  shoppingFor: BabyKind | null;
};

const KEY = "auriance.shop.guest.v1";
const EMPTY: GuestState = {
  guest: false,
  babyAge: null,
  sizes: [],
  hideAgeAsk: false,
  children: [],
  activeChildId: null,
  hideBaby: false,
  shoppingFor: null,
};
const listeners = new Set<() => void>();
let cache: GuestState | undefined;

function read(): GuestState {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<GuestState> | null;
    cache = {
      guest: raw?.guest === true,
      babyAge:
        raw?.babyAge && typeof raw.babyAge.months === "number" && typeof raw.babyAge.day === "string"
          ? raw.babyAge
          : null,
      sizes: Array.isArray(raw?.sizes)
        ? raw.sizes.filter((s) => typeof s?.size === "string" && typeof s?.day === "string").slice(-50)
        : [],
      hideAgeAsk: raw?.hideAgeAsk === true,
      children: parseChildren(JSON.stringify(raw?.children ?? [])),
      activeChildId: typeof raw?.activeChildId === "string" ? raw.activeChildId : null,
      hideBaby: raw?.hideBaby === true,
      shoppingFor: parseKind(raw?.shoppingFor ?? null),
    };
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: GuestState) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Blocked storage: remembered for this visit only
  }
  listeners.forEach((l) => l());
}

export function updateGuest(change: Partial<GuestState>) {
  write({ ...read(), ...change });
}

export function rememberGuestSizes(sizes: { size: string; day: string }[]) {
  write({ ...read(), sizes: [...read().sizes, ...sizes].slice(-50) });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = undefined;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useGuest(): GuestState {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
