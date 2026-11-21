import { describe, expect, it } from "vitest";
import { addUser, appError, setup, stockedProduct, orderSummary } from "../test/helpers.ts";

const DAY = "2026-03-10";

/** Order at catalog prices (stockedProduct defaults to 10 a unit, or pass `unitPrice` to match the product). */
function order(
  api: ReturnType<typeof setup>["api"],
  lineItems: {
    productId: string;
    variantId?: string;
    quantity: number;
    unitPrice: number;
  }[],
  total?: number,
) {
  const subtotal = lineItems.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  return api.orders.create({
    address: "Test address",
    channel: "facebook",
    customerPhone: "01012345678",
    shippingFee: 0,
    orderDate: DAY,
    customer: "  Jane Doe ",
    shipmentNumber: `S-${Math.random().toString(36).slice(2, 8)}`,
    total: total ?? subtotal,
    lineItems: lineItems.map(({ productId, variantId, quantity }) => ({
      productId,
      variantId,
      quantity,
    })),
  });
}

describe("orders", () => {
  it("creates an order with trimmed customer, numbers and history", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    const id = order(api, [{ productId, quantity: 2, unitPrice: 10 }]);
    const o = api.orders.get({ orderId: id })!;
    expect(o.customer).toBe("Jane Doe");
    expect(o.displayOrderNumber).toBe("ORD-0001");
    expect(o.subtotal).toBe(20);
    expect(o.hasManualTotal).toBe(false);
    expect(o.history[0].note).toBe("Order created");
  });

  it("requires boys or girls on lines whose product needs it", () => {
    const { api } = setup();
    const clothes = stockedProduct(api, {
      sku: "TSHIRT",
      stock: 10,
      variants: ["S"],
      needsGender: true,
    });
    const heater = stockedProduct(api, { sku: "HEAT", stock: 10 });
    const base = {
      address: "Test address",
      channel: "facebook" as const,
      customerPhone: "01012345678",
      shippingFee: 0,
      orderDate: DAY,
      customer: "x",
      total: 20,
    };
    const err = appError(() =>
      api.orders.create({
        ...base,
        shipmentNumber: "G-1",
        lineItems: [
          { productId: clothes.productId, variantId: clothes.variantIds[0], quantity: 1 },
          { productId: heater.productId, quantity: 1 },
        ],
      }),
    );
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toBe("Choose boys or girls for Product TSHIRT – S");

    const id = api.orders.create({
      ...base,
      shipmentNumber: "G-2",
      lineItems: [
        {
          productId: clothes.productId,
          variantId: clothes.variantIds[0],
          quantity: 1,
          gender: "girls",
        },
        // Ignored: heaters don't need it
        { productId: heater.productId, quantity: 1, gender: "boys" },
      ],
    });
    const lines = api.orders.get({ orderId: id })!.lineItems;
    expect(lines.map((l) => l.gender)).toEqual(["girls", null]);
    const queued = api.orders.packingQueue().find((o) => o._id === id)!;
    expect(queued.items.map((i) => i.gender)).toEqual(["girls", null]);
  });

  it("takes the same size twice only as one boys line and one girls line", () => {
    const { api } = setup();
    const tee = stockedProduct(api, { sku: "TEE", stock: 10, variants: ["L"], needsGender: true });
    const heater = stockedProduct(api, { sku: "HEAT", stock: 10 });
    const base = {
      address: "Test address",
      channel: "facebook" as const,
      customerPhone: "01012345678",
      shippingFee: 0,
      orderDate: DAY,
      customer: "x",
      total: 30,
    };
    const L = { productId: tee.productId, variantId: tee.variantIds[0] };
    const id = api.orders.create({
      ...base,
      shipmentNumber: "D-1",
      lineItems: [
        { ...L, quantity: 2, gender: "boys" },
        { ...L, quantity: 1, gender: "girls" },
      ],
    });
    expect(api.orders.get({ orderId: id })!.lineItems.map((l) => [l.gender, l.quantity])).toEqual([
      ["boys", 2],
      ["girls", 1],
    ]);
    // Both lines hold stock from the same size
    expect(api.inventory.list({}).find((r) => r.variantId === L.variantId)?.reserved).toBe(3);
    const twice = appError(() =>
      api.orders.create({
        ...base,
        shipmentNumber: "D-2",
        lineItems: [
          { ...L, quantity: 1, gender: "boys" },
          { ...L, quantity: 1, gender: "boys" },
        ],
      }),
    );
    expect(twice.message).toMatch(/added twice/);
    expect(
      appError(() =>
        api.orders.create({
          ...base,
          shipmentNumber: "D-3",
          lineItems: [
            { productId: heater.productId, quantity: 1 },
            { productId: heater.productId, quantity: 1 },
          ],
        }),
      ).message,
    ).toMatch(/added twice/);
  });

  it("turns boys/girls on for new products and keeps it on edit unless set", () => {
    const { api } = setup();
    const productId = api.products.create({
      name: "Dress",
      category: "General",
      unitPrice: 100,
      uom: "pcs",
      reorderThreshold: 0,
    });
    expect(api.products.get({ productId })!.needsGender).toBe(true);
    const fields = {
      productId,
      name: "Dress",
      category: "General",
      unitPrice: 100,
      uom: "pcs",
      reorderThreshold: 0,
    };
    api.products.update({ ...fields, needsGender: false });
    expect(api.products.get({ productId })!.needsGender).toBe(false);
    api.products.update(fields);
    expect(api.products.get({ productId })!.needsGender).toBe(false);
  });

  it("validates input", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    expect(
      appError(() => order(api, [{ productId, quantity: 1.5, unitPrice: 10 }]))
        .code,
    ).toBe("BAD_REQUEST");
    expect(
      appError(() =>
        api.orders.create({
          address: "Test address",
          channel: "facebook",
          customerPhone: "01012345678",
          shippingFee: 0,
          orderDate: "2026-13-40",
          customer: "x",
          shipmentNumber: "1",
          total: 1,
          lineItems: [{ productId, quantity: 1 }],
        }),
      ).code,
    ).toBe("BAD_REQUEST");
    // Shipment numbers are unique regardless of case
    api.orders.create({
      address: "Test address",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 0,
      orderDate: DAY,
      customer: "x",
      shipmentNumber: "ABC",
      total: 10,
      lineItems: [{ productId, quantity: 1 }],
    });
    expect(
      appError(() =>
        api.orders.create({
          address: "Test address",
          channel: "facebook",
          customerPhone: "01012345678",
          shippingFee: 0,
          orderDate: DAY,
          customer: "x",
          shipmentNumber: "abc",
          total: 10,
          lineItems: [{ productId, quantity: 1 }],
        }),
      ).code,
    ).toBe("CONFLICT");
  });

  it("charges the catalog price, whatever the client sends", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, {
      sku: "A",
      stock: 10,
      price: 12.5,
    });
    const id = api.orders.create({
      address: "Test address",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 0,
      orderDate: DAY,
      customer: "x",
      shipmentNumber: "P-1",
      total: 20,
      lineItems: [
        { productId, quantity: 2, unitPrice: 1 } as {
          productId: string;
          quantity: number;
        },
      ],
    });
    const o = api.orders.get({ orderId: id })!;
    expect(o.lineItems[0].unitPrice).toBe(12.5);
    expect(o.subtotal).toBe(25);
    // Only the total is negotiable
    expect(o.total).toBe(20);
    expect(o.hasManualTotal).toBe(true);
  });

  it("rejects a variant from another product", () => {
    const { api } = setup();
    const a = stockedProduct(api, { sku: "A", variants: ["S"], stock: 5 });
    const b = stockedProduct(api, { sku: "B", variants: ["S"], stock: 5 });
    expect(() =>
      order(api, [
        {
          productId: a.productId,
          variantId: b.variantIds[0],
          quantity: 1,
          unitPrice: 10,
        },
      ]),
    ).toThrow();
  });

  it("ships the whole order at once, moving stock", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    const id = order(api, [{ productId, quantity: 4, unitPrice: 10 }]);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    const o = api.orders.get({ orderId: id })!;
    expect(o.status).toBe("shipped");
    expect(o.shippedAt).toBeDefined();
    expect(o.lineItems[0].shippedQuantity).toBe(4);
    expect(api.products.get({ productId })!.onHand).toBe(6);
    expect("shipItems" in api.orders).toBe(false);
  });

  it("puts the whole order On hold when any item is short, and releases it oldest first", () => {
    const { api } = setup();
    const a = stockedProduct(api, { sku: "A", stock: 2 });
    const b = stockedProduct(api, { sku: "B", stock: 5 });
    // B is available but A isn't: the whole order waits and holds nothing
    const first = order(api, [
      { productId: a.productId, quantity: 3, unitPrice: 10 },
      { productId: b.productId, quantity: 1, unitPrice: 10 },
    ]);
    const second = order(api, [
      { productId: a.productId, quantity: 2, unitPrice: 10 },
    ]);
    expect(api.orders.get({ orderId: first })!.status).toBe("on_hold");
    expect(api.orders.get({ orderId: second })!.status).toBe("new");
    expect(
      api.inventory.list().find((i) => i.productId === b.productId),
    ).toMatchObject({ reserved: 0 });
    // Nobody can ship or move it by hand
    expect(
      appError(() =>
        api.orders.updateStatus({ orderId: first, status: "shipped" }),
      ).message,
    ).toMatch(/waiting for stock/);

    // A third order also waits
    const third = order(api, [
      { productId: a.productId, quantity: 1, unitPrice: 10 },
    ]);
    expect(api.orders.get({ orderId: third })!.status).toBe("on_hold");

    // Restocking 3 covers the oldest held order (3) first; the third keeps waiting
    api.inventory.restock({
      productId: a.productId,
      quantity: 3,
      cost: 5,
      restockType: "purchase",
    });
    expect(api.orders.get({ orderId: first })!.status).toBe("new");
    expect(api.orders.get({ orderId: third })!.status).toBe("on_hold");
    expect(api.products.get({ productId: a.productId })!.onHand).toBe(5);
    const notes = api.notifications.list(undefined).map((n) => n.type);
    expect(notes).toContain("order_on_hold");
    expect(notes).toContain("order_released");

    // An upward adjustment releases the next one
    api.inventory.adjust({
      productId: a.productId,
      direction: "increase",
      quantity: 1,
      reason: "found",
    });
    expect(api.orders.get({ orderId: third })!.status).toBe("new");
  });

  it("cancels and reopens; a paid order must be marked unpaid first", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    const id = order(api, [{ productId, quantity: 1, unitPrice: 10 }]);
    api.payments.setPayment({ orderId: id, status: "paid", method: "cash" });
    expect(
      appError(() =>
        api.orders.updateStatus({ orderId: id, status: "cancelled" }),
      ).message,
    ).toMatch(/mark it unpaid/);
    api.payments.setPayment({ orderId: id, status: "unpaid" });
    api.orders.updateStatus({ orderId: id, status: "cancelled" });
    expect(
      appError(() => api.payments.setPayment({ orderId: id, status: "paid" }))
        .code,
    ).toBe("BAD_REQUEST");
    api.orders.updateStatus({ orderId: id, status: "new" });
    expect(api.orders.get({ orderId: id })!.history.at(-1)!.note).toBe(
      "Order reopened",
    );
  });

  it("refunds returned units at line price and restocks sellable units", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    const id = order(api, [{ productId, quantity: 3, unitPrice: 10 }]);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    const line = api.orders.get({ orderId: id })!.lineItems[0];
    api.orders.returnLineItems({
      orderId: id,
      lines: [{ lineItemId: line._id, quantity: 1, sellable: true }],
    });
    let o = api.orders.get({ orderId: id })!;
    expect(o.status).toBe("partially_returned");
    expect(o.total).toBe(20);
    expect(o.refundedAmount).toBe(10);
    expect(api.products.get({ productId })!.onHand).toBe(8);
    api.orders.returnLineItems({
      orderId: id,
      lines: [{ lineItemId: line._id, quantity: 2, sellable: false }],
    });
    o = api.orders.get({ orderId: id })!;
    expect(o.status).toBe("returned");
    expect(o.total).toBe(0);
    // Damaged units are written off straight away, never back in stock
    const p = api.products.get({ productId })!;
    expect(p.onHand).toBe(8);
    expect(p.notSellable).toBe(0);
    expect(
      appError(() =>
        api.orders.returnLineItems({
          orderId: id,
          lines: [{ lineItemId: line._id, quantity: 1, sellable: true }],
        }),
      ).code,
    ).toBe("BAD_REQUEST");
  });

  it("requires a manual refund for a partial return on a custom-total order and caps it at the total", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    const id = order(api, [{ productId, quantity: 2, unitPrice: 10 }], 15);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    const line = api.orders.get({ orderId: id })!.lineItems[0];
    expect(() =>
      api.orders.returnLineItems({
        orderId: id,
        lines: [{ lineItemId: line._id, quantity: 1, sellable: true }],
      }),
    ).toThrow();
    expect(() =>
      api.orders.returnLineItems({
        orderId: id,
        lines: [{ lineItemId: line._id, quantity: 1, sellable: true }],
        manualRefundAmount: 50,
      }),
    ).toThrow();
    api.orders.returnLineItems({
      orderId: id,
      lines: [{ lineItemId: line._id, quantity: 1, sellable: true }],
      manualRefundAmount: 7.5,
    });
    expect(api.orders.get({ orderId: id })!.total).toBe(7.5);
    // A full return refunds whatever is left
    api.orders.returnLineItems({
      orderId: id,
      lines: [{ lineItemId: line._id, quantity: 1, sellable: true }],
    });
    const o = api.orders.get({ orderId: id })!;
    expect(o.total).toBe(0);
    expect(o.refundedAmount).toBe(15);
  });

  it("swaps a line for another variant and records the price difference", () => {
    const { api } = setup();
    const { productId, variantIds } = stockedProduct(api, {
      sku: "T",
      variants: ["S", "M"],
      stock: 5,
      price: 20,
    });
    const id = order(api, [
      { productId, variantId: variantIds[0], quantity: 1, unitPrice: 20 },
    ]);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    const line = api.orders.get({ orderId: id })!.lineItems[0];
    // A replacement on a product with variants needs a variant
    expect(() =>
      api.orders.swapLineItem({
        orderId: id,
        returnLineItemId: line._id,
        returnQuantity: 1,
        returnSellable: true,
        replacementProductId: productId,
        replacementQuantity: 1,
        replacementUnitPrice: 25,
      }),
    ).toThrow();
    api.orders.swapLineItem({
      orderId: id,
      returnLineItemId: line._id,
      returnQuantity: 1,
      returnSellable: true,
      replacementProductId: productId,
      replacementVariantId: variantIds[1],
      replacementQuantity: 1,
      replacementUnitPrice: 25,
    });
    const o = api.orders.get({ orderId: id })!;
    expect(o.status).toBe("swapped");
    expect(o.total).toBe(25);
    expect(o.swapPriceDifference).toBe(5);
    const p = api.products.get({ productId })!;
    expect(p.variants.find((v) => v._id === variantIds[0])!.onHand).toBe(5);
    expect(p.variants.find((v) => v._id === variantIds[1])!.onHand).toBe(4);
  });

  it("edits details after creation and logs the change", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    const id = order(api, [{ productId, quantity: 1, unitPrice: 10 }]);
    const o = api.orders.get({ orderId: id })!;
    api.orders.updateDetails({
      orderId: id,
      customerPhone: "01012345678",
      customer: "John",
      shipmentNumber: o.shipmentNumber,
      notes: "Leave at door",
    });
    const after = api.orders.get({ orderId: id })!;
    expect(after.customer).toBe("John");
    expect(after.history.at(-1)!.note).toBe("Updated customer, notes");
  });

  it("enforces section and status permissions", () => {
    const { db, api, as } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    const id = order(api, [{ productId, quantity: 1, unitPrice: 10 }]);
    const viewer = as(
      addUser(db, "member", {
        access: { orders: "edit" },
        canShipAndReturn: false,
      }),
    );
    expect(viewer.orders.get({ orderId: id })).toBeTruthy();
    expect(
      appError(() =>
        viewer.orders.updateStatus({ orderId: id, status: "shipped" }),
      ).code,
    ).toBe("FORBIDDEN");
    const stranger = as(
      addUser(db, "member", {
        access: { inventory: "edit" },
        canShipAndReturn: true,
      }),
    );
    expect(appError(() => stranger.orders.get({ orderId: id })).code).toBe(
      "FORBIDDEN",
    );
    expect(
      appError(() =>
        stranger.finance.report.report({ fromDay: DAY, toDay: DAY }),
      ).code,
    ).toBe("FORBIDDEN");
  });

  it("deletes an order in Admin Mode, reversing stock and removing its alerts", () => {
    const { db, api, as, admin } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    const id = order(api, [{ productId, quantity: 3, unitPrice: 10 }]);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    expect(
      appError(() => api.admin.destructive.deleteOrder({ orderId: id })).code,
    ).toBe("FORBIDDEN");
    as(admin, true).admin.destructive.deleteOrder({ orderId: id });
    expect(api.orders.get({ orderId: id })).toBeNull();
    expect(api.products.get({ productId })!.onHand).toBe(10);
    expect(api.notifications.list().some((n) => n.orderId === id)).toBe(false);
    const log = api.admin.destructive.listDeletionLogs()[0];
    expect(log.entitySummary).toContain("ORD-0001");
    expect(log.entitySummary).toContain("$30.00");
    expect(
      db.$client.prepare("select count(*) as n from order_line_items").get(),
    ).toEqual({ n: 0 });
  });
});

