import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_MAX_AGE_MS,
  clearDraft,
  hasContent,
  loadDraft,
  saveDraft,
} from "./order-draft.ts";
import type { OrderDraft } from "./order-draft.ts";

const today = "2026-10-28";
const values = (over: Partial<OrderDraft["values"]> = {}) => ({
  orderDate: today,
  customer: "",
  customerPhone: "",
  customerPhone2: "",
  address: "",
  channel: "",
  shippingFee: "",
  shipmentNumber: "",
  notes: "",
  shipmentNotes: "",
  shipOn: "",
  ...over,
});
const draft = (savedAt: number): OrderDraft => ({
  savedAt,
  values: values({ customer: "Mona" }),
  lines: [{ key: "p1", productId: "p1", quantity: "2" }],
  customTotal: false,
  total: "",
});

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe("order drafts", () => {
  it("saves, loads and clears per user", () => {
    const now = Date.now();
    saveDraft("u1", draft(now));
    expect(loadDraft("u1", now)?.values.customer).toBe("Mona");
    expect(loadDraft("u2", now)).toBeUndefined();
    clearDraft("u1");
    expect(loadDraft("u1", now)).toBeUndefined();
  });

  it("drops drafts older than 7 days", () => {
    const now = Date.now();
    saveDraft("u1", draft(now - DRAFT_MAX_AGE_MS - 1000));
    expect(loadDraft("u1", now)).toBeUndefined();
    expect(localStorage.getItem("auriance.orderDraft.v1.u1")).toBeNull();
  });

  it("ignores broken drafts", () => {
    localStorage.setItem("auriance.orderDraft.v1.u1", "{not json");
    expect(loadDraft("u1")).toBeUndefined();
    localStorage.setItem(
      "auriance.orderDraft.v1.u1",
      JSON.stringify({ savedAt: Date.now(), values: { customer: 5 } }),
    );
    expect(loadDraft("u1")).toBeUndefined();
  });

  it("knows when the form has something in it", () => {
    const empty = { values: values(), lines: [{ key: "", productId: "", quantity: "1" }], total: "" };
    expect(hasContent(empty, today)).toBe(false);
    expect(hasContent({ ...empty, values: values({ address: "Cairo" }) }, today)).toBe(true);
    expect(hasContent({ ...empty, lines: [{ key: "p1", productId: "p1", quantity: "1" }] }, today)).toBe(true);
    expect(hasContent({ ...empty, values: values({ orderDate: "2026-10-01" }) }, today)).toBe(true);
  });

  it("fills in the ship-later date for drafts saved before it existed", () => {
    const old = draft(Date.now());
    const { shipOn: _drop, ...before } = old.values;
    void _drop;
    localStorage.setItem("auriance.orderDraft.v1.u-old", JSON.stringify({ ...old, values: before }));
    expect(loadDraft("u-old")?.values.shipOn).toBe("");
  });
});
