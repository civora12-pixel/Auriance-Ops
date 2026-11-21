import { describe, expect, it } from "vitest";
import { setup, stockedProduct } from "../test/helpers.ts";
import { setSetting } from "./settings.ts";
import { LEDGER_START_KEY } from "./ledger-sync.ts";
import { createCaller } from "../rpc/caller.ts";

const DAY = "2026-03-10";

/** A setup whose ledger starts before the test dates. */
function books(start = "2026-01-01") {
  const s = setup();
  setSetting(s.db, LEDGER_START_KEY, start);
  const balance = (code: number) =>
    s.api.finance.accounts.list({}).find((a) => a.code === code)!.balance;
  const placeOrder = (productId: string, quantity: number, price: number) =>
    s.api.orders.create({
      address: "Cairo",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 50,
      orderDate: DAY,
      customer: "Mona",
      shipmentNumber: `S-${Math.random().toString(36).slice(2, 8)}`,
      total: quantity * price,
      lineItems: [{ productId, quantity }],
    });
  return { ...s, balance, placeOrder };
}

// Account codes
const QNB = 14001,
  AR = 11001,
  INV = 13001,
  TRANSIT = 13002,
  SALES = 40001,
  RETURNS = 40002,
  COGS = 50001,
  LOST = 50008,
  DAMAGED = 50010,
  COUNT_LOSS = 50011,
  CASH = 10001;

