import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LinkRow, SortableHead } from "@/components/data-table.tsx";
import type { SortDir } from "@/components/data-table.tsx";
import { NeedsConfirmationBadge, PaymentBadge, DelayedBadge, PiecesPendingBadge, StatusBadge } from "@/components/status-badge.tsx";
import { RefusedBadge } from "@/components/refusal-warning.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { useFieldVisibility } from "@/hooks/use-field-visibility.ts";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import { MONEY_EPSILON, round2 } from "@shared/constants.ts";
import { isDelayed } from "@shared/schedule.ts";
import { MessageCircleOff } from "lucide-react";
import type { OrderRow } from "../_lib/list-params.ts";

type SelectionProps = {
  /** Omit to hide the checkboxes */
  selection?: {
    selected: Set<string>;
    toggle: (id: string, on: boolean) => void;
    toggleAll: (on: boolean) => void;
    /** Rows that get a checkbox (unpaid orders, or orders being returned) */
    canSelect: (o: OrderRow) => boolean;
  };
};

/** What the courier collects on delivery: our total plus their shipping fee. */
const toCollect = (o: OrderRow) => round2(o.total + (o.shippingFee ?? 0));

function TotalCell({ order }: { order: OrderRow }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const changed = Math.abs(order.originalTotal - order.total) >= MONEY_EPSILON;
  return (
    <div className="flex flex-col items-end">
      <span className="font-medium tabular-nums">
        {formatMoney(order.total)}
      </span>
      {changed && (
        <span
          className="text-xs text-muted-foreground tabular-nums line-through"
          title={t("Original total")}
        >
          {formatMoney(order.originalTotal)}
        </span>
      )}
    </div>
  );
}

