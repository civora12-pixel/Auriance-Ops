import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { accounts } from "../db/schema.ts";
import { setup, stockedProduct } from "../test/helpers.ts";
import { setSetting } from "./settings.ts";
import { LEDGER_START_KEY } from "./ledger-sync.ts";

function shop() {
  // 10 November: 10 of 30 days gone
  const { api, db } = setup({ start: "2026-11-10T09:00:00.000Z" });
  setSetting(db, LEDGER_START_KEY, "2026-11-01");
  const id = (key: string) => db.select().from(accounts).where(eq(accounts.systemKey, key)).get()!._id;
  const { productId } = stockedProduct(api, { sku: "A", stock: 2000, cost: 40, price: 100 });
  const ship = (n: number, total: number) => {
    const orderId = api.orders.create({
      address: "Cairo",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 70,
      orderDate: "2026-11-10",
      customer: "Mona",
      shipmentNumber: `S${n}`,
      total,
      lineItems: [{ productId, quantity: total / 100 }],
    });
    api.orders.updateStatus({ orderId, status: "shipped" });
    return orderId;
  };
  const spend = (key: string, amount: number) =>
    api.finance.journal.create({
      date: "2026-11-10",
      memo: key,
      lines: [
        { accountId: id(key), debit: amount, credit: 0 },
        { accountId: id("qnb"), debit: 0, credit: amount },
      ],
    });
  return { api, db, id, ship, spend };
}

describe("dashboard performance", () => {
  it("works out break-even from what's kept of each sale and the month's fixed costs", () => {
    const { api, ship, spend } = shop();
    // 20 orders of 1,000 = 20,000 of sales at a cost of 8,000; 200 of refused shipping
    for (let i = 1; i <= 20; i++) ship(i, 1000);
    spend("refused_shipping", 200);
    const p = api.dashboard.performance();
    const be = p.breakEvenMonth;
    expect(be.sales).toBe(20000);
    // kept: 20,000 − 8,000 − 200 = 11,800 (59%); fixed: 46,405 a month (budget)
    const fixed = 8000 + 35000 + 1315 + 2000 + 90;
    expect(be.breakEven).toBe(Math.round((fixed / 0.59) * 100) / 100);
    expect(be.progressPct).toBe(Math.round((20000 / be.breakEven!) * 10000) / 100);
    expect(be.projected).toBe(60000); // 20,000 in 10 of 30 days
    expect(be.perDay).toBe(Math.round(((be.breakEven! - 20000) / 20) * 100) / 100);
    expect(be.reachedOn).toBeNull();
    expect(be.benchmarks[0]).toMatchObject({ amount: 124132 });
    // Each step can be opened: sales and cost of goods link to their ledgers
    const sales = be.steps.find((s) => s.label === "Sales")!;
    expect(sales.link).toMatchObject({ kind: "account", fromDay: "2026-11-01", toDay: "2026-11-10" });

    // Marketing not recorded yet: a third of the 35,000 budget so far
    expect(p.marketingReturn.fromBudget).toBe(true);
    expect(p.marketingReturn.times).toBe(Math.round((20000 / (35000 / 3)) * 100) / 100);
    expect(p.marketingReturn.needed).toBe(Math.round((be.breakEven! / 35000) * 100) / 100);

    expect(p.orders).toMatchObject({ count: 20, aov: 1000, perDay: 2 });
  });

  it("a stock count taken out and put back for the same value doesn't move break-even", () => {
    const { api, ship, spend } = shop();
    for (let i = 1; i <= 20; i++) ship(i, 1000);
    spend("refused_shipping", 200);
    const before = api.dashboard.performance().breakEvenMonth.breakEven;
    const item = api.inventory.list()[0];
    // Repacking: 500 out (a 20,000 count loss) and 500 back in at the same cost (a 20,000 count gain)
    api.inventory.adjust({ productId: item.productId, direction: "decrease", quantity: 500, reason: "other", notes: "repack" });
    api.inventory.adjust({ productId: item.productId, direction: "increase", quantity: 500, reason: "other", notes: "repack" });
    const be = api.dashboard.performance().breakEvenMonth;
    expect(be.breakEven).toBe(before);
    // A real loss still counts: 1,000 written off lowers what's kept of each sale
    api.inventory.adjust({ productId: item.productId, direction: "decrease", quantity: 25, reason: "lost" });
    const fixed = 8000 + 35000 + 1315 + 2000 + 90;
    expect(api.dashboard.performance().breakEvenMonth.breakEven).toBe(Math.round((fixed / ((11800 - 1000) / 20000)) * 100) / 100);
  });

  it("uses real spending when it's more than the budget, and finds the day break-even was passed", () => {
    const { api, ship, spend } = shop();
    for (let i = 1; i <= 120; i++) ship(i, 1000);
    spend("marketing", 40000); // more than the 35,000 budgeted
    const p = api.dashboard.performance();
    const fixed = 8000 + 40000 + 1315 + 2000 + 90;
    expect(p.breakEvenMonth.breakEven).toBe(Math.round((fixed / 0.6) * 100) / 100);
    expect(p.breakEvenMonth.reachedOn).toBe("2026-11-10");
    expect(p.marketingReturn).toMatchObject({ fromBudget: false, times: 3 });
  });

  it("shows returns as a share of sales and checks the books against the orders shipped", () => {
    const { api, ship } = shop();
    const a = ship(1, 1000);
    ship(2, 1000);
    const line = api.orders.get({ orderId: a })!.lineItems[0];
    api.orders.returnLineItems({ orderId: a, lines: [{ lineItemId: line._id, quantity: 2, sellable: true }] });
    const r = api.dashboard.performance().returnsCost;
    expect(r.pct).toBe(10); // 200 of 2,000
    const check = api.dashboard.salesCheck({ fromDay: "2026-11-10", toDay: "2026-11-10" });
    expect(check).toMatchObject({ shippedValue: 2000, difference: 0, sales: 1800 });
    // The link behind "Orders shipped" lists the same orders
    const listed = api.orders.list({ dateBy: "shipped", fromDay: "2026-11-10", toDay: "2026-11-10" });
    expect(listed.total).toBe(2);
    expect(api.orders.list({ dateBy: "shipped", fromDay: "2026-11-09", toDay: "2026-11-09" }).total).toBe(0);
  });
});
