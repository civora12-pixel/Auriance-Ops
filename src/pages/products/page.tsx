import { matchesSearch } from "@shared/search.ts";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ImageOff,
  LayoutGrid,
  List,
  Package,
  Plus,
  Search,
  Store,
  ImageUp,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import ExportSkusButton from "./_components/export-skus-button.tsx";
import { EmptyState, TableSkeleton } from "@/components/states.tsx";
import { StockBadge } from "@/components/status-badge.tsx";
import {
  LinkRow,
  SortableHead,
  useUrlState,
} from "@/components/data-table.tsx";
import type { SortDir } from "@/components/data-table.tsx";
import { api, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { useFieldVisibility } from "@/hooks/use-field-visibility.ts";
import { cn } from "@/lib/utils.ts";
import { tk } from "@/lib/i18n.ts";
import ProductFormDialog from "./_components/product-form-dialog.tsx";
import BulkImportDialog from "./_components/bulk-import-dialog.tsx";
import BulkPhotosDialog from "./_components/bulk-photos-dialog.tsx";
import ShopSectionsDialog from "./_components/shop-sections-dialog.tsx";

type ProductItem = Output<typeof api.products.list>[number];

const STATUS_OPTIONS = [
  { value: "active", label: tk("Active") },
  { value: "inactive", label: tk("Inactive") },
  { value: "all", label: tk("All products") },
] as const;

const STOCK_OPTIONS = [
  { value: "all", label: tk("Any stock") },
  { value: "low", label: tk("Low or out of stock") },
  { value: "out", label: tk("Out of stock") },
] as const;

const DEFAULTS = {
  q: "",
  status: "active",
  stock: "all",
  view: "grid",
  sort: "name",
  dir: "asc",
};

function ProductImage({
  url,
  className,
}: {
  url?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          className,
        )}
      >
        {url ? <ImageOff className="size-6" /> : <Package className="size-6" />}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className={cn("object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
}

export default function ProductsPage() {
  const { t } = useTranslation();
  const { canEdit } = useCurrentUser();
  const isAdmin = canEdit("inventory");
  const { isFieldVisible } = useFieldVisibility();
  const { formatMoney, formatNumber } = useFormat();
  const [state, update] = useUrlState(DEFAULTS);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);

  const activeFilter =
    state.status === "inactive"
      ? "inactive"
      : state.status === "all"
        ? "all"
        : "active";
  const products = useQuery(
    api.products.list,
    { activeFilter },
    { keepPrevious: true },
  );

  const show = {
    image: isFieldVisible("products", "imageUrl"),
    sku: isFieldVisible("products", "sku"),
    price: isFieldVisible("products", "unitPrice"),
    uom: isFieldVisible("products", "uom"),
    reorder: isFieldVisible("products", "reorderThreshold"),
    variants: isFieldVisible("products", "hasVariants"),
  };

  const filtered = useMemo(() => {
    if (!products) return undefined;
    const rows = products.filter((p) => {
      if (state.stock === "low" && p.stockStatus === "ok") return false;
      if (state.stock === "out" && p.stockStatus !== "out") return false;
      return matchesSearch(`${p.name} ${p.sku} ${p.variantText}`, state.q);
    });
    const dir = state.dir === "desc" ? -1 : 1;
    const by: Record<string, (a: ProductItem, b: ProductItem) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      sku: (a, b) => a.sku.localeCompare(b.sku),
      price: (a, b) => a.unitPrice - b.unitPrice,
      stock: (a, b) => a.totalOnHand - b.totalOnHand,
    };
    const compare = by[state.sort] ?? by.name;
    return [...rows].sort((a, b) => compare(a, b) * dir);
  }, [products, state.q, state.stock, state.sort, state.dir]);

  const hasFilters =
    state.q !== "" || state.stock !== "all" || state.status !== "active";
  const clearFilters = () => update({ q: "", stock: "all", status: "active" });
  const onSort = (column: string, dir: SortDir) =>
    update({ sort: column, dir });
  const sortProps = { sort: state.sort, dir: state.dir as SortDir, onSort };

  return (
    <PageBody>
      <PageHeader
        title={t("Products")}
        description={
          products
            ? activeFilter === "active"
              ? t("{{count}} active products", { count: products.length })
              : activeFilter === "inactive"
                ? t("{{count}} inactive products", { count: products.length })
                : t("{{count}} products", { count: products.length })
            : undefined
        }
        actions={
          <>
            <ExportSkusButton />
            {canEdit("inventory") && (
              <Button variant="outline" onClick={() => setSectionsOpen(true)}>
                <Store />
                {t("Shop sections")}
              </Button>
            )}
            {isAdmin && (
              <>
                <Button variant="outline" onClick={() => setPhotosOpen(true)}>
                  <ImageUp />
                  {t("Upload photos")}
                </Button>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload />
                  {t("Import CSV")}
                </Button>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus />
                  {t("New product")}
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            title={t(
              "Tip: use | to search for several things at once, e.g. TEE-RED|TEE-BLK",
            )}
            placeholder={t("Search by name or SKU…")}
            aria-label={t("Search products")}
            className="ps-8"
            value={state.q}
            onChange={(e) => update({ q: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select
            value={state.stock}
            onValueChange={(stock) => update({ stock })}
          >
            <SelectTrigger
              className="w-full sm:w-48"
              aria-label={t("Stock level")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STOCK_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={state.status}
            onValueChange={(status) => update({ status })}
          >
            <SelectTrigger className="w-full sm:w-36" aria-label={t("Status")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup
            type="single"
            variant="outline"
            value={state.view}
            onValueChange={(view) =>
              view && update({ view }, { resetPage: false })
            }
            aria-label={t("Layout")}
            className="hidden sm:flex"
          >
            <ToggleGroupItem value="grid" aria-label={t("Grid view")}>
              <LayoutGrid />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label={t("Table view")}>
              <List />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {filtered === undefined ? (
        state.view === "table" ? (
          <TableSkeleton />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={<Search />}
            title={t("No products match")}
            description={t("Try a different search or clear the filters.")}
            action={
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X />
                {t("Clear filters")}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Package />}
            title={t("No products yet")}
            description={
              isAdmin
                ? t(
                    "Add your first product, or import your catalog from a spreadsheet.",
                  )
                : t("An admin hasn't added any products yet.")
            }
            action={
              isAdmin && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus />
                    {t("New product")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setImportOpen(true)}
                  >
                    <Upload />
                    {t("Import CSV")}
                  </Button>
                </div>
              )
            }
          />
        )
      ) : state.view === "table" ? (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead column="name" {...sortProps}>
                  {t("Product")}
                </SortableHead>
                {show.sku && (
                  <SortableHead column="sku" {...sortProps}>
                    {t("SKU")}
                  </SortableHead>
                )}
                {show.price && (
                  <SortableHead column="price" align="right" {...sortProps}>
                    {t("Price")}
                  </SortableHead>
                )}
                <SortableHead column="stock" align="right" {...sortProps}>
                  {t("On hand")}
                </SortableHead>
                <TableHead>{t("Stock")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <LinkRow
                  key={p._id}
                  to={`/products/${p._id}`}
                  label={t("Open {{name}}", { name: p.name })}
                  className={cn(!p.isActive && "text-muted-foreground")}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {show.image && (
                        <ProductImage
                          url={p.imageUrl}
                          className="size-9 shrink-0 rounded-md"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="flex gap-1 text-xs text-muted-foreground">
                          {show.variants && p.hasVariants && (
                            <span>
                              {t("{{count}} variants", {
                                count: p.activeVariantCount,
                              })}
                            </span>
                          )}
                          {!p.isActive && <span>· {t("Inactive")}</span>}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  {show.sku && (
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  )}
                  {show.price && (
                    <TableCell className="text-end tabular-nums">
                      {formatMoney(p.unitPrice)}
                    </TableCell>
                  )}
                  <TableCell className="text-end tabular-nums">
                    {formatNumber(p.totalOnHand)}
                    {show.uom && (
                      <span className="ms-1 text-xs text-muted-foreground">
                        {p.uom}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StockBadge
                      onHand={p.totalOnHand}
                      threshold={p.reorderThreshold}
                    />
                  </TableCell>
                </LinkRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <li key={p._id}>
              <Link
                to={`/products/${p._id}`}
                className="group block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Card
                  className={cn(
                    "h-full gap-0 overflow-hidden py-0 transition-shadow group-hover:shadow-md",
                    !p.isActive && "opacity-70",
                  )}
                >
                  {show.image && (
                    <ProductImage
                      url={p.imageUrl}
                      className="aspect-[4/3] w-full"
                    />
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="truncate font-medium group-hover:underline">
                          {p.name}
                        </h2>
                        {show.sku && (
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {p.sku}
                          </p>
                        )}
                      </div>
                      {show.price && (
                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatMoney(p.unitPrice)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {show.variants && p.hasVariants && (
                        <Badge variant="outline">
                          {t("{{count}} variants", {
                            count: p.activeVariantCount,
                          })}
                        </Badge>
                      )}
                      {!p.isActive && (
                        <Badge variant="outline">{t("Inactive")}</Badge>
                      )}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-sm">
                      <span className="text-muted-foreground tabular-nums">
                        {show.uom && p.uom
                          ? t("{{quantity}} {{uom}} on hand", {
                              quantity: formatNumber(p.totalOnHand),
                              uom: p.uom,
                            })
                          : t("{{quantity}} on hand", {
                              quantity: formatNumber(p.totalOnHand),
                            })}
                      </span>
                      <StockBadge
                        onHand={p.totalOnHand}
                        threshold={p.reorderThreshold}
                      />
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canEdit("inventory") && <ShopSectionsDialog open={sectionsOpen} onOpenChange={setSectionsOpen} />}
      {isAdmin && (
        <>
          <ProductFormDialog open={createOpen} onOpenChange={setCreateOpen} />
          <BulkImportDialog open={importOpen} onOpenChange={setImportOpen} />
          <BulkPhotosDialog open={photosOpen} onOpenChange={setPhotosOpen} />
        </>
      )}
    </PageBody>
  );
}
