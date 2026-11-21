import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { bootstrapAdmin } from "../auth/routes.ts";
import type { Email, Mailer } from "../lib/email.ts";
import { setSetting } from "../lib/settings.ts";
import { appError, setup, stockedProduct, testDb } from "../test/helpers.ts";
import { checkoutExtras, shopCatalog } from "../modules/shop.ts";
import { orders } from "../db/schema.ts";

function client(app: ReturnType<typeof createApp>) {
  const jar = new Map<string, string>();
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const set of res.headers.getSetCookie()) {
      const [pair] = set.split(";");
      const [k, v] = pair.split("=");
      if (v) jar.set(k, v);
      else jar.delete(k);
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { call };
}

function newShop(opts: { open?: boolean; email?: boolean } = {}) {
  const db = testDb();
  if (opts.open !== false) setSetting(db, "shop_open", "1");
  const sent: Email[] = [];
  const mailer: Mailer = { enabled: !!opts.email, send: async (e) => void sent.push(e) };
  const app = createApp({ db, env: { NODE_ENV: "test", APP_ORIGIN: "https://shop.test" }, mailer, log: () => {} });
  return { db, app, sent };
}

const linkToken = (email: Email) => email.text.match(/\/shop\/(?:reset|verify)\/([\w-]+)/)![1];