describe("order search", () => {
  it("finds several orders at once with |", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    const ids = [1, 2, 3].map(() =>
      order(api, [{ productId, quantity: 1, unitPrice: 10 }]),
    );
    api.orders.updateDetails({
      orderId: ids[2],
      customerPhone: "01012345678",
      customer: "Ahmed Ali",
      shipmentNumber: "SHIP-3",
    });
    const numbers = (search: string) =>
      api.orders
        .list({ search })
        .items.map((o) => o.displayOrderNumber)
        .sort();
    expect(numbers("ORD-0001|ORD-0002")).toEqual(["ORD-0001", "ORD-0002"]);
    expect(numbers("ORD-1|ahmed")).toEqual(["ORD-0001", "ORD-0003"]);
    expect(numbers("ahmed ali")).toEqual(["ORD-0003"]);
    expect(numbers("ahmed nobody")).toEqual([]);
  });
});

describe("delivery details and WhatsApp", () => {
  it("stores address, channel and shipping fee, and records WhatsApp posts", () => {
    const { api, db } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 5 });
    const id = api.orders.create({
      orderDate: DAY,
      customer: "Amal",
      address: "التجمع الخامس، فيلا 133",
      channel: "instagram",
      customerPhone: "01012345678",
      shippingFee: 70,
      shipmentNumber: "43893",
      total: 600,
      lineItems: [{ productId, quantity: 1 }],
    });
    let o = api.orders.get({ orderId: id })!;
    expect(o).toMatchObject({
      address: "التجمع الخامس، فيلا 133",
      channel: "instagram",
      customerPhone: "01012345678",
      shippingFee: 70,
      total: 600,
    });

    // Any order that isn't cancelled can be posted, right after it's created
    api.orders.markWhatsAppPosted({ orderId: id });
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    o = api.orders.get({ orderId: id })!;
    expect(o.whatsappPostedAt).toBeTruthy();
    expect(o.history.some((h) => h.note === "Posted to WhatsApp")).toBe(true);

    // The shipping fee is the courier's: revenue counts only the order total
    const { summary } = orderSummary(db, {
      fromDay: "2026-03-01",
      toDay: "2026-03-31",
    });
    expect(summary.netRevenue).toBe(600);

    api.orders.updateDetails({
      orderId: id,
      customerPhone: "01012345678",
      customer: "Amal",
      shipmentNumber: "43893",
      shippingFee: 80,
    });
    expect(api.orders.get({ orderId: id })!).toMatchObject({
      shippingFee: 80,
      channel: "instagram",
      customerPhone: "01012345678",
    });
  });

  it("requires an address and a channel on new orders", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 5 });
    const base = {
      orderDate: DAY,
      customer: "x",
      customerPhone: "01012345678",
      shippingFee: 0,
      shipmentNumber: "S1",
      total: 10,
      lineItems: [{ productId, quantity: 1 }],
    };
    expect(() =>
      api.orders.create({ ...base, address: "", channel: "facebook" }),
    ).toThrow();
    expect(() =>
      api.orders.create({ ...base, address: "Cairo" } as unknown as Parameters<
        typeof api.orders.create
      >[0]),
    ).toThrow();
  });
});

