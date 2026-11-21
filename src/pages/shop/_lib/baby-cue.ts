/** Tell the baby something happened: it claps for the cart and waves goodbye after an order. */
export type BabyCue = "cart-added" | "order-placed";
export const CUE_EVENT = "auriance:baby";
export function cueBaby(cue: BabyCue) {
  window.dispatchEvent(new CustomEvent(CUE_EVENT, { detail: cue }));
}

