import { usersRouter } from "../modules/users.ts";
import { notificationsRouter } from "../modules/notifications.ts";
import { productsRouter } from "../modules/products.ts";
import { inventoryRouter } from "../modules/inventory.ts";
import { ordersRouter } from "../modules/orders.ts";
import { paymentsRouter } from "../modules/payments.ts";
import { importsRouter } from "../modules/imports.ts";
import { dashboardRouter } from "../modules/dashboard.ts";
import { settingsRouter } from "../modules/settings.ts";
import { customersRouter, shopRouter } from "../modules/shop.ts";
import { promosRouter } from "../modules/promos.ts";
import { reportRouter } from "../modules/finance/report.ts";
import { exportsRouter } from "../modules/finance/exports.ts";
import { accountsRouter, journalRouter } from "../modules/finance/ledger.ts";
import { closingRouter } from "../modules/finance/closing.ts";
import { statementsRouter } from "../modules/finance/statements.ts";
import { courierRouter } from "../modules/finance/courier.ts";
import { catalogAdminRouter } from "../modules/admin/catalog.ts";
import { destructiveRouter } from "../modules/admin/destructive.ts";
import { fieldsRouter } from "../modules/admin/fields.ts";
import { afterMutation, flattenRouter } from "./procedure.ts";
import { syncLedger } from "../lib/ledger-sync.ts";

/** Every procedure, addressed on the client as `api.<path>` (for example `api.orders.get`). */
export const appRouter = {
  users: usersRouter,
  notifications: notificationsRouter,
  products: productsRouter,
  inventory: inventoryRouter,
  orders: ordersRouter,
  payments: paymentsRouter,
  imports: importsRouter,
  dashboard: dashboardRouter,
  settings: settingsRouter,
  shop: shopRouter,
  promos: promosRouter,
  customers: customersRouter,
  finance: {
    report: reportRouter,
    exports: exportsRouter,
    accounts: accountsRouter,
    journal: journalRouter,
    closing: closingRouter,
    statements: statementsRouter,
    courier: courierRouter,
  },
  admin: {
    catalog: catalogAdminRouter,
    destructive: destructiveRouter,
    fields: fieldsRouter,
  },
};

export type AppRouter = typeof appRouter;

export const procedures = flattenRouter(appRouter);

// Orders, payments and stock changes post their accounting entries as part of the same change
afterMutation.push((ctx) => {
  syncLedger(ctx);
});
