import { catalog } from "./catalog.ts";
import { insights } from "./insights.ts";
import { orders } from "./orders.ts";
import { shell } from "./shell.ts";

export const en: Record<string, string> = { ...shell, ...orders, ...catalog, ...insights };
