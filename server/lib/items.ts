import { eq, inArray } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { productVariants, products, users } from "../db/schema.ts";
import type { Product, ProductVariant, User } from "../db/schema.ts";

export type ItemNames = { productName: string; productSku: string; variantName: string | null };

/** Copy of product/variant names saved on a line item so history survives deletion. */
export function lineItemSnapshot(product: Product | undefined, variant: ProductVariant | undefined): ItemNames {
  return {
    productName: product?.name ?? "Unknown product",
    productSku: product?.sku ?? "",
    variantName: variant?.name ?? null,
  };
}

/** Live names when the product/variant still exists, otherwise the saved copy. */
export function resolveItemNames(
  product: Product | undefined,
  variant: ProductVariant | undefined,
  saved: Partial<ItemNames> | null | undefined,
): ItemNames {
  return {
    productName: product?.name ?? saved?.productName ?? "Unknown product",
    productSku: product?.sku ?? saved?.productSku ?? "",
    variantName: variant?.name ?? saved?.variantName ?? null,
  };
}

export function itemLabel(names: { productName: string; variantName?: string | null }): string {
  return names.variantName ? `${names.productName} – ${names.variantName}` : names.productName;
}

/** Loads products, variants and users by id in three queries (instead of one per row). */
export function lookupMaps(
  db: DB,
  ids: { productIds?: Iterable<string>; variantIds?: Iterable<string | null>; userIds?: Iterable<string> },
) {
  const uniq = <T>(it: Iterable<T | null> | undefined) =>
    [...new Set([...(it ?? [])].filter((x): x is T => x !== null && x !== undefined))];
  const productIds = uniq(ids.productIds);
  const variantIds = uniq(ids.variantIds);
  const userIds = uniq(ids.userIds);
  const productMap = new Map<string, Product>(
    productIds.length
      ? db.select().from(products).where(inArray(products._id, productIds)).all().map((p) => [p._id, p])
      : [],
  );
  const variantMap = new Map<string, ProductVariant>(
    variantIds.length
      ? db
          .select()
          .from(productVariants)
          .where(inArray(productVariants._id, variantIds))
          .all()
          .map((v) => [v._id, v])
      : [],
  );
  const userMap = new Map<string, User>(
    userIds.length ? db.select().from(users).where(inArray(users._id, userIds)).all().map((u) => [u._id, u]) : [],
  );
  return { productMap, variantMap, userMap };
}

export function userName(user: Pick<User, "name" | "email"> | undefined): string {
  return user?.name || user?.email || "Unknown user";
}

export function getProduct(db: DB, id: string): Product | undefined {
  return db.select().from(products).where(eq(products._id, id)).get();
}

export function getVariant(db: DB, id: string): ProductVariant | undefined {
  return db.select().from(productVariants).where(eq(productVariants._id, id)).get();
}
