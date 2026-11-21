import { parseNumber } from "@/lib/forms.ts";
import i18n from "@/lib/i18n.ts";

export type RawRow = Record<string, string>;
export type ImportResult = {
  imported: number;
  errors: string[];
  warnings?: string[];
  summary?: string;
};

/** "Unit Price" / "unit-price" → "unit_price" */
export const normalizeHeader = (h: string) =>
  h
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/** First non-blank cell among the column names (aliases). */
export function cell(raw: RawRow, ...names: string[]): string | undefined {
  for (const name of names) {
    const v = raw[name]?.trim();
    if (v) return v;
  }
  return undefined;
}

/** A numeric cell: blank → null, text that isn't a number → error. */
export function numberCell(
  raw: RawRow,
  label: string,
  ...names: string[]
): { value: number | null; error?: string } {
  const v = cell(raw, ...names);
  if (v === undefined) return { value: null };
  const n = parseNumber(v.replace(/^[^\d\-.]+/, ""));
  return n === undefined
    ? {
        value: null,
        error: i18n.t('{{label}} "{{value}}" isn\'t a number', {
          label,
          value: v,
        }),
      }
    : { value: n };
}
