import type { StepLink } from "@shared/performance.ts";

/** Where a step's link goes: an account's ledger, or the orders shipped on those days. */
export function linkTo(link: StepLink): string {
  const q = `from=${link.fromDay}&to=${link.toDay}`;
  return link.kind === "account" ? `/finance/accounts/${link.accountId}?${q}` : `/orders?by=shipped&${q}`;
}

