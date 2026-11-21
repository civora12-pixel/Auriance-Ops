import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { DB } from "../db/client.ts";
import { customerSessions, customerTokens, customers, orderLineItems, orders, users } from "../db/schema.ts";
import type { Customer, Session, User } from "../db/schema.ts";
import { burnPasswordCheck, hashPassword, passwordProblem, verifyPassword } from "../auth/password.ts";
import { RateLimiter } from "../auth/rateLimit.ts";
import { readSessionCookie, resolveSession } from "../auth/session.ts";
import { langFrom, translate } from "../i18n/translate.ts";
import type { Lang } from "../i18n/translate.ts";
import { buttonEmail, disabledMailer } from "../lib/email.ts";
import type { Mailer } from "../lib/email.ts";
import { todayIn } from "../../shared/dates.ts";
import { getTimeZone, moneyFormatter } from "../lib/settings.ts";
import { evaluatePromo, promoMessage } from "../lib/promos.ts";
import { MAX_PER_LINE, checkoutExtras, publicCustomer, purchasedSizes, shopCatalog, shopSettings, siteSettings } from "../modules/shop.ts";
import { AppError, afterMutation, zodParams } from "../rpc/procedure.ts";
import type { Ctx } from "../rpc/procedure.ts";
import { placeWebOrder } from "../modules/orders.ts";
import { isEgyptianMobile, isEgyptianPhone, normalizePhone } from "../../shared/phone.ts";
import { GENDERS } from "../../shared/constants.ts";
import { isCourierCity, isGovernorate } from "../../shared/courier-areas.ts";
import { shippingFeeFor } from "../../shared/shipping-zones.ts";
import { MAX_CHILDREN, parseKind, validChildren } from "../../shared/little-ones.ts";
import {
  clearCustomerCookie,
  createCustomerSession,
  createCustomerToken,
  customerLinkPath,
  endCustomerSessions,
  findCustomerToken,
  originOf,
  readCustomerCookie,
  resolveCustomer,
  writeCustomerCookie,
} from "./session.ts";

const zName = z.string().trim().min(1, "Enter your name").max(100);
const zPhone = z
  .string()
  .max(30)
  .transform(normalizePhone)
  .refine(isEgyptianMobile, "Enter an Egyptian mobile number, like 01012345678");
const zOptPhone = z
  .string()
  .max(30)
  .optional()
  .transform((s) => (s?.trim() ? normalizePhone(s) : undefined))
  // The alternative number can be a landline (for the courier when the mobile signal is weak)
  .refine((s) => s === undefined || isEgyptianPhone(s), "Second phone must be an Egyptian mobile (11 digits) or a landline with its area code (10 digits)");
const zEmail = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);
const zOptEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .optional()
  .transform((s) => (s ? s : undefined))
  .refine((s) => s === undefined || z.email().safeParse(s).success, "Enter a valid email address");
const zOptText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((s) => (s ? s : null));

function clientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local";
}

const lang = (c: Context): Lang => langFrom(c.req.header("accept-language"));

function fail(c: Context, status: 400 | 401 | 403 | 404 | 409 | 429, code: string, message: string) {
  return c.json({ code, message: translate(message, lang(c)) }, status);
}

async function readJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T> | { error: string }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { error: "Invalid request body" };
  }
  const parsed = schema.safeParse(body, zodParams(lang(c)));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  return parsed.data;
}

/** Website orders are recorded under the first admin until a moderator confirms them (and becomes the rep). */
function websiteUser(db: DB): User | undefined {
  return db
    .select()
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true)))
    .orderBy(users._creationTime)
    .get();
}
const SYSTEM_SESSION: Session = { _id: "website", _creationTime: 0, userId: "", expiresAt: 0, elevatedUntil: null, userAgent: null };

const isError = (v: unknown): v is { error: string } => typeof v === "object" && v !== null && "error" in v;

