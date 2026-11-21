import { parseChildren, parseKind } from "../../shared/little-ones.ts";
import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client.ts";
import { customers, orderLineItems, orders, products } from "../db/schema.ts";
import type { Customer } from "../db/schema.ts";
import { loadCatalog, stockLines } from "../lib/catalog.ts";
import { requireAdmin, requireEdit, requireView } from "../lib/permissions.ts";
import { getSetting, setSetting } from "../lib/settings.ts";
import { AppError, mutation, noInput, query, zId, zMoney } from "../rpc/procedure.ts";
import { createCustomerToken, customerLinkPath } from "../shop/session.ts";
import { KIDS_SECTIONS, isShopSection } from "../../shared/constants.ts";
import { isEgyptianMobile, isEgyptianPhone, normalizePhone } from "../../shared/phone.ts";
import { matchesSearch } from "../../shared/search.ts";
import { DEFAULT_SITE, MAX_CHECKOUT_EXTRAS, SEASONS, handleOf, isOffSeason, messengerName } from "../../shared/shop-site.ts";
import type { SiteSettings } from "../../shared/shop-site.ts";

/** Most of one size a customer can put in the cart. */
export const MAX_PER_LINE = 10;

/**
 * The customer shop's catalog: active products in a shop section that have
 * something to sell right now. Only what a shopper may see: names, prices,
 * photos and whether a size is in stock, never costs or stock counts.
 */
export function shopCatalog(db: DB) {
  const catalog = loadCatalog(db);
  const site = siteSettings(db);
  const result = [];
  for (const product of catalog.products) {
    if (!product.isActive || !isShopSection(product.shopSection)) continue;
    const options = stockLines(product, catalog).map(({ variant, row }) => {
      const available = row ? Math.max(0, row.onHand - row.reserved) : 0;
      return {
        variantId: variant?._id ?? null,
        name: variant?.name ?? null,
        imageUrl: variant?.imageUrl ?? product.imageUrl ?? null,
        maxQuantity: Math.min(available, MAX_PER_LINE),
      };
    });
    // Sold out: hidden, or shown as sold out (Website controls)
    const soldOut = !options.some((o) => o.maxQuantity > 0);
    if (soldOut && site.hideSoldOut) continue;
    result.push({
      productId: product._id,
      name: product.name,
      section: product.shopSection,
      price: product.unitPrice,
      imageUrl: product.imageUrl ?? options.find((o) => o.imageUrl)?.imageUrl ?? null,
      hasSizes: product.hasVariants,
      // The customer chooses boys or girls (packing colors the size by it)
      needsGender: product.needsGender,
      // Most one order can take, all sizes together (null = only stock limits it)
      maxPerOrder: product.maxPerOrder,
      options,
      soldOut,
      season: product.season,
      audience: product.audience,
      // Out of season now: listed after the rest and never suggested
      offSeason: isOffSeason(product.season, site.season),
      createdAt: product._creationTime,
    });
  }
  // In season and in stock first, then newest first
  const rank = (p: { soldOut: boolean; offSeason: boolean }) => (p.soldOut ? 2 : p.offSeason ? 1 : 0);
  return result.sort((a, b) => rank(a) - rank(b) || b.createdAt - a.createdAt);
}

export type ShopCatalog = ReturnType<typeof shopCatalog>;

const OPEN_KEY = "shop_open";
const SITE_KEY = "shop_site";
const WHATSAPP_KEY = "shop_whatsapp";
const SHIPPING_KEY = "shop_shipping_fee";

/**
 * Whether the public can use the shop, the business WhatsApp number customers
 * message, and the shipping fee website orders start with (moderators can
 * change it per order when they confirm).
 */
export function shopSettings(db: DB): { open: boolean; whatsapp: string | null; shippingFee: number } {
  const fee = Number(getSetting(db, SHIPPING_KEY) ?? 0);
  return {
    open: getSetting(db, OPEN_KEY) === "1",
    whatsapp: getSetting(db, WHATSAPP_KEY) || null,
    shippingFee: Number.isFinite(fee) && fee >= 0 ? fee : 0,
  };
}

