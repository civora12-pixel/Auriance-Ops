import { describe, expect, it } from "vitest";
import { appError, setup, stockedProduct } from "../test/helpers.ts";
import { createCaller } from "../rpc/caller.ts";
import { allocate, splitByShares } from "./closing.ts";
import type { PartnerShare } from "./closing.ts";

/** The business on 30 October with stock bought before the ledger starts, then opened. */
function opened() {
  const s = setup({ start: "2026-10-30T10:00:00.000Z" });
  const { productId } = stockedProduct(s.api, { sku: "A", stock: 10, cost: 40, price: 100 });
  const accounts = () => s.api.finance.accounts.list({});
  const bal = (code: number) => accounts().find((a) => a.code === code)!.balance;
  const draft = s.api.finance.closing.opening().draft;
  const filled = {
    ...draft,
    balances: {
      ...draft.balances,
      "14001": 50000, // QNB
      "14002": 0,
      "15001": 3000, // Meta balance
      "15003": 1000, // pack material
      "21004": 0,
      "21005": 0,
      "21006": 0,
      "21007": 0,
      "21008": 0, // charity payable
    },
  };
  return { ...s, productId, bal, filled };
}

const placeOrder = (api: ReturnType<typeof setup>["api"], productId: string, quantity: number) =>
  api.orders.create({
    address: "Cairo",
    channel: "facebook",
    customerPhone: "01012345678",
    shippingFee: 50,
    orderDate: "2026-11-05",
    customer: "Mona",
    shipmentNumber: `S-${Math.random().toString(36).slice(2, 8)}`,
    total: quantity * 100,
    lineItems: [{ productId, quantity }],
  });

describe("sharing a result", () => {
  const shares: PartnerShare[] = [
    { accountId: "a", code: 30001, name: "A", capital: 75, sharePct: 75 },
    { accountId: "b", code: 30002, name: "B", capital: 25, sharePct: 25 },
  ];
  it("takes 3% charity and the compensation from a profit, both on the full profit", () => {
    // 15% compensation: 10% to Hazar, 5% to Osama
    const a = allocate(10000, shares, { osama: 5, hazar: 10 });
    expect(a.charity).toBe(300);
    expect(a.compensation).toBe(1500);
    expect(a.compensationHazar).toBe(1000);
    expect(a.compensationOsama).toBe(500);
    expect(a.toPartners).toBe(8200);
    expect(a.partners.map((p) => p.amount)).toEqual([6150, 2050]);
  });
  it("shares a loss in full, with no charity or compensation", () => {
    const a = allocate(-1000, shares, { osama: 5, hazar: 10 });
    expect(a.charity).toBe(0);
    expect(a.compensation).toBe(0);
    expect(a.partners.map((p) => p.amount)).toEqual([-750, -250]);
  });
  it("splits to the cent", () => {
    expect(splitByShares(100, [1, 1, 1]).reduce((s, n) => s + n, 0)).toBe(100);
  });
});

describe("opening balances", () => {
  it("starts from the agreed figures and takes stock from the app", () => {
    const { api } = opened();
    const { preview } = api.finance.closing.opening();
    const row = (code: number) => preview.rows.find((r) => r.account.code === code)!;
    expect(row(13001).balance).toBe(400); // 10 × 40 from the app
    expect(row(13001).fromApp).toBe(true);
    expect(row(17001).balance).toBe(15000);
    expect(row(21003).balance).toBe(666.66);
    expect(preview.capital).toBe(131033.25);
    expect(preview.missing).toContain(14001); // QNB still to type
  });

  it("posts the opening, shares the untracked result by capital and starts the ledger", () => {
    const { api, bal, filled } = opened();
    expect(appError(() => api.finance.closing.postOpening(api.finance.closing.opening().draft)).code).toBe(
      "BAD_REQUEST",
    );
    const preview = api.finance.closing.previewOpening(filled);
    api.finance.closing.postOpening(filled);
    expect(bal(14001)).toBe(50000);
    expect(bal(13001)).toBe(400);
    expect(bal(16002)).toBe(-270);
    expect(bal(31001)).toBe(0); // income summary emptied
    const capitals = api.finance.accounts
      .list({})
      .filter((a) => a.group === "Partners' capital")
      .reduce((s, a) => s + a.balance, 0);
    expect(capitals).toBeCloseTo(131033.25 + preview.difference, 2);
    const all = api.finance.accounts.list({});
    expect(all.reduce((s, a) => s + a.debitTotal - a.creditTotal, 0)).toBeCloseTo(0, 2);
    expect(api.finance.closing.overview().lockedThrough).toBe("2026-10-31");
  });
});

