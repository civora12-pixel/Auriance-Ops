import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { NO_PERMISSIONS } from "../../shared/constants.ts";
import type { ShopSection } from "../../shared/constants.ts";
import { customers, orders } from "../db/schema.ts";
import { addUser, appError, setup, stockedProduct } from "../test/helpers.ts";
import { purchasedSizes, shopCatalog } from "./shop.ts";

type Api = ReturnType<typeof setup>["api"];

function inSection(api: Api, opts: Parameters<typeof stockedProduct>[1], section: ShopSection = "kids_clothes") {
  const made = stockedProduct(api, opts);
  api.products.setShopSection({ productIds: [made.productId], section });
  return made;
}

describe("shop catalog", () => {
  it("lists products in a shop section with stock to sell, without costs or stock counts", () => {
    const { api, db } = setup();
    inSection(api, { sku: "A", stock: 3, price: 150 }, "women");
    inSection(api, { sku: "EMPTY" });
    stockedProduct(api, { sku: "NOSECTION", stock: 5 });
    const sized = inSection(api, { sku: "B", variants: ["0-3", "3-6"], stock: 2 }, "kids_clothes");

    const shop = shopCatalog(db);
    expect(shop.map((p) => p.name).sort()).toEqual(["Product A", "Product B"]);
    const a = shop.find((p) => p.name === "Product A")!;
    expect(a.price).toBe(150);
    expect(a.section).toBe("women");
    expect(a.hasSizes).toBe(false);
    expect(a.options).toEqual([{ variantId: null, name: null, imageUrl: null, maxQuantity: 3 }]);
    expect(a.needsGender).toBe(false);
    const b = shop.find((p) => p.name === "Product B")!;
    expect(b.options.map((o) => o.variantId)).toEqual(sized.variantIds);
    // Nothing a customer shouldn't see
    expect(JSON.stringify(shop)).not.toMatch(/avgCost|onHand|reserved|cost|sku/i);
  });

  it("counts held stock as taken and caps a line at 10", () => {
    const { api, db } = setup();
    const { productId } = inSection(api, { sku: "A", stock: 25 });
    expect(shopCatalog(db)[0].options[0].maxQuantity).toBe(10);
    api.orders.create({
      orderDate: "2026-03-10",
      customer: "Mona",
      customerPhone: "01012345678",
      address: "Cairo",
      channel: "facebook",
      shippingFee: 50,
      shipmentNumber: "S1",
      total: 220,
      lineItems: [{ productId, quantity: 22 }],
    });
    expect(shopCatalog(db)[0].options[0].maxQuantity).toBe(3);
  });

  it("hides inactive products and products taken out of the shop", () => {
    const { api, db } = setup();
    const { productId } = inSection(api, { sku: "A", stock: 3 });
    const other = inSection(api, { sku: "B", stock: 3 });
    api.products.setActive({ productId, isActive: false });
    api.products.setShopSection({ productIds: [other.productId], section: null });
    expect(shopCatalog(db)).toEqual([]);
  });
});

describe("shop section field", () => {
  it("is set on create, kept on edit unless given, and needs inventory edit access to bulk-assign", () => {
    const { api, db, as } = setup();
    const id = api.products.create({
      name: "Bra",
      category: "General",
      unitPrice: 100,
      uom: "pcs",
      reorderThreshold: 0,
      shopSection: "women",
    });
    expect(api.products.get({ productId: id })!.shopSection).toBe("women");
    api.products.update({ productId: id, name: "Bra 2", category: "General", unitPrice: 100, uom: "pcs", reorderThreshold: 0 });
    expect(api.products.get({ productId: id })!.shopSection).toBe("women");
    expect(api.products.setShopSection({ productIds: [id, id], section: "kids_clothes" })).toBe(1);
    expect(api.products.get({ productId: id })!.shopSection).toBe("kids_clothes");
    const viewer = addUser(db, "member", { access: { inventory: "view" }, canShipAndReturn: false });
    expect(appError(() => as(viewer).products.setShopSection({ productIds: [id], section: null })).code).toBe("FORBIDDEN");
  });
});

