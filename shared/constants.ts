// Constants shared by the server and the browser. No runtime dependencies.

/** Areas of the app a member can be given access to. */
export const SECTIONS = [
  "dashboard",
  "orders",
  "inventory",
  "finance",
] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  dashboard: "Dashboard",
  orders: "Orders",
  inventory: "Inventory",
  finance: "Finance",
};

/** What a member can do in a section. No entry means no access. */
export const ACCESS_LEVELS = ["view", "edit"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export const ACCESS_LEVEL_LABELS: Record<AccessLevel | "none", string> = {
  none: "No access",
  view: "View",
  edit: "Edit",
};

export type Permissions = {
  access: Partial<Record<Section, AccessLevel>>;
  /** Ship orders and record returns (on top of Orders: Edit). */
  canShipAndReturn: boolean;
};

/** Ready-made access for the team's usual roles. */
export const PERMISSION_PRESETS = {
  moderator: {
    label: "Moderator",
    description:
      "Creates and edits orders (cancel, swap, re-record). Views inventory. No shipping, returns or finance.",
    permissions: {
      access: { orders: "edit", inventory: "view" },
      canShipAndReturn: false,
    },
  },
  warehouseLead: {
    label: "Warehouse lead",
    description:
      "Runs the warehouse: products, stock, packing, shipping and returns. Views the dashboard and finance.",
    permissions: {
      access: {
        dashboard: "view",
        orders: "edit",
        inventory: "edit",
        finance: "view",
      },
      canShipAndReturn: true,
    },
  },
} as const satisfies Record<
  string,
  { label: string; description: string; permissions: Permissions }
>;
export type PermissionPreset = keyof typeof PERMISSION_PRESETS;

export const NO_PERMISSIONS: Permissions = {
  access: {},
  canShipAndReturn: false,
};
export const ALL_PERMISSIONS: Permissions = {
  access: {
    dashboard: "edit",
    orders: "edit",
    inventory: "edit",
    finance: "edit",
  },
  canShipAndReturn: true,
};

/**
 * Reads stored permissions, including the older format
 * ({ sections: [...], canChangeStatus }) where every granted section meant full use.
 */
export function normalizePermissions(raw: unknown): Permissions {
  if (!raw || typeof raw !== "object") return NO_PERMISSIONS;
  const r = raw as Record<string, unknown>;
  const access: Partial<Record<Section, AccessLevel>> = {};
  if (Array.isArray(r.sections)) {
    for (const s of r.sections as unknown[]) {
      const section = s === "products" ? "inventory" : s;
      if (
        section === "dashboard" ||
        section === "orders" ||
        section === "inventory"
      )
        access[section] = "edit";
    }
    return {
      access,
      canShipAndReturn: r.canChangeStatus === true && access.orders === "edit",
    };
  }
  const given = (r.access ?? {}) as Record<string, unknown>;
  for (const section of SECTIONS) {
    const level = given[section];
    if (level === "view" || level === "edit") access[section] = level;
  }
  return {
    access,
    canShipAndReturn: r.canShipAndReturn === true && access.orders === "edit",
  };
}

export function canViewSection(p: Permissions, section: Section): boolean {
  return p.access[section] === "view" || p.access[section] === "edit";
}

export function canEditSection(p: Permissions, section: Section): boolean {
  return p.access[section] === "edit";
}

export const ROLES = ["admin", "member"] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = [
  "new",
  "on_hold",
  "shipped",
  "partially_returned",
  "returned",
  "swapped",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "New",
  on_hold: "On hold",
  shipped: "Shipped",
  partially_returned: "Partially returned",
  returned: "Returned",
  swapped: "Swapped",
  cancelled: "Cancelled",
};

/** Orders that haven't (fully) shipped yet and still need someone to act. */
export const OPEN_STATUSES: readonly OrderStatus[] = ["new", "on_hold"];
/** Orders whose items have left the warehouse (revenue-bearing). */
export const SHIPPED_TYPE_STATUSES: readonly OrderStatus[] = [
  "shipped",
  "partially_returned",
  "returned",
  "swapped",
];
/** Statuses from which items can be returned or swapped. */
export const RETURNABLE_STATUSES: readonly OrderStatus[] =
  SHIPPED_TYPE_STATUSES;
/** Statuses from which the order can ship. On hold orders wait for stock. */
export const SHIPPABLE_STATUSES: readonly OrderStatus[] = ["new"];

/** Where the customer placed the order. */
export const SALES_CHANNELS = ["whatsapp", "facebook", "instagram", "website"] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];
export const SALES_CHANNEL_LABELS: Record<SalesChannel, string> = {
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  instagram: "Instagram",
  website: "Website",
};