/** Email text in the customer's language. */
const COPY = {
  en: {
    verifySubject: "Confirm your email",
    verifyBody: "Tap the button to confirm this email for your Auriance account. We'll use it for password resets.",
    verifyButton: "Confirm email",
    resetSubject: "Reset your password",
    resetBody: "Tap the button to choose a new password for your Auriance account. The link works for 2 days.",
    resetButton: "Choose a new password",
    hello: (name: string) => `Hi ${name},`,
    footer: "Didn't ask for this? You can ignore this email.",
  },
  ar: {
    verifySubject: "أكّد بريدك الإلكتروني",
    verifyBody: "اضغط على الزر لتأكيد هذا البريد لحسابك في Auriance. سنستخدمه لاستعادة كلمة المرور.",
    verifyButton: "تأكيد البريد",
    resetSubject: "إعادة تعيين كلمة المرور",
    resetBody: "اضغط على الزر لاختيار كلمة مرور جديدة لحسابك في Auriance. الرابط صالح لمدة يومين.",
    resetButton: "اختيار كلمة مرور جديدة",
    hello: (name: string) => `أهلاً ${name}،`,
    footer: "لم تطلب ذلك؟ يمكنك تجاهل هذه الرسالة.",
  },
};

/**
 * The customer shop's API: the catalog and shopper accounts.
 * Until the shop opens (Settings → Shop) only signed-in team members can use it.
 */
