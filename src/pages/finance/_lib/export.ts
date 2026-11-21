import type { Output, api } from "@/lib/api.ts";
import { csvAmount } from "@/lib/csv.ts";
import type { CsvRow } from "@/lib/csv.ts";
import { MONEY_EPSILON, PAYMENT_METHOD_LABELS } from "@shared/constants.ts";
import type { PaymentMethod } from "@shared/constants.ts";
import i18n, { tk } from "@/lib/i18n.ts";

const t = (key: string, vars?: Record<string, unknown>) => i18n.t(key, vars);

export type ExportData = Output<typeof api.finance.exports.exportData>;

/**
 * Accounting exports. Dates are business days (YYYY-MM-DD); amounts are plain two-decimal numbers.
 * Rows are built with English column names; buildExport() returns them in the interface language.
 */
export const EXPORT_KINDS = ["journal", "sales", "refunds"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const EXPORT_LABELS: Record<ExportKind, { label: string; description: string }> = {
  journal: {
    label: tk("Journal"),
    description: tk("Every entry's lines: automatic entries and yours"),
  },
  sales: {
    label: tk("Sales"),
    description: tk("One row per order counted as revenue"),
  },
  refunds: {
    label: tk("Refunds"),
    description: tk("Money returned to customers"),
  },
};

export const HEADERS: Record<ExportKind, string[]> = {
  journal: [tk("Date"), tk("Entry"), tk("Description"), tk("Account code"), tk("Account"), tk("Debit"), tk("Credit"), tk("Source")],
  sales: [
    tk("Date"),
    tk("Order #"),
    tk("Order date"),
    tk("Customer"),
    tk("Gross sales"),
    tk("Discount"),
    tk("Net sale"),
    tk("Current total"),
    tk("Payment status"),
    tk("Paid date"),
    tk("Payment method"),
  ],
  refunds: [tk("Date"), tk("Order #"), tk("Customer"), tk("Amount"), tk("Payment status")],
};

/** Blank instead of 0.00 in debit/credit columns, so each line has one side. */
const sideAmount = (n: number) => (Math.abs(n) < MONEY_EPSILON ? "" : csvAmount(n));
const paymentLabel = (status: string | undefined) =>
  status === undefined ? "" : status === "paid" ? t("Paid") : t("Unpaid");
const methodLabel = (method: string | undefined) => {
  const label = method ? PAYMENT_METHOD_LABELS[method as PaymentMethod] : undefined;
  return label ? t(label) : (method ?? "");
};
/** paidAt is an instant; the export shows its business day */
const toDay = (value: string | undefined, dayOf: (instant: string) => string) => (value ? dayOf(value) : "");

export function buildJournal(data: ExportData): CsvRow[] {
  return data.journal.map((l) => ({
    Date: l.date,
    Entry: l.number,
    Description: [l.memo, l.lineMemo].filter(Boolean).join(" · "),
    "Account code": String(l.accountCode),
    Account: l.accountName,
    Debit: sideAmount(l.debit),
    Credit: sideAmount(l.credit),
    Source: l.automatic ? t("Automatic") : t("Manual"),
  }));
}

export function buildSales(data: ExportData, dayOf: (instant: string) => string): CsvRow[] {
  return data.sales.map((s) => ({
    Date: s.date,
    "Order #": s.orderNumber,
    "Order date": s.orderDate,
    Customer: s.customer,
    "Gross sales": csvAmount(s.subtotal),
    Discount: csvAmount(s.discount),
    "Net sale": csvAmount(s.subtotal - s.discount),
    "Current total": csvAmount(s.total),
    "Payment status": paymentLabel(s.paymentStatus),
    "Paid date": toDay(s.paidAt, dayOf),
    "Payment method": methodLabel(s.paymentMethod),
  }));
}

export function buildRefunds(data: ExportData): CsvRow[] {
  return data.events
    .filter((e) => e.type === "refund")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      Date: e.date,
      "Order #": e.orderNumber,
      Customer: e.customer,
      Amount: csvAmount(e.amount),
      "Payment status": paymentLabel(e.paymentStatus),
    }));
}

function buildRows(kind: ExportKind, data: ExportData, dayOf: (instant: string) => string): CsvRow[] {
  switch (kind) {
    case "journal":
      return buildJournal(data);
    case "sales":
      return buildSales(data, dayOf);
    case "refunds":
      return buildRefunds(data);
  }
}

/** The rows and column names of an export, in the interface language. */
export function buildExport(
  kind: ExportKind,
  data: ExportData,
  dayOf: (instant: string) => string,
): { rows: CsvRow[]; columns: string[] } {
  const rows = buildRows(kind, data, dayOf).map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [t(key), value])),
  );
  return { rows, columns: HEADERS[kind].map((h) => t(h)) };
}