describe("automatic ledger entries", () => {
  it("posts purchases, sales, cost of goods and collections", () => {
    const { api, balance, placeOrder } = books();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 40, price: 100 });
    // Purchase paid from QNB by default
    expect(balance(INV)).toBe(400);
    expect(balance(QNB)).toBe(-400);

    const id = placeOrder(productId, 3, 100);
    // Recording the order posts nothing yet
    expect(balance(SALES)).toBe(0);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    expect(balance(AR)).toBe(300);
    expect(balance(SALES)).toBe(300);
    expect(balance(COGS)).toBe(120);
    expect(balance(INV)).toBe(280);

    api.payments.markPaid({ orderIds: [id] });
    expect(balance(AR)).toBe(0);
    expect(balance(QNB)).toBe(-100);

    // Undoing the payment takes the collection back out
    api.payments.setPayment({ orderId: id, status: "unpaid" });
    expect(balance(AR)).toBe(300);
    api.payments.setPayment({ orderId: id, status: "paid", method: "cash" });
    expect(balance(CASH)).toBe(300);

    const page = api.finance.journal.list({ source: "auto" });
    expect(page.items.every((e) => e.source === "auto")).toBe(true);
    expect(page.items.some((e) => e.memo.includes("sale to Mona"))).toBe(true);
  });

  it("reverses sales, cost and receivable through the two-step return", () => {
    const { api, balance, placeOrder } = books();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 40, price: 100 });
    const id = placeOrder(productId, 2, 100);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    const line = api.orders.get({ orderId: id })!.lineItems[0];

    // Step 1: announced, on its way back
    api.orders.returnLineItems({
      orderId: id,
      inTransit: true,
      lines: [{ lineItemId: line._id, quantity: 2, sellable: true }],
    });
    expect(balance(RETURNS)).toBe(-200); // sales returns reduce revenue
    expect(balance(AR)).toBe(0);
    expect(balance(COGS)).toBe(0);
    expect(balance(TRANSIT)).toBe(80);
    expect(balance(INV)).toBe(320);

    // Step 2: the warehouse confirms it arrived
    api.orders.resolveInTransit({ orders: [{ orderId: id, outcome: "received" }] });
    expect(balance(TRANSIT)).toBe(0);
    expect(balance(INV)).toBe(400);
    // Net effect: as if the sale never happened
    expect(balance(SALES) + balance(RETURNS)).toBe(0);
  });

  it("writes off returns lost in transit or damaged", () => {
    const { api, balance, placeOrder } = books();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 40, price: 100 });
    const lost = placeOrder(productId, 1, 100);
    const damaged = placeOrder(productId, 1, 100);
    for (const id of [lost, damaged]) {
      api.orders.updateStatus({ orderId: id, status: "shipped" });
      const line = api.orders.get({ orderId: id })!.lineItems[0];
      api.orders.returnLineItems({
        orderId: id,
        inTransit: true,
        lines: [{ lineItemId: line._id, quantity: 1, sellable: true }],
      });
    }
    const dmgLine = api.orders.get({ orderId: damaged })!.lineItems[0]._id;
    api.orders.resolveInTransit({
      orders: [
        { orderId: lost, outcome: "lost" },
        { orderId: damaged, outcome: "received", damagedLineItemIds: [dmgLine] },
      ],
    });
    expect(balance(LOST)).toBe(40);
    expect(balance(DAMAGED)).toBe(40);
    expect(balance(TRANSIT)).toBe(0);
    expect(balance(INV)).toBe(320);
  });

  it("posts stock adjustments and keeps the inventory account equal to stock value", () => {
    const { api, balance } = books();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 40 });
    api.inventory.adjust({ productId, quantity: 2, reason: "damaged" });
    expect(balance(COUNT_LOSS)).toBe(80);
    expect(balance(INV)).toBe(320);
    const stock = api.products.get({ productId })!;
    expect(balance(INV)).toBe(stock.onHand * stock.avgCost!);
  });

  it("uses the account a purchase was paid from", () => {
    const { api, balance } = books();
    const { productId } = stockedProduct(api, { sku: "A" });
    const card = api.finance.accounts.paymentOptions().find((a) => a.code === 21001)!;
    api.inventory.restock({
      productId,
      restockType: "purchase",
      quantity: 5,
      cost: 20,
      paidFromAccountId: card._id,
    });
    expect(balance(21001)).toBe(100); // owed on the card
    expect(balance(INV)).toBe(100);
  });

  it("carries a cost correction to stock and to the cost of units already sold", () => {
    const { api, balance, placeOrder } = books();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 40, price: 100 });
    const id = placeOrder(productId, 4, 100);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    const restock = api.inventory
      .listMovements({ productId, types: ["restock"] })
      .items.find((m) => m.type === "restock")!;
    api.inventory.correctCost({ movementId: restock._id, unitCost: 50 });
    // Purchase now 500 from QNB; 6 in stock at 50 = 300; the 4 sold cost 10 more each
    expect(balance(QNB)).toBe(-500);
    expect(balance(INV)).toBe(300);
    expect(balance(COGS)).toBe(200);
    const stock = api.products.get({ productId })!;
    expect(balance(INV)).toBeCloseTo(stock.onHand * stock.avgCost!, 2);
  });

  it("ignores everything before the ledger start day", () => {
    const { api, balance } = books("2026-04-01");
    stockedProduct(api, { sku: "A", stock: 10, cost: 40 });
    expect(balance(INV)).toBe(0);
    expect(api.finance.journal.list({}).total).toBe(0);
  });

  it("removes the entries of deleted records, and the books always balance", () => {
    const { api, db, admin, time, placeOrder } = books();
    const { productId } = stockedProduct(api, { sku: "A", stock: 10, cost: 40, price: 100 });
    const id = placeOrder(productId, 1, 100);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    const before = api.finance.journal.list({ source: "auto" }).total;
    const elevated = createCaller(db, admin, {
      now: time.now,
      session: { elevatedUntil: Number.MAX_SAFE_INTEGER },
    });
    elevated.admin.destructive.deleteOrder({ orderId: id });
    const after = api.finance.journal.list({ source: "auto" }).total;
    expect(after).toBeLessThan(before);
    const all = api.finance.accounts.list({});
    const d = all.reduce((s, a) => s + a.debitTotal, 0);
    const c = all.reduce((s, a) => s + a.creditTotal, 0);
    expect(Math.abs(d - c)).toBeLessThan(0.01);
  });
});
