import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PackageCheck, PackageX, Search, Truck, Undo2 } from "lucide-react";
import { MoneyInput, QuantityInput } from "@/components/number-input.tsx";
import { Photo } from "@/components/photo.tsx";
import { StatusBadge } from "@/components/status-badge.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { parseNumber } from "@/lib/forms.ts";
import { cn } from "@/lib/utils.ts";
import { matchesSearch } from "@shared/search.ts";

type Found = Output<typeof api.orders.findForReturn>[number];
type Returnable = Exclude<Found, { error: string }>;
type Choice = "skip" | "transit" | "received";
type LinePlan = { quantity: string; damaged: boolean };
type TransitPlan = { arrived: boolean; damaged: boolean };
type Plan = {
  choice: Choice;
  lines: Record<string, LinePlan>;
  /** Pieces already in transit: did they arrive (received now)? */
  transit: Record<string, TransitPlan>;
  refund: string;
};

const usable = (f: Found): f is Returnable => !("error" in f);

/**
 * Batch returns: find shipped orders by shipment or order number ("|"
 * separated), mark each as received or in transit (whole or some items), and
 * later settle the ones in transit as received or lost.
 */
export default function ReturnsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const inTransit = useQuery(
    api.orders.returnsInTransit,
    open ? undefined : "skip",
  );
  const [tab, setTab] = useState("record");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("Returns")}</DialogTitle>
          <DialogDescription>
            {t(
              "The sale is reversed as soon as a return is recorded. Received items go back to stock (damaged ones are written off); items in transit wait until they arrive.",
            )}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="record">
              <Undo2 />
              {t("Record returns")}
            </TabsTrigger>
            <TabsTrigger value="transit">
              <Truck />
              {t("In transit")}
              {inTransit && inTransit.length > 0 && (
                <Badge variant="secondary" className="ms-1">
                  {inTransit.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="record" className="mt-4">
            <RecordReturns
              onRecorded={(transit) => transit && setTab("transit")}
            />
          </TabsContent>
          <TabsContent value="transit" className="mt-4">
            <InTransitList orders={inTransit} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function RecordReturns({
  onRecorded,
}: {
  onRecorded: (anyTransit: boolean) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const found = useQuery(
    api.orders.findForReturn,
    query ? { numbers: query } : "skip",
  );
  const batchReturn = useMutation(api.orders.batchReturn);
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [pending, setPending] = useState(false);

  const search = () => {
    const q = text.trim();
    if (!q) return;
    setPlans({});
    setQuery(q);
  };

  // Orders the courier already announced (in transit) start as received:
  // the warehouse keeper only types what arrived, and those pieces close the transit
  const planFor = (f: Returnable): Plan =>
    plans[f.orderId] ?? {
      choice: f.transit.length ? "received" : "skip",
      refund: "",
      lines: Object.fromEntries(
        f.lines.map((l) => [
          l.lineItemId,
          { quantity: f.transit.length ? "0" : String(l.returnable), damaged: false },
        ]),
      ),
      transit: Object.fromEntries(
        f.transit.map((l) => [l.lineItemId, { arrived: true, damaged: false }]),
      ),
    };
  const setPlan = (f: Returnable, patch: Partial<Plan>) =>
    setPlans((prev) => ({ ...prev, [f.orderId]: { ...planFor(f), ...patch } }));
  const setTransit = (f: Returnable, lineId: string, patch: Partial<TransitPlan>) => {
    const plan = planFor(f);
    setPlan(f, {
      transit: { ...plan.transit, [lineId]: { ...plan.transit[lineId], ...patch } },
    });
  };
  const setLine = (f: Returnable, lineId: string, patch: Partial<LinePlan>) => {
    const plan = planFor(f);
    setPlan(f, {
      lines: { ...plan.lines, [lineId]: { ...plan.lines[lineId], ...patch } },
    });
  };

  const rows = found?.filter(usable) ?? [];
  const problems = found?.filter((f) => !usable(f)) ?? [];
  const setAll = (choice: Choice) =>
    setPlans(
      Object.fromEntries(
        rows.map((f) => [f.orderId, { ...planFor(f), choice }]),
      ),
    );

  /** What the server gets for one order, or an error message to show. */
  const toRequest = (f: Returnable) => {
    const plan = planFor(f);
    const lines = f.lines
      .map((l) => {
        const lp = plan.lines[l.lineItemId];
        return {
          lineItemId: l.lineItemId,
          quantity: parseNumber(lp.quantity) ?? 0,
          sellable: !(plan.choice === "received" && lp.damaged),
          max: l.returnable,
        };
      })
      .filter((l) => l.quantity > 0);
    if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity > l.max))
      return { error: t("Check the quantities") };
    const arrived =
      plan.choice === "received"
        ? f.transit
            .filter((l) => plan.transit[l.lineItemId]?.arrived)
            .map((l) => ({
              lineItemId: l.lineItemId,
              damaged: plan.transit[l.lineItemId].damaged,
            }))
        : [];
    if (!lines.length && !arrived.length)
      return { error: t("Pick at least one item") };
    const partial =
      lines.length > 0 &&
      (lines.length < f.lines.length || lines.some((l) => l.quantity < l.max));
    const refund = parseNumber(plan.refund);
    if (partial && f.hasManualTotal && refund === undefined)
      return {
        error: t("Custom total: enter the refund for a partial return"),
      };
    return {
      value: {
        orderId: f.orderId,
        inTransit: plan.choice === "transit",
        lines: lines.map(({ lineItemId, quantity, sellable }) => ({
          lineItemId,
          quantity,
          sellable,
        })),
        manualRefundAmount:
          partial && refund !== undefined ? refund : undefined,
        transitReceived: arrived.length ? arrived : undefined,
      },
    };
  };

  const chosen = rows.filter((f) => planFor(f).choice !== "skip");
  const checked = chosen.map((f) => ({ f, r: toRequest(f) }));
  const invalid = checked.filter((c) => "error" in c.r);
  const counts = {
    received: chosen.filter((f) => planFor(f).choice === "received").length,
    transit: chosen.filter((f) => planFor(f).choice === "transit").length,
  };

  const confirm = async () => {
    if (!chosen.length || invalid.length) return;
    setPending(true);
    try {
      const returns = checked
        .map((c) => ("value" in c.r ? c.r.value! : null))
        .filter((r): r is NonNullable<typeof r> => r !== null);
      const res = await batchReturn({ returns });
      toast.success(
        t("Returns recorded: {{received}} received, {{transit}} in transit", {
          received: res.received,
          transit: res.inTransit,
        }),
      );
      setPlans({});
      setText("");
      setQuery(null);
      onRecorded(res.inTransit > 0);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="return-numbers">{t("Shipment or order numbers")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Textarea
            id="return-numbers"
            dir="ltr"
            rows={2}
            className="font-mono"
            placeholder="44011|44012|44049"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                search();
              }
            }}
          />
          <Button onClick={search} disabled={!text.trim()}>
            <Search />
            {t("Find")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("Separate numbers with | (new lines and commas work too).")}
        </p>
      </div>

      {query && found === undefined && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {problems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {problems.map((p) => (
            <Badge
              key={p.token}
              variant="outline"
              className="font-normal text-muted-foreground"
            >
              <span className="font-mono">{p.token}</span>:{" "}
              {"error" in p && p.error === "Not found"
                ? t("not found")
                : "error" in p && p.error === "Not shipped"
                  ? t("not shipped")
                  : t("nothing left to return")}
            </Badge>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t("Set all to")}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAll("received")}
            >
              <PackageCheck />
              {t("Received")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAll("transit")}
            >
              <Truck />
              {t("In transit")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAll("skip")}>
              {t("Skip")}
            </Button>
          </div>
          <ul className="grid gap-3">
            {rows.map((f) => (
              <ReturnRow
                key={f.orderId}
                order={f}
                plan={planFor(f)}
                error={(() => {
                  const c = checked.find((x) => x.f.orderId === f.orderId);
                  return c && "error" in c.r ? c.r.error : undefined;
                })()}
                onChoice={(choice) => setPlan(f, { choice })}
                onLine={(id, patch) => setLine(f, id, patch)}
                onTransit={(id, patch) => setTransit(f, id, patch)}
                onRefund={(refund) => setPlan(f, { refund })}
              />
            ))}
          </ul>
          <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-2 border-t bg-background px-6 py-3">
            <p className="text-sm text-muted-foreground">
              {t("{{received}} received · {{transit}} in transit", counts)}
            </p>
            <Button
              onClick={() => void confirm()}
              disabled={pending || !chosen.length || invalid.length > 0}
            >
              {pending && <Spinner />}
              {t("Confirm returns")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ReturnRow({
  order,
  plan,
  error,
  onChoice,
  onLine,
  onTransit,
  onRefund,
}: {
  order: Returnable;
  plan: Plan;
  error?: string;
  onChoice: (choice: Choice) => void;
  onLine: (lineItemId: string, patch: Partial<LinePlan>) => void;
  onTransit: (lineItemId: string, patch: Partial<TransitPlan>) => void;
  onRefund: (refund: string) => void;
}) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const active = plan.choice !== "skip";
  const picked = order.lines.some((l) => (parseNumber(plan.lines[l.lineItemId]?.quantity) ?? 0) > 0);
  const partial =
    picked &&
    order.lines.some(
      (l) =>
        (parseNumber(plan.lines[l.lineItemId]?.quantity) ?? 0) < l.returnable,
    );
  return (
    <li className={cn("rounded-md border p-3", !active && "bg-muted/30")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-base font-semibold">
            {order.shipmentNumber}
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {order.displayOrderNumber} · {order.customer} ·{" "}
            {formatMoney(order.total)}
            <StatusBadge status={order.status} />
            {order.inTransitUnits > 0 && (
              <Badge variant="outline" className="h-5 text-[11px]">
                {t("{{n}} already in transit", { n: order.inTransitUnits })}
              </Badge>
            )}
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={plan.choice}
          onValueChange={(v) => v && onChoice(v as Choice)}
          aria-label={t("Return of {{order}}", {
            order: order.displayOrderNumber,
          })}
        >
          <ToggleGroupItem value="skip" className="px-3">
            {t("Skip")}
          </ToggleGroupItem>
          <ToggleGroupItem value="transit" className="px-3">
            {t("In transit")}
          </ToggleGroupItem>
          <ToggleGroupItem value="received" className="px-3">
            {t("Received")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {active && (
        <div className="mt-3 grid gap-2">
          {plan.choice === "received" && order.transit.length > 0 && (
            <div className="grid gap-2 rounded-md border border-dashed bg-muted/30 p-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("Already recorded as in transit: tick what arrived")}
              </p>
              {order.transit.map((l) => {
                const tp = plan.transit[l.lineItemId];
                return (
                  <div key={l.lineItemId} className="flex flex-wrap items-center gap-2 text-sm">
                    <Checkbox
                      checked={tp?.arrived}
                      onCheckedChange={(c) => onTransit(l.lineItemId, { arrived: c === true })}
                      aria-label={t("{{item}} arrived", { item: l.productName })}
                    />
                    <Photo url={l.imageUrl} label={l.productName} size="sm" />
                    <span className="min-w-0 flex-1 truncate">
                      {l.productName}
                      {l.variantName && <span className="text-muted-foreground"> – {l.variantName}</span>}
                    </span>
                    <span className="text-xs font-medium tabular-nums">×{l.quantity}</span>
                    {tp?.arrived && (
                      <label className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={tp.damaged}
                          onCheckedChange={(c) => onTransit(l.lineItemId, { damaged: c === true })}
                        />
                        {t("Damaged")}
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {order.transit.length > 0 && order.lines.length > 0 && (
            <p className="text-xs text-muted-foreground">{t("Anything else that came back:")}</p>
          )}
          {order.lines.map((l) => {
            const lp = plan.lines[l.lineItemId];
            return (
              <div
                key={l.lineItemId}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <Photo url={l.imageUrl} label={l.productName} size="sm" />
                <span className="min-w-0 flex-1 truncate">
                  {l.productName}
                  {l.variantName && (
                    <span className="text-muted-foreground">
                      {" "}
                      – {l.variantName}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("of {{n}}", { n: l.returnable })}
                </span>
                <QuantityInput
                  className="h-8 w-16"
                  aria-label={t("Quantity returned of {{item}}", {
                    item: l.productName,
                  })}
                  value={lp.quantity}
                  onChange={(v) => onLine(l.lineItemId, { quantity: v })}
                />
                {plan.choice === "received" && (
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={lp.damaged}
                      onCheckedChange={(c) =>
                        onLine(l.lineItemId, { damaged: c === true })
                      }
                    />
                    {t("Damaged")}
                  </label>
                )}
              </div>
            );
          })}
          {partial && order.hasManualTotal && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Label htmlFor={`refund-${order.orderId}`} className="text-xs">
                {t("Refund for these items (custom total)")}
              </Label>
              <MoneyInput
                id={`refund-${order.orderId}`}
                className="h-8 w-32"
                value={plan.refund}
                onChange={onRefund}
              />
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </li>
  );
}

type TransitOrder = Output<typeof api.orders.returnsInTransit>[number];

function InTransitList({ orders }: { orders: TransitOrder[] | undefined }) {
  const { t } = useTranslation();
  const { formatDateTime } = useFormat();
  const resolve = useMutation(api.orders.resolveInTransit);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [damaged, setDamaged] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  const shown = useMemo(
    () =>
      (orders ?? []).filter((o) =>
        matchesSearch(
          `${o.shipmentNumber} ${o.displayOrderNumber} ${o.customer}`,
          q,
        ),
      ),
    [orders, q],
  );
  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };
  const picked = shown.filter((o) => selected.has(o.orderId));

  const settle = async (outcome: "received" | "lost") => {
    if (!picked.length) return;
    setPending(true);
    try {
      const res = await resolve({
        orders: picked.map((o) => ({
          orderId: o.orderId,
          outcome,
          damagedLineItemIds:
            outcome === "received"
              ? o.lines
                  .filter((l) => damaged.has(l.lineItemId))
                  .map((l) => l.lineItemId)
              : undefined,
        })),
      });
      toast.success(
        outcome === "received"
          ? t("{{n}} returned pieces received", { n: res.units })
          : t("{{n}} pieces written off as lost", { n: res.units }),
      );
      setSelected(new Set());
      setDamaged(new Set());
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  if (orders === undefined)
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  if (!orders.length)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t("No returns in transit.")}
      </p>
    );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            dir="ltr"
            className="ps-8"
            placeholder="44011|44012"
            aria-label={t("Find by shipment or order number")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setSelected(
              picked.length === shown.length
                ? new Set()
                : new Set(shown.map((o) => o.orderId)),
            )
          }
        >
          {picked.length === shown.length
            ? t("Clear selection")
            : t("Select all shown")}
        </Button>
      </div>
      <ul className="grid gap-2">
        {shown.map((o) => {
          const on = selected.has(o.orderId);
          return (
            <li
              key={o.orderId}
              className={cn(
                "rounded-md border p-3",
                on && "border-primary/50 bg-primary/5",
              )}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  className="mt-1"
                  checked={on}
                  onCheckedChange={(c) =>
                    setSelected((s) => toggle(s, o.orderId, c === true))
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="font-mono font-semibold">
                    {o.shipmentNumber}
                  </span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {o.displayOrderNumber} · {o.customer}
                    {o.since &&
                      ` · ${t("since {{when}}", { when: formatDateTime(o.since) })}`}
                  </span>
                </span>
              </label>
              <div className="mt-2 grid gap-1 ps-7">
                {o.lines.map((l) => (
                  <div
                    key={l.lineItemId}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {l.quantity} × {l.productName}
                      {l.variantName && (
                        <span className="text-muted-foreground">
                          {" "}
                          – {l.variantName}
                        </span>
                      )}
                    </span>
                    {on && (
                      <label className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={damaged.has(l.lineItemId)}
                          onCheckedChange={(c) =>
                            setDamaged((s) =>
                              toggle(s, l.lineItemId, c === true),
                            )
                          }
                        />
                        {t("Arrived damaged")}
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center justify-end gap-2 border-t bg-background px-6 py-3">
        <span className="me-auto text-sm text-muted-foreground">
          {t("{{n}} selected", { n: picked.length })}
        </span>
        <Button
          variant="outline"
          disabled={pending || !picked.length}
          onClick={() => void settle("lost")}
        >
          <PackageX />
          {t("Write off as lost")}
        </Button>
        <Button
          disabled={pending || !picked.length}
          onClick={() => void settle("received")}
        >
          {pending && <Spinner />}
          <PackageCheck />
          {t("Mark received")}
        </Button>
      </div>
    </div>
  );
}
