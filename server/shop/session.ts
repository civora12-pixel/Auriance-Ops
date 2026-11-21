import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { DB } from "../db/client.ts";
import { customerSessions, customerTokens, customers } from "../db/schema.ts";
import type { Customer } from "../db/schema.ts";
import { hashToken, randomToken } from "../auth/session.ts";

/** Separate from the team's cookie: a shopper is never a team member. */
export const CUSTOMER_COOKIE = "auriance_shop";
const DAY = 24 * 3600_000;
export const CUSTOMER_SESSION_MS = 90 * DAY;
export const RESET_LINK_MS = 2 * DAY;
export const VERIFY_LINK_MS = 7 * DAY;

export function createCustomerSession(db: DB, customerId: string, userAgent: string | undefined): string {
  const token = randomToken();
  db.insert(customerSessions)
    .values({
      _id: hashToken(token),
      customerId,
      expiresAt: Date.now() + CUSTOMER_SESSION_MS,
      userAgent: userAgent?.slice(0, 300) ?? null,
    })
    .run();
  return token;
}

/** The signed-in customer (sliding expiry, extended at most once a day). */
export function resolveCustomer(db: DB, token: string | undefined): { sessionId: string; customer: Customer } | null {
  if (!token || token.length > 200) return null;
  const row = db
    .select({ session: customerSessions, customer: customers })
    .from(customerSessions)
    .innerJoin(customers, eq(customerSessions.customerId, customers._id))
    .where(eq(customerSessions._id, hashToken(token)))
    .get();
  if (!row) return null;
  const now = Date.now();
  if (row.session.expiresAt < now || !row.customer.isActive) {
    db.delete(customerSessions).where(eq(customerSessions._id, row.session._id)).run();
    return null;
  }
  if (row.session.expiresAt - now < CUSTOMER_SESSION_MS - DAY) {
    db.update(customerSessions)
      .set({ expiresAt: now + CUSTOMER_SESSION_MS })
      .where(eq(customerSessions._id, row.session._id))
      .run();
  }
  return { sessionId: row.session._id, customer: row.customer };
}

export function endCustomerSessions(db: DB, customerId: string, keepSessionId?: string): void {
  for (const s of db.select().from(customerSessions).where(eq(customerSessions.customerId, customerId)).all()) {
    if (s._id !== keepSessionId) db.delete(customerSessions).where(eq(customerSessions._id, s._id)).run();
  }
}

/** One-time link. Older unused links of the same kind stop working. */
export function createCustomerToken(
  db: DB,
  customerId: string,
  kind: "reset" | "verify",
  email?: string,
): { token: string; expiresAt: number } {
  db.delete(customerTokens)
    .where(and(eq(customerTokens.customerId, customerId), eq(customerTokens.kind, kind), isNull(customerTokens.usedAt)))
    .run();
  const token = randomToken();
  const expiresAt = Date.now() + (kind === "reset" ? RESET_LINK_MS : VERIFY_LINK_MS);
  db.insert(customerTokens)
    .values({ _id: hashToken(token), customerId, kind, email: email ?? null, expiresAt })
    .run();
  return { token, expiresAt };
}

export function findCustomerToken(db: DB, token: string, kind: "reset" | "verify") {
  if (!token || token.length > 200) return undefined;
  const row = db.select().from(customerTokens).where(eq(customerTokens._id, hashToken(token))).get();
  if (!row || row.kind !== kind || row.usedAt || row.expiresAt < Date.now()) return undefined;
  return row;
}

export const customerLinkPath = (kind: "reset" | "verify", token: string) =>
  `/shop/${kind === "reset" ? "reset" : "verify"}/${token}`;

function isSecure(c: Context): boolean {
  const proto = c.req.header("x-forwarded-proto") ?? new URL(c.req.url).protocol.replace(":", "");
  return proto === "https";
}

export const readCustomerCookie = (c: Context) => getCookie(c, CUSTOMER_COOKIE);

export function writeCustomerCookie(c: Context, token: string): void {
  setCookie(c, CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Lax",
    path: "/",
    maxAge: CUSTOMER_SESSION_MS / 1000,
  });
}

export function clearCustomerCookie(c: Context): void {
  deleteCookie(c, CUSTOMER_COOKIE, { path: "/", secure: isSecure(c) });
}

/** The site's public address for links in emails. */
export function originOf(c: Context, appOrigin: string | undefined): string {
  if (appOrigin) return appOrigin.replace(/\/$/, "");
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? new URL(c.req.url).host;
  return `${isSecure(c) ? "https" : "http"}://${host}`;
}
