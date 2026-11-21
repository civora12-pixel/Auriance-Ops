import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  History,
  ListFilter,
  Lock,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Pager, useUrlState } from "@/components/data-table.tsx";
import { EmptyState, TableSkeleton } from "@/components/states.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import AdminModeDialog from "@/components/admin-mode-dialog.tsx";
import { ProductPicker, sellableKey } from "@/components/product-picker.tsx";
import { api, useMutation, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useAdminMode, useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { useDebouncedCallback } from "@/hooks/use-debounce.ts";
import { MOVEMENT_TYPES, MOVEMENT_TYPE_LABELS } from "@shared/constants.ts";
import type { MovementType } from "@shared/constants.ts";
import {
  MovementTypeBadge,
  OrderLink,
  QuantityChange,
} from "./movement-badge.tsx";
import { movementDetails } from "./movement-utils.ts";
import ExportMovementsButton from "./export-movements-button.tsx";
import CorrectCostDialog from "./correct-cost-dialog.tsx";
import type { CostTarget } from "./correct-cost-dialog.tsx";

/** Types from features that no longer exist; old rows still show, but not in the filter. */
const RETIRED_TYPES: readonly MovementType[] = [
  "not_sellable_in",
  "back_to_sellable",
];
const FILTER_TYPES = MOVEMENT_TYPES.filter((x) => !RETIRED_TYPES.includes(x));
/** The quick "Adjustments" filter: stock corrections and everything written off. */
export const ADJUSTMENT_TYPES = [
  "adjustment",
  "write_off",
  "return_write_off",
  "transit_write_off",
  "cost_correction",
].join(",");
import type { MovementFilters } from "./export-movements-button.tsx";

type Movement = Output<typeof api.inventory.listMovements>["items"][number];

const PAGE_SIZES = [25, 50, 100];
const isMovementType = (t: string): t is MovementType =>
  (MOVEMENT_TYPES as readonly string[]).includes(t);

export default function MovementTab({
  defaultTypes = "",
}: {
  /** Movement types shown until the user changes the filter. */
  defaultTypes?: string;
}) {
  const { t } = useTranslation();
  const { isAdmin, canSeeCost, canEdit } = useCurrentUser();
  const canCorrectCost = canSeeCost && canEdit("inventory");
  const [costTarget, setCostTarget] = useState<CostTarget | null>(null);
  const { isAdminMode } = useAdminMode();
  const { formatDateTime, formatNumber, formatMoney, today } = useFormat();
  const [state, setState] = useUrlState({
    mq: "",
    types: defaultTypes,
    from: "",
    to: "",
    by: "movement",
    product: "",
    variant: "",
    page: "1",
    size: "50",
  });
  const [search, setSearch] = useState(state.mq);
  const pushSearch = useDebouncedCallback(
    (mq: string) => setState({ mq: mq.trim() }),
    350,
  );
  const [toDelete, setToDelete] = useState<Movement | null>(null);
  const [adminModeOpen, setAdminModeOpen] = useState(false);
  const deleteMovement = useMutation(api.admin.destructive.deleteMovement);

  const types = useMemo(
    () => state.types.split(",").filter(isMovementType),
    [state.types],
  );
  const page = Math.max(1, Number.parseInt(state.page, 10) || 1);
  const pageSize = PAGE_SIZES.includes(Number(state.size))
    ? Number(state.size)
    : 50;
  const rangeError =
    state.from && state.to && state.from > state.to
      ? t("The start date is after the end date")
      : undefined;

  const filters: MovementFilters = {
    productId: state.product || undefined,
    variantId: (state.product && state.variant) || undefined,
    types: types.length ? types : undefined,
    fromDay: state.from || undefined,
    toDay: state.to || undefined,
    dateBy: state.by === "recorded" ? "recorded" : undefined,
    search: state.mq || undefined,
  };
  const data = useQuery(
    api.inventory.listMovements,
    rangeError ? "skip" : { ...filters, page, pageSize },
    { keepPrevious: true },
  );
  const items = data?.items;

  const hasFilters = !!(
    state.mq ||
    types.length ||
    state.from ||
    state.to ||
    state.product
  );
  const clearFilters = () => {
    setSearch("");
    pushSearch.cancel();
    setState({ mq: "", types: "", from: "", to: "", product: "", variant: "" });
  };
  const toggleType = (type: MovementType, on: boolean) => {
    const next = on ? [...types, type] : types.filter((x) => x !== type);
    setState({
      types: MOVEMENT_TYPES.filter((x) => next.includes(x)).join(","),
    });
  };
  // A product picked here, or a whole product (all variants) linked from its page
  const productLabel =
    state.product && !state.variant
      ? t("{{name}} (all variants)", {
          name: items?.[0]?.productName ?? t("Selected product"),
        })
      : t("All products");

  const askDelete = (m: Movement) => {
    if (!isAdminMode) setAdminModeOpen(true);
    else setToDelete(m);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={t("Search movements")}
            title={t(
              "Tip: use | to search for several things at once, e.g. TEE-RED|TEE-BLK",
            )}
            placeholder={t(
              "Search product, SKU, supplier, notes, MOV-…, ORD-…",
            )}
            className="ps-8"
            value={search}
            maxLength={500}
            onChange={(e) => {
              setSearch(e.target.value);
              pushSearch(e.target.value);
            }}
          />
        </div>
        <div className="flex min-w-[220px] flex-1 items-center gap-1 sm:max-w-xs">
          <ProductPicker
            value={
              state.product
                ? sellableKey(state.product, state.variant || undefined)
                : undefined
            }
            onChange={(item) =>
              setState({
                product: item.productId,
                variant: item.variantId ?? "",
              })
            }
            showPrice={false}
            placeholder={productLabel}
            className="min-h-9"
          />
          {state.product && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("Clear product filter")}
              onClick={() => setState({ product: "", variant: "" })}
            >
              <X />
            </Button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <ListFilter />
              {types.length === 0
                ? t("All types")
                : types.length === 1
                  ? t(MOVEMENT_TYPE_LABELS[types[0]])
                  : t("{{count}} types", { count: types.length })}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>{t("Movement types")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {FILTER_TYPES.map((type) => (
              <DropdownMenuCheckboxItem
                key={type}
                checked={types.includes(type)}
                onCheckedChange={(on) => toggleType(type, on === true)}
                onSelect={(e) => e.preventDefault()}
              >
                {t(MOVEMENT_TYPE_LABELS[type])}
              </DropdownMenuCheckboxItem>
            ))}
            {types.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setState({ types: "" })}>
                  {t("Show all types")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant={state.types === ADJUSTMENT_TYPES ? "secondary" : "outline"}
          aria-pressed={state.types === ADJUSTMENT_TYPES}
          onClick={() =>
            setState({
              types: state.types === ADJUSTMENT_TYPES ? "" : ADJUSTMENT_TYPES,
            })
          }
        >
          <SlidersHorizontal />
          {t("Adjustments & write-offs")}
        </Button>
        <div className="grid gap-1">
          <Label htmlFor="mov-dateby" className="text-xs text-muted-foreground">
            {t("Dates by")}
          </Label>
          <select
            id="mov-dateby"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={state.by === "recorded" ? "recorded" : "movement"}
            onChange={(e) => setState({ by: e.target.value })}
          >
            <option value="movement">{t("Movement date")}</option>
            <option value="recorded">{t("When it was recorded")}</option>
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="mov-from" className="text-xs text-muted-foreground">
            {t("From")}
          </Label>
          <Input
            id="mov-from"
            type="date"
            className="w-[150px]"
            value={state.from}
            max={state.to || today()}
            onChange={(e) => setState({ from: e.target.value })}
            aria-invalid={!!rangeError || undefined}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="mov-to" className="text-xs text-muted-foreground">
            {t("To")}
          </Label>
          <Input
            id="mov-to"
            type="date"
            className="w-[150px]"
            value={state.to}
            min={state.from || undefined}
            onChange={(e) => setState({ to: e.target.value })}
            aria-invalid={!!rangeError || undefined}
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" onClick={clearFilters}>
            {t("Clear")}
          </Button>
        )}
        <div className="ms-auto">
          <ExportMovementsButton
            filters={filters}
            disabled={!!rangeError || !data?.total}
          />
        </div>
      </div>
      {rangeError && (
        <p role="alert" className="text-sm text-destructive">
          {rangeError}
        </p>
      )}

      {rangeError ? null : items === undefined ? (
        <TableSkeleton rows={10} />
      ) : items.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={<Search />}
            title={t("No movements match these filters")}
            action={
              <Button variant="outline" onClick={clearFilters}>
                {t("Clear filters")}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<History />}
            title={t("No stock movements yet")}
            description={t(
              "Restocks, shipments, returns and adjustments show up here.",
            )}
          />
        )
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Date")}</TableHead>
                  <TableHead>{t("Type")}</TableHead>
                  <TableHead>{t("Product")}</TableHead>
                  <TableHead className="text-end">{t("Qty")}</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t("Details")}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("Order")}
                  </TableHead>
                  <TableHead className="hidden xl:table-cell">
                    {t("By")}
                  </TableHead>
                  {canSeeCost && (
                    <TableHead className="hidden text-end md:table-cell">
                      {t("Unit cost")}
                    </TableHead>
                  )}
                  {canSeeCost && (
                    <TableHead className="hidden text-end lg:table-cell">
                      {t("Amount")}
                    </TableHead>
                  )}
                  {(isAdmin || canCorrectCost) && (
                    <TableHead className="w-10" />
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((m) => {
                  const details = movementDetails(m);
                  return (
                    <TableRow key={m._id}>
                      <TableCell className="whitespace-nowrap">
                        <div className="text-sm">{formatDateTime(m.date)}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {m.movementId}
                        </div>
                        <div
                          className="text-xs text-muted-foreground"
                          title={t("Recorded {{when}} by {{name}}", {
                            when: formatDateTime(m._creationTime),
                            name: m.userName,
                          })}
                        >
                          {t("Recorded {{when}} by {{name}}", {
                            when: formatDateTime(m._creationTime),
                            name: m.userName,
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <MovementTypeBadge
                          type={m.type}
                          restockType={m.restockType}
                        />
                      </TableCell>
                      <TableCell className="max-w-[240px]">
                        <div className="truncate">
                          {m.productExists ? (
                            <Link
                              to={`/products/${m.productId}`}
                              className="font-medium hover:underline"
                            >
                              {m.productName}
                            </Link>
                          ) : (
                            <span className="font-medium text-muted-foreground">
                              {m.productName}
                            </span>
                          )}
                          {m.variantName && (
                            <span className="text-muted-foreground">
                              {" "}
                              – {m.variantName}
                            </span>
                          )}
                        </div>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {m.productSku}
                        </div>
                      </TableCell>
                      <TableCell className="text-end">
                        <QuantityChange value={m.quantityChange} />
                      </TableCell>
                      <TableCell
                        className="hidden max-w-[260px] truncate text-sm text-muted-foreground lg:table-cell"
                        title={details || undefined}
                      >
                        {details || "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <OrderLink
                          orderId={m.orderId}
                          orderNumber={m.orderNumber}
                        />
                      </TableCell>
                      <TableCell className="hidden text-sm xl:table-cell">
                        {m.userName}
                      </TableCell>
                      {canSeeCost && (
                        <TableCell className="hidden text-end tabular-nums md:table-cell">
                          {formatMoney(m.unitCost)}
                        </TableCell>
                      )}
                      {canSeeCost && (
                        <TableCell className="hidden text-end tabular-nums lg:table-cell">
                          {m.unitCost == null
                            ? "—"
                            : formatMoney(m.quantityChange * m.unitCost)}
                        </TableCell>
                      )}
                      {(isAdmin || canCorrectCost) && (
                        <TableCell>
                          <div className="flex justify-end">
                            {canCorrectCost && m.type === "restock" && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("Correct cost of {{id}}", {
                                  id: m.movementId,
                                })}
                                title={t("Correct cost")}
                                onClick={() => setCostTarget(m as CostTarget)}
                              >
                                <Tag />
                              </Button>
                            )}
                            {!isAdmin ? null : m.orderId ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    tabIndex={0}
                                    className="inline-flex size-8 items-center justify-center text-muted-foreground/50"
                                  >
                                    <Lock
                                      className="size-3.5"
                                      aria-label={t("Linked to an order")}
                                    />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t(
                                    "Created by an order. Change the order to undo it.",
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("Delete {{name}}", {
                                  name: m.movementId,
                                })}
                                onClick={() => askDelete(m)}
                              >
                                <Trash2 />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pager
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            pageSizes={PAGE_SIZES}
            onPage={(p) => setState({ page: String(p) })}
            onPageSize={(size) => setState({ size: String(size) })}
          />
        </div>
      )}

      {canCorrectCost && (
        <CorrectCostDialog
          movement={costTarget}
          onOpenChange={(open) => !open && setCostTarget(null)}
        />
      )}
      {isAdmin && (
        <>
          <ConfirmDialog
            open={!!toDelete}
            onOpenChange={(open) => !open && setToDelete(null)}
            title={
              toDelete
                ? t("Delete {{name}}?", { name: toDelete.movementId })
                : t("Delete movement?")
            }
            description={
              toDelete &&
              t(
                "This removes the {{type}} of {{quantity}} for {{product}} from the history and reverses its effect on stock. This can't be undone.",
                {
                  type: t(MOVEMENT_TYPE_LABELS[toDelete.type]).toLowerCase(),
                  quantity: formatNumber(Math.abs(toDelete.quantityChange)),
                  product: toDelete.variantName
                    ? `${toDelete.productName} – ${toDelete.variantName}`
                    : toDelete.productName,
                },
              )
            }
            confirmLabel={t("Delete movement")}
            destructive
            successMessage={t("Movement deleted")}
            onConfirm={() =>
              toDelete && deleteMovement({ movementId: toDelete._id })
            }
          />
          <AdminModeDialog
            open={adminModeOpen}
            onOpenChange={setAdminModeOpen}
          />
        </>
      )}
    </div>
  );
}
