import { z } from "zod";
import type { DB } from "../db/client.ts";
import type { Session, User } from "../db/schema.ts";
import type { ErrorCode } from "../../shared/types.ts";
import { round2 } from "../../shared/constants.ts";
import type { Lang } from "../i18n/translate.ts";

export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export const HTTP_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export type Ctx = {
  db: DB;
  user: User;
  session: Session;
  now: Date;
};

type Kind = "query" | "mutation";

export type Procedure<I, O, K extends Kind> = {
  kind: K;
  input: z.ZodType;
  handler: (ctx: Ctx, input: never) => O;
  /** Phantom types for the client. */
  _types?: { input: I; output: O };
};

// Handlers are synchronous: better-sqlite3 runs each mutation as one transaction.
type SyncResult<O> = O extends Promise<unknown> ? never : O;

export function query<S extends z.ZodType, O>(def: {
  input: S;
  handler: (ctx: Ctx, input: z.output<S>) => SyncResult<O>;
}): Procedure<z.input<S>, O, "query"> {
  return { kind: "query", input: def.input, handler: def.handler as Procedure<z.input<S>, O, "query">["handler"] };
}

export function mutation<S extends z.ZodType, O>(def: {
  input: S;
  handler: (ctx: Ctx, input: z.output<S>) => SyncResult<O>;
}): Procedure<z.input<S>, O, "mutation"> {
  return {
    kind: "mutation",
    input: def.input,
    handler: def.handler as Procedure<z.input<S>, O, "mutation">["handler"],
  };
}

export type AnyProcedure = Procedure<unknown, unknown, Kind>;

function isProcedure(value: unknown): value is AnyProcedure {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "handler" in value &&
    typeof (value as AnyProcedure).handler === "function"
  );
}

/** Flattens a nested router into a "orders.get" → procedure map. */
export function flattenRouter(router: object, prefix = ""): Map<string, AnyProcedure> {
  const map = new Map<string, AnyProcedure>();
  for (const [key, value] of Object.entries(router)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isProcedure(value)) map.set(path, value);
    else if (typeof value === "object" && value !== null) {
      for (const [p, proc] of flattenRouter(value, path)) map.set(p, proc);
    }
  }
  return map;
}

function zodMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request";
  const field = issue.path.filter((p) => typeof p === "string" || typeof p === "number").join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}

const arabicZod = z.locales.ar();

/** zod's own messages in the request language; custom messages are translated later. */
export function zodParams(lang: Lang | undefined): z.core.ParseContext<z.core.$ZodIssue> | undefined {
  return lang === "ar" ? { error: arabicZod.localeError } : undefined;
}

/**
 * Work that follows every successful mutation inside the same transaction
 * (keeping the automatic ledger entries in step with the records).
 */
export const afterMutation: ((ctx: Ctx) => void)[] = [];

/** Validates input and runs a procedure; mutations are all-or-nothing. */
export function runProcedure(proc: AnyProcedure, ctx: Ctx, rawInput: unknown, lang?: Lang): unknown {
  const parsed = proc.input.safeParse(rawInput ?? {}, zodParams(lang));
  if (!parsed.success) throw new AppError("BAD_REQUEST", zodMessage(parsed.error));
  const handler = proc.handler as (ctx: Ctx, input: unknown) => unknown;
  if (proc.kind === "query") return handler(ctx, parsed.data);
  return ctx.db.$client
    .transaction(() => {
      const result = handler(ctx, parsed.data);
      for (const hook of afterMutation) hook(ctx);
      return result;
    })
    .immediate();
}

/** JSON body with nulls dropped from objects (the client sees `undefined`, like Convex). */
export function toJson(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value, (key, v) =>
    v === null && key !== "" ? undefined : v,
  );
}

// ---- Reusable zod pieces ----

export const zId = z.string().min(1).max(64);
export const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format");
export const zIso = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "Enter a valid date")
  .transform((s) => new Date(s).toISOString());
/** A non-negative amount, rounded to cents. */
export const zMoney = z.number().finite().min(0, "Amount can't be negative").transform(round2);
export const zQty = z.number().int("Quantity must be a whole number").positive("Quantity must be greater than zero");
export const zText = (max = 500) => z.string().trim().max(max);
export const zOptText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((s) => (s ? s : undefined));
export const noInput = z.object({}).optional().default({});
