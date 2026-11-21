import { describe, expect, it } from "vitest";
import { appError, setup, stockedProduct } from "../test/helpers.ts";
import { setSetting } from "../lib/settings.ts";
import { LEDGER_START_KEY } from "../lib/ledger-sync.ts";

describe("marking orders paid", () => {
  it("puts the money in the account chosen (e.g. a custody account), or QNB by default", () => {
    const { api, db } = setup({ start: "2026-11-06T09:00:00.000Z" });
    setSetting(db, LEDGER_START_KEY, "2026-11-01");
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 40, price: 100 });
    const ship = (n: string, phone = "01012345678") => {
      const id = api.orders.create({
        address: "Cairo",
        channel: "facebook",
        customerPhone: phone,
        shippingFee: 0,
        orderDate: "2026-11-06",
        customer: "Mona",
        shipmentNumber: n,
        total: 200,
        lineItems: [{ productId, quantity: 2 }],
      });
      api.orders.updateStatus({ orderId: id, status: "shipped" });
      return id;
    };
    // A landline is accepted on orders now
    const a = ship("P1", "0238221076");
    const b = ship("P2");
    const accounts = api.finance.accounts.list({});
    const bal = (code: number) => api.finance.accounts.list({}).find((x) => x.code === code)!.balance;
    const custody = accounts.find((x) => x.type === "asset" && /custody|عهدة/i.test(x.name) && !x.isAuto)!;
    const before = { custody: bal(custody.code), qnb: bal(14001) };

    api.payments.setPayment({ orderId: a, status: "paid", paidAt: "2026-11-06", accountId: custody._id });
    api.payments.markPaid({ orderIds: [b], paidAt: "2026-11-06" });
    expect(bal(custody.code)).toBe(before.custody + 200);
    expect(bal(14001)).toBe(before.qnb + 200);
    expect(api.orders.get({ orderId: a })!.history.at(-1)!.note).toContain(custody.name);

    // Only asset accounts you can post to
    const payable = accounts.find((x) => x.type === "liability" && !x.isAuto)!;
    expect(appError(() => api.payments.setPayment({ orderId: b, status: "paid", accountId: payable._id })).message).toMatch(
      /account the money arrived/,
    );
    // Unpaid takes it back out
    api.payments.setPayment({ orderId: a, status: "unpaid" });
    expect(bal(custody.code)).toBe(before.custody);
    expect(appError(() => ship("P3", "0123")).message).toMatch(/landline/);
  });
});
