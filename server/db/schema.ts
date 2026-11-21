import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  AccountType,
  AdjustReason,
  DeletionEntityType,
  ExpenseCategory,
  FinancialEventType,
  Gender,
  JournalSource,
  MovementType,
  NotificationType,
  OrderStatus,
  PaymentMethod,
  Permissions,
  RestockType,
  Role,
  SalesChannel,
  ShopSection,
} from "../../shared/constants.ts";
import type { Audience, Season } from "../../shared/shop-site.ts";
import type { PromoKind } from "../../shared/promo.ts";

// Every table keeps Convex-style `_id` (random UUID) and `_creationTime` (epoch ms)
// so API responses look the same as before the migration.
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());
const createdAt = () =>
  integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now());
const bool = (name: string) => integer(name, { mode: "boolean" });

export const users = sqliteTable(
  "users",
  {
    _id: id(),
    _creationTime: createdAt(),
    email: text("email").notNull(),
    name: text("name"),
    // Null until the member accepts their invite and picks a password
    passwordHash: text("password_hash"),
    role: text("role").$type<Role>().notNull(),
    permissions: text("permissions", { mode: "json" }).$type<Permissions>(),
    isActive: bool("is_active").notNull().default(true),
    lastLoginAt: integer("last_login_at"),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    index("users_role_idx").on(t.role),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    // sha256 of the cookie token; the raw token is never stored
    _id: text("id").primaryKey(),
    _creationTime: createdAt(),
    userId: text("user_id")
      .notNull()
      .references(() => users._id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    // Admin Mode: destructive actions allowed until this time (epoch ms)
    elevatedUntil: integer("elevated_until"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** One-time links for invites and password resets (sha256 of the token is the id). */
export const authTokens = sqliteTable(
  "auth_tokens",
  {
    _id: text("id").primaryKey(),
    _creationTime: createdAt(),
    userId: text("user_id")
      .notNull()
      .references(() => users._id, { onDelete: "cascade" }),
    kind: text("kind").$type<"invite" | "reset">().notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
  },
  (t) => [index("auth_tokens_user_idx").on(t.userId)],
);

export const products = sqliteTable(
  "products",
  {
    _id: id(),
    _creationTime: createdAt(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    unitPrice: real("unit_price").notNull(),
    uom: text("uom").notNull(),
    isActive: bool("is_active").notNull().default(true),
    imageUrl: text("image_url"),
    hasVariants: bool("has_variants").notNull().default(false),
    reorderThreshold: integer("reorder_threshold").notNull().default(0),
    // Order lines for this product must say boys or girls (off for diapers, heaters…)
    needsGender: bool("needs_gender").notNull().default(true),
    // Where the product shows in the customer shop; hidden from the shop when empty
    shopSection: text("shop_section").$type<ShopSection>(),
    // Most a customer can buy on one website order (all sizes together); null = no limit
    maxPerOrder: integer("max_per_order"),
    // Worn all year, or mainly in winter or summer (the website's season switch)
    season: text("season").$type<Season>().notNull().default("all"),
    // Who it's for: boys, girls or both ("Picked for your boy / girl / twins")
    audience: text("audience").$type<Audience>().notNull().default("both"),
  },
  (t) => [
    uniqueIndex("products_sku_unique").on(sql`lower(${t.sku})`),
    index("products_active_idx").on(t.isActive),
  ],
);

export const productVariants = sqliteTable(
  "product_variants",
  {
    _id: id(),
    _creationTime: createdAt(),
    productId: text("product_id")
      .notNull()
      .references(() => products._id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    attributes: text("attributes", { mode: "json" }).$type<
      Record<string, string>
    >(),
    isActive: bool("is_active").notNull().default(true),
    // Photo for this variant (falls back to the product's photo when empty)
    imageUrl: text("image_url"),
  },
  (t) => [
    index("variants_product_idx").on(t.productId),
    uniqueIndex("variants_sku_unique").on(sql`lower(${t.sku})`),
  ],
);

export const inventory = sqliteTable(
  "inventory",
  {
    _id: id(),
    _creationTime: createdAt(),
    productId: text("product_id")
      .notNull()
      .references(() => products._id, { onDelete: "cascade" }),
    variantId: text("variant_id").references(() => productVariants._id, {
      onDelete: "cascade",
    }),
    onHand: integer("on_hand").notNull().default(0),
    avgCost: real("avg_cost").notNull().default(0),
    // Units held for open (new / on hold) orders; still part of onHand until shipped
    reserved: integer("reserved").notNull().default(0),
    // Returned/swapped units marked "not sellable", kept apart from onHand
    notSellable: integer("not_sellable").notNull().default(0),
    // Weighted-average unit cost of the not-sellable units (their own cost pool)
    notSellableCost: real("not_sellable_cost").notNull().default(0),
    // Returns announced by the courier but not received yet: not sellable, valued at the cost they shipped with
    inTransit: integer("in_transit").notNull().default(0),
    inTransitCost: real("in_transit_cost").notNull().default(0),
    // True once a low-stock alert was sent; reset when stock goes back above threshold
    lowStockAlerted: bool("low_stock_alerted").notNull().default(false),
  },
  (t) => [
    // One row per product (variantId null) or per variant.
    // drizzle-kit mis-quotes this expression; 0000_init.sql was corrected by hand.
    uniqueIndex("inventory_item_unique").on(
      t.productId,
      sql`coalesce(${t.variantId}, '')`,
    ),
  ],
);

export const inventoryMovements = sqliteTable(
  "inventory_movements",
  {
    _id: id(),
    _creationTime: createdAt(),
    movementNumber: integer("movement_number").notNull(),
    // No foreign keys: order-linked movements outlive deleted products
    productId: text("product_id").notNull(),
    variantId: text("variant_id"),
    type: text("type").$type<MovementType>().notNull(),
    restockType: text("restock_type").$type<RestockType>(),
    quantityChange: integer("quantity_change").notNull(),
    // ISO instant
    date: text("date").notNull(),
    userId: text("user_id").notNull(),
    orderId: text("order_id").references(() => orders._id, {
      onDelete: "cascade",
    }),
    supplier: text("supplier"),
    // Purchase unit cost as entered on a restock
    cost: real("cost"),
    reason: text("reason").$type<AdjustReason>(),
    notes: text("notes"),
    // Weighted-average unit cost at the time of the movement (for COGS / losses)
    unitCost: real("unit_cost").notNull().default(0),
    // Restock: the ledger account the purchase was paid from (default QNB)
    paidFromAccountId: text("paid_from_account_id"),
    // Cost correction: the restock it corrects, the change in that purchase's
    // value (quantity × cost difference) and the change in stock value
    relatedMovementId: text("related_movement_id"),
    purchaseValueChange: real("purchase_value_change"),
    stockValueChange: real("stock_value_change"),
  },
  (t) => [
    uniqueIndex("movements_number_unique").on(t.movementNumber),
    index("movements_product_idx").on(t.productId, t.variantId),
    index("movements_order_idx").on(t.orderId),
    index("movements_date_idx").on(t.date),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    _id: id(),
    _creationTime: createdAt(),
    // Sequential order number (displayed as ORD-0001)
    orderNumber: integer("order_number").notNull(),
    // Calendar day YYYY-MM-DD in the business timezone
    orderDate: text("order_date").notNull(),
    customer: text("customer").notNull(),
    customerPhone: text("customer_phone"),
    customerPhone2: text("customer_phone_2"),
    // Delivery address as one free-text block (area, street, building…)
    address: text("address"),
    // Where the customer ordered from
    channel: text("channel").$type<SalesChannel>(),
    // Paid by the customer on delivery and kept by the courier: never revenue
    shippingFee: real("shipping_fee").notNull().default(0),
    // When someone last posted the order to the WhatsApp group
    whatsappPostedAt: text("whatsapp_posted_at"),
    // The cancelled order this one re-records (same shipment, corrected details)
    rerecordedFromId: text("rerecorded_from_id"),
    shipmentNumber: text("shipment_number").notNull(),
    // Website promo code used on the order (its discount is in discountAmount, or free shipping)
    promoCode: text("promo_code"),
    repId: text("rep_id").notNull(),
    status: text("status").$type<OrderStatus>().notNull(),
    subtotal: real("subtotal").notNull(),
    discountAmount: real("discount_amount").notNull().default(0),
    offerName: text("offer_name"),
    total: real("total").notNull(),
    notes: text("notes"),
    shipmentNotes: text("shipment_notes"),
    refundedAmount: real("refunded_amount").notNull().default(0),
    swapPriceDifference: real("swap_price_difference").notNull().default(0),
    hasManualTotal: bool("has_manual_total").notNull().default(false),
    originalTotal: real("original_total").notNull(),
    // First shipment instant (revenue date on the "when shipped" basis)
    shippedAt: text("shipped_at"),
    paymentStatus: text("payment_status")
      .$type<"paid" | "unpaid">()
      .notNull()
      .default("unpaid"),
    paidAt: text("paid_at"),
    // Amount collected when marked paid (later refunds don't change it)
    paidAmount: real("paid_amount"),
    // Paid through a courier settlement sheet (its entry covers the collection)
    settlementId: text("settlement_id"),
    paymentMethod: text("payment_method").$type<PaymentMethod>(),
    // The chart-of-accounts account the money arrived in (QNB, cash, custody…); null = by method (cash → Cash, else QNB)
    paidAccountId: text("paid_account_id"),
    // The shop customer account that placed the order (website orders)
    customerAccountId: text("customer_account_id"),
    // Website order not yet confirmed with the customer: no real shipment
    // number yet, kept out of packing and shipping until a moderator confirms
    awaitingConfirmation: bool("awaiting_confirmation").notNull().default(false),
    // Website orders: governorate and city as the courier lists them, for their bulk upload
    governorate: text("governorate"),
    city: text("city"),
    // When the order was last put in a courier upload sheet
    courierExportedAt: integer("courier_exported_at"),
    // Delayed by the customer: the day (YYYY-MM-DD) they want it shipped.
    // It's packed like any other order, marked Delayed.
    shipOn: text("ship_on"),
    // Partly returned per the courier, pieces not recorded yet: paidAmount was
    // collected, and the rest closes when the warehouse records the pieces
    returnPending: bool("return_pending").notNull().default(false),
  },
  (t) => [
    uniqueIndex("orders_number_unique").on(t.orderNumber),
    index("orders_customer_account_idx").on(t.customerAccountId),
    // One active order per shipment number; cancelled orders may share it with their re-recorded copy
    uniqueIndex("orders_shipment_active_unique")
      .on(sql`lower(${t.shipmentNumber})`)
      .where(sql`${t.status} <> 'cancelled'`),
    index("orders_shipment_idx").on(sql`lower(${t.shipmentNumber})`),
    index("orders_status_idx").on(t.status),
    index("orders_date_idx").on(t.orderDate),
    index("orders_shipped_at_idx").on(t.shippedAt),
    index("orders_paid_at_idx").on(t.paidAt),
    index("orders_ship_on_idx").on(t.shipOn),
  ],
);

export const orderLineItems = sqliteTable(
  "order_line_items",
  {
    _id: id(),
    _creationTime: createdAt(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders._id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    variantId: text("variant_id"),
    quantity: integer("quantity").notNull(),
    unitPrice: real("unit_price").notNull(),
    subtotal: real("subtotal").notNull(),
    shippedQuantity: integer("shipped_quantity").notNull().default(0),
    // Units whose sale was reversed: received back, on the way back, or lost by the courier
    returnedQuantity: integer("returned_quantity").notNull().default(0),
    // The part of returnedQuantity still on its way back to the warehouse
    inTransitQuantity: integer("in_transit_quantity").notNull().default(0),
    isSwapReplacement: bool("is_swap_replacement").notNull().default(false),
    replacesLineItemId: text("replaces_line_item_id"),
    // Boys or girls, for products that need it; colors the size when packing
    gender: text("gender").$type<Gender>(),
    // Saved copy of names so order history survives product/variant deletion
    productName: text("product_name").notNull(),
    productSku: text("product_sku").notNull(),
    variantName: text("variant_name"),
  },
  (t) => [
    index("line_items_order_idx").on(t.orderId),
    index("line_items_product_idx").on(t.productId, t.variantId),
  ],
);

export const orderStatusHistory = sqliteTable(
  "order_status_history",
  {
    _id: id(),
    _creationTime: createdAt(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders._id, { onDelete: "cascade" }),
    status: text("status").$type<OrderStatus>().notNull(),
    changedBy: text("changed_by").notNull(),
    changedAt: text("changed_at").notNull(),
    note: text("note"),
  },
  (t) => [index("history_order_idx").on(t.orderId)],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * Units that came back to stock from returns, kept until the warehouse keeper
 * announces them to the moderators. `freeBefore` is what could be promised to
 * a new order just before they arrived (zero or less: the item was sold out).
 */
export const returnArrivals = sqliteTable(
  "return_arrivals",
  {
    _id: id(),
    _creationTime: createdAt(),
    // No foreign keys: the pending list skips items that were deleted since
    productId: text("product_id").notNull(),
    variantId: text("variant_id"),
    quantity: integer("quantity").notNull(),
    freeBefore: integer("free_before").notNull(),
    // ISO instants
    at: text("at").notNull(),
    announcedAt: text("announced_at"),
    userId: text("user_id").notNull(),
  },
  (t) => [index("return_arrivals_announced_idx").on(t.announcedAt)],
);
export type ReturnArrival = typeof returnArrivals.$inferSelect;

export const notifications = sqliteTable(
  "notifications",
  {
    _id: id(),
    _creationTime: createdAt(),
    userId: text("user_id")
      .notNull()
      .references(() => users._id, { onDelete: "cascade" }),
    type: text("type").$type<NotificationType>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    // Lets order deletion remove its alerts too
    orderId: text("order_id").references(() => orders._id, {
      onDelete: "cascade",
    }),
    read: bool("read").notNull().default(false),
    // Who did it (null for automatic alerts like low stock)
    actorId: text("actor_id").references(() => users._id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at_iso").notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.read)],
);

/** Money events not captured by order totals at ship time. */
export const financialEvents = sqliteTable(
  "financial_events",
  {
    _id: id(),
    _creationTime: createdAt(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders._id, { onDelete: "cascade" }),
    // refund: amount refunded (positive). swap_adjustment, price_correction: + charged / − less
    type: text("type").$type<FinancialEventType>().notNull(),
    amount: real("amount").notNull(),
    date: text("date").notNull(),
  },
  (t) => [
    index("financial_events_order_idx").on(t.orderId),
    index("financial_events_date_idx").on(t.date),
  ],
);

export const expenses = sqliteTable(
  "expenses",
  {
    _id: id(),
    _creationTime: createdAt(),
    // Calendar day YYYY-MM-DD
    date: text("date").notNull(),
    category: text("category").$type<ExpenseCategory>().notNull(),
    amount: real("amount").notNull(),
    vendor: text("vendor"),
    description: text("description").notNull(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [index("expenses_date_idx").on(t.date)],
);

/** Chart of accounts. `systemKey` marks accounts the app itself posts to. */
export const accounts = sqliteTable(
  "accounts",
  {
    _id: id(),
    _creationTime: createdAt(),
    code: integer("code").notNull(),
    name: text("name").notNull(),
    type: text("type").$type<AccountType>().notNull(),
    // Heading the account sits under, e.g. "Banks" or "Partners' capital"
    group: text("group_name").notNull(),
    systemKey: text("system_key"),
    // Filled only by operations (orders, stock): manual entries can't post to it
    isAuto: bool("is_auto").notNull().default(false),
    isActive: bool("is_active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("accounts_code_unique").on(t.code),
    uniqueIndex("accounts_system_key_unique").on(t.systemKey),
  ],
);

export const journalEntries = sqliteTable(
  "journal_entries",
  {
    _id: id(),
    _creationTime: createdAt(),
    number: integer("number").notNull(),
    // Calendar day YYYY-MM-DD the entry belongs to
    date: text("date").notNull(),
    memo: text("memo").notNull(),
    source: text("source").$type<JournalSource>().notNull(),
    // For automatic entries: what created it (e.g. "movement", "order") and its id
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    createdBy: text("created_by"),
    updatedAt: integer("updated_at"),
    // Manual entries that create a payable can carry a due date, and be marked settled
    dueDay: text("due_day"),
    settledAt: integer("settled_at"),
  },
  (t) => [
    uniqueIndex("journal_entries_number_unique").on(t.number),
    index("journal_entries_date_idx").on(t.date),
    index("journal_entries_source_idx").on(t.sourceType, t.sourceId),
  ],
);

export const journalLines = sqliteTable(
  "journal_lines",
  {
    _id: id(),
    entryId: text("entry_id")
      .notNull()
      .references(() => journalEntries._id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts._id),
    debit: real("debit").notNull().default(0),
    credit: real("credit").notNull().default(0),
    memo: text("memo"),
    sort: integer("sort").notNull().default(0),
    // Partners payable: which partner (their capital account) the amount is owed to
    partnerAccountId: text("partner_account_id").references(() => accounts._id),
  },
  (t) => [
    index("journal_lines_entry_idx").on(t.entryId),
    index("journal_lines_account_idx").on(t.accountId),
  ],
);

/** A courier collection sheet that was uploaded and posted. */
export const settlements = sqliteTable(
  "settlements",
  {
    _id: id(),
    _creationTime: createdAt(),
    number: integer("number").notNull(),
    // Day the money arrived
    date: text("date").notNull(),
    // Where it arrived (QNB by default)
    accountId: text("account_id").notNull(),
    fileName: text("file_name"),
    // JSON: the rows that were posted (order, shipment, kind, amounts)
    rows: text("rows").notNull(),
    netAmount: real("net_amount").notNull(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [uniqueIndex("settlements_number_unique").on(t.number)],
);

/**
 * Opening balances ("opening") and monthly closings ("2026-11"): the figures
 * typed in while drafting, then locked once posted.
 */
export const closings = sqliteTable("closings", {
  period: text("period").primaryKey(),
  status: text("status").$type<"draft" | "locked">().notNull(),
  // JSON draft: balances by account code, explanations, percentages, choices
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull(),
  lockedAt: integer("locked_at"),
  lockedBy: text("locked_by"),
});

/** Website promo codes: what they give, when they work, and how often (see shared/promo.ts). */
export const promoCodes = sqliteTable(
  "promo_codes",
  {
    _id: id(),
    _creationTime: createdAt(),
    // Upper case: EID2026, VIP-7F3KQ2
    code: text("code").notNull(),
    // What it's for: "Eid 2026", "Website launch"; generated codes share their batch's name
    name: text("name").notNull(),
    kind: text("kind").$type<PromoKind>().notNull(),
    value: real("value").notNull().default(0),
    maxDiscount: real("max_discount"),
    minOrder: real("min_order"),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    maxUses: integer("max_uses"),
    oncePerCustomer: integer("once_per_customer", { mode: "boolean" }).notNull().default(true),
    section: text("section").$type<ShopSection>(),
    // Generated together for sending privately (one use each)
    batch: text("batch"),
    createdBy: text("created_by").notNull(),
  },
  (t) => [uniqueIndex("promo_codes_code_unique").on(t.code), index("promo_codes_batch_idx").on(t.batch)],
);

/** Each order a promo code was used on. */
export const promoRedemptions = sqliteTable(
  "promo_redemptions",
  {
    _id: id(),
    _creationTime: createdAt(),
    promoId: text("promo_id").notNull(),
    orderId: text("order_id").notNull(),
    // Normalised phone, for "once per customer"
    phone: text("phone").notNull(),
    discount: real("discount").notNull(),
    freeShipping: integer("free_shipping", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("promo_redemptions_promo_idx").on(t.promoId, t.phone), uniqueIndex("promo_redemptions_order_unique").on(t.orderId)],
);

/** Deletion audit log — persists after the record is gone. */
export const deletionLogs = sqliteTable(
  "deletion_logs",
  {
    _id: id(),
    _creationTime: createdAt(),
    entityType: text("entity_type").$type<DeletionEntityType>().notNull(),
    entityId: text("entity_id").notNull(),
    entitySummary: text("entity_summary").notNull(),
    deletedBy: text("deleted_by").notNull(),
    deletedAt: text("deleted_at").notNull(),
    stockEffect: text("stock_effect").notNull(),
  },
  (t) => [index("deletion_logs_created_idx").on(t._creationTime)],
);

/** Shop customers: sign in with their phone (or email) and a password. */
export const customers = sqliteTable(
  "customers",
  {
    _id: id(),
    _creationTime: createdAt(),
    name: text("name").notNull(),
    // Normalized Egyptian mobile (01xxxxxxxxx)
    phone: text("phone").notNull(),
    phone2: text("phone_2"),
    // Optional; lower-case
    email: text("email"),
    emailVerifiedAt: integer("email_verified_at"),
    passwordHash: text("password_hash").notNull(),
    governorate: text("governorate"),
    city: text("city"),
    address: text("address"),
    // "How old is your baby?" answer and the day it was given (it ages from there)
    babyAgeMonths: real("baby_age_months"),
    babyAgeDay: text("baby_age_day"),
    // "My little ones": JSON list of { id, name, birthday, gender }
    children: text("children"),
    // Shopping for: a boy, a girl or twins (JSON; see shared/little-ones.ts)
    shoppingFor: text("shopping_for"),
    isActive: bool("is_active").notNull().default(true),
    lastLoginAt: integer("last_login_at"),
  },
  (t) => [
    uniqueIndex("customers_phone_unique").on(t.phone),
    uniqueIndex("customers_email_unique").on(t.email),
  ],
);

export const customerSessions = sqliteTable(
  "customer_sessions",
  {
    // sha256 of the cookie token
    _id: text("id").primaryKey(),
    _creationTime: createdAt(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers._id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    userAgent: text("user_agent"),
  },
  (t) => [index("customer_sessions_customer_idx").on(t.customerId)],
);

/** One-time links: password resets and email confirmations (sha256 of the token is the id). */
export const customerTokens = sqliteTable(
  "customer_tokens",
  {
    _id: text("id").primaryKey(),
    _creationTime: createdAt(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers._id, { onDelete: "cascade" }),
    kind: text("kind").$type<"reset" | "verify">().notNull(),
    // The address being confirmed (verify links)
    email: text("email"),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
  },
  (t) => [index("customer_tokens_customer_idx").on(t.customerId)],
);

export type Customer = typeof customers.$inferSelect;
/** Reminders already sent (one row per reminder), so each goes out once. */
export const remindersSent = sqliteTable("reminders_sent", {
  key: text("key").primaryKey(),
  createdAt: createdAt(),
});

export type Account = typeof accounts.$inferSelect;
export type Closing = typeof closings.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type JournalLine = typeof journalLines.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type InventoryRow = typeof inventory.$inferSelect;
export type Movement = typeof inventoryMovements.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type LineItem = typeof orderLineItems.$inferSelect;
export type StatusHistory = typeof orderStatusHistory.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type FinancialEvent = typeof financialEvents.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type DeletionLog = typeof deletionLogs.$inferSelect;
export type PromoCode = typeof promoCodes.$inferSelect;
