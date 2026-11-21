// pnpm seed: adds the demo data to an empty database (DATABASE_PATH), creating the
// admin from ADMIN_EMAIL/ADMIN_PASSWORD first when there are no users yet.
import { eq } from "drizzle-orm";
import { loadDotEnv, loadEnv } from "../env.ts";
import { openDatabase } from "../db/client.ts";
import { users } from "../db/schema.ts";
import { ensureDefaultSettings } from "../lib/settings.ts";
import { bootstrapAdmin } from "../auth/routes.ts";
import { isEmpty, seedDemo } from "../seed.ts";

loadDotEnv();
const env = loadEnv();
const db = openDatabase(env.DATABASE_PATH);
ensureDefaultSettings(db, env);
await bootstrapAdmin(db, env);
const admin = db.select().from(users).where(eq(users.role, "admin")).get();
if (!admin) {
  console.error("No admin account. Set ADMIN_EMAIL and ADMIN_PASSWORD, or finish setup in the app first.");
  process.exit(1);
}
if (!isEmpty(db)) {
  console.error("The database already has products or orders; demo data is only added to an empty database.");
  process.exit(1);
}
const result = seedDemo(db, admin);
console.log(`Demo data added to ${env.DATABASE_PATH}: ${result.products} products, ${result.orders} orders`);
db.$client.close();
