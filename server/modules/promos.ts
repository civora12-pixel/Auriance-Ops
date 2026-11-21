import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { mutation, noInput, query, zId, AppError } from "../rpc/procedure.ts";
import type { Ctx } from "../rpc/procedure.ts";
import { requireAdmin } from "../lib/permissions.ts";
import { promoCodes, promoRedemptions } from "../db/schema.ts";
import { SHOP_SECTIONS } from "../../shared/constants.ts";
import { CODE_RE, PROMO_KINDS, normalizeCode, randomCode } from "../../shared/promo.ts";

/** What a code gives and when (shared by one code and a generated batch). */
const zRule = z
  .object({
    name: z.string().trim().min(1, "Give the promotion a name").max(80),
    kind: z.enum(PROMO_KINDS),
    value: z.number().finite().min(0).max(1_000_000),
    maxDiscount: z.number().finite().positive().max(1_000_000).nullable(),
    minOrder: z.number().finite().positive().max(10_000_000).nullable(),
    startsAt: z.string().datetime().nullable(),
    endsAt: z.string().datetime().nullable(),
    active: z.boolean(),
    maxUses: z.number().int().positive().max(1_000_000).nullable(),
    oncePerCustomer: z.boolean(),
    section: z.enum(SHOP_SECTIONS).nullable(),
  })
  .superRefine((r, c) => {
    if (r.kind === "percent" && (r.value <= 0 || r.value > 100))
      c.addIssue({ code: "custom", message: "A % off must be between 1 and 100", path: ["value"] });
    if (r.kind === "amount" && r.value <= 0) c.addIssue({ code: "custom", message: "Enter the amount off", path: ["value"] });
    if (r.startsAt && r.endsAt && r.endsAt <= r.startsAt)
      c.addIssue({ code: "custom", message: "The end must be after the start", path: ["endsAt"] });
  });

type Rule = z.infer<typeof zRule>;
const clean = (r: Rule) => ({
  ...r,
  value: r.kind === "free_shipping" ? 0 : r.value,
  maxDiscount: r.kind === "percent" ? r.maxDiscount : null,
});

function codeOrFail(ctx: Ctx, raw: string, exceptId?: string): string {
  const code = normalizeCode(raw);
  if (!CODE_RE.test(code)) throw new AppError("BAD_REQUEST", "Use 3 to 30 letters (A–Z), numbers or dashes for the code");
  const taken = ctx.db.select().from(promoCodes).where(eq(promoCodes.code, code)).get();
  if (taken && taken._id !== exceptId) throw new AppError("CONFLICT", "That code already exists");
  return code;
}

export const promosRouter = {
  /** Every code with how often it was used and the discount given. */
  list: query({
    input: noInput,
    handler: (ctx) => {
      requireAdmin(ctx);
      const used = ctx.db
        .select({
          promoId: promoRedemptions.promoId,
          uses: sql<number>`count(*)`,
          given: sql<number>`coalesce(sum(${promoRedemptions.discount}), 0)`,
          freeShipping: sql<number>`coalesce(sum(${promoRedemptions.freeShipping}), 0)`,
        })
        .from(promoRedemptions)
        .groupBy(promoRedemptions.promoId)
        .all();
      const byId = new Map(used.map((u) => [u.promoId, u]));
      return ctx.db
        .select()
        .from(promoCodes)
        .orderBy(desc(promoCodes._creationTime))
        .all()
        .map((p) => ({ ...p, uses: byId.get(p._id)?.uses ?? 0, given: byId.get(p._id)?.given ?? 0 }));
    },
  }),

  create: mutation({
    input: z.object({ code: z.string().max(40), rule: zRule }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      const code = codeOrFail(ctx, args.code);
      return ctx.db
        .insert(promoCodes)
        .values({ code, ...clean(args.rule), createdBy: ctx.user._id })
        .returning()
        .get();
    },
  }),

  update: mutation({
    input: z.object({ promoId: zId, code: z.string().max(40), rule: zRule }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      const promo = ctx.db.select().from(promoCodes).where(eq(promoCodes._id, args.promoId)).get();
      if (!promo) throw new AppError("NOT_FOUND", "Promo code not found");
      const uses = ctx.db.select({ n: sql<number>`count(*)` }).from(promoRedemptions).where(eq(promoRedemptions.promoId, promo._id)).get()?.n ?? 0;
      // A code already used keeps its name (orders show it); everything else can change
      const code = uses > 0 ? promo.code : codeOrFail(ctx, args.code, promo._id);
      if (uses > 0 && normalizeCode(args.code) !== promo.code) {
        throw new AppError("BAD_REQUEST", "This code was used on orders, so it can't be renamed. Create a new code instead.");
      }
      ctx.db.update(promoCodes).set({ code, ...clean(args.rule) }).where(eq(promoCodes._id, promo._id)).run();
      return null;
    },
  }),

  /** A code nobody used can be deleted; a used one can only be switched off. */
  remove: mutation({
    input: z.object({ promoId: zId }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      const uses = ctx.db.select({ n: sql<number>`count(*)` }).from(promoRedemptions).where(eq(promoRedemptions.promoId, args.promoId)).get()?.n ?? 0;
      if (uses > 0) throw new AppError("BAD_REQUEST", "This code was used on orders: switch it off instead");
      ctx.db.delete(promoCodes).where(eq(promoCodes._id, args.promoId)).run();
      return null;
    },
  }),

  /** Random one-time codes for sending privately, all with the same rule. */
  generate: mutation({
    input: z.object({
      count: z.number().int().min(1).max(500, "Generate up to 500 codes at a time"),
      prefix: z.string().trim().max(10).regex(/^[A-Za-z0-9]*$/, "Use letters and numbers for the start of the codes"),
      rule: zRule,
    }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      const batch = `${args.rule.name} · ${new Date(ctx.now).toISOString().slice(0, 10)}`;
      const codes = new Set<string>();
      const exists = (c: string) => !!ctx.db.select({ id: promoCodes._id }).from(promoCodes).where(eq(promoCodes.code, c)).get();
      let tries = 0;
      while (codes.size < args.count && tries++ < args.count * 20) {
        const c = randomCode(args.prefix);
        if (!codes.has(c) && !exists(c)) codes.add(c);
      }
      const rows = [...codes].map((code) => ({
        code,
        ...clean(args.rule),
        // One use each: it's meant for one customer
        maxUses: 1,
        oncePerCustomer: true,
        batch,
        createdBy: ctx.user._id,
      }));
      ctx.db.$client.transaction(() => {
        for (const r of rows) ctx.db.insert(promoCodes).values(r).run();
      })();
      return { batch, codes: rows.map((r) => r.code) };
    },
  }),

  /** Switch a whole batch on or off. */
  setBatchActive: mutation({
    input: z.object({ batch: z.string().min(1).max(200), active: z.boolean() }),
    handler: (ctx, args) => {
      requireAdmin(ctx);
      ctx.db.update(promoCodes).set({ active: args.active }).where(and(eq(promoCodes.batch, args.batch))).run();
      return null;
    },
  }),
};
