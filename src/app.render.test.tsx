// Mounts the real app in jsdom against the real server (in-memory SQLite with
// demo data) and visits every page, so runtime crashes show up without a browser.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createApp } from "../server/app.ts";
import { seedDemo } from "../server/seed.ts";
import { testDb } from "../server/test/helpers.ts";
import { orders, products, users } from "../server/db/schema.ts";

let orderId = "";
let productId = "";
const errors: string[] = [];

beforeAll(async () => {
  const db = testDb();
  const app = createApp({
    db,
    env: { NODE_ENV: "test", APP_ORIGIN: undefined },
    log: (m) => errors.push(m),
  });

  let cookie = "";
  vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (cookie) headers.set("cookie", cookie);
    const res = await app.request(String(input), { ...init, headers });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  });

  const setup = await fetch("/api/auth/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Ada Admin",
      email: "ada@example.com",
      password: "correct horse",
    }),
  });
  expect(setup.status).toBe(200);
  seedDemo(db, db.select().from(users).get()!);
  orderId = db.select().from(orders).get()!._id;
  productId = db.select().from(products).get()!._id;

  // Browser APIs jsdom doesn't provide
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // Node's own (file-less) localStorage shadows jsdom's
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  });
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
}, 30_000);

const routes: [path: () => string, heading: RegExp][] = [
  [() => "/", /dashboard|good (morning|afternoon|evening)|welcome/i],
  [() => "/orders", /orders/i],
  [() => "/orders?status=open", /orders/i],
  [() => `/orders/${orderId}`, /ORD-\d+/],
  [() => "/orders/missing-id", /not found/i],
  [() => "/products", /products/i],
  [() => `/products/${productId}`, /.+/],
  [() => "/inventory", /stock/i],
  [() => "/inventory/movements", /movements/i],
  // Old pages redirect to Stock and Movements
  [() => "/inventory/damaged", /stock/i],
  [() => "/inventory/adjustments", /movements/i],
  [() => "/packing", /packing/i],
  [() => "/finance", /finance/i],
  [() => "/finance/cashflow", /cash flow/i],
  // The old Expenses page now opens the journal
  [() => "/finance/expenses", /journal/i],
  [() => "/team", /team/i],
  [() => "/settings", /settings/i],
  [() => "/admin/fields", /fields/i],
  [() => "/nowhere", /not found/i],
];

describe("every page renders against the real server", () => {
  it.each(routes.map(([path, heading], i) => [i, path, heading] as const))(
    "route %i",
    async (_i, path, heading) => {
      const url = path();
      window.history.replaceState({}, "", url);
      vi.resetModules();
      const logged: unknown[][] = [];
      const spy = vi
        .spyOn(console, "error")
        .mockImplementation((...args) => void logged.push(args));
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation((...args) => void logged.push(args));
      try {
        const { default: App } = await import("./App.tsx");
        render(<App />);
        const h1 = await screen.findByRole(
          "heading",
          { level: 1 },
          { timeout: 15_000 },
        );
        expect(h1.textContent, url).toMatch(heading);
        // Let queries settle and lazy sections render
        await new Promise((r) => setTimeout(r, 400));
        await waitFor(
          () =>
            expect(
              document.querySelector("[data-slot=skeleton]"),
              `${url} still loading`,
            ).toBeNull(),
          { timeout: 5_000 },
        );
        expect(screen.queryByText("Something went wrong"), url).toBeNull();
        expect(errors, url).toEqual([]);
        // jsdom has no layout, so charts always measure 0×0
        const unexpected = logged
          .map((args) => args.map(String).join(" "))
          .filter((m) => !m.includes("of chart should be greater than 0"));
        expect(unexpected, url).toEqual([]);
      } finally {
        spy.mockRestore();
        warn.mockRestore();
      }
    },
    30_000,
  );

  it.each(routes.map(([path], i) => [i, path] as const))(
    "route %i in Arabic",
    async (_i, path) => {
      const url = path();
      localStorage.setItem("lang", "ar");
      window.history.replaceState({}, "", url);
      vi.resetModules();
      const logged: unknown[][] = [];
      const spy = vi
        .spyOn(console, "error")
        .mockImplementation((...args) => void logged.push(args));
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation((...args) => void logged.push(args));
      try {
        const { default: App } = await import("./App.tsx");
        render(<App />);
        const h1 = await screen.findByRole(
          "heading",
          { level: 1 },
          { timeout: 15_000 },
        );
        await waitFor(() =>
          expect(document.documentElement.dir, url).toBe("rtl"),
        );
        // Headings are Arabic, except order numbers and product names (data)
        if (!url.startsWith("/orders/") || url.endsWith("missing-id")) {
          if (!url.startsWith("/products/"))
            expect(h1.textContent, url).toMatch(/[\u0600-\u06FF]/);
        }
        await new Promise((r) => setTimeout(r, 400));
        await waitFor(
          () =>
            expect(
              document.querySelector("[data-slot=skeleton]"),
              `${url} still loading`,
            ).toBeNull(),
          { timeout: 5_000 },
        );
        expect(screen.queryByText("Something went wrong"), url).toBeNull();
        expect(errors, url).toEqual([]);
        const unexpected = logged
          .map((args) => args.map(String).join(" "))
          .filter((m) => !m.includes("of chart should be greater than 0"));
        expect(unexpected, url).toEqual([]);
      } finally {
        localStorage.removeItem("lang");
        spy.mockRestore();
        warn.mockRestore();
      }
    },
    30_000,
  );

  it("opens the new-order dialog from the dashboard link", async () => {
    window.history.replaceState({}, "", "/orders?new=1");
    vi.resetModules();
    const { default: App } = await import("./App.tsx");
    render(<App />);
    const dialog = await screen.findByRole("dialog", {}, { timeout: 15_000 });
    expect(dialog.textContent).toMatch(/new order/i);
    await waitFor(() => expect(window.location.search).toBe(""));
  }, 30_000);
});
