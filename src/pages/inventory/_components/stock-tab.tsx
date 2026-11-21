import { matchesSearch } from "@shared/search.ts";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Boxes,
  Coins,
  PackageSearch,
  Search,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  LinkRow,
  SortableHead,
  useUrlState,
} from "@/components/data-table.tsx";
import type { SortDir } from "@/components/data-table.tsx";
import { EmptyState, TableSkeleton } from "@/components/states.tsx";
import { StockBadge } from "@/components/status-badge.tsx";
import { api, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { useFieldVisibility } from "@/hooks/use-field-visibility.ts";
import { tk } from "@/lib/i18n.ts";
import ExportStockButton from "./export-stock-button.tsx";

export type StockItem = Output<typeof api.inventory.list>[number];

const STATUS_FILTERS = [
  { value: "all", label: tk("All stock levels") },
  { value: "attention", label: tk("Needs restock") },
  { value: "out", label: tk("Out of stock") },
  { value: "low", label: tk("Low stock") },
  { value: "ok", label: tk("In stock") },
] as const;

const SORTERS: Record<string, (a: StockItem, b: StockItem) => number> = {
  product: (a, b) =>
    a.productName.localeCompare(b.productName) ||
    (a.variantName ?? "").localeCompare(b.variantName ?? ""),
  sku: (a, b) => a.sku.localeCompare(b.sku),
  onHand: (a, b) => a.onHand - b.onHand,
  avgCost: (a, b) => a.avgCost - b.avgCost,
  assetValue: (a, b) => a.assetValue - b.assetValue,
  reorderAt: (a, b) => a.reorderThreshold - b.reorderThreshold,
};

function SummaryCard({
  icon,
  title,
  value,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  value?: string;
  hint?: string;
}) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription className="flex items-center gap-2">
          {icon}
          {title}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">
          {value ?? <Skeleton className="h-8 w-24" />}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className="px-4 text-xs text-muted-foreground">
          {hint}
        </CardContent>
      )}
    </Card>
  );
}

