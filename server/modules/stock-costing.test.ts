import { describe, expect, it } from "vitest";
import { appError, setup, stockedProduct, orderSummary } from "../test/helpers.ts";

let shipment = 0;
function order(
  api: ReturnType<typeof setup>["api"],
  productId: string,
  quantity: number,
) {
  return api.orders.create({
    address: "Test address",
    channel: "facebook",
    customerPhone: "01012345678",
    shippingFee: 0,
    orderDate: "2026-03-10",
    customer: "Customer",
    shipmentNumber: `T-${++shipment}`,
    total: quantity * 10,
    lineItems: [{ productId, quantity }],
  });
}

const stock = (api: ReturnType<typeof setup>["api"], productId: string) =>
  api.inventory.list().find((i) => i.productId === productId)!;

describe("stock reservations", () => {
  it("holds stock when an order is placed and only deducts it at shipping", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 5 });
    const first = order(api, productId, 4);
    expect(stock(api, productId)).toMatchObject({
      onHand: 5,
      reserved: 4,
      available: 1,
    });

    // A second order can't promise units the first one holds: it waits On hold
    const second = order(api, productId, 2);
    const held = api.orders.get({ orderId: second })!;
    expect(held.status).toBe("on_hold");
    expect(held.history.at(-1)!.note).toMatch(/2 needed, 1 available/);
    expect(stock(api, productId)).toMatchObject({ reserved: 4, available: 1 });

    api.orders.updateStatus({ orderId: first, status: "shipped" });
    expect(stock(api, productId)).toMatchObject({
      onHand: 1,
      reserved: 0,
      available: 1,
    });
  });

  it("cancelling releases the hold; a reopened order waits On hold until stock is free", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 3 });
    const id = order(api, productId, 3);
    api.orders.updateStatus({ orderId: id, status: "cancelled" });
    expect(stock(api, productId)).toMatchObject({ reserved: 0, available: 3 });

    const other = order(api, productId, 2);
    // Reopening while stock is short puts it On hold, holding nothing
    api.orders.updateStatus({ orderId: id, status: "new" });
    expect(api.orders.get({ orderId: id })!.status).toBe("on_hold");
    expect(stock(api, productId)).toMatchObject({ reserved: 2, available: 1 });
    // Cancelling the other order frees the stock, so it moves to New by itself
    api.orders.updateStatus({ orderId: other, status: "cancelled" });
    expect(api.orders.get({ orderId: id })!.status).toBe("new");
    expect(stock(api, productId)).toMatchObject({ reserved: 3, available: 0 });
  });

  it("deleting an open order releases its hold", () => {
    const { api, as, admin } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 3 });
    const id = order(api, productId, 2);
    as(admin, true).admin.destructive.deleteOrder({ orderId: id });
    expect(stock(api, productId)).toMatchObject({ onHand: 3, reserved: 0 });
  });

  it("swap replacements can't take stock held by other orders", () => {
    const { api } = setup();
    const a = stockedProduct(api, { sku: "A", stock: 2 });
    const b = stockedProduct(api, { sku: "B", stock: 1 });
    const sold = order(api, a.productId, 1);
    api.orders.updateStatus({ orderId: sold, status: "shipped" });
    order(api, b.productId, 1); // holds the only B
    const line = api.orders.get({ orderId: sold })!.lineItems[0];
    const err = appError(() =>
      api.orders.swapLineItem({
        orderId: sold,
        returnLineItemId: line._id,
        returnQuantity: 1,
        returnSellable: true,
        replacementProductId: b.productId,
        replacementQuantity: 1,
        replacementUnitPrice: 10,
      }),
    );
    expect(err.message).toMatch(/held for other orders/);
  });
});

describe("weighted-average costing (IAS 2)", () => {
  it("returns come back at the cost they shipped at, so cost of goods reverses exactly", () => {
    const { api, db } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 4 });
    const id = order(api, productId, 5);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    // Price rises after the sale: average becomes (5×4 + 10×10) / 15 = 8
    api.inventory.restock({
      productId,
      restockType: "purchase",
      quantity: 10,
      cost: 10,
    });
    expect(stock(api, productId).avgCost).toBeCloseTo(8);

    const line = api.orders.get({ orderId: id })!.lineItems[0];
    api.orders.returnLineItems({
      orderId: id,
      lines: [{ lineItemId: line._id, quantity: 5, sellable: true }],
    });
    const returned = api.inventory.listMovements({ types: ["return"] })
      .items[0];
    expect(returned.unitCost).toBe(4);
    // (15×8 + 5×4) / 20 = 7, and the stock value equals what was paid for the units still held
    expect(stock(api, productId)).toMatchObject({ onHand: 20 });
    expect(stock(api, productId).avgCost).toBeCloseTo(7);
    expect(stock(api, productId).assetValue).toBe(140);

    const { summary } = orderSummary(db, {
      fromDay: "2026-03-01",
      toDay: "2026-03-31",
    });
    expect(summary.cogs).toBe(0);
  });

  it("leftover damaged stock from before is written off once at start-up, at its own cost", async () => {
    const { api, db } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 4, cost: 4 });
    db.$client
      .prepare(
        "update inventory set not_sellable = 2, not_sellable_cost = 3 where product_id = ?",
      )
      .run(productId);
    const { releaseHeldOrdersOnStartup } = await import("./orders.ts");
    releaseHeldOrdersOnStartup(db);
    expect(api.products.get({ productId })).toMatchObject({
      onHand: 4,
      notSellable: 0,
    });
    const { summary } = orderSummary(db, {
      fromDay: "2026-01-01",
      toDay: "2026-12-31",
    });
    expect(summary.inventoryLosses).toBe(6);
  });
});