describe("re-recording cancelled orders", () => {
  const base = (productId: string, extra: Record<string, unknown> = {}) => ({
    orderDate: DAY,
    customer: "Mona",
    address: "Maadi",
    channel: "facebook" as const,
    customerPhone: "01012345678",
    shippingFee: 60,
    shipmentNumber: "50001",
    total: 10,
    lineItems: [{ productId, quantity: 1 }],
    ...extra,
  });

  it("only re-records cancelled orders, keeps the shipment number and links both orders", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 5 });
    const first = api.orders.create(base(productId));

    // A new order can't reuse a shipment number, even of a cancelled order
    for (const status of ["new", "shipped"] as const) {
      if (status !== "new") api.orders.updateStatus({ orderId: first, status });
      expect(
        appError(() =>
          api.orders.create(base(productId, { rerecordFromId: first })),
        ).message,
      ).toBe("Only cancelled orders can be re-recorded");
    }

    const { productId: other } = stockedProduct(api, { sku: "B", stock: 5 });
    const second = api.orders.create(base(other, { shipmentNumber: "50002" }));
    api.orders.updateStatus({ orderId: second, status: "cancelled" });
    expect(
      appError(() =>
        api.orders.create(base(other, { shipmentNumber: "50002" })),
      ).code,
    ).toBe("CONFLICT");

    const copy = api.orders.create(
      base(other, { shipmentNumber: "50002", rerecordFromId: second }),
    );
    const c = api.orders.get({ orderId: copy })!;
    expect(c.rerecordedFrom?._id).toBe(second);
    expect(c.history[0].note).toMatch(/^Re-recorded from ORD-/);
    const s = api.orders.get({ orderId: second })!;
    expect(s.rerecordedAs.map((o) => o._id)).toEqual([copy]);

    // Only one active order per shipment number
    expect(
      appError(() =>
        api.orders.create(
          base(other, { shipmentNumber: "50002", rerecordFromId: second }),
        ),
      ).code,
    ).toBe("CONFLICT");
    expect(
      appError(() =>
        api.orders.updateStatus({ orderId: second, status: "new" }),
      ).code,
    ).toBe("CONFLICT");

    // Cancel the copy, re-record it again: the chain keeps the same number
    api.orders.updateStatus({ orderId: copy, status: "cancelled" });
    const third = api.orders.create(
      base(other, { shipmentNumber: "50002", rerecordFromId: copy }),
    );
    expect(api.orders.get({ orderId: third })!.status).toBe("new");

    // Editing another order onto that number is blocked
    expect(
      appError(() =>
        api.orders.updateDetails({
          orderId: first,
          customerPhone: "01012345678",
          customer: "Mona",
          shipmentNumber: "50002",
          shippingFee: 60,
        }),
      ).code,
    ).toBe("CONFLICT");
  });
});