describe("monthly closing", () => {
  it("closes a month: explains differences, closes revenue and expenses, shares the result and locks it", () => {
    const { api, db, admin, time, productId, bal, filled } = opened();
    api.finance.closing.postOpening(filled);
    const capitalBefore = bal(30002); // Hazar

    time.set("2026-11-10T10:00:00.000Z");
    const id = placeOrder(api, productId, 3);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    api.payments.markPaid({ orderIds: [id] });
    expect(bal(14001)).toBe(50300);

    // Can't close a month that hasn't ended
    const draft = api.finance.closing.month({ month: "2026-11" }).draft;
    expect(appError(() => api.finance.closing.lockMonth({ month: "2026-11", draft })).code).toBe(
      "BAD_REQUEST",
    );

    time.set("2026-12-02T10:00:00.000Z");
    api.finance.closing.refresh();
    // The bank shows 500 less than the books: 400 was Meta ads, 100 unknown
    const closeDraft = {
      ...draft,
      balances: { "14001": 49800 },
      explanations: { "14001": [{ code: 50003, amount: 400 }] },
    };
    const p = api.finance.closing.previewMonth({ month: "2026-11", draft: closeDraft });
    // Sales 300 − cost 120 − marketing 400 − unidentified 100 − depreciation 90
    expect(p.result).toBe(-410);
    expect(p.allocation.charity).toBe(0);
    api.finance.closing.lockMonth({ month: "2026-11", draft: closeDraft });

    expect(bal(14001)).toBe(49800);
    expect(bal(50003)).toBe(0); // expenses closed to zero
    expect(bal(40001)).toBe(0);
    expect(bal(31001)).toBe(0);
    expect(bal(30002)).toBeLessThan(capitalBefore); // Hazar took part of the loss

    // The month is closed: no manual entries dated in it
    const card = api.finance.accounts.list({}).find((a) => a.code === 21001)!;
    const tips = api.finance.accounts.list({}).find((a) => a.code === 50006)!;
    expect(
      appError(() =>
        api.finance.journal.create({
          date: "2026-11-20",
          memo: "late tip",
          lines: [
            { accountId: tips._id, debit: 10, credit: 0 },
            { accountId: card._id, debit: 0, credit: 10 },
          ],
        }),
      ).message,
    ).toContain("closed");

    // A purchase dated inside the closed month is posted on the first open day instead
    api.inventory.restock({ productId, restockType: "purchase", quantity: 1, cost: 40, date: "2026-11-20" });
    const late = api.finance.journal.list({ source: "auto" }).items.find((e) => e.memo.includes("after closing"))!;
    expect(late.date).toBe("2026-12-01");

    // Reopening (Admin Mode) removes the closing entries
    const elevated = createCaller(db, admin, {
      now: time.now,
      session: { elevatedUntil: Number.MAX_SAFE_INTEGER },
    });
    elevated.finance.closing.reopen({ period: "2026-11" });
    expect(bal(31001)).toBe(0);
    expect(bal(40001)).toBe(300);
    expect(api.finance.closing.overview().lockedThrough).toBe("2026-10-31");
  });

  it("charges charity and compensation on a profit and records partner withdrawals", () => {
    const { api, time, productId, bal, filled } = opened();
    api.finance.closing.postOpening(filled);
    time.set("2026-11-10T10:00:00.000Z");
    const id = placeOrder(api, productId, 10);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    time.set("2026-12-02T10:00:00.000Z");
    api.finance.closing.refresh();
    const draft = api.finance.closing.month({ month: "2026-11" }).draft;
    expect(draft).toMatchObject({ compensationOsamaPct: 5, compensationHazarPct: 10 });
    const p = api.finance.closing.previewMonth({ month: "2026-11", draft });
    // Sales 1000 − cost 400 − depreciation 90
    expect(p.result).toBe(510);
    expect(p.allocation.charity).toBe(15.3);
    expect(p.allocation.compensation).toBe(76.5);
    expect(p.allocation.compensationHazar).toBe(51);
    expect(p.allocation.compensationOsama).toBe(25.5);
    const qnbBefore = bal(14001);
    api.finance.closing.lockMonth({ month: "2026-11", draft });
    expect(bal(14001)).toBe(qnbBefore); // charity isn't paid at closing…
    expect(bal(21008)).toBe(15.3); // …it's owed in Charity payable until paid
    expect(bal(21005)).toBe(51); // owed to Hazar (10%)
    expect(bal(21004)).toBe(25.5); // owed to Osama (5%)

    // Engy decides to withdraw her share
    const engy = api.finance.accounts.list({}).find((a) => a.code === 30005)!;
    const engyShare = p.allocation.partners.find((x) => x.code === 30005)!.amount;
    api.finance.closing.partnerWithdrawal({ accountId: engy._id, amount: engyShare, date: "2026-12-02" });
    expect(bal(21007)).toBe(engyShare);
    expect(api.finance.closing.partnersOwed()).toMatchObject({ partners: [{ name: "Engy", owed: engyShare }], unassigned: 0 });

    // A withdrawal typed as a journal entry belongs to the partner whose capital it reduces, also after an edit
    const accounts = api.finance.accounts.list({});
    const hazar = accounts.find((a) => a.code === 30002)!;
    const payable = accounts.find((a) => a.code === 21007)!;
    const lines = (n: number) => [
      { accountId: hazar._id, debit: n, credit: 0 },
      { accountId: payable._id, debit: 0, credit: n },
    ];
    const entryId = api.finance.journal.create({ date: "2026-12-02", memo: "Hazar takes 30", lines: lines(30) });
    api.finance.journal.update({ entryId, date: "2026-12-02", memo: "Hazar takes 25", lines: lines(25) });
    expect(api.finance.closing.partnersOwed().partners.find((r) => r.name === "Hazar")?.owed).toBe(25);
  });

  it("takes each partner's choice at the closing: some take profit out, the rest is reinvested, owed partner by partner until paid", () => {
    const { api, time, productId, bal, filled, db, admin } = opened();
    api.finance.closing.postOpening(filled);
    time.set("2026-11-10T10:00:00.000Z");
    const id = placeOrder(api, productId, 10);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    time.set("2026-12-02T10:00:00.000Z");
    api.finance.closing.refresh();
    const base = api.finance.closing.month({ month: "2026-11" }).draft;
    const share = (code: number) => api.finance.closing.previewMonth({ month: "2026-11", draft: base }).allocation.partners.find((x) => x.code === code)!.amount;
    const osama = share(30001);
    const engy = share(30005);
    const hazar = share(30002);
    const capital = (code: number) => bal(code);
    const osamaBefore = capital(30001);
    const engyBefore = capital(30005);
    const hazarBefore = capital(30002);

    // Too much is refused
    const tooMuch = { ...base, withdrawals: { "30005": engy + 1 } };
    expect(api.finance.closing.previewMonth({ month: "2026-11", draft: tooMuch }).withdrawals.find((w) => w.code === 30005)!.error).toBe(
      "More than this partner's profit share",
    );
    expect(appError(() => api.finance.closing.lockMonth({ month: "2026-11", draft: tooMuch })).message).toBe(
      "Engy can't take out more than their profit share",
    );

    // Osama takes all his profit out, Engy takes 10, everyone else reinvests
    const draft = { ...base, withdrawals: { "30001": osama, "30005": 10 } };
    const p = api.finance.closing.previewMonth({ month: "2026-11", draft });
    expect(p.withdrawals.find((w) => w.code === 30001)).toMatchObject({ withdraw: osama, reinvest: 0 });
    expect(p.withdrawals.find((w) => w.code === 30005)).toMatchObject({ withdraw: 10, reinvest: Math.round((engy - 10) * 100) / 100 });
    api.finance.closing.lockMonth({ month: "2026-11", draft });

    expect(capital(30001)).toBe(osamaBefore); // all profit taken out
    expect(capital(30005)).toBe(Math.round((engyBefore + engy - 10) * 100) / 100);
    expect(capital(30002)).toBe(Math.round((hazarBefore + hazar) * 100) / 100); // reinvested
    expect(bal(21007)).toBe(Math.round((osama + 10) * 100) / 100);
    expect(api.finance.closing.partnersOwed().partners).toEqual([
      { accountId: expect.any(String), name: "Osama", owed: osama },
      { accountId: expect.any(String), name: "Engy", owed: 10 },
    ]);

    // Pay Osama part of it from QNB: the rest stays owed to him
    const owed = api.finance.closing.partnersOwed();
    const qnb = api.finance.accounts.list({}).find((a) => a.code === 14001)!;
    const qnbBefore = bal(14001);
    api.finance.closing.partnerPayout({ partnerAccountId: owed.partners[0].accountId, amount: 20, fromAccountId: qnb._id, date: "2026-12-02" });
    expect(bal(14001)).toBe(qnbBefore - 20);
    expect(api.finance.closing.partnersOwed().partners.map((r) => r.owed)).toEqual([Math.round((osama - 20) * 100) / 100, 10]);
    expect(
      appError(() =>
        api.finance.closing.partnerPayout({ partnerAccountId: owed.partners[1].accountId, amount: 11, fromAccountId: qnb._id, date: "2026-12-02" }),
      ).message,
    ).toBe("More than what's owed to Engy");

    // The partner statement counts it as withdrawn
    const statement = api.finance.statements.partnerStatement({ fromDay: "2026-11-01", toDay: "2026-11-30" });
    expect(statement.find((r) => r.name === "Osama")).toMatchObject({ share: osama, withdrawn: osama });

    // Reopening the closing takes the choices back out
    createCaller(db, admin, { now: time.now, session: { elevatedUntil: Number.MAX_SAFE_INTEGER } }).finance.closing.reopen({ period: "2026-11" });
    expect(api.finance.closing.partnersOwed().partners.find((r) => r.name === "Engy")).toBeUndefined();
  });
});

