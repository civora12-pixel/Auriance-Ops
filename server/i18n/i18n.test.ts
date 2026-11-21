import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { users } from "../db/schema.ts";
import { seedDemo } from "../seed.ts";
import { testDb } from "../test/helpers.ts";
import { COMPILED, langFrom, localizeResult, translate } from "./translate.ts";

const SERVER = join(import.meta.dirname, "..");
const ARABIC = /[\u0600-\u06FF]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [path] : [];
  });
}

const LITERAL = String.raw`(?:"(?:\\.|[^"\\])*"|\`(?:\\.|[^\`\\])*\`)`;
const MESSAGE = String.raw`(${LITERAL}(?:\s*\+\s*${LITERAL})*)`;
const PATTERNS = [
  // new AppError("CODE", "…"), including "…" + "…"
  new RegExp(String.raw`new AppError\(\s*"[A-Z_]+",\s*${MESSAGE}`, "g"),
  // fail(c, 400, "CODE", "…") in auth routes, fail("…") for import rows
  new RegExp(String.raw`\bfail\(\s*(?:c,\s*\d+,\s*"[A-Z_]+",\s*)?${MESSAGE}`, "g"),
  // zod messages: .min(1, "…"), .int("…"), .refine(fn, "…")
  new RegExp(String.raw`\.(?:min|max|int|positive|email|regex|refine)\((?:[^()"\`]|\([^()]*\))*?${MESSAGE}\s*\)`, "g"),
];

/** Server messages as samples, with each ${…} replaced by a value. */
function serverMessages(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of sourceFiles(SERVER)) {
    const text = readFileSync(file, "utf8");
    for (const pattern of PATTERNS) {
      for (const m of text.matchAll(pattern)) {
        const sample = [...m[1].matchAll(new RegExp(LITERAL, "g"))]
          .map(([lit]) => lit.slice(1, -1).replace(/\\(["'`\\])/g, "$1"))
          .join("")
          .replace(/\$\{[^}]*\}/g, "X1");
        if (!found.has(sample)) found.set(sample, relative(SERVER, file));
      }
    }
  }
  return found;
}

describe("Arabic server messages", () => {
  const messages = serverMessages();

  it("finds the server's messages", () => {
    expect(messages.size).toBeGreaterThan(100);
    expect(messages.has("Order not found")).toBe(true);
    expect(messages.has("Not enough stock for X1: X1 on hand, X1 needed")).toBe(true);
    expect(messages.has("Can't undo this movement: it would leave X1 stock at X1. Only X1 unit(s) are X1 now.")).toBe(true);
    expect(messages.has("Customer name is required")).toBe(true);
  });

  it("have an Arabic version of every message", () => {
    const missing = [...messages]
      .filter(([sample]) => !ARABIC.test(translate(sample, "ar")))
      .map(([sample, file]) => `${file}: ${sample}`);
    expect(missing).toEqual([]);
  });

  it("keep every placeholder in the Arabic templates", () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)[~*|]?\}/g)].map((m) => m[1]).sort();
    const wrong = COMPILED.filter((t) => names(t.en).join() !== names(t.ar).join()).map((t) => t.en);
    expect(wrong).toEqual([]);
  });
});