describe("shared notification feed", () => {
  it("tells everyone who did it, and the doer's own copy arrives already read", () => {
    const { api, db, as } = setup();
    const mod = addUser(db, "member", {
      access: { orders: "edit", inventory: "view" },
      canShipAndReturn: false,
    });
    const { productId } = stockedProduct(api, { sku: "A", stock: 5 });
    as(mod).orders.create({
      orderDate: DAY,
      customer: "Hala",
      address: "Nasr City",
      channel: "whatsapp",
      customerPhone: "01012345678",
      shippingFee: 50,
      shipmentNumber: "60001",
      total: 10,
      lineItems: [{ productId, quantity: 1 }],
    });
    const mine = as(mod).notifications.list(undefined)[0];
    expect(mine).toMatchObject({ type: "order_new", byMe: true, read: true });
    const admins = api.notifications.list(undefined)[0];
    expect(admins).toMatchObject({
      type: "order_new",
      byMe: false,
      read: false,
      actorName: mod.name,
    });
  });
});

describe("customer phones", () => {
  const base = (productId: string, extra: Record<string, unknown> = {}) => ({
    orderDate: DAY,
    customer: "Mona",
    address: "Maadi",
    channel: "facebook" as const,
    customerPhone: "01012345678",
    shippingFee: 60,
    shipmentNumber: `P-${Math.random().toString(36).slice(2, 8)}`,
    total: 10,
    lineItems: [{ productId, quantity: 1 }],
    ...extra,
  });

  it("requires an Egyptian mobile or landline and cleans it up; the second phone is optional", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    for (const bad of ["", "0101234567", "01312345678", "022345678", "0123456789"]) {
      expect(
        appError(() =>
          api.orders.create(base(productId, { customerPhone: bad })),
        ).code,
      ).toBe("BAD_REQUEST");
    }
    expect(
      appError(() =>
        api.orders.create(base(productId, { customerPhone2: "12345" })),
      ).message,
    ).toMatch(/Second phone/);
    const id = api.orders.create(
      base(productId, {
        customerPhone: "٠١٢٨٣٣٩١٧٣١",
        customerPhone2: "+20 115 400 1922",
      }),
    );
    expect(api.orders.get({ orderId: id })).toMatchObject({
      customerPhone: "01283391731",
      customerPhone2: "01154001922",
    });
  });
});