describe("closing on any day", () => {
  it("closes up to a chosen day (before a partner's deposit), then the rest of the month from the next day", () => {
    const { api, db, admin, time, productId, bal, filled } = opened();
    api.finance.closing.postOpening(filled);
    time.set("2026-11-10T10:00:00.000Z");
    const first = placeOrder(api, productId, 5);
    api.orders.updateStatus({ orderId: first, status: "shipped" });

    // A partner deposits on Nov 16: close up to the 15th first
    time.set("2026-11-16T09:00:00.000Z");
    const draft = api.finance.closing.month({ month: "2026-11-15" }).draft;
    const mid = api.finance.closing.previewMonth({ month: "2026-11-15", draft });
    expect(mid).toMatchObject({ start: "2026-11-01", end: "2026-11-15" });
    // Sales 500 − cost 200 (no month-end depreciation yet)
    expect(mid.result).toBe(300);
    expect(appError(() => api.finance.closing.lockMonth({ month: "2026-11-20", draft })).message).toMatch(/up to today/);
    const beforeClosing = api.dashboard.performance().breakEvenMonth;
    api.finance.closing.lockMonth({ month: "2026-11-15", draft });
    expect(api.finance.closing.overview().lockedThrough).toBe("2026-11-15");
    // A mid-month closing doesn't reset the dashboard: break-even still counts the whole month
    expect(api.dashboard.performance().breakEvenMonth).toMatchObject({
      sales: beforeClosing.sales,
      breakEven: beforeClosing.breakEven,
    });
    expect(beforeClosing.sales).toBe(500);
    expect(bal(21008)).toBe(9); // 3% charity owed

    // The month's own closing now covers the 16th to the 30th only
    time.set("2026-11-20T10:00:00.000Z");
    const second = placeOrder(api, productId, 2);
    api.orders.updateStatus({ orderId: second, status: "shipped" });
    time.set("2026-12-01T10:00:00.000Z");
    api.finance.closing.refresh();
    const rest = api.finance.closing.previewMonth({ month: "2026-11", draft });
    expect(rest).toMatchObject({ start: "2026-11-16", end: "2026-11-30" });
    // Sales 200 − cost 80 − depreciation 90
    expect(rest.result).toBe(30);
    const periods = api.finance.closing.overview().periods.map((x) => [x.period, x.status]);
    expect(periods.slice(0, 2)).toEqual([
      ["2026-11-15", "locked"],
      ["2026-11", "open"],
    ]);

    api.finance.closing.lockMonth({ month: "2026-11", draft });
    expect(api.finance.closing.overview().lockedThrough).toBe("2026-11-30");

    // Only the latest closing can be reopened; then the day closing
    const elevated = createCaller(db, admin, { now: time.now, session: { elevatedUntil: Number.MAX_SAFE_INTEGER } });
    expect(appError(() => elevated.finance.closing.reopen({ period: "2026-11-15" })).message).toMatch(/later closings first/);
    elevated.finance.closing.reopen({ period: "2026-11" });
    elevated.finance.closing.reopen({ period: "2026-11-15" });
    expect(bal(21008)).toBe(0);
    expect(api.finance.closing.overview().lockedThrough).toBe("2026-10-31");
  });
});

