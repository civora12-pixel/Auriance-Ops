import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Check,
  Copy,
  CalendarClock,
  Tag,
  CopyPlus,
  Link2,
  MoreHorizontal,
  PauseCircle,
  MessageCircle,
  Pencil,
  Phone,
  PlayCircle,
  Printer,
  Repeat,
  RotateCcw,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { Photo } from "@/components/photo.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { NotFoundState, PageSkeleton } from "@/components/states.tsx";
import { NeedsConfirmationBadge, PaymentBadge, DelayedBadge, PiecesPendingBadge, StatusBadge } from "@/components/status-badge.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Field, FieldLabel } from "@/components/ui/field.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useFieldVisibility } from "@/hooks/use-field-visibility.ts";
import { api, useMutation, useQuery } from "@/lib/api.ts";
import { useAdminMode, useAuth, useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import {
  ORDER_STATUS_LABELS,
  SALES_CHANNEL_LABELS,
  round2,
} from "@shared/constants.ts";
import { GenderBadge } from "@/components/gender.tsx";
import NewOrderDialog from "../_components/new-order-dialog.tsx";
import { EditDetailsDialog } from "./_components/edit-details-dialog.tsx";
import { PaymentCard } from "./_components/payment-card.tsx";
import { ReturnDialog } from "./_components/return-dialog.tsx";
import { SwapDialog } from "./_components/swap-dialog.tsx";
import { WhatsAppCard, WhatsAppPrompt } from "./_components/whatsapp-card.tsx";
import { ConfirmWebOrderCard } from "./_components/confirm-web-order-card.tsx";
import { ShipDateDialog } from "../_components/ship-date-dialog.tsx";
import { CorrectPriceDialog } from "./_components/correct-price-dialog.tsx";
import { isDelayed } from "@shared/schedule.ts";
import { RefusalWarning } from "@/components/refusal-warning.tsx";
import { customerWhatsAppMessage, whatsAppChatUrl } from "@/lib/whatsapp.ts";
import { isZero, lineLabel, orderState } from "./_lib/order.ts";
import type { OrderDetail } from "./_lib/order.ts";

type Dialog =
  | "shipAll"
  | "cancel"
  | "reopen"
  | "return"
  | "swap"
  | "edit"
  | "shipLater"
  | "correctPrice"
  | "rerecord"
  | "transitReceived"
  | "transitLost"
  | "delete";

export default function OrderDetailPage() {
  const { t } = useTranslation();
  const { orderId = "" } = useParams();
  const order = useQuery(api.orders.get, { orderId });

  if (order === undefined) {
    return (
      <PageBody>
        <PageSkeleton cards={2} rows={4} />
      </PageBody>
    );
  }
  if (order === null) {
    return (
      <PageBody>
        <NotFoundState
          title={t("Order not found")}
          description={t("It may have been deleted, or the link is wrong.")}
          backTo="/orders"
          backLabel={t("Back to orders")}
        />
      </PageBody>
    );
  }
  return <OrderView order={order} />;
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 align-middle text-muted-foreground print:hidden"
      aria-label={t("Copy {{text}}", { text })}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error(t("Couldn't copy to the clipboard"));
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}

function OrderView({ order }: { order: OrderDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useAuth();
  // Right after an order is created, offer the WhatsApp post straight away
  const [searchParams, setSearchParams] = useSearchParams();
  const [whatsAppPrompt, setWhatsAppPrompt] = useState(
    () => searchParams.get("post") === "1" && order.status !== "cancelled",
  );
  useEffect(() => {
    if (searchParams.has("post")) {
      searchParams.delete("post");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const { isAdmin, canChangeStatus, canShip, canAccess } = useCurrentUser();
  const { isAdminMode } = useAdminMode();
  const { isFieldVisible } = useFieldVisibility();
  const { formatDay } = useFormat();
  const updateStatus = useMutation(api.orders.updateStatus);
  const deleteOrder = useMutation(api.admin.destructive.deleteOrder);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [note, setNote] = useState("");
  const state = orderState(order);
  const show = (field: string) => isFieldVisible("orders", field);

  const open = (d: Dialog) => {
    setNote("");
    setDialog(d);
  };
  const dialogProps = (d: Dialog) => ({
    open: dialog === d,
    onOpenChange: (next: boolean) => setDialog(next ? d : null),
  });
  const setStatus = (status: "shipped" | "cancelled" | "new") => () =>
    updateStatus({
      orderId: order._id,
      status,
      note: note.trim() || undefined,
    });

  const inTransitUnits = order.lineItems.reduce(
    (sum, l) => sum + l.inTransitQuantity,
    0,
  );
  const resolveTransit = useMutation(api.orders.resolveInTransit);
  const hasMenu =
    canChangeStatus && (state.shippable || state.isHeld) && state.canCancel;
  // Only a cancelled order can be re-recorded, and only while no copy is active
  const activeCopy = order.rerecordedAs.find((o) => o.status !== "cancelled");
  const canRerecord =
    canChangeStatus && order.status === "cancelled" && !activeCopy;

  const actions = (
    <>
      {canShip && state.shippable && !order.awaitingConfirmation && (
        <Button onClick={() => open("shipAll")}>
          <Truck />
          {t("Ship order")}
        </Button>
      )}
      {canRerecord && (
        <Button onClick={() => open("rerecord")}>
          <CopyPlus />
          {t("Re-record")}
        </Button>
      )}
      {canChangeStatus && state.canReopen && !activeCopy && (
        <Button variant="outline" onClick={() => open("reopen")}>
          <PlayCircle />
          {t("Reopen")}
        </Button>
      )}
      {canShip && state.canReturn && (
        <Button variant="outline" onClick={() => open("return")}>
          <RotateCcw />
          {t("Return")}
        </Button>
      )}
      {canChangeStatus && state.canReturn && (
        <>
          <Button variant="outline" onClick={() => open("swap")}>
            <Repeat />
            {t("Swap")}
          </Button>
        </>
      )}
      {canChangeStatus && (order.status === "new" || order.status === "on_hold") && !order.awaitingConfirmation && (
        <Button variant="outline" onClick={() => open("shipLater")}>
          <CalendarClock />
          {order.shipOn ? t("Change ship date") : t("Delay shipping")}
        </Button>
      )}
      {isAdmin && order.status === "shipped" && order.paymentStatus !== "paid" && (
        <Button variant="outline" onClick={() => open("correctPrice")}>
          <Tag />
          {t("Correct the price")}
        </Button>
      )}
      <Button variant="outline" onClick={() => window.print()}>
        <Printer />
        {t("Print")}
      </Button>
      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("More actions")}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              disabled={state.isPaid}
              onSelect={() => open("cancel")}
            >
              <XCircle />
              {t("Cancel order")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );

  return (
    <PageBody>
      <div className="hidden items-center gap-3 print:flex">
        <img src="/brand/logo.webp" alt="" className="size-14" />
        <div>
          <p className="text-lg font-semibold">{settings.businessName}</p>
          <p className="text-sm">{t("Packing slip")}</p>
        </div>
      </div>

      <PageHeader
        breadcrumbs={[
          { label: t("Orders"), to: "/orders" },
          { label: order.displayOrderNumber },
        ]}
        title={
          <span className="inline-flex items-center gap-1">
            {order.displayOrderNumber}
            <CopyButton text={order.displayOrderNumber} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge status={order.status} />
            {order.awaitingConfirmation && order.status !== "cancelled" && <NeedsConfirmationBadge />}
            {isDelayed(order) && <DelayedBadge shipOn={order.shipOn!} />}
            {order.returnPending && <PiecesPendingBadge />}
            {show("payment") && <PaymentBadge paid={state.isPaid} />}
            <span>{order.customer}</span>
            <span aria-hidden>·</span>
            <span>{formatDay(order.orderDate)}</span>
            <span aria-hidden>·</span>
            <span>{t("by {{name}}", { name: order.repName })}</span>
          </span>
        }
        actions={actions}
      />

      {(order.rerecordedFrom || order.rerecordedAs.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-sm print:hidden">
          <Link2 className="size-4 text-muted-foreground" />
          {order.rerecordedFrom && (
            <span>
              {t("Re-recorded from")}{" "}
              <Link
                to={`/orders/${order.rerecordedFrom._id}`}
                className="font-medium underline underline-offset-4"
              >
                {order.rerecordedFrom.displayOrderNumber}
              </Link>
            </span>
          )}
          {order.rerecordedAs.map((o) => (
            <span key={o._id}>
              {t("Re-recorded as")}{" "}
              <Link
                to={`/orders/${o._id}`}
                className="font-medium underline underline-offset-4"
              >
                {o.displayOrderNumber}
              </Link>
            </span>
          ))}
        </div>
      )}

      {state.isHeld && (
        <Alert className="border-chart-1/40 print:hidden">
          <PauseCircle />
          <AlertTitle>{t("On hold: waiting for stock")}</AlertTitle>
          <AlertDescription>
            <p>
              {t(
                "The whole order waits until every item is available. It moves to New by itself when stock arrives. To send only what's available, cancel it and re-record it without the missing items.",
              )}
            </p>
            {order.shortages.length > 0 && (
              <ul className="mt-1 list-disc ps-5">
                {order.shortages.map((s) => (
                  <li key={s.label}>
                    {t("{{item}}: {{needed}} needed, {{available}} available", {
                      item: s.label,
                      needed: s.needed,
                      available: s.available,
                    })}
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {inTransitUnits > 0 && (
        <Alert className="print:hidden">
          <Truck />
          <AlertTitle>
            {t("Return in transit: {{n}} pieces on their way back", {
              n: inTransitUnits,
            })}
          </AlertTitle>
          <AlertDescription className="grid gap-2">
            <p>
              {t(
                "The sale is already reversed. When the parcel arrives, mark it received to put the items back in stock.",
              )}
            </p>
            {canShip && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => open("transitReceived")}>
                  {t("Mark received")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => open("transitLost")}
                >
                  {t("Write off as lost")}
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {canChangeStatus && state.canCancel && state.isPaid && (
        <p className="text-xs text-muted-foreground print:hidden">
          {t(
            "This order is marked as paid, so it can't be cancelled until it's marked unpaid.",
          )}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] print:block print:space-y-6">
        <div className="grid min-w-0 content-start gap-6">
          <ItemsCard order={order} canOpenProducts={canAccess("inventory")} />
          <Timeline order={order} />
        </div>
        <div className="grid content-start gap-6">
          {(order.status === "new" || order.status === "on_hold") && (
            <RefusalWarning history={order.customerHistory} className="print:hidden" />
          )}
          {order.awaitingConfirmation && order.status !== "cancelled" && (
            <ConfirmWebOrderCard order={order} canEdit={canChangeStatus} />
          )}
          <CustomerCard
            order={order}
            onEdit={canChangeStatus ? () => open("edit") : undefined}
          />
          {order.status !== "cancelled" && <WhatsAppCard order={order} />}
          {show("payment") && (
            <div className="print:hidden">
              <PaymentCard order={order} />
            </div>
          )}
          {isAdmin && isAdminMode && (
            <Card className="border-destructive/40 print:hidden">
              <CardHeader>
                <CardTitle className="text-destructive">
                  {t("Danger zone")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "Deleting reverses this order's stock movements and removes its history. It's recorded in the deletion log.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => open("delete")}
                >
                  <Trash2 />
                  {t("Delete order")}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        {...dialogProps("shipAll")}
        title={t("Ship this order?")}
        description={t(
          "{{count}} units will be taken out of stock and the order marked as shipped.",
          { count: state.remainingUnits },
        )}
        confirmLabel={t("Ship")}
        onConfirm={setStatus("shipped")}
        successMessage={t("Order shipped")}
      >
        <NoteField
          value={note}
          onChange={setNote}
          placeholder={t("Courier, tracking details…")}
        />
      </ConfirmDialog>
      <ConfirmDialog
        {...dialogProps("cancel")}
        title={t("Cancel {{order}}?", { order: order.displayOrderNumber })}
        description={t(
          "Nothing has shipped, so stock doesn't change. Any stock it held goes to waiting orders. You can re-record it later.",
        )}
        confirmLabel={t("Cancel order")}
        destructive
        onConfirm={setStatus("cancelled")}
        successMessage={t("Order cancelled")}
      >
        <NoteField
          value={note}
          onChange={setNote}
          label={t("Reason")}
          placeholder={t("Customer changed their mind…")}
        />
      </ConfirmDialog>
      <ConfirmDialog
        {...dialogProps("reopen")}
        title={t("Reopen this order?")}
        description={t(
          "It goes back to New if its stock is available, otherwise it waits On hold.",
        )}
        confirmLabel={t("Reopen")}
        onConfirm={setStatus("new")}
        successMessage={t("Order reopened")}
      >
        <NoteField value={note} onChange={setNote} />
      </ConfirmDialog>
      <ConfirmDialog
        {...dialogProps("transitReceived")}
        title={t("Mark the return as received?")}
        description={t(
          "{{n}} pieces go back into stock. If some arrived damaged, use Returns on the Stock page to write them off instead.",
          { n: inTransitUnits },
        )}
        confirmLabel={t("Mark received")}
        onConfirm={() =>
          resolveTransit({
            orders: [{ orderId: order._id, outcome: "received" }],
          })
        }
        successMessage={t("Return received")}
      />
      <ConfirmDialog
        {...dialogProps("transitLost")}
        title={t("Write off the return as lost?")}
        description={t(
          "{{n}} pieces never arrived. They're written off at the cost they shipped with.",
          { n: inTransitUnits },
        )}
        confirmLabel={t("Write off as lost")}
        destructive
        onConfirm={() =>
          resolveTransit({ orders: [{ orderId: order._id, outcome: "lost" }] })
        }
        successMessage={t("Written off as lost")}
      />
      <ConfirmDialog
        {...dialogProps("delete")}
        title={t("Delete {{order}} permanently?", {
          order: order.displayOrderNumber,
        })}
        description={t(
          "Stock moved by this order is put back, and the order, its history and its refunds are removed. This can't be undone.",
        )}
        confirmLabel={t("Delete order")}
        destructive
        onConfirm={async () => {
          await deleteOrder({ orderId: order._id });
          navigate("/orders", { replace: true });
        }}
        successMessage={t("Order deleted")}
      />

      <WhatsAppPrompt
        order={order}
        open={whatsAppPrompt}
        onOpenChange={setWhatsAppPrompt}
      />
      {state.canReturn && (
        <ReturnDialog order={order} {...dialogProps("return")} />
      )}
      {state.canReturn && <SwapDialog order={order} {...dialogProps("swap")} />}
      <EditDetailsDialog order={order} {...dialogProps("edit")} />
      {dialog === "correctPrice" && <CorrectPriceDialog order={order} {...dialogProps("correctPrice")} />}
      {dialog === "shipLater" && (
        <ShipDateDialog orderId={order._id} orderNumber={order.displayOrderNumber} current={order.shipOn} {...dialogProps("shipLater")} />
      )}
      {dialog === "rerecord" && (
        <NewOrderDialog
          {...dialogProps("rerecord")}
          rerecord={{
            orderId: order._id,
            displayOrderNumber: order.displayOrderNumber,
            customer: order.customer,
            customerPhone: order.customerPhone,
            customerPhone2: order.customerPhone2,
            address: order.address,
            channel: order.channel,
            shippingFee: order.shippingFee,
            shipmentNumber: order.shipmentNumber,
            notes: order.notes,
            shipmentNotes: order.shipmentNotes,
            total: order.originalTotal,
            hasManualTotal: order.hasManualTotal,
            lines: order.lineItems
              .filter((l) => l.inCatalog)
              .map((l) => ({
                productId: l.productId,
                variantId: l.variantId,
                quantity: l.quantity,
                gender: l.gender,
              })),
          }}
        />
      )}
    </PageBody>
  );
}

function NoteField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  return (
    <Field>
      <FieldLabel htmlFor="status-note">
        {label ?? t("Note")}{" "}
        <span className="font-normal text-muted-foreground">
          {t("(optional)")}
        </span>
      </FieldLabel>
      <Textarea
        id="status-note"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder={placeholder}
      />
    </Field>
  );
}

function ItemsCard({
  order,
  canOpenProducts,
}: {
  order: OrderDetail;
  canOpenProducts: boolean;
}) {
  const { t } = useTranslation();
  const { formatMoney, formatNumber } = useFormat();
  const totalChanged = !isZero(order.total - order.originalTotal);
  const discount = round2(order.subtotal - order.originalTotal);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Items")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="divide-y">
          {order.lineItems.map((line) => {
            const name = lineLabel(line);
            return (
              <li key={line._id} className="flex gap-3 py-3 first:pt-0">
                <Photo url={line.productImageUrl} label={name} size="lg" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {canOpenProducts && line.inCatalog ? (
                      <Link
                        to={`/products/${line.productId}`}
                        className="font-medium hover:underline"
                      >
                        {name}
                      </Link>
                    ) : (
                      <span className="font-medium">{name}</span>
                    )}
                    <GenderBadge gender={line.gender} />
                    {line.isSwapReplacement && (
                      <Badge variant="secondary">{t("Replacement")}</Badge>
                    )}
                    {!line.inCatalog && (
                      <Badge variant="outline">{t("Not in catalog")}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {line.sku} · {formatNumber(line.quantity)} ×{" "}
                    {formatMoney(line.unitPrice)}
                  </p>
                  {(line.shippedQuantity > 0 || line.returnedQuantity > 0) && (
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <Chip
                        tone={
                          line.shippedQuantity >= line.quantity
                            ? "done"
                            : "partial"
                        }
                      >
                        {line.shippedQuantity >= line.quantity
                          ? t("Shipped")
                          : t("{{shipped}} of {{quantity}} shipped", {
                              shipped: line.shippedQuantity,
                              quantity: line.quantity,
                            })}
                      </Chip>
                      {line.returnedQuantity > 0 && (
                        <Chip tone="returned">
                          {t("{{count}} returned", {
                            count: line.returnedQuantity,
                          })}
                        </Chip>
                      )}
                    </div>
                  )}
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums">
                  {formatMoney(line.subtotal)}
                </p>
              </li>
            );
          })}
        </ul>

        <dl className="grid gap-1.5 border-t pt-4 text-sm">
          <Row label={t("Subtotal")} value={formatMoney(order.subtotal)} />
          {order.promoCode && <Row label={t("Promo code")} value={order.promoCode} />}
          {!isZero(discount) && (
            <Row
              label={discount > 0 ? t("Discount") : t("Surcharge")}
              value={
                discount > 0
                  ? `−${formatMoney(discount)}`
                  : `+${formatMoney(-discount)}`
              }
            />
          )}
          {totalChanged && (
            <Row
              label={t("Original total")}
              value={formatMoney(order.originalTotal)}
            />
          )}
          {!isZero(order.refundedAmount) && (
            <Row
              label={t("Refunded")}
              value={`−${formatMoney(order.refundedAmount)}`}
            />
          )}
          {!isZero(order.swapPriceDifference) && (
            <Row
              label={t("Swap adjustment")}
              value={`${order.swapPriceDifference > 0 ? "+" : "−"}${formatMoney(Math.abs(order.swapPriceDifference))}`}
            />
          )}
          <Row label={t("Total")} value={formatMoney(order.total)} strong />
          {order.hasManualTotal && (
            <p className="text-xs text-muted-foreground">
              {t("The total was set by hand.")}
            </p>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: ReactNode;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4",
        strong && "border-t pt-2 text-base font-semibold",
      )}
    >
      <dt className={cn(!strong && "text-muted-foreground")}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Chip({
  tone,
  children,
}: {
  tone: "done" | "partial" | "returned";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-medium",
        tone === "done" &&
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        tone === "partial" &&
          "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        tone === "returned" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function CustomerCard({
  order,
  onEdit,
}: {
  order: OrderDetail;
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  const { isFieldVisible } = useFieldVisibility();
  const show = (field: string) => isFieldVisible("orders", field);
  const { formatDay, formatMoney } = useFormat();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("Customer & shipping")}</CardTitle>
        {onEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="print:hidden"
          >
            <Pencil />
            {t("Edit")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          <Detail label={t("Customer")}>{order.customer}</Detail>
          {order.customerPhone && (
            <Detail label={t("Phone")}>
              {[order.customerPhone, order.customerPhone2]
                .filter(Boolean)
                .map((phone) => (
                  <span key={phone} className="flex items-center gap-2">
                    <a
                      href={`tel:${phone}`}
                      className="flex w-fit items-center gap-1.5 hover:underline"
                      dir="ltr"
                    >
                      <Phone className="size-3.5 text-muted-foreground" />
                      {phone}
                    </a>
                    <a
                      href={whatsAppChatUrl(
                        phone!,
                        customerWhatsAppMessage({
                          ...order,
                          orderNumber: order.displayOrderNumber,
                          confirming: false,
                        }),
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 print:hidden"
                      aria-label={t("Message {{phone}} on WhatsApp", { phone })}
                    >
                      <MessageCircle className="size-3" />
                      {t("Message")}
                    </a>
                  </span>
                ))}
            </Detail>
          )}
          {order.address && (
            <Detail label={t("Delivery address")}>
              <span dir="auto" className="whitespace-pre-wrap">
                {order.address}
              </span>
            </Detail>
          )}
          {order.governorate && (
            <Detail label={t("Governorate / city")}>
              <span dir="auto">{[order.governorate, order.city].filter(Boolean).join(" · ")}</span>
            </Detail>
          )}
          {order.channel && (
            <Detail label={t("Ordered via")}>
              {t(SALES_CHANNEL_LABELS[order.channel])}
            </Detail>
          )}
          <Detail label={t("Shipping fee")}>
            {formatMoney(order.shippingFee)}
          </Detail>
          <Detail label={t("To collect on delivery")}>
            <span className="font-semibold tabular-nums">
              {formatMoney(round2(order.total + order.shippingFee))}
            </span>
          </Detail>
          <Detail label={t("Shipment number")}>
            <span className="inline-flex items-center gap-1">
              <span className="font-mono">{order.shipmentNumber}</span>
              <CopyButton text={order.shipmentNumber} />
            </span>
          </Detail>
          {order.shippedAt && (
            <Detail label={t("Shipped")}>{formatDay(order.shippedAt)}</Detail>
          )}
          {show("shipmentNotes") && order.shipmentNotes && (
            <Detail label={t("Shipment notes")}>
              <span className="whitespace-pre-wrap">{order.shipmentNotes}</span>
            </Detail>
          )}
          {show("notes") && order.notes && (
            <Detail label={t("Notes")}>
              <span className="whitespace-pre-wrap">{order.notes}</span>
            </Detail>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function Timeline({ order }: { order: OrderDetail }) {
  const { t } = useTranslation();
  const { formatDateTime, formatMoney } = useFormat();
  const entries = [
    ...order.history.map((h) => ({
      key: h._id,
      at: h.changedAt,
      title: t(ORDER_STATUS_LABELS[h.status]),
      detail: h.note,
      by: h.changedByName,
    })),
    ...order.financialEvents.map((e) => ({
      key: e._id,
      at: e.date,
      title:
        e.type === "refund"
          ? t("Refund of {{amount}}", { amount: formatMoney(e.amount) })
          : e.amount >= 0
            ? t("Swap: customer pays {{amount}} more", {
                amount: formatMoney(e.amount),
              })
            : t("Swap: refund of {{amount}}", {
                amount: formatMoney(-e.amount),
              }),
      detail: undefined,
      by: undefined,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle>{t("Activity")}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("No activity yet.")}
          </p>
        ) : (
          <ol className="relative grid gap-4 border-s ps-5">
            {entries.map((e) => (
              <li key={e.key} className="relative">
                <span className="absolute top-1.5 -start-[1.6rem] size-2.5 rounded-full border-2 border-background bg-primary" />
                <p className="text-sm font-medium">{e.title}</p>
                {e.detail && (
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {e.detail}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(e.at)}
                  {e.by && ` · ${e.by}`}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