describe("start-up re-check", () => {
  it("moves On hold orders to New when their stock is free", async () => {
    const { api, db } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 1 });
    const id = order(api, [{ productId, quantity: 2, unitPrice: 10 }]);
    expect(api.orders.get({ orderId: id })!.status).toBe("on_hold");
    // Stock that arrived without a re-check (e.g. before this update)
    db.$client
      .prepare("update inventory set on_hand = 5 where product_id = ?")
      .run(productId);
    const { releaseHeldOrdersOnStartup } = await import("./orders.ts");
    expect(releaseHeldOrdersOnStartup(db)).toBe(1);
    expect(api.orders.get({ orderId: id })!.status).toBe("new");
  });
});

describe("returns in transit and batch returns", () => {
  const ship = (
    api: ReturnType<typeof setup>["api"],
    productId: string,
    qty: number,
    shipmentNumber: string,
  ) => {
    const id = api.orders.create({
      orderDate: DAY,
      customer: "Nour",
      customerPhone: "01012345678",
      address: "Giza",
      channel: "facebook",
      shippingFee: 50,
      shipmentNumber,
      total: qty * 10,
      lineItems: [{ productId, quantity: qty }],
    });
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    return id;
  };
  const stockOf = (api: ReturnType<typeof setup>["api"], productId: string) =>
    api.inventory.list().find((i) => i.productId === productId)!;

  it("finds orders by shipment or order number with |, and records a mixed batch", () => {
    const { api, db } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 4 });
    const a = ship(api, productId, 2, "70001");
    const b = ship(api, productId, 3, "70002");
    const c = ship(api, productId, 1, "70003");
    const open = api.orders.create({
      orderDate: DAY,
      customer: "x",
      customerPhone: "01012345678",
      address: "y",
      channel: "facebook",
      shippingFee: 0,
      shipmentNumber: "70004",
      total: 10,
      lineItems: [{ productId, quantity: 1 }],
    });

    const found = api.orders.findForReturn({
      numbers: "70001 | 70002\nORD-0003|70004|nope",
    });
    expect(found.map((f) => ("error" in f ? f.error : "ok"))).toEqual([
      "ok",
      "ok",
      "ok",
      "Not shipped",
      "Not found",
    ]);
    expect(open).toBeTruthy();

    // a: received, b: in transit, c: partial isn't possible with 1 unit, so received damaged
    api.orders.batchReturn({
      returns: [
        { orderId: a, inTransit: false },
        { orderId: b, inTransit: true },
        {
          orderId: c,
          inTransit: false,
          lines: [
            {
              lineItemId: api.orders.get({ orderId: c })!.lineItems[0]._id,
              quantity: 1,
              sellable: false,
            },
          ],
        },
      ],
    });
    // 10 - 6 shipped - 1 held for the open order; +2 back from a
    expect(stockOf(api, productId)).toMatchObject({ onHand: 6, reserved: 1 });
    for (const id of [a, b, c]) {
      const o = api.orders.get({ orderId: id })!;
      expect(o.status).toBe("returned");
      expect(o.total).toBe(0); // sale reversed, even while in transit
    }

    // Cost of goods is reversed for all three; the damaged one is a loss
    const { summary } = orderSummary(db, {
      fromDay: "2026-03-01",
      toDay: "2026-03-31",
    });
    expect(summary.netRevenue).toBe(0);
    expect(summary.cogs).toBe(0);
    expect(summary.inventoryLosses).toBe(4);

    const transit = api.orders.returnsInTransit(undefined);
    expect(transit.map((t) => [t.shipmentNumber, t.lines[0].quantity])).toEqual(
      [["70002", 3]],
    );

    api.orders.resolveInTransit({
      orders: [{ orderId: b, outcome: "received" }],
    });
    expect(stockOf(api, productId)).toMatchObject({ onHand: 9 });
    expect(api.orders.returnsInTransit(undefined)).toEqual([]);
  });

  it("partial returns in transit, then lost by the courier", () => {
    const { api, db } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 4 });
    const { productId: other } = stockedProduct(api, {
      sku: "B",
      stock: 10,
      cost: 2,
    });
    const id = api.orders.create({
      orderDate: DAY,
      customer: "x",
      customerPhone: "01012345678",
      address: "y",
      channel: "facebook",
      shippingFee: 0,
      shipmentNumber: "80001",
      total: 30,
      lineItems: [
        { productId, quantity: 2 },
        { productId: other, quantity: 1 },
      ],
    });
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    const lineA = api.orders
      .get({ orderId: id })!
      .lineItems.find((l) => l.productId === productId)!;
    api.orders.batchReturn({
      returns: [
        {
          orderId: id,
          inTransit: true,
          lines: [{ lineItemId: lineA._id, quantity: 1, sellable: true }],
        },
      ],
    });
    let o = api.orders.get({ orderId: id })!;
    expect(o.status).toBe("partially_returned");
    expect(o.total).toBe(20);
    api.orders.resolveInTransit({ orders: [{ orderId: id, outcome: "lost" }] });
    o = api.orders.get({ orderId: id })!;
    expect(o.history.at(-1)!.note).toMatch(/lost in transit/);
    expect(stockOf(api, productId)).toMatchObject({ onHand: 8 });
    const { summary } = orderSummary(db, {
      fromDay: "2026-03-01",
      toDay: "2026-03-31",
    });
    expect(summary.inventoryLosses).toBe(4);
  });

  it("closes what's in transit, and records a direct return when nothing was announced", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 4 });
    const announced = ship(api, productId, 2, "90001");
    const direct = ship(api, productId, 3, "90002");
    // Osama records the courier's statement: 90001 is coming back
    api.orders.batchReturn({ returns: [{ orderId: announced, inTransit: true }] });
    expect(stockOf(api, productId)).toMatchObject({ onHand: 5 });

    // The warehouse keeper types what physically arrived
    const found = api.orders.findForReturn({ numbers: "90001|90002" });
    const [a, b] = found.map((f) => {
      if (!("orderId" in f) || "error" in f) throw new Error(`not usable: ${f.token}`);
      return f;
    });
    expect(a.transit.map((l) => l.quantity)).toEqual([2]);
    expect(b.lines.map((l) => l.returnable)).toEqual([3]);

    const res = api.orders.batchReturn({
      returns: [
        { orderId: announced, inTransit: false, transitReceived: a.transit.map((l) => ({ lineItemId: l.lineItemId })) },
        {
          orderId: direct,
          inTransit: false,
          // 2 of 3 came back; the third stays sold
          lines: [{ lineItemId: b.lines[0].lineItemId, quantity: 2, sellable: true }],
        },
      ],
    });
    expect(res).toMatchObject({ received: 2, inTransit: 0 });
    expect(api.orders.returnsInTransit(undefined)).toEqual([]);
    expect(stockOf(api, productId)).toMatchObject({ onHand: 9 });
    expect(api.orders.get({ orderId: direct })!.status).toBe("partially_returned");
    expect(api.orders.get({ orderId: announced })!.history.at(-1)!.note).toMatch(/back in stock/);
  });
});