describe("customer shop", () => {
  it("stays closed to the public until opened, but team members can preview", async () => {
    const { db, app } = newShop({ open: false });
    const guest = client(app);
    expect((await guest.call("GET", "/api/shop/config")).body).toMatchObject({ open: false, preview: false });
    expect((await guest.call("GET", "/api/shop/catalog")).status).toBe(403);
    await bootstrapAdmin(db, { ADMIN_EMAIL: "boss@x.io", ADMIN_PASSWORD: "admin password" });
    const team = client(app);
    await team.call("POST", "/api/auth/login", { email: "boss@x.io", password: "admin password" });
    expect((await team.call("GET", "/api/shop/config")).body).toMatchObject({ preview: true });
    expect((await team.call("GET", "/api/shop/catalog")).status).toBe(200);
  });

  it("signs up with a phone, signs in with phone or email, and keeps the profile", async () => {
    const { app } = newShop();
    const c = client(app);
    expect((await c.call("GET", "/api/shop/me")).body.customer).toBeNull();
    expect((await c.call("POST", "/api/shop/signup", { name: "Mona", phone: "123", password: "secret pass" })).status).toBe(400);
    const signup = await c.call("POST", "/api/shop/signup", {
      name: "Mona",
      phone: "+20 101 234 5678",
      email: "Mona@X.io",
      password: "secret pass",
    });
    expect(signup.status).toBe(200);
    expect(signup.body.customer).toMatchObject({ phone: "01012345678", email: "mona@x.io", emailVerified: false });
    expect(JSON.stringify(signup.body)).not.toMatch(/password/i);

    const other = client(app);
    expect((await other.call("POST", "/api/shop/signup", { name: "X", phone: "01012345678", password: "secret pass" })).status).toBe(409);
    expect((await other.call("POST", "/api/shop/login", { login: "01012345678", password: "wrong pass" })).status).toBe(401);
    expect((await other.call("POST", "/api/shop/login", { login: "٠١٠١٢٣٤٥٦٧٨", password: "secret pass" })).status).toBe(200);
    expect((await other.call("POST", "/api/shop/logout")).status).toBe(200);
    expect((await other.call("POST", "/api/shop/login", { login: "MONA@x.io", password: "secret pass" })).status).toBe(200);

    const saved = await c.call("POST", "/api/shop/profile", {
      name: "Mona A",
      phone: "01012345678",
      phone2: "0238221076",
      email: "mona@x.io",
      governorate: "الجيزة",
      city: "فيصل",
      address: "12 Street",
      babyAgeMonths: 4,
    });
    expect(saved.body.customer).toMatchObject({ name: "Mona A", phone2: "0238221076", governorate: "الجيزة", city: "فيصل", babyAgeMonths: 4 });
    // The main number stays a mobile (for WhatsApp); only the alternative can be a landline
    expect((await c.call("POST", "/api/shop/profile", { name: "Mona A", phone: "0238221076", email: "mona@x.io" })).status).toBe(400);
    expect((await c.call("POST", "/api/shop/baby-age", { months: null })).body.customer.babyAgeMonths).toBeNull();
    expect((await c.call("GET", "/api/shop/orders")).body).toEqual([]);
  });

  it("confirms the email and emails reset links only to confirmed addresses", async () => {
    const { app, sent } = newShop({ email: true });
    const c = client(app);
    await c.call("POST", "/api/shop/signup", { name: "Mona", phone: "01012345678", email: "mona@x.io", password: "secret pass" });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("https://shop.test/shop/verify/");

    // Not confirmed yet: no reset email (and the answer looks the same)
    const anon = client(app);
    expect((await anon.call("POST", "/api/shop/forgot", { email: "mona@x.io" })).status).toBe(200);
    expect(sent).toHaveLength(1);

    expect((await anon.call("POST", `/api/shop/verify/${linkToken(sent[0])}`)).status).toBe(200);
    expect((await c.call("GET", "/api/shop/me")).body.customer.emailVerified).toBe(true);

    await anon.call("POST", "/api/shop/forgot", { email: "mona@x.io" });
    await anon.call("POST", "/api/shop/forgot", { email: "nobody@x.io" });
    expect(sent).toHaveLength(2);
    const token = linkToken(sent[1]);
    expect((await anon.call("GET", `/api/shop/reset/${token}`)).body).toEqual({ name: "Mona" });
    expect((await anon.call("POST", `/api/shop/reset/${token}`, { password: "new secret" })).status).toBe(200);
    expect((await anon.call("POST", `/api/shop/reset/${token}`, { password: "new secret" })).status).toBe(404);
    // The reset signs out the old session
    expect((await c.call("GET", "/api/shop/me")).body.customer).toBeNull();
    expect((await c.call("POST", "/api/shop/login", { login: "01012345678", password: "new secret" })).status).toBe(200);

    // Changing the email needs a new confirmation
    const changed = await c.call("POST", "/api/shop/profile", { name: "Mona", phone: "01012345678", email: "new@x.io" });
    expect(changed.body.customer.emailVerified).toBe(false);
    expect(sent).toHaveLength(3);
  });

  it("says email reset is off until the email service is set up", async () => {
    const { app } = newShop();
    const c = client(app);
    const res = await c.call("POST", "/api/shop/forgot", { email: "mona@x.io" }, { "accept-language": "ar" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/واتساب/);
    expect((await c.call("GET", "/api/shop/config")).body.emailEnabled).toBe(false);
  });

  it("lets a moderator's WhatsApp reset link set a new password", async () => {
    const { db, app } = newShop();
    await bootstrapAdmin(db, { ADMIN_EMAIL: "boss@x.io", ADMIN_PASSWORD: "admin password" });
    const shopper = client(app);
    const me = await shopper.call("POST", "/api/shop/signup", { name: "Sara", phone: "01112345678", password: "secret pass" });
    const team = client(app);
    await team.call("POST", "/api/auth/login", { email: "boss@x.io", password: "admin password" });
    const link = await team.call("POST", "/api/rpc/customers.resetLink", { customerId: me.body.customer._id });
    const token = link.body.path.split("/").pop();
    const fresh = client(app);
    expect((await fresh.call("POST", `/api/shop/reset/${token}`, { password: "brand new pass" })).status).toBe(200);
    expect((await fresh.call("GET", "/api/shop/me")).body.customer.name).toBe("Sara");
  });
});

describe("website checkout", () => {
  function shopWithStock() {
    const { db, api } = setup();
    setSetting(db, "shop_open", "1");
    api.shop.updateSettings({ open: true, whatsapp: "01001234567", shippingFee: 60 });
    const body = stockedProduct(api, { sku: "BODY", variants: ["0-3", "3-6"], stock: 2, price: 180, needsGender: true });
    api.products.setShopSection({ productIds: [body.productId], section: "kids_clothes" });
    const app = createApp({ db, env: { NODE_ENV: "test", APP_ORIGIN: undefined }, log: () => {} });
    return { db, api, app, body };
  }
  const details = { name: "Mona", phone: "01012345678", governorate: "الجيزة", city: "فيصل", address: "12 Street" };

  it("places a cash-on-delivery order that waits for the team to confirm it", async () => {
    const { api, app, body } = shopWithStock();
    const guest = client(app);
    const line = { productId: body.productId, variantId: body.variantIds[0], quantity: 1 };
    expect((await guest.call("POST", "/api/shop/checkout", { ...details, lines: [line] })).status).toBe(400); // boys or girls
    const placed = await guest.call("POST", "/api/shop/checkout", { ...details, lines: [{ ...line, gender: "girls" }] });
    expect(placed.status).toBe(200);
    // Giza ships for 70 (the price list), not the old single fee
    expect(placed.body).toMatchObject({ number: "ORD-0001", total: 180, shippingFee: 70 });

    const order = api.orders.get({ orderId: placed.body.orderId })!;
    expect(order).toMatchObject({ channel: "website", status: "new", awaitingConfirmation: true, address: "12 Street", governorate: "الجيزة", city: "فيصل" });
    expect(api.orders.list({ needsConfirmation: true }).total).toBe(1);
    // Holds its stock, but stays out of packing and can't ship yet
    expect(api.orders.packingQueue()).toEqual([]);
    expect(appError(() => api.orders.updateStatus({ orderId: order._id, status: "shipped" })).message).toMatch(/Confirm this website order/);

    api.orders.confirmWebOrder({ orderId: order._id, shipmentNumber: "BOSTA-1", shippingFee: 70 });
    expect(api.orders.get({ orderId: order._id })).toMatchObject({ awaitingConfirmation: false, shipmentNumber: "BOSTA-1", shippingFee: 70 });
    expect(api.orders.packingQueue()).toHaveLength(1);
    expect(appError(() => api.orders.confirmWebOrder({ orderId: order._id, shipmentNumber: "X" })).code).toBe("BAD_REQUEST");
  });

  it("rejects areas the courier doesn't list, and turns waiting orders into a courier sheet", async () => {
    const { api, app, body } = shopWithStock();
    const guest = client(app);
    const line = { productId: body.productId, variantId: body.variantIds[0], quantity: 2, gender: "girls" };
    expect((await guest.call("POST", "/api/shop/checkout", { ...details, city: "Atlantis", lines: [line] })).status).toBe(400);
    expect((await guest.call("POST", "/api/shop/checkout", { ...details, governorate: "Mars", lines: [line] })).status).toBe(400);
    const a = await guest.call("POST", "/api/shop/checkout", { ...details, lines: [line] });
    const b = await guest.call("POST", "/api/shop/checkout", { ...details, name: "Sara", phone2: "01112345678", lines: [{ ...line, variantId: body.variantIds[1], quantity: 1, gender: "boys" }] });

    const sheet = api.orders.courierSheet({});
    expect(sheet).toHaveLength(2);
    expect(sheet[0]).toMatchObject({
      orderNumber: "ORD-0001",
      recipient: "Mona",
      phone: "01012345678",
      governorate: "الجيزة",
      city: "فيصل",
      content: "2 × Product BODY (0-3) بناتي",
      pieces: 2,
      collect: 430, // 360 + 70 shipping to Giza
    });
    expect(sheet[1]).toMatchObject({ recipient: "Sara", phone2: "01112345678", content: "1 × Product BODY (3-6) أولادي" });
    // Already exported: the next sheet only has new orders
    expect(api.orders.courierSheet({})).toEqual([]);
    expect(api.orders.courierSheet({ includeExported: true })).toHaveLength(2);

    // Shipment numbers for both in one go
    expect(
      appError(() =>
        api.orders.confirmWebOrders({
          items: [
            { orderId: a.body.orderId, shipmentNumber: "X1" },
            { orderId: b.body.orderId, shipmentNumber: "x1" },
          ],
        }),
      ).message,
    ).toMatch(/entered twice/);
    api.orders.confirmWebOrders({
      items: [
        { orderId: a.body.orderId, shipmentNumber: "LX-1" },
        { orderId: b.body.orderId, shipmentNumber: "LX-2" },
      ],
    });
    expect(api.orders.list({ needsConfirmation: true }).total).toBe(0);
    expect(api.orders.packingQueue()).toHaveLength(2);
  });

  it("limits some products to a few per order, all sizes together", async () => {
    const { db, api, app } = shopWithStock();
    const heater = stockedProduct(api, { sku: "HEAT", variants: ["S", "M"], stock: 5, price: 300 });
    api.products.setShopSection({ productIds: [heater.productId], section: "kids_accessories" });
    const p = api.products.get({ productId: heater.productId })!;
    api.products.update({ productId: heater.productId, name: p.name, category: p.category, unitPrice: 300, uom: p.uom, reorderThreshold: 0, maxPerOrder: 2 });
    expect(shopCatalog(db).find((x) => x.productId === heater.productId)?.maxPerOrder).toBe(2);
    const guest = client(app);
    const lines = [
      { productId: heater.productId, variantId: heater.variantIds[0], quantity: 2 },
      { productId: heater.productId, variantId: heater.variantIds[1], quantity: 1 },
    ];
    const tooMany = await guest.call("POST", "/api/shop/checkout", { ...details, lines });
    expect(tooMany.status).toBe(400);
    expect(JSON.stringify(tooMany.body)).toMatch(/up to 2/);
    expect((await guest.call("POST", "/api/shop/checkout", { ...details, lines: [lines[0]] })).status).toBe(200);
  });

  it("refuses more than is left, and links orders to a signed-in customer", async () => {
    const { db: database, app, body } = shopWithStock();
    const shopper = client(app);
    await shopper.call("POST", "/api/shop/signup", { name: "Sara", phone: "01112345678", password: "secret pass" });
    const tooMany = await shopper.call("POST", "/api/shop/checkout", {
      ...details,
      lines: [{ productId: body.productId, variantId: body.variantIds[1], quantity: 3, gender: "boys" }],
    });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.message).toMatch(/not enough left of: Product BODY/);
    const ok = await shopper.call("POST", "/api/shop/checkout", {
      ...details,
      lines: [{ productId: body.productId, variantId: body.variantIds[1], quantity: 2, gender: "boys" }],
    });
    expect(ok.status).toBe(200);
    const mine = await shopper.call("GET", "/api/shop/orders");
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].items).toEqual([{ name: "Product BODY", size: "3-6", quantity: 2, price: 180 }]);
    const me = await shopper.call("GET", "/api/shop/me");
    expect(me.body.sizes).toHaveLength(1);
    expect(me.body.customer).toMatchObject({ governorate: "الجيزة", city: "فيصل", address: "12 Street" });
    expect(shopCatalog(database).find((p) => p.productId === body.productId)!.options[1].maxQuantity).toBe(0);
  });
});

