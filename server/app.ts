import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import type { Context } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { DB } from "./db/client.ts";
import type { Env } from "./env.ts";
import { authRoutes } from "./auth/routes.ts";
import { shopRoutes } from "./shop/routes.ts";
import type { Mailer } from "./lib/email.ts";
import { readSessionCookie, resolveSession } from "./auth/session.ts";
import {
  AppError,
  HTTP_STATUS,
  runProcedure,
  toJson,
} from "./rpc/procedure.ts";
import { procedures } from "./rpc/router.ts";
import { snapshot } from "./jobs/backup.ts";
import { getBusinessSettings } from "./lib/settings.ts";
import type { ErrorCode } from "../shared/types.ts";
import {
  PHOTO_MAX_BYTES,
  PHOTO_PATH_PREFIX,
  folderStore,
  isPhotoKey,
  preparePhoto,
} from "./lib/photos.ts";
import type { PhotoStore } from "./lib/photos.ts";
import { langFrom, localizeResult, translate } from "./i18n/translate.ts";

type Options = {
  db: DB;
  env: Pick<Env, "APP_ORIGIN" | "NODE_ENV">;
  /** Built SPA (vite output). Omitted in dev and tests. */
  clientDir?: string;
  /** Where product photos are kept. Defaults to a temporary folder (tests). */
  photos?: PhotoStore;
  /** Customer emails; off when omitted. */
  mailer?: Mailer;
  log?: (msg: string) => void;
};

const MAX_BODY = 2 * 1024 * 1024;

/** Error response in the client's language (Accept-Language). */
function errorBody(c: Context, code: ErrorCode, message: string) {
  return c.json(
    {
      code,
      message: translate(message, langFrom(c.req.header("accept-language"))),
    },
    HTTP_STATUS[code] as 400,
  );
}