export function shopRoutes(db: DB, opts: { appOrigin?: string; mailer?: Mailer } = {}) {
  const app = new Hono();
  const mailer = opts.mailer ?? disabledMailer;
  const loginLimiter = new RateLimiter(10, 15 * 60_000);
  const ipLimiter = new RateLimiter(60, 15 * 60_000);
  const emailLimiter = new RateLimiter(5, 60 * 60_000);

  const isTeam = (c: Context) => !!resolveSession(db, readSessionCookie(c));
  const current = (c: Context) => resolveCustomer(db, readCustomerCookie(c));

  const sendVerify = async (c: Context, customer: Customer, email: string) => {
    if (!mailer.enabled) return;
    const { token } = createCustomerToken(db, customer._id, "verify", email);
    const t = COPY[lang(c)];
    await mailer.send(
      buttonEmail({
        lang: lang(c),
        to: email,
        subject: t.verifySubject,
        greeting: t.hello(customer.name),
        body: t.verifyBody,
        button: t.verifyButton,
        url: `${originOf(c, opts.appOrigin)}${customerLinkPath("verify", token)}`,
        footer: t.footer,
      }),
    );
  };

  // Shop status: answered even while the shop is closed, so the page can say so
  app.get("/config", (c) => {
    const settings = shopSettings(db);
    const site = siteSettings(db);
    const closed = !settings.open || site.maintenance;
    return c.json({
      open: settings.open,
      maintenance: site.maintenance,
      preview: closed && isTeam(c),
      whatsapp: settings.whatsapp,
      messenger: site.messenger || null,
      shippingFee: settings.shippingFee,
      emailEnabled: mailer.enabled,
      ordersPaused: site.ordersPaused,
      signupsPaused: site.signupsPaused,
      announcement: site.announcement || null,
      contact: {
        facebook: site.facebook || null,
        instagram: site.instagram || null,
        tiktok: site.tiktok || null,
        phone: site.phone || null,
        email: site.email || null,
      },
    });
  });

  // Closed (not launched yet, or down for maintenance): only the team gets in
  app.use("*", async (c, next) => {
    const site = siteSettings(db);
    if ((!shopSettings(db).open || site.maintenance) && !isTeam(c)) {
      return fail(c, 403, "FORBIDDEN", site.maintenance ? "We're making a few updates. Back shortly!" : "The shop isn't open yet");
    }
    await next();
  });

  app.get("/catalog", (c) => c.json(shopCatalog(db)));

  /** The small extras the checkout offers (product ids, in order). */
  app.get("/extras", (c) => c.json(checkoutExtras(shopCatalog(db), siteSettings(db))));

  app.get("/me", (c) => {
    const auth = current(c);
    if (!auth) return c.json({ customer: null, sizes: [] });
    return c.json({ customer: publicCustomer(auth.customer), sizes: purchasedSizes(db, auth.customer._id) });
  });

  app.post("/signup", async (c) => {
    const body = await readJson(
      c,
      z.object({ name: zName, phone: zPhone, email: zOptEmail, password: z.string().max(200) }),
    );
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    if (siteSettings(db).signupsPaused && !isTeam(c)) {
      return fail(c, 403, "FORBIDDEN", "New accounts are paused for now. You can still order as a guest.");
    }
    if (!ipLimiter.hit(clientIp(c))) return fail(c, 429, "RATE_LIMITED", "Too many attempts. Wait 15 minutes.");
    const problem = passwordProblem(body.password);
    if (problem) return fail(c, 400, "BAD_REQUEST", problem);
    if (db.select().from(customers).where(eq(customers.phone, body.phone)).get()) {
      return fail(c, 409, "CONFLICT", "An account with this phone number already exists. Sign in instead.");
    }
    if (body.email && db.select().from(customers).where(eq(customers.email, body.email)).get()) {
      return fail(c, 409, "CONFLICT", "An account with this email already exists. Sign in instead.");
    }
    const passwordHash = await hashPassword(body.password);
    const customer = db
      .insert(customers)
      .values({
        name: body.name,
        phone: body.phone,
        email: body.email ?? null,
        passwordHash,
        lastLoginAt: Date.now(),
      })
      .returning()
      .get();
    writeCustomerCookie(c, createCustomerSession(db, customer._id, c.req.header("user-agent")));
    if (body.email) await sendVerify(c, customer, body.email);
    return c.json({ customer: publicCustomer(customer) });
  });

  app.post("/login", async (c) => {
    const body = await readJson(
      c,
      z.object({ login: z.string().trim().min(1, "Enter your phone number or email").max(200), password: z.string().min(1, "Enter your password").max(200) }),
    );
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    const ip = clientIp(c);
    const login = body.login.includes("@") ? body.login.toLowerCase() : normalizePhone(body.login);
    const key = `${ip}|${login}`;
    if (!ipLimiter.hit(ip) || !loginLimiter.check(key)) {
      return fail(c, 429, "RATE_LIMITED", "Too many sign-in attempts. Wait 15 minutes and try again.");
    }
    const customer = db
      .select()
      .from(customers)
      .where(login.includes("@") ? eq(customers.email, login) : eq(customers.phone, login))
      .get();
    const ok = customer
      ? await verifyPassword(body.password, customer.passwordHash)
      : (await burnPasswordCheck(body.password), false);
    if (!customer || !ok) {
      loginLimiter.hit(key);
      return fail(c, 401, "UNAUTHENTICATED", "Phone, email or password is incorrect");
    }
    if (!customer.isActive) return fail(c, 403, "FORBIDDEN", "This account is closed. Message us on WhatsApp for help.");
    loginLimiter.reset(key);
    db.update(customers).set({ lastLoginAt: Date.now() }).where(eq(customers._id, customer._id)).run();
    writeCustomerCookie(c, createCustomerSession(db, customer._id, c.req.header("user-agent")));
    return c.json({ customer: publicCustomer(customer) });
  });

  app.post("/logout", (c) => {
    const auth = current(c);
    if (auth) db.delete(customerSessions).where(eq(customerSessions._id, auth.sessionId)).run();
    clearCustomerCookie(c);
    return c.json({ ok: true });
  });

  app.post("/profile", async (c) => {
    const auth = current(c);
    if (!auth) return fail(c, 401, "UNAUTHENTICATED", "Sign in again to continue");
    const body = await readJson(
      c,
      z.object({
        name: zName,
        phone: zPhone,
        phone2: zOptPhone,
        email: zOptEmail,
        governorate: zOptText(60),
        city: zOptText(100),
        address: zOptText(500),
        babyAgeMonths: z.number().min(0, "Enter the age in months").max(72, "Enter the age in months").nullable().optional(),
      }),
    );
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    if (body.governorate && !isGovernorate(body.governorate)) return fail(c, 400, "BAD_REQUEST", "Choose your governorate from the list");
    if (body.city && body.governorate && !isCourierCity(body.governorate, body.city)) {
      return fail(c, 400, "BAD_REQUEST", "Choose your city or area from the list");
    }
    const me = auth.customer;
    const taken = db.select().from(customers).where(and(eq(customers.phone, body.phone), ne(customers._id, me._id))).get();
    if (taken) return fail(c, 409, "CONFLICT", "Another account uses this phone number");
    if (body.email) {
      const used = db.select().from(customers).where(and(eq(customers.email, body.email), ne(customers._id, me._id))).get();
      if (used) return fail(c, 409, "CONFLICT", "Another account uses this email");
    }
    const emailChanged = (body.email ?? null) !== me.email;
    const today = todayIn(getTimeZone(db));
    const age =
      body.babyAgeMonths === undefined
        ? {}
        : body.babyAgeMonths === null
          ? { babyAgeMonths: null, babyAgeDay: null }
          : { babyAgeMonths: Math.round(body.babyAgeMonths * 10) / 10, babyAgeDay: today };
    const updated = db
      .update(customers)
      .set({
        name: body.name,
        phone: body.phone,
        phone2: body.phone2 ?? null,
        email: body.email ?? null,
        governorate: body.governorate,
        city: body.city,
        address: body.address,
        ...age,
        ...(emailChanged ? { emailVerifiedAt: null } : {}),
      })
      .where(eq(customers._id, me._id))
      .returning()
      .get();
    if (emailChanged && body.email) await sendVerify(c, updated, body.email);
    return c.json({ customer: publicCustomer(updated) });
  });

  /** Just the baby's age (also used by the age question on the shop pages). */
  app.post("/baby-age", async (c) => {
    const auth = current(c);
    if (!auth) return fail(c, 401, "UNAUTHENTICATED", "Sign in again to continue");
    const body = await readJson(c, z.object({ months: z.number().min(0, "Enter the age in months").max(72, "Enter the age in months").nullable() }));
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    const day = todayIn(getTimeZone(db));
    const updated = db
      .update(customers)
      .set(
        body.months === null
          ? { babyAgeMonths: null, babyAgeDay: null }
          : { babyAgeMonths: Math.round(body.months * 10) / 10, babyAgeDay: day },
      )
      .where(eq(customers._id, auth.customer._id))
      .returning()
      .get();
    return c.json({ customer: publicCustomer(updated) });
  });

  /** Who the customer shops for: a boy, a girl, or twins. */
  app.post("/shopping-for", async (c) => {
    const auth = current(c);
    if (!auth) return fail(c, 401, "UNAUTHENTICATED", "Sign in again to continue");
    const body = await readJson(c, z.object({ gender: z.enum(["boys", "girls"]).nullable(), twins: z.enum(["boys", "girls", "mixed"]).nullable() }));
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    const kind = parseKind(body);
    db.update(customers).set({ shoppingFor: kind ? JSON.stringify(kind) : null }).where(eq(customers._id, auth.customer._id)).run();
    return c.json(kind);
  });

  /** "My little ones": the children's birthdays, boy or girl, and names. */
  app.post("/children", async (c) => {
    const auth = current(c);
    if (!auth) return fail(c, 401, "UNAUTHENTICATED", "Sign in again to continue");
    const body = await readJson(c, z.object({ children: z.array(z.unknown()).max(MAX_CHILDREN, "You can add up to 6 children") }));
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    const list = validChildren(body.children, todayIn(getTimeZone(db)));
    if (!list) return fail(c, 400, "BAD_REQUEST", "Check the birthdays: they can't be in the future or more than 6 years ago");
    const updated = db
      .update(customers)
      .set({ children: JSON.stringify(list) })
      .where(eq(customers._id, auth.customer._id))
      .returning()
      .get();
    return c.json({ customer: publicCustomer(updated) });
  });

  app.post("/password", async (c) => {
    const auth = current(c);
    if (!auth) return fail(c, 401, "UNAUTHENTICATED", "Sign in again to continue");
    const body = await readJson(c, z.object({ currentPassword: z.string().min(1, "Enter your password").max(200), newPassword: z.string().max(200) }));
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    const key = `pw|${auth.customer._id}`;
    if (!loginLimiter.check(key)) return fail(c, 429, "RATE_LIMITED", "Too many attempts. Wait 15 minutes.");
    if (!(await verifyPassword(body.currentPassword, auth.customer.passwordHash))) {
      loginLimiter.hit(key);
      return fail(c, 400, "BAD_REQUEST", "Current password is incorrect");
    }
    const problem = passwordProblem(body.newPassword);
    if (problem) return fail(c, 400, "BAD_REQUEST", problem);
    const passwordHash = await hashPassword(body.newPassword);
    db.update(customers).set({ passwordHash }).where(eq(customers._id, auth.customer._id)).run();
    endCustomerSessions(db, auth.customer._id, auth.sessionId);
    return c.json({ ok: true });
  });

  /** Emails a reset link to a confirmed address. Always answers the same, so it can't reveal who has an account. */
  app.post("/forgot", async (c) => {
    const body = await readJson(c, z.object({ email: zEmail }));
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    if (!mailer.enabled) return fail(c, 400, "BAD_REQUEST", "Email reset isn't available yet. Message us on WhatsApp instead.");
    if (!ipLimiter.hit(clientIp(c)) || !emailLimiter.hit(body.email)) {
      return fail(c, 429, "RATE_LIMITED", "Too many attempts. Wait 15 minutes.");
    }
    const customer = db.select().from(customers).where(eq(customers.email, body.email)).get();
    if (customer && customer.isActive && customer.emailVerifiedAt) {
      const { token } = createCustomerToken(db, customer._id, "reset");
      const t = COPY[lang(c)];
      await mailer.send(
        buttonEmail({
          lang: lang(c),
          to: body.email,
          subject: t.resetSubject,
          greeting: t.hello(customer.name),
          body: t.resetBody,
          button: t.resetButton,
          url: `${originOf(c, opts.appOrigin)}${customerLinkPath("reset", token)}`,
          footer: t.footer,
        }),
      );
    }
    return c.json({ ok: true });
  });

  app.get("/reset/:token", (c) => {
    const row = findCustomerToken(db, c.req.param("token"), "reset");
    const customer = row && db.select().from(customers).where(eq(customers._id, row.customerId)).get();
    if (!row || !customer || !customer.isActive) {
      return fail(c, 404, "NOT_FOUND", "This link is invalid or has expired. Ask us for a new one on WhatsApp.");
    }
    return c.json({ name: customer.name });
  });

  app.post("/reset/:token", async (c) => {
    const body = await readJson(c, z.object({ password: z.string().max(200) }));
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    const problem = passwordProblem(body.password);
    if (problem) return fail(c, 400, "BAD_REQUEST", problem);
    const passwordHash = await hashPassword(body.password);
    const token = c.req.param("token");
    const customer = db.$client
      .transaction(() => {
        const row = findCustomerToken(db, token, "reset");
        if (!row) return null;
        const target = db.select().from(customers).where(eq(customers._id, row.customerId)).get();
        if (!target || !target.isActive) return null;
        db.update(customerTokens).set({ usedAt: Date.now() }).where(eq(customerTokens._id, row._id)).run();
        endCustomerSessions(db, target._id);
        return db
          .update(customers)
          .set({ passwordHash, lastLoginAt: Date.now() })
          .where(eq(customers._id, target._id))
          .returning()
          .get();
      })
      .immediate();
    if (!customer) return fail(c, 404, "NOT_FOUND", "This link is invalid or has expired. Ask us for a new one on WhatsApp.");
    writeCustomerCookie(c, createCustomerSession(db, customer._id, c.req.header("user-agent")));
    return c.json({ customer: publicCustomer(customer) });
  });

  app.post("/verify/:token", (c) => {
    const row = findCustomerToken(db, c.req.param("token"), "verify");
    const customer = row && db.select().from(customers).where(eq(customers._id, row.customerId)).get();
    // The link only confirms the address it was sent to
    if (!row || !customer || !row.email || customer.email !== row.email) {
      return fail(c, 404, "NOT_FOUND", "This link is invalid or has expired. Send a new one from your account.");
    }
    db.update(customerTokens).set({ usedAt: Date.now() }).where(eq(customerTokens._id, row._id)).run();
    db.update(customers).set({ emailVerifiedAt: Date.now() }).where(eq(customers._id, customer._id)).run();
    return c.json({ ok: true });
  });

  app.post("/resend-verification", async (c) => {
    const auth = current(c);
    if (!auth) return fail(c, 401, "UNAUTHENTICATED", "Sign in again to continue");
    if (!auth.customer.email) return fail(c, 400, "BAD_REQUEST", "Add an email to your account first");
    if (!mailer.enabled) return fail(c, 400, "BAD_REQUEST", "Email confirmation isn't available yet");
    if (!emailLimiter.hit(`verify|${auth.customer._id}`)) return fail(c, 429, "RATE_LIMITED", "Too many attempts. Wait 15 minutes.");
    await sendVerify(c, auth.customer, auth.customer.email);
    return c.json({ ok: true });
  });

  /** Places a cash-on-delivery order. It waits for the team to confirm it with the customer. */
  /** Checks a promo code against the cart (and the phone, when given): what it takes off, or why not. */
  app.post("/promo", async (c) => {
    const body = await readJson(
      c,
      z.object({
        code: z.string().trim().min(1, "Enter a code").max(40),
        phone: z.string().trim().max(20).optional(),
        governorate: z.string().trim().max(100).optional(),
        city: z.string().trim().max(100).optional(),
        lines: z
          .array(z.object({ productId: z.string().min(1).max(64), variantId: z.string().min(1).max(64).nullable(), quantity: z.number().int().min(1).max(MAX_PER_LINE) }))
          .min(1, "Your cart is empty")
          .max(50),
      }),
    );
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    if (!ipLimiter.hit(clientIp(c))) return fail(c, 429, "RATE_LIMITED", "Too many attempts. Wait 15 minutes.");
    const fee =
      (body.governorate && body.city ? shippingFeeFor(body.governorate, body.city) : null) ?? shopSettings(db).shippingFee;
    const phone = body.phone && isEgyptianPhone(body.phone) ? body.phone : null;
    const r = evaluatePromo(db, { code: body.code, lines: body.lines, phone, shippingFee: fee, now: new Date() });
    if (!r.ok) return fail(c, 400, "BAD_REQUEST", promoMessage(r, moneyFormatter(db)));
    return c.json({ code: r.promo!.code, name: r.promo!.name, discount: r.discount, freeShipping: r.freeShipping });
  });

  app.post("/checkout", async (c) => {
    const body = await readJson(
      c,
      z.object({
        name: zName,
        phone: zPhone,
        phone2: zOptPhone,
        governorate: z.string().trim().refine(isGovernorate, "Choose your governorate from the list"),
        city: z.string().trim().min(1, "Choose your city or area from the list").max(100),
        address: z.string().trim().min(1, "Enter your delivery address").max(500),
        notes: zOptText(500),
        saveDetails: z.boolean().optional(),
        promoCode: z.string().trim().max(40).optional(),
        lines: z
          .array(
            z.object({
              productId: z.string().min(1).max(64),
              variantId: z.string().min(1).max(64).nullable(),
              quantity: z.number().int().min(1).max(MAX_PER_LINE),
              gender: z.enum(GENDERS).nullable().optional(),
            }),
          )
          .min(1, "Your cart is empty")
          .max(50),
      }),
    );
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    if (siteSettings(db).ordersPaused && !isTeam(c)) {
      return fail(c, 403, "FORBIDDEN", "We've paused new orders for a short while. Please try again soon.");
    }
    if (!ipLimiter.hit(clientIp(c))) return fail(c, 429, "RATE_LIMITED", "Too many attempts. Wait 15 minutes.");
    const auth = current(c);
    const system = websiteUser(db);
    if (!system) return fail(c, 400, "BAD_REQUEST", "The shop isn't open yet");
    if (!isCourierCity(body.governorate, body.city)) return fail(c, 400, "BAD_REQUEST", "Choose your city or area from the list");
    try {
      const ctx: Ctx = { db, user: system, session: SYSTEM_SESSION, now: new Date() };
      const order = db.$client
        .transaction(() => {
          // The code is checked again here, inside the order: the final word
          const fee = shippingFeeFor(body.governorate, body.city) ?? shopSettings(db).shippingFee;
          let promo: { promoId: string; code: string; discount: number; freeShipping: boolean } | null = null;
          if (body.promoCode) {
            const r = evaluatePromo(db, { code: body.promoCode, lines: body.lines, phone: body.phone, shippingFee: fee, now: ctx.now });
            if (!r.ok) throw new AppError("BAD_REQUEST", promoMessage(r, moneyFormatter(db)));
            promo = { promoId: r.promo!._id, code: r.promo!.code, discount: r.discount, freeShipping: r.freeShipping };
          }
          const placed = placeWebOrder(ctx, {
            customerAccountId: auth?.customer._id ?? null,
            customer: body.name,
            phone: body.phone,
            phone2: body.phone2 ?? null,
            address: body.address,
            governorate: body.governorate,
            city: body.city,
            notes: body.notes,
            shippingFee: fee,
            lines: body.lines.map((l) => ({ ...l, gender: l.gender ?? null })),
            promo,
          });
          for (const hook of afterMutation) hook(ctx);
          // Signed in: keep the details for next time (only fills what's empty, unless asked to save)
          if (auth) {
            const me = auth.customer;
            const keep = body.saveDetails;
            db.update(customers)
              .set({
                phone2: keep || !me.phone2 ? (body.phone2 ?? me.phone2) : me.phone2,
                governorate: keep || !me.city ? body.governorate : me.governorate,
                city: keep || !me.city ? body.city : me.city,
                address: keep || !me.address ? body.address : me.address,
              })
              .where(eq(customers._id, me._id))
              .run();
          }
          return placed;
        })
        .immediate();
      return c.json({
        orderId: order._id,
        number: `ORD-${String(order.orderNumber).padStart(4, "0")}`,
        total: order.total,
        shippingFee: order.shippingFee,
        discount: order.discountAmount,
        promoCode: order.promoCode,
      });
    } catch (e) {
      if (e instanceof AppError) {
        return fail(c, e.code === "CONFLICT" ? 409 : 400, e.code, e.message);
      }
      throw e;
    }
  });

  app.get("/orders", (c) => {
    const auth = current(c);
    if (!auth) return fail(c, 401, "UNAUTHENTICATED", "Sign in again to continue");
    const list = db
      .select()
      .from(orders)
      .where(eq(orders.customerAccountId, auth.customer._id))
      .orderBy(desc(orders.orderNumber))
      .limit(100)
      .all();
    const lines = list.length
      ? db
          .select()
          .from(orderLineItems)
          .where(
            inArray(
              orderLineItems.orderId,
              list.map((o) => o._id),
            ),
          )
          .orderBy(sql`${orderLineItems._creationTime}`)
          .all()
      : [];
    return c.json(
      list.map((o) => ({
        _id: o._id,
        number: `ORD-${String(o.orderNumber).padStart(4, "0")}`,
        date: o.orderDate,
        status: o.status,
        total: o.total,
        shippingFee: o.shippingFee,
        items: lines
          .filter((l) => l.orderId === o._id && !l.isSwapReplacement)
          .map((l) => ({ name: l.productName, size: l.variantName, quantity: l.quantity, price: l.unitPrice })),
      })),
    );
  });

  return app;
}

/** Housekeeping: expired customer sessions and old links. */
export function pruneCustomerTables(db: DB): void {
  const now = Date.now();
  db.$client.prepare("DELETE FROM customer_sessions WHERE expires_at < ?").run(now);
  db.$client.prepare("DELETE FROM customer_tokens WHERE expires_at < ?").run(now - 30 * 24 * 3600_000);
}
