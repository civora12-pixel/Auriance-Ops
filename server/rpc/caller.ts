import type { DB } from "../db/client.ts";
import type { Session, User } from "../db/schema.ts";
import { AppError, runProcedure } from "./procedure.ts";
import type { Procedure } from "./procedure.ts";
import { appRouter, procedures } from "./router.ts";

export type Caller<R> = {
  [K in keyof R]: R[K] extends Procedure<infer I, infer O, "query" | "mutation">
    ? undefined extends I
      ? (input?: I) => O
      : (input: I) => O
    : Caller<R[K]>;
};

type CallerOptions = {
  /** Clock for the procedure context (seed data and tests can move it). */
  now?: () => Date;
  session?: Partial<Session>;
};

/**
 * Calls procedures in-process as the given user, with the same validation and
 * transactions as the HTTP API. Used by the demo seed and the tests.
 */
export function createCaller(db: DB, user: User, options: CallerOptions = {}): Caller<typeof appRouter> {
  const session: Session = {
    _id: "in-process",
    _creationTime: Date.now(),
    userId: user._id,
    expiresAt: Number.MAX_SAFE_INTEGER,
    elevatedUntil: null,
    userAgent: null,
    ...options.session,
  };
  const build = (prefix: string): unknown =>
    new Proxy(() => {}, {
      get: (_target, key) => (typeof key === "string" ? build(prefix ? `${prefix}.${key}` : key) : undefined),
      apply: (_target, _this, args: unknown[]) => {
        const proc = procedures.get(prefix);
        if (!proc) throw new AppError("NOT_FOUND", `Unknown procedure ${prefix}`);
        return runProcedure(proc, { db, user, session, now: options.now?.() ?? new Date() }, args[0]);
      },
    });
  return build("") as Caller<typeof appRouter>;
}
