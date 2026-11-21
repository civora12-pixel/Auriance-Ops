import { and, asc, count, inArray, or, sql } from "drizzle-orm";
import { orders } from "../db/schema.ts";
import { z } from "zod";
import { mutation, noInput, query, zDay } from "../rpc/procedure.ts";
import { canView, requireEdit, requireView } from "../lib/permissions.ts";
import { dayBudget, dayPerformance, ledgerSalesByDay, saveDayBudget } from "../lib/day-performance.ts";
import { accountByKey, accountTotals, naturalBalance } from "../lib/ledger.ts";
import { ledgerStartDay } from "../lib/ledger-sync.ts";
import { performance, salesCheck } from "../lib/performance.ts";
import { loadCatalog, stockLines } from "../lib/catalog.ts";
import { getTimeZone } from "../lib/settings.ts";
import {
  loadFinanceData,
  netRevenueByDay,
  receivables,
} from "../lib/finance.ts";
import { addDays, addMonths, todayIn, weekStart } from "../../shared/dates.ts";
import {
  OPEN_STATUSES,
  ORDER_STATUSES,
  SHIPPED_TYPE_STATUSES,
  formatOrderNumber,
  round2,
} from "../../shared/constants.ts";
import type { OrderStatus } from "../../shared/constants.ts";

const DAYS = 14;
const WEEKS = 8;
const MONTHS = 6;
const NEEDS_ACTION_LIMIT = 8;

const sumDays = (byDay: Map<string, number>, from: string, to: string) => {
  let total = 0;
  for (const [day, n] of byDay) if (day >= from && day <= to) total += n;
  return round2(total);
};

