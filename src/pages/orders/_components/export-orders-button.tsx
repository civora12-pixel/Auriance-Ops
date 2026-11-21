import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { useFieldVisibility } from "@/hooks/use-field-visibility.ts";
import { api, getErrorMessage, useApiClient } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { csvAmount, downloadCsv, fetchAllPages } from "@/lib/csv.ts";
import type { CsvRow } from "@/lib/csv.ts";
import { useFormat } from "@/lib/format.ts";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  SALES_CHANNEL_LABELS,
} from "@shared/constants.ts";
import type { ListFilters } from "../_lib/list-params.ts";

type OrderRow = Output<typeof api.orders.list>["items"][number];

type Column = {
  header: string;
  field?: string;
  value: (o: OrderRow) => string | number | undefined;
};

/** Downloads every order matching the current filters (all pages), with the visible fields. */
export function ExportOrdersButton({ filters }: { filters: ListFilters }) {
  const { t } = useTranslation();
  const client = useApiClient();
  const format = useFormat();
  const { isFieldVisible } = useFieldVisibility();
  const [busy, setBusy] = useState(false);

  const columns: Column[] = [
    { header: t("Order #"), value: (o) => o.displayOrderNumber },
    { header: t("Order date"), field: "orderDate", value: (o) => o.orderDate },
    { header: t("Customer"), value: (o) => o.customer },
    {
      header: t("Customer phone"),
      field: "customerPhone",
      value: (o) => o.customerPhone,
    },
    { header: t("Second phone"), value: (o) => o.customerPhone2 },
    { header: t("Delivery address"), value: (o) => o.address },
    {
      header: t("Ordered via"),
      value: (o) => (o.channel ? t(SALES_CHANNEL_LABELS[o.channel]) : ""),
    },
    {
      header: t("Shipment #"),
      field: "shipmentNumber",
      value: (o) => o.shipmentNumber,
    },
    { header: t("Sales rep"), value: (o) => o.repName },
    { header: t("Line items"), field: "items", value: (o) => o.lineItemCount },
    { header: t("Units"), field: "items", value: (o) => o.unitCount },
    { header: t("Status"), value: (o) => t(ORDER_STATUS_LABELS[o.status]) },
    { header: t("Items subtotal"), value: (o) => csvAmount(o.subtotal) },
    { header: t("Discount"), value: (o) => csvAmount(o.discountAmount) },
    { header: t("Original total"), value: (o) => csvAmount(o.originalTotal) },
    { header: t("Refunded"), value: (o) => csvAmount(o.refundedAmount) },
    {
      header: t("Swap adjustment"),
      value: (o) => csvAmount(o.swapPriceDifference),
    },
    { header: t("Total"), value: (o) => csvAmount(o.total) },
    { header: t("Shipping fee"), value: (o) => csvAmount(o.shippingFee) },
    {
      header: t("To collect on delivery"),
      value: (o) => csvAmount(o.total + o.shippingFee),
    },
    {
      header: t("Posted to WhatsApp"),
      value: (o) => (o.whatsappPostedAt ? t("Yes") : t("No")),
    },
    {
      header: t("Payment"),
      field: "payment",
      value: (o) => (o.paymentStatus === "paid" ? t("Paid") : t("Unpaid")),
    },
    {
      header: t("Paid on"),
      field: "payment",
      value: (o) => (o.paidAt ? format.dayOf(o.paidAt) : ""),
    },
    {
      header: t("Payment method"),
      field: "payment",
      value: (o) =>
        o.paymentMethod ? t(PAYMENT_METHOD_LABELS[o.paymentMethod]) : "",
    },
    {
      header: t("Shipped on"),
      value: (o) => (o.shippedAt ? format.dayOf(o.shippedAt) : ""),
    },
    { header: t("Notes"), field: "notes", value: (o) => o.notes },
    {
      header: t("Shipment notes"),
      field: "shipmentNotes",
      value: (o) => o.shipmentNotes,
    },
  ];

  const run = async () => {
    setBusy(true);
    try {
      const orders = await fetchAllPages((page, pageSize) =>
        client.query(api.orders.list, { ...filters, page, pageSize }),
      );
      if (!orders.length) {
        toast.info(t("No orders match the current filters"));
        return;
      }
      const visible = columns.filter(
        (c) => !c.field || isFieldVisible("orders", c.field),
      );
      const rows = orders.map((o) => {
        const row: CsvRow = {};
        for (const c of visible) row[c.header] = c.value(o);
        return row;
      });
      downloadCsv(
        `orders-${format.today()}.csv`,
        rows,
        visible.map((c) => c.header),
      );
      toast.success(t("Exported {{count}} orders", { count: orders.length }));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" onClick={run} disabled={busy}>
      {busy ? <Spinner /> : <Download />}
      {t("Export CSV")}
    </Button>
  );
}
