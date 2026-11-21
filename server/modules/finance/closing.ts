import { z } from "zod";
import { mutation, noInput, query, zDay, zId } from "../../rpc/procedure.ts";
import type { Ctx } from "../../rpc/procedure.ts";
import type { Account } from "../../db/schema.ts";
import {
  requireAdmin,
  requireAdminMode,
  requireEdit,
  requireView,
} from "../../lib/permissions.ts";
import {
  compensationRates,
  lockMonth,
  monthPreview,
  periodsToClose,
  isPeriod,
  openingPreview,
  partnerPayout,
  partnersOwed,
  partnerWithdrawal,
  postOpening,
  readClosing,
  reopen,
  writeDraft,
} from "../../lib/closing.ts";
import type { MonthDraft, OpeningDraft } from "../../lib/closing.ts";
import { lockedThrough } from "../../lib/ledger-sync.ts";
import { businessToday } from "../../lib/time.ts";

/** A month ("2026-10") or a closing up to a chosen day ("2026-11-15") */
const zMonth = z.string().refine(isPeriod, "Choose a month or a day");
const zAmount = z.number().finite().min(-1e12).max(1e12);
const zBalances = z.record(z.string().regex(/^\d{5}$/), zAmount.nullable());

const zOpening = z.object({
  asOf: zDay,
  balances: zBalances,
  capitals: zBalances,
  extraReceivable: z.number().finite().min(0).max(1e12).default(0),
  resultMode: z.enum(["split", "normal"]).default("split"),
});
const zMonthDraft = z.object({
  balances: zBalances,
  explanations: z.record(
    z.string().regex(/^\d{5}$/),
    z.array(z.object({ code: z.number().int(), amount: z.number().finite().min(0).max(1e12) })).max(20),
  ),
  compensationOsamaPct: z.number().finite().min(0).max(100),
  compensationHazarPct: z.number().finite().min(0).max(100),
  charityFromCode: z.number().int().optional(),
  withdrawals: z.record(z.string().regex(/^\d{5}$/), z.number().finite().min(0).max(1e12).nullable()).optional(),
});

const brief = (a: Account) => ({
  _id: a._id,
  code: a.code,
  name: a.name,
  type: a.type,
  group: a.group,
});

function defaultMonthDraft(ctx: Ctx): MonthDraft {
  const rates = compensationRates(ctx.db);
  return {
    balances: {},
    explanations: {},
    compensationOsamaPct: rates.osama,
    compensationHazarPct: rates.hazar,
  };
}

/** Drafts saved before the rates were split (one shared %) take today's rates. */
function withRates(ctx: Ctx, draft: MonthDraft): MonthDraft {
  if (typeof draft.compensationOsamaPct === "number" && typeof draft.compensationHazarPct === "number") return draft;
  const rates = compensationRates(ctx.db);
  const { compensationPct: _old, ...rest } = draft as MonthDraft & { compensationPct?: number };
  return { ...rest, compensationOsamaPct: rates.osama, compensationHazarPct: rates.hazar };
}

function openingView(ctx: Ctx, draft: OpeningDraft) {
  const p = openingPreview(ctx.db, draft);
  return {
    ...p,
    rows: p.rows.map((r) => ({ ...r, account: brief(r.account) })),
  };
}

function monthView(ctx: Ctx, month: string, draft: MonthDraft) {
  const p = monthPreview(ctx.db, month, draft);
  return {
    month: p.month,
    start: p.start,
    end: p.end,
    kept: p.kept.map((k) => ({ ...k, account: brief(k.account) })),
    automatic: p.automatic.map((k) => ({ ...k, account: brief(k.account) })),
    pnlRows: p.pnlRows.map((r) => ({ ...r, account: brief(r.account) })),
    revenue: p.revenue,
    expenses: p.expenses,
    result: p.result,
    allocation: p.allocation,
    withdrawals: p.withdrawals,
  };
}

