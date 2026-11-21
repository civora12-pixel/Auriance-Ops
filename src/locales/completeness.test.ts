// Every string the interface translates must have an Arabic entry, with the
// same {{placeholders}}, and plural keys need every Arabic plural form.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADJUST_REASON_LABELS,
  EXPENSE_CATEGORY_LABELS,
  FIELD_SECTIONS,
  GENDER_LABELS,
  MOVEMENT_TYPE_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  RESTOCK_TYPE_LABELS,
  SECTION_LABELS,
  SHOP_SECTION_LABELS,
} from "@shared/constants.ts";
import { SECTION_BLURBS } from "@/pages/shop/_lib/sections.ts";
import { STOCK_LEVEL_LABELS } from "@/lib/status.ts";
import { ar } from "./ar/index.ts";
import { en } from "./en/index.ts";

const SRC = join(import.meta.dirname, "..");
const AR_PLURALS = ["zero", "one", "two", "few", "many", "other"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "locales" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Literal keys passed to t(), tk(), i18n.t() and <Trans i18nKey>. */
function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  const call = /(?<![\w.])(?:t|tk|i18n\.t)\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`((?:\\.|[^`\\$])*)`)/g;
  const trans = /i18nKey=(?:"([^"]*)"|\{"([^"]*)"\})/g;
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const m of [...text.matchAll(call), ...text.matchAll(trans)]) {
      const raw = m[1] ?? m[2] ?? m[3];
      if (raw === undefined) continue;
      const key = raw.replace(/\\(["'`\\])/g, "$1").replace(/\\n/g, "\n");
      if (!keys.has(key)) keys.set(key, relative(SRC, file));
    }
  }
  return keys;
}

const constantLabels = [
  ...Object.values(SECTION_LABELS),
  ...Object.values(SHOP_SECTION_LABELS),
  ...Object.values(SECTION_BLURBS),
  ...Object.values(ORDER_STATUS_LABELS),
  ...Object.values(GENDER_LABELS),
  ...Object.values(MOVEMENT_TYPE_LABELS),
  ...Object.values(RESTOCK_TYPE_LABELS),
  ...Object.values(ADJUST_REASON_LABELS),
  ...Object.values(PAYMENT_METHOD_LABELS),
  ...Object.values(EXPENSE_CATEGORY_LABELS),
  ...Object.values(STOCK_LEVEL_LABELS),
  ...Object.values(FIELD_SECTIONS).flatMap((s) => [s.title, s.description, ...s.fields.map((f) => f.label)]),
];

const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)[^}]*\}\}/g)].map((m) => m[1]).sort();

describe("Arabic translations", () => {
  const keys = usedKeys();

  it("finds the translated strings", () => {
    expect(keys.size).toBeGreaterThan(0);
  });

  it("cover every string the interface shows", () => {
    const missing = [...keys].filter(([key]) => ar[key] === undefined && ar[`${key}_other`] === undefined).map(([key, file]) => `${file}: ${key}`);
    const missingLabels = constantLabels.filter((label) => ar[label] === undefined);
    expect([...missing, ...missingLabels]).toEqual([]);
  });

  it("keep the placeholders of the English text", () => {
    const wrong = Object.entries(ar)
      .filter(([key, value]) => {
        const base = key.replace(/_(zero|one|two|few|many|other)$/, "");
        const expected = placeholders(base).filter((p) => p !== "count");
        const actual = placeholders(value).filter((p) => p !== "count");
        return expected.some((p) => !actual.includes(p)) || actual.some((p) => !expected.includes(p));
      })
      .map(([key, value]) => `${key} → ${value}`);
    expect(wrong).toEqual([]);
  });

  it("give plurals every Arabic form and an English singular", () => {
    const plurals = new Set(Object.keys(ar).filter((k) => k.endsWith("_other")).map((k) => k.slice(0, -"_other".length)));
    const problems: string[] = [];
    for (const base of plurals) {
      for (const form of AR_PLURALS) if (ar[`${base}_${form}`] === undefined) problems.push(`ar ${base}_${form}`);
      if (en[`${base}_one`] === undefined) problems.push(`en ${base}_one`);
    }
    for (const key of Object.keys(en)) {
      if (!key.endsWith("_one")) problems.push(`en ${key}: English entries are only singular plural forms`);
    }
    expect(problems).toEqual([]);
  });
});
