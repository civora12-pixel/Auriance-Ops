import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { inventory, productVariants, products } from "../db/schema.ts";
import type { Product, ProductVariant } from "../db/schema.ts";
import { AppError, mutation } from "../rpc/procedure.ts";
import type { Ctx } from "../rpc/procedure.ts";
import { requireEdit } from "../lib/permissions.ts";
import {
  isUploadedPhoto,
  nextProductSku,
  nextVariantSku,
  skuTaken,
} from "../lib/catalog.ts";
import {
  blendCost,
  getInventoryRow,
  insertMovement,
  updateInventory,
} from "../lib/movements.ts";
import { requireKnownCost } from "./inventory.ts";
import { releaseHeldOrders } from "./orders.ts";
import { syncLowStockAlert } from "../lib/notifications.ts";
import { eventInstant } from "../lib/time.ts";
import { RESTOCK_TYPES, round2 } from "../../shared/constants.ts";

/** Rows per request; the client sends larger files in batches. */
const MAX_ROWS = 1000;

// Rows are validated one by one so a bad row is reported, not fatal to the file
const zRow = z.number().int().min(1);
const zCell = z.string().max(2000).optional();
const zNum = z.number().nullish();

const errorMessage = (e: unknown) =>
  e instanceof AppError
    ? e.message
    : e instanceof Error
      ? e.message
      : String(e);
const lower = (s: string) => s.trim().toLowerCase();

export function findBySku(
  ctx: Ctx,
  sku: string,
): { product: Product; variant?: ProductVariant } | undefined {
  const key = lower(sku);
  // Variant SKU first, so a variant can be restocked by its own SKU
  const variant = ctx.db
    .select()
    .from(productVariants)
    .where(sql`lower(${productVariants.sku}) = ${key}`)
    .get();
  if (variant) {
    const product = ctx.db
      .select()
      .from(products)
      .where(eq(products._id, variant.productId))
      .get();
    return product ? { product, variant } : undefined;
  }
  const product = ctx.db
    .select()
    .from(products)
    .where(sql`lower(${products.sku}) = ${key}`)
    .get();
  return product ? { product } : undefined;
}