/** Maps anything thrown by a procedure to a safe `{code, message}` response. */
function toAppError(e: unknown, log: (msg: string) => void): AppError {
  if (e instanceof AppError) return e;
  const code = (e as { code?: string })?.code;
  if (typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT")) {
    return new AppError(
      "CONFLICT",
      "This change conflicts with existing data. Refresh and try again.",
    );
  }
  if (code === "SQLITE_BUSY")
    return new AppError(
      "CONFLICT",
      "The server is busy. Try again in a moment.",
    );
  log(
    `Unhandled error: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
  );
  return new AppError(
    "INTERNAL",
    "Something went wrong on the server. Try again.",
  );
}

/** Same-origin check for state-changing requests (cookies are SameSite=Lax as well). */
function originAllowed(c: Context, appOrigin: string | undefined): boolean {
  const origin = c.req.header("origin");
  if (!origin) return true; // non-browser clients; browsers always send Origin on POST
  if (appOrigin && origin === appOrigin) return true;
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function createApp({
  db,
  env,
  clientDir,
  photos,
  mailer,
  log = console.log,
}: Options) {
  const app = new Hono();
  const photoStore =
    photos ?? folderStore(path.join(os.tmpdir(), "auriance-photos"));

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "same-origin");
    c.header("X-Frame-Options", "DENY");
  });

  app.get("/api/health", (c) => {
    db.$client.prepare("SELECT 1").get();
    return c.json({ ok: true });
  });

  // The app version being served (its entry script), so open pages can tell
  // they're out of date after a deploy and reload
  const indexFile = clientDir ? path.join(clientDir, "index.html") : undefined;
  const entryScript =
    indexFile && fs.existsSync(indexFile)
      ? (fs.readFileSync(indexFile, "utf8").match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1] ?? null)
      : null;
  app.get("/api/version", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({ entry: entryScript });
  });

  app.use("/api/*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      if (!originAllowed(c, env.APP_ORIGIN))
        return errorBody(c, "FORBIDDEN", "Cross-site request blocked");
      const length = Number(c.req.header("content-length") ?? 0);
      const limit =
        c.req.path === "/api/photos" ? PHOTO_MAX_BYTES + 64 * 1024 : MAX_BODY;
      if (length > limit)
        return errorBody(c, "BAD_REQUEST", "Request is too large");
    }
    c.header("Cache-Control", "no-store");
    await next();
  });

  app.route("/api/auth", authRoutes(db));
  app.route("/api/shop", shopRoutes(db, { appOrigin: env.APP_ORIGIN, mailer }));

  app.post("/api/rpc/:path", async (c) => {
    const procPath = c.req.param("path");
    const proc = procedures.get(procPath);
    if (!proc) return errorBody(c, "NOT_FOUND", "Unknown API call");
    const auth = resolveSession(db, readSessionCookie(c));
    if (!auth)
      return errorBody(
        c,
        "UNAUTHENTICATED",
        "Your session has ended. Sign in again.",
      );
    let input: unknown;
    try {
      const text = await c.req.text();
      input = text ? JSON.parse(text) : undefined;
    } catch {
      return errorBody(c, "BAD_REQUEST", "Invalid request body");
    }
    try {
      const lang = langFrom(c.req.header("accept-language"));
      const result = runProcedure(
        proc,
        { db, user: auth.user, session: auth.session, now: new Date() },
        input,
        lang,
      );
      return c.body(toJson(localizeResult(procPath, result, lang)), 200, {
        "Content-Type": "application/json; charset=utf-8",
      });
    } catch (e) {
      const err = toAppError(e, log);
      return errorBody(c, err.code, err.message);
    }
  });

  // Full database download for admins in Admin Mode
  app.get("/api/admin/backup", (c) => {
    const auth = resolveSession(db, readSessionCookie(c));
    if (!auth)
      return errorBody(c, "UNAUTHENTICATED", "Sign in again to continue");
    if (auth.user.role !== "admin")
      return errorBody(c, "FORBIDDEN", "Only admins can download backups");
    if (
      !auth.session.elevatedUntil ||
      auth.session.elevatedUntil < Date.now()
    ) {
      return errorBody(
        c,
        "FORBIDDEN",
        "Turn on Admin Mode to download a backup",
      );
    }
    const name = getBusinessSettings(db)
      .businessName.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const file = `${name || "backup"}-${new Date().toISOString().slice(0, 10)}.db`;
    return c.body(new Uint8Array(snapshot(db)), 200, {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="${file}"`,
    });
  });

  // Upload a product photo (admins): resized to WebP, returns the path to store on the product or variant
  app.post("/api/photos", async (c) => {
    const auth = resolveSession(db, readSessionCookie(c));
    if (!auth)
      return errorBody(
        c,
        "UNAUTHENTICATED",
        "Your session has ended. Sign in again.",
      );
    if (auth.user.role !== "admin")
      return errorBody(c, "FORBIDDEN", "Only admins can do this");
    try {
      const body = await c.req.parseBody();
      const file = body.file;
      if (!(file instanceof File))
        return errorBody(c, "BAD_REQUEST", "Choose a photo to upload");
      if (file.size > PHOTO_MAX_BYTES)
        return errorBody(
          c,
          "BAD_REQUEST",
          "The photo is too large. Use one under 15 MB.",
        );
      const prepared = await preparePhoto(
        Buffer.from(await file.arrayBuffer()),
      );
      const key = await photoStore.put(prepared);
      return c.json({ url: `${PHOTO_PATH_PREFIX}${key}` });
    } catch (e) {
      const err = toAppError(e, log);
      return errorBody(c, err.code, err.message);
    }
  });

  // Photos are public (the future shop shows them too); keys are random and unguessable
  app.get("/api/photos/:key", async (c) => {
    const key = c.req.param("key");
    if (!isPhotoKey(key)) return c.text("Not found", 404);
    const found = await photoStore.serve(key);
    if (!found) return c.text("Not found", 404);
    if ("redirect" in found) {
      // Signed links last an hour; let browsers reuse the redirect for most of it
      c.header("Cache-Control", "private, max-age=3000");
      return c.redirect(found.redirect, 302);
    }
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    return c.body(new Uint8Array(found.file), 200, {
      "Content-Type": "image/webp",
    });
  });

  app.all("/api/*", (c) => errorBody(c, "NOT_FOUND", "Unknown API route"));

  if (clientDir && fs.existsSync(path.join(clientDir, "index.html"))) {
    const indexHtml = fs.readFileSync(
      path.join(clientDir, "index.html"),
      "utf8",
    );
    app.use(
      "/assets/*",
      serveStatic({
        root: clientDir,
        onFound: (_path, c) => {
          c.header("Cache-Control", "public, max-age=31536000, immutable");
        },
      }),
    );
    app.get("/assets/*", (c) => c.text("Not found", 404));
    app.use(
      "*",
      serveStatic({
        root: clientDir,
        // The app shell ("/" is index.html) must never be kept by the browser,
        // or phones open an old version of the app after a deploy
        onFound: (filePath, c) => {
          c.header("Cache-Control", filePath.endsWith(".html") ? "no-cache" : "public, max-age=3600");
        },
      }),
    );
    // Client-side routes all get the SPA shell
    app.get("*", (c) => {
      c.header("Cache-Control", "no-cache");
      return c.html(indexHtml);
    });
  }

  app.onError((e, c) => {
    const err = toAppError(e, log);
    return errorBody(c, err.code, err.message);
  });

  return app;
}