describe("website controls", () => {
  function controlled() {
    const { db, api } = setup();
    setSetting(db, "shop_open", "1");
    const app = createApp({ db, env: { NODE_ENV: "test", APP_ORIGIN: undefined }, log: () => {} });
    const site = (patch: Partial<ReturnType<typeof api.shop.site>>) => api.shop.updateSite({ ...api.shop.site(), ...patch });
    return { db, api, app, site };
  }
  const details = { name: "Mona", phone: "01012345678", governorate: "الجيزة", city: "فيصل", address: "12 Street" };

  it("closes the website for maintenance, but the team can still get in", async () => {
    const { app, site } = controlled();
    site({ maintenance: true });
    const guest = client(app);
    expect((await guest.call("GET", "/api/shop/config")).body).toMatchObject({ open: true, maintenance: true, preview: false });
    const blocked = await guest.call("GET", "/api/shop/catalog");
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toMatch(/Back shortly/);
  });

  it("pauses orders and new accounts, and shows the announcement and Messenger link", async () => {
    const { api, app, site } = controlled();
    const p = stockedProduct(api, { sku: "BIB", stock: 5, price: 60, needsGender: false });
    api.products.setShopSection({ productIds: [p.productId], section: "kids_accessories" });
    site({ ordersPaused: true, signupsPaused: true, announcement: "Eid: delivery in 5 days", messenger: "https://www.facebook.com/auriance/" });
    const guest = client(app);
    expect((await guest.call("GET", "/api/shop/config")).body).toMatchObject({
      ordersPaused: true,
      signupsPaused: true,
      announcement: "Eid: delivery in 5 days",
      messenger: "auriance",
    });
    const order = await guest.call("POST", "/api/shop/checkout", { ...details, lines: [{ productId: p.productId, variantId: null, quantity: 1 }] });
    expect(order.status).toBe(403);
    expect(order.body.message).toMatch(/paused new orders/);
    expect((await guest.call("POST", "/api/shop/signup", { name: "Mona", phone: "01012345678", password: "secret pass" })).status).toBe(403);
    site({ ordersPaused: false, signupsPaused: false });
    expect((await guest.call("POST", "/api/shop/checkout", { ...details, lines: [{ productId: p.productId, variantId: null, quantity: 1 }] })).status).toBe(200);
    expect(appError(() => site({ messenger: "not a page!" })).message).toMatch(/Facebook page/);
  });

  it("shows sold-out products when asked, lists off-season ones last, and picks the checkout extra", async () => {
    const { db, api, site } = controlled();
    const coat = stockedProduct(api, { sku: "COAT", stock: 3, price: 400, needsGender: false });
    const tee = stockedProduct(api, { sku: "TEE", stock: 3, price: 150, needsGender: false });
    const gone = stockedProduct(api, { sku: "GONE", stock: 0, price: 100, needsGender: false });
    const bib = stockedProduct(api, { sku: "BIB", stock: 3, price: 60, needsGender: false });
    const towel = stockedProduct(api, { sku: "TOWEL", stock: 3, price: 90, needsGender: false });
    api.products.setShopSection({ productIds: [coat.productId, tee.productId, gone.productId], section: "kids_clothes" });
    api.products.setShopSection({ productIds: [bib.productId, towel.productId], section: "kids_accessories" });
    api.products.setSeason({ productIds: [coat.productId], season: "winter" });
    api.products.setSeason({ productIds: [tee.productId], season: "summer" });

    expect(shopCatalog(db).some((x) => x.productId === gone.productId)).toBe(false);
    site({ hideSoldOut: false, season: "winter" });
    const list = shopCatalog(db);
    expect(list.find((x) => x.productId === gone.productId)).toMatchObject({ soldOut: true });
    expect(list.find((x) => x.productId === tee.productId)).toMatchObject({ offSeason: true });
    expect(list.find((x) => x.productId === coat.productId)).toMatchObject({ offSeason: false });
    // In season first, then off-season, then sold out
    const order = list.map((x) => x.productId);
    expect(order.indexOf(tee.productId)).toBeGreaterThan(order.indexOf(coat.productId));
    expect(order.at(-1)).toBe(gone.productId);

    // No extras chosen: the cheapest kids accessories
    expect(checkoutExtras(shopCatalog(db), api.shop.site())).toEqual([bib.productId, towel.productId]);
    site({ checkoutExtras: [tee.productId, towel.productId] });
    // The summer tee is off season in winter, so the towel is offered
    expect(checkoutExtras(shopCatalog(db), api.shop.site())).toEqual([towel.productId]);
  });
});

