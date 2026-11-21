import { z } from "zod";
import i18n, { tk } from "@/lib/i18n.ts";
import { isEgyptianPhone } from "@shared/phone.ts";

/**
 * Number fields are edited as text so a blank field is "missing" (an error), not 0.
 * Use these in zod form schemas together with <MoneyInput> / <QuantityInput>.
 */
const toNumber = (v: unknown) => {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return undefined;
  const s = v.trim().replace(/,/g, "");
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
};

// Messages are produced when a value is checked, so they follow the current language.
// Messages passed in by callers can be tk() keys or already translated text.
const msg = (key: string, options?: Record<string, unknown>) => () =>
  i18n.t(key, options);
const atLeast = (min: number) => msg(tk("Must be at least {{min}}"), { min });
const atMost = (max: number) => msg(tk("Can't be more than {{max}}"), { max });

export const zMoneyField = (
  opts: { required?: string; min?: number; max?: number } = {},
) =>
  z.preprocess(
    toNumber,
    z
      .number({
        error: (issue) =>
          issue.input === undefined
            ? i18n.t(opts.required ?? tk("Enter an amount"))
            : i18n.t("Enter a valid number"),
      })
      .min(opts.min ?? 0, {
        error: opts.min ? atLeast(opts.min) : msg(tk("Can't be negative")),
      })
      .max(opts.max ?? 1_000_000_000, {
        error:
          opts.max !== undefined
            ? atMost(opts.max)
            : msg(tk("That amount is too large")),
      })
      .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, {
        error: msg(tk("Use at most 2 decimal places")),
      }),
  );

export const zOptionalMoneyField = (opts: { max?: number } = {}) =>
  z.preprocess(
    toNumber,
    z
      .number({ error: msg(tk("Enter a valid number")) })
      .min(0, { error: msg(tk("Can't be negative")) })
      .max(opts.max ?? 1_000_000_000, {
        error:
          opts.max !== undefined
            ? atMost(opts.max)
            : msg(tk("That amount is too large")),
      })
      .optional(),
  );

export const zQuantityField = (
  opts: {
    min?: number;
    max?: number;
    maxMessage?: string;
    required?: string;
  } = {},
) =>
  z.preprocess(
    toNumber,
    z
      .number({
        error: (issue) =>
          issue.input === undefined
            ? i18n.t(opts.required ?? tk("Enter a quantity"))
            : i18n.t("Enter a valid number"),
      })
      .int({ error: msg(tk("Use a whole number")) })
      .min(opts.min ?? 1, {
        error:
          (opts.min ?? 1) === 0
            ? msg(tk("Can't be negative"))
            : atLeast(opts.min ?? 1),
      })
      .max(opts.max ?? 1_000_000, {
        error: opts.maxMessage
          ? () => i18n.t(opts.maxMessage!)
          : atMost(opts.max ?? 1_000_000),
      }),
  );

/** Parses a number field value outside a schema (live previews). */
export function parseNumber(value: unknown): number | undefined {
  const n = toNumber(value);
  return n === undefined || Number.isNaN(n) ? undefined : n;
}

/** The field that should get focus when a form fails validation. */
export function firstErrorField(
  errors: Record<string, unknown>,
): string | undefined {
  return Object.keys(errors)[0];
}

/** Egyptian mobile (11 digits, 010/011/012/015) or landline with its area code (10 digits); Arabic digits and spaces are fine. */
export function zPhoneField({ required }: { required: boolean }) {
  return z
    .string()
    .trim()
    .refine((s) => !required || s.length > 0, tk("Enter the customer's phone"))
    .refine(
      (s) => !s || isEgyptianPhone(s),
      tk("Use an Egyptian mobile (11 digits: 010, 011, 012 or 015) or a landline with its area code (10 digits, like 0238221076)"),
    );
}
