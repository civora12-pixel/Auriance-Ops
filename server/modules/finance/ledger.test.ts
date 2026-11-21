import { describe, expect, it } from "vitest";
import { PERMISSION_PRESETS } from "../../../shared/constants.ts";
import { addUser, appError, setup } from "../../test/helpers.ts";
import { createCaller } from "../../rpc/caller.ts";
import { postEntry } from "../../lib/ledger.ts";

function chart(api: ReturnType<typeof setup>["api"]) {
  const list = api.finance.accounts.list();
  const by = (code: number) => {
    const a = list.find((x) => x.code === code);
    if (!a) throw new Error(`no account ${code}`);
    return a;
  };
  return { list, by };
}

describe("chart of accounts", () => {
  it("starts with the agreed accounts", () => {
    const { api } = setup();
    const { list, by } = chart(api);
    expect(list).toHaveLength(54);
    expect(by(11001).name).toBe("Accounts Receivable");
    expect(by(14001).name).toBe("QNB");
    expect(by(21006).name).toBe("Loan from Osama");
    expect(list.filter((a) => a.group === "Partners' capital")).toHaveLength(9);
    // Filled by operations only
    expect(by(13001).isAuto).toBe(true);
    expect(by(40001).isAuto).toBe(true);
    expect(by(50003).isAuto).toBe(false);
    expect(list.every((a) => a.balance === 0)).toBe(true);
  });

  it("adds and edits accounts with unique 5-digit codes", () => {
    const { api } = setup();
    const id = api.finance.accounts.create({
      code: 60008,
      name: "Rent",
      type: "expense",
      group: "Selling & admin",
    });
    expect(
      appError(() =>
        api.finance.accounts.create({ code: 60008, name: "X", type: "expense", group: "G" }),
      ).code,
    ).toBe("CONFLICT");
    expect(
      appError(() =>
        api.finance.accounts.create({ code: 123, name: "X", type: "expense", group: "G" }),
      ).code,
    ).toBe("BAD_REQUEST");
    api.finance.accounts.update({
      accountId: id,
      code: 60009,
      name: "Office rent",
      type: "expense",
      group: "Selling & admin",
    });
    expect(chart(api).by(60009).name).toBe("Office rent");
  });

  it("keeps app accounts' type, and only deactivates accounts at zero", () => {
    const { api } = setup();
    const { by } = chart(api);
    expect(
      appError(() =>
        api.finance.accounts.update({
          accountId: by(13001)._id,
          code: 13001,
          name: "Inventory",
          type: "expense",
          group: "Inventory",
        }),
      ).code,
    ).toBe("BAD_REQUEST");
    expect(
      appError(() => api.finance.accounts.setActive({ accountId: by(14001)._id, isActive: false }))
        .code,
    ).toBe("BAD_REQUEST");
    const tips = by(50006);
    api.finance.journal.create({
      date: "2026-03-10",
      memo: "Tip",
      lines: [
        { accountId: tips._id, debit: 20, credit: 0 },
        { accountId: by(10001)._id, debit: 0, credit: 20 },
      ],
    });
    expect(
      appError(() => api.finance.accounts.setActive({ accountId: tips._id, isActive: false })).code,
    ).toBe("BAD_REQUEST");
    api.finance.accounts.setActive({ accountId: by(50009)._id, isActive: false });
    expect(chart(api).by(50009).isActive).toBe(false);
  });
});

