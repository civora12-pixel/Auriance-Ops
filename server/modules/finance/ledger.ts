import { and, asc, count, desc, eq, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import {
  accounts,
  financialEvents,
  inventoryMovements,
  journalEntries,
  journalLines,
} from "../../db/schema.ts";
import type { Account } from "../../db/schema.ts";
import { AppError, mutation, noInput, query, zDay, zId } from "../../rpc/procedure.ts";
import type { Ctx } from "../../rpc/procedure.ts";
import {
  requireAdminMode,
  requireEdit,
  requireView,
} from "../../lib/permissions.ts";
import { lookupMaps, userName } from "../../lib/items.ts";
import { moneyFormatter } from "../../lib/settings.ts";
import { assertDay } from "../../lib/time.ts";
import { logDeletion } from "../../lib/audit.ts";
import { SEARCH_MAX, searchCondition } from "../../lib/search.ts";
import {
  accountLabel,
  accountTotals,
  naturalBalance,
  paymentAccounts,
  postEntry,
  replaceEntry,
} from "../../lib/ledger.ts";
import { lockedThrough } from "../../lib/ledger-sync.ts";
import {
  ACCOUNT_TYPES,
  DEBIT_NORMAL,
  JOURNAL_SOURCES,
  round2,
} from "../../../shared/constants.ts";

const zCode = z
  .number()
  .int("Use a whole number for the code")
  .min(10000, "Use a 5-digit code, e.g. 60008")
  .max(99999, "Use a 5-digit code, e.g. 60008");
const zName = z.string().trim().min(1, "Enter the account name").max(120);
const zGroup = z.string().trim().min(1, "Enter the group").max(80);
const zAmount = z.number().finite().min(0).max(1e12);

const zLine = z.object({
  accountId: zId,
  debit: zAmount,
  credit: zAmount,
  memo: z.string().trim().max(300).optional(),
});
const entryFields = {
  date: zDay,
  memo: z.string().trim().min(1, "Enter a description").max(500),
  lines: z.array(zLine).min(2, "An entry needs at least two lines").max(200),
  /** When what this entry owes must be paid (reminder the day before). */
  dueDay: zDay.nullish(),
};

function mustGetAccount(ctx: Ctx, accountId: string): Account {
  const account = ctx.db
    .select()
    .from(accounts)
    .where(eq(accounts._id, accountId))
    .get();
  if (!account) throw new AppError("NOT_FOUND", "Account not found");
  return account;
}

function assertCodeFree(ctx: Ctx, code: number, exceptId?: string) {
  const clash = ctx.db
    .select({ id: accounts._id })
    .from(accounts)
    .where(
      exceptId
        ? and(eq(accounts.code, code), ne(accounts._id, exceptId))
        : eq(accounts.code, code),
    )
    .get();
  if (clash) {
    throw new AppError("CONFLICT", `Code ${code} is already used by another account`);
  }
}

function hasLines(ctx: Ctx, accountId: string): boolean {
  return !!ctx.db
    .select({ id: journalLines._id })
    .from(journalLines)
    .where(eq(journalLines.accountId, accountId))
    .limit(1)
    .get();
}

function mustGetEntry(ctx: Ctx, entryId: string) {
  const entry = ctx.db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries._id, entryId))
    .get();
  if (!entry) throw new AppError("NOT_FOUND", "Journal entry not found");
  return entry;
}

/** Manual entries can't be dated in, or moved out of, a closed month. */
function assertOpenDay(ctx: Ctx, ...days: string[]) {
  const locked = lockedThrough(ctx.db);
  if (locked && days.some((d) => d <= locked)) {
    throw new AppError(
      "BAD_REQUEST",
      `The books are closed up to ${locked}. Use a later date, or reopen that month.`,
    );
  }
}

function mustBeManual(entry: { source: string }) {
  if (entry.source !== "manual") {
    throw new AppError(
      "BAD_REQUEST",
      "Only manual entries can be changed. Automatic entries follow the order or stock movement that made them.",
    );
  }
}