describe("translate", () => {
  it("reads the language from Accept-Language", () => {
    expect(langFrom("ar")).toBe("ar");
    expect(langFrom("ar-EG,ar;q=0.9")).toBe("ar");
    expect(langFrom("en-US")).toBe("en");
    expect(langFrom(undefined)).toBe("en");
  });

  it("leaves English alone", () => {
    expect(translate("Order not found", "en")).toBe("Order not found");
  });

  it("translates messages and fills in values", () => {
    expect(translate("Order not found", "ar")).toBe("الطلب غير موجود");
    expect(translate("Not enough stock for Mug – Blue: 2 on hand, 5 needed", "ar")).toBe(
      "المخزون غير كافٍ لـ Mug – Blue: المتوفر 2 والمطلوب 5",
    );
    expect(translate('SKU "MUG-1" is already used', "ar")).toBe('رمز SKU "MUG-1" مستخدم بالفعل');
    expect(translate("The paid date can't be in the future", "ar")).toBe("لا يمكن أن يكون تاريخ الدفع في المستقبل");
    expect(translate("You don't have access to Orders or Finance. Ask an admin.", "ar")).toBe(
      "ليست لديك صلاحية الوصول إلى الطلبات أو المالية. اطلب ذلك من المسؤول.",
    );
    expect(translate("Customer is required and can't be hidden", "ar")).toBe("العميل مطلوب ولا يمكن إخفاؤه");
    expect(translate("Can't undo this movement: it would leave on hand stock at -2. Only 3 unit(s) are on hand now.", "ar")).toBe(
      "لا يمكن التراجع عن هذه الحركة: سيصبح المخزون (المتوفر) -2. المتاح حاليًا (المتوفر) 3 وحدة فقط.",
    );
  });

  it("translates validation messages with a field path", () => {
    expect(translate("customer: Customer name is required", "ar")).toBe("customer: اسم العميل مطلوب");
    expect(translate("lineItems.0.quantity: Quantity must be a whole number", "ar")).toBe(
      "lineItems.0.quantity: يجب أن تكون الكمية عددًا صحيحًا",
    );
  });

  it("translates history notes and keeps the user's note as written", () => {
    expect(translate("Order created", "ar")).toBe("تم إنشاء الطلب");
    expect(translate("Updated customer, shipment notes", "ar")).toBe("تم تحديث العميل، ملاحظات الشحن");
    expect(translate("Marked paid (Bank transfer)", "ar")).toBe("تم التسجيل كمدفوع (تحويل بنكي)");
    expect(translate("Full return, refund $12.00", "ar")).toBe("إرجاع كامل، استرداد $12.00");
    expect(translate("Partial return, refund $5.50. Box was damaged. Customer kept the lid", "ar")).toBe(
      "إرجاع جزئي، استرداد $5.50. Box was damaged. Customer kept the lid",
    );
    expect(translate("Swapped 1 × Mug, large for 2 × Cup, customer pays $3.00 more. Prefers blue", "ar")).toBe(
      "استبدال 1 × Mug, large بـ 2 × Cup، يدفع العميل $3.00 إضافية. Prefers blue",
    );
    expect(translate("Item no longer in catalog, no stock change (Old mug)", "ar")).toBe(
      "العنصر لم يعد في الكتالوج، دون تغيير في المخزون (Old mug)",
    );
  });

  it("translates notifications", () => {
    expect(translate("New order: ORD-0012", "ar")).toBe("طلب جديد: ORD-0012");
    expect(translate("Low stock: Mug – Blue", "ar")).toBe("مخزون منخفض: Mug – Blue");
    expect(translate("3 pcs left, reorder at 5", "ar")).toBe("متبقٍ 3 pcs، إعادة الطلب عند 5");
    expect(translate("Ada Lovelace: partial return, refund $4.00", "ar")).toBe("Ada Lovelace: إرجاع جزئي، استرداد $4.00");
    expect(translate("Ada Lovelace: no price difference", "ar")).toBe("Ada Lovelace: لا يوجد فرق في السعر");
  });

  it("translates import rows", () => {
    expect(translate('Row 4: No product or variant with SKU "ZZ-9"', "ar")).toBe('الصف 4: لا يوجد منتج أو متغير برمز SKU "ZZ-9"');
    expect(translate("Row 3: Mug has no variants", "ar")).toBe("الصف 3: Mug ليس له متغيرات");
    expect(translate("Row 7: product details differ from row 6; row 6 was used", "ar")).toBe(
      "الصف 7: تفاصيل المنتج تختلف عن الصف 6؛ تم استخدام الصف 6",
    );
  });

  it("passes unknown text through unchanged", () => {
    for (const text of ["Ada Lovelace", "Customer asked to wait", "New", "Supplier: Acme", "", "ORD-0001"]) {
      expect(translate(text, "ar")).toBe(text);
    }
  });

  it("translates only server-written fields of a result", () => {
    const logs = localizeResult(
      "admin.destructive.listDeletionLogs",
      [
        {
          entitySummary: "ORD-0001 | Ada | 2026-03-01 | $10.00 | status: Shipped | paid",
          stockEffect: "Mug: reversed +2 → on hand 7; Cup: reversed +1 → not sellable 3",
          deletedByName: "Unknown user",
          reason: "Customer asked to wait",
        },
      ],
      "ar",
    );
    expect(logs).toEqual([
      {
        entitySummary: "ORD-0001 | Ada | 2026-03-01 | $10.00 | الحالة: تم الشحن | مدفوع",
        stockEffect: "Mug: تم عكس +2 ← المتوفر 7؛ Cup: تم عكس +1 ← غير القابل للبيع 3",
        deletedByName: "مستخدم غير معروف",
        reason: "Customer asked to wait",
      },
    ]);
    // A customer named like a status stays as is
    expect(localizeResult("notifications.list", [{ title: "New order: ORD-0001", body: "New" }], "ar")).toEqual([
      { title: "طلب جديد: ORD-0001", body: "New" },
    ]);
    expect(localizeResult("orders.get", { note: "Order created" }, "en")).toEqual({ note: "Order created" });
  });
});

