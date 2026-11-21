import Papa from "papaparse";

export type CsvRow = Record<string, string | number | null | undefined>;

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Neutralises spreadsheet formulas ("=HYPERLINK(...)", "@SUM(...)") in text cells
 * by prefixing a quote. Plain numbers (including negatives) are left alone.
 */
export function csvSafe(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (FORMULA_START.test(value) && !PLAIN_NUMBER.test(value)) return `'${value}`;
  return value;
}

export function toCsv(rows: CsvRow[], columns?: string[]): string {
  const fields = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const data = rows.map((row) => fields.map((f) => csvSafe(row[f])));
  return Papa.unparse({ fields, data });
}

/** Plain two-decimal amount for spreadsheets (no currency symbol or grouping). */
export const csvAmount = (n: number | null | undefined) => (n === null || n === undefined ? "" : n.toFixed(2));

/** Downloads rows as a UTF-8 CSV (with BOM, so Excel opens accents correctly). */
export function downloadCsv(filename: string, rows: CsvRow[], columns?: string[]): void {
  downloadText(filename, toCsv(rows, columns), "text/csv;charset=utf-8");
}

export function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob(["﻿" + text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads every page of a paginated list (for exports). */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
  pageSize = 200,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page++) {
    const res = await fetchPage(page, pageSize);
    all.push(...res.items);
    if (res.items.length < pageSize || all.length >= res.total) return all;
  }
}