describe("not posted to WhatsApp and notification cleanup", () => {
  it("filters orders nobody posted, leaving out cancelled ones", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    const mk = (n: string) =>
      api.orders.create({
        orderDate: DAY,
        customer: "x",
        customerPhone: "01012345678",
        address: "y",
        channel: "facebook",
        shippingFee: 0,
        shipmentNumber: n,
        total: 10,
        lineItems: [{ productId, quantity: 1 }],
      });
    const posted = mk("W1");
    const forgotten = mk("W2");
    const cancelled = mk("W3");
    api.orders.markWhatsAppPosted({ orderId: posted });
    api.orders.updateStatus({ orderId: cancelled, status: "cancelled" });
    const ids = api.orders
      .list({ notPostedToWhatsApp: true })
      .items.map((o) => o._id);
    expect(ids).toEqual([forgotten]);
  });

  it("deletes notifications older than 30 days", async () => {
    const { api, db } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    api.orders.create({
      orderDate: DAY,
      customer: "x",
      customerPhone: "01012345678",
      address: "y",
      channel: "facebook",
      shippingFee: 0,
      shipmentNumber: "N1",
      total: 10,
      lineItems: [{ productId, quantity: 1 }],
    });
    const before = api.notifications.list(undefined).length;
    expect(before).toBeGreaterThan(0);
    const { pruneNotifications } = await import("../lib/notifications.ts");
    expect(pruneNotifications(db, new Date(Date.now() + 29 * 86_400_000))).toBe(
      0,
    );
    expect(pruneNotifications(db, new Date(Date.now() + 31 * 86_400_000))).toBe(
      before,
    );
    expect(api.notifications.list(undefined)).toEqual([]);
  });
});

