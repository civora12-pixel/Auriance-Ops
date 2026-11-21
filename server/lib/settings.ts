import { eq } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { appSettings } from "../db/schema.ts";
import type { Env } from "../env.ts";
import { isValidTimeZone } from "../../shared/dates.ts";

export type BusinessSettings = {
  businessName: string;
  currency: string;
  locale: string;
  timezone: string;
};

const KEYS = {
  businessName: "business_name",
  currency: "currency",
  locale: "locale",
  timezone: "timezone",
} as const satisfies Record<keyof BusinessSettings, string>;

const FALLBACK: BusinessSettings = {
  businessName: "Auriance Ops",
  currency: "USD",
  locale: "en-US",
  timezone: "UTC",
};

export function getSetting(db: DB, key: string): string | undefined {
  return db.select().from(appSettings).where(eq(appSettings.key, key)).get()?.value;
}

export function setSetting(db: DB, key: string, value: string): void {
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run();
}

export function getBusinessSettings(db: DB): BusinessSettings {
  const rows = db.select().from(appSettings).all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    businessName: map.get(KEYS.businessName) ?? FALLBACK.businessName,
    currency: map.get(KEYS.currency) ?? FALLBACK.currency,
    locale: map.get(KEYS.locale) ?? FALLBACK.locale,
    timezone: map.get(KEYS.timezone) ?? FALLBACK.timezone,
  };
}

export function saveBusinessSettings(db: DB, settings: BusinessSettings): void {
  for (const key of Object.keys(KEYS) as (keyof BusinessSettings)[]) {
    setSetting(db, KEYS[key], settings[key]);
  }
}

export function getTimeZone(db: DB): string {
  return getSetting(db, KEYS.timezone) ?? FALLBACK.timezone;
}

export function isValidCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  // Intl formats any well-formed code, so check the list of real currencies when the runtime has it
  if (typeof Intl.supportedValuesOf === "function") return Intl.supportedValuesOf("currency").includes(code);
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

export function isValidLocale(locale: string): boolean {
  try {
    return Intl.NumberFormat.supportedLocalesOf([locale]).length > 0;
  } catch {
    return false;
  }
}

/** First boot: store the env-provided defaults so they can be edited in Settings later. */
export function ensureDefaultSettings(db: DB, env: Env): void {
  const defaults: BusinessSettings = {
    businessName: env.APP_NAME,
    currency: isValidCurrency(env.APP_CURRENCY.toUpperCase()) ? env.APP_CURRENCY.toUpperCase() : FALLBACK.currency,
    locale: isValidLocale(env.APP_LOCALE) ? env.APP_LOCALE : FALLBACK.locale,
    timezone: isValidTimeZone(env.APP_TIMEZONE) ? env.APP_TIMEZONE : FALLBACK.timezone,
  };
  for (const key of Object.keys(KEYS) as (keyof BusinessSettings)[]) {
    db.insert(appSettings).values({ key: KEYS[key], value: defaults[key] }).onConflictDoNothing().run();
  }
}

/** Money formatting for server-written text (history notes, deletion logs). */
export function moneyFormatter(db: DB): (n: number) => string {
  const { currency, locale } = getBusinessSettings(db);
  const fmt = new Intl.NumberFormat(locale, { style: "currency", currency });
  return (n: number) => fmt.format(n);
}