/** The website's switches (Website controls), with defaults for anything not set. */
export function siteSettings(db: DB): SiteSettings {
  let saved: Partial<SiteSettings> = {};
  try {
    saved = JSON.parse(getSetting(db, SITE_KEY) ?? "{}") as Partial<SiteSettings>;
  } catch {
    saved = {};
  }
  return {
    ...DEFAULT_SITE,
    ...saved,
    season: SEASONS.includes(saved.season as never) ? saved.season! : "all",
    checkoutExtras: Array.isArray(saved.checkoutExtras) ? saved.checkoutExtras.slice(0, MAX_CHECKOUT_EXTRAS) : [],
  };
}

/**
 * What the checkout offers as a small extra: the products chosen in Website
 * controls, or else the cheapest kids accessories; only in stock and in season.
 */
export function checkoutExtras(catalog: ShopCatalog, site: SiteSettings) {
  const ok = catalog.filter((p) => !p.soldOut && !p.offSeason);
  const chosen = site.checkoutExtras.map((id) => ok.find((p) => p.productId === id)).filter((p) => !!p);
  if (chosen.length) return chosen.map((p) => p.productId);
  return ok
    .filter((p) => p.section === "kids_accessories")
    .sort((a, b) => a.price - b.price)
    .slice(0, MAX_CHECKOUT_EXTRAS)
    .map((p) => p.productId);
}

/** Baby sizes a customer account bought, with the order day (age suggestions). */
export function purchasedSizes(db: DB, customerId: string): { size: string; day: string }[] {
  const rows = db
    .select({ day: orders.orderDate, size: orderLineItems.variantName, productId: orderLineItems.productId })
    .from(orders)
    .innerJoin(orderLineItems, eq(orderLineItems.orderId, orders._id))
    .where(and(eq(orders.customerAccountId, customerId), ne(orders.status, "cancelled")))
    .all();
  if (!rows.length) return [];
  const kids = new Set(
    db
      .select({ id: products._id, section: products.shopSection })
      .from(products)
      .all()
      .filter((p) => p.section && KIDS_SECTIONS.includes(p.section))
      .map((p) => p.id),
  );
  return rows
    .filter((r): r is typeof r & { size: string } => !!r.size && kids.has(r.productId))
    .map((r) => ({ size: r.size, day: r.day }));
}

/** What a signed-in customer sees about themselves. */
export function publicCustomer(c: Customer) {
  return {
    _id: c._id,
    name: c.name,
    phone: c.phone,
    phone2: c.phone2,
    email: c.email,
    emailVerified: !!c.emailVerifiedAt,
    governorate: c.governorate,
    city: c.city,
    address: c.address,
    babyAgeMonths: c.babyAgeMonths,
    babyAgeDay: c.babyAgeDay,
    children: parseChildren(c.children),
    shoppingFor: parseKind(c.shoppingFor),
  };
}

