import fs from "node:fs";
import path from "node:path";
import type { DB } from "../db/client.ts";

const PREFIX = "app-";
const HOUR = 3600_000;

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

function listBackups(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(".db"))
    .sort();
}

/** Writes a consistent online copy of the database and keeps only the newest `keep` copies. */
export async function runBackup(db: DB, dir: string, keep: number, now = new Date()): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${PREFIX}${stamp(now)}.db`);
  await db.$client.backup(file);
  const existing = listBackups(dir);
  for (const old of existing.slice(0, Math.max(0, existing.length - keep))) {
    fs.rmSync(path.join(dir, old), { force: true });
  }
  return file;
}

/** Hourly check that takes a backup when the newest one is a day old (or missing). */
export function scheduleBackups(db: DB, dir: string, keep: number, log: (msg: string) => void): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const latest = listBackups(dir).at(-1);
      const age = latest ? Date.now() - fs.statSync(path.join(dir, latest)).mtimeMs : Infinity;
      if (age >= 24 * HOUR - 5 * 60_000) log(`Backup written to ${await runBackup(db, dir, keep)}`);
    } catch (e) {
      log(`Backup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(tick, 60_000);
  const timer = setInterval(tick, HOUR);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}

/** A self-contained copy of the database for download (the whole file in memory; fine at this size). */
export function snapshot(db: DB): Buffer {
  return db.$client.serialize();
}
