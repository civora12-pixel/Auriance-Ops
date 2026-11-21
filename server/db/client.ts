import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.ts";

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/** Finds the committed migrations folder both from source (tsx) and from the bundle (dist/server). */
function migrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "migrations"),
    path.join(here, "../../server/db/migrations"),
    path.join(process.cwd(), "server/db/migrations"),
  ];
  const found = candidates.find((dir) => fs.existsSync(path.join(dir, "meta/_journal.json")));
  if (!found) throw new Error(`Database migrations not found (looked in ${candidates.join(", ")})`);
  return found;
}

/** Opens (or creates) the SQLite database and brings its schema up to date. */
export function openDatabase(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema }) as DB;
  migrate(db, { migrationsFolder: migrationsFolder() });
  return db;
}
