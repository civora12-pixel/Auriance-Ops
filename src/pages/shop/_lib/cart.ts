import { useSyncExternalStore } from "react";
import type { Gender } from "@shared/constants.ts";

/** One cart line: a product, or a product in one size (and for boys or girls). Kept on the shopper's device only. */
export type CartLine = {
  productId: string;
  variantId: string | null;
  gender: Gender | null;
  quantity: number;
};

const KEY = "auriance.shop.cart.v1";
const listeners = new Set<() => void>();
let cache: CartLine[] | undefined;

const lineKey = (productId: string, variantId: string | null, gender: Gender | null) =>
  [productId, variantId ?? "", gender ?? ""].join(":");
export const cartLineKey = (l: Pick<CartLine, "productId" | "variantId" | "gender">) =>
  lineKey(l.productId, l.variantId, l.gender);
const sameItem = (a: Pick<CartLine, "productId" | "variantId">, b: Pick<CartLine, "productId" | "variantId">) =>
  a.productId === b.productId && a.variantId === b.variantId;

function read(): CartLine[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed)
      ? parsed.filter(
          (l): l is CartLine =>
            typeof l?.productId === "string" &&
            (typeof l.variantId === "string" || l.variantId === null) &&
            Number.isInteger(l.quantity) &&
            l.quantity > 0,
        ).map((l) => ({ ...l, gender: l.gender === "boys" || l.gender === "girls" ? l.gender : null }))
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: CartLine[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Blocked storage: the cart lasts for this visit
  }
  listeners.forEach((l) => l());
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

export function useCart() {
  const lines = useSyncExternalStore(subscribe, read, read);
  /** Units of the same size in other lines (boys and girls share the stock). */
  const others = (item: Pick<CartLine, "productId" | "variantId">, key: string) =>
    lines.filter((l) => sameItem(l, item) && cartLineKey(l) !== key).reduce((s, l) => s + l.quantity, 0);
  return {
    lines,
    count: lines.reduce((s, l) => s + l.quantity, 0),
    /** Units of a product already in the cart (all sizes), leaving out one line. */
    productCount(productId: string, exceptKey?: string) {
      return lines.filter((l) => l.productId === productId && cartLineKey(l) !== exceptKey).reduce((s, l) => s + l.quantity, 0);
    },
    /** Most this line can hold, given what's in stock. */
    maxFor(line: CartLine, stock: number) {
      return Math.max(0, stock - others(line, cartLineKey(line)));
    },
    /** Adds to the line, capped at what's in stock. */
    add(productId: string, variantId: string | null, gender: Gender | null, quantity: number, max: number) {
      const key = lineKey(productId, variantId, gender);
      // The latest cart, so two adds in a row (one per twin) both count
      const now = read();
      const existing = now.find((l) => cartLineKey(l) === key);
      const taken = now
        .filter((l) => sameItem(l, { productId, variantId }) && cartLineKey(l) !== key)
        .reduce((s, l) => s + l.quantity, 0);
      const next = Math.min(max - taken, (existing?.quantity ?? 0) + quantity);
      if (next <= 0) return;
      write(
        existing
          ? now.map((l) => (cartLineKey(l) === key ? { ...l, quantity: next } : l))
          : [...now, { productId, variantId, gender, quantity: next }],
      );
    },
    setQuantity(key: string, quantity: number) {
      write(
        quantity <= 0
          ? lines.filter((l) => cartLineKey(l) !== key)
          : lines.map((l) => (cartLineKey(l) === key ? { ...l, quantity } : l)),
      );
    },
    /** Changes boys/girls on a line, merging with a line that already has it. */
    setGender(key: string, gender: Gender) {
      const line = lines.find((l) => cartLineKey(l) === key);
      if (!line) return;
      const target = lines.find((l) => sameItem(l, line) && l.gender === gender && cartLineKey(l) !== key);
      write(
        target
          ? lines
              .filter((l) => cartLineKey(l) !== key)
              .map((l) => (l === target ? { ...l, quantity: l.quantity + line.quantity } : l))
          : lines.map((l) => (cartLineKey(l) === key ? { ...l, gender } : l)),
      );
    },
    remove(key: string) {
      write(lines.filter((l) => cartLineKey(l) !== key));
    },
    clear() {
      write([]);
    },
  };
}