/** Team side: shop settings. */
export const shopRouter = {
  settings: query({
    input: noInput,
    handler: (ctx) => shopSettings(ctx.db),
  }),

  updateSettings: mutation({
    input: z.object({
      open: z.boolean(),
      whatsapp: z.string().trim().max(30),
      shippingFee: zMoney.optional(),
    }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      const phone = args.whatsapp ? normalizePhone(args.whatsapp) : "";
      if (phone && !isEgyptianMobile(phone)) {
        throw new AppError("BAD_REQUEST", "Enter an Egyptian mobile number, like 01012345678");
      }
      setSetting(ctx.db, OPEN_KEY, args.open ? "1" : "0");
      setSetting(ctx.db, WHATSAPP_KEY, phone);
      if (args.shippingFee !== undefined) setSetting(ctx.db, SHIPPING_KEY, String(args.shippingFee));
      return null;
    },
  }),

  /** The website's switches: maintenance, paused orders or sign-ups, the season, and more. */
  site: query({
    input: noInput,
    handler: (ctx) => {
      requireAdmin(ctx);
      return siteSettings(ctx.db);
    },
  }),

  updateSite: mutation({
    input: z.object({
      maintenance: z.boolean(),
      ordersPaused: z.boolean(),
      signupsPaused: z.boolean(),
      hideSoldOut: z.boolean(),
      announcement: z.string().trim().max(200, "Keep the announcement under 200 characters"),
      season: z.enum(SEASONS),
      messenger: z.string().trim().max(200),
      checkoutExtras: z.array(zId).max(MAX_CHECKOUT_EXTRAS, "Choose up to 3 extras"),
      facebook: z.string().trim().max(200),
      instagram: z.string().trim().max(200),
      tiktok: z.string().trim().max(200),
      phone: z.string().trim().max(30),
      email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email")]),
    }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      const messenger = messengerName(args.messenger);
      if (messenger === null) {
        throw new AppError("BAD_REQUEST", "Enter the Facebook page's name or link, like m.me/auriance");
      }
      const extras = [...new Set(args.checkoutExtras)];
      if (extras.length && ctx.db.select().from(products).where(inArray(products._id, extras)).all().length !== extras.length) {
        throw new AppError("NOT_FOUND", "Product not found");
      }
      const handles = {
        facebook: handleOf(args.facebook, "facebook"),
        instagram: handleOf(args.instagram, "instagram"),
        tiktok: handleOf(args.tiktok, "tiktok"),
      };
      if (handles.facebook === null) throw new AppError("BAD_REQUEST", "Enter the Facebook username or page link");
      if (handles.instagram === null) throw new AppError("BAD_REQUEST", "Enter the Instagram username or profile link");
      if (handles.tiktok === null) throw new AppError("BAD_REQUEST", "Enter the TikTok username or profile link");
      const phone = args.phone ? normalizePhone(args.phone) : "";
      if (phone && !isEgyptianPhone(phone)) throw new AppError("BAD_REQUEST", "Enter an Egyptian mobile or landline number");
      const site: SiteSettings = {
        ...args,
        messenger,
        checkoutExtras: extras,
        facebook: handles.facebook!,
        instagram: handles.instagram!,
        tiktok: handles.tiktok!,
        phone,
      };
      setSetting(ctx.db, SITE_KEY, JSON.stringify(site));
      return site;
    },
  }),
};

const PAGE = 50;

/** Team side: the Customers page (shop accounts). */
export const customersRouter = {
  list: query({
    input: z.object({ search: z.string().max(100).optional(), page: z.number().int().min(1).optional() }),
    handler: (ctx, args) => {
      requireView(ctx, "orders");
      const all = ctx.db.select().from(customers).orderBy(desc(customers._creationTime)).all();
      const search = args.search?.trim() ?? "";
      const digits = normalizePhone(search);
      const matched = search
        ? all.filter(
            (c) =>
              matchesSearch(`${c.name} ${c.email ?? ""} ${c.city ?? ""}`, search) ||
              (/^\d{3,}$/.test(digits) && (c.phone.includes(digits) || (c.phone2 ?? "").includes(digits))),
          )
        : all;
      const page = args.page ?? 1;
      const slice = matched.slice((page - 1) * PAGE, page * PAGE);
      const counts = new Map<string, number>();
      if (slice.length) {
        for (const r of ctx.db
          .select({ id: orders.customerAccountId, n: count() })
          .from(orders)
          .where(
            and(
              inArray(
                orders.customerAccountId,
                slice.map((c) => c._id),
              ),
              ne(orders.status, "cancelled"),
            ),
          )
          .groupBy(orders.customerAccountId)
          .all()) {
          if (r.id) counts.set(r.id, r.n);
        }
      }
      return {
        total: matched.length,
        pageSize: PAGE,
        customers: slice.map((c) => ({
          ...publicCustomer(c),
          joinedAt: c._creationTime,
          lastLoginAt: c.lastLoginAt,
          isActive: c.isActive,
          orders: counts.get(c._id) ?? 0,
        })),
      };
    },
  }),

  /** A one-time password reset link for a customer who asked on WhatsApp. Older links stop working. */
  resetLink: mutation({
    input: z.object({ customerId: zId }),
    handler: (ctx, args) => {
      requireEdit(ctx, "orders");
      const customer = ctx.db.select().from(customers).where(eq(customers._id, args.customerId)).get();
      if (!customer) throw new AppError("NOT_FOUND", "Customer not found");
      const { token, expiresAt } = createCustomerToken(ctx.db, customer._id, "reset");
      return { path: customerLinkPath("reset", token), expiresAt, phone: customer.phone, name: customer.name };
    },
  }),
};