export const dashboardRouter = {
  /** Day performance: one day's sales, cost of goods, a day of the fixed-cost budget and other costs recorded that day. */
  dayPerformance: query({
    input: z.object({ day: zDay.optional() }),
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      const today = todayIn(getTimeZone(ctx.db), ctx.now);
      return { today, ...dayPerformance(ctx.db, args.day ?? today) };
    },
  }),

  /** Break-even (month and year), marketing return, growth, returns and orders, each with its working. */
  performance: query({
    input: noInput,
    handler: (ctx) => {
      requireView(ctx, "finance");
      const tz = getTimeZone(ctx.db);
      return performance(ctx.db, todayIn(tz, ctx.now), tz, ledgerStartDay(ctx));
    },
  }),

  /** Sales in the books for some days against the orders shipped on them. */
  salesCheck: query({
    input: z.object({ fromDay: zDay, toDay: zDay }),
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      return salesCheck(ctx.db, args, getTimeZone(ctx.db));
    },
  }),

  /** The monthly fixed costs a day carries 1/30 of (add, change or remove lines). */
  dayBudget: query({
    input: noInput,
    handler: (ctx) => {
      requireView(ctx, "finance");
      return dayBudget(ctx.db);
    },
  }),

  setDayBudget: mutation({
    input: z.object({
      items: z
        .array(
          z.object({
            id: z.string().trim().min(1).max(40),
            name: z.string().trim().min(1, "Name each cost").max(60),
            monthly: z.number().finite().min(0, "Enter the monthly amount").max(1e9),
            accountCode: z.number().int().nullable(),
          }),
        )
        .max(30),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "finance");
      saveDayBudget(ctx.db, args.items);
      return null;
    },
  }),

  getStats: query({
    input: noInput,
    handler: (ctx) => {
      requireView(ctx, "dashboard");
      const tz = getTimeZone(ctx.db);
      const today = todayIn(tz, ctx.now);
      const monthStart = `${today.slice(0, 7)}-01`;

      // Units on hand: everything in the warehouse, inactive included.
      // Low-stock list: only what's still being sold.
      const catalog = loadCatalog(ctx.db);
      let totalOnHand = 0;
      const lowStockItems = [];
      for (const product of catalog.products) {
        for (const { variant, row } of stockLines(product, catalog, {
          includeInactiveVariants: true,
        })) {
          const onHand = row?.onHand ?? 0;
          totalOnHand += onHand;
          const selling = product.isActive && (variant?.isActive ?? true);
          if (selling && onHand < product.reorderThreshold) {
            lowStockItems.push({
              productId: product._id,
              variantId: variant?._id ?? null,
              productName: product.name,
              variantName: variant?.name ?? null,
              sku: variant?.sku ?? product.sku,
              onHand,
              reorderThreshold: product.reorderThreshold,
              shortage: product.reorderThreshold - onHand,
            });
          }
        }
      }
      lowStockItems.sort((a, b) => b.shortage - a.shortage);

      const ordersByStatus = Object.fromEntries(
        ORDER_STATUSES.map((s) => [s, 0]),
      ) as Record<OrderStatus, number>;
      for (const r of ctx.db
        .select({ status: orders.status, n: count() })
        .from(orders)
        .groupBy(orders.status)
        .all()) {
        ordersByStatus[r.status] = r.n;
      }
      const totalOrders = Object.values(ordersByStatus).reduce(
        (s, n) => s + n,
        0,
      );
      // Only orders that went out can be returned or swapped. An order is
      // counted by what happened to it, not its latest status: one swapped
      // and later returned still counts as swapped, and the other way round.
      const wentOut = and(
        inArray(orders.status, [...SHIPPED_TYPE_STATUSES]),
        sql`${orders.shippedAt} is not null`,
      );
      const shippedCount = ctx.db.select({ n: count() }).from(orders).where(wentOut).get()?.n ?? 0;
      const returnedCount =
        ctx.db
          .select({ n: count() })
          .from(orders)
          .where(
            and(
              wentOut,
              or(
                inArray(orders.status, ["returned", "partially_returned"]),
                sql`exists (select 1 from financial_events e where e.order_id = ${orders._id} and e.type = 'refund')`,
              ),
            ),
          )
          .get()?.n ?? 0;
      const swappedCount =
        ctx.db
          .select({ n: count() })
          .from(orders)
          .where(
            and(
              wentOut,
              sql`exists (select 1 from order_line_items li where li.order_id = ${orders._id} and li.is_swap_replacement = 1)`,
            ),
          )
          .get()?.n ?? 0;
      const openCount = OPEN_STATUSES.reduce(
        (s, st) => s + ordersByStatus[st],
        0,
      );

      // Sales are the books' net sales (sales − returns) by day, the same
      // figure as Day performance and Finance. Days before the books started
      // fall back to the orders: net revenue on the day shipped.
      const earliest = [
        addDays(today, -(DAYS - 1)),
        weekStart(addDays(today, -7 * (WEEKS - 1))),
        addMonths(today, -MONTHS),
      ].sort()[0];
      const ledgerStart = ledgerStartDay(ctx);
      const byDay = new Map<string, number>();
      if (!ledgerStart || ledgerStart > earliest) {
        const before = ledgerStart ? addDays(ledgerStart, -1) : today;
        const ops = netRevenueByDay(
          loadFinanceData(ctx.db, { fromDay: earliest, toDay: before < today ? before : today }, "shipped", tz),
        );
        for (const [day, n] of ops) byDay.set(day, n);
      }
      if (ledgerStart && ledgerStart <= today) {
        const from = ledgerStart > earliest ? ledgerStart : earliest;
        for (const [day, n] of ledgerSalesByDay(ctx.db, from, today)) byDay.set(day, n);
      }

      const daily = Array.from({ length: DAYS }, (_, i) => {
        const day = addDays(today, i - (DAYS - 1));
        return { label: day, total: sumDays(byDay, day, day) };
      });
      const weekly = Array.from({ length: WEEKS }, (_, i) => {
        const start = weekStart(addDays(today, -7 * (WEEKS - 1 - i)));
        return {
          label: start,
          total: sumDays(byDay, start, addDays(start, 6)),
        };
      });
      const monthly = Array.from({ length: MONTHS }, (_, i) => {
        const start = addMonths(today, i - (MONTHS - 1));
        return {
          label: start.slice(0, 7),
          total: sumDays(byDay, start, addDays(addMonths(start, 1), -1)),
        };
      });

      // Month to date vs the same days of last month
      const lastMonthStart = addMonths(today, -1);
      const dayOfMonth = Number(today.slice(8, 10));
      const lastMonthEnd = addDays(monthStart, -1);
      const lastMonthSameDay = addDays(lastMonthStart, dayOfMonth - 1);
      const kpis = {
        salesToday: sumDays(byDay, today, today),
        salesYesterday: sumDays(byDay, addDays(today, -1), addDays(today, -1)),
        salesThisMonth: sumDays(byDay, monthStart, today),
        salesLastMonthToDate: sumDays(
          byDay,
          lastMonthStart,
          lastMonthSameDay < lastMonthEnd ? lastMonthSameDay : lastMonthEnd,
        ),
        openOrders: openCount,
        receivables: receivables(ctx.db),
        // The receivables account in the books: also holds balances from
        // before the app (opening balance), so it can differ from the orders
        receivablesInBooks: (() => {
          if (!canView(ctx.user, "finance")) return null;
          const ar = accountByKey(ctx.db, "accounts_receivable");
          return ar ? naturalBalance(ar, accountTotals(ctx.db, today).get(ar._id)) : null;
        })(),
      };

      // Oldest open orders first, for people who can act on them
      const needsAction = canView(ctx.user, "orders")
        ? ctx.db
            .select({
              _id: orders._id,
              orderNumber: orders.orderNumber,
              orderDate: orders.orderDate,
              customer: orders.customer,
              status: orders.status,
              total: orders.total,
              itemCount: sql<number>`(select count(*) from order_line_items li where li.order_id = ${orders._id})`,
            })
            .from(orders)
            .where(inArray(orders.status, [...OPEN_STATUSES]))
            .orderBy(asc(orders.orderDate), asc(orders.orderNumber))
            .limit(NEEDS_ACTION_LIMIT)
            .all()
            .map((o) => ({
              ...o,
              displayOrderNumber: formatOrderNumber(o.orderNumber),
            }))
        : [];

      return {
        today,
        totalOnHand,
        lowStockCount: lowStockItems.length,
        lowStockItems: lowStockItems.slice(0, 20),
        ordersByStatus,
        totalOrders,
        shippedCount,
        returnedCount,
        swappedCount,
        returnRate: shippedCount > 0 ? (returnedCount / shippedCount) * 100 : 0,
        swapRate: shippedCount > 0 ? (swappedCount / shippedCount) * 100 : 0,
        kpis,
        needsAction,
        daily,
        weekly,
        monthly,
      };
    },
  }),
};