/** Entries with their lines and account names, in the order given. */
function withLines(ctx: Ctx, entries: (typeof journalEntries.$inferSelect)[]) {
  if (!entries.length) return [];
  const lines = ctx.db
    .select()
    .from(journalLines)
    .where(
      inArray(
        journalLines.entryId,
        entries.map((e) => e._id),
      ),
    )
    .orderBy(asc(journalLines.sort))
    .all();
  const accountRows = ctx.db.select().from(accounts).all();
  const accountMap = new Map(accountRows.map((a) => [a._id, a]));
  const { userMap } = lookupMaps(ctx.db, {
    userIds: entries.map((e) => e.createdBy).filter((x): x is string => !!x),
  });
  // Automatic entries link back to their order
  const idsOf = (type: string) =>
    entries.filter((e) => e.sourceType === type && e.sourceId).map((e) => e.sourceId!);
  const movementOrder = new Map(
    (idsOf("movement").length
      ? ctx.db
          .select({ id: inventoryMovements._id, orderId: inventoryMovements.orderId })
          .from(inventoryMovements)
          .where(inArray(inventoryMovements._id, idsOf("movement")))
          .all()
      : []
    ).map((m) => [m.id, m.orderId]),
  );
  const eventOrder = new Map(
    (idsOf("order_event").length
      ? ctx.db
          .select({ id: financialEvents._id, orderId: financialEvents.orderId })
          .from(financialEvents)
          .where(inArray(financialEvents._id, idsOf("order_event")))
          .all()
      : []
    ).map((m) => [m.id, m.orderId]),
  );
  const orderOf = (e: (typeof entries)[number]) =>
    !e.sourceId
      ? null
      : e.sourceType === "order_sale" || e.sourceType === "order_payment"
        ? e.sourceId
        : e.sourceType === "movement"
          ? (movementOrder.get(e.sourceId) ?? null)
          : e.sourceType === "order_event"
            ? (eventOrder.get(e.sourceId) ?? null)
            : null;
  return entries.map((e) => {
    const own = lines.filter((l) => l.entryId === e._id);
    return {
      ...e,
      orderId: orderOf(e),
      createdByName: e.createdBy ? userName(userMap.get(e.createdBy)) : null,
      total: round2(own.reduce((s, l) => s + l.debit, 0)),
      lines: own.map((l) => {
        const a = accountMap.get(l.accountId);
        return {
          _id: l._id,
          accountId: l.accountId,
          accountCode: a?.code ?? 0,
          accountName: a?.name ?? "",
          debit: l.debit,
          credit: l.credit,
          memo: l.memo,
        };
      }),
    };
  });
}

