import { count, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { DB } from "../db/client.ts";
import { authTokens, users } from "../db/schema.ts";
import type { Session, User } from "../db/schema.ts";
import { getPermissions } from "../lib/permissions.ts";
import { getBusinessSettings } from "../lib/settings.ts";
import { langFrom, translate } from "../i18n/translate.ts";
import { zodParams } from "../rpc/procedure.ts";
import { burnPasswordCheck, hashPassword, passwordProblem, verifyPassword } from "./password.ts";
import {
  ADMIN_MODE_MS,
  clearSessionCookie,
  createSession,
  deleteSession,
  deleteUserSessions,
  readSessionCookie,
  resolveSession,
  setElevated,
  writeSessionCookie,
} from "./session.ts";
import { findLinkToken } from "./tokens.ts";
import { RateLimiter } from "./rateLimit.ts";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);
const password = z.string().min(1, "Enter your password").max(200);
const name = z.string().trim().min(1, "Enter your name").max(100);

export function publicUser(user: User) {
  return {
    _id: user._id,
    name: user.name ?? user.email,
    email: user.email,
    role: user.role,
    permissions: getPermissions(user),
  };
}

function clientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "local"
  );
}

/** Error response in the client's language (Accept-Language). */
function fail(c: Context, status: 400 | 401 | 403 | 404 | 409 | 429, code: string, message: string) {
  return c.json({ code, message: translate(message, langFrom(c.req.header("accept-language"))) }, status);
}

async function readJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T> | { error: string }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { error: "Invalid request body" };
  }
  const parsed = schema.safeParse(body, zodParams(langFrom(c.req.header("accept-language"))));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  return parsed.data;
}

function isError(v: unknown): v is { error: string } {
  return typeof v === "object" && v !== null && "error" in v;
}

