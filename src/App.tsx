import { lazy, Suspense } from "react";
import { useAppUpdates } from "./lib/app-updates.ts";
import type { ComponentType, ReactNode } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import "./lib/i18n.ts";
import { DefaultProviders } from "./components/providers/default.tsx";
import AppLayout, {
  AdminGuard,
  SectionGuard,
} from "./components/app-layout.tsx";
import { PageSkeleton, RouteError } from "./components/states.tsx";
import LoginPage from "./pages/auth/login.tsx";
import SetupPage from "./pages/auth/setup.tsx";
import LinkPage from "./pages/auth/link.tsx";
import NotFound from "./pages/NotFound.tsx";
import type { Section } from "@shared/constants.ts";

// Pages load on demand so the first paint only needs the shell
const Dashboard = lazy(() => import("./pages/dashboard/page.tsx"));
const Products = lazy(() => import("./pages/products/page.tsx"));
const ProductDetail = lazy(
  () => import("./pages/products/[productId]/page.tsx"),
);
const Inventory = lazy(() => import("./pages/inventory/page.tsx"));
const Movements = lazy(() => import("./pages/inventory/movements/page.tsx"));
const Packing = lazy(() => import("./pages/packing/page.tsx"));
const Accounts = lazy(() => import("./pages/finance/accounts/page.tsx"));
const AccountLedger = lazy(
  () => import("./pages/finance/accounts/[accountId]/page.tsx"),
);
const Journal = lazy(() => import("./pages/finance/journal/page.tsx"));
const Closing = lazy(() => import("./pages/finance/closing/page.tsx"));
const Statements = lazy(() => import("./pages/finance/statements/page.tsx"));
const Courier = lazy(() => import("./pages/finance/courier/page.tsx"));
const CashFlow = lazy(() => import("./pages/finance/cashflow/page.tsx"));
const OpeningBalances = lazy(
  () => import("./pages/finance/closing/opening/page.tsx"),
);
const MonthClosing = lazy(
  () => import("./pages/finance/closing/[month]/page.tsx"),
);
const Orders = lazy(() => import("./pages/orders/page.tsx"));
const OrderDetail = lazy(() => import("./pages/orders/[orderId]/page.tsx"));
const Finance = lazy(() => import("./pages/finance/page.tsx"));
const Team = lazy(() => import("./pages/team/page.tsx"));
const SettingsPage = lazy(() => import("./pages/settings/page.tsx"));
const WebsiteControls = lazy(() => import("./pages/website/page.tsx"));
const PromoCodes = lazy(() => import("./pages/website/promos/page.tsx"));
const ManageFields = lazy(() => import("./pages/admin/fields/page.tsx"));
// Customer shop (team preview until it's opened in Settings)
const ShopLayout = lazy(() => import("./pages/shop/layout.tsx"));
const ShopHome = lazy(() => import("./pages/shop/page.tsx"));
const ShopProduct = lazy(() => import("./pages/shop/product.tsx"));
const ShopCart = lazy(() => import("./pages/shop/cart.tsx"));
const ShopSection = lazy(() => import("./pages/shop/section.tsx"));
const ShopWelcome = lazy(() => import("./pages/shop/welcome.tsx"));
const ShopSignIn = lazy(() => import("./pages/shop/signin.tsx"));
const ShopSignUp = lazy(() => import("./pages/shop/signup.tsx"));
const ShopForgot = lazy(() => import("./pages/shop/forgot.tsx"));
const ShopReset = lazy(() => import("./pages/shop/reset.tsx"));
const ShopVerify = lazy(() => import("./pages/shop/verify.tsx"));
const ShopAccount = lazy(() => import("./pages/shop/account.tsx"));
const ShopCheckout = lazy(() => import("./pages/shop/checkout.tsx"));
const ShopThanks = lazy(() => import("./pages/shop/thanks.tsx"));
const ShopContact = lazy(() => import("./pages/shop/contact.tsx"));
const Customers = lazy(() => import("./pages/customers/page.tsx"));

