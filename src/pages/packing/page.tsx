import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CheckCircle2,
  MapPin,
  PackageCheck,
  CalendarClock,
  PauseCircle,
  Phone,
  Printer,
  StickyNote,
  Truck,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { GENDER_TEXT, GenderBadge } from "@/components/gender.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { Photo } from "@/components/photo.tsx";
import { EmptyState, PageSkeleton } from "@/components/states.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import { api, useMutation, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useAuth, useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import { pieceStyle } from "./_lib/piece-colors.ts";
import { SALES_CHANNEL_LABELS } from "@shared/constants.ts";
import { daysUntil } from "@shared/schedule.ts";

type QueueOrder = Output<typeof api.orders.packingQueue>[number];
type Ticks = Record<string, string[]>;

const TICKS_KEY = "packing-ticks";

function loadTicks(): Ticks {
  try {
    return JSON.parse(localStorage.getItem(TICKS_KEY) ?? "{}") as Ticks;
  } catch {
    return {};
  }
}

function saveTicks(ticks: Ticks) {
  try {
    localStorage.setItem(TICKS_KEY, JSON.stringify(ticks));
  } catch {
    // Ticks are a convenience; losing them on reload is fine
  }
}

/**
 * The warehouse view: what to pack, oldest first, with big photos and nothing
 * else in the way. Refreshes every few seconds so new and cancelled orders show
 * up on their own.
 */
export default function PackingPage() {
  const { t } = useTranslation();
  const { canShip } = useCurrentUser();
  const queue = useQuery(api.orders.packingQueue, undefined, {
    refetchInterval: 5_000,
  });
  const [ticks, setTicks] = useState<Ticks>(loadTicks);
  const [shipping, setShipping] = useState<QueueOrder | null>(null);
  const shippedByMe = useRef(new Set<string>());
  const seen = useRef<Map<string, string> | null>(null);

  // The day's queue: regular orders, then ones the customer asked to delay, then On hold
  const toPack = useMemo(
    () => queue?.filter((o) => o.status === "new") ?? [],
    [queue],
  );
  const regular = useMemo(() => toPack.filter((o) => !o.shipOn), [toPack]);
  const delayed = useMemo(() => toPack.filter((o) => o.shipOn), [toPack]);
  const onHold = useMemo(
    () => queue?.filter((o) => o.status === "on_hold") ?? [],
    [queue],
  );

  // Warn when an order leaves the queue because someone else changed it
  useEffect(() => {
    if (!queue) return;
    const now = new Map(queue.map((o) => [o._id, o.shipmentNumber]));
    if (seen.current) {
      for (const [id, shipment] of seen.current) {
        if (now.has(id) || shippedByMe.current.has(id)) continue;
        toast.warning(
          t(
            "Shipment {{shipment}} left the queue. It was cancelled or shipped by someone else. Don't pack it.",
            {
              shipment,
            },
          ),
          { duration: 15_000 },
        );
      }
      // Forget ticks for orders that are gone
      const kept = Object.fromEntries(
        Object.entries(ticks).filter(([id]) => now.has(id)),
      );
      if (Object.keys(kept).length !== Object.keys(ticks).length) {
        setTicks(kept);
        saveTicks(kept);
      }
    }
    seen.current = now;
  }, [queue, t, ticks]);

  const toggle = (orderId: string, lineId: string, on: boolean) => {
    const current = new Set(ticks[orderId] ?? []);
    if (on) current.add(lineId);
    else current.delete(lineId);
    const next = { ...ticks, [orderId]: [...current] };
    setTicks(next);
    saveTicks(next);
  };

  if (queue === undefined) {
    return (
      <PageBody>
        <PageSkeleton rows={4} />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        title={t("Packing queue")}
        description={t("New orders to pack, oldest first. Updates on its own.")}
        actions={
          toPack.length > 0 && (
            <Button
              variant="outline"
              onClick={() => window.print()}
              className="print:hidden"
            >
              <Printer />
              {t("Print slips")}
            </Button>
          )
        }
      />

      <Tabs defaultValue="orders" className="gap-4">
        <TabsList className="print:hidden">
          <TabsTrigger value="orders">
            {t("To pack ({{n}})", { n: toPack.length })}
          </TabsTrigger>
          <TabsTrigger value="pick">{t("Pick list")}</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="grid gap-4">
          {toPack.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 />}
              title={t("Nothing to pack")}
              description={t(
                "New orders appear here as soon as they're recorded.",
              )}
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2 print:block">
              {regular.map((order) => (
                <OrderCard
                  key={order._id}
                  order={order}
                  ticked={ticks[order._id] ?? []}
                  onTick={(lineId, on) => toggle(order._id, lineId, on)}
                  onShip={canShip ? () => setShipping(order) : undefined}
                />
              ))}
            </div>
          )}

          {delayed.length > 0 && (
            <section className="grid gap-3 print:block">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-red-700 print:hidden dark:text-red-400">
                <CalendarClock className="size-4" />
                {t("Delayed by the customer ({{n}}): ship on the date shown", {
                  n: delayed.length,
                })}
              </h2>
              <div className="grid gap-4 xl:grid-cols-2 print:block">
                {delayed.map((order) => (
                  <OrderCard
                    key={order._id}
                    order={order}
                    ticked={ticks[order._id] ?? []}
                    onTick={(lineId, on) => toggle(order._id, lineId, on)}
                    onShip={canShip ? () => setShipping(order) : undefined}
                  />
                ))}
              </div>
            </section>
          )}

          {onHold.length > 0 && (
            <section className="grid gap-3 print:hidden">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <PauseCircle className="size-4" />
                {t("Waiting for stock ({{n}}): don't pack these yet", {
                  n: onHold.length,
                })}
              </h2>
              <div className="grid gap-4 opacity-60 xl:grid-cols-2">
                {onHold.map((order) => (
                  <OrderCard key={order._id} order={order} ticked={[]} />
                ))}
              </div>
            </section>
          )}
        </TabsContent>

        <TabsContent value="pick">
          <PickList orders={toPack} />
        </TabsContent>
      </Tabs>

      {shipping && (
        <ShipDialog
          order={shipping}
          allTicked={
            (ticks[shipping._id] ?? []).length >= shipping.items.length
          }
          onClose={() => setShipping(null)}
          onShipped={() => {
            shippedByMe.current.add(shipping._id);
            setShipping(null);
          }}
        />
      )}
    </PageBody>
  );
}

