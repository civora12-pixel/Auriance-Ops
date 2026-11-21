import { round2 } from "@shared/constants.ts";
import { cartLineKey, useCart } from "./cart.ts";
import type { CartLine } from "./cart.ts";
import type { ShopOption, ShopProduct } from "./shop-api.ts";

export type CartRow = {
  line: CartLine;
  key: string;
  product: ShopProduct | undefined;
  option: ShopOption | undefined;
  /** Most this line can have now */
  max: number;
  /** What will be ordered: the line's quantity, lowered to what's left */
  quantity: number;
  /** Boys or girls still to choose */
  needsGender: boolean;
  /** The product's per-order limit is what caps this line (not stock) */
  limited: boolean;
};

/** The cart checked against the live catalog: what's still for sale, quantities and the subtotal. */
export function useCartRows(products: ShopProduct[] | undefined) {
  const cart = useCart();
  const rows: CartRow[] = cart.lines.map((line) => {
    const product = products?.find((p) => p.productId === line.productId);
    const option = product?.options.find((o) => (o.variantId ?? null) === line.variantId);
    const stockMax = option ? cart.maxFor(line, option.maxQuantity) : 0;
    // Limited products: the order limit is shared by all their lines, first lines first
    const limit = product?.maxPerOrder
      ? Math.max(
          0,
          product.maxPerOrder -
            cart.lines
              .slice(0, cart.lines.indexOf(line))
              .filter((l) => l.productId === line.productId)
              .reduce((s, l) => s + l.quantity, 0),
        )
      : Infinity;
    const max = Math.min(stockMax, limit);
    return {
      line,
      key: cartLineKey(line),
      product,
      option,
      max,
      quantity: Math.min(line.quantity, max),
      needsGender: !!product?.needsGender && !line.gender,
      limited: limit < stockMax,
    };
  });
  const ready = rows.filter((r) => r.product && r.quantity > 0);
  const subtotal = round2(ready.reduce((s, r) => s + r.quantity * (r.product?.price ?? 0), 0));
  return { cart, rows, ready, subtotal, missingGender: ready.some((r) => r.needsGender) };
}
