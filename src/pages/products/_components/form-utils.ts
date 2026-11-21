import type { z } from "zod";

/** Field errors keyed by path ("sku", "variants.0.name"), first message per field. */
export function issueMap(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Moves focus to the first invalid field (inputs use `${prefix}${key}` ids). */
export function focusFirstError(
  errors: Record<string, string>,
  prefix: string,
): void {
  const first = Object.keys(errors)[0];
  if (first === undefined) return;
  requestAnimationFrame(() =>
    document.getElementById(`${prefix}${first.replace(/\./g, "-")}`)?.focus(),
  );
}

/** Id for a field path, matching `focusFirstError`. */
export const fieldId = (prefix: string, key: string) =>
  `${prefix}${key.replace(/\./g, "-")}`;
