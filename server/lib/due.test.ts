import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { accounts, notifications, orders } from "../db/schema.ts";
import { appError, setup, stockedProduct } from "../test/helpers.ts";
import { creditCardDueDay } from "../../shared/dates.ts";
import { setSetting } from "./settings.ts";
import { LEDGER_START_KEY } from "./ledger-sync.ts";
import { creditCardDue, customPayables, receivablesDue, sendDueReminders } from "./due.ts";

describe("credit card due dates", () => {
  it("1st–19th: the 15th of next month; from the 20th: the 15th of the month after", () => {
    expect(creditCardDueDay("2026-10-01")).toBe("2026-11-15");
    expect(creditCardDueDay("2026-10-19")).toBe("2026-11-15");
    expect(creditCardDueDay("2026-10-20")).toBe("2026-12-15");
    expect(creditCardDueDay("2026-10-31")).toBe("2026-12-15");
    expect(creditCardDueDay("2026-12-25")).toBe("2027-02-15");
  });
});

function books(start = "2026-10-01T09:00:00.000Z") {
  const s = setup({ start });
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
  return { ...s, id, entry };
}

describe("what's coming due", () => {
  it("groups credit card charges by due date and clears the oldest first when it's paid", () => {
    const { db, entry } = books();
    entry("2026-09-05", "prepaid_marketing", "credit_card", 1000);
    entry("2026-09-25", "prepaid_marketing", "credit_card", 400);
    entry("2026-09-28", "prepaid_marketing", "credit_card", 100);
    expect(creditCardDue(db)).toEqual([
      { dueDay: "2026-10-15", amount: 1000 },
      { dueDay: "2026-11-15", amount: 500 },
    ]);
    // A payment of 1,200 settles the October bill and 200 of November's
    entry("2026-10-01", "credit_card", "qnb", 1200);
    expect(creditCardDue(db)).toEqual([{ dueDay: "2026-11-15", amount: 300 }]);
  });

  it("lists payables with a due date until they're marked settled", () => {
    const { db, api, entry } = books();
    const id = entry("2026-09-20", "prepaid_marketing", "accounts_payable", 750, "2026-10-10");
    entry("2026-09-21", "prepaid_marketing", "accounts_payable", 50);
    expect(customPayables(db)).toMatchObject([{ entryId: id, dueDay: "2026-10-10", amount: 750 }]);
    api.finance.journal.setSettled({ entryId: id, settled: true });
    expect(customPayables(db)).toEqual([]);
    const plain = api.finance.journal.list({}).items.find((e) => !e.dueDay)!;
    expect(appError(() => api.finance.journal.setSettled({ entryId: plain._id, settled: true })).code).toBe("BAD_REQUEST");
  });

  it("counts shipped unpaid orders as due two weeks after shipping", () => {
    const { db, api } = books();
    const { productId } = stockedProduct(api, { sku: "A", stock: 5, price: 100 });
    const make = (n: number) =>
      api.orders.create({
        address: "Cairo",
        channel: "facebook",
        customerPhone: "01012345678",
        shippingFee: 50,
        orderDate: "2026-10-01",
        customer: `C${n}`,
        shipmentNumber: `S${n}`,
        total: 100,
        lineItems: [{ productId, quantity: 1 }],
      });
    const late = make(1);
    const fresh = make(2);
    api.orders.updateStatus({ orderId: late, status: "shipped" });
    api.orders.updateStatus({ orderId: fresh, status: "shipped" });
    db.update(orders).set({ shippedAt: "2026-09-10T10:00:00.000Z" }).where(eq(orders._id, late)).run();
    const due = receivablesDue(db, "2026-10-01");
    expect(due.count).toBe(2);
    expect(due.overdue).toMatchObject({ count: 1, amount: 100 });
    expect(due.overdue.orders[0]).toMatchObject({ customer: "C1", dueDay: "2026-09-24", daysLate: 7 });
    expect(due.notDue.count).toBe(1);
  });

  it("reminds once, the day before", () => {
    const { db, api, entry } = books("2026-10-14T08:00:00.000Z");
    entry("2026-09-05", "prepaid_marketing", "credit_card", 1000);
    entry("2026-09-30", "prepaid_marketing", "accounts_payable", 300, "2026-10-20");
    const { productId } = stockedProduct(api, { sku: "A", stock: 5, price: 100 });
    const o = api.orders.create({
      address: "Cairo",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 50,
      orderDate: "2026-10-01",
      customer: "Mona",
      shipmentNumber: "S1",
      total: 100,
      lineItems: [{ productId, quantity: 1 }],
    });
    api.orders.updateStatus({ orderId: o, status: "shipped" });
    db.update(orders).set({ shippedAt: "2026-10-01T10:00:00.000Z" }).where(eq(orders._id, o)).run();

    // Oct 14: the card is due tomorrow (Oct 15), and so are orders shipped on Oct 1
    expect(sendDueReminders(db, new Date("2026-10-14T08:00:00.000Z"))).toBe(2);
    expect(sendDueReminders(db, new Date("2026-10-14T09:00:00.000Z"))).toBe(0);
    const titles = db.select().from(notifications).all().map((n) => n.title);
    expect(titles).toContain("Credit card payment due 2026-10-15");
    expect(titles).toContain("Courier collection due 2026-10-15: 1 orders");
    // The payable's reminder waits for Oct 19
    expect(sendDueReminders(db, new Date("2026-10-19T08:00:00.000Z"))).toBe(1);
  });
});
