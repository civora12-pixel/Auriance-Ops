import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Package,
  PackagePlus,
  Plus,
  RotateCcw,
  Wallet,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { EmptyState, PageSkeleton } from "@/components/states.tsx";
import { StatusBadge } from "@/components/status-badge.tsx";
import { api, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@shared/constants.ts";
import type { OrderStatus } from "@shared/constants.ts";
import SalesChart from "./_components/sales-chart.tsx";
import { DayPerformance } from "./_components/day-performance.tsx";
import { PerformanceCards } from "./_components/performance-cards.tsx";
import { SalesCheckDialog } from "./_components/breakdown.tsx";

type Stats = Output<typeof api.dashboard.getStats>;

/** Same hues as the status badges; the label beside each bar carries the identity. */
const STATUS_BAR: Record<OrderStatus, string> = {
  new: "bg-muted-foreground",
  on_hold: "bg-chart-1",
  shipped: "bg-chart-3",
  partially_returned: "bg-chart-2",
  returned: "bg-chart-4",
  swapped: "bg-chart-5",
  cancelled: "bg-border",
};

/** % change, or undefined when there's no base to compare against. */
const change = (current: number, previous: number) =>
  previous > 0 ? ((current - previous) / previous) * 100 : undefined;

function Delta({
  pct,
  against,
}: {
  pct: number | undefined;
  against: "yesterday" | "lastMonth";
}) {
  const { t } = useTranslation();
  const { formatPercent } = useFormat();
  if (pct === undefined)
    return (
      <span className="text-muted-foreground">
        {against === "yesterday"
          ? t("No sales yesterday to compare")
          : t("No sales last month to date to compare")}
      </span>
    );
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "inline-flex items-center font-medium",
          up ? "text-chart-3" : "text-destructive",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{up ? t("Up") : t("Down")}</span>
        {formatPercent(Math.abs(pct))}
      </span>
      <span className="text-muted-foreground">
        {against === "yesterday"
          ? t("vs all of yesterday")
          : t("vs last month to date")}
      </span>
    </span>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon,
  to,
  onClick,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  icon: ReactNode;
  to?: string;
  /** Opens the working behind the figure instead of a page */
  onClick?: () => void;
}) {
  const body = (
    <Card
      className={cn(
        "h-full gap-2 py-4",
        (to || onClick) && "transition-colors hover:bg-muted/40",
      )}
    >
      <CardContent className="space-y-1.5 px-4">
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{label}</span>
          <span className="text-muted-foreground [&_svg]:size-4" aria-hidden>
            {icon}
          </span>
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        {hint && <p className="text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        className="block h-full rounded-xl text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {body}
      </button>
    );
  return to ? (
    <Link
      to={to}
      className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

function NeedsActionCard({ orders }: { orders: Stats["needsAction"] }) {
  const { t } = useTranslation();
  const { formatMoney, formatDay } = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Needs action")}</CardTitle>
        <CardDescription>{t("Oldest open orders first")}</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to="/orders?status=open">
              {t("All open")} <ArrowRight className="rtl:rotate-180" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("Nothing waiting. Every order has shipped or closed.")}
          </p>
        ) : (
          <ul className="divide-y">
            {orders.map((o) => (
              <li key={o._id}>
                <Link
                  to={`/orders/${o._id}`}
                  className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {o.displayOrderNumber} · {o.customer}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDay(o.orderDate)} ·{" "}
                      {t("{{count}} items", { count: o.itemCount })}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                  <span className="w-24 text-end text-sm font-medium tabular-nums">
                    {formatMoney(o.total)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function OrdersByStatusCard({
  stats,
  linkable,
}: {
  stats: Stats;
  linkable: boolean;
}) {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const max = Math.max(
    1,
    ...ORDER_STATUSES.map((s) => stats.ordersByStatus[s]),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Orders by status")}</CardTitle>
        <CardDescription>
          {t("{{count}} orders in total", { count: stats.totalOrders })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {ORDER_STATUSES.map((s) => {
            const n = stats.ordersByStatus[s];
            const row = (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span>{t(ORDER_STATUS_LABELS[s])}</span>
                  <span className="font-medium tabular-nums">
                    {formatNumber(n)}
                  </span>
                </div>
                <div
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                  aria-hidden
                >
                  <div
                    className={cn("h-full rounded-full", STATUS_BAR[s])}
                    style={{ width: `${(n / max) * 100}%` }}
                  />
                </div>
              </>
            );
            return (
              <li key={s}>
                {linkable ? (
                  <Link
                    to={`/orders?status=${s}`}
                    className="-mx-2 block rounded-md px-2 py-1 hover:bg-muted/50"
                  >
                    {row}
                  </Link>
                ) : (
                  <div className="py-1">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function LowStockCard({
  stats,
  linkProducts,
  linkInventory,
}: {
  stats: Stats;
  linkProducts: boolean;
  linkInventory: boolean;
}) {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Low stock")}</CardTitle>
        <CardDescription>
          {stats.lowStockCount === 0
            ? t("Nothing is below its reorder level")
            : t("{{number}} below the reorder level", {
                number: formatNumber(stats.lowStockCount),
              }) +
              (stats.lowStockCount > stats.lowStockItems.length
                ? ` · ${t("showing the {{number}} shortest", { number: formatNumber(stats.lowStockItems.length) })}`
                : "")}
        </CardDescription>
        {linkInventory && (
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link to="/inventory">
                {t("Inventory")} <ArrowRight className="rtl:rotate-180" />
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {stats.lowStockItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("No items need restocking.")}
          </p>
        ) : (
          <ul className="divide-y">
            {stats.lowStockItems.map((item) => {
              const content = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.productName}
                      {item.variantName && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {item.variantName}
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {item.sku}
                    </p>
                  </div>
                  <div className="text-end text-sm">
                    <p
                      className={cn(
                        "font-medium tabular-nums",
                        item.onHand <= 0 && "text-destructive",
                      )}
                    >
                      {t("{{number}} on hand", {
                        number: formatNumber(item.onHand),
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {t("Reorder at {{number}}", {
                        number: formatNumber(item.reorderThreshold),
                      })}
                    </p>
                  </div>
                </>
              );
              const key = `${item.productId}-${item.variantId ?? ""}`;
              return (
                <li key={key}>
                  {linkProducts ? (
                    <Link
                      to={`/products/${item.productId}`}
                      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 py-2.5">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const stats = useQuery(api.dashboard.getStats, undefined, {
    refetchInterval: 60_000,
  });
  const { canAccess, canEdit, isAdmin } = useCurrentUser();
  const { formatMoney, formatNumber, formatPercent, formatDay } = useFormat();
  const [salesCheck, setSalesCheck] = useState(false);

  if (stats === undefined) {
    return (
      <PageBody>
        <PageHeader title={t("Dashboard")} />
        <PageSkeleton cards={4} rows={5} />
      </PageBody>
    );
  }

  const orders = canAccess("orders");
  const products = canAccess("inventory");
  const inventory = canAccess("inventory");
  const finance = canAccess("finance");
  const { kpis } = stats;

  const quickActions = (
    <>
      {canEdit("inventory") && (
        <Button asChild variant="outline">
          <Link to="/inventory">
            <PackagePlus />
            {t("Receive stock")}
          </Link>
        </Button>
      )}
      {orders && (
        <Button asChild>
          <Link to="/orders?new=1">
            <Plus />
            {t("New order")}
          </Link>
        </Button>
      )}
    </>
  );

  if (stats.totalOrders === 0 && stats.totalOnHand === 0) {
    return (
      <PageBody>
        <PageHeader
          title={t("Dashboard")}
          description={formatDay(stats.today)}
        />
        <EmptyState
          icon={<Boxes />}
          title={t("Let's get your store set up")}
          description={t(
            "Add your products, receive opening stock, then record your first order. Sales and stock figures will appear here.",
          )}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {products && (
                <Button asChild>
                  <Link to="/products">
                    <Package />
                    {t("Add products")}
                  </Link>
                </Button>
              )}
              {inventory && (
                <Button asChild variant="outline">
                  <Link to="/inventory">
                    <PackagePlus />
                    {t("Receive stock")}
                  </Link>
                </Button>
              )}
              {isAdmin && (
                <Button asChild variant="outline">
                  <Link to="/team">{t("Invite your team")}</Link>
                </Button>
              )}
            </div>
          }
        />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        title={t("Dashboard")}
        description={formatDay(stats.today)}
        actions={quickActions}
      />

      {canAccess("finance") && <DayPerformance canEdit={canEdit("finance")} />}

      <section
        aria-label={t("Sales and stock")}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <Kpi
          label={t("Sales this month")}
          value={formatMoney(kpis.salesThisMonth)}
          icon={<Wallet />}
          hint={
            <Delta
              pct={change(kpis.salesThisMonth, kpis.salesLastMonthToDate)}
              against="lastMonth"
            />
          }
          onClick={finance ? () => setSalesCheck(true) : undefined}
        />
        <Kpi
          label={t("Receivables")}
          value={formatMoney(kpis.receivables.total)}
          icon={<Wallet />}
          hint={
            <span className="grid text-muted-foreground">
              <span>
                {t("{{count}} shipped, unpaid orders", {
                  count: kpis.receivables.count,
                })}
              </span>
              {kpis.receivablesInBooks != null &&
                Math.abs(kpis.receivablesInBooks - kpis.receivables.total) >= 1 && (
                  <span>
                    {t("In the books: {{amount}}", {
                      amount: formatMoney(kpis.receivablesInBooks),
                    })}
                  </span>
                )}
            </span>
          }
          to={orders ? "/orders?payment=due" : undefined}
        />
        <Kpi
          label={t("Units on hand")}
          value={formatNumber(stats.totalOnHand)}
          icon={<Warehouse />}
          to={inventory ? "/inventory" : undefined}
        />
        <Kpi
          label={t("Returned · swapped")}
          value={`${formatPercent(stats.returnRate)} · ${formatPercent(stats.swapRate)}`}
          icon={<RotateCcw />}
          hint={
            <span className="text-muted-foreground">
              {t("{{returned}} returned and {{swapped}} swapped of {{total}} shipped", {
                returned: formatNumber(stats.returnedCount),
                swapped: formatNumber(stats.swappedCount),
                total: formatNumber(stats.shippedCount),
              })}
            </span>
          }
          to={orders ? "/orders?status=returned" : undefined}
        />
      </section>

      {finance && <PerformanceCards />}
      {salesCheck && (
        <SalesCheckDialog
          fromDay={`${stats.today.slice(0, 7)}-01`}
          toDay={stats.today}
          title={t("Sales this month")}
          onClose={() => setSalesCheck(false)}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SalesChart
            daily={stats.daily}
            weekly={stats.weekly}
            monthly={stats.monthly}
          />
        </div>
        <OrdersByStatusCard stats={stats} linkable={orders} />
      </div>

      <div className={cn("grid gap-4", orders && "lg:grid-cols-2")}>
        {orders && <NeedsActionCard orders={stats.needsAction} />}
        <LowStockCard
          stats={stats}
          linkProducts={products}
          linkInventory={inventory}
        />
      </div>
    </PageBody>
  );
}
