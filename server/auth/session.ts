import { createHash, randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { DB } from "../db/client.ts";
import { sessions, users } from "../db/schema.ts";
import type { Session, User } from "../db/schema.ts";

export const SESSION_COOKIE = "auriance_session";
const DAY = 24 * 3600_000;
export const SESSION_TTL_MS = 30 * DAY;
export const ADMIN_MODE_MS = 15 * 60_000;

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(db: DB, userId: string, userAgent: string | undefined): string {
  const token = randomToken();
  db.insert(sessions)
    .values({
      _id: hashToken(token),
      userId,
      expiresAt: Date.now() + SESSION_TTL_MS,
      userAgent: userAgent?.slice(0, 300) ?? null,
    })
    .run();
  return token;
}

/** Looks up a live session; extends it (sliding expiry) at most once a day. */
export function resolveSession(db: DB, token: string | undefined): { session: Session; user: User } | null {
  if (!token || token.length > 200) return null;
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users._id))
    .where(eq(sessions._id, hashToken(token)))
    .get();
  if (!row) return null;
  const now = Date.now();
  if (row.session.expiresAt < now || !row.user.isActive) {
    db.delete(sessions).where(eq(sessions._id, row.session._id)).run();
    return null;
  }
  if (row.session.expiresAt - now < SESSION_TTL_MS - DAY) {
    const expiresAt = now + SESSION_TTL_MS;
    db.update(sessions).set({ expiresAt }).where(eq(sessions._id, row.session._id)).run();
    row.session.expiresAt = expiresAt;
  }
  return row;
}

export function deleteSession(db: DB, sessionId: string): void {
  db.delete(sessions).where(eq(sessions._id, sessionId)).run();
}

/** Signs a user out everywhere (optionally keeping the current session). */
export function deleteUserSessions(db: DB, userId: string, keepSessionId?: string): void {
  db.delete(sessions)
    .where(keepSessionId ? and(eq(sessions.userId, userId), ne(sessions._id, keepSessionId)) : eq(sessions.userId, userId))
    .run();
}

export function setElevated(db: DB, sessionId: string, until: number | null): void {
  db.update(sessions).set({ elevatedUntil: until }).where(eq(sessions._id, sessionId)).run();
}

function isSecure(c: Context): boolean {
  const proto = c.req.header("x-forwarded-proto") ?? new URL(c.req.url).protocol.replace(":", "");
  return proto === "https";
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export function writeSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isSecure(c) });
}
