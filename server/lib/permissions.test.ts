import { describe, expect, it } from "vitest";
import { addUser, appError, setup, stockedProduct } from "../test/helpers.ts";
import {
  PERMISSION_PRESETS,
  normalizePermissions,
} from "../../shared/constants.ts";

const DAY = "2026-03-10";
const base = {
  orderDate: DAY,
  customer: "x",
  customerPhone: "01012345678",
  address: "Cairo",
  channel: "facebook" as const,
  shippingFee: 70,
  total: 10,
};

describe("permissions", () => {
  it("reads the older stored format", () => {
    expect(
      normalizePermissions({
        sections: ["products", "orders"],
        canChangeStatus: true,
      }),
    ).toEqual({
      access: { inventory: "edit", orders: "edit" },
      canShipAndReturn: true,
    });
    expect(
      normalizePermissions({ sections: ["finance"], canChangeStatus: true }),
    ).toEqual({
      access: {},
      canShipAndReturn: false,
    });
    expect(normalizePermissions(null)).toEqual({
      access: {},
      canShipAndReturn: false,
    });
  });

  it("moderators edit orders (cancel) but can't ship, change stock or see costs", () => {
    const { db, api, as } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 4 });
    const mod = as(
      addUser(db, "member", PERMISSION_PRESETS.moderator.permissions),
    );
    const id = mod.orders.create({
      ...base,
      shipmentNumber: "S1",
      lineItems: [{ productId, quantity: 1 }],
    });
    expect(
      appError(() =>
        mod.orders.updateStatus({ orderId: id, status: "shipped" }),
      ).message,
    ).toMatch(/ship orders/);
    mod.orders.updateStatus({ orderId: id, status: "cancelled" });

    expect(mod.inventory.list().length).toBe(1);
    expect(mod.products.listSellableItems({})[0].avgCost).toBeNull();
    expect(
      appError(() =>
        mod.inventory.restock({
          productId,
          restockType: "purchase",
          quantity: 1,
          cost: 4,
        }),
      ).message,
    ).toMatch(/view Inventory but not change it/);
    expect(
      appError(() => mod.finance.report.report({ fromDay: DAY, toDay: DAY }))
        .code,
    ).toBe("FORBIDDEN");
    expect(appError(() => mod.dashboard.getStats()).code).toBe("FORBIDDEN");
  });

  it("the warehouse lead manages stock, ships and returns, and only views finance", () => {
    const { db, api, as } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 4 });
    const lead = as(
      addUser(db, "member", PERMISSION_PRESETS.warehouseLead.permissions),
    );
    lead.inventory.restock({
      productId,
      restockType: "purchase",
      quantity: 2,
      cost: 4,
    });
    const id = lead.orders.create({
      ...base,
      shipmentNumber: "S1",
      lineItems: [{ productId, quantity: 1 }],
    });
    lead.orders.updateStatus({ orderId: id, status: "shipped" });
    const line = lead.orders.get({ orderId: id })!.lineItems[0];
    lead.orders.returnLineItems({
      orderId: id,
      lines: [{ lineItemId: line._id, quantity: 1, sellable: true }],
    });
    expect(lead.inventory.list()[0].avgCost).toBe(4);
    expect(
      lead.finance.report.report({ fromDay: "2026-03-01", toDay: "2026-03-31" })
        .summary,
    ).toBeTruthy();
    expect(
      appError(() =>
        lead.finance.journal.create({
          date: DAY,
          memo: "Rent",
          lines: [
            { accountId: "a", debit: 5, credit: 0 },
            { accountId: "b", debit: 0, credit: 5 },
          ],
        }),
      ).message,
    ).toMatch(/view Finance but not change it/);
    expect(appError(() => lead.users.listTeam()).code).toBe("FORBIDDEN");
  });
});