export const accountsRouter = {
  /** The chart of accounts with each account's balance (as of a day, if given). */
  list: query({
    input: z
      .object({ asOfDay: zDay.optional() })
      .optional()
      .default({}),
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      const totals = accountTotals(ctx.db, args.asOfDay);
      return ctx.db
        .select()
        .from(accounts)
        .orderBy(asc(accounts.code))
        .all()
        .map((a) => ({
          ...a,
          debitTotal: totals.get(a._id)?.debit ?? 0,
          creditTotal: totals.get(a._id)?.credit ?? 0,
          balance: naturalBalance(a, totals.get(a._id)),
          hasEntries: totals.has(a._id),
        }));
    },
  }),

  /** Accounts a purchase can be paid from, QNB first (for the restock form). */
  paymentOptions: query({
    input: noInput,
    handler: (ctx) => {
      requireView(ctx, "inventory", "finance");
      const list = paymentAccounts(ctx.db);
      const qnb = list.findIndex((a) => a.systemKey === "qnb");
      if (qnb > 0) list.unshift(...list.splice(qnb, 1));
      return list.map((a) => ({ _id: a._id, code: a.code, name: a.name, systemKey: a.systemKey }));
    },
  }),

  /** One account's lines in a date range, with the balance carried in and a running balance. */
  ledger: query({
    input: z.object({
      accountId: zId,
      fromDay: zDay.optional(),
      toDay: zDay.optional(),
    }),
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      const account = mustGetAccount(ctx, args.accountId);
      const sign = DEBIT_NORMAL[account.type] ? 1 : -1;
      const before = args.fromDay
        ? ctx.db
            .select({
              net: sql<number>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)`,
            })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalEntries._id, journalLines.entryId))
            .where(
              and(
                eq(journalLines.accountId, account._id),
                lt(journalEntries.date, args.fromDay),
              ),
            )
            .get()
        : undefined;
      const opening = round2(sign * (before?.net ?? 0));
      const where: SQL[] = [eq(journalLines.accountId, account._id)];
      if (args.fromDay) where.push(gte(journalEntries.date, args.fromDay));
      if (args.toDay) where.push(lte(journalEntries.date, args.toDay));
      const rows = ctx.db
        .select({
          lineId: journalLines._id,
          entryId: journalEntries._id,
          number: journalEntries.number,
          date: journalEntries.date,
          entryMemo: journalEntries.memo,
          source: journalEntries.source,
          debit: journalLines.debit,
          credit: journalLines.credit,
          memo: journalLines.memo,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries._id, journalLines.entryId))
        .where(and(...where))
        .orderBy(asc(journalEntries.date), asc(journalEntries.number), asc(journalLines.sort))
        .limit(5000)
        .all();
      let running = opening;
      const lines = rows.map((r) => {
        running = round2(running + sign * (r.debit - r.credit));
        return { ...r, balance: running };
      });
      return { account, opening, closing: running, lines };
    },
  }),

  create: mutation({
    input: z.object({
      code: zCode,
      name: zName,
      type: z.enum(ACCOUNT_TYPES),
      group: zGroup,
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "finance");
      assertCodeFree(ctx, args.code);
      return ctx.db
        .insert(accounts)
        .values({ ...args, isAuto: false, isActive: true })
        .returning({ id: accounts._id })
        .get().id;
    },
  }),

  update: mutation({
    input: z.object({
      accountId: zId,
      code: zCode,
      name: zName,
      type: z.enum(ACCOUNT_TYPES),
      group: zGroup,
    }),
    handler: (ctx, { accountId, ...args }) => {
      requireEdit(ctx, "finance");
      const account = mustGetAccount(ctx, accountId);
      assertCodeFree(ctx, args.code, accountId);
      if (args.type !== account.type) {
        if (account.systemKey) {
          throw new AppError("BAD_REQUEST", "The app uses this account, so its type can't change");
        }
        if (hasLines(ctx, accountId)) {
          throw new AppError(
            "BAD_REQUEST",
            "This account already has entries, so its type can't change",
          );
        }
      }
      ctx.db.update(accounts).set(args).where(eq(accounts._id, accountId)).run();
      return null;
    },
  }),

  /** Inactive accounts stay in reports but can't take new manual entries. */
  setActive: mutation({
    input: z.object({ accountId: zId, isActive: z.boolean() }),
    handler: (ctx, args) => {
      requireEdit(ctx, "finance");
      const account = mustGetAccount(ctx, args.accountId);
      if (!args.isActive) {
        if (account.systemKey) {
          throw new AppError("BAD_REQUEST", "The app uses this account, so it can't be deactivated");
        }
        const balance = naturalBalance(
          account,
          accountTotals(ctx.db).get(account._id),
        );
        if (Math.abs(balance) >= 0.005) {
          throw new AppError(
            "BAD_REQUEST",
            "Only accounts with a zero balance can be deactivated",
          );
        }
      }
      ctx.db
        .update(accounts)
        .set({ isActive: args.isActive })
        .where(eq(accounts._id, account._id))
        .run();
      return null;
    },
  }),
};

export const journalRouter = {
  /** Entries in a date range, newest first, with their lines. */
  list: query({
    input: z.object({
      fromDay: zDay.optional(),
      toDay: zDay.optional(),
      source: z.enum(JOURNAL_SOURCES).optional(),
      accountId: zId.optional(),
      search: z.string().trim().max(SEARCH_MAX).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(200).default(25),
    }),
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      const where: SQL[] = [];
      if (args.fromDay) where.push(gte(journalEntries.date, args.fromDay));
      if (args.toDay) where.push(lte(journalEntries.date, args.toDay));
      if (args.source) where.push(eq(journalEntries.source, args.source));
      if (args.accountId) {
        where.push(
          sql`exists (select 1 from ${journalLines} where ${journalLines.entryId} = ${journalEntries._id} and ${journalLines.accountId} = ${args.accountId})`,
        );
      }
      const search = searchCondition(
        args.search,
        (like) =>
          sql`(lower(${journalEntries.memo}) like ${like} or exists (select 1 from ${journalLines} where ${journalLines.entryId} = ${journalEntries._id} and lower(coalesce(${journalLines.memo}, '')) like ${like}))`,
        (exact) => {
          const n = Number(exact.replace(/^jv-?/i, ""));
          return Number.isInteger(n) && n > 0 ? eq(journalEntries.number, n) : undefined;
        },
      );
      if (search) where.push(search);
      const filter = where.length ? and(...where) : undefined;
      const total =
        ctx.db.select({ n: count() }).from(journalEntries).where(filter).get()?.n ?? 0;
      const rows = ctx.db
        .select()
        .from(journalEntries)
        .where(filter)
        .orderBy(desc(journalEntries.date), desc(journalEntries.number))
        .limit(args.pageSize)
        .offset((args.page - 1) * args.pageSize)
        .all();
      return {
        items: withLines(ctx, rows),
        total,
        page: args.page,
        pageSize: args.pageSize,
      };
    },
  }),

  get: query({
    input: z.object({ entryId: zId }),
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      const entry = ctx.db
        .select()
        .from(journalEntries)
        .where(eq(journalEntries._id, args.entryId))
        .get();
      return entry ? withLines(ctx, [entry])[0] : null;
    },
  }),

  create: mutation({
    input: z.object(entryFields),
    handler: (ctx, args) => {
      requireEdit(ctx, "finance");
      assertDay(ctx, args.date, "entry date", 31);
      assertOpenDay(ctx, args.date);
      return postEntry(ctx, { ...args, source: "manual" });
    },
  }),

  update: mutation({
    input: z.object({ entryId: zId, ...entryFields }),
    handler: (ctx, { entryId, ...args }) => {
      requireEdit(ctx, "finance");
      const entry = mustGetEntry(ctx, entryId);
      mustBeManual(entry);
      assertDay(ctx, args.date, "entry date", 31);
      assertOpenDay(ctx, args.date, entry.date);
      replaceEntry(ctx, entryId, args);
      return null;
    },
  }),

  /** Marks a payable with a due date as paid (or not), so it leaves the due list. */
  setSettled: mutation({
    input: z.object({ entryId: zId, settled: z.boolean() }),
    handler: (ctx, args) => {
      requireEdit(ctx, "finance");
      const entry = mustGetEntry(ctx, args.entryId);
      if (!entry.dueDay) throw new AppError("BAD_REQUEST", "This entry has no due date");
      ctx.db
        .update(journalEntries)
        .set({ settledAt: args.settled ? ctx.now.getTime() : null })
        .where(eq(journalEntries._id, entry._id))
        .run();
      return null;
    },
  }),

  /** Permanent delete of a manual entry: Admin Mode only, recorded in the deletion log. */
  remove: mutation({
    input: z.object({ entryId: zId }),
    handler: (ctx, args) => {
      requireAdminMode(ctx);
      const entry = mustGetEntry(ctx, args.entryId);
      mustBeManual(entry);
      assertOpenDay(ctx, entry.date);
      const [full] = withLines(ctx, [entry]);
      const money = moneyFormatter(ctx.db);
      logDeletion(ctx, {
        entityType: "journal_entry",
        entityId: entry._id,
        summary: [
          `JV-${String(entry.number).padStart(4, "0")}`,
          entry.date,
          entry.memo,
          money(full.total),
          full.lines
            .map(
              (l) =>
                `${accountLabel({ code: l.accountCode, name: l.accountName })} ${l.debit ? `Dr ${l.debit}` : `Cr ${l.credit}`}`,
            )
            .join("; "),
        ].join(" | "),
        stockEffect: "None",
      });
      ctx.db.delete(journalEntries).where(eq(journalEntries._id, entry._id)).run();
      return null;
    },
  }),
};
