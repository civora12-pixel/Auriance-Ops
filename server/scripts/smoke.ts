/**
 * End-to-end check of the built app: starts dist/server on a temporary database
 * and walks the main workflows over HTTP. Run `pnpm build` first.
 *
 *   pnpm smoke                       # starts the built server itself
 *   SMOKE_URL=http://localhost:3000 pnpm smoke   # or target a running one (it must have no users)
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const ADMIN = {
  email: "owner@smoke.test",
  password: "smoke-test-password",
  name: "Smoke Owner",
};

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(
    `${ok ? "✓" : "✗"} ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`,
  );
  if (!ok) failures++;
}

function client(base: string) {
  let cookie = "";
  async function call(method: string, url: string, body?: unknown) {
    const res = await fetch(base + url, {
      method,
      headers: {
        "content-type": "application/json",
        origin: base,
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const type = res.headers.get("content-type") ?? "";
    const data: any = type.includes("json")
      ? await res.json()
      : await res.arrayBuffer();
    return { status: res.status, data, headers: res.headers };
  }
  return {
    call,
    async rpc<T = any>(name: string, input?: unknown): Promise<T> {
      const res = await call("POST", `/api/rpc/${name}`, input ?? {});
      if (res.status !== 200)
        throw new Error(
          `${name} failed (${res.status}): ${JSON.stringify(res.data)}`,
        );
      return res.data as T;
    },
    rpcStatus: async (name: string, input?: unknown) =>
      (await call("POST", `/api/rpc/${name}`, input ?? {})).status,
  };
}

async function waitForHealth(base: string, ms = 15_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server at ${base} did not become healthy`);
}

async function main() {
  let base = process.env.SMOKE_URL;
  let stop = () => {};
  let tmp: string | undefined;

  if (!base) {
    const entry = path.join(root, "dist/server/index.js");
    if (!fs.existsSync(entry))
      throw new Error(
        "dist/server/index.js not found. Run `pnpm build` first.",
      );
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auriance-smoke-"));
    const port = 3900 + Math.floor(Math.random() * 90);
    base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [entry], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        HOST: "127.0.0.1",
        DATABASE_PATH: path.join(tmp, "app.db"),
        BACKUP_DIR: path.join(tmp, "backups"),
        ADMIN_EMAIL: ADMIN.email,
        ADMIN_PASSWORD: ADMIN.password,
        ADMIN_NAME: ADMIN.name,
        APP_CURRENCY: "EGP",
        APP_TIMEZONE: "Africa/Cairo",
        SEED_DEMO: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on(
      "data",
      (d) =>
        process.env.SMOKE_VERBOSE && process.stdout.write(`  [server] ${d}`),
    );
    child.stderr.on("data", (d) => process.stderr.write(`  [server] ${d}`));
    stop = () => child.kill("SIGTERM");
  }

  try {
    await waitForHealth(base);
    check("health check responds", true);

    // The SPA is served for client routes when the frontend is built
    const page = await fetch(`${base}/orders/some-id`);
    check(
      "SPA shell served for deep links",
      page.ok && (await page.text()).includes('<div id="root">'),
    );

    const admin = client(base);
    const anon = client(base);
    check("API needs a session", (await anon.rpcStatus("orders.list")) === 401);

    let me = await admin.call("GET", "/api/auth/me");
    if (me.data.needsSetup) {
      const setup = await admin.call("POST", "/api/auth/setup", ADMIN);
      check(
        "first-run setup creates the admin",
        setup.status === 200,
        setup.data,
      );
    } else {
      const login = await admin.call("POST", "/api/auth/login", {
        email: ADMIN.email,
        password: ADMIN.password,
      });
      check("admin signs in", login.status === 200, login.data);
    }
    me = await admin.call("GET", "/api/auth/me");
    check("session is active", me.data.user?.role === "admin", me.data);

    const crossSite = await fetch(`${base}/api/auth/logout`, {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    check("cross-site POST blocked", crossSite.status === 403);

    // Catalog and stock
    const productId = await admin.rpc<string>("products.create", {
      sku: "SMOKE-TEE",
      name: "Smoke Tee",
      category: "Apparel",
      unitPrice: 200,
      uom: "pcs",
      reorderThreshold: 3,
      variants: [
        { sku: "SMOKE-TEE-S", name: "Small" },
        { sku: "SMOKE-TEE-M", name: "Medium" },
      ],
    });
    const product = await admin.rpc("products.get", { productId });
    const [small, medium] = product.variants.map((v: { _id: string }) => v._id);
    await admin.rpc("inventory.restock", {
      productId,
      variantId: small,
      restockType: "purchase",
      quantity: 10,
      cost: 80,
    });
    await admin.rpc("inventory.restock", {
      productId,
      variantId: medium,
      restockType: "purchase",
      quantity: 10,
      cost: 80,
    });
    check(
      "product restocked",
      (await admin.rpc("products.get", { productId })).totalOnHand === 20,
    );

    // Order lifecycle
    const stats = await admin.rpc("dashboard.getStats");
    const orderId = await admin.rpc<string>("orders.create", {
      orderDate: stats.today,
      customer: "Smoke Customer",
      customerPhone: "+20 100 000 0001",
      address: "Smoke address",
      channel: "facebook",
      shippingFee: 70,
      shipmentNumber: "SMK-1",
      total: 1000,
      lineItems: [
        { productId, variantId: small, quantity: 5, gender: "girls" },
      ],
    });
    let order = await admin.rpc("orders.get", { orderId });
    check(
      "order created",
      order.status === "new" && order.total === 1000,
      order,
    );

    await admin.rpc("orders.updateStatus", { orderId, status: "shipped" });
    order = await admin.rpc("orders.get", { orderId });
    check("order shipped", order.status === "shipped");

    await admin.rpc("orders.returnLineItems", {
      orderId,
      lines: [
        { lineItemId: order.lineItems[0]._id, quantity: 1, sellable: true },
      ],
      note: "Smoke return",
    });
    order = await admin.rpc("orders.get", { orderId });
    check(
      "return refunds the line price",
      order.total === 800 && order.refundedAmount === 200,
      order,
    );

    const line = order.lineItems.find(
      (l: { returnable: number }) => l.returnable > 0,
    );
    await admin.rpc("orders.swapLineItem", {
      orderId,
      returnLineItemId: line._id,
      returnQuantity: 1,
      returnSellable: true,
      replacementProductId: productId,
      replacementVariantId: medium,
      replacementQuantity: 1,
      replacementUnitPrice: 220,
    });
    order = await admin.rpc("orders.get", { orderId });
    check(
      "swap records the price difference",
      order.status === "swapped" && order.total === 820,
      order,
    );

    await admin.rpc("payments.setPayment", {
      orderId,
      status: "paid",
      method: "cash",
    });
    order = await admin.rpc("orders.get", { orderId });
    check("order marked paid", order.paymentStatus === "paid");

    await admin.rpc("finance.expenses.create", {
      date: stats.today,
      category: "rent",
      amount: 100,
      description: "Smoke rent",
    });
    const report = await admin.rpc("finance.report.report", {
      fromDay: stats.today,
      toDay: stats.today,
    });
    check(
      "finance report adds up",
      report.summary.netRevenue === 820 &&
        report.summary.cogs === 320 &&
        report.summary.netProfit === 400,
      report.summary,
    );
    const dash = await admin.rpc("dashboard.getStats");
    check(
      "dashboard sales match finance",
      dash.kpis.salesToday === report.summary.netRevenue,
      dash.kpis,
    );

    const exported = await admin.rpc("finance.exports.exportData", {
      fromDay: stats.today,
      toDay: stats.today,
    });
    check(
      "accounting export includes the sale",
      JSON.stringify(exported).includes("Smoke Customer"),
    );

    // Admin Mode and backup
    check(
      "backup needs Admin Mode",
      (await admin.call("GET", "/api/admin/backup")).status === 403,
    );
    const elevate = await admin.call("POST", "/api/auth/admin-mode", {
      password: ADMIN.password,
    });
    check(
      "Admin Mode turns on with the account password",
      elevate.status === 200,
      elevate.data,
    );
    const backup = await admin.call("GET", "/api/admin/backup");
    const bytes = new Uint8Array(backup.data as ArrayBuffer);
    check(
      "backup downloads a SQLite file",
      backup.status === 200 &&
        new TextDecoder().decode(bytes.slice(0, 15)) === "SQLite format 3",
    );

    // Team: invite a moderator (orders edit, inventory view, no finance)
    const invite = await admin.rpc("users.invite", {
      name: "Smoke Member",
      email: "member@smoke.test",
      role: "member",
      permissions: {
        access: { orders: "edit", inventory: "view" },
        canShipAndReturn: false,
      },
    });
    const token = String(invite.path).split("/").pop();
    const member = client(base);
    const accept = await member.call("POST", `/api/auth/link/${token}`, {
      password: "member-password-1",
    });
    check("member accepts the invite", accept.status === 200, accept.data);
    check(
      "member can list orders",
      (await member.rpcStatus("orders.list")) === 200,
    );
    check(
      "member is denied finance",
      (await member.rpcStatus("finance.report.report", {
        fromDay: stats.today,
        toDay: stats.today,
      })) === 403,
    );
    check(
      "member can open the packing queue",
      (await member.rpcStatus("orders.packingQueue")) === 200,
    );
    check(
      "member is denied team admin",
      (await member.rpcStatus("users.listTeam")) === 403,
    );

    await admin.call("POST", "/api/auth/logout");
    check("signed out", (await admin.rpcStatus("orders.list")) === 401);
  } finally {
    stop();
    if (tmp) {
      await new Promise((r) => setTimeout(r, 300));
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log(
    failures ? `\n${failures} check(s) failed` : "\nAll smoke checks passed",
  );
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
