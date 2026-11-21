import type { z } from "zod";
import i18n from "@/lib/i18n.ts";

/** Field path ("lineItems.0.quantity") → first error message. */
export type FieldErrors = Record<string, string>;

export function issuesToErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    // Schema messages are English keys (marked with tk)
    out[key] ??= i18n.t(issue.message);
  }
  return out;
}

/** DOM id for a field path, so the first invalid field can be focused. */
export function fieldId(prefix: string, path: string): string {
  return `${prefix}-${path.replace(/\./g, "-")}`;
}

/** Moves focus to the first invalid field that has a matching element. */
export function focusFirstError(prefix: string, errors: FieldErrors): void {
  for (const path of Object.keys(errors)) {
    const el = document.getElementById(fieldId(prefix, path));
    if (el) {
      el.focus();
      return;
    }
  }
}
