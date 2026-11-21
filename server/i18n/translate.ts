// Response-time translation of server text. Stored data stays English; the
// client's Accept-Language picks the language of what we send back.
import { LABELS, MESSAGES, TEMPLATES, WRAPPERS } from "./ar.ts";

export type Lang = "en" | "ar";

/** "ar", "ar-EG", … → Arabic; anything else → English. */
export function langFrom(header: string | null | undefined): Lang {
  return header?.trim().toLowerCase().startsWith("ar") ? "ar" : "en";
}

type Mode = "" | "~" | "*" | "|";
type Template = { en: string; re: RegExp; names: { name: string; mode: Mode }[]; ar: string };

const PLACEHOLDER = /\{(\w+)([~*|]?)\}/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile([en, ar]: [string, string]): Template {
  const names: Template["names"] = [];
  let source = "";
  let last = 0;
  for (const m of en.matchAll(PLACEHOLDER)) {
    source += `${escape(en.slice(last, m.index))}(.+?)`;
    names.push({ name: m[1], mode: m[2] as Mode });
    last = m.index + m[0].length;
  }
  source += escape(en.slice(last));
  return { en, re: new RegExp(`^${source}$`, "s"), names, ar };
}

const fixedLength = (t: Template) => t.en.replace(PLACEHOLDER, "").length;

/** Wrappers first, then the most specific template. */
export const COMPILED: Template[] = [
  ...WRAPPERS.map(compile),
  ...TEMPLATES.map(compile).sort((a, b) => fixedLength(b) - fixedLength(a)),
];

const MAX_DEPTH = 4;

function toArabic(text: string, depth: number, labels: boolean): string {
  const exact = MESSAGES[text] ?? (labels ? LABELS[text] : undefined);
  if (exact !== undefined) return exact;
  if (depth >= MAX_DEPTH) return text;
  for (const t of COMPILED) {
    const m = t.re.exec(text);
    if (!m) continue;
    const values = new Map<string, string>();
    t.names.forEach(({ name, mode }, i) => {
      const value = m[i + 1];
      const part = (s: string) => toArabic(s, depth + 1, true);
      values.set(
        name,
        mode === "~"
          ? value
          : mode === "*"
            ? value.split(", ").map(part).join("، ")
            : mode === "|"
              ? value.split(" or ").map(part).join(" أو ")
              : part(value),
      );
    });
    return t.ar.replace(PLACEHOLDER, (_, name: string) => values.get(name) ?? "");
  }
  return text;
}

/** Translates a server message; text it doesn't know comes back unchanged. */
export function translate(text: string, lang: Lang): string {
  return lang === "ar" ? toArabic(text, 0, false) : text;
}

/** Translates each part of a "a | b | c" style list, keeping the separator. */
function translateParts(text: string, separator: string, joiner: string): string {
  return text
    .split(separator)
    .map((part) => toArabic(part, 0, true))
    .join(joiner);
}

type Rule = (text: string) => string;

const message: Rule = (s) => toArabic(s, 0, false);

/** Fields holding server-written text, per procedure. */
const RESULT_FIELDS: Record<string, Record<string, Rule>> = {
  "notifications.list": { title: message, body: message },
  "orders.get": { note: message },
  "inventory.listMovements": { notes: message },
  "admin.destructive.listDeletionLogs": {
    entitySummary: (s) => translateParts(s, " | ", " | "),
    stockEffect: (s) => translateParts(s, "; ", "؛ "),
  },
  "imports.bulkRestock": { errors: message, warnings: message },
  "imports.bulkProductImport": { errors: message, warnings: message },
};

/** Fallback names that can show up in any result, by field. */
const FALLBACK_NAMES: Record<string, string[]> = {
  productName: ["Unknown product"],
  repName: ["Unknown user"],
  changedByName: ["Unknown user"],
  createdByName: ["Unknown user"],
  deletedByName: ["Unknown user"],
  userName: ["Unknown user"],
  name: ["No offer name"],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function walk(value: unknown, key: string, fields: Record<string, Rule> | undefined): unknown {
  if (typeof value === "string") {
    const rule = fields?.[key];
    if (rule) return rule(value);
    return FALLBACK_NAMES[key]?.includes(value) ? MESSAGES[value] : value;
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, key, fields));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k, fields)]));
  }
  return value;
}

/** Translates the server-written text in a procedure's result. */
export function localizeResult(path: string, result: unknown, lang: Lang): unknown {
  return lang === "ar" ? walk(result, "", RESULT_FIELDS[path]) : result;
}
