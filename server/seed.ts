import { count, eq } from "drizzle-orm";
import type { DB } from "./db/client.ts";
import { orders, products, users } from "./db/schema.ts";
import type { User } from "./db/schema.ts";
import { createCaller } from "./rpc/caller.ts";
import { getTimeZone } from "./lib/settings.ts";
import { dayOf, zonedNoon, addDays, todayIn } from "../shared/dates.ts";
import type { PaymentMethod } from "../shared/constants.ts";

/** Small deterministic PRNG so the demo data is the same on every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  return {
    next,
    int: (min: number, max: number) =>
      min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T =>
      items[Math.floor(next() * items.length)],
  };
}

const CATALOG = [
  {
    sku: "TEE-CLASSIC",
    name: "Classic Cotton Tee",
    category: "Apparel",
    unitPrice: 24,
    cost: 9,
    uom: "pcs",
    reorderThreshold: 10,
    variants: [
      { sku: "TEE-CLASSIC-S", name: "Small", attributes: { Size: "S" } },
      { sku: "TEE-CLASSIC-M", name: "Medium", attributes: { Size: "M" } },
      { sku: "TEE-CLASSIC-L", name: "Large", attributes: { Size: "L" } },
    ],
  },
  {
    sku: "HOOD-ZIP",
    name: "Zip Hoodie",
    category: "Apparel",
    unitPrice: 55,
    cost: 22,
    uom: "pcs",
    reorderThreshold: 5,
    variants: [
      { sku: "HOOD-ZIP-BLK", name: "Black", attributes: { Color: "Black" } },
      {
        sku: "HOOD-ZIP-GRY",
        name: "Heather grey",
        attributes: { Color: "Grey" },
      },
    ],
  },
  {
    sku: "MUG-CER",
    name: "Ceramic Mug",
    category: "Home",
    unitPrice: 14,
    cost: 4.5,
    uom: "pcs",
    reorderThreshold: 12,
  },
  {
    sku: "CANDLE-SOY",
    name: "Soy Candle",
    category: "Home",
    unitPrice: 18,
    cost: 6,
    uom: "pcs",
    reorderThreshold: 8,
  },
  {
    sku: "TOTE-CNV",
    name: "Canvas Tote",
    category: "Accessories",
    unitPrice: 16,
    cost: 5,
    uom: "pcs",
    reorderThreshold: 10,
  },
  {
    sku: "CAP-BASE",
    name: "Baseball Cap",
    category: "Accessories",
    unitPrice: 20,
    cost: 7,
    uom: "pcs",
    reorderThreshold: 6,
  },
  {
    sku: "BOTTLE-STL",
    name: "Steel Water Bottle",
    category: "Home",
    unitPrice: 28,
    cost: 11,
    uom: "pcs",
    reorderThreshold: 6,
  },
  {
    sku: "SOCK-PACK",
    name: "Crew Socks (3-pack)",
    category: "Apparel",
    unitPrice: 15,
    cost: 5.5,
    uom: "pack",
    reorderThreshold: 10,
  },
];

const CUSTOMERS = [
  "Amira Hassan",
  "Omar Farouk",
  "Lina Mostafa",
  "Youssef Adel",
  "Nour El-Sayed",
  "Karim Nabil",
  "Salma Ibrahim",
  "Mariam Tarek",
  "Hana Samir",
  "Ziad Mahmoud",
];

const DAY = 24 * 3600_000;

/** True when the database has no catalog and no orders yet. */
export function isEmpty(db: DB): boolean {
  const p = db.select({ n: count() }).from(products).get()?.n ?? 0;
  const o = db.select({ n: count() }).from(orders).get()?.n ?? 0;
  return p === 0 && o === 0;
}

/**
 * Fills an empty database with about two months of realistic activity
 * (catalog, purchases, orders in every status, payments, expenses), acting as `admin`.
 */
