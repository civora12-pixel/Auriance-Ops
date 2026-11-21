import { accounts } from "./accounts.ts";
import { catalog } from "./catalog.ts";
import { checkout } from "./checkout.ts";
import { closing } from "./closing.ts";
import { finance } from "./finance.ts";
import { insights } from "./insights.ts";
import { ledger } from "./ledger.ts";
import { orders } from "./orders.ts";
import { shell } from "./shell.ts";
import { shop } from "./shop.ts";

export const ar: Record<string, string> = { ...shell, ...orders, ...catalog, ...insights, ...shop, ...ledger, ...closing, ...accounts, ...checkout, ...finance };