describe("journal entries", () => {
  it("posts balanced entries and updates balances the natural way round", () => {
    const { api } = setup();
    const { by } = chart(api);
    api.finance.journal.create({
      date: "2026-03-05",
      memo: "Meta top-up on the credit card",
      lines: [
        { accountId: by(15001)._id, debit: 1500, credit: 0 },
        { accountId: by(21001)._id, debit: 0, credit: 1500 },
      ],
    });
    const after = chart(api);
    expect(after.by(15001).balance).toBe(1500); // asset up
    expect(after.by(21001).balance).toBe(1500); // card owed up
    const page = api.finance.journal.list({});
    expect(page.total).toBe(1);
    expect(page.items[0].number).toBe(1);
    expect(page.items[0].total).toBe(1500);
    expect(page.items[0].lines.map((l) => l.accountCode)).toEqual([15001, 21001]);
  });

  it("refuses unbalanced, one-sided and empty lines", () => {
    const { api } = setup();
    const { by } = chart(api);
    const cash = by(10001)._id;
    const tips = by(50006)._id;
    const bad = [
      [
        { accountId: tips, debit: 100, credit: 0 },
        { accountId: cash, debit: 0, credit: 90 },
      ],
      [
        { accountId: tips, debit: 100, credit: 100 },
        { accountId: cash, debit: 0, credit: 0 },
      ],
      [{ accountId: tips, debit: 100, credit: 0 }],
    ];
    for (const lines of bad) {
      expect(
        appError(() => api.finance.journal.create({ date: "2026-03-05", memo: "x", lines })).code,
      ).toBe("BAD_REQUEST");
    }
    expect(api.finance.journal.list({}).total).toBe(0);
  });

  it("keeps automatic accounts for the app only", () => {
    const { api } = setup();
    const { by } = chart(api);
    const err = appError(() =>
      api.finance.journal.create({
        date: "2026-03-05",
        memo: "x",
        lines: [
          { accountId: by(13001)._id, debit: 100, credit: 0 },
          { accountId: by(10001)._id, debit: 0, credit: 100 },
        ],
      }),
    );
    expect(err.message).toContain("filled automatically");
  });

  it("edits and deletes manual entries only", () => {
    const { api, db, admin, time } = setup();
    const { by } = chart(api);
    const id = api.finance.journal.create({
      date: "2026-03-05",
      memo: "Bank charge",
      lines: [
        { accountId: by(60002)._id, debit: 15, credit: 0 },
        { accountId: by(14001)._id, debit: 0, credit: 15 },
      ],
    });
    api.finance.journal.update({
      entryId: id,
      date: "2026-03-06",
      memo: "Bank charge – March",
      lines: [
        { accountId: by(60002)._id, debit: 20, credit: 0 },
        { accountId: by(14001)._id, debit: 0, credit: 20 },
      ],
    });
    expect(chart(api).by(14001).balance).toBe(-20);
    // Deleting needs Admin Mode
    expect(appError(() => api.finance.journal.remove({ entryId: id })).code).toBe("FORBIDDEN");
    const elevated = createCaller(db, admin, {
      now: time.now,
      session: { elevatedUntil: Number.MAX_SAFE_INTEGER },
    });
    elevated.finance.journal.remove({ entryId: id });
    expect(api.finance.journal.list({}).total).toBe(0);
    expect(chart(api).by(14001).balance).toBe(0);

    // An automatic entry can't be touched by hand
    const autoId = postEntry(
      { db, user: admin, session: {} as never, now: time.now() },
      {
        date: "2026-03-05",
        memo: "Order shipped",
        source: "auto",
        lines: [
          { accountId: by(11001)._id, debit: 100, credit: 0 },
          { accountId: by(40001)._id, debit: 0, credit: 100 },
        ],
      },
    );
    expect(appError(() => elevated.finance.journal.remove({ entryId: autoId })).code).toBe(
      "BAD_REQUEST",
    );
  });

  it("shows an account's lines with a running balance", () => {
    const { api } = setup();
    const { by } = chart(api);
    const qnb = by(14001)._id;
    const post = (date: string, amount: number) =>
      api.finance.journal.create({
        date,
        memo: "x",
        lines:
          amount > 0
            ? [
                { accountId: qnb, debit: amount, credit: 0 },
                { accountId: by(21006)._id, debit: 0, credit: amount },
              ]
            : [
                { accountId: by(60002)._id, debit: -amount, credit: 0 },
                { accountId: qnb, debit: 0, credit: -amount },
              ],
      });
    post("2026-03-01", 1000);
    post("2026-03-03", -50);
    post("2026-03-08", 200);
    const ledger = api.finance.accounts.ledger({ accountId: qnb, fromDay: "2026-03-02" });
    expect(ledger.opening).toBe(1000);
    expect(ledger.lines.map((l) => l.balance)).toEqual([950, 1150]);
    expect(ledger.closing).toBe(1150);
    expect(api.finance.accounts.list({ asOfDay: "2026-03-05" }).find((a) => a.code === 14001)!.balance).toBe(950);
  });

  it("lets view-only finance users read but not post", () => {
    const { db, time, api } = setup();
    const keeper = addUser(db, "member", PERMISSION_PRESETS.warehouseLead.permissions);
    const as = createCaller(db, keeper, { now: time.now });
    expect(as.finance.accounts.list()).toHaveLength(54);
    const { by } = chart(api);
    expect(
      appError(() =>
        as.finance.journal.create({
          date: "2026-03-05",
          memo: "x",
          lines: [
            { accountId: by(50006)._id, debit: 1, credit: 0 },
            { accountId: by(10001)._id, debit: 0, credit: 1 },
          ],
        }),
      ).code,
    ).toBe("FORBIDDEN");
  });
});