describe("shopping for, who products are for, and where to find us", () => {
  it("remembers boy, girl or twins on the account and tags products for boys or girls", async () => {
    const { db, api } = setup();
    setSetting(db, "shop_open", "1");
    const app = createApp({ db, env: { NODE_ENV: "test", APP_ORIGIN: undefined }, log: () => {} });
    const c = client(app);
    expect((await c.call("POST", "/api/shop/signup", { name: "Mona", phone: "01012345678", password: "secret pass" })).status).toBe(200);
    expect((await c.call("POST", "/api/shop/shopping-for", { gender: "girls", twins: "mixed" })).body).toEqual({ gender: null, twins: "mixed" });
    expect((await c.call("GET", "/api/shop/me")).body.customer.shoppingFor).toEqual({ gender: null, twins: "mixed" });
    await c.call("POST", "/api/shop/shopping-for", { gender: "boys", twins: null });
    expect((await c.call("GET", "/api/shop/me")).body.customer.shoppingFor).toEqual({ gender: "boys", twins: null });

    const p = stockedProduct(api, { sku: "TEE", stock: 2, price: 100, needsGender: false });
    api.products.setShopSection({ productIds: [p.productId], section: "kids_clothes" });
    expect(shopCatalog(db)[0].audience).toBe("both");
    api.products.setAudience({ productIds: [p.productId], audience: "girls" });
    expect(shopCatalog(db)[0].audience).toBe("girls");
  });

  it("shows the contact details and turns away share links", async () => {
    const { db, api } = setup();
    setSetting(db, "shop_open", "1");
    const app = createApp({ db, env: { NODE_ENV: "test", APP_ORIGIN: undefined }, log: () => {} });
    expect((await client(app).call("GET", "/api/shop/config")).body.contact).toEqual({
      facebook: "",
      instagram: "",
      tiktok: "",
      phone: "",
      email: "",
    });
    const site = api.shop.site();
    expect(appError(() => api.shop.updateSite({ ...site, messenger: "https://www.facebook.com/share/19czHMpsys/" })).message).toMatch(/Facebook page/);
    expect(appError(() => api.shop.updateSite({ ...site, facebook: "https://www.facebook.com/share/19czHMpsys/" })).message).toMatch(/Facebook username/);
    const saved = api.shop.updateSite({ ...site, instagram: "https://www.instagram.com/auriance12/", tiktok: "@auriance12", phone: "0238221076" });
    expect(saved).toMatchObject({ instagram: "auriance12", tiktok: "auriance12", phone: "0238221076" });
  });
});

