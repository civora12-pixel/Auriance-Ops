import { and, asc, gte, inArray, lte } from "drizzle-orm";
import { accounts, journalEntries, journalLines, orders } from "../../db/schema.ts";
import { query } from "../../rpc/procedure.ts";
import { requireView } from "../../lib/permissions.ts";
import { getTimeZone } from "../../lib/settings.ts";
import { loadFinanceData } from "../../lib/finance.ts";
import { formatOrderNumber } from "../../../shared/constants.ts";
import { zDayRange } from "./report.ts";

export const exportsRouter = {
  /** Rows for the CSV exports of one range: the journal, sales and refunds. */
  exportData: query({
    input: zDayRange,
    handler: (ctx, args) => {
      requireView(ctx, "finance");
      const tz = getTimeZone(ctx.db);
      const data = loadFinanceData(ctx.db, args, "shipped", tz);

      const orderIds = new Set<string>([
        ...data.events.map((e) => e.orderId),
        ...data.movements
          .map((m) => m.orderId)
          .filter((id): id is string => !!id),
      ]);
      const orderMap = new Map(
        orderIds.size
          ? ctx.db
              .select()
              .from(orders)
              .where(inArray(orders._id, [...orderIds]))
              .all()
              .map((o) => [o._id, o])
          : [],
      );
      const info = (o: {
        orderNumber: number;
        customer: string;
        paymentStatus: string;
        paidAt: string | null;
        paymentMethod: string | null;
      }) => ({
        orderNumber: formatOrderNumber(o.orderNumber),
        customer: o.customer,
        paymentStatus: o.paymentStatus,
        paidAt: o.paidAt,
        paymentMethod: o.paymentMethod,
      });

      const sales = data.orders
        .sort((a, b) => a.revenueAt.localeCompare(b.revenueAt))
        .map((o) => ({
          ...info(o),
          date: o.day,
          orderDate: o.orderDate,
          subtotal: o.subtotal,
          discount: o.discountAmount,
          total: o.total,
        }));

      const events = data.events.flatMap((e) => {
        const order = orderMap.get(e.orderId);
        return order
          ? [{ ...info(order), date: e.day, type: e.type, amount: e.amount }]
          : [];
      });

      // The journal for the range: every entry's lines, in date order
      const entries = ctx.db
        .select()
        .from(journalEntries)
        .where(and(gte(journalEntries.date, args.fromDay), lte(journalEntries.date, args.toDay)))
        .orderBy(asc(journalEntries.date), asc(journalEntries.number))
        .all();
      const chart = new Map(ctx.db.select().from(accounts).all().map((a) => [a._id, a]));
      const lines = entries.length
        ? ctx.db
            .select()
            .from(journalLines)
            .where(
              inArray(
                journalLines.entryId,
                entries.map((e) => e._id),
              ),
            )
            .all()
        : [];
      const journal = entries.flatMap((e) =>
        lines
          .filter((l) => l.entryId === e._id)
          .map((l) => {
            const a = chart.get(l.accountId);
            return {
              number: `JV-${String(e.number).padStart(4, "0")}`,
              date: e.date,
              memo: e.memo,
              accountCode: a?.code ?? 0,
              accountName: a?.name ?? "",
              lineMemo: l.memo,
              debit: l.debit,
              credit: l.credit,
              automatic: e.source !== "manual",
            };
          }),
      );

      return { sales, events, journal };
    },
  }),
};
