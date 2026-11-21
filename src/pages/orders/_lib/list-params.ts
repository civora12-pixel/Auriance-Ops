import type { api, Input, Output } from "@/lib/api.ts";
import type { SortDir } from "@/components/data-table.tsx";
import { tk } from "@/lib/i18n.ts";
import {
  DAY_RE,
  OPEN_STATUSES,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
} from "@shared/constants.ts";
import type { OrderStatus } from "@shared/constants.ts";

/** Orders list state as kept in the URL (see useUrlState). */
export const LIST_DEFAULTS = {
  status: "all",
  payment: "all",
  wa: "",
  ret: "",
  web: "",
  /** "1": open orders the customer asked to ship later */
  sched: "",
  /** "1": partly collected, waiting for the warehouse to record the returned pieces */
  pend: "",
  q: "",
  from: "",
  to: "",
  /** "shipped": the dates are ship dates (from the dashboard's breakdowns) */
  by: "",
  sort: "number",
  dir: "desc",
  page: "1",
  size: "25",
};
export type ListState = typeof LIST_DEFAULTS;

export const PAGE_SIZES = [25, 50, 100];
const SORTS = ["number", "date", "customer", "total"] as const;
type SortKey = (typeof SORTS)[number];

export type ListFilters = Omit<
  Input<typeof api.orders.list>,
  "page" | "pageSize"
>;
export type OrderRow = Output<typeof api.orders.list>["items"][number];

/** Orders whose announced return can be confirmed from the list. */
export const isReturning = (o: OrderRow) => o.returningUnits > 0;

/** Orders that can be marked paid from the list. */
export const isPayable = (o: OrderRow) =>
  o.paymentStatus === "unpaid" && o.status !== "cancelled";

/** `label` is an English key; translate it where it's shown. */
export type StatusTab = {
  value: string;
  label: string;
  statuses?: readonly OrderStatus[];
};

export const STATUS_TABS: StatusTab[] = [
  { value: "all", label: tk("All") },
  { value: "open", label: tk("Open"), statuses: OPEN_STATUSES },
  ...ORDER_STATUSES.map((s) => ({
    value: s,
    label: ORDER_STATUS_LABELS[s],
    statuses: [s],
  })),
];

/** Orders in a tab, from the per-status counts the list returns. */
export function tabCount(
  tab: StatusTab,
  counts: Record<OrderStatus, number> | undefined,
): number | undefined {
  if (!counts) return undefined;
  const statuses = tab.statuses ?? ORDER_STATUSES;
  return statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
}

/** Turns URL state into the list query input, ignoring values that don't parse. */
export function parseListState(state: ListState) {
  const tab =
    STATUS_TABS.find((t) => t.value === state.status) ?? STATUS_TABS[0];
  const fromDay = DAY_RE.test(state.from) ? state.from : undefined;
  const toDay = DAY_RE.test(state.to) ? state.to : undefined;
  const dateError =
    fromDay && toDay && fromDay > toDay
      ? tk("The start date is after the end date")
      : undefined;
  const sort: SortKey = (SORTS as readonly string[]).includes(state.sort)
    ? (state.sort as SortKey)
    : "number";
  const dir: SortDir = state.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number.parseInt(state.page, 10) || 1);
  const pageSize = PAGE_SIZES.includes(Number(state.size))
    ? Number(state.size)
    : PAGE_SIZES[0];
  const search = state.q.trim().slice(0, 500);

  const filters: ListFilters = {
    statuses: tab.statuses ? [...tab.statuses] : undefined,
    payment:
      state.payment === "paid" || state.payment === "unpaid" || state.payment === "due"
        ? state.payment
        : undefined,
    notPostedToWhatsApp: state.wa === "1" || undefined,
    returning: state.ret === "1" || undefined,
    needsConfirmation: state.web === "1" || undefined,
    delayed: state.sched === "1" || undefined,
    returnPending: state.pend === "1" || undefined,
    search: search || undefined,
    fromDay: dateError ? undefined : fromDay,
    toDay: dateError ? undefined : toDay,
    dateBy: state.by === "shipped" ? "shipped" : undefined,
    sort,
    dir,
  };
  const hasFilters = !!(
    filters.payment ||
    filters.notPostedToWhatsApp ||
    filters.returning ||
    filters.needsConfirmation ||
    filters.delayed ||
    filters.returnPending ||
    filters.search ||
    fromDay ||
    toDay
  );
  return {
    tab: tab.value,
    filters,
    page,
    pageSize,
    sort,
    dir,
    dateError,
    hasFilters,
  };
}
