import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { bootstrapAdmin } from "./routes.ts";
import { testDb } from "../test/helpers.ts";

function client(app: ReturnType<typeof createApp>) {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { call, rpc: (path: string, input?: unknown) => call("POST", `/api/rpc/${path}`, input ?? {}) };
}

function newApp() {
  const db = testDb();
  return { db, app: createApp({ db, env: { NODE_ENV: "test", APP_ORIGIN: undefined }, log: () => {} }) };
}

describe("auth", () => {
  it("runs setup once, then requires login", async () => {
    const { app } = newApp();
    const c = client(app);
    expect((await c.call("GET", "/api/auth/me")).body.needsSetup).toBe(true);
    expect((await c.call("POST", "/api/auth/setup", { name: "Ada", email: "ada@x.io", password: "short" })).status).toBe(400);
    const setup = await c.call("POST", "/api/auth/setup", { name: "Ada", email: "Ada@X.io", password: "correct horse" });
    expect(setup.body.user.role).toBe("admin");
    expect((await c.rpc("users.myPermissions")).body.access.finance).toBe("edit");
    const other = client(app);
    expect((await other.call("POST", "/api/auth/setup", { name: "Eve", email: "eve@x.io", password: "correct horse" })).status).toBe(409);
    expect((await other.rpc("orders.list")).status).toBe(401);
    expect((await other.call("POST", "/api/auth/login", { email: "ada@x.io", password: "wrong password" })).status).toBe(401);
    expect((await other.call("POST", "/api/auth/login", { email: "ada@x.io", password: "correct horse" })).status).toBe(200);
    expect((await other.rpc("orders.list")).status).toBe(200);
    await other.call("POST", "/api/auth/logout");
    expect((await other.rpc("orders.list")).status).toBe(401);
  });

  it("invites a member who sets a password and only sees granted sections", async () => {
    const { db, app } = newApp();
    await bootstrapAdmin(db, { ADMIN_EMAIL: "boss@x.io", ADMIN_PASSWORD: "admin password" });
    const admin = client(app);
    await admin.call("POST", "/api/auth/login", { email: "boss@x.io", password: "admin password" });
    const invite = await admin.rpc("users.invite", {
      name: "Sam",
      email: "sam@x.io",
      role: "member",
      permissions: { access: { orders: "edit", finance: "view" }, canShipAndReturn: false },
    });
    expect(invite.status).toBe(200);
    const token = invite.body.path.split("/").pop();
    const member = client(app);
    expect((await member.call("GET", `/api/auth/link/${token}`)).body).toMatchObject({ kind: "invite", email: "sam@x.io" });
    expect((await member.call("POST", `/api/auth/link/${token}`, { password: "member password" })).status).toBe(200);
    expect((await member.call("POST", `/api/auth/link/${token}`, { password: "member password" })).status).toBe(404);
    expect((await member.rpc("users.myPermissions")).body).toEqual({ access: { orders: "edit", finance: "view" }, canShipAndReturn: false });
    // Finance view: reports yes, recording journal entries no
    expect((await member.rpc("finance.report.report", { fromDay: "2026-01-01", toDay: "2026-01-31" })).status).toBe(200);
    expect((await member.rpc("finance.journal.create", { date: "2026-01-01", memo: "x", lines: [{ accountId: "a", debit: 5, credit: 0 }, { accountId: "b", debit: 0, credit: 5 }] })).status).toBe(403);

    // Deactivation signs the member out
    const team = await admin.rpc("users.listTeam");
    const sam = team.body.find((u: { email: string }) => u.email === "sam@x.io");
    await admin.rpc("users.setActive", { userId: sam._id, isActive: false });
    expect((await member.rpc("orders.list")).status).toBe(401);
  });

  it("gates destructive actions and backups behind Admin Mode", async () => {
    const { db, app } = newApp();
    await bootstrapAdmin(db, { ADMIN_EMAIL: "boss@x.io", ADMIN_PASSWORD: "admin password" });
    const admin = client(app);
    await admin.call("POST", "/api/auth/login", { email: "boss@x.io", password: "admin password" });
    expect((await admin.call("GET", "/api/admin/backup")).status).toBe(403);
    expect((await admin.call("POST", "/api/auth/admin-mode", { password: "nope" })).status).toBe(400);
    const on = await admin.call("POST", "/api/auth/admin-mode", { password: "admin password" });
    expect(on.body.adminModeUntil).toBeGreaterThan(Date.now());
    const res = await app.request("/api/admin/backup", { headers: { cookie: "" } });
    expect(res.status).toBe(401);
    expect((await admin.rpc("admin.fields.update", { section: "orders", field: "nope", visible: false })).status).toBe(400);
    await admin.call("DELETE", "/api/auth/admin-mode");
    expect((await admin.rpc("admin.fields.update", { section: "orders", field: "customerPhone", visible: false })).status).toBe(403);
  });

  it("blocks cross-site requests", async () => {
    const { app } = newApp();
    const c = client(app);
    const res = await c.call("POST", "/api/auth/login", { email: "a@b.co", password: "x" }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });
});