describe("upward stock adjustment", () => {
  it("adds stock at the average cost, returns the movement number and amount, and counts as a gain", () => {
    const { api, db } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 4 });
    const result = api.inventory.adjust({
      productId,
      direction: "increase",
      quantity: 3,
      reason: "count_correction",
      date: "2026-03-09",
      notes: "Warehouse count",
    });
    expect(result).toMatchObject({ onHand: 13, amount: 12 });
    expect(result.movementNumber).toBeGreaterThan(0);
    expect(stock(api, productId)).toMatchObject({ onHand: 13, avgCost: 4 });

    const m = api.inventory.listMovements({ types: ["adjustment"] }).items[0];
    expect(m).toMatchObject({
      quantityChange: 3,
      reason: "count_correction",
      unitCost: 4,
      notes: "Warehouse count",
    });

    const { summary } = orderSummary(db, {
      fromDay: "2026-03-01",
      toDay: "2026-03-31",
    });
    expect(summary.inventoryLosses).toBe(-12);
  });

  it("checks the reason fits the direction", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 1 });
    expect(
      appError(() =>
        api.inventory.adjust({
          productId,
          direction: "increase",
          quantity: 1,
          reason: "lost",
        }),
      ).message,
    ).toMatch(/reason/);
    expect(
      appError(() =>
        api.inventory.adjust({ productId, quantity: 1, reason: "found" }),
      ).message,
    ).toMatch(/reason/);
  });

  it("an item without a cost needs one entered", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A" });
    expect(
      appError(() =>
        api.inventory.adjust({
          productId,
          direction: "increase",
          quantity: 2,
          reason: "found",
        }),
      ).message,
    ).toMatch(/no cost yet/);
    expect(
      appError(() =>
        api.inventory.restock({
          productId,
          restockType: "purchase",
          quantity: 2,
        }),
      ).message,
    ).toMatch(/no cost yet/);
    const r = api.inventory.adjust({
      productId,
      direction: "increase",
      quantity: 2,
      reason: "found",
      cost: 6,
    });
    expect(r.amount).toBe(12);
    expect(stock(api, productId).avgCost).toBe(6);
  });

  it("can be deleted, reversing the stock", () => {
    const { api, as, admin } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 2 });
    const r = api.inventory.adjust({
      productId,
      direction: "increase",
      quantity: 3,
      reason: "found",
    });
    as(admin, true).admin.destructive.deleteMovement({
      movementId: r.movementId,
    });
    expect(stock(api, productId)).toMatchObject({ onHand: 2, avgCost: 4 });
  });
});

describe("correcting a restock's cost", () => {
  it("fixes the average for the batch's units still in stock; units already sold keep their cost", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, {
      sku: "A",
      stock: 10,
      cost: 10,
    });
    // Second batch entered at 30 by mistake (should be 20)
    const { movementId } = api.inventory.restock({
      productId,
      quantity: 10,
      cost: 30,
      restockType: "purchase",
    }) as unknown as { movementId: string };
    const moves = api.inventory.listMovements({
      page: 1,
      pageSize: 50,
    } as never) as {
      items: {
        _id: string;
        type: string;
        unitCost: number | null;
        quantityChange: number;
      }[];
    };
    const batch =
      movementId ??
      moves.items.find((m) => m.type === "restock" && m.unitCost === 30)!._id;
    expect(stock(api, productId)).toMatchObject({ onHand: 20, avgCost: 20 });

    // Sell 15: 5 units are left, all from the wrong batch at most
    const id = api.orders.create({
      orderDate: "2026-03-10",
      customer: "x",
      customerPhone: "01012345678",
      address: "y",
      channel: "facebook",
      shippingFee: 0,
      shipmentNumber: "C1",
      total: 150,
      lineItems: [{ productId, quantity: 15 }],
    });
    api.orders.updateStatus({ orderId: id, status: "shipped" });

    const result = api.inventory.correctCost({
      movementId: batch,
      unitCost: 20,
    });
    expect(result).toMatchObject({ unitsCorrected: 5 });
    // True average was 15 (10 at 10 + 10 at 20): the 5 left are corrected to 15
    expect(stock(api, productId)).toMatchObject({ onHand: 5, avgCost: 15 });
    // A later purchase only dilutes the error: correct back up to 30 and check
    api.inventory.restock({
      productId,
      quantity: 5,
      cost: 15,
      restockType: "purchase",
    });
    api.inventory.correctCost({ movementId: batch, unitCost: 30 });
    // As if the batch had been 30 all along: 5 left at 20 (=100) + 5 at 15 → 175 / 10
    expect(stock(api, productId)).toMatchObject({ onHand: 10, avgCost: 17.5 });
    expect(
      appError(() => api.inventory.correctCost({ movementId: id, unitCost: 1 }))
        .code,
    ).toBe("NOT_FOUND");
  });
});