export function authRoutes(db: DB) {
  const app = new Hono();
  const loginLimiter = new RateLimiter(10, 15 * 60_000);
  const ipLimiter = new RateLimiter(50, 15 * 60_000);

  const userCount = () => db.select({ n: count() }).from(users).get()?.n ?? 0;
  const current = (c: Context): { session: Session; user: User } | null => resolveSession(db, readSessionCookie(c));

  app.get("/me", (c) => {
    const auth = current(c);
    const settings = getBusinessSettings(db);
    if (!auth) return c.json({ user: null, needsSetup: userCount() === 0, settings });
    const elevated = auth.session.elevatedUntil;
    return c.json({
      user: publicUser(auth.user),
      adminModeUntil: elevated && elevated > Date.now() ? elevated : null,
      needsSetup: false,
      settings,
    });
  });

  // First admin, only while there are no users at all
  app.post("/setup", async (c) => {
    const body = await readJson(c, z.object({ name, email, password: z.string() }));
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    const problem = passwordProblem(body.password);
    if (problem) return fail(c, 400, "BAD_REQUEST", problem);
    const passwordHash = await hashPassword(body.password);
    const created = db.$client
      .transaction(() => {
        if (userCount() > 0) return null;
        return db
          .insert(users)
          .values({ email: body.email, name: body.name, passwordHash, role: "admin", lastLoginAt: Date.now() })
          .returning()
          .get();
      })
      .immediate();
    if (!created) return fail(c, 409, "CONFLICT", "This workspace is already set up. Sign in instead.");
    writeSessionCookie(c, createSession(db, created._id, c.req.header("user-agent")));
    return c.json({ user: publicUser(created) });
  });

  app.post("/login", async (c) => {
    const body = await readJson(c, z.object({ email, password }));
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    const ip = clientIp(c);
    const key = `${ip}|${body.email}`;
    if (!ipLimiter.hit(ip) || !loginLimiter.check(key)) {
      return fail(c, 429, "RATE_LIMITED", "Too many sign-in attempts. Wait 15 minutes and try again.");
    }
    const user = db.select().from(users).where(eq(users.email, body.email)).get();
    const ok = user?.passwordHash
      ? await verifyPassword(body.password, user.passwordHash)
      : (await burnPasswordCheck(body.password), false);
    if (!user || !ok) {
      loginLimiter.hit(key);
      return fail(c, 401, "UNAUTHENTICATED", "Email or password is incorrect");
    }
    if (!user.isActive) {
      return fail(c, 403, "FORBIDDEN", "This account is deactivated. Ask an admin to reactivate it.");
    }
    loginLimiter.reset(key);
    db.update(users).set({ lastLoginAt: Date.now() }).where(eq(users._id, user._id)).run();
    writeSessionCookie(c, createSession(db, user._id, c.req.header("user-agent")));
    return c.json({ user: publicUser(user) });
  });

  app.post("/logout", (c) => {
    const auth = current(c);
    if (auth) deleteSession(db, auth.session._id);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  app.post("/change-password", async (c) => {
    const auth = current(c);
    if (!auth) return fail(c, 401, "UNAUTHENTICATED", "Sign in again to continue");
    const body = await readJson(c, z.object({ currentPassword: password, newPassword: z.string() }));
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    const key = `pw|${auth.user._id}`;
    if (!loginLimiter.check(key)) return fail(c, 429, "RATE_LIMITED", "Too many attempts. Wait 15 minutes.");
    if (!(await verifyPassword(body.currentPassword, auth.user.passwordHash))) {
      loginLimiter.hit(key);
      return fail(c, 400, "BAD_REQUEST", "Current password is incorrect");
    }
    const problem = passwordProblem(body.newPassword);
    if (problem) return fail(c, 400, "BAD_REQUEST", problem);
    const passwordHash = await hashPassword(body.newPassword);
    db.update(users).set({ passwordHash }).where(eq(users._id, auth.user._id)).run();
    // Sign out every other device
    deleteUserSessions(db, auth.user._id, auth.session._id);
    loginLimiter.reset(key);
    return c.json({ ok: true });
  });

  // Invite and password-reset links
  app.get("/link/:token", (c) => {
    const row = findLinkToken(db, c.req.param("token"));
    const user = row && db.select().from(users).where(eq(users._id, row.userId)).get();
    if (!row || !user || !user.isActive) {
      return fail(c, 404, "NOT_FOUND", "This link is invalid or has expired. Ask an admin for a new one.");
    }
    return c.json({ kind: row.kind, email: user.email, name: user.name ?? "" });
  });

  app.post("/link/:token", async (c) => {
    const body = await readJson(c, z.object({ password: z.string(), name: name.optional() }));
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    const problem = passwordProblem(body.password);
    if (problem) return fail(c, 400, "BAD_REQUEST", problem);
    const passwordHash = await hashPassword(body.password);
    const token = c.req.param("token");
    const user = db.$client
      .transaction(() => {
        const row = findLinkToken(db, token);
        if (!row) return null;
        const target = db.select().from(users).where(eq(users._id, row.userId)).get();
        if (!target || !target.isActive) return null;
        db.update(authTokens).set({ usedAt: Date.now() }).where(eq(authTokens._id, row._id)).run();
        deleteUserSessions(db, target._id);
        return db
          .update(users)
          .set({ passwordHash, lastLoginAt: Date.now(), ...(body.name ? { name: body.name } : {}) })
          .where(eq(users._id, target._id))
          .returning()
          .get();
      })
      .immediate();
    if (!user) return fail(c, 404, "NOT_FOUND", "This link is invalid or has expired. Ask an admin for a new one.");
    writeSessionCookie(c, createSession(db, user._id, c.req.header("user-agent")));
    return c.json({ user: publicUser(user) });
  });

  // Admin Mode: re-enter your own password to unlock destructive actions for 15 minutes
  app.post("/admin-mode", async (c) => {
    const auth = current(c);
    if (!auth) return fail(c, 401, "UNAUTHENTICATED", "Sign in again to continue");
    if (auth.user.role !== "admin") return fail(c, 403, "FORBIDDEN", "Only admins can turn on Admin Mode");
    const body = await readJson(c, z.object({ password }));
    if (isError(body)) return fail(c, 400, "BAD_REQUEST", body.error);
    const key = `admin|${auth.user._id}`;
    if (!loginLimiter.check(key)) return fail(c, 429, "RATE_LIMITED", "Too many attempts. Wait 15 minutes.");
    if (!(await verifyPassword(body.password, auth.user.passwordHash))) {
      loginLimiter.hit(key);
      return fail(c, 400, "BAD_REQUEST", "Incorrect password");
    }
    loginLimiter.reset(key);
    const until = Date.now() + ADMIN_MODE_MS;
    setElevated(db, auth.session._id, until);
    return c.json({ adminModeUntil: until });
  });

  app.delete("/admin-mode", (c) => {
    const auth = current(c);
    if (auth) setElevated(db, auth.session._id, null);
    return c.json({ adminModeUntil: null });
  });

  return app;
}

/** Creates the first admin from ADMIN_EMAIL/ADMIN_PASSWORD when the database has no users. */
export async function bootstrapAdmin(
  db: DB,
  env: { ADMIN_EMAIL?: string; ADMIN_PASSWORD?: string; ADMIN_NAME?: string },
): Promise<"created" | "skipped" | "missing"> {
  const existing = db.select({ n: count() }).from(users).get()?.n ?? 0;
  if (existing > 0) return "skipped";
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return "missing";
  const parsedEmail = email.safeParse(env.ADMIN_EMAIL);
  if (!parsedEmail.success) throw new Error("ADMIN_EMAIL is not a valid email address");
  const problem = passwordProblem(env.ADMIN_PASSWORD);
  if (problem) throw new Error(`ADMIN_PASSWORD: ${problem}`);
  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
  db.insert(users)
    .values({
      email: parsedEmail.data,
      name: env.ADMIN_NAME?.trim() || parsedEmail.data.split("@")[0],
      passwordHash,
      role: "admin",
    })
    .onConflictDoNothing()
    .run();
  return "created";
}

/** Housekeeping: drop expired sessions and stale link tokens. */
export function pruneAuthTables(db: DB): void {
  const now = Date.now();
  db.$client.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  db.$client.prepare("DELETE FROM auth_tokens WHERE expires_at < ?").run(now - 30 * 24 * 3600_000);
}
