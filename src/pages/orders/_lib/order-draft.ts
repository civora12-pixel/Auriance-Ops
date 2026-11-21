/**
 * The new-order form saved on this device as it's filled in, so an order
 * closed by accident (a tap outside, the phone locking, a refresh) comes back.
 * One draft per person per device; it never reaches the server.
 */

export const DRAFT_MAX_AGE_MS = 7 * 86_400_000;

export type OrderDraft = {
  savedAt: number;
  values: {
    orderDate: string;
    customer: string;
    customerPhone: string;
    customerPhone2: string;
    address: string;
    channel: string;
    shippingFee: string;
    shipmentNumber: string;
    notes: string;
    shipmentNotes: string;
    /** Ship later: the day the customer wants it shipped ("" = ship as usual) */
    shipOn: string;
  };
  lines: {
    key: string;
    productId: string;
    variantId?: string;
    quantity: string;
    gender?: "boys" | "girls";
  }[];
  customTotal: boolean;
  total: string;
};

const keyFor = (userId: string) => `auriance.orderDraft.v1.${userId}`;

function storage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const isString = (v: unknown): v is string => typeof v === "string";

/** The saved draft, or undefined if there is none, it's unreadable or it expired. */
export function loadDraft(
  userId: string,
  now = Date.now(),
): OrderDraft | undefined {
  const store = storage();
  if (!store) return undefined;
  try {
    const raw = store.getItem(keyFor(userId));
    if (!raw) return undefined;
    const draft = JSON.parse(raw) as OrderDraft;
    const fresh =
      typeof draft?.savedAt === "number" &&
      now - draft.savedAt <= DRAFT_MAX_AGE_MS;
    const valid =
      draft?.values &&
      Object.values(draft.values).every(isString) &&
      Array.isArray(draft.lines) &&
      draft.lines.every((l) => isString(l?.key) && isString(l?.quantity)) &&
      typeof draft.customTotal === "boolean" &&
      isString(draft.total);
    if (!fresh || !valid) {
      store.removeItem(keyFor(userId));
      return undefined;
    }
    // Drafts saved before "ship later" existed
    return { ...draft, values: { ...draft.values, shipOn: draft.values.shipOn ?? "" } };
  } catch {
    store.removeItem(keyFor(userId));
    return undefined;
  }
}

export function saveDraft(userId: string, draft: OrderDraft): void {
  try {
    storage()?.setItem(keyFor(userId), JSON.stringify(draft));
  } catch {
    // Storage full or blocked (private browsing): drafts are a convenience only
  }
}

export function clearDraft(userId: string): void {
  try {
    storage()?.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
}

/** Whether anything worth keeping has been typed or picked. */
export function hasContent(
  draft: Pick<OrderDraft, "values" | "lines" | "total">,
  today: string,
): boolean {
  const { orderDate, ...rest } = draft.values;
  return (
    orderDate !== today ||
    Object.values(rest).some((v) => v.trim() !== "") ||
    draft.lines.some((l) => l.key !== "" || (l.quantity !== "1" && l.quantity !== "")) ||
    draft.total.trim() !== ""
  );
}
