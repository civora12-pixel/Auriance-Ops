import i18n from "@/lib/i18n.ts";

export type AttributeRow = { id: number; key: string; value: string };

export const MAX_ATTRIBUTES = 20;

let nextId = 1;
export const newAttributeRow = (key = "", value = ""): AttributeRow => ({
  id: nextId++,
  key,
  value,
});

export function toAttributeRows(
  attributes: Record<string, string> | undefined,
): AttributeRow[] {
  return Object.entries(attributes ?? {}).map(([k, v]) =>
    newAttributeRow(k, v),
  );
}

/**
 * Turns editor rows into the attributes object (blank rows dropped), or an
 * error message for the first problem.
 */
export function readAttributes(rows: AttributeRow[]): {
  attributes?: Record<string, string>;
  error?: string;
} {
  const attributes: Record<string, string> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key && !value) continue;
    if (!key) return { error: i18n.t("Each attribute needs a name") };
    if (key.length > 50)
      return {
        error: i18n.t('"{{name}}…" is too long for an attribute name', {
          name: key.slice(0, 20),
        }),
      };
    if (value.length > 100)
      return {
        error: i18n.t(
          'The value for "{{name}}" is too long (100 characters max)',
          { name: key },
        ),
      };
    if (seen.has(key.toLowerCase()))
      return { error: i18n.t('"{{name}}" is listed twice', { name: key }) };
    seen.add(key.toLowerCase());
    attributes[key] = value;
  }
  if (Object.keys(attributes).length > MAX_ATTRIBUTES)
    return {
      error: i18n.t("Up to {{max}} attributes", { max: MAX_ATTRIBUTES }),
    };
  return {
    attributes: Object.keys(attributes).length ? attributes : undefined,
  };
}