export function OrdersTable({
  orders,
  sort,
  dir,
  onSort,
  selection,
}: {
  orders: OrderRow[];
  sort: string;
  dir: SortDir;
  onSort: (column: string, dir: SortDir) => void;
} & SelectionProps) {
  const { t } = useTranslation();
  const { formatDay, formatMoney } = useFormat();
  const { isFieldVisible } = useFieldVisibility();
  const show = (field: string) => isFieldVisible("orders", field);

  const payable = selection ? orders.filter(selection.canSelect) : [];
  const selectedCount = selection
    ? payable.filter((o) => selection.selected.has(o._id)).length
    : 0;
  const headerState =
    selectedCount === 0
      ? false
      : selectedCount === payable.length
        ? true
        : "indeterminate";

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {selection && (
            <TableHead className="w-10">
              <Checkbox
                checked={headerState}
                onCheckedChange={(v) => selection.toggleAll(v === true)}
                disabled={payable.length === 0}
                aria-label={t("Select all unpaid orders on this page")}
              />
            </TableHead>
          )}
          <SortableHead column="number" sort={sort} dir={dir} onSort={onSort}>
            {t("Order")}
          </SortableHead>
          {show("orderDate") && (
            <SortableHead column="date" sort={sort} dir={dir} onSort={onSort}>
              {t("Date")}
            </SortableHead>
          )}
          <SortableHead column="customer" sort={sort} dir={dir} onSort={onSort}>
            {t("Customer")}
          </SortableHead>
          {show("shipmentNumber") && <TableHead>{t("Shipment #")}</TableHead>}
          {show("items") && (
            <TableHead className="text-end">{t("Items")}</TableHead>
          )}
          <SortableHead
            column="total"
            sort={sort}
            dir={dir}
            onSort={onSort}
            align="right"
          >
            {t("Total")}
          </SortableHead>
          {show("shippingFee") && (
            <TableHead className="text-end">{t("Shipping fee")}</TableHead>
          )}
          {show("toCollect") && (
            <TableHead className="text-end">{t("To collect")}</TableHead>
          )}
          <TableHead>{t("Status")}</TableHead>
          {show("payment") && <TableHead>{t("Payment")}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => {
          const selectable = selection?.canSelect(o) ?? false;
          const checked = selection?.selected.has(o._id) ?? false;
          return (
            <LinkRow
              key={o._id}
              to={`/orders/${o._id}`}
              label={`${o.displayOrderNumber}, ${o.customer}`}
              className={cn(checked && "bg-muted/50")}
            >
              {selection && (
                <TableCell>
                  {selectable && (
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        selection.toggle(o._id, v === true)
                      }
                      aria-label={t("Select {{order}}", {
                        order: o.displayOrderNumber,
                      })}
                    />
                  )}
                </TableCell>
              )}
              <TableCell className="font-medium whitespace-nowrap">
                {o.displayOrderNumber}
              </TableCell>
              {show("orderDate") && (
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDay(o.orderDate)}
                </TableCell>
              )}
              <TableCell className="max-w-56">
                <div className="truncate font-medium">{o.customer}</div>
                {show("customerPhone") && o.customerPhone && (
                  <div className="truncate text-xs text-muted-foreground">
                    {o.customerPhone}
                  </div>
                )}
              </TableCell>
              {show("shipmentNumber") && (
                <TableCell className="max-w-40 truncate font-mono text-xs text-muted-foreground">
                  {o.shipmentNumber}
                </TableCell>
              )}
              {show("items") && (
                <TableCell className="text-end text-muted-foreground tabular-nums whitespace-nowrap">
                  {t("{{count}} units", { count: o.unitCount })}
                  {o.lineItemCount > 1 && (
                    <span className="text-xs">
                      {" "}
                      · {t("{{count}} lines", { count: o.lineItemCount })}
                    </span>
                  )}
                </TableCell>
              )}
              <TableCell className="text-end">
                <TotalCell order={o} />
              </TableCell>
              {show("shippingFee") && (
                <TableCell className="text-end text-muted-foreground tabular-nums">
                  {o.shippingFee === null ? "—" : formatMoney(o.shippingFee)}
                </TableCell>
              )}
              {show("toCollect") && (
                <TableCell className="text-end font-medium tabular-nums">
                  {formatMoney(toCollect(o))}
                </TableCell>
              )}
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  <StatusBadge status={o.status} />
                  {o.awaitingConfirmation && o.status !== "cancelled" && <NeedsConfirmationBadge />}
                  {isDelayed(o) && <DelayedBadge shipOn={o.shipOn!} />}
                  {o.returnPending && <PiecesPendingBadge />}
                  <RefusedBadge count={o.refusedBefore} />
                  <WhatsAppPending order={o} />
                </div>
              </TableCell>
              {show("payment") && (
                <TableCell>
                  <PaymentBadge paid={o.paymentStatus === "paid"} />
                </TableCell>
              )}
            </LinkRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** The list on small screens: one card per order. */
export function OrderCards({
  orders,
  selection,
}: { orders: OrderRow[] } & SelectionProps) {
  const { t } = useTranslation();
  const { formatDay, formatMoney } = useFormat();
  const { isFieldVisible } = useFieldVisibility();
  const show = (field: string) => isFieldVisible("orders", field);
  return (
    <ul className="divide-y">
      {orders.map((o) => (
        <li key={o._id} className="flex items-start gap-3 py-3">
          {selection && (
            <div className="w-5 pt-0.5">
              {selection.canSelect(o) && (
                <Checkbox
                  checked={selection.selected.has(o._id)}
                  onCheckedChange={(v) => selection.toggle(o._id, v === true)}
                  aria-label={t("Select {{order}}", {
                    order: o.displayOrderNumber,
                  })}
                />
              )}
            </div>
          )}
          <Link
            to={`/orders/${o._id}`}
            className="grid min-w-0 flex-1 gap-1.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-medium">{o.customer}</span>
              <TotalCell order={o} />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {o.displayOrderNumber}
              </span>
              {show("orderDate") && <span>{formatDay(o.orderDate)}</span>}
              {show("items") && (
                <span>{t("{{count}} units", { count: o.unitCount })}</span>
              )}
              {show("shipmentNumber") && (
                <span className="truncate font-mono">{o.shipmentNumber}</span>
              )}
              {show("toCollect") && (
                <span>
                  {t("To collect")}: {formatMoney(toCollect(o))}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge status={o.status} />
              {o.awaitingConfirmation && o.status !== "cancelled" && <NeedsConfirmationBadge />}
              {isDelayed(o) && <DelayedBadge shipOn={o.shipOn!} />}
                  {o.returnPending && <PiecesPendingBadge />}
              <WhatsAppPending order={o} />
              {show("payment") && (
                <PaymentBadge paid={o.paymentStatus === "paid"} />
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Marks orders that were never posted to the WhatsApp group (probably forgotten). */
function WhatsAppPending({ order }: { order: OrderRow }) {
  const { t } = useTranslation();
  if (order.status === "cancelled" || order.whatsappPostedAt) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"
      title={t("Not posted to WhatsApp")}
    >
      <MessageCircleOff className="size-3.5" aria-hidden />
      <span className="sr-only">{t("Not posted to WhatsApp")}</span>
    </span>
  );
}
