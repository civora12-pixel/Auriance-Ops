import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { accounts, orders } from "../db/schema.ts";
import { setup, stockedProduct } from "../test/helpers.ts";
import { setSetting } from "./settings.ts";
import { LEDGER_START_KEY } from "./ledger-sync.ts";
import { cashFlow } from "./cashflow.ts";

function books() {
  const s = setup({ start: "2026-10-31T09:00:00.000Z" });
  setSetting(s.db, LEDGER_START_KEY, "2026-09-01");
  const id = (key: string) => s.db.select().from(accounts).where(eq(accounts.systemKey, key)).get()!._id;
  const entry = (date: string, debitKey: string, creditKey: string, amount: number, dueDay?: string) =>
    s.api.finance.journal.create({
      date,
      memo: `Entry ${amount}`,
      dueDay,
      lines: [
        { accountId: id(debitKey), debit: amount, credit: 0 },
        { accountId: id(creditKey), debit: 0, credit: amount },
      ],
    });
  const { productId } = stockedProduct(s.api, { sku: "A", stock: 20, price: 100 });
  let n = 0;
  const order = (total: number, orderDate = "2026-10-31") =>
    s.api.orders.create({
      address: "Cairo",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 50,
      orderDate,
      customer: `C${++n}`,
      shipmentNumber: `S${n}`,
      total,
      lineItems: [{ productId, quantity: 1 }],
    });
  return { ...s, entry, order };
}

describe("cash flow", () => {
  it("puts money in and out on its due date and flags the weeks that run short", () => {
    const { db, api, entry, order } = books();
    // 1,080 in, 80 of it spent on the stock bought in books()
    entry("2026-10-01", "qnb", "loan_osama", 1080);
    // Card charges: Oct 5 → due Nov 15; Oct 25 → due Dec 15
    entry("2026-10-05", "prepaid_marketing", "credit_card", 1500);
    entry("2026-10-25", "prepaid_marketing", "credit_card", 200);
    // A supplier bill due Nov 3, and one with no date
    entry("2026-10-20", "prepaid_marketing", "accounts_payable", 300, "2026-11-03");
    entry("2026-10-21", "prepaid_marketing", "accounts_payable", 80);

    // Shipped Oct 10 → overdue since Oct 24; shipped today → due Nov 14
    const late = order(400);
    const fresh = order(250);
    api.orders.updateStatus({ orderId: late, status: "shipped" });
    api.orders.updateStatus({ orderId: fresh, status: "shipped" });
    db.update(orders).set({ shippedAt: "2026-10-10T10:00:00.000Z" }).where(eq(orders._id, late)).run();
    // Captured today, not shipped yet → expected Nov 14
    order(120);

    const cf = cashFlow(db, "2026-10-31", 8);
    expect(cf.startCash).toBe(1000);
    expect(cf.buckets[0]).toMatchObject({ from: "2026-10-31", to: "2026-11-06", inflow: 400, outflow: 300, closing: 1100 });
    expect(cf.buckets[0].items.find((i) => i.kind === "collection")).toMatchObject({ day: "2026-10-24", overdue: true });
    // Nov 14–20: today's shipped and unshipped orders come in, the card bill goes out
    expect(cf.buckets[2]).toMatchObject({ from: "2026-11-14", inflow: 370, outflow: 1500, closing: -30 });
    expect(cf.gaps[0]).toMatchObject({ from: "2026-11-14", shortBy: 30 });
    expect(cf.buckets[6]).toMatchObject({ from: "2026-12-12", outflow: 200, closing: -230 });
    expect(cf.totals).toMatchObject({ inflow: 770, outflow: 2000, endCash: -230, overdue: 400 });
    expect(cf.owedUndated.map((a) => [a.code, a.balance])).toContainEqual([20001, 80]);
    const keys = cf.tips.map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(["gap", "overdue", "pay_ok", "unshipped", "undated_wait"]));

    // Paying the supplier and collecting the late order takes them off the timeline
    api.finance.journal.setSettled({ entryId: api.finance.journal.list({}).items.find((e) => e.dueDay)!._id, settled: true });
    api.payments.setPayment({ orderId: late, status: "paid" });
    const after = cashFlow(db, "2026-10-31", 8);
    expect(after.buckets[0]).toMatchObject({ inflow: 0, outflow: 0 });
    expect(after.startCash).toBeGreaterThan(1000);
  });
});
