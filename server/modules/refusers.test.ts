import { describe, expect, it } from "vitest";
import { setup, stockedProduct } from "../test/helpers.ts";

describe("repeat refusers", () => {
  it("counts a phone number's earlier refused and partly returned orders", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 20, price: 100 });
    let n = 0;
    const order = (phone: string, phone2?: string, quantity = 1) =>
      api.orders.create({
        address: "Cairo",
        channel: "facebook",
        customerPhone: phone,
        customerPhone2: phone2,
        shippingFee: 50,
        orderDate: "2026-03-10",
        customer: "Mona",
        shipmentNumber: `S${++n}`,
        total: 100 * quantity,
        lineItems: [{ productId, quantity }],
      });
    const refuse = (orderId: string) => {
      api.orders.updateStatus({ orderId, status: "shipped" });
      const line = api.orders.get({ orderId })!.lineItems[0];
      api.orders.returnLineItems({ orderId, lines: [{ lineItemId: line._id, quantity: line.quantity, sellable: true }] });
    };

    const first = order("01012345678");
    refuse(first);
    // The second number of a later order matches too
    const second = order("01112345678", "01012345678");
    refuse(second);
    const partial = order("01012345678", undefined, 2);
    api.orders.updateStatus({ orderId: partial, status: "shipped" });
    const line = api.orders.get({ orderId: partial })!.lineItems[0];
    api.orders.returnLineItems({ orderId: partial, lines: [{ lineItemId: line._id, quantity: 1, sellable: true }] });

    const fresh = order("+20 101 234 5678");
    const view = api.orders.get({ orderId: fresh })!;
    expect(view.customerHistory).toMatchObject({ orders: 3, refused: 2, partlyReturned: 1 });
    expect(view.customerHistory.refusedOrders.map((o) => o.orderNumber)).toEqual(["ORD-0002", "ORD-0001"]);

    // The new-order form can ask before the order exists
    expect(api.orders.phoneHistory({ phones: ["٠١٠١٢٣٤٥٦٧٨"] }).refused).toBe(2);
    expect(api.orders.phoneHistory({ phones: ["01200000000"] })).toMatchObject({ orders: 0, refused: 0 });

    // Open orders in the list carry the count; finished ones don't
    const items = api.orders.list({}).items;
    expect(items.find((o) => o._id === fresh)!.refusedBefore).toBe(2);
    expect(items.find((o) => o._id === first)!.refusedBefore).toBe(0);
  });
});