describe("customers page", () => {
  it("lists shop accounts with their orders and makes reset links for moderators", () => {
    const { api, db, as } = setup();
    const mona = db
      .insert(customers)
      .values({ name: "Mona", phone: "01012345678", email: "mona@x.io", passwordHash: "x" })
      .returning()
      .get();
    db.insert(customers).values({ name: "Sara", phone: "01112345678", passwordHash: "x" }).run();
    const { productId, variantIds } = inSection(api, { sku: "A", variants: ["0-3", "3-6"], stock: 5 });
    const orderId = api.orders.create({
      orderDate: "2026-03-10",
      customer: "Mona",
      customerPhone: "01012345678",
      address: "Cairo",
      channel: "facebook",
      shippingFee: 50,
      shipmentNumber: "S1",
      total: 20,
      lineItems: [{ productId, variantId: variantIds[0], quantity: 1 }],
    });
    db.update(orders).set({ customerAccountId: mona._id }).where(eq(orders._id, orderId)).run();

    const all = api.customers.list({});
    expect(all.total).toBe(2);
    expect(all.customers.find((c) => c.name === "Mona")!.orders).toBe(1);
    expect(api.customers.list({ search: "٠١٠١٢" }).customers.map((c) => c.name)).toEqual(["Mona"]);
    expect(api.customers.list({ search: "sara" }).customers.map((c) => c.name)).toEqual(["Sara"]);
    expect(purchasedSizes(db, mona._id)).toEqual([{ size: "0-3", day: "2026-03-10" }]);

    const link = api.customers.resetLink({ customerId: mona._id });
    expect(link.path).toMatch(/^\/shop\/reset\/[\w-]+$/);
    expect(link.phone).toBe("01012345678");
    const outsider = addUser(db, "member", NO_PERMISSIONS);
    expect(appError(() => as(outsider).customers.list({})).code).toBe("FORBIDDEN");
    const viewer = addUser(db, "member", { access: { orders: "view" }, canShipAndReturn: false });
    expect(appError(() => as(viewer).customers.resetLink({ customerId: mona._id })).code).toBe("FORBIDDEN");
  });

  it("saves the shop settings (admins only)", () => {
    const { api, db, as } = setup();
    expect(api.shop.settings()).toEqual({ open: false, whatsapp: null, shippingFee: 0 });
    api.shop.updateSettings({ open: true, whatsapp: "+20 100 123 4567", shippingFee: 60 });
    expect(api.shop.settings()).toEqual({ open: true, whatsapp: "01001234567", shippingFee: 60 });
    expect(appError(() => api.shop.updateSettings({ open: true, whatsapp: "123" })).code).toBe("BAD_REQUEST");
    const member = addUser(db, "member", NO_PERMISSIONS);
    expect(appError(() => as(member).shop.updateSettings({ open: false, whatsapp: "" })).code).toBe("FORBIDDEN");
  });
});

describe("three website sections (migration 0022)", () => {
  it("puts the four accessories in Kids accessories, other active products in Kids clothes, and takes inactive ones off", () => {
    const { api, db } = setup();
    const make = (name: string, section: ShopSection | null, active = true) => {
      const { productId } = stockedProduct(api, { sku: name, stock: 1 });
      db.run(sql`UPDATE products SET name = ${name}, shop_section = ${section}, is_active = ${active ? 1 : 0} WHERE id = ${productId}`);
      return productId;
    };
    const ids = {
      bib: make("بافتة قطن", null),
      diaper: make("بديل البامبرز", null),
      towel: make("فوطة قشط بكابيشون", null),
      strap: make("وصلة سلوات", null),
      body: make("بادي قطن", null),
      legging: make("ليجن حوامل", "women"),
      old: make("طقم قديم", null, false),
    };
    db.run(sql`UPDATE products SET shop_section = 'accessories' WHERE id = ${ids.towel}`);
    db.run(sql`UPDATE products SET shop_section = 'kids_outfits' WHERE id = ${ids.old}`);
    const file = readFileSync(new URL("../db/migrations/0022_three_shop_sections.sql", import.meta.url), "utf8");
    for (const stmt of file.split("--> statement-breakpoint")) db.run(sql.raw(stmt));
    const section = (id: string) => api.products.get({ productId: id })!.shopSection;
    expect([ids.bib, ids.diaper, ids.towel, ids.strap].map(section)).toEqual(Array(4).fill("kids_accessories"));
    expect(section(ids.body)).toBe("kids_clothes");
    expect(section(ids.legging)).toBe("women");
    expect(section(ids.old)).toBeNull();
  });
});
