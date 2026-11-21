/**
 * "My little ones": the children a customer shops for. Each has a birthday
 * (so the age, the sizes and the baby's look follow them as they grow),
 * boy or girl (or twins), and an optional name.
 */

export type ChildGender = "boys" | "girls";
/** Twins: two boys, two girls, or a boy and a girl. One entry stands for both babies. */
export type Twins = "boys" | "girls" | "mixed";
export type Child = {
  id: string;
  name: string | null;
  birthday: string;
  /** Boy or girl; for twins of the same gender, theirs; mixed twins: null */
  gender: ChildGender | null;
  twins?: Twins | null;
};
export const isTwins = (t: unknown): t is Twins => t === "boys" || t === "girls" || t === "mixed";

/** Who the customer shops for: a boy, a girl, or twins (no birthday needed). */
export type BabyKind = { gender: ChildGender | null; twins: Twins | null };
/** A saved "shopping for" choice, or null when there's none (or it's not valid). */
export function parseKind(raw: unknown): BabyKind | null {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as { gender?: unknown; twins?: unknown };
  const twins = isTwins(o.twins) ? o.twins : null;
  if (twins) return { gender: twins === "mixed" ? null : twins, twins };
  if (o.gender === "boys" || o.gender === "girls") return { gender: o.gender, twins: null };
  return null;
}
/** Products a choice is for: boys, girls, or both for twins of one of each. */
export function audiencesFor(kind: BabyKind | null): ("boys" | "girls")[] {
  if (!kind) return [];
  if (kind.twins === "mixed") return ["boys", "girls"];
  return kind.gender ? [kind.gender] : [];
}
/** The babies a child entry stands for: one, or the two twins with their genders. */
export function babiesOf(c: Pick<Child, "gender" | "twins">): (ChildGender | null)[] {
  if (c.twins === "mixed") return ["boys", "girls"];
  if (c.twins) return [c.twins, c.twins];
  return [c.gender];
}

export const MAX_CHILDREN = 6;
/** Older than this, the shop stops suggesting baby sizes for the child. */
export const MAX_CHILD_YEARS = 6;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day ("2026-02-30" is not). */
function isRealDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/** Age in months on a day (fractional, never below 0). */
export function childAgeMonths(birthday: string, today: string): number {
  const [by, bm, bd] = birthday.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = (ty - by) * 12 + (tm - bm);
  let days = td - bd;
  if (days < 0) {
    months -= 1;
    // Days into the current month of age
    const prevMonthDays = new Date(Date.UTC(ty, tm - 1, 0)).getUTCDate();
    days += prevMonthDays;
  }
  return Math.max(0, months + days / 30.44);
}

/**
 * The look and moves that fit the age:
 * 0 newborn (0–3 m), 1 tummy time (3–6 m), 2 crawling (6–12 m),
 * 3 first steps (1–2 y), 4 walking (2 y and up).
 */
export type BabyTier = 0 | 1 | 2 | 3 | 4;
export function babyTier(ageMonths: number): BabyTier {
  if (ageMonths < 3) return 0;
  if (ageMonths < 6) return 1;
  if (ageMonths < 12) return 2;
  if (ageMonths < 24) return 3;
  return 4;
}

/** The 3-month window the age is in ("12–15"), in months; whole years from 2. */
export function ageWindow(ageMonths: number): { from: number; to: number; unit: "months" | "years" } {
  if (ageMonths < 24) {
    const from = Math.floor(ageMonths / 3) * 3;
    return { from, to: from + 3, unit: "months" };
  }
  const years = Math.floor(ageMonths / 12);
  return { from: years, to: years + 1, unit: "years" };
}

/**
 * A celebration on or just after the birthday (up to 3 days), and the first
 * months' "monthiversaries" (1–11 months, on the day and the next).
 */
export function celebration(birthday: string, today: string): { kind: "birthday"; years: number } | { kind: "months"; months: number } | null {
  if (!DAY_RE.test(birthday) || today < birthday) return null;
  const [by, bm, bd] = birthday.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const t = Date.UTC(ty, tm - 1, td);
  const years = ty - by;
  for (const y of [years, years - 1]) {
    if (y < 1) continue;
    const party = Date.UTC(by + y, bm - 1, bd);
    const diff = (t - party) / 86_400_000;
    if (diff >= 0 && diff <= 3) return { kind: "birthday", years: y };
  }
  const months = (ty - by) * 12 + (tm - bm);
  if (months >= 1 && months <= 11 && (td === bd || td === bd + 1)) return { kind: "months", months };
  return null;
}

/** Checks a list sent by the browser: real days, not in the future, not too old, at most MAX_CHILDREN. */
export function validChildren(input: unknown, today: string): Child[] | null {
  if (!Array.isArray(input) || input.length > MAX_CHILDREN) return null;
  const minDay = `${Number(today.slice(0, 4)) - MAX_CHILD_YEARS}${today.slice(4)}`;
  const out: Child[] = [];
  const ids = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const c = raw as Record<string, unknown>;
    const id = typeof c.id === "string" ? c.id.trim().slice(0, 40) : "";
    const birthday = typeof c.birthday === "string" ? c.birthday : "";
    const name = typeof c.name === "string" ? c.name.trim().slice(0, 30) : "";
    const twins = isTwins(c.twins) ? c.twins : null;
    // Same-gender twins carry their gender; mixed twins have none
    const gender = twins ? (twins === "mixed" ? null : twins) : c.gender === "boys" || c.gender === "girls" ? c.gender : null;
    if (!id || ids.has(id) || !isRealDay(birthday)) return null;
    if (birthday > today || birthday < minDay) return null;
    ids.add(id);
    out.push({ id, name: name || null, birthday, gender, twins });
  }
  return out;
}

/** Saved lists (account or device) read back safely; bad entries are dropped. */
export function parseChildren(raw: string | null | undefined): Child[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (c): c is Child =>
          !!c &&
          typeof c.id === "string" &&
          typeof c.birthday === "string" &&
          DAY_RE.test(c.birthday) &&
          (c.gender === "boys" || c.gender === "girls" || c.gender === null) &&
          (c.name === null || typeof c.name === "string"),
      )
      .map((c) => ({ ...c, twins: isTwins(c.twins) ? c.twins : null }))
      .slice(0, MAX_CHILDREN);
  } catch {
    return [];
  }
}