/**
 * Who an order item is for. Products that need it (clothes) must have one on
 * every order line; the packing queue colors the size by it.
 */
export const GENDERS = ["boys", "girls"] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABELS: Record<Gender, string> = {
  boys: "Boys",
  girls: "Girls",
};

export const MOVEMENT_TYPES = [
  "restock",
  "shipment",
  "return",
  "swap_out",
  "swap_in",
  "adjustment",
  "not_sellable_in",
  "write_off",
  "back_to_sellable",
  "return_in_transit",
  "transit_received",
  "transit_write_off",
  "return_write_off",
  "cost_correction",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  restock: "Restock",
  shipment: "Shipment",
  return: "Return",
  swap_out: "Swap out",
  swap_in: "Swap in",
  adjustment: "Adjustment",
  not_sellable_in: "Not sellable in",
  write_off: "Write-off",
  back_to_sellable: "Back to sellable",
  return_in_transit: "Return in transit",
  transit_received: "Return received",
  transit_write_off: "Return lost or damaged",
  return_write_off: "Returned damaged",
  cost_correction: "Cost correction",
};

export const RESTOCK_TYPES = [
  "purchase",
  "manual_adjustment",
  "opening",
] as const;
export type RestockType = (typeof RESTOCK_TYPES)[number];
export const RESTOCK_TYPE_LABELS: Record<RestockType, string> = {
  purchase: "Purchase",
  manual_adjustment: "Manual adjustment",
  opening: "Opening stock",
};

/** Reasons for taking stock out (lower on hand). */
export const ADJUST_DOWN_REASONS = [
  "lost",
  "damaged",
  "expired",
  "other",
] as const;
/** Reasons for adding stock without a purchase (raise on hand), e.g. after a physical count. */
export const ADJUST_UP_REASONS = [
  "count_correction",
  "found",
  "other",
] as const;
export const ADJUST_REASONS = [
  "lost",
  "damaged",
  "expired",
  "count_correction",
  "found",
  "other",
] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];
export const ADJUST_REASON_LABELS: Record<AdjustReason, string> = {
  lost: "Lost",
  damaged: "Damaged",
  expired: "Expired",
  count_correction: "Count correction",
  found: "Found",
  other: "Other",
};
export const ADJUST_DIRECTIONS = ["increase", "decrease"] as const;
export type AdjustDirection = (typeof ADJUST_DIRECTIONS)[number];

export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "card",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Card",
  other: "Other",
};

export const EXPENSE_CATEGORIES = [
  "shipping",
  "packaging",
  "rent",
  "salaries",
  "marketing",
  "utilities",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  shipping: "Shipping",
  packaging: "Packaging",
  rent: "Rent",
  salaries: "Salaries",
  marketing: "Marketing",
  utilities: "Utilities",
  other: "Other",
};

