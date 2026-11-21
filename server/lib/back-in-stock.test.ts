import { describe, expect, it } from "vitest";
import { setup, stockedProduct } from "../test/helpers.ts";

type Api = ReturnType<typeof setup>["api"];
let shipment = 91000;

/** Records an order for `quantity` units and ships it when stock allows. */
function shipped(api: Api, productId: string, quantity: number) {
  const orderId = api.orders.create({
    orderDate: "2026-03-10",
    customer: "x",
    customerPhone: "01012345678",
    address: "y",
    channel: "facebook",
    shippingFee: 0,
    shipmentNumber: String(shipment++),
    total: quantity * 10,
    lineItems: [{ productId, quantity }],
  });
  if (api.orders.get({ orderId })!.status === "new") api.orders.updateStatus({ orderId, status: "shipped" });
  return orderId;
}

function returnAll(api: Api, orderId: string, sellable = true) {
  const o = api.orders.get({ orderId })!;
  api.orders.returnLineItems({ orderId, lines: o.lineItems.map((l) => ({ lineItemId: l._id, quantity: l.quantity, sellable })) });
}

describe("back in stock after returns", () => {
  it("lists only items that were sold out, in one batch until announced", () => {
    const { api, time } = setup();
    const soldOut = stockedProduct(api, { sku: "A", stock: 2 }).productId;
    const inStock = stockedProduct(api, { sku: "B", stock: 10 }).productId;
    const a1 = shipped(api, soldOut, 1);
    const a2 = shipped(api, soldOut, 1);
    const b = shipped(api, inStock, 2);
    expect(api.inventory.backInStock().items).toEqual([]);

    returnAll(api, a1);
    returnAll(api, b);
    time.advance(10 * 60_000);
    returnAll(api, a2);
    let pending = api.inventory.backInStock();
    // Both returns of the sold-out item count; the item that still had stock is left out
    expect(pending.items).toEqual([{ productName: "Product A", variantName: null, units: 2 }]);
    expect(pending.overdue).toBe(false);

    time.advance(40 * 60_000);
    pending = api.inventory.backInStock();
    expect(pending.overdue).toBe(true);

    expect(api.inventory.announceBackInStock({ upTo: pending.upTo! }).cleared).toBe(3);
    expect(api.inventory.backInStock()).toMatchObject({ items: [], overdue: false, upTo: null });
  });

  it("leaves out units a waiting order took, damaged units, and units sold since", () => {
    const { api } = setup();
    const a = stockedProduct(api, { sku: "A", stock: 2 }).productId;
    const first = shipped(api, a, 2);
    const waiting = shipped(api, a, 2);
    expect(api.orders.get({ orderId: waiting })!.status).toBe("on_hold");
    returnAll(api, first);
    // The returned units went to the order that was waiting
    expect(api.orders.get({ orderId: waiting })!.status).toBe("new");
    expect(api.inventory.backInStock().items).toEqual([]);

    const c = stockedProduct(api, { sku: "C", stock: 1 }).productId;
    returnAll(api, shipped(api, c, 1), false);
    expect(api.inventory.backInStock().items).toEqual([]);

    const d = stockedProduct(api, { sku: "D", stock: 3 }).productId;
    const big = shipped(api, d, 3);
    returnAll(api, big);
    expect(api.inventory.backInStock().items).toEqual([{ productName: "Product D", variantName: null, units: 3 }]);
    shipped(api, d, 2);
    expect(api.inventory.backInStock().items).toEqual([{ productName: "Product D", variantName: null, units: 1 }]);
  });

  it("counts returns confirmed from transit", () => {
    const { api } = setup();
    const { productId, variantIds } = stockedProduct(api, { sku: "A", stock: 1, variants: ["3-6"] });
    const orderId = api.orders.create({
      orderDate: "2026-03-10",
      customer: "x",
      customerPhone: "01012345678",
      address: "y",
      channel: "facebook",
      shippingFee: 0,
      shipmentNumber: String(shipment++),
      total: 10,
      lineItems: [{ productId, variantId: variantIds[0], quantity: 1 }],
    });
    api.orders.updateStatus({ orderId, status: "shipped" });
    const line = api.orders.get({ orderId })!.lineItems[0];
    api.orders.returnLineItems({ orderId, inTransit: true, lines: [{ lineItemId: line._id, quantity: 1, sellable: true }] });
    expect(api.inventory.backInStock().items).toEqual([]);
    api.orders.resolveInTransit({ orders: [{ orderId, outcome: "received" }] });
    expect(api.inventory.backInStock().items).toEqual([{ productName: "Product A", variantName: "3-6", units: 1 }]);
  });
});
