import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Boxes,
  EyeOff,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import {
  Card,
  CardAction,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Photo, PhotoEditor } from "@/components/photo.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import {
  EmptyState,
  NotFoundState,
  PageSkeleton,
  TableSkeleton,
} from "@/components/states.tsx";
import { StockBadge } from "@/components/status-badge.tsx";
import AdminModeDialog from "@/components/admin-mode-dialog.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useAdminMode, useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { useFieldVisibility } from "@/hooks/use-field-visibility.ts";
import { cn } from "@/lib/utils.ts";
import ProductFormDialog from "../_components/product-form-dialog.tsx";
import AddVariantDialog from "./_components/add-variant-dialog.tsx";
import EditVariantDialog from "./_components/edit-variant-dialog.tsx";
import type { EditableVariant } from "./_components/edit-variant-dialog.tsx";
import DeleteCatalogDialog from "./_components/delete-catalog-dialog.tsx";
import type { DeleteTarget } from "./_components/delete-catalog-dialog.tsx";
import { AttributeChips } from "./_components/attributes-editor.tsx";
import {
  MovementTypeBadge,
  OrderLink,
  QuantityChange,
} from "../../inventory/_components/movement-badge.tsx";
import { movementDetails } from "../../inventory/_components/movement-utils.ts";

