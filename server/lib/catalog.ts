import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client.ts";
import { inventory, productVariants, products } from "../db/schema.ts";
import type { InventoryRow, Product, ProductVariant } from "../db/schema.ts";
import { AppError } from "../rpc/procedure.ts";

export const zSku = z
  .string()
  .trim()
  .min(1, "SKU is required")
  .max(64, "SKU is too long");
export const zName = z.string().trim().min(1, "Name is required").max(200);
export const zAttributes = z
  .record(z.string().trim().min(1).max(50), z.string().trim().max(100))
  .refine((r) => Object.keys(r).length <= 20, "Up to 20 attributes")
  .optional();
export const zImageUrl = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((s) => (s ? s : undefined))
  .refine(
    (s) => !s || /^https?:\/\//i.test(s) || isUploadedPhoto(s),
    "Image URL must start with http:// or https://",
  );

/** Photos uploaded into the app are stored as /api/photos/<key>. */
export function isUploadedPhoto(url: string): boolean {
  return /^\/api\/photos\/[a-z0-9]{32}\.webp$/.test(url);
}

/** True when the SKU is taken by any product or variant (case-insensitive). */
export function skuTaken(
  db: DB,
  sku: string,
  except?: { productId?: string; variantId?: string },
): boolean {
  const key = sku.trim().toLowerCase();
  const p = db
    .select({ id: products._id })
    .from(products)
    .where(sql`lower(${products.sku}) = ${key}`)
    .get();
  if (p && p.id !== except?.productId) return true;
  const v = db
    .select({ id: productVariants._id })
    .from(productVariants)
    .where(sql`lower(${productVariants.sku}) = ${key}`)
    .get();
  return Boolean(v && v.id !== except?.variantId);
}

/** Automatic SKUs: products CIV-0001, CIV-0002…; their variants CIV-0001-01, CIV-0001-02… */
export const SKU_PREFIX = "CIV";
const PRODUCT_SKU_RE = new RegExp(`^${SKU_PREFIX}-(\\d+)$`, "i");

/**
 * Next product SKU: one above the highest CIV number in use, so a number only
 * comes back if the newest product was deleted (which needs it to have no activity).
 */
export function nextProductSku(
  db: DB,
  reserved: Set<string> = new Set(),
): string {
  let max = 0;
  for (const { sku } of db.select({ sku: products.sku }).from(products).all()) {
    const m = PRODUCT_SKU_RE.exec(sku);
    if (m) max = Math.max(max, Number(m[1]));
  }
  for (;;) {
    max += 1;
    const sku = `${SKU_PREFIX}-${String(max).padStart(4, "0")}`;
    if (!reserved.has(sku.toLowerCase()) && !skuTaken(db, sku)) return sku;
  }
}

/** Next variant SKU for a product: its SKU plus -01, -02… */
export function nextVariantSku(
  db: DB,
  productSku: string,
  reserved: Set<string> = new Set(),
): string {
  const re = new RegExp(
    `^${productSku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`,
    "i",
  );
  let max = 0;
  for (const { sku } of db
    .select({ sku: productVariants.sku })
    .from(productVariants)
    .all()) {
    const m = re.exec(sku);
    if (m) max = Math.max(max, Number(m[1]));
  }
  for (const sku of reserved) {
    const m = re.exec(sku);
    if (m) max = Math.max(max, Number(m[1]));
  }
  for (;;) {
    max += 1;
    const sku = `${productSku}-${String(max).padStart(2, "0")}`;
    if (!reserved.has(sku.toLowerCase()) && !skuTaken(db, sku)) return sku;
  }
}

export function assertSkuAvailable(
  db: DB,
  sku: string,
  except?: { productId?: string; variantId?: string },
): void {
  if (skuTaken(db, sku, except))
    throw new AppError("CONFLICT", `SKU "${sku.trim()}" is already used`);
}

export type CatalogSnapshot = {
  products: Product[];
  variantsByProduct: Map<string, ProductVariant[]>;
  /** Key: `${productId}:${variantId ?? ""}` */
  rows: Map<string, InventoryRow>;
};

export const stockKey = (
  productId: string,
  variantId: string | null | undefined,
) => `${productId}:${variantId ?? ""}`;

/** Whole catalog with stock in three queries. */
export function loadCatalog(db: DB): CatalogSnapshot {
  const allProducts = db.select().from(products).all();
  const variantsByProduct = new Map<string, ProductVariant[]>();
  for (const v of db.select().from(productVariants).all()) {
    const list = variantsByProduct.get(v.productId) ?? [];
    list.push(v);
    variantsByProduct.set(v.productId, list);
  }
  const rows = new Map<string, InventoryRow>();
  for (const r of db.select().from(inventory).all())
    rows.set(stockKey(r.productId, r.variantId), r);
  return { products: allProducts, variantsByProduct, rows };
}

/**
 * Stock lines a product actually sells from: its active variants, or the
 * product-level row when it has no variants.
 */
export function stockLines(
  product: Product,
  catalog: CatalogSnapshot,
  opts: { includeInactiveVariants?: boolean } = {},
): { variant: ProductVariant | undefined; row: InventoryRow | undefined }[] {
  if (!product.hasVariants)
    return [
      {
        variant: undefined,
        row: catalog.rows.get(stockKey(product._id, null)),
      },
    ];
  return (catalog.variantsByProduct.get(product._id) ?? [])
    .filter((v) => opts.includeInactiveVariants || v.isActive)
    .map((v) => ({
      variant: v,
      row: catalog.rows.get(stockKey(product._id, v._id)),
    }));
}

export type StockStatus = "out" | "low" | "ok";

export function stockStatus(onHand: number, threshold: number): StockStatus {
  if (onHand <= 0) return "out";
  if (onHand < threshold) return "low";
  return "ok";
}

/** Product + optional variant must exist and be active to be sold or restocked. */
export function loadSellable(
  db: DB,
  productId: string,
  variantId: string | null | undefined,
  opts: { requireActive?: boolean } = {},
): { product: Product; variant: ProductVariant | undefined } {
  const product = db
    .select()
    .from(products)
    .where(eq(products._id, productId))
    .get();
  if (!product) throw new AppError("NOT_FOUND", "Product not found");
  let variant: ProductVariant | undefined;
  if (product.hasVariants) {
    if (!variantId)
      throw new AppError("BAD_REQUEST", `Choose a variant of ${product.name}`);
    variant = db
      .select()
      .from(productVariants)
      .where(eq(productVariants._id, variantId))
      .get();
    if (!variant || variant.productId !== product._id) {
      throw new AppError(
        "BAD_REQUEST",
        `That variant doesn't belong to ${product.name}`,
      );
    }
  } else if (variantId) {
    throw new AppError("BAD_REQUEST", `${product.name} has no variants`);
  }
  if (opts.requireActive) {
    if (!product.isActive)
      throw new AppError("BAD_REQUEST", `${product.name} is inactive`);
    if (variant && !variant.isActive) {
      throw new AppError(
        "BAD_REQUEST",
        `${product.name} – ${variant.name} is inactive`,
      );
    }
  }
  return { product, variant };
}