describe("delayed orders", () => {
  const place = (api: ReturnType<typeof setup>["api"], productId: string, shipOn: string | undefined, customer = "Mona") =>
    api.orders.create({
      address: "Test address",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 70,
      orderDate: DAY,
      customer,
      shipmentNumber: `L-${Math.random().toString(36).slice(2, 8)}`,
      total: 20,
      shipOn,
      lineItems: [{ productId, quantity: 2 }],
    });
  const reserved = (api: ReturnType<typeof setup>["api"], productId: string) =>
    api.inventory.list().find((i) => i.productId === productId)?.reserved;
  const status = (api: ReturnType<typeof setup>["api"], id: string) => api.orders.get({ orderId: id })!.status;

  it("hold no stock, so regular orders come first; queue: regular, delayed, On hold", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 4 });
    const regular = place(api, productId, undefined, "Regular");
    const late = place(api, productId, "2026-03-20", "Late");
    const soon = place(api, productId, "2026-03-12", "Soon");
    const regular2 = place(api, productId, undefined, "Regular 2");
    const held = place(api, productId, undefined, "Held");
    // The delayed ones took nothing: both regular orders got their 4 units
    expect([status(api, late), status(api, soon), status(api, regular2), status(api, held)]).toEqual(["new", "new", "new", "on_hold"]);
    expect(reserved(api, productId)).toBe(4);
    const queue = api.orders.packingQueue();
    expect(queue.map((o) => o._id)).toEqual([regular, regular2, soon, late, held]);
    // Nothing free for the delayed ones right now
    expect(queue.find((o) => o._id === soon)!.stockShort).toEqual([{ label: expect.any(String), needed: 2, available: 0 }]);
    expect(queue.find((o) => o._id === regular)!.stockShort).toEqual([]);
    expect(api.orders.list({ page: 1, pageSize: 25, sort: "number", dir: "asc", delayed: true }).items.map((o) => o._id)).toEqual([late, soon]);
  });

  it("ship only from free stock, never from what other orders hold", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 4 });
    const delayed = place(api, productId, "2026-03-12");
    const a = place(api, productId, undefined, "A");
    place(api, productId, undefined, "B");
    expect(appError(() => api.orders.updateStatus({ orderId: delayed, status: "shipped" })).message).toMatch(
      /^Not enough free stock for .*: 0 free, 2 needed\. The rest is held for other orders\.$/,
    );
    api.orders.updateStatus({ orderId: a, status: "cancelled" });
    api.orders.updateStatus({ orderId: delayed, status: "shipped" });
    expect(status(api, delayed)).toBe("shipped");
    // B still holds its 2
    expect(reserved(api, productId)).toBe(2);
    expect(api.inventory.list().find((i) => i.productId === productId)?.onHand).toBe(2);
  });

  it("cancelling or reopening a delayed order touches no held stock", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 2 });
    const regular = place(api, productId, undefined);
    const delayed = place(api, productId, "2026-03-12");
    api.orders.updateStatus({ orderId: delayed, status: "cancelled" });
    expect(reserved(api, productId)).toBe(2);
    api.orders.updateStatus({ orderId: delayed, status: "new" });
    expect(status(api, delayed)).toBe("new");
    expect(reserved(api, productId)).toBe(2);
    expect(status(api, regular)).toBe("new");
  });

  it("delaying lets go of the stock (releasing On hold orders); removing the delay takes it back or waits", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 2 });
    const first = place(api, productId, undefined, "First");
    const second = place(api, productId, undefined, "Second");
    expect(status(api, second)).toBe("on_hold");

    api.orders.setShipOn({ orderId: first, shipOn: "2026-03-14" });
    expect([status(api, first), status(api, second)]).toEqual(["new", "new"]);
    expect(reserved(api, productId)).toBe(2);

    api.orders.setShipOn({ orderId: first, shipOn: "2026-03-18" });
    api.orders.setShipOn({ orderId: first, shipOn: null });
    expect(status(api, first)).toBe("on_hold");
    expect(api.orders.get({ orderId: first })!.history.map((h) => h.note)).toEqual(
      expect.arrayContaining([
        "Delayed by the customer: ship on 2026-03-14",
        "Ship date moved from 2026-03-14 to 2026-03-18",
        "No longer delayed: ship as usual",
      ]),
    );
    // An On hold order that gets a date is New and holds nothing
    api.orders.setShipOn({ orderId: first, shipOn: "2026-03-20" });
    expect(status(api, first)).toBe("new");
    expect(reserved(api, productId)).toBe(2);
  });

  it("only takes a ship date after today, on open orders", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    expect(appError(() => place(api, productId, DAY)).message).toBe("The ship date must be after today");
    const id = place(api, productId, undefined);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    expect(appError(() => api.orders.setShipOn({ orderId: id, shipOn: "2026-03-20" })).message).toBe(
      "Only New or On hold orders can get a ship date",
    );
  });
});