type Product = NonNullable<Output<typeof api.products.get>>;
type Variant = Product["variants"][number];

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
        {hint && (
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProductDetailPage() {
  const { productId = "" } = useParams();
  const product = useQuery(api.products.get, { productId });
  const { t } = useTranslation();

  if (product === undefined) return <PageSkeleton cards={4} rows={4} />;
  if (product === null) {
    return (
      <PageBody>
        <NotFoundState
          title={t("Product not found")}
          description={t("It may have been deleted, or the link is wrong.")}
          backTo="/products"
          backLabel={t("Back to products")}
        />
      </PageBody>
    );
  }
  return <ProductDetail product={product} />;
}

function ProductDetail({ product }: { product: Product }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin: isAppAdmin, canAccess, canEdit } = useCurrentUser();
  // Editing the catalog needs Inventory: Edit; deleting stays with admins
  const isAdmin = canEdit("inventory");
  const { isAdminMode } = useAdminMode();
  const { isFieldVisible } = useFieldVisibility();
  const { formatMoney, formatNumber, formatPercent } = useFormat();
  const setActive = useMutation(api.products.setActive);
  const setVariantActive = useMutation(api.products.setVariantActive);

  const [editOpen, setEditOpen] = useState(false);
  const [addVariantOpen, setAddVariantOpen] = useState(false);
  const [editVariant, setEditVariant] = useState<EditableVariant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [adminPrompt, setAdminPrompt] = useState(false);
  const [busy, setBusy] = useState(false);

  const show = {
    sku: isFieldVisible("products", "sku"),
    price: isFieldVisible("products", "unitPrice"),
    uom: isFieldVisible("products", "uom"),
    image: isFieldVisible("products", "imageUrl"),
    reorder: isFieldVisible("products", "reorderThreshold"),
  };
  const canSeeInventory = canAccess("inventory");
  const margin = (cost: number | undefined) =>
    cost === undefined || product.unitPrice <= 0
      ? undefined
      : ((product.unitPrice - cost) / product.unitPrice) * 100;

  const requestDelete = (target: DeleteTarget) => {
    if (isAdminMode) setDeleteTarget(target);
    else setAdminPrompt(true);
  };

  const toggleProduct = async () => {
    setBusy(true);
    try {
      await setActive({ productId: product._id, isActive: !product.isActive });
      toast.success(
        product.isActive
          ? t("{{name}} is now inactive", { name: product.name })
          : t("{{name}} is active again", { name: product.name }),
      );
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleVariant = async (variant: Variant) => {
    try {
      await setVariantActive({
        variantId: variant._id,
        isActive: !variant.isActive,
      });
      toast.success(
        variant.isActive
          ? t("{{name}} deactivated", { name: variant.name })
          : t("{{name}} activated", { name: variant.name }),
      );
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const activeVariants = product.variants.filter((v) => v.isActive).length;

  return (
    <PageBody>
      <PageHeader
        breadcrumbs={[
          { label: t("Products"), to: "/products" },
          { label: product.name },
        ]}
        title={
          <span className="flex items-center gap-3 sm:gap-4">
            {show.image && !isAdmin && (
              <Photo url={product.imageUrl} label={product.name} size="lg" />
            )}
            <span className="min-w-0 break-words">{product.name}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            {show.sku && <span className="font-mono">{product.sku}</span>}
            {!product.isActive && (
              <Badge variant="outline">{t("Inactive")}</Badge>
            )}
            <StockBadge
              onHand={product.totalOnHand}
              threshold={product.reorderThreshold}
            />
          </span>
        }
        actions={
          <>
            {canSeeInventory && (
              <Button variant="outline" asChild>
                <Link to={`/inventory/movements?product=${product._id}`}>
                  <Boxes />
                  {t("Stock history")}
                </Link>
              </Button>
            )}
            {isAdmin && (
              <>
                <Button onClick={() => setEditOpen(true)}>
                  <Pencil />
                  {t("Edit")}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t("More actions")}
                      disabled={busy}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setAddVariantOpen(true)}>
                      <Plus />
                      {t("Add variant")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void toggleProduct()}>
                      {product.isActive ? <EyeOff /> : <Power />}
                      {product.isActive ? t("Mark inactive") : t("Mark active")}
                    </DropdownMenuItem>
                    {isAppAdmin && <DropdownMenuSeparator />}
                    {isAppAdmin && (
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() =>
                          requestDelete({
                            kind: "product",
                            productId: product._id,
                            name: product.name,
                          })
                        }
                      >
                        {isAdminMode ? <Trash2 /> : <Lock />}
                        {t("Delete product…")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </>
        }
      />
      {show.image && isAdmin && (
        <PhotoEditor
          productId={product._id}
          url={product.imageUrl}
          label={product.name}
          size="xl"
          fallbackHint={
            product.hasVariants
              ? t("Variants without their own photo show this one")
              : undefined
          }
        />
      )}

      {!product.isActive && (
        <Alert>
          <EyeOff />
          <AlertTitle>{t("This product is inactive")}</AlertTitle>
          <AlertDescription>
            {t(
              "It can't be added to new orders or restocked, and doesn't trigger low-stock alerts.",
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {show.price && (
          <Stat
            label={t("Selling price")}
            value={formatMoney(product.unitPrice)}
            hint={show.uom ? t("per {{uom}}", { uom: product.uom }) : undefined}
          />
        )}
        <Stat
          label={t("On hand")}
          value={
            <>
              {formatNumber(product.totalOnHand)}
              {show.uom && (
                <span className="ms-1 text-sm font-normal text-muted-foreground">
                  {product.uom}
                </span>
              )}
            </>
          }
          hint={
            product.hasVariants
              ? t("Across {{count}} active variants", { count: activeVariants })
              : undefined
          }
        />
        {show.reorder && (
          <Stat
            label={t("Reorder at")}
            value={formatNumber(product.reorderThreshold)}
            hint={
              product.reorderThreshold === 0
                ? t("Low-stock alerts off")
                : t("Alert when stock drops below this")
            }
          />
        )}
        {product.canSeeCost && !product.hasVariants && (
          <Stat
            label={t("Average cost")}
            value={formatMoney(product.avgCost)}
            hint={
              show.price && margin(product.avgCost) !== undefined
                ? t("{{percent}} margin", {
                    percent: formatPercent(margin(product.avgCost)),
                  })
                : undefined
            }
          />
        )}
      </div>

      {(product.hasVariants || isAdmin) && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Variants")}</CardTitle>
            <CardDescription>
              {product.hasVariants
                ? t("{{count}} variants, each with its own SKU and stock", {
                    count: product.variants.length,
                  })
                : t("This product has no variants.")}
            </CardDescription>
            {isAdmin && (
              <CardAction>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddVariantOpen(true)}
                >
                  <Plus />
                  {t("Add variant")}
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {product.variants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  "Add variants if it comes in sizes, colors or other options. Its current stock moves to the first variant you add.",
                )}
              </p>
            ) : (
              <div className="-mx-6 overflow-x-auto px-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {show.image && (
                        <TableHead>
                          <span className="sr-only">{t("Photo")}</span>
                        </TableHead>
                      )}
                      <TableHead>{t("Variant")}</TableHead>
                      {show.sku && <TableHead>{t("SKU")}</TableHead>}
                      <TableHead className="text-end">{t("On hand")}</TableHead>
                      {product.canSeeCost && (
                        <TableHead className="text-end">
                          {t("Avg cost")}
                        </TableHead>
                      )}
                      {product.canSeeCost && show.price && (
                        <TableHead className="text-end">
                          {t("Margin")}
                        </TableHead>
                      )}
                      <TableHead>{t("Stock")}</TableHead>
                      {isAdmin && (
                        <TableHead className="w-10">
                          <span className="sr-only">{t("Actions")}</span>
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.variants.map((v) => (
                      <TableRow
                        key={v._id}
                        className={cn(!v.isActive && "text-muted-foreground")}
                      >
                        {show.image && (
                          <TableCell className="w-0">
                            {isAdmin ? (
                              <PhotoEditor
                                productId={product._id}
                                variantId={v._id}
                                url={v.imageUrl}
                                label={`${product.name} – ${v.name}`}
                                size="lg"
                                fallbackHint={
                                  product.imageUrl
                                    ? t("Uses the product photo")
                                    : undefined
                                }
                              />
                            ) : (
                              <Photo
                                url={v.imageUrl ?? product.imageUrl}
                                label={`${product.name} – ${v.name}`}
                                size="lg"
                              />
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="font-medium">
                            {v.name}
                            {!v.isActive && (
                              <Badge
                                variant="outline"
                                className="ms-2 font-normal"
                              >
                                {t("Inactive")}
                              </Badge>
                            )}
                          </div>
                          <AttributeChips attributes={v.attributes} />
                        </TableCell>
                        {show.sku && (
                          <TableCell className="font-mono text-xs">
                            {v.sku}
                          </TableCell>
                        )}
                        <TableCell className="text-end tabular-nums">
                          {formatNumber(v.onHand)}
                        </TableCell>
                        {product.canSeeCost && (
                          <TableCell className="text-end tabular-nums">
                            {formatMoney(v.avgCost)}
                          </TableCell>
                        )}
                        {product.canSeeCost && show.price && (
                          <TableCell className="text-end tabular-nums">
                            {v.onHand > 0 || v.avgCost
                              ? formatPercent(margin(v.avgCost))
                              : "—"}
                          </TableCell>
                        )}
                        <TableCell>
                          {v.isActive ? (
                            <StockBadge
                              onHand={v.onHand}
                              threshold={product.reorderThreshold}
                            />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("Actions for {{name}}", {
                                    name: v.name,
                                  })}
                                >
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setEditVariant({
                                      _id: v._id,
                                      sku: v.sku,
                                      name: v.name,
                                      attributes: v.attributes,
                                    })
                                  }
                                >
                                  <Pencil />
                                  {t("Edit")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => void toggleVariant(v)}
                                >
                                  {v.isActive ? <EyeOff /> : <Power />}
                                  {v.isActive ? t("Deactivate") : t("Activate")}
                                </DropdownMenuItem>
                                {isAppAdmin && <DropdownMenuSeparator />}
                                {isAppAdmin && (
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() =>
                                      requestDelete({
                                        kind: "variant",
                                        variantId: v._id,
                                        name: `${product.name} – ${v.name}`,
                                      })
                                    }
                                  >
                                    {isAdminMode ? <Trash2 /> : <Lock />}
                                    {t("Delete…")}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {canSeeInventory && <RecentMovements productId={product._id} />}

      {isAdmin && (
        <>
          <ProductFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            product={product}
          />
          <AddVariantDialog
            open={addVariantOpen}
            onOpenChange={setAddVariantOpen}
            product={product}
          />
          <EditVariantDialog
            variant={editVariant}
            onClose={() => setEditVariant(null)}
          />
          <DeleteCatalogDialog
            target={deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onDeleted={() => {
              if (deleteTarget?.kind === "product")
                navigate("/products", { replace: true });
            }}
          />
          <AdminModeDialog open={adminPrompt} onOpenChange={setAdminPrompt} />
        </>
      )}
    </PageBody>
  );
}

function RecentMovements({ productId }: { productId: string }) {
  const { t } = useTranslation();
  const { formatDateTime, formatNumber } = useFormat();
  const data = useQuery(api.inventory.listMovements, {
    productId,
    pageSize: 10,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Recent stock movements")}</CardTitle>
        <CardDescription>
          {t("Restocks, shipments, returns and adjustments")}
        </CardDescription>
        {data && data.total > data.items.length && (
          <CardAction>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/inventory/movements?product=${productId}`}>
                {t("View all {{total}}", { total: formatNumber(data.total) })}
                <ArrowRight className="rtl:rotate-180" />
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {data === undefined ? (
          <TableSkeleton rows={3} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<Boxes />}
            title={t("No stock movements yet")}
            description={t("Restocks and order shipments show up here.")}
            className="border-0 p-6"
          />
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Date")}</TableHead>
                  <TableHead>{t("Type")}</TableHead>
                  <TableHead>{t("Variant")}</TableHead>
                  <TableHead className="text-end">{t("Qty")}</TableHead>
                  <TableHead>{t("Order")}</TableHead>
                  <TableHead>{t("By")}</TableHead>
                  <TableHead>{t("Details")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((m) => (
                  <TableRow key={m._id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(m.date)}
                    </TableCell>
                    <TableCell>
                      <MovementTypeBadge
                        type={m.type}
                        restockType={m.restockType}
                      />
                    </TableCell>
                    <TableCell>{m.variantName ?? "—"}</TableCell>
                    <TableCell className="text-end">
                      <QuantityChange value={m.quantityChange} />
                    </TableCell>
                    <TableCell>
                      <OrderLink
                        orderId={m.orderId}
                        orderNumber={m.orderNumber}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {m.userName}
                    </TableCell>
                    <TableCell
                      className="max-w-64 truncate text-muted-foreground"
                      title={movementDetails(m)}
                    >
                      {movementDetails(m) || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
