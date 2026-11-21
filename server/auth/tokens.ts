import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { authTokens } from "../db/schema.ts";
import { hashToken, randomToken } from "./session.ts";

export const LINK_TTL_MS = 7 * 24 * 3600_000;
export type LinkKind = "invite" | "reset";

/** Creates a one-time invite/reset link token. Older unused links for the user stop working. */
export function createLinkToken(db: DB, userId: string, kind: LinkKind): { token: string; expiresAt: number } {
  db.delete(authTokens)
    .where(and(eq(authTokens.userId, userId), isNull(authTokens.usedAt)))
    .run();
  const token = randomToken();
  const expiresAt = Date.now() + LINK_TTL_MS;
  db.insert(authTokens).values({ _id: hashToken(token), userId, kind, expiresAt }).run();
  return { token, expiresAt };
}

export function findLinkToken(db: DB, token: string) {
  if (!token || token.length > 200) return undefined;
  const row = db.select().from(authTokens).where(eq(authTokens._id, hashToken(token))).get();
  if (!row || row.usedAt || row.expiresAt < Date.now()) return undefined;
  return row;
}

export function linkPath(kind: LinkKind, token: string): string {
  return `/${kind === "invite" ? "invite" : "reset"}/${token}`;
}