export const closingRouter = {
  /** Opening balances and every month since, with their state. */
  overview: query({
    input: noInput,
    handler: (ctx) => {
      requireView(ctx, "finance");
      const opening = readClosing<OpeningDraft>(ctx.db, "opening");
      return {
        opening: opening ? { status: opening.status, asOf: opening.data.asOf } : null,
        periods: opening?.status === "locked" ? periodsToClose(ctx.db, businessToday(ctx)) : [],
        lockedThrough: lockedThrough(ctx.db) ?? null,
        today: businessToday(ctx),
      };
    },
  }),

  /** Brings the automatic entries up to date (e.g. a month end's depreciation) before closing. */
  refresh: mutation({
    input: noInput,
    handler: (ctx) => {
      requireView(ctx, "finance");
      return null;
    },
  }),

  opening: query({
    input: noInput,
    handler: (ctx) => {
      requireView(ctx, "finance");
      const row = readClosing<OpeningDraft>(ctx.db, "opening");
      const draft: OpeningDraft = row?.data ?? {
        asOf: "2026-10-31",
        balances: {},
        capitals: {},
        extraReceivable: 0,
        resultMode: "split",
      };
      return { status: row?.status ?? "draft", draft, preview: openingView(ctx, draft) };
    },
  }),

  /** Live figures while typing, without saving. */
  previewOpening: query({
    input: zOpening,
    handler: (ctx, draft) => {
      requireView(ctx, "finance");
      return openingView(ctx, draft);
    },
  }),

  saveOpening: mutation({
    input: zOpening,
    handler: (ctx, draft) => {
      requireEdit(ctx, "finance");
      writeDraft(ctx.db, "opening", draft, ctx.now);
      return null;
    },
  }),

  postOpening: mutation({
    input: zOpening,
    handler: (ctx, draft) => {
      requireAdmin(ctx);
      writeDraft(ctx.db, "opening", draft, ctx.now);
      postOpening(ctx, draft);
      return null;
    },
  }),

  month: query({
    input: z.object({ month: zMonth }),
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      const row = readClosing<MonthDraft>(ctx.db, args.month);
      const draft = row?.data ? withRates(ctx, row.data) : defaultMonthDraft(ctx);
      return {
        status: row?.status ?? "open",
        draft,
        preview: row?.status === "locked" ? null : monthView(ctx, args.month, draft),
      };
    },
  }),

  previewMonth: query({
    input: z.object({ month: zMonth, draft: zMonthDraft }),
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      return monthView(ctx, args.month, args.draft);
    },
  }),

  saveMonth: mutation({
    input: z.object({ month: zMonth, draft: zMonthDraft }),
    handler: (ctx, args) => {
      requireEdit(ctx, "finance");
      writeDraft(ctx.db, args.month, args.draft, ctx.now);
      return null;
    },
  }),

  lockMonth: mutation({
    input: z.object({ month: zMonth, draft: zMonthDraft }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      lockMonth(ctx, args.month, args.draft);
      return null;
    },
  }),

  /** Admin Mode: undo the latest closing so its figures can be changed. */
  reopen: mutation({
    input: z.object({ period: z.union([zMonth, z.literal("opening")]) }),
    handler: (ctx, args) => {
      requireAdminMode(ctx);
      reopen(ctx, args.period);
      return null;
    },
  }),

  /** After a closing: a partner chooses to take (part of) their share out. */
  /** What Partners payable owes each partner, until it's paid out. */
  partnersOwed: query({
    input: noInput,
    handler: (ctx) => {
      requireView(ctx, "finance");
      return partnersOwed(ctx.db);
    },
  }),

  /** Pays a partner what they're owed (or part of it) from a bank or cash account. */
  partnerPayout: mutation({
    input: z.object({
      partnerAccountId: zId,
      amount: z.number().finite().positive("Enter an amount").max(1e12),
      fromAccountId: zId,
      date: zDay,
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "finance");
      partnerPayout(ctx, args);
      return null;
    },
  }),

  partnerWithdrawal: mutation({
    input: z.object({
      accountId: zId,
      amount: z.number().finite().positive("Enter an amount").max(1e12),
      date: zDay,
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "finance");
      partnerWithdrawal(ctx, args.accountId, args.amount, args.date);
      return null;
    },
  }),
};
