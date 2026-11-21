import { describe, expect, it } from "vitest";
import { addUser, appError, setup, stockedProduct } from "../test/helpers.ts";
import { ALL_PERMISSIONS } from "../../shared/constants.ts";
import { setSetting } from "./settings.ts";
import { LEDGER_START_KEY } from "./ledger-sync.ts";
import { createCaller } from "../rpc/caller.ts";
import { kindOf } from "./courier.ts";

function books() {
  const s = setup();
  setSetting(s.db, LEDGER_START_KEY, "2026-01-01");
  const bal = (code: number) => s.api.finance.accounts.list({}).find((a) => a.code === code)!.balance;
  const { productId } = stockedProduct(s.api, { sku: "A", stock: 20, cost: 40, price: 100 });
  const ship = (shipment: string, qty: number) => {
    const id = s.api.orders.create({
      address: "Cairo",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 70,
      orderDate: "2026-03-10",
      customer: "Mona",
      shipmentNumber: shipment,
      total: qty * 100,
      lineItems: [{ productId, quantity: qty }],
    });
    s.api.orders.updateStatus({ orderId: id, status: "shipped" });
    return id;
  };
  return { ...s, bal, ship };
}

describe("courier settlement sheet", () => {
  it("reads the courier's status text", () => {
    expect(kindOf("تم التسليم ودفع كلى")).toBe("delivered");
    expect(kindOf("تم التسليم ومرتجع جزئى")).toBe("partial");
    expect(kindOf("مرتجع ودفع الشحن")).toBe("returned");
    expect(kindOf("في الطريق")).toBe(null);
  });

  it("matches rows to orders, posts the net to QNB and the courier's cut to shipping fees", () => {
    const { api, bal, ship } = books();
    const a = ship("42337", 3); // 300 owed by the courier
    ship("42898", 2);
    const returned = ship("43233", 1);
    const line = api.orders.get({ orderId: returned })!.lineItems[0];
    api.orders.returnLineItems({
      orderId: returned,
      lines: [{ lineItemId: line._id, quantity: 1, sellable: true }],
    });
    const rows = [
      { shipment: "42337", status: "تم التسليم ودفع كلى", due: 255 },
      { shipment: "42898", status: "تم التسليم ودفع كلى", due: 170 },
      { shipment: "43233", status: "مرتجع ودفع الشحن", due: -5 },
      { shipment: "99999", status: "تم التسليم ودفع كلى", due: 100 },
    ];
    const check = api.finance.courier.check({ rows });
    expect(check.totals.ready).toBe(4);
    expect(check.rows[3]).toMatchObject({ action: "pre_app", ok: true });
    expect(check.rows[3].warning).toContain("No order in the app");
    expect(check.totals.net).toBe(520);
    expect(check.totals.fees).toBe(75); // 45 + 30
    expect(check.totals.refused).toBe(5);

    const arBefore = bal(11001);
    const qnbBefore = bal(14001);
    // The shipment from before the app is left out here
    const sheet = rows.map((r) => (r.shipment === "99999" ? { ...r, treatment: "skip" as const } : r));
    api.finance.courier.post({ date: "2026-03-12", rows: sheet, fileName: "data.xlsx" });
    expect(bal(14001)).toBe(qnbBefore + 420);
    expect(bal(11001)).toBe(arBefore - 500);
    expect(bal(50005)).toBe(75);
    expect(bal(60004)).toBe(5);
    expect(api.orders.get({ orderId: a })!.paymentStatus).toBe("paid");

    // Posting the same sheet again finds nothing new
    expect(api.finance.courier.check({ rows: sheet }).totals.ready).toBe(0);
  });

  it("skips partial returns not recorded yet, and can be undone in Admin Mode", () => {
    const { api, db, admin, time, bal, ship } = books();
    const a = ship("43080", 4);
    const rows = [{ shipment: "43080", status: "تم التسليم ومرتجع جزئى", due: 150 }];
    expect(api.finance.courier.check({ rows }).rows[0].message).toContain("choose the pieces");
    const line = api.orders.get({ orderId: a })!.lineItems[0];
    api.orders.returnLineItems({
      orderId: a,
      lines: [{ lineItemId: line._id, quantity: 2, sellable: true }],
    });
    const res = api.finance.courier.post({ date: "2026-03-12", rows });
    expect(res.posted).toBe(1);
    expect(bal(50005)).toBe(50); // 200 left on the order, 150 transferred
    const elevated = createCaller(db, admin, { now: time.now, session: { elevatedUntil: Number.MAX_SAFE_INTEGER } });
    elevated.finance.courier.remove({ settlementId: res.settlementId });
    expect(api.orders.get({ orderId: a })!.paymentStatus).toBe("unpaid");
    expect(bal(50005)).toBe(0);
  });

  it("records returns in transit, takes partial returns with the pieces chosen, settles pre-app money and posts the bank difference", () => {
    const { api, bal, ship } = books();
    ship("50001", 2); // delivered: 200
    const back = ship("50002", 1); // returned, not yet in the app
    const part = ship("50003", 3); // 1 of 3 came back
    const rows = [
      { shipment: "50001", status: "تم التسليم ودفع كلي", due: 120 },
      { shipment: "50002", status: "مرتجع ولم يدفع الشحن", due: -80 },
      { shipment: "50003", status: "تم التسليم ومرتجع جزئي", due: 150 },
      { shipment: "40001", status: "تم التسليم ودفع كلي", due: 430 }, // from before the app
    ];
    let check = api.finance.courier.check({ rows });
    expect(check.rows.map((r) => [r.action, r.ok])).toEqual([
      ["collect", true],
      ["return", true],
      ["partial_return", false],
      ["pre_app", true],
    ]);
    expect(check.totals.needsInput).toBe(1);
    const lineId = check.rows[2].lines![0].lineItemId;

    const ready = [
      rows[0],
      rows[1],
      { ...rows[2], returnLines: [{ lineItemId: lineId, quantity: 1 }] },
      rows[3],
    ];
    check = api.finance.courier.check({ rows: ready });
    expect(check.totals.ready).toBe(4);
    expect(check.rows[2]).toMatchObject({ refund: 100, receivable: 200, fee: 50 });
    expect(check.rows[3]).toMatchObject({ action: "pre_app", receivable: 430 });
    expect(check.totals.net).toBe(620);

    const qnb = bal(14001);
    const ar = bal(11001);
    // 610 arrived instead of 620
    const res = api.finance.courier.post({ date: "2026-03-12", rows: ready, received: 610 });
    expect(res.difference).toBe(-10);
    expect(bal(14001)).toBe(qnb + 610);
    expect(bal(60007)).toBe(10); // the difference, with the balance differences
    expect(api.orders.get({ orderId: back })!.status).toBe("returned");
    expect(api.orders.returnsInTransit(undefined).map((r) => r.orderId).sort()).toEqual([back, part].sort());
    expect(api.orders.get({ orderId: part })!).toMatchObject({ status: "partially_returned", total: 200, paymentStatus: "paid" });
    // Receivables: 200 + 200 collected, 430 from before the app, and the refunds of the returns (100 + 100)
    expect(bal(11001)).toBe(ar - 200 - 200 - 430 - 100 - 100);
  });

  it("takes a full return when the warehouse got every piece back, though the courier says partial", () => {
    const { api, ship } = books();
    const id = ship("50010", 2);
    const row = { shipment: "50010", status: "تم التسليم ومرتجع جزئي", due: 0 };
    const lineId = api.finance.courier.check({ rows: [row] }).rows[0].lines![0].lineItemId;
    const ready = [{ ...row, returnLines: [{ lineItemId: lineId, quantity: 2 }] }];
    const check = api.finance.courier.check({ rows: ready });
    expect(check.rows[0]).toMatchObject({
      ok: true,
      action: "return",
      asFullReturn: true,
      refused: 0,
      warning: "Posted as a full return: the courier's sheet says partial",
    });
    api.finance.courier.post({ date: "2026-03-12", rows: ready });
    expect(api.orders.get({ orderId: id })).toMatchObject({ status: "returned", total: 0, paymentStatus: "unpaid" });
    expect(api.orders.returnsInTransit(undefined).map((r) => r.orderId)).toEqual([id]);
  });

  it("records the money of a partial return now, and closes the rest when the warehouse records the pieces", () => {
    const { api, bal, ship } = books();
    const id = ship("50020", 5); // 500 of goods (+70 shipping on the order)
    const row = { shipment: "50020", status: "تم التسليم ومرتجع جزئي", due: 250, paid: 370 };
    // Suggested: paid 370 − the order's 70 shipping = 300 collected for the kept pieces
    let check = api.finance.courier.check({ rows: [{ ...row, partial: "later" as const }] });
    expect(check.rows[0]).toMatchObject({ ok: true, action: "partial_collect", suggestedCollected: 300, receivable: 300, fee: 50 });
    expect(check.totals.partials).toBe(1);
    // Without the paid column, it asks for the amount
    check = api.finance.courier.check({ rows: [{ ...row, paid: undefined, partial: "later" as const }] });
    expect(check.rows[0]).toMatchObject({ ok: false, needsInput: true, message: "Enter the amount collected for the pieces the customer kept" });
    expect(api.finance.courier.check({ rows: [{ ...row, partial: "later" as const, collected: 600 }] }).rows[0].message).toBe(
      "The amount collected can't be more than the order total",
    );

    const ar = bal(11001);
    const salesReturns = () => api.finance.accounts.list({}).find((a) => a.name === "Sales returns")!.balance;
    const returnsBefore = salesReturns();
    api.finance.courier.post({ date: "2026-03-12", rows: [{ ...row, partial: "later" as const }] });
    expect(api.orders.get({ orderId: id })).toMatchObject({
      status: "shipped",
      paymentStatus: "paid",
      paidAmount: 300,
      returnPending: true,
      total: 500,
    });
    expect(bal(11001)).toBe(ar - 300);
    expect(api.orders.list({ page: 1, pageSize: 25, sort: "number", dir: "asc", returnPending: true }).items.map((o) => o._id)).toEqual([id]);
    // The dashboard counts the 200 still open
    expect(api.dashboard.getStats().kpis.receivables).toMatchObject({ total: 200, count: 1 });

    // The warehouse gets 1 piece back (worth 100 at list price): it still closes the 200 open
    const line = api.orders.get({ orderId: id })!.lineItems[0];
    api.orders.returnLineItems({ orderId: id, lines: [{ lineItemId: line._id, quantity: 1, sellable: true }] });
    expect(api.orders.get({ orderId: id })).toMatchObject({ status: "partially_returned", total: 300, refundedAmount: 200, returnPending: false });
    expect(bal(11001)).toBe(ar - 500);
    expect(salesReturns()).toBe(returnsBefore - 200); // a contra-revenue account: shown negative
  });

  it("lets an admin correct the price of a shipped, unpaid order; the books take the difference today", () => {
    const { api, bal, ship, db, time } = books();
    const id = ship("50030", 2); // recorded at 200, the courier collects 150
    const ar = bal(11001);
    const sales = bal(40001);

    // Moderators can't
    const moderator = addUser(db, "member", ALL_PERMISSIONS);
    const asModerator = createCaller(db, moderator, { now: time.now, session: {} });
    expect(appError(() => asModerator.orders.correctPrice({ orderId: id, total: 150, reason: "Wrong price" })).message).toMatch(/admin/i);

    api.orders.correctPrice({ orderId: id, total: 150, reason: "Recorded at the wrong price" });
    const o = api.orders.get({ orderId: id })!;
    expect(o).toMatchObject({ total: 150, status: "shipped", shipmentNumber: "50030", hasManualTotal: true });
    expect(o.history.map((h) => h.note).some((n) => /^Price corrected from .*200.* to .*150.*: Recorded at the wrong price$/.test(n ?? ""))).toBe(true);
    expect(bal(11001)).toBe(ar - 50);
    expect(bal(40001)).toBe(sales - 50);
    expect(api.dashboard.getStats().kpis.receivables).toMatchObject({ total: 150 });

    // The courier settles the right amount: no warning, the receivable clears in full
    const check = api.finance.courier.check({ rows: [{ shipment: "50030", status: "تم التسليم ودفع كلي", due: 80 }] });
    expect(check.rows[0]).toMatchObject({ ok: true, action: "collect", receivable: 150, fee: 70 });
    api.finance.courier.post({ date: "2026-03-12", rows: [{ shipment: "50030", status: "تم التسليم ودفع كلي", due: 80 }] });
    expect(bal(11001)).toBe(ar - 200);
    expect(appError(() => api.orders.correctPrice({ orderId: id, total: 160, reason: "again" })).message).toBe(
      "This order is already paid: its price can't be corrected",
    );
  });

  it("can correct a price upwards, and refuses unshipped orders or the same total", () => {
    const { api, bal, ship } = books();
    const id = ship("50031", 1);
    const ar = bal(11001);
    expect(appError(() => api.orders.correctPrice({ orderId: id, total: 100, reason: "x" })).message).toBe("That's already the order's total");
    api.orders.correctPrice({ orderId: id, total: 130, reason: "Missed an item's price" });
    expect(bal(11001)).toBe(ar + 30);
    const fresh = api.orders.create({
      address: "Cairo",
      channel: "facebook",
      customerPhone: "01012345678",
      shippingFee: 70,
      orderDate: "2026-03-10",
      customer: "Mona",
      shipmentNumber: "50032",
      total: 100,
      lineItems: [{ productId: api.inventory.list()[0].productId, quantity: 1 }],
    });
    expect(appError(() => api.orders.correctPrice({ orderId: fresh, total: 90, reason: "x" })).message).toBe(
      "Only shipped orders (not returned) can have their price corrected",
    );
  });
});