describe("sharing by capital and the days it was held", () => {
  const capitals = (api: ReturnType<typeof setup>["api"]) =>
    api.finance.accounts.list({}).filter((a) => a.type === "equity" && a.group === "Partners' capital");

  it("gives an emptied account nothing, and shares by days held when capital moves mid-period", () => {
    const { api, time, productId, filled } = opened();
    api.finance.closing.postOpening(filled);
    const [a, b] = capitals(api).filter((x) => x.balance > 0);
    const others = capitals(api).filter((x) => x.balance > 0 && x._id !== a._id && x._id !== b._id);
    // B takes all their capital out on 16 Nov: half of a 30-day month
    time.set("2026-11-10T10:00:00.000Z");
    const id = placeOrder(api, productId, 5);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    time.set("2026-11-16T10:00:00.000Z");
    api.finance.closing.partnerWithdrawal({ accountId: b._id, amount: b.balance, date: "2026-11-16" });
    time.set("2026-12-02T10:00:00.000Z");
    api.finance.closing.refresh();
    const draft = api.finance.closing.month({ month: "2026-11" }).draft;
    const p = api.finance.closing.previewMonth({ month: "2026-11", draft });
    const share = (id: string) => p.allocation.partners.find((x) => x.accountId === id)!;
    // B held their capital 15 of 30 days: average capital is half of it
    expect(share(b._id).capital).toBe(Math.round((b.balance / 2) * 100) / 100);
    const total = [a, b, ...others].reduce((s, x) => s + (x._id === b._id ? x.balance / 2 : x.balance), 0);
    expect(share(b._id).sharePct).toBeCloseTo(((b.balance / 2) / total) * 100, 6);
    api.finance.closing.lockMonth({ month: "2026-11", draft });

    // December: B holds nothing, so B gets nothing
    time.set("2026-12-10T10:00:00.000Z");
    const id2 = placeOrder(api, productId, 2);
    api.orders.updateStatus({ orderId: id2, status: "shipped" });
    const bAfterNov = capitals(api).find((x) => x._id === b._id)!.balance;
    // Their November profit goes to the partner who bought their stake, and the account is closed
    // Dated the first day after the closing, so B holds it for no day of December
    api.finance.journal.create({
      date: "2026-12-01",
      memo: "B's balance to A",
      lines: [
        { accountId: b._id, debit: bAfterNov, credit: 0 },
        { accountId: a._id, debit: 0, credit: bAfterNov },
      ],
    });
    api.finance.accounts.setActive({ accountId: b._id, isActive: false });
    time.set("2027-01-02T10:00:00.000Z");
    api.finance.closing.refresh();
    const dec = api.finance.closing.previewMonth({ month: "2026-12", draft: api.finance.closing.month({ month: "2026-12" }).draft });
    expect(dec.allocation.partners.some((x) => x.accountId === b._id)).toBe(false);
    api.finance.closing.lockMonth({ month: "2026-12", draft: api.finance.closing.month({ month: "2026-12" }).draft });
    expect(capitals(api).find((x) => x._id === b._id)!.balance).toBe(0);
  });
});