describe("Accept-Language over the API", () => {
  async function signedIn() {
    const db = testDb();
    const app = createApp({ db, env: { NODE_ENV: "test", APP_ORIGIN: undefined }, log: () => {} });
    let cookie = "";
    const call = async (path: string, body: unknown, lang?: string) => {
      const res = await app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(lang ? { "accept-language": lang } : {}) },
        body: JSON.stringify(body),
      });
      const set = res.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    };
    await call("/api/auth/setup", { name: "Ada", email: "ada@x.io", password: "correct horse" });
    return { db, call };
  }

  it("sends errors in Arabic only when asked", async () => {
    const { call } = await signedIn();
    const en = await call("/api/rpc/notifications.markRead", { notificationId: "missing" });
    const ar = await call("/api/rpc/notifications.markRead", { notificationId: "missing" }, "ar");
    expect(en).toEqual({ status: 404, body: { code: "NOT_FOUND", message: "Notification not found" } });
    expect(ar).toEqual({ status: 404, body: { code: "NOT_FOUND", message: "الإشعار غير موجود" } });

    // zod's own messages and ours
    expect((await call("/api/rpc/orders.get", {}, "ar")).body.message).toMatch(ARABIC);
    expect((await call("/api/rpc/orders.get", {})).body.message).not.toMatch(ARABIC);
    expect((await call("/api/rpc/finance.journal.create", { date: "2026-01-01", memo: "x", lines: [] }, "ar")).body.message).toMatch(
      /^lines: .*[\u0600-\u06FF]/,
    );
    expect((await call("/api/rpc/nope", {}, "ar-EG")).body.message).toBe("استدعاء غير معروف للواجهة البرمجية");
    expect((await call("/api/auth/login", { email: "ada@x.io", password: "wrong password" }, "ar")).body.message).toBe(
      "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    );
  });

  it("translates stored history notes and notifications when read", async () => {
    const { db, call } = await signedIn();
    seedDemo(db, db.select().from(users).get()!);
    const list = await call("/api/rpc/orders.list", { pageSize: 1 });
    const orderId = list.body.items[0]._id;

    const en = await call("/api/rpc/orders.get", { orderId });
    const ar = await call("/api/rpc/orders.get", { orderId }, "ar");
    expect(en.body.history.map((h: { note?: string }) => h.note)).toContain("Order created");
    expect(ar.body.history.map((h: { note?: string }) => h.note)).toContain("تم إنشاء الطلب");

    const titles = (await call("/api/rpc/notifications.list", {}, "ar")).body.map((n: { title: string }) => n.title);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.every((t: string) => ARABIC.test(t))).toBe(true);
  });
});