export default function StockTab() {
  const { t } = useTranslation();
  const items = useQuery(api.inventory.list);
  const { formatMoney, formatNumber } = useFormat();
  const { isFieldVisible } = useFieldVisibility();
  const [state, setState] = useUrlState({
    q: "",
    status: "all",
    inactive: "",
    sort: "product",
    dir: "asc",
  });
  const show = {
    sku: isFieldVisible("inventory", "sku"),
    avgCost: isFieldVisible("inventory", "avgCost"),
    assetValue: isFieldVisible("inventory", "assetValue"),
    reorderAt: isFieldVisible("inventory", "reorderAt"),
    status: isFieldVisible("inventory", "status"),
  };

  const active = useMemo(() => items?.filter((i) => i.isActive), [items]);
  const summary = useMemo(() => {
    if (!active || !items) return undefined;
    // Stock and its value include inactive items: they're still in the warehouse
    return {
      units: items.reduce((s, i) => s + i.onHand, 0),
      value: items.reduce((s, i) => s + i.assetValue, 0),
      inactiveItems: items.length - active.length,
      // Returns on their way back count even for inactive items
      transitUnits: (items ?? []).reduce((s, i) => s + i.inTransit, 0),
      transitValue: (items ?? []).reduce((s, i) => s + i.inTransitValue, 0),
      low: active.filter((i) => i.stockStatus === "low").length,
      out: active.filter((i) => i.stockStatus === "out").length,
    };
  }, [active, items]);

  const rows = useMemo(() => {
    if (!items) return undefined;
    const filtered = items.filter((i) => {
      if (!state.inactive && !i.isActive) return false;
      if (
        state.status === "attention"
          ? i.stockStatus === "ok" || !i.isActive
          : state.status !== "all" && i.stockStatus !== state.status
      )
        return false;
      return matchesSearch(
        `${i.productName} ${i.variantName ?? ""} ${i.sku} ${i.productSku}`,
        state.q,
      );
    });
    const sorter = SORTERS[state.sort] ?? SORTERS.product;
    const sign = state.dir === "desc" ? -1 : 1;
    return filtered.sort(
      (a, b) => sign * sorter(a, b) || SORTERS.product(a, b),
    );
  }, [items, state]);

  const onSort = (sort: string, dir: SortDir) => setState({ sort, dir });
  const filtered = !!state.q || state.status !== "all" || !!state.inactive;
  const needRestock = (summary?.low ?? 0) + (summary?.out ?? 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Boxes className="size-4" />}
          title={t("Units on hand")}
          value={summary && formatNumber(summary.units)}
          hint={
            summary &&
            active &&
            (summary.inactiveItems > 0
              ? t("{{active}} active items + {{inactive}} inactive", {
                  active: active.length,
                  inactive: summary.inactiveItems,
                })
              : t("Across {{count}} active items", { count: active.length }))
          }
        />
        {show.assetValue && (
          <SummaryCard
            icon={<Coins className="size-4" />}
            title={t("Stock value")}
            value={summary && formatMoney(summary.value)}
            hint={t("All stock, inactive items included, at average cost")}
          />
        )}
        <SummaryCard
          icon={<Undo2 className="size-4" />}
          title={t("Returns in transit")}
          value={summary && formatNumber(summary.transitUnits)}
          hint={
            summary &&
            (show.assetValue
              ? t("Worth {{value}} at the cost they shipped with", {
                  value: formatMoney(summary.transitValue),
                })
              : t("Announced by the courier, not received yet"))
          }
        />
        <SummaryCard
          icon={<AlertTriangle className="size-4" />}
          title={t("Needs restock")}
          value={summary && formatNumber(needRestock)}
          hint={
            summary &&
            t("{{out}} out of stock · {{low}} low", {
              out: formatNumber(summary.out),
              low: formatNumber(summary.low),
            })
          }
        />
      </div>

      {needRestock > 0 && state.status !== "attention" && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>
            {t("{{count}} items are at or below the reorder level", {
              count: needRestock,
            })}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {t("Restock them before they run out.")}
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => setState({ status: "attention" })}
            >
              {t("Show them")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={t("Search stock")}
            title={t(
              "Tip: use | to search for several things at once, e.g. TEE-RED|TEE-BLK",
            )}
            placeholder={t("Search by name or SKU…")}
            className="ps-8"
            value={state.q}
            onChange={(e) => setState({ q: e.target.value })}
          />
        </div>
        <Select
          value={state.status}
          onValueChange={(status) => setState({ status })}
        >
          <SelectTrigger className="w-[160px]" aria-label={t("Stock level")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {t(s.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 px-1">
          <Switch
            id="stock-inactive"
            checked={!!state.inactive}
            onCheckedChange={(on) => setState({ inactive: on ? "1" : "" })}
          />
          <Label htmlFor="stock-inactive" className="text-sm font-normal">
            {t("Show inactive")}
          </Label>
        </div>
        <div className="ms-auto">
          <ExportStockButton rows={rows} />
        </div>
      </div>

      {rows === undefined ? (
        <TableSkeleton rows={8} />
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<PackageSearch />}
            title={t("No items match these filters")}
            action={
              <Button
                variant="outline"
                onClick={() =>
                  setState({
                    q: "",
                    status: "all",
                    inactive: "",
                  })
                }
              >
                {t("Clear filters")}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Boxes />}
            title={t("No stock yet")}
            description={t(
              "Add products, then restock them to start tracking inventory.",
            )}
          />
        )
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  column="product"
                  sort={state.sort}
                  dir={state.dir as SortDir}
                  onSort={onSort}
                >
                  {t("Product")}
                </SortableHead>
                {show.sku && (
                  <SortableHead
                    column="sku"
                    sort={state.sort}
                    dir={state.dir as SortDir}
                    onSort={onSort}
                    className="hidden sm:table-cell"
                  >
                    {t("SKU")}
                  </SortableHead>
                )}
                <SortableHead
                  column="onHand"
                  sort={state.sort}
                  dir={state.dir as SortDir}
                  onSort={onSort}
                  align="right"
                >
                  {t("On hand")}
                </SortableHead>
                {show.avgCost && (
                  <SortableHead
                    column="avgCost"
                    sort={state.sort}
                    dir={state.dir as SortDir}
                    onSort={onSort}
                    align="right"
                    className="hidden md:table-cell"
                  >
                    {t("Avg cost")}
                  </SortableHead>
                )}
                {show.assetValue && (
                  <SortableHead
                    column="assetValue"
                    sort={state.sort}
                    dir={state.dir as SortDir}
                    onSort={onSort}
                    align="right"
                    className="hidden md:table-cell"
                  >
                    {t("Value")}
                  </SortableHead>
                )}
                {show.reorderAt && (
                  <SortableHead
                    column="reorderAt"
                    sort={state.sort}
                    dir={state.dir as SortDir}
                    onSort={onSort}
                    align="right"
                    className="hidden lg:table-cell"
                  >
                    {t("Reorder at")}
                  </SortableHead>
                )}
                {show.status && (
                  <TableHead className="hidden sm:table-cell">
                    {t("Status")}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => {
                const label = i.variantName
                  ? `${i.productName} – ${i.variantName}`
                  : i.productName;
                return (
                  <LinkRow
                    key={i.key}
                    to={`/products/${i.productId}`}
                    label={t("Open {{name}}", { name: label })}
                    className={i.isActive ? undefined : "opacity-60"}
                  >
                    <TableCell className="max-w-[260px]">
                      <div className="truncate font-medium">
                        {i.productName}
                        {i.variantName && (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            – {i.variantName}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        {!i.isActive && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[10px]"
                          >
                            {t("Inactive")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {show.sku && (
                      <TableCell className="hidden font-mono text-xs sm:table-cell">
                        {i.sku}
                      </TableCell>
                    )}
                    <TableCell className="text-end tabular-nums">
                      {formatNumber(i.onHand)}{" "}
                      <span className="text-xs text-muted-foreground">
                        {i.uom}
                      </span>
                      {i.reserved > 0 && (
                        <div
                          className={cn(
                            "text-xs",
                            i.available < 0
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {t("{{reserved}} held · {{available}} available", {
                            reserved: formatNumber(i.reserved),
                            available: formatNumber(i.available),
                          })}
                        </div>
                      )}
                      {i.inTransit > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {t("+{{quantity}} returning", {
                            quantity: formatNumber(i.inTransit),
                          })}
                        </div>
                      )}
                    </TableCell>
                    {show.avgCost && (
                      <TableCell className="hidden text-end tabular-nums md:table-cell">
                        {formatMoney(i.avgCost)}
                      </TableCell>
                    )}
                    {show.assetValue && (
                      <TableCell className="hidden text-end tabular-nums md:table-cell">
                        {formatMoney(i.assetValue)}
                      </TableCell>
                    )}
                    {show.reorderAt && (
                      <TableCell className="hidden text-end tabular-nums lg:table-cell">
                        {formatNumber(i.reorderThreshold)}
                      </TableCell>
                    )}
                    {show.status && (
                      <TableCell className="hidden sm:table-cell">
                        <StockBadge
                          onHand={i.onHand}
                          threshold={i.reorderThreshold}
                        />
                      </TableCell>
                    )}
                  </LinkRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            {filtered && items
              ? t("{{count}} items of {{total}}", {
                  count: rows.length,
                  total: formatNumber(
                    state.inactive ? items.length : (active?.length ?? 0),
                  ),
                })
              : t("{{count}} items", { count: rows.length })}
          </p>
        </div>
      )}
    </div>
  );
}