describe("financial statements", () => {
  it("shows the month's profit even after closing, and a balanced balance sheet", () => {
    const { api, time, productId, filled } = opened();
    api.finance.closing.postOpening(filled);
    time.set("2026-11-10T10:00:00.000Z");
    const id = placeOrder(api, productId, 10);
    api.orders.updateStatus({ orderId: id, status: "shipped" });
    const tips = api.finance.accounts.list({}).find((a) => a.code === 50006)!;
    const qnb = api.finance.accounts.list({}).find((a) => a.code === 14001)!;
    api.finance.journal.create({
      date: "2026-11-11",
      memo: "Tip",
      lines: [
        { accountId: tips._id, debit: 10, credit: 0 },
        { accountId: qnb._id, debit: 0, credit: 10 },
      ],
    });
    let pl = api.finance.statements.incomeStatement({ fromDay: "2026-11-01", toDay: "2026-11-30" });
    expect(pl.totalRevenue).toBe(1000);
    expect(pl.grossProfit).toBe(590); // 1000 − 400 cost − 10 tips
    let bs = api.finance.statements.balanceSheet({ asOfDay: "2026-11-30" });
    expect(bs.balanced).toBe(true);
    expect(bs.unclosed).not.toBe(0);

    time.set("2026-12-02T10:00:00.000Z");
    api.finance.closing.refresh();
    const draft = api.finance.closing.month({ month: "2026-11" }).draft;
    api.finance.closing.lockMonth({ month: "2026-11", draft });
    pl = api.finance.statements.incomeStatement({ fromDay: "2026-11-01", toDay: "2026-11-30" });
    expect(pl.netProfit).toBe(500); // 590 − 90 depreciation, still visible after closing
    bs = api.finance.statements.balanceSheet({ asOfDay: "2026-11-30" });
    expect(bs.balanced).toBe(true);
    expect(bs.unclosed).toBe(0);
    const tb = api.finance.statements.trialBalance({ asOfDay: "2026-11-30" });
    expect(tb.debit).toBeCloseTo(tb.credit, 2);
    const partners = api.finance.statements.partnerStatement({ fromDay: "2026-11-01", toDay: "2026-11-30" });
    const sharesTotal = partners.reduce((s, p) => s + p.share, 0);
    // 500 − 3% charity − 15% compensation
    expect(sharesTotal).toBeCloseTo(500 - 15 - 75, 2);
  });
});