export function seedDemo(
  db: DB,
  admin: User,
): { products: number; orders: number } {
  const tz = getTimeZone(db);
  const realNow = Date.now();
  let clock = realNow;
  const api = createCaller(db, admin, { now: () => new Date(clock) });
  const r = rng(42);
  const today = todayIn(tz, new Date(realNow));
  const at = (daysAgo: number, hour = 12) => {
    const noon = zonedNoon(addDays(today, -daysAgo), tz).getTime();
    return Math.min(noon + (hour - 12) * 3600_000, realNow - 60_000);
  };

  // Catalog and opening stock, two months ago
  clock = at(62, 10);
  const sellables: {
    productId: string;
    variantId?: string;
    price: number;
    cost: number;
  }[] = [];
  for (const item of CATALOG) {
    const productId = api.products.create({
      sku: item.sku,
      name: item.name,
      category: item.category,
      unitPrice: item.unitPrice,
      uom: item.uom,
      reorderThreshold: item.reorderThreshold,
      variants: item.variants,
    });
    const product = api.products.get({ productId });
    const lines = product?.variants?.length
      ? product.variants.map((v) => v._id)
      : [undefined];
    for (const variantId of lines) {
      api.inventory.restock({
        productId,
        variantId,
        restockType: "purchase",
        quantity: r.int(30, 60),
        cost: item.cost,
        supplier: "Nile Textiles Co.",
        notes: "Opening stock",
      });
      sellables.push({
        productId,
        variantId,
        price: item.unitPrice,
        cost: item.cost,
      });
    }
  }

  // A mid-period purchase at a slightly higher cost
  clock = at(30, 11);
  for (const s of sellables.filter((_, i) => i % 3 === 0)) {
    api.inventory.restock({
      productId: s.productId,
      variantId: s.variantId,
      restockType: "purchase",
      quantity: r.int(10, 25),
      cost: Math.round(s.cost * 1.08 * 100) / 100,
      supplier: "Delta Supplies",
    });
  }

  // Orders over the last ~55 days
  let created = 0;
  for (let daysAgo = 55; daysAgo >= 0; daysAgo--) {
    const perDay = daysAgo === 0 ? 3 : r.int(0, 2);
    for (let k = 0; k < perDay; k++) {
      clock = at(daysAgo, 9 + k * 3);
      const picks = [
        ...new Set(
          Array.from({ length: r.int(1, 3) }, () => r.pick(sellables)),
        ),
      ];
      const lineItems = picks.map((s, i) => ({
        productId: s.productId,
        variantId: s.variantId,
        quantity: r.int(1, 3),
        // Alternates without drawing from the random sequence the demo relies on
        gender: (created + i) % 2 ? ("girls" as const) : ("boys" as const),
      }));
      const subtotal = lineItems.reduce(
        (sum, l, i) => sum + l.quantity * picks[i].price,
        0,
      );
      const discounted = r.next() < 0.2;
      created++;
      const orderId = api.orders.create({
        address: "Test address",
        channel: "facebook",
        shippingFee: 0,
        orderDate: dayOf(new Date(clock), tz),
        customer: r.pick(CUSTOMERS),
        customerPhone: `+20 10${r.int(10000000, 99999999)}`,
        shipmentNumber: `SHP-${String(10000 + created)}`,
        total: discounted ? Math.round(subtotal * 0.9 * 100) / 100 : subtotal,
        lineItems,
      });

      // Recent orders stay open; older ones move through the workflow
      if (daysAgo <= 1) continue;
      const roll = r.next();
      if (roll < 0.05) {
        api.orders.updateStatus({
          orderId,
          status: "cancelled",
          note: "Customer changed their mind",
        });
        continue;
      }
      // Orders that didn't fit the stock wait On hold
      if (api.orders.get({ orderId })?.status !== "new") continue;
      clock = Math.min(clock + DAY, realNow - 60_000);
      api.orders.updateStatus({ orderId, status: "shipped" });

      if (r.next() < 0.75 && daysAgo > 3) {
        clock = Math.min(clock + 2 * DAY, realNow - 60_000);
        api.payments.setPayment({
          orderId,
          status: "paid",
          method: r.pick<PaymentMethod>([
            "cash",
            "cash",
            "bank_transfer",
            "card",
          ]),
        });
      }
      const order = api.orders.get({ orderId });
      const first = order?.lineItems[0];
      if (!first || daysAgo < 6) continue;
      const after = r.next();
      if (after < 0.08) {
        clock = Math.min(clock + DAY, realNow - 60_000);
        api.orders.returnLineItems({
          orderId,
          lines: [
            { lineItemId: first._id, quantity: 1, sellable: r.next() < 0.7 },
          ],
          note: "Didn't fit",
        });
      } else if (after < 0.13 && first.variantId) {
        const sibling = sellables.find(
          (s) =>
            s.productId === first.productId && s.variantId !== first.variantId,
        );
        if (sibling) {
          clock = Math.min(clock + DAY, realNow - 60_000);
          api.orders.swapLineItem({
            orderId,
            returnLineItemId: first._id,
            returnQuantity: 1,
            returnSellable: true,
            replacementProductId: sibling.productId,
            replacementVariantId: sibling.variantId,
            replacementQuantity: 1,
            replacementUnitPrice: first.unitPrice,
            note: "Exchanged for another size",
          });
        }
      }
    }
  }

  // A damaged unit written off
  clock = at(12, 15);
  api.inventory.adjust({
    productId: sellables[4].productId,
    variantId: sellables[4].variantId,
    quantity: 1,
    reason: "damaged",
    notes: "Cracked in storage",
  });


  api.notifications.markAllRead();
  return { products: CATALOG.length, orders: created };
}

/** Seeds when SEED_DEMO is on, an admin exists and the database is still empty. */
export function maybeSeed(
  db: DB,
  enabled: boolean,
  log: (msg: string) => void,
): void {
  if (!enabled || !isEmpty(db)) return;
  const admin = db.select().from(users).where(eq(users.role, "admin")).get();
  if (!admin) {
    log(
      "SEED_DEMO is on, but there is no admin yet. Demo data will be added on the next start after setup.",
    );
    return;
  }
  const result = seedDemo(db, admin);
  log(`Demo data added: ${result.products} products, ${result.orders} orders`);
}
