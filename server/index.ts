import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { loadDotEnv, loadEnv } from "./env.ts";
import { openDatabase } from "./db/client.ts";
import { ensureDefaultSettings } from "./lib/settings.ts";
import { bootstrapAdmin, pruneAuthTables } from "./auth/routes.ts";
import { createApp } from "./app.ts";
import { pruneCustomerTables } from "./shop/routes.ts";
import { sendDueReminders } from "./lib/due.ts";
import { mailerFromEnv } from "./lib/email.ts";
import { scheduleBackups } from "./jobs/backup.ts";
import { maybeSeed } from "./seed.ts";
import { photoStoreFromEnv } from "./lib/photos.ts";
import { releaseHeldOrdersOnStartup } from "./modules/orders.ts";
import { syncLedger } from "./lib/ledger-sync.ts";
import { pruneNotifications } from "./lib/notifications.ts";

const log = (msg: string) =>
  console.log(`[${new Date().toISOString()}] ${msg}`);

async function main() {
  loadDotEnv();
  const env = loadEnv();
  const db = openDatabase(env.DATABASE_PATH);
  log(`Database ready at ${path.resolve(env.DATABASE_PATH)}`);
  ensureDefaultSettings(db, env);

  const admin = await bootstrapAdmin(db, env);
  if (admin === "created")
    log(`Created the first admin account for ${env.ADMIN_EMAIL}`);
  if (admin === "missing")
    log("No users yet. Open the app to create the first admin account.");
  maybeSeed(db, env.SEED_DEMO, log);
  const released = releaseHeldOrdersOnStartup(db);
  if (released)
    log(`Moved ${released} on-hold order(s) to New: stock is available`);
  const synced = db.$client.transaction(() => syncLedger({ db })).immediate();
  if (synced.added || synced.updated || synced.removed)
    log(
      `Ledger: ${synced.added} automatic entries added, ${synced.updated} updated, ${synced.removed} removed`,
    );

  const housekeeping = () => {
    pruneAuthTables(db);
    pruneCustomerTables(db);
    // Notifications older than 30 days are deleted
    pruneNotifications(db);
  };
  housekeeping();
  // Due-date reminders: checked every hour, each sent once
  const remind = () => {
    try {
      const n = sendDueReminders(db);
      if (n) log(`Sent ${n} due-date reminder(s)`);
    } catch (e) {
      log(`Due-date reminders failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  remind();
  setInterval(remind, 3600_000).unref();
  const prune = setInterval(housekeeping, 6 * 3600_000);
  prune.unref();
  const stopBackups = env.BACKUP_DIR
    ? scheduleBackups(db, env.BACKUP_DIR, env.BACKUP_KEEP, log)
    : () => {};

  // The bundle runs from dist/server, next to the built SPA in dist/client (absent in dev)
  const clientDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../client",
  );

  const photos = photoStoreFromEnv({ ...env, PHOTOS_DIR: env.PHOTOS_DIR! });
  log(
    photos.kind === "bucket"
      ? "Product photos: storage bucket"
      : `Product photos: folder ${env.PHOTOS_DIR}`,
  );

  const mailer = mailerFromEnv(env, log);
  log(mailer.enabled ? "Customer emails: on" : "Customer emails: off (RESEND_API_KEY and EMAIL_FROM not set)");

  const app = createApp({ db, env, clientDir, photos, mailer, log });
  const server = serve(
    { fetch: app.fetch, port: env.PORT, hostname: env.HOST },
    (info) => {
      log(
        `Listening on http://${env.HOST === "0.0.0.0" ? "localhost" : env.HOST}:${info.port}`,
      );
    },
  );

  const shutdown = (signal: string) => {
    log(`${signal} received, shutting down`);
    stopBackups();
    server.close(() => {
      db.$client.close();
      process.exit(0);
    });
    setTimeout(() => {
      db.$client.close();
      process.exit(0);
    }, 5000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
