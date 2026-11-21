import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  inventory,
  inventoryMovements,
  orderLineItems,
  productVariants,
  products,
} from "../db/schema.ts";
import type { Product } from "../db/schema.ts";
import {
  AppError,
  mutation,
  noInput,
  query,
  zId,
  zMoney,
  zQty,
} from "../rpc/procedure.ts";
import {
  canSeeCost as userCanSeeCost,
  requireEdit,
  requireView,
} from "../lib/permissions.ts";
import { findBySku } from "./imports.ts";
import {
  assertSkuAvailable,
  isUploadedPhoto,
  nextProductSku,
  nextVariantSku,
  loadCatalog,
  stockKey,
  stockLines,
  stockStatus,
  zAttributes,
  zImageUrl,
  zName,
  zSku,
} from "../lib/catalog.ts";
import { getProduct, getVariant } from "../lib/items.ts";
import { syncLowStockAlert } from "../lib/notifications.ts";
import {
  blendCost,
  getInventoryRow,
  insertMovement,
  updateInventory,
} from "../lib/movements.ts";
import { SHOP_SECTIONS, round2 } from "../../shared/constants.ts";
import { AUDIENCES, PRODUCT_SEASONS } from "../../shared/shop-site.ts";
import type { Ctx } from "../rpc/procedure.ts";

const zThreshold = z
  .number()
  .int("Reorder threshold must be a whole number")
  .min(0, "Reorder threshold can't be negative");
// Categories aren't used any more; the column stays (empty) for old data
const zCategory = z.string().trim().max(100).optional().default("");
const zUom = z.string().trim().min(1, "Unit of measure is required").max(20);
/** Stock counted when the product is created, at its unit cost. */
const zOpening = z
  .object({
    quantity: zQty,
    unitCost: z
      .number({ error: "Enter the unit cost of the opening stock" })
      .finite()
      .min(0, "Unit cost can't be negative"),
  })
  .optional();

const zVariantInput = z.object({
  /** Left out: the next automatic SKU (product SKU + -01, -02…). */
  sku: zSku.optional(),
  name: zName,
  attributes: zAttributes,
  opening: zOpening,
});

const productFields = {
  name: zName,
  category: zCategory,
  unitPrice: zMoney,
  uom: zUom,
  imageUrl: zImageUrl,
  reorderThreshold: zThreshold,
  /** Order lines must say boys or girls. Left out: on for new products, unchanged on edit. */
  needsGender: z.boolean().optional(),
  /** Customer shop section; null hides it from the shop. Left out: unchanged on edit. */
  shopSection: z.enum(SHOP_SECTIONS).nullable().optional(),
  /** Most a customer can buy per website order (all sizes together); null = no limit. Left out: unchanged on edit. */
  maxPerOrder: z.number().int().min(1).max(99).nullable().optional(),
};

function mustGetProduct(ctx: Ctx, productId: string): Product {
  const product = getProduct(ctx.db, productId);
  if (!product) throw new AppError("NOT_FOUND", "Product not found");
  return product;
}

/** Users who can see stock value (products or inventory access). */
const canSeeCost = (ctx: Ctx) => userCanSeeCost(ctx.user);

function cleanAttributes(attributes: Record<string, string> | undefined) {
  if (!attributes) return null;
  const entries = Object.entries(attributes).filter(
    ([k, v]) => k.trim() && v.trim(),
  );
  return entries.length ? Object.fromEntries(entries) : null;
}

/** Puts a new item's counted stock in at its unit cost, as an "Opening stock" restock. */
function addOpeningStock(
  ctx: Ctx,
  productId: string,
  variantId: string | null,
  opening: { quantity: number; unitCost: number },
): void {
  const row = getInventoryRow(ctx.db, productId, variantId);
  const unitCost = round2(opening.unitCost);
  updateInventory(ctx.db, row._id, {
    onHand: row.onHand + opening.quantity,
    avgCost: blendCost(row.onHand, row.avgCost, opening.quantity, unitCost),
  });
  insertMovement(ctx.db, {
    productId,
    variantId,
    type: "restock",
    restockType: "opening",
    quantityChange: opening.quantity,
    date: ctx.now.toISOString(),
    userId: ctx.user._id,
    cost: unitCost,
    unitCost,
    notes: "Opening stock",
  });
  syncLowStockAlert(ctx.db, productId, variantId);
}