function section(name: Section, Page: ComponentType): ReactNode {
  return (
    <SectionGuard section={name}>
      <Page />
    </SectionGuard>
  );
}

function admin(Page: ComponentType): ReactNode {
  return (
    <AdminGuard>
      <Page />
    </AdminGuard>
  );
}

/** Pages render inside the shell, so errors and loading keep the navigation visible. */
function PageOutlet() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Outlet />
    </Suspense>
  );
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/setup", element: <SetupPage /> },
  { path: "/invite/:token", element: <LinkPage /> },
  { path: "/reset/:token", element: <LinkPage /> },
  {
    path: "/shop",
    element: (
      <Suspense fallback={null}>
        <ShopLayout />
      </Suspense>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <ShopHome /> },
      { path: "p/:productId", element: <ShopProduct /> },
      { path: "cart", element: <ShopCart /> },
      { path: "s/:section", element: <ShopSection /> },
      { path: "welcome", element: <ShopWelcome /> },
      { path: "signin", element: <ShopSignIn /> },
      { path: "signup", element: <ShopSignUp /> },
      { path: "forgot", element: <ShopForgot /> },
      { path: "reset/:token", element: <ShopReset /> },
      { path: "verify/:token", element: <ShopVerify /> },
      { path: "account", element: <ShopAccount /> },
      { path: "checkout", element: <ShopCheckout /> },
      { path: "thanks", element: <ShopThanks /> },
      { path: "contact", element: <ShopContact /> },
    ],
  },
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      {
        element: <PageOutlet />,
        errorElement: <RouteError />,
        children: [
          { path: "/", element: section("dashboard", Dashboard) },
          { path: "/orders", element: section("orders", Orders) },
          { path: "/orders/:orderId", element: section("orders", OrderDetail) },
          { path: "/packing", element: section("orders", Packing) },
          { path: "/customers", element: section("orders", Customers) },
          { path: "/products", element: section("inventory", Products) },
          {
            path: "/products/:productId",
            element: section("inventory", ProductDetail),
          },
          { path: "/inventory", element: section("inventory", Inventory) },
          {
            path: "/inventory/movements",
            element: section("inventory", Movements),
          },
          // Old pages: damaged items are written off now; adjustments live in Stock and Movements
          {
            path: "/inventory/damaged",
            element: <Navigate to="/inventory" replace />,
          },
          {
            path: "/inventory/adjustments",
            element: (
              <Navigate
                to="/inventory/movements?types=adjustment,write_off,return_write_off,transit_write_off,cost_correction"
                replace
              />
            ),
          },
          { path: "/finance", element: section("finance", Finance) },
          // The old Expenses page: running costs are journal entries now
          { path: "/finance/expenses", element: <Navigate to="/finance/journal" replace /> },
          { path: "/finance/accounts", element: section("finance", Accounts) },
          {
            path: "/finance/accounts/:accountId",
            element: section("finance", AccountLedger),
          },
          { path: "/finance/journal", element: section("finance", Journal) },
          { path: "/finance/closing", element: section("finance", Closing) },
          { path: "/finance/statements", element: section("finance", Statements) },
          { path: "/finance/courier", element: section("finance", Courier) },
          { path: "/finance/cashflow", element: section("finance", CashFlow) },
          {
            path: "/finance/closing/opening",
            element: section("finance", OpeningBalances),
          },
          {
            path: "/finance/closing/:month",
            element: section("finance", MonthClosing),
          },
          { path: "/team", element: admin(Team) },
          { path: "/settings", element: admin(SettingsPage) },
          { path: "/website", element: admin(WebsiteControls) },
          { path: "/website/promos", element: admin(PromoCodes) },
          { path: "/admin/fields", element: admin(ManageFields) },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);

function AppUpdates() {
  useAppUpdates();
  return null;
}

export default function App() {
  return (
    <DefaultProviders>
      <AppUpdates />
      <RouterProvider router={router} />
    </DefaultProviders>
  );
}
