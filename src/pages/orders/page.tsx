import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CheckCircle2,
  PackageCheck,
  Truck,
  CalendarClock,
  PackageOpen,
  Globe,
  MessageCircleOff,
  Plus,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";
import MarkPaidDialog from "@/components/mark-paid-dialog.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { Pager, useUrlState } from "@/components/data-table.tsx";
import { EmptyState, TableSkeleton } from "@/components/states.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, FieldError } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { useFieldVisibility } from "@/hooks/use-field-visibility.ts";
import { api, useMutation, useQuery } from "@/lib/api.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import type { PaymentMethod } from "@shared/constants.ts";
import { ExportOrdersButton } from "./_components/export-orders-button.tsx";
import { CourierSheetDialog } from "./_components/courier-sheet-dialog.tsx";
import NewOrderDialog from "./_components/new-order-dialog.tsx";
import { OrderCards, OrdersTable } from "./_components/orders-list.tsx";
import {
  LIST_DEFAULTS,
  PAGE_SIZES,
  STATUS_TABS,
  isPayable,
  isReturning,
  parseListState,
  tabCount,
} from "./_lib/list-params.ts";

const MARK_PAID_BATCH = 200;

/** Search box that updates the URL after a short pause in typing. */
function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    // Changed from outside (cleared filters, back/forward)
    setPrevValue(value);
    setText(value);
  }
  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => onChange(text), 300);
    return () => clearTimeout(timer);
  }, [text, value, onChange]);

  return (
    <InputGroup className="sm:max-w-xs">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onChange(text);
          if (e.key === "Escape" && text) {
            e.preventDefault();
            setText("");
            onChange("");
          }
        }}
        title={t(
          "Tip: use | to search for several things at once, e.g. TEE-RED|TEE-BLK",
        )}
        placeholder={t("Order #, customer, phone, shipment…")}
        aria-label={t("Search orders")}
      />
      {text && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            onClick={() => {
              setText("");
              onChange("");
            }}
            aria-label={t("Clear search")}
          >
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

export default function OrdersPage() {
  const { t } = useTranslation();
  const [state, update] = useUrlState(LIST_DEFAULTS);
  const params = parseListState(state);
  const { isAdmin, canChangeStatus, canEdit, canShip } = useCurrentUser();
  const { isFieldVisible } = useFieldVisibility();
  const { formatNumber } = useFormat();
  const [newOpen, setNewOpen] = useState(false);
  const [courierOpen, setCourierOpen] = useState(false);
  // /orders?new=1 (the dashboard's "New order") opens the form
  const [searchParams, setSearchParams] = useSearchParams();
  const openNew = searchParams.get("new") === "1";
  useEffect(() => {
    if (!openNew) return;
    setNewOpen(true);
    setSearchParams(
      (prev) => {
        prev.delete("new");
        return prev;
      },
      { replace: true },
    );
  }, [openNew, setSearchParams]);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const markPaid = useMutation(api.payments.markPaid);
  const [markReturnedOpen, setMarkReturnedOpen] = useState(false);
  const resolveReturns = useMutation(api.orders.resolveInTransit);

  const data = useQuery(
    api.orders.list,
    { ...params.filters, page: params.page, pageSize: params.pageSize },
    { keepPrevious: true },
  );

  // Selection is per result set: it resets when filters, sort or page change
  const resultKey = JSON.stringify([
    params.filters,
    params.page,
    params.pageSize,
  ]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectionKey, setSelectionKey] = useState(resultKey);
  if (selectionKey !== resultKey) {
    setSelectionKey(resultKey);
    setSelected(new Set());
  }

  // Landed past the last page (orders deleted, filters narrowed): go to the last one
  const lastPage = data
    ? Math.max(1, Math.ceil(data.total / params.pageSize))
    : 1;
  useEffect(() => {
    if (data && params.page > lastPage) update({ page: String(lastPage) });
  }, [data, params.page, lastPage, update]);

  const orders = data?.items ?? [];
  // With the Returning filter on, the warehouse confirms returns; otherwise finance marks payments
  const returnMode = !!params.filters.returning && canShip;
  const canSelect = returnMode ? isReturning : isPayable;
  const payable = orders.filter(canSelect);
  const selectedIds = payable
    .filter((o) => selected.has(o._id))
    .map((o) => o._id);
  const canBulkPay = canEdit("finance") && isFieldVisible("orders", "payment");

  const selection = canBulkPay || returnMode
    ? {
        canSelect,
        selected,
        toggle: (id: string, on: boolean) =>
          setSelected((prev) => {
            const next = new Set(prev);
            if (on) next.add(id);
            else next.delete(id);
            return next;
          }),
        toggleAll: (on: boolean) =>
          setSelected(on ? new Set(payable.map((o) => o._id)) : new Set()),
      }
    : undefined;

  const confirmMarkPaid = async (paidAt: string, method?: PaymentMethod, accountId?: string) => {
    let updated = 0;
    for (let i = 0; i < selectedIds.length; i += MARK_PAID_BATCH) {
      const res = await markPaid({
        orderIds: selectedIds.slice(i, i + MARK_PAID_BATCH),
        paidAt,
        method,
        accountId,
      });
      updated += res.updated;
    }
    const skipped = selectedIds.length - updated;
    toast.success(
      skipped > 0
        ? t(
            "{{count}} orders marked as paid ({{skipped}} skipped: already paid or cancelled)",
            { count: updated, skipped },
          )
        : t("{{count}} orders marked as paid", { count: updated }),
    );
    setSelected(new Set());
  };

  const confirmMarkReturned = async () => {
    const res = await resolveReturns({
      orders: selectedIds.map((orderId) => ({ orderId, outcome: "received" })),
    });
    toast.success(
      t("{{orders}} orders marked as returned: {{n}} pieces back in stock", {
        orders: selectedIds.length,
        n: res.units,
      }),
    );
    setSelected(new Set());
  };

  const clearFilters = () =>
    update({ payment: "all", wa: "", ret: "", web: "", sched: "", pend: "", q: "", from: "", to: "", by: "" });
  const counts = data?.statusCounts;
  const noOrdersAtAll = counts && Object.values(counts).every((n) => n === 0);

  return (
    <PageBody>
      <PageHeader
        title={t("Orders")}
        description={t("Capture orders, ship them and track payment.")}
        actions={
          <>
            {(isAdmin || canChangeStatus) && (
              <ExportOrdersButton filters={params.filters} />
            )}
            {canChangeStatus && (
              <Button variant="outline" onClick={() => setCourierOpen(true)}>
                <Truck />
                {t("Website orders → courier")}
              </Button>
            )}
            {canChangeStatus && (
              <Button onClick={() => setNewOpen(true)}>
                <Plus />
                {t("New order")}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4">
        <Tabs value={params.tab} onValueChange={(status) => update({ status })}>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList>
              {STATUS_TABS.map((tab) => {
                const n = tabCount(tab, counts);
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="flex-none"
                  >
                    {t(tab.label)}
                    {n !== undefined && (
                      <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
                        {formatNumber(n)}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
        </Tabs>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <SearchBox value={state.q} onChange={(q) => update({ q })} />
          {isFieldVisible("orders", "payment") && (
            <Select
              value={params.filters.payment ?? "all"}
              onValueChange={(payment) => update({ payment })}
            >
              <SelectTrigger className="sm:w-36" aria-label={t("Payment")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("Any payment")}</SelectItem>
                <SelectItem value="unpaid">{t("Unpaid")}</SelectItem>
                <SelectItem value="due">{t("Shipped, unpaid")}</SelectItem>
                <SelectItem value="paid">{t("Paid")}</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            variant={
              params.filters.notPostedToWhatsApp ? "secondary" : "outline"
            }
            aria-pressed={!!params.filters.notPostedToWhatsApp}
            onClick={() =>
              update({ wa: params.filters.notPostedToWhatsApp ? "" : "1" })
            }
          >
            <MessageCircleOff />
            {t("Not posted to WhatsApp")}
          </Button>
          <Button
            variant={params.filters.returning ? "secondary" : "outline"}
            aria-pressed={!!params.filters.returning}
            onClick={() => update({ ret: params.filters.returning ? "" : "1" })}
          >
            <Truck />
            {t("Returning")}
          </Button>
          <Button
            variant={params.filters.needsConfirmation ? "secondary" : "outline"}
            aria-pressed={!!params.filters.needsConfirmation}
            onClick={() => update({ web: params.filters.needsConfirmation ? "" : "1" })}
          >
            <Globe />
            {t("Needs confirmation")}
          </Button>
          <Button
            variant={params.filters.delayed ? "secondary" : "outline"}
            aria-pressed={!!params.filters.delayed}
            onClick={() => update({ sched: params.filters.delayed ? "" : "1" })}
          >
            <CalendarClock />
            {t("Delayed")}
          </Button>
          <Button
            variant={params.filters.returnPending ? "secondary" : "outline"}
            aria-pressed={!!params.filters.returnPending}
            onClick={() => update({ pend: params.filters.returnPending ? "" : "1" })}
          >
            <PackageOpen />
            {t("Waiting for returned pieces")}
          </Button>
          <Field data-invalid={!!params.dateError} className="w-auto gap-1">
            <div className="flex items-center gap-2">
              <Select value={state.by === "shipped" ? "shipped" : "order"} onValueChange={(v) => update({ by: v === "shipped" ? "shipped" : "" })}>
                <SelectTrigger className="w-auto" aria-label={t("Dates are")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="order">{t("Ordered")}</SelectItem>
                  <SelectItem value="shipped">{t("Shipped")}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="orders-from"
                type="date"
                value={state.from}
                onChange={(e) => update({ from: e.target.value })}
                className="sm:w-40"
                aria-label={t("Ordered from")}
                aria-invalid={!!params.dateError}
              />
              <span className="text-sm text-muted-foreground">{t("to")}</span>
              <Input
                id="orders-to"
                type="date"
                value={state.to}
                onChange={(e) => update({ to: e.target.value })}
                className="sm:w-40"
                aria-label={t("Ordered until")}
                aria-invalid={!!params.dateError}
              />
            </div>
            {params.dateError && <FieldError>{t(params.dateError)}</FieldError>}
          </Field>
          {params.hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>
              <X />
              {t("Clear filters")}
            </Button>
          )}
        </div>

        {selection && selectedIds.length > 0 && (
          <div
            role="region"
            aria-label={t("Bulk actions")}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm"
          >
            <span>
              {t("{{count}} selected", { count: selectedIds.length })}
              <Button
                variant="link"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                {t("Clear")}
              </Button>
            </span>
            {returnMode ? (
              <Button size="sm" onClick={() => setMarkReturnedOpen(true)}>
                <PackageCheck />
                {t("Mark as returned ({{n}})", { n: selectedIds.length })}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setMarkPaidOpen(true)}>
                <CheckCircle2 />
                {t("Mark as paid ({{count}})", { count: selectedIds.length })}
              </Button>
            )}
          </div>
        )}

        <Card className="gap-0 py-0">
          {data === undefined ? (
            <div className="p-4">
              <TableSkeleton rows={8} />
            </div>
          ) : orders.length === 0 ? (
            noOrdersAtAll ? (
              <EmptyState
                icon={<ShoppingCart />}
                title={t("No orders yet")}
                description={t(
                  "Create your first order to start tracking shipments and payments.",
                )}
                action={
                  <Button onClick={() => setNewOpen(true)}>
                    <Plus />
                    {t("New order")}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<Search />}
                title={t("No orders match")}
                description={t("Try another status, search or date range.")}
                action={
                  params.hasFilters || params.tab !== "all" ? (
                    <Button
                      variant="outline"
                      onClick={() =>
                        update({
                          ...LIST_DEFAULTS,
                          sort: state.sort,
                          dir: state.dir,
                          size: state.size,
                        })
                      }
                    >
                      {t("Clear filters")}
                    </Button>
                  ) : undefined
                }
              />
            )
          ) : (
            <>
              <div className="hidden md:block">
                <OrdersTable
                  orders={orders}
                  sort={params.sort}
                  dir={params.dir}
                  onSort={(sort, dir) => update({ sort, dir })}
                  selection={selection}
                />
              </div>
              <div className="px-4 md:hidden">
                <OrderCards orders={orders} selection={selection} />
              </div>
            </>
          )}
        </Card>

        {data && data.total > 0 && (
          <Pager
            page={Math.min(params.page, lastPage)}
            pageSize={params.pageSize}
            total={data.total}
            pageSizes={PAGE_SIZES}
            onPage={(page) => update({ page: String(page) })}
            onPageSize={(size) => update({ size: String(size) })}
          />
        )}
      </div>

      <NewOrderDialog open={newOpen} onOpenChange={setNewOpen} />
      <ConfirmDialog
        open={markReturnedOpen}
        onOpenChange={setMarkReturnedOpen}
        title={t("Mark {{n}} orders as returned?", { n: selectedIds.length })}
        description={t(
          "All pieces on their way back are put back in stock. For pieces that arrived damaged or got lost, use Stock → Returns instead.",
        )}
        confirmLabel={t("Mark as returned ({{n}})", { n: selectedIds.length })}
        onConfirm={confirmMarkReturned}
      />
      <MarkPaidDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        description={t("Record payment for {{count}} selected orders.", {
          count: selectedIds.length,
        })}
        confirmLabel={t("Mark {{count}} as paid", {
          count: selectedIds.length,
        })}
        onConfirm={confirmMarkPaid}
      />
      {canChangeStatus && <CourierSheetDialog open={courierOpen} onOpenChange={setCourierOpen} />}
    </PageBody>
  );
}
