import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { accounts } from "../db/schema.ts";
import { appError, setup, stockedProduct } from "../test/helpers.ts";
import { setSetting } from "./settings.ts";
import { LEDGER_START_KEY } from "./ledger-sync.ts";

describe("day performance", () => {
  it("shows a day's sales, cost of goods, a day of the budget and other costs recorded that day", () => {
    const { api, db } = setup({ start: "2026-11-04T09:00:00.000Z" });
    setSetting(db, LEDGER_START_KEY, "2026-11-01");
    const id = (key: string) => db.select().from(accounts).where(eq(accounts.systemKey, key)).get()!._id;
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 40, price: 100 });
    const order = api.orders.create({
      address: "Cairo",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 70,
      orderDate: "2026-11-04",
      customer: "Mona",
      shipmentNumber: "S1",
      total: 300,
      lineItems: [{ productId, quantity: 3 }],
    });
    api.orders.updateStatus({ orderId: order, status: "shipped" });
    const entry = (key: string, amount: number) =>
      api.finance.journal.create({
        date: "2026-11-04",
        memo: key,
        lines: [
          { accountId: id(key), debit: amount, credit: 0 },
          { accountId: id("qnb"), debit: 0, credit: amount },
        ],
      });
    entry("refused_shipping", 15);
    entry("salaries", 8000); // in the budget: not counted twice

    const d = api.dashboard.dayPerformance({ day: "2026-11-04" });
    expect(d).toMatchObject({ sales: 300, cogs: 120, grossProfit: 180, otherCosts: 15 });
    // 8,000 + 35,000 + 1,315 + 2,000 + 90 a month → 1,546.84 a day (each line rounded)
    expect(d.budgetTotal).toBe(1546.84);
    expect(d.result).toBe(round(180 - 1546.84 - 15));
    expect(d.recorded.find((r) => r.code === 60001)).toMatchObject({ amount: 8000, inBudget: true });

    // Change the budget: only marketing
    api.dashboard.setDayBudget({ items: [{ id: "m", name: "Marketing", monthly: 3000, accountCode: 50003 }] });
    const e = api.dashboard.dayPerformance({ day: "2026-11-04" });
    expect(e.budgetTotal).toBe(100);
    expect(e.otherCosts).toBe(8015); // salaries now count as recorded that day
    expect(api.dashboard.dayPerformance({ day: "2026-11-03" })).toMatchObject({ sales: 0, cogs: 0, otherCosts: 0 });
    expect(appError(() => api.dashboard.setDayBudget({ items: [{ id: "x", name: "", monthly: 1, accountCode: null }] })).code).toBe("BAD_REQUEST");
  });
});

const round = (n: number) => Math.round(n * 100) / 100;

describe("dashboard figures agree with the books", () => {
  const order = (api: ReturnType<typeof setup>["api"], productId: string, quantity: number, total: number, n: string) =>
    api.orders.create({
      address: "Cairo",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 70,
      orderDate: "2026-11-04",
      customer: "Mona",
      shipmentNumber: n,
      total,
      lineItems: [{ productId, quantity }],
    });

  it("counts a stock count gain as other income, not sales, and sales today matches the day", () => {
    const { api, db } = setup({ start: "2026-11-04T09:00:00.000Z" });
    setSetting(db, LEDGER_START_KEY, "2026-11-01");
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 40, price: 100 });
    const a = order(api, productId, 2, 200, "S1");
    const b = order(api, productId, 1, 100, "S2");
    api.orders.updateStatus({ orderId: a, status: "shipped" });
    api.orders.updateStatus({ orderId: b, status: "shipped" });
    const line = api.orders.get({ orderId: a })!.lineItems[0];
    api.orders.returnLineItems({ orderId: a, lines: [{ lineItemId: line._id, quantity: 1, sellable: true }] });
    api.inventory.adjust({ productId, direction: "increase", quantity: 2, reason: "found" });

    const d = api.dashboard.dayPerformance({ day: "2026-11-04" });
    expect(d.sales).toBe(200); // 300 sold − 100 returned; the gain isn't a sale
    expect(d.otherIncome).toBe(80); // 2 found × 40
    expect(d.otherIncomeLines[0]).toMatchObject({ code: 40004, amount: 80 });
    expect(d.result).toBe(round(d.grossProfit + 80 - d.budgetTotal - d.otherCosts));

    const stats = api.dashboard.getStats();
    expect(stats.kpis.salesToday).toBe(d.sales);
    expect(stats.daily.at(-1)!.total).toBe(d.sales);
  });

  it("receivables leave out fully returned orders and show the books' balance", () => {
    const { api, db } = setup({ start: "2026-11-04T09:00:00.000Z" });
    setSetting(db, LEDGER_START_KEY, "2026-11-01");
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 40, price: 100 });
    const a = order(api, productId, 1, 100, "S1");
    const b = order(api, productId, 2, 200, "S2");
    api.orders.updateStatus({ orderId: a, status: "shipped" });
    api.orders.updateStatus({ orderId: b, status: "shipped" });
    const line = api.orders.get({ orderId: a })!.lineItems[0];
    api.orders.returnLineItems({ orderId: a, lines: [{ lineItemId: line._id, quantity: 1, sellable: true }] });

    const { kpis, returnRate, returnedCount, shippedCount } = api.dashboard.getStats();
    expect(kpis.receivables).toEqual({ total: 200, count: 1 });
    expect(kpis.receivablesInBooks).toBe(200);
    expect([returnedCount, shippedCount, returnRate]).toEqual([1, 2, 50]);
    // The card's link lists the same orders
    const due = api.orders.list({ payment: "due" });
    expect(due.items.map((o) => o._id)).toEqual([b]);
  });

  it("counts a swapped order as swapped even after it is returned", () => {
    const { api, db } = setup({ start: "2026-11-04T09:00:00.000Z" });
    setSetting(db, LEDGER_START_KEY, "2026-11-01");
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 40, price: 100 });
    const a = order(api, productId, 1, 100, "S1");
    api.orders.updateStatus({ orderId: a, status: "shipped" });
    const line = api.orders.get({ orderId: a })!.lineItems[0];
    api.orders.swapLineItem({
      orderId: a,
      returnLineItemId: line._id,
      returnQuantity: 1,
      returnSellable: true,
      replacementProductId: productId,
      replacementQuantity: 1,
      replacementUnitPrice: 100,
    });
    let s = api.dashboard.getStats();
    expect([s.swappedCount, s.returnedCount]).toEqual([1, 0]);
    const replacement = api.orders.get({ orderId: a })!.lineItems.find((l) => l.isSwapReplacement)!;
    api.orders.returnLineItems({ orderId: a, lines: [{ lineItemId: replacement._id, quantity: 1, sellable: true }] });
    s = api.dashboard.getStats();
    expect([s.swappedCount, s.returnedCount, s.shippedCount]).toEqual([1, 1, 1]);
  });
});
