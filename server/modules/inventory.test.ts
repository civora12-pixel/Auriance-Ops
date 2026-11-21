import { describe, expect, it } from "vitest";
import { appError, setup, stockedProduct } from "../test/helpers.ts";

describe("inventory", () => {
  it("keeps a weighted average cost", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 4 });
    api.inventory.restock({
      productId,
      restockType: "purchase",
      quantity: 10,
      cost: 6,
    });
    const p = api.products.get({ productId })!;
    expect(p.onHand).toBe(20);
    expect(p.avgCost).toBeCloseTo(5);
  });

  it("caps adjustments at on-hand and rejects non-integer quantities", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 3 });
    expect(
      appError(() =>
        api.inventory.adjust({ productId, quantity: 4, reason: "lost" }),
      ).code,
    ).toBe("BAD_REQUEST");
    expect(
      appError(() =>
        api.inventory.restock({
          productId,
          restockType: "purchase",
          quantity: 1.5,
        }),
      ).code,
    ).toBe("BAD_REQUEST");
    api.inventory.adjust({ productId, quantity: 3, reason: "damaged" });
    expect(api.products.get({ productId })!.onHand).toBe(0);
  });

  it("refuses future dates", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A" });
    expect(
      appError(() =>
        api.inventory.restock({
          productId,
          restockType: "purchase",
          quantity: 1,
          cost: 1,
          date: "2026-03-12",
        }),
      ).message,
    ).toMatch(/future/);
  });

  it("deleting a restock reverses it, but never below zero", () => {
    const { api, as, admin } = setup();
    const { productId } = stockedProduct(api, { sku: "A" });
    const r = api.inventory.restock({
      productId,
      restockType: "purchase",
      quantity: 5,
      cost: 2,
    });
    api.inventory.adjust({ productId, quantity: 3, reason: "lost" });
    const elevated = as(admin, true);
    expect(
      appError(() =>
        elevated.admin.destructive.deleteMovement({ movementId: r.movementId }),
      ).code,
    ).toBe("CONFLICT");
    expect(api.products.get({ productId })!.onHand).toBe(2);
  });

  it("refuses to delete a movement that belongs to an order", () => {
    const { api, as, admin } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 5 });
    const orderId = api.orders.create({
      address: "Test address",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 0,
      orderDate: "2026-03-10",
      customer: "x",
      shipmentNumber: "1",
      total: 10,
      lineItems: [{ productId, quantity: 1 }],
    });
    api.orders.updateStatus({ orderId, status: "shipped" });
    const shipment = api.inventory.listMovements({ types: ["shipment"] })
      .items[0];
    expect(
      appError(() =>
        as(admin, true).admin.destructive.deleteMovement({
          movementId: shipment._id,
        }),
      ).message,
    ).toMatch(/ORD-0001/);
  });

  it("raises and clears low-stock alerts", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, {
      sku: "A",
      stock: 5,
      threshold: 4,
    });
    api.inventory.adjust({ productId, quantity: 2, reason: "lost" });
    expect(api.notifications.list().some((n) => n.type === "low_stock")).toBe(
      true,
    );
    api.inventory.restock({ productId, restockType: "purchase", quantity: 10 });
    expect(api.inventory.lowStock().length).toBe(0);
  });
});

describe("inactive stock still counts", () => {
  it("keeps inactive products and sizes in units and value, but not in low-stock alerts", () => {
    const { api } = setup();
    const { productId, variantIds } = stockedProduct(api, {
      sku: "TEE",
      variants: ["S", "M"],
      stock: 4,
      cost: 10,
    });
    const { productId: other } = stockedProduct(api, {
      sku: "MUG",
      stock: 3,
      cost: 5,
      threshold: 10,
    });

    api.products.setVariantActive({
      variantId: variantIds[1],
      isActive: false,
    });
    api.products.setActive({ productId: other, isActive: false });

    const tee = api.products.get({ productId })!;
    expect(tee.totalOnHand).toBe(8);
    const list = api.products.list({ activeFilter: "all" });
    expect(list.find((p) => p._id === other)!.stockValue).toBe(15);
    expect(list.find((p) => p._id === productId)!.stockValue).toBe(80);

    const stats = api.dashboard.getStats(undefined);
    expect(stats.totalOnHand).toBe(11);
    expect(stats.lowStockItems.some((i) => i.productId === other)).toBe(false);
  });
});