export const productsRouter = {
  list: query({
    input: z
      .object({
        activeFilter: z.enum(["all", "active", "inactive"]).optional(),
        lowStockOnly: z.boolean().optional(),
      })
      .optional()
      .default({}),
    handler: (ctx, args) => {
      // Orders access includes read-only catalog data for the order form
      requireView(ctx, "inventory", "orders");
      const catalog = loadCatalog(ctx.db);
      const showCost = canSeeCost(ctx);
      let result = catalog.products.map((product) => {
        // Everything in the warehouse counts, inactive sizes included;
        // low-stock status only looks at what's still being sold
        const lines = stockLines(product, catalog, {
          includeInactiveVariants: true,
        });
        const totalOnHand = lines.reduce(
          (sum, l) => sum + (l.row?.onHand ?? 0),
          0,
        );
        const sellingOnHand = lines
          .filter((l) => !l.variant || l.variant.isActive)
          .reduce((sum, l) => sum + (l.row?.onHand ?? 0), 0);
        const stockValue = lines.reduce(
          (sum, l) => sum + (l.row ? l.row.onHand * l.row.avgCost : 0),
          0,
        );
        const variants = catalog.variantsByProduct.get(product._id) ?? [];
        return {
          ...product,
          totalOnHand,
          stockValue: showCost ? stockValue : null,
          stockStatus: stockStatus(sellingOnHand, product.reorderThreshold),
          isLowStock:
            product.isActive && sellingOnHand < product.reorderThreshold,
          // Variant SKUs and names, so a variant search finds its product
          variantText: variants.map((v) => `${v.sku} ${v.name}`).join(" "),
          variantCount: variants.length,
          activeVariantCount: variants.filter((v) => v.isActive).length,
        };
      });
      const filter = args.activeFilter ?? "all";
      if (filter === "active") result = result.filter((p) => p.isActive);
      else if (filter === "inactive")
        result = result.filter((p) => !p.isActive);
      if (args.lowStockOnly) result = result.filter((p) => p.isLowStock);
      return result.sort((a, b) => a.name.localeCompare(b.name));
    },
  }),

  /** Every product and variant SKU, in SKU order, for the downloadable SKU list. */
  skuList: query({
    input: noInput,
    handler: (ctx) => {
      requireView(ctx, "inventory", "orders");
      const catalog = loadCatalog(ctx.db);
      const rows: {
        sku: string;
        product: string;
        variant: string | null;
        category: string;
        unitPrice: number;
        isActive: boolean;
      }[] = [];
      for (const product of catalog.products) {
        rows.push({
          sku: product.sku,
          product: product.name,
          variant: null,
          category: product.category,
          unitPrice: product.unitPrice,
          isActive: product.isActive,
        });
        for (const v of catalog.variantsByProduct.get(product._id) ?? []) {
          rows.push({
            sku: v.sku,
            product: product.name,
            variant: v.name,
            category: product.category,
            unitPrice: product.unitPrice,
            isActive: product.isActive && v.isActive,
          });
        }
      }
      return rows.sort((a, b) =>
        a.sku.localeCompare(b.sku, undefined, { numeric: true }),
      );
    },
  }),

  /**
   * Flat list of sellable items for pickers: one entry per active variant, or the
   * product itself when it has no variants. `includeInactive` is for stock tools.
   */
  listSellableItems: query({
    input: z
      .object({ includeInactive: z.boolean().optional() })
      .optional()
      .default({}),
    handler: (ctx, args) => {
      requireView(ctx, "inventory", "orders");
      const catalog = loadCatalog(ctx.db);
      const items = [];
      for (const product of catalog.products) {
        if (!product.isActive && !args.includeInactive) continue;
        for (const { variant, row } of stockLines(product, catalog, {
          includeInactiveVariants: args.includeInactive,
        })) {
          items.push({
            key: variant ? `${product._id}:${variant._id}` : product._id,
            productId: product._id,
            variantId: variant?._id ?? null,
            productName: product.name,
            variantName: variant?.name ?? null,
            label: variant ? `${product.name} – ${variant.name}` : product.name,
            sku: variant?.sku ?? product.sku,
            category: product.category,
            uom: product.uom,
            // A variant's own photo, else the product's
            imageUrl: variant?.imageUrl ?? product.imageUrl,
            unitPrice: product.unitPrice,
            onHand: row?.onHand ?? 0,
            reserved: row?.reserved ?? 0,
            // What a new order can still take: on hand minus what open orders hold
            available: row ? row.onHand - row.reserved : 0,
            avgCost: canSeeCost(ctx) ? (row?.avgCost ?? 0) : null,
            reorderThreshold: product.reorderThreshold,
            needsGender: product.needsGender,
            isActive: product.isActive && (variant?.isActive ?? true),
          });
        }
      }
      return items.sort((a, b) => a.label.localeCompare(b.label));
    },
  }),

  get: query({
    input: z.object({ productId: z.string() }),
    handler: (ctx, args) => {
      requireView(ctx, "inventory", "orders");
      // Null (not an error) so an open page shows "not found" after deletion
      const product = getProduct(ctx.db, args.productId);
      if (!product) return null;
      const variants = ctx.db
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, product._id))
        .all()
        .sort((a, b) => a._creationTime - b._creationTime);
      const rows = new Map(
        ctx.db
          .select()
          .from(inventory)
          .where(eq(inventory.productId, product._id))
          .all()
          .map((r) => [stockKey(r.productId, r.variantId), r]),
      );
      const showCost = canSeeCost(ctx);
      const variantsWithStock = variants.map((variant) => {
        const row = rows.get(stockKey(product._id, variant._id));
        const onHand = row?.onHand ?? 0;
        return {
          ...variant,
          onHand,
          notSellable: row?.notSellable ?? 0,
          avgCost: showCost ? (row?.avgCost ?? 0) : null,
          stockStatus: stockStatus(onHand, product.reorderThreshold),
          // Inactive variants never show as low stock
          isLowStock:
            product.isActive &&
            variant.isActive &&
            onHand < product.reorderThreshold,
        };
      });
      const baseRow = rows.get(stockKey(product._id, null));
      // Inactive sizes still count in the product's stock; status only uses active ones
      const totalOnHand = product.hasVariants
        ? variantsWithStock.reduce((sum, v) => sum + v.onHand, 0)
        : (baseRow?.onHand ?? 0);
      const sellingOnHand = product.hasVariants
        ? variantsWithStock
            .filter((v) => v.isActive)
            .reduce((sum, v) => sum + v.onHand, 0)
        : totalOnHand;
      return {
        ...product,
        variants: variantsWithStock,
        onHand: product.hasVariants ? 0 : (baseRow?.onHand ?? 0),
        notSellable: product.hasVariants ? 0 : (baseRow?.notSellable ?? 0),
        avgCost:
          showCost && !product.hasVariants ? (baseRow?.avgCost ?? 0) : null,
        totalOnHand,
        stockStatus: stockStatus(sellingOnHand, product.reorderThreshold),
        isLowStock:
          product.isActive && sellingOnHand < product.reorderThreshold,
        canSeeCost: showCost,
      };
    },
  }),

  create: mutation({
    input: z.object({
      /** Left out (the normal case): the next automatic SKU, CIV-0001, CIV-0002… */
      sku: zSku.optional(),
      ...productFields,
      /** Opening stock for a product without variants (variants carry their own). */
      opening: zOpening,
      variants: z.array(zVariantInput).max(200).optional(),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      const sku = args.sku ?? nextProductSku(ctx.db);
      if (args.sku) assertSkuAvailable(ctx.db, args.sku);
      const seen = new Set<string>([sku.toLowerCase()]);
      const variants = (args.variants ?? []).map((v) => {
        const vSku = v.sku ?? nextVariantSku(ctx.db, sku, seen);
        if (seen.has(vSku.toLowerCase()))
          throw new AppError(
            "CONFLICT",
            `SKU "${vSku}" is used more than once`,
          );
        seen.add(vSku.toLowerCase());
        if (v.sku) assertSkuAvailable(ctx.db, v.sku);
        return { ...v, sku: vSku };
      });
      const product = ctx.db
        .insert(products)
        .values({
          sku,
          name: args.name,
          category: args.category,
          unitPrice: args.unitPrice,
          uom: args.uom,
          imageUrl: args.imageUrl ?? null,
          reorderThreshold: args.reorderThreshold,
          needsGender: args.needsGender ?? true,
          shopSection: args.shopSection ?? null,
          maxPerOrder: args.maxPerOrder ?? null,
          hasVariants: variants.length > 0,
        })
        .returning()
        .get();
      if (variants.length) {
        for (const v of variants) {
          const variant = ctx.db
            .insert(productVariants)
            .values({
              productId: product._id,
              sku: v.sku,
              name: v.name,
              attributes: cleanAttributes(v.attributes),
            })
            .returning()
            .get();
          ctx.db
            .insert(inventory)
            .values({ productId: product._id, variantId: variant._id })
            .run();
          if (v.opening)
            addOpeningStock(ctx, product._id, variant._id, v.opening);
        }
      } else {
        ctx.db
          .insert(inventory)
          .values({ productId: product._id, variantId: null })
          .run();
        if (args.opening) addOpeningStock(ctx, product._id, null, args.opening);
      }
      return product._id;
    },
  }),

  update: mutation({
    input: z.object({ productId: zId, ...productFields }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      const product = mustGetProduct(ctx, args.productId);
      ctx.db
        .update(products)
        .set({
          name: args.name,
          category: args.category,
          unitPrice: args.unitPrice,
          uom: args.uom,
          imageUrl: args.imageUrl ?? null,
          reorderThreshold: args.reorderThreshold,
          ...(args.needsGender === undefined
            ? {}
            : { needsGender: args.needsGender }),
          ...(args.shopSection === undefined
            ? {}
            : { shopSection: args.shopSection }),
          ...(args.maxPerOrder === undefined
            ? {}
            : { maxPerOrder: args.maxPerOrder }),
        })
        .where(eq(products._id, product._id))
        .run();
      // Threshold changes can start or clear a low-stock alert
      for (const row of ctx.db
        .select()
        .from(inventory)
        .where(eq(inventory.productId, product._id))
        .all()) {
        syncLowStockAlert(ctx.db, product._id, row.variantId);
      }
      return null;
    },
  }),

  /** Puts many products in a shop section at once (null: hide them from the shop). */
  setShopSection: mutation({
    input: z.object({
      productIds: z.array(zId).min(1, "Choose at least one product").max(1000),
      section: z.enum(SHOP_SECTIONS).nullable(),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      const ids = [...new Set(args.productIds)];
      for (const id of ids) mustGetProduct(ctx, id);
      ctx.db
        .update(products)
        .set({ shopSection: args.section })
        .where(inArray(products._id, ids))
        .run();
      return ids.length;
    },
  }),

  /** Who a product is for (boys, girls or both): the website's "Picked for your boy / girl / twins". */
  setAudience: mutation({
    input: z.object({
      productIds: z.array(zId).min(1, "Choose at least one product").max(1000),
      audience: z.enum(AUDIENCES),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      const ids = [...new Set(args.productIds)];
      for (const id of ids) mustGetProduct(ctx, id);
      ctx.db.update(products).set({ audience: args.audience }).where(inArray(products._id, ids)).run();
      return ids.length;
    },
  }),

  /** The website's season switch moves off-season products to the end. */
  setSeason: mutation({
    input: z.object({
      productIds: z.array(zId).min(1, "Choose at least one product").max(1000),
      season: z.enum(PRODUCT_SEASONS),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      const ids = [...new Set(args.productIds)];
      for (const id of ids) mustGetProduct(ctx, id);
      ctx.db.update(products).set({ season: args.season }).where(inArray(products._id, ids)).run();
      return ids.length;
    },
  }),

  setActive: mutation({
    input: z.object({ productId: zId, isActive: z.boolean() }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      const product = mustGetProduct(ctx, args.productId);
      ctx.db
        .update(products)
        .set({ isActive: args.isActive })
        .where(eq(products._id, product._id))
        .run();
      for (const row of ctx.db
        .select()
        .from(inventory)
        .where(eq(inventory.productId, product._id))
        .all()) {
        syncLowStockAlert(ctx.db, product._id, row.variantId);
      }
      return null;
    },
  }),

  addVariant: mutation({
    input: z.object({
      productId: zId,
      /** Left out (the normal case): the product's SKU plus the next -01, -02… */
      sku: zSku.optional(),
      name: zName,
      attributes: zAttributes,
      /** Photo for the new variant (uploaded with the form). */
      imageUrl: zImageUrl,
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      const product = mustGetProduct(ctx, args.productId);
      if (args.sku) assertSkuAvailable(ctx.db, args.sku);
      const variant = ctx.db
        .insert(productVariants)
        .values({
          productId: product._id,
          sku: args.sku ?? nextVariantSku(ctx.db, product.sku),
          imageUrl: args.imageUrl ?? null,
          name: args.name,
          attributes: cleanAttributes(args.attributes),
        })
        .returning()
        .get();

      if (product.hasVariants) {
        ctx.db
          .insert(inventory)
          .values({ productId: product._id, variantId: variant._id })
          .run();
        return variant._id;
      }
      // First variant on a simple product: its stock, cost, line items and
      // movements move onto the new variant.
      const moved = ctx.db
        .update(inventory)
        .set({ variantId: variant._id })
        .where(
          and(
            eq(inventory.productId, product._id),
            isNull(inventory.variantId),
          ),
        )
        .run();
      if (moved.changes === 0) {
        ctx.db
          .insert(inventory)
          .values({ productId: product._id, variantId: variant._id })
          .run();
      }
      ctx.db
        .update(orderLineItems)
        .set({ variantId: variant._id, variantName: variant.name })
        .where(
          and(
            eq(orderLineItems.productId, product._id),
            isNull(orderLineItems.variantId),
          ),
        )
        .run();
      ctx.db
        .update(inventoryMovements)
        .set({ variantId: variant._id })
        .where(
          and(
            eq(inventoryMovements.productId, product._id),
            isNull(inventoryMovements.variantId),
          ),
        )
        .run();
      ctx.db
        .update(products)
        .set({ hasVariants: true })
        .where(eq(products._id, product._id))
        .run();
      return variant._id;
    },
  }),

  /**
   * Sets or clears the photo of a product (variantId omitted) or one variant.
   * Variants without their own photo show the product's.
   */
  setPhoto: mutation({
    input: z.object({
      productId: zId,
      variantId: zId.nullish(),
      imageUrl: z
        .string()
        .trim()
        .max(2000)
        .nullable()
        .refine(
          (s) => s === null || /^https?:\/\//i.test(s) || isUploadedPhoto(s),
          "Image URL must start with http:// or https://",
        ),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      const product = mustGetProduct(ctx, args.productId);
      const imageUrl = args.imageUrl || null;
      if (args.variantId) {
        const variant = getVariant(ctx.db, args.variantId);
        if (!variant || variant.productId !== product._id)
          throw new AppError("NOT_FOUND", "Variant not found");
        ctx.db
          .update(productVariants)
          .set({ imageUrl })
          .where(eq(productVariants._id, variant._id))
          .run();
      } else {
        ctx.db
          .update(products)
          .set({ imageUrl })
          .where(eq(products._id, product._id))
          .run();
      }
      return null;
    },
  }),

  /**
   * Matches photo file names to SKUs for a bulk upload ("TEE-RED.jpg" → the
   * variant or product with SKU TEE-RED). Unknown names come back unmatched.
   */
  matchPhotoSkus: query({
    input: z.object({
      skus: z.array(z.string().trim().min(1).max(200)).min(1).max(500),
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      return args.skus.map((sku) => {
        const match = findBySku(ctx, sku);
        if (!match) return { sku, match: null };
        return {
          sku,
          match: {
            productId: match.product._id,
            variantId: match.variant?._id ?? null,
            label: match.variant
              ? `${match.product.name} – ${match.variant.name}`
              : match.product.name,
            hasPhoto: Boolean(
              match.variant ? match.variant.imageUrl : match.product.imageUrl,
            ),
          },
        };
      });
    },
  }),

  /** Edits a variant. Orders/movements reference the id, so they show the new name. */
  updateVariant: mutation({
    input: z.object({
      variantId: zId,
      /** SKUs are assigned automatically; left out keeps the current one. */
      sku: zSku.optional(),
      name: zName,
      attributes: zAttributes,
    }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      const variant = getVariant(ctx.db, args.variantId);
      if (!variant) throw new AppError("NOT_FOUND", "Variant not found");
      const sku = args.sku ?? variant.sku;
      if (args.sku)
        assertSkuAvailable(ctx.db, args.sku, { variantId: variant._id });
      ctx.db
        .update(productVariants)
        .set({
          sku,
          name: args.name,
          attributes: cleanAttributes(args.attributes),
        })
        .where(eq(productVariants._id, variant._id))
        .run();
      return null;
    },
  }),

  setVariantActive: mutation({
    input: z.object({ variantId: zId, isActive: z.boolean() }),
    handler: (ctx, args) => {
      requireEdit(ctx, "inventory");
      const variant = getVariant(ctx.db, args.variantId);
      if (!variant) throw new AppError("NOT_FOUND", "Variant not found");
      ctx.db
        .update(productVariants)
        .set({ isActive: args.isActive })
        .where(eq(productVariants._id, variant._id))
        .run();
      syncLowStockAlert(ctx.db, variant.productId, variant._id);
      return null;
    },
  }),
};