export const NOTIFICATION_TYPES = [
  "low_stock",
  "order_new",
  "order_shipped",
  "order_returned",
  "order_swapped",
  "order_cancelled",
  "order_on_hold",
  "order_released",
  "payment_due",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** price_correction: an admin fixed a shipped order's price (+ more charged / − less). */
export const FINANCIAL_EVENT_TYPES = ["refund", "swap_adjustment", "price_correction"] as const;
export type FinancialEventType = (typeof FINANCIAL_EVENT_TYPES)[number];

export const DELETION_ENTITY_TYPES = [
  "order",
  "movement",
  "product",
  "variant",
  "expense",
  "journal_entry",
] as const;
export type DeletionEntityType = (typeof DELETION_ENTITY_TYPES)[number];

export const REVENUE_BASES = ["shipped", "paid"] as const;
export type RevenueBasis = (typeof REVENUE_BASES)[number];

export type FieldDef = { key: string; label: string; required?: boolean };

/** Fields an admin can show or hide per section. Required fields can't be hidden. */
export const FIELD_SECTIONS = {
  products: {
    title: "Products",
    description: "Fields shown on the product list and product form",
    fields: [
      { key: "name", label: "Product name", required: true },
      { key: "sku", label: "SKU", required: true },
      { key: "unitPrice", label: "Unit price" },
      { key: "uom", label: "Unit of measure" },
      { key: "imageUrl", label: "Image" },
      { key: "reorderThreshold", label: "Reorder threshold" },
      { key: "hasVariants", label: "Variants" },
    ],
  },
  inventory: {
    title: "Inventory",
    description: "Columns shown on the stock table and its export",
    fields: [
      { key: "product", label: "Product", required: true },
      { key: "sku", label: "SKU" },
      { key: "onHand", label: "On hand", required: true },
      { key: "avgCost", label: "Avg cost" },
      { key: "assetValue", label: "Asset value" },
      { key: "reorderAt", label: "Reorder at" },
      { key: "status", label: "Stock status" },
    ],
  },
  orders: {
    title: "Orders",
    description:
      "Columns shown on the orders list, the order form and the export",
    fields: [
      { key: "orderNumber", label: "Order #", required: true },
      { key: "shipmentNumber", label: "Shipment #", required: true },
      { key: "orderDate", label: "Date" },
      { key: "customer", label: "Customer", required: true },
      { key: "customerPhone", label: "Customer phone", required: true },
      { key: "items", label: "Items count" },
      { key: "total", label: "Total", required: true },
      { key: "shippingFee", label: "Shipping fee" },
      { key: "toCollect", label: "To collect" },
      { key: "status", label: "Status", required: true },
      { key: "payment", label: "Payment" },
      { key: "notes", label: "Notes" },
      { key: "shipmentNotes", label: "Shipment notes" },
    ],
  },
} as const satisfies Record<
  string,
  { title: string; description: string; fields: readonly FieldDef[] }
>;
export type FieldSection = keyof typeof FIELD_SECTIONS;
export type FieldVisibility = Partial<
  Record<FieldSection, Record<string, boolean>>
>;

export function formatOrderNumber(
  orderNumber: number | null | undefined,
): string {
  if (orderNumber === undefined || orderNumber === null) return "ORD-…";
  return `ORD-${String(orderNumber).padStart(4, "0")}`;
}

export function formatMovementNumber(
  movementNumber: number | null | undefined,
): string {
  if (movementNumber === undefined || movementNumber === null) return "MOV-…";
  return `MOV-${String(movementNumber).padStart(4, "0")}`;
}

/** Same cent tolerance everywhere amounts are compared. */
export const MONEY_EPSILON = 0.005;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Ledger account types. Assets and expenses grow with debits; the rest with credits. */
export const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Costs & expenses",
};
export const DEBIT_NORMAL: Record<AccountType, boolean> = {
  asset: true,
  liability: false,
  equity: false,
  revenue: false,
  expense: true,
};

/** Where a journal entry came from. Only manual entries can be edited or deleted by hand. */
export const JOURNAL_SOURCES = ["manual", "auto", "opening", "closing"] as const;
export type JournalSource = (typeof JOURNAL_SOURCES)[number];
export const JOURNAL_SOURCE_LABELS: Record<JournalSource, string> = {
  manual: "Manual",
  auto: "Automatic",
  opening: "Opening balances",
  closing: "Closing",
};

// ---- Customer shop ----

export const SHOP_SECTIONS = ["women", "kids_clothes", "kids_accessories"] as const;
export type ShopSection = (typeof SHOP_SECTIONS)[number];
export const SHOP_SECTION_LABELS: Record<ShopSection, string> = {
  women: "Women",
  kids_clothes: "Kids clothes",
  kids_accessories: "Kids accessories",
};
/** Sections with baby sizes (age suggestions apply). */
export const KIDS_SECTIONS: readonly ShopSection[] = ["kids_clothes"];
/** Section links from before the three sections (shared on social media) still land in the right place. */
export const OLD_SHOP_SECTIONS: Record<string, ShopSection> = {
  kids_underwear: "kids_clothes",
  kids_outfits: "kids_clothes",
  accessories: "kids_accessories",
};
export const isShopSection = (v: unknown): v is ShopSection =>
  typeof v === "string" && (SHOP_SECTIONS as readonly string[]).includes(v);

/** Below this many units left, the shop tells customers how many remain ("Only 3 left"). */
export const SHOP_LOW_STOCK = 3;
