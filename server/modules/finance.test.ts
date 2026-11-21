import { describe, expect, it } from "vitest";
import { appError, setup, stockedProduct } from "../test/helpers.ts";
import { setSetting } from "../lib/settings.ts";
import { LEDGER_START_KEY } from "../lib/ledger-sync.ts";

describe("finance", () => {
  it("builds the overview from the journal, the same as the statements, and matches the dashboard", () => {
    const { api, db } = setup();
    setSetting(db, LEDGER_START_KEY, "2026-03-01");
    const { productId } = stockedProduct(api, {
      sku: "A",
      stock: 10,
      cost: 4,
      price: 10,
    });
    const a = api.orders.create({
      address: "Test address",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 0,
      orderDate: "2026-03-10",
      customer: "a",
      shipmentNumber: "1",
      total: 30,
      lineItems: [{ productId, quantity: 3 }],
    });
    const b = api.orders.create({
      address: "Test address",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 0,
      orderDate: "2026-03-10",
      customer: "b",
      shipmentNumber: "2",
      total: 18,
      lineItems: [{ productId, quantity: 2 }],
    });
    api.orders.updateStatus({ orderId: a, status: "shipped" });
    api.orders.updateStatus({ orderId: b, status: "shipped" });
    const line = api.orders.get({ orderId: a })!.lineItems[0];
    api.orders.returnLineItems({
      orderId: a,
      lines: [{ lineItemId: line._id, quantity: 1, sellable: true }],
    });
    api.payments.setPayment({ orderId: b, status: "paid", method: "card" });

    const range = { fromDay: "2026-03-01", toDay: "2026-03-31" };
    const report = api.finance.report.report(range);
    const statement = api.finance.statements.incomeStatement(range);
    expect(report.summary.totalRevenue).toBe(statement.totalRevenue);
    expect(report.summary.netProfit).toBe(statement.netProfit);
    expect(report.summary.totalRevenue).toBe(38);
    expect(report.summary.totalCosts).toBe(16);
    expect(report.summary.grossProfit).toBe(22);
    expect(report.months).toHaveLength(1);
    expect(report.months[0].revenue).toBe(38);
    expect(report.trend).toHaveLength(12);
    expect(report.receivableBalance).toBe(20);
    expect(report.due.receivables.count).toBe(1);

    const stats = api.dashboard.getStats();
    expect(stats.kpis.salesToday).toBe(38);
    expect(stats.kpis.salesThisMonth).toBe(38);
    expect(stats.returnRate).toBe(50);
  });

  it("buckets revenue by the business timezone", () => {
    const { api, time, db } = setup({ start: "2026-03-10T23:30:00.000Z" });
    setSetting(db, LEDGER_START_KEY, "2026-03-01");
    api.settings.update({
      businessName: "Shop",
      currency: "EGP",
      locale: "en-GB",
      timezone: "Africa/Cairo",
    });
    const { productId } = stockedProduct(api, {
      sku: "A",
      stock: 10,
      price: 10,
    });
    // 23:30 UTC is already the 11th in Cairo
    const id = api.orders.create({
      address: "Test address",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 0,
      orderDate: "2026-03-11",
      customer: "a",
      shipmentNumber: "1",
      total: 10,
      lineItems: [{ productId, quantity: 1 }],
    });
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    expect(
      api.finance.report.report({ fromDay: "2026-03-11", toDay: "2026-03-11" })
        .summary.totalRevenue,
    ).toBe(10);
    expect(
      api.finance.report.report({ fromDay: "2026-03-10", toDay: "2026-03-10" })
        .summary.totalRevenue,
    ).toBe(0);
    expect(api.dashboard.getStats().today).toBe("2026-03-11");
    time.advance(0);
  });

  it("validates the range and settings", () => {
    const { api } = setup();
    expect(
      appError(() =>
        api.finance.report.report({
          fromDay: "2026-03-10",
          toDay: "2026-03-01",
        }),
      ).code,
    ).toBe("BAD_REQUEST");
    expect(
      appError(() =>
        api.settings.update({
          businessName: "x",
          currency: "ZZZ",
          locale: "en-US",
          timezone: "UTC",
        }),
      ).code,
    ).toBe("BAD_REQUEST");
    expect(
      appError(() =>
        api.settings.update({
          businessName: "x",
          currency: "usd",
          locale: "en-US",
          timezone: "Mars/Base",
        }),
      ).code,
    ).toBe("BAD_REQUEST");
    api.settings.update({
      businessName: "x",
      currency: "eur",
      locale: "de-DE",
      timezone: "Europe/Berlin",
    });
    expect(api.settings.get().currency).toBe("EUR");
  });

  it("refuses future paid dates and bulk-marks paid", () => {
    const { api } = setup();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10 });
    const ids = [1, 2, 3].map((n) =>
      api.orders.create({
        address: "Test address",
        channel: "facebook",
        customerPhone: "01012345678",
        shippingFee: 0,
        orderDate: "2026-03-10",
        customer: "a",
        shipmentNumber: String(n),
        total: 10,
        lineItems: [{ productId, quantity: 1 }],
      }),
    );
    expect(
      appError(() =>
        api.payments.setPayment({
          orderId: ids[0],
          status: "paid",
          paidAt: "2026-04-01",
        }),
      ).message,
    ).toMatch(/future/);
    api.orders.updateStatus({ orderId: ids[2], status: "cancelled" });
    expect(
      api.payments.markPaid({ orderIds: [...ids, ids[0]], method: "cash" }),
    ).toEqual({ updated: 2 });
  });
});
