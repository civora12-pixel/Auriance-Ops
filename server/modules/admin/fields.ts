import { z } from "zod";
import type { DB } from "../../db/client.ts";
import { AppError, mutation, noInput, query } from "../../rpc/procedure.ts";
import { requireAdminMode } from "../../lib/permissions.ts";
import { getSetting, setSetting } from "../../lib/settings.ts";
import { FIELD_SECTIONS } from "../../../shared/constants.ts";
import type { FieldDef, FieldSection, FieldVisibility } from "../../../shared/constants.ts";

const KEY = "field_visibility";
const SECTION_KEYS = Object.keys(FIELD_SECTIONS) as FieldSection[];

/** Saved visibility, keeping only known, hideable fields. Bad JSON falls back to "everything visible". */
export function getFieldVisibility(db: DB): FieldVisibility {
  const raw = getSetting(db, KEY);
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};
  const result: FieldVisibility = {};
  for (const section of SECTION_KEYS) {
    const saved = (parsed as Record<string, unknown>)[section];
    if (!saved || typeof saved !== "object") continue;
    const fields: readonly FieldDef[] = FIELD_SECTIONS[section].fields;
    const entries = fields
      .filter((f) => !f.required && typeof (saved as Record<string, unknown>)[f.key] === "boolean")
      .map((f) => [f.key, (saved as Record<string, boolean>)[f.key]] as const);
    if (entries.length) result[section] = Object.fromEntries(entries);
  }
  return result;
}

export const fieldsRouter = {
  /** Every signed-in user needs this to render lists and forms. */
  get: query({
    input: noInput,
    handler: (ctx) => getFieldVisibility(ctx.db),
  }),

  update: mutation({
    input: z.object({ section: z.enum(SECTION_KEYS as [FieldSection, ...FieldSection[]]), field: z.string(), visible: z.boolean() }),
    handler: (ctx, args) => {
      requireAdminMode(ctx);
      const fields: readonly FieldDef[] = FIELD_SECTIONS[args.section].fields;
      const def = fields.find((f) => f.key === args.field);
      if (!def) throw new AppError("BAD_REQUEST", "Unknown field");
      if (def.required) throw new AppError("BAD_REQUEST", `${def.label} is required and can't be hidden`);
      const config = getFieldVisibility(ctx.db);
      config[args.section] = { ...config[args.section], [args.field]: args.visible };
      setSetting(ctx.db, KEY, JSON.stringify(config));
      return null;
    },
  }),
};
