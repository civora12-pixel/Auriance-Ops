import { z } from "zod";
import { AppError, mutation, noInput, query } from "../rpc/procedure.ts";
import { requireAdmin } from "../lib/permissions.ts";
import { getBusinessSettings, isValidCurrency, isValidLocale, saveBusinessSettings } from "../lib/settings.ts";
import { isValidTimeZone } from "../../shared/dates.ts";

export const settingsRouter = {
  /** Business name, currency, locale and timezone. Every signed-in user needs these to format values. */
  get: query({
    input: noInput,
    handler: (ctx) => getBusinessSettings(ctx.db),
  }),

  update: mutation({
    input: z.object({
      businessName: z.string().trim().min(1, "Business name is required").max(100),
      currency: z
        .string()
        .trim()
        .transform((s) => s.toUpperCase()),
      locale: z.string().trim().min(2).max(35),
      timezone: z.string().trim().min(1).max(100),
    }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      if (!isValidCurrency(args.currency)) throw new AppError("BAD_REQUEST", `"${args.currency}" isn't a known currency code`);
      if (!isValidLocale(args.locale)) throw new AppError("BAD_REQUEST", `"${args.locale}" isn't a supported locale`);
      if (!isValidTimeZone(args.timezone)) throw new AppError("BAD_REQUEST", `"${args.timezone}" isn't a known timezone`);
      saveBusinessSettings(ctx.db, args);
      return null;
    },
  }),
};
