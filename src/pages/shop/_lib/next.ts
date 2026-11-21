import { safeNext } from "@/pages/auth/safe-next.ts";

/** Where to go after the welcome or sign-in pages: a shop page, never somewhere else. */
export function shopNext(raw: string | null): string {
  const next = safeNext(raw);
  return next.startsWith("/shop") && !/^\/shop\/(welcome|signin|signup)/.test(next) ? next : "/shop";
}