function OrderCard({
  order,
  ticked,
  onTick,
  onShip,
}: {
  order: QueueOrder;
  ticked: string[];
  onTick?: (lineId: string, on: boolean) => void;
  onShip?: () => void;
}) {
  const { t } = useTranslation();
  const { formatDay, formatMoney } = useFormat();
  const { settings } = useAuth();
  const units = order.items.reduce((s, i) => s + i.quantity, 0);
  const done = order.items.filter((i) => ticked.includes(i.lineItemId)).length;
  const complete = done === order.items.length && order.items.length > 0;

  return (
    <Card
      className={cn(
        "break-inside-avoid gap-3 print:mb-0 print:break-after-page print:border-0 print:shadow-none",
        order.shipOn && "border-2 border-red-600 dark:border-red-500",
        complete && "border-emerald-500/60",
      )}
    >
      <CardHeader className="gap-2">
        {order.shipOn && <DelayedBanner shipOn={order.shipOn} />}
        {order.stockShort.length > 0 && (
          <p role="alert" className="rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            {t("Not enough free stock yet, don't pack: {{items}}", {
              items: order.stockShort.map((s) => t("{{item}} ({{free}} of {{needed}} free)", { item: s.label, free: s.available, needed: s.needed })).join(", "),
            })}
          </p>
        )}
        <div className="hidden items-center gap-2 print:flex">
          <img src="/brand/logo.webp" alt="" className="size-10" />
          <p className="text-sm font-semibold">{settings.businessName}</p>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("Shipment")}</p>
            <p className="font-mono text-2xl font-semibold tracking-tight">
              {order.shipmentNumber}
            </p>
            <p className="text-xs text-muted-foreground">
              {order.displayOrderNumber} · {formatDay(order.orderDate)} ·{" "}
              {order.repName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {order.status === "on_hold" && (
              <Badge variant="secondary">{t("Waiting for stock")}</Badge>
            )}
            {order.channel && (
              <Badge variant="outline">
                {t(SALES_CHANNEL_LABELS[order.channel])}
              </Badge>
            )}
            <PiecesBadge units={units} />
          </div>
        </div>
        <div className="grid gap-1 text-sm">
          <p className="font-medium">{order.customer}</p>
          <p className="font-semibold tabular-nums">
            {t("Total")}: {formatMoney(order.totalWithShipping)}
          </p>
          {[order.customerPhone, order.customerPhone2]
            .filter(Boolean)
            .map((phone) => (
              <p
                key={phone}
                className="flex items-center gap-1.5 text-muted-foreground"
              >
                <Phone className="size-3.5" />
                <span dir="ltr">{phone}</span>
              </p>
            ))}
          {order.address && (
            <p
              dir="auto"
              className="flex items-start gap-1.5 whitespace-pre-wrap text-muted-foreground"
            >
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              {order.address}
            </p>
          )}
          {(
            [
              [t("Notes"), order.notes],
              [t("Shipment notes"), order.shipmentNotes],
            ] as const
          )
            .filter(([, text]) => text)
            .map(([label, text]) => (
              <div
                key={label}
                className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-amber-800 dark:text-amber-300"
              >
                <StickyNote className="mt-0.5 size-3.5 shrink-0" />
                <p className="min-w-0">
                  <span className="font-semibold">{label}: </span>
                  <span dir="auto" className="whitespace-pre-wrap">
                    {text}
                  </span>
                </p>
              </div>
            ))}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="grid gap-2">
          {order.items.map((item) => {
            const on = ticked.includes(item.lineItemId);
            const label = item.variantName
              ? `${item.productName} – ${item.variantName}`
              : item.productName;
            return (
              <li
                key={item.lineItemId}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-2",
                  on && "border-emerald-500/50 bg-emerald-500/5",
                )}
              >
                <Photo url={item.imageUrl} label={label} size="xl" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.productName}</p>
                  {item.variantName && (
                    <p
                      className={cn(
                        "text-sm font-semibold [print-color-adjust:exact]",
                        item.gender ? GENDER_TEXT[item.gender] : "text-primary",
                      )}
                    >
                      {item.variantName}
                    </p>
                  )}
                  <GenderBadge gender={item.gender} className="mt-1" />
                  <p className="font-mono text-xs text-muted-foreground">
                    {item.sku}
                  </p>
                </div>
                <PackQuantity quantity={item.quantity} />
                {onTick && (
                  <Checkbox
                    className="size-6 print:hidden"
                    checked={on}
                    onCheckedChange={(v) => onTick(item.lineItemId, v === true)}
                    aria-label={t("Packed {{item}}", { item: label })}
                  />
                )}
                <span
                  className="hidden size-6 rounded border-2 print:block"
                  aria-hidden
                />
              </li>
            );
          })}
        </ul>
        {onTick && (
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <span className="text-sm text-muted-foreground">
              {t("{{done}} of {{total}} items packed", {
                done,
                total: order.items.length,
              })}
            </span>
            {onShip && (
              <Button
                onClick={onShip}
                variant={complete ? "default" : "outline"}
              >
                <Truck />
                {t("Mark shipped")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ShipDialog({
  order,
  allTicked,
  onClose,
  onShipped,
}: {
  order: QueueOrder;
  allTicked: boolean;
  onClose: () => void;
  onShipped: () => void;
}) {
  const { t } = useTranslation();
  const updateStatus = useMutation(api.orders.updateStatus);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("Ship {{shipment}}?", { shipment: order.shipmentNumber })}
      description={
        allTicked
          ? t(
              "All items are ticked. Stock is deducted and the order is marked shipped.",
            )
          : t("Not every item is ticked as packed. Ship it anyway?")
      }
      confirmLabel={t("Mark shipped")}
      destructive={!allTicked}
      onConfirm={async () => {
        await updateStatus({ orderId: order._id, status: "shipped" });
        onShipped();
      }}
      successMessage={t("Shipped {{shipment}}", {
        shipment: order.shipmentNumber,
      })}
    />
  );
}

/** Everything to pull from the shelves for the orders waiting, item by item. */
function PickList({ orders }: { orders: QueueOrder[] }) {
  const { t } = useTranslation();
  const rows = useMemo(() => {
    const map = new Map<
      string,
      QueueOrder["items"][number] & { total: number; orders: number }
    >();
    for (const o of orders) {
      for (const item of o.items) {
        // Boys and girls of the same size are picked as separate rows
        const key = `${item.productId}:${item.variantId ?? ""}:${item.gender ?? ""}`;
        const row = map.get(key);
        if (row) {
          row.total += item.quantity;
          row.orders += 1;
        } else {
          map.set(key, { ...item, total: item.quantity, orders: 1 });
        }
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        a.productName.localeCompare(b.productName) ||
        (a.variantName ?? "").localeCompare(b.variantName ?? "") ||
        (a.gender ?? "").localeCompare(b.gender ?? ""),
    );
  }, [orders]);

  if (!rows.length) {
    return (
      <EmptyState
        icon={<PackageCheck />}
        title={t("Nothing to pick")}
        description={t("The pick list fills in as new orders come in.")}
      />
    );
  }
  const units = rows.reduce((s, r) => s + r.total, 0);
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {t("{{units}} pieces across {{orders}} orders", {
          units,
          orders: orders.length,
        })}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const label = r.variantName
            ? `${r.productName} – ${r.variantName}`
            : r.productName;
          return (
            <li
              key={`${r.productId}:${r.variantId ?? ""}:${r.gender ?? ""}`}
              className="flex items-center gap-3 rounded-lg border p-2"
            >
              <Photo url={r.imageUrl} label={label} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.productName}</p>
                {r.variantName && (
                  <p
                    className={cn(
                      "truncate text-sm font-semibold [print-color-adjust:exact]",
                      r.gender ? GENDER_TEXT[r.gender] : "text-primary",
                    )}
                  >
                    {r.variantName}
                  </p>
                )}
                <GenderBadge gender={r.gender} className="mt-1" />
                <p className="font-mono text-xs text-muted-foreground">
                  {r.sku}
                </p>
              </div>
              <div className="text-end">
                <PackQuantity quantity={r.total} />
                <p className="text-xs text-muted-foreground">
                  {t("in {{n}} orders", { n: r.orders })}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The quantity to pack on one line, in its count's colour. */
function PackQuantity({ quantity }: { quantity: number }) {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex min-w-14 flex-col items-center rounded-xl px-3 py-1"
      style={pieceStyle(quantity)}
      aria-label={t("{{n}} pieces", { n: quantity })}
    >
      <span className="text-3xl leading-none font-black tabular-nums">×{quantity}</span>
      {quantity > 1 && <span className="text-[10px] font-semibold uppercase">{t("{{n}} pieces", { n: quantity })}</span>}
    </span>
  );
}

/** The order's total pieces, in its count's colour. */
function PiecesBadge({ units }: { units: number }) {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex items-center rounded-lg px-2.5 py-1 text-base font-black tabular-nums"
      style={pieceStyle(units)}
    >
      {units === 1 ? t("1 piece") : t("{{n}} pieces", { n: units })}
    </span>
  );
}

/** The big red "Delayed" strip on a packing card: the day the customer wants it shipped. */
function DelayedBanner({ shipOn }: { shipOn: string }) {
  const { t } = useTranslation();
  const { formatDay, today } = useFormat();
  const days = daysUntil(shipOn, today());
  const when =
    days > 1
      ? t("in {{n}} days", { n: days })
      : days === 1
        ? t("tomorrow")
        : days === 0
          ? t("today")
          : t("{{n}} days ago", { n: -days });
  return (
    <div className="-mx-1 flex items-center gap-3 rounded-lg bg-red-600 px-3 py-2.5 text-white dark:bg-red-500 print:border-2 print:border-black print:bg-white print:text-black">
      <CalendarClock className="size-7 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-lg leading-tight font-bold tracking-wide uppercase">{t("Delayed")}</p>
        <p className="text-sm font-medium">
          {t("Customer wants it shipped on {{day}}", { day: formatDay(shipOn) })} · {when}
        </p>
      </div>
    </div>
  );
}
