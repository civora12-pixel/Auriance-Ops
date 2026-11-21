// Search syntax shared by every search box (browser and server).
//
//   tee red          → items matching both words
//   TEE-RED|TEE-BLK  → items matching either side of the "|"
//   ORD-12|ORD-15|Ahmed → those two orders plus any order for Ahmed
//
// Each "|" part is one alternative; inside an alternative, spaces separate
// words that must all match. A row matches when any alternative matches.

const MAX_ALTERNATIVES = 20;
const MAX_WORDS = 10;

/** Alternatives, each a list of lowercase words. Empty when there's nothing to search for. */
export function parseSearch(query: string | null | undefined): string[][] {
  if (!query) return [];
  return query
    .split("|")
    .map((part) =>
      part.toLowerCase().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS),
    )
    .filter((words) => words.length > 0)
    .slice(0, MAX_ALTERNATIVES);
}

/** True when the haystack matches the query (or the query is empty). */
export function matchesSearch(
  haystack: string,
  query: string | null | undefined,
): boolean {
  const alternatives = parseSearch(query);
  if (!alternatives.length) return true;
  const text = haystack.toLowerCase();
  return alternatives.some((words) =>
    words.every((word) => text.includes(word)),
  );
}