export const importsRouter = {
  /**
   * Restock from a CSV. Each row names an item by SKU (product or variant SKU),
   * optionally with a variant SKU or name. Valid rows are applied; the others are
   * returned as errors with their CSV row number.
   */
  bulkRestock: mutation({
    input: z.object({
      lines: z
        .array(
          z.object({
            row: zRow,
            sku: z.string().max(200),
            variantSku: zCell,
            variantName: zCell,
            restockType: z.enum(RESTOCK_TYPES).optional(),
            quantity: zNum,
            cost: zNum,
            supplier: zCell,
            date: zCell,
            notes: zCell,
          }),
        )
        .min(1, "The file has no rows")
        .max(MAX_ROWS),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      const errors: string[] = [];
      let imported = 0;
      let units = 0;
      for (const line of args.lines) {
        const fail = (message: string) =>
          errors.push(`Row ${line.row}: ${message}`);
        const sku = line.sku.trim();
        if (!sku) {
          fail("SKU is required");
          continue;
        }
        const quantity = line.quantity;
        if (
          quantity === null ||
          quantity === undefined ||
          !Number.isInteger(quantity) ||
          quantity <= 0
        ) {
          fail("Quantity must be a whole number greater than zero");
          continue;
        }
        if (
          line.cost !== null &&
          line.cost !== undefined &&
          (!Number.isFinite(line.cost) || line.cost < 0)
        ) {
          fail("Unit cost can't be negative");
          continue;
        }
        const match = findBySku(ctx, sku);
        if (!match) {
          fail(`No product or variant with SKU "${sku}"`);
          continue;
        }
        let { variant } = match;
        const { product } = match;
        const variantSku = line.variantSku?.trim();
        const variantName = line.variantName?.trim();
        if (!variant && product.hasVariants) {
          const variants = ctx.db
            .select()
            .from(productVariants)
            .where(eq(productVariants.productId, product._id))
            .all();
          variant = variantSku
            ? variants.find((v) => lower(v.sku) === lower(variantSku))
            : variantName
              ? variants.find((v) => lower(v.name) === lower(variantName))
              : undefined;
          if (!variant) {
            fail(
              variantSku || variantName
                ? `Variant "${variantSku || variantName}" not found for SKU "${sku}"`
                : `${product.name} has variants. Use the variant SKU or add a variant column`,
            );
            continue;
          }
        } else if (!variant && (variantSku || variantName)) {
          fail(`${product.name} has no variants`);
          continue;
        }

        try {
          const date = eventInstant(ctx, line.date?.trim() || undefined);
          const row = getInventoryRow(ctx.db, product._id, variant?._id);
          const unitCost = line.cost ?? requireKnownCost(row.avgCost);
          updateInventory(ctx.db, row._id, {
            onHand: row.onHand + quantity,
            avgCost: blendCost(row.onHand, row.avgCost, quantity, unitCost),
          });
          insertMovement(ctx.db, {
            productId: product._id,
            variantId: variant?._id ?? null,
            type: "restock",
            restockType: line.restockType ?? "purchase",
            quantityChange: quantity,
            date,
            userId: ctx.user._id,
            supplier: line.supplier?.trim() || null,
            cost: line.cost ?? null,
            notes: line.notes?.trim() || null,
            unitCost,
          });
          syncLowStockAlert(ctx.db, product._id, variant?._id);
          imported++;
          units += quantity;
        } catch (e) {
          fail(errorMessage(e));
        }
      }
      if (imported) releaseHeldOrders(ctx);
      return { imported, units, errors };
    },
  }),

  /**
   * Creates products from a CSV. Rows sharing a SKU (or, when the SKU is blank,
   * the same product name) become one product with a variant per row; product
   * details come from the first row of the group. Blank SKUs get the next
   * automatic ones (CIV-0001, variants CIV-0001-01…).
   */
  bulkProductImport: mutation({
    input: z.object({
      products: z
        .array(
          z.object({
            row: zRow,
            sku: z.string().max(200).optional().default(""),
            name: z.string().max(500),
            // Ignored: categories aren't used any more
            category: z.string().max(500).optional().default(""),
            unitPrice: zNum,
            uom: z.string().max(100),
            reorderThreshold: zNum,
            imageUrl: zCell,
            variantName: zCell,
            variantSku: zCell,
          }),
        )
        .min(1, "The file has no rows")
        .max(MAX_ROWS),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      const errors: string[] = [];
      const warnings: string[] = [];
      type Row = (typeof args.products)[number];
      const groups = new Map<string, Row[]>();

      for (const raw of args.products) {
        const row = {
          ...raw,
          sku: raw.sku.trim(),
          name: raw.name.trim(),
          category: "",
          uom: raw.uom.trim(),
          variantName: raw.variantName?.trim() || undefined,
          variantSku: raw.variantSku?.trim() || undefined,
          imageUrl: raw.imageUrl?.trim() || undefined,
        };
        const fail = (message: string) =>
          errors.push(`Row ${row.row}: ${message}`);
        if (!row.name || !row.uom) {
          fail("Missing a required value (name, uom)");
          continue;
        }
        if (
          row.unitPrice === null ||
          row.unitPrice === undefined ||
          !Number.isFinite(row.unitPrice) ||
          row.unitPrice < 0
        ) {
          fail("Unit price must be a number, 0 or more");
          continue;
        }
        const threshold = row.reorderThreshold ?? 0;
        if (!Number.isInteger(threshold) || threshold < 0) {
          fail("Reorder threshold must be a whole number, 0 or more");
          continue;
        }
        if (row.variantSku && !row.variantName) {
          fail("A variant_sku needs a variant_name");
          continue;
        }
        if (
          row.imageUrl &&
          !/^https?:\/\//i.test(row.imageUrl) &&
          !isUploadedPhoto(row.imageUrl)
        ) {
          fail("Image URL must start with http:// or https://");
          continue;
        }
        const key = row.sku ? lower(row.sku) : `name:${lower(row.name)}`;
        groups.set(key, [
          ...(groups.get(key) ?? []),
          { ...row, reorderThreshold: threshold },
        ]);
      }

      // Product and variant SKUs share one namespace, in the file and in the catalog
      const fileSkus = new Set<string>();
      let imported = 0;
      let variantCount = 0;
      for (const group of groups.values()) {
        const first = group[0];
        const rowList = group.map((g) => g.row).join(", ");
        const label = group.length > 1 ? `Rows ${rowList}` : `Row ${rowList}`;
        if (
          first.sku &&
          (skuTaken(ctx.db, first.sku) || fileSkus.has(lower(first.sku)))
        ) {
          errors.push(`${label}: SKU "${first.sku}" already exists`);
          continue;
        }
        const productLabel = first.sku || first.name;
        const variantRows = group.filter((g) => g.variantName);
        const hasVariants = variantRows.length > 0;
        if (hasVariants && variantRows.length !== group.length) {
          errors.push(
            `${label}: "${productLabel}" is on several rows, so every row needs a variant_name`,
          );
          continue;
        }
        if (!hasVariants && group.length > 1) {
          errors.push(
            `${label}: "${productLabel}" appears more than once. Add a variant_name to import variants`,
          );
          continue;
        }
        const groupErrors: string[] = [];
        const groupSkus = new Set<string>(first.sku ? [lower(first.sku)] : []);
        for (const g of variantRows) {
          if (!g.variantSku) continue;
          const key = lower(g.variantSku);
          if (
            groupSkus.has(key) ||
            fileSkus.has(key) ||
            skuTaken(ctx.db, g.variantSku)
          ) {
            groupErrors.push(
              `Row ${g.row}: SKU "${g.variantSku}" is already used`,
            );
          }
          groupSkus.add(key);
        }
        if (groupErrors.length) {
          errors.push(...groupErrors);
          continue;
        }
        for (const g of group.slice(1)) {
          const differs =
            g.name !== first.name ||
            g.uom !== first.uom ||
            round2(g.unitPrice!) !== round2(first.unitPrice!) ||
            g.reorderThreshold !== first.reorderThreshold;
          if (differs) {
            warnings.push(
              `Row ${g.row}: product details differ from row ${first.row}; row ${first.row} was used`,
            );
          }
        }
        for (const key of groupSkus) fileSkus.add(key);

        const productSku = first.sku || nextProductSku(ctx.db, fileSkus);
        fileSkus.add(lower(productSku));
        const product = ctx.db
          .insert(products)
          .values({
            sku: productSku,
            name: first.name,
            category: first.category,
            unitPrice: round2(first.unitPrice!),
            uom: first.uom,
            imageUrl: first.imageUrl ?? null,
            reorderThreshold: first.reorderThreshold!,
            hasVariants,
          })
          .returning()
          .get();
        if (hasVariants) {
          for (const g of variantRows) {
            const variant = ctx.db
              .insert(productVariants)
              .values({
                productId: product._id,
                sku:
                  g.variantSku || nextVariantSku(ctx.db, productSku, fileSkus),
                name: g.variantName!,
              })
              .returning()
              .get();
            ctx.db
              .insert(inventory)
              .values({ productId: product._id, variantId: variant._id })
              .run();
            variantCount++;
          }
        } else {
          ctx.db
            .insert(inventory)
            .values({ productId: product._id, variantId: null })
            .run();
        }
        imported++;
      }
      return { imported, variants: variantCount, errors, warnings };
    },
  }),
};