describe("promo codes at checkout", () => {
  function promoShop() {
    const { db, api } = setup();
    setSetting(db, "shop_open", "1");
    const app = createApp({ db, env: { NODE_ENV: "test", APP_ORIGIN: undefined }, log: () => {} });
    const p = stockedProduct(api, { sku: "TEE", stock: 20, price: 200, needsGender: false });
    api.products.setShopSection({ productIds: [p.productId], section: "kids_clothes" });
    const rule = {
      name: "Eid 2026",
      kind: "percent" as const,
      value: 15,
      maxDiscount: 100,
      minOrder: 500,
      startsAt: null,
      endsAt: null,
      active: true,
      maxUses: null,
      oncePerCustomer: true,
      section: null,
    };
    return { db, api, app, p, rule };
  }
  const details = { name: "Mona", phone: "01012345678", governorate: "الجيزة", city: "فيصل", address: "12 Street" };

  it("checks a code against the cart, applies it to the order, and allows it once per customer", async () => {
    const { db, api, app, p, rule } = promoShop();
    api.promos.create({ code: "eid2026", rule });
    const c = client(app);
    const lines = (n: number) => [{ productId: p.productId, variantId: null, quantity: n }];
    // 2 × 200 = 400: under the 500 minimum
    const small = await c.call("POST", "/api/shop/promo", { code: "EID2026", lines: lines(2) });
    expect(small.status).toBe(400);
    expect(small.body.message).toMatch(/^Add .*100.* more to use this code$/);
    // 4 × 200 = 800: 15% is 120, capped at 100
    expect((await c.call("POST", "/api/shop/promo", { code: "eid2026", lines: lines(4) })).body).toMatchObject({ code: "EID2026", discount: 100, freeShipping: false });
    const order = await c.call("POST", "/api/shop/checkout", { ...details, promoCode: "eid2026", lines: lines(4) });
    expect(order.status).toBe(200);
    expect(order.body).toMatchObject({ total: 700, discount: 100, promoCode: "EID2026" });
    const saved = db.select().from(orders).all().at(-1)!;
    expect(saved).toMatchObject({ subtotal: 800, discountAmount: 100, total: 700, promoCode: "EID2026" });
    // The same phone can't use it again
    const again = await c.call("POST", "/api/shop/checkout", { ...details, promoCode: "EID2026", lines: lines(4) });
    expect(again.status).toBe(400);
    expect(again.body.message).toBe("You've already used this code");
    expect(api.promos.list()[0]).toMatchObject({ uses: 1, given: 100 });
    // A used code can't be renamed or deleted, only switched off
    expect(appError(() => api.promos.remove({ promoId: api.promos.list()[0]._id })).message).toMatch(/switch it off/);
  });

  it("gives free shipping, and makes private codes that work once", async () => {
    const { db, api, app, p, rule } = promoShop();
    const { codes } = api.promos.generate({ count: 3, prefix: "VIP", rule: { ...rule, kind: "free_shipping", value: 0, maxDiscount: null, minOrder: null } });
    expect(codes).toHaveLength(3);
    expect(new Set(codes).size).toBe(3);
    const c = client(app);
    const order = await c.call("POST", "/api/shop/checkout", { ...details, promoCode: codes[0], lines: [{ productId: p.productId, variantId: null, quantity: 1 }] });
    expect(order.body).toMatchObject({ total: 200, shippingFee: 0, discount: 0 });
    const other = await client(app).call("POST", "/api/shop/checkout", { ...details, phone: "01198765432", promoCode: codes[0], lines: [{ productId: p.productId, variantId: null, quantity: 1 }] });
    expect(other.body.message).toBe("This code has already been used up");
    expect(db.select().from(orders).all().at(-1)!.promoCode).toBe(codes[0]);
    // Codes that don't exist, or are off
    expect((await c.call("POST", "/api/shop/promo", { code: "NOPE", lines: [{ productId: p.productId, variantId: null, quantity: 1 }] })).body.message).toBe("We don't recognise this code");
  });
});
