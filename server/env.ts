import path from "node:path";
import fs from "node:fs";
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_PATH: z.string().default("./data/app.db"),
  BACKUP_DIR: z.string().optional(),
  BACKUP_KEEP: z.coerce.number().int().positive().default(7),
  // Public URL, used for invite links and the CSRF origin check (Railway sets RAILWAY_PUBLIC_DOMAIN)
  APP_ORIGIN: z.string().optional(),
  RAILWAY_PUBLIC_DOMAIN: z.string().optional(),
  // First admin, created on boot when the database has no users
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_NAME: z.string().optional(),
  // Defaults for the business settings (editable later in Settings)
  APP_NAME: z.string().default("Auriance Ops"),
  APP_CURRENCY: z.string().default("EGP"),
  APP_LOCALE: z.string().default("en-US"),
  APP_TIMEZONE: z.string().default("Africa/Cairo"),
  SEED_DEMO: bool,
  // Product photos: a Railway Storage Bucket (reference its variables), or a folder when unset
  BUCKET_ENDPOINT: z.string().optional(),
  BUCKET_NAME: z.string().optional(),
  BUCKET_REGION: z.string().optional(),
  BUCKET_ACCESS_KEY_ID: z.string().optional(),
  BUCKET_SECRET_ACCESS_KEY: z.string().optional(),
  BUCKET_PATH_STYLE: bool,
  PHOTOS_DIR: z.string().optional(),
  // Customer emails (confirmations, password resets): off until both are set
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  const env = parsed.data;
  if (!env.APP_ORIGIN && env.RAILWAY_PUBLIC_DOMAIN) {
    env.APP_ORIGIN = `https://${env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  if (!env.PHOTOS_DIR)
    env.PHOTOS_DIR = path.join(path.dirname(env.DATABASE_PATH), "photos");
  return env;
}

/** Local development: reads ./.env when present. Real environment variables win; never used in production. */
export function loadDotEnv(file = ".env"): void {
  if (process.env.NODE_ENV === "production" || !fs.existsSync(file)) return;
  process.loadEnvFile(file);
}
