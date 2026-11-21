import { and, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { parseSearch } from "../../shared/search.ts";

/** Longest search a box accepts (room for "|"-separated lists of SKUs or order numbers). */
export const SEARCH_MAX = 500;

/**
 * SQL for the shared search syntax: "|" separates alternatives (any may match),
 * spaces separate words (all must match). `word` builds the condition for one
 * word from its LIKE pattern; `exact` can add a match for a whole alternative
 * (e.g. an order number).
 */
export function searchCondition(
  query: string | null | undefined,
  word: (like: string) => SQL,
  exact?: (alternative: string) => SQL | undefined,
): SQL | undefined {
  const alternatives = parseSearch(query);
  if (!alternatives.length) return undefined;
  const parts = alternatives.map((words) => {
    const all = and(...words.map((w) => word(`%${w.replace(/[%_]/g, "")}%`)))!;
    const extra = exact?.(words.join(" "));
    return extra ? or(all, extra)! : all;
  });
  return or(...parts)!;
}

/** "ord-12", "ORD12", "12" → 12. */
export function orderNumberOf(text: string): number | undefined {
  const n = Number(text.trim().replace(/^ord-?/i, ""));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** "mov-7", "7" → 7. */
export function movementNumberOf(text: string): number | undefined {
  const n = Number(text.trim().replace(/^(mov|ord)-?/i, ""));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
