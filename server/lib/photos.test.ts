import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { bootstrapAdmin } from "../auth/routes.ts";
import { testDb } from "../test/helpers.ts";
import { bucketStore, folderStore } from "./photos.ts";

async function jpeg(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 80, b: 80 },
    },
  })
    .jpeg()
    .toBuffer();
}

async function signedIn() {
  const db = testDb();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "photos-test-"));
  const app = createApp({
    db,
    env: { NODE_ENV: "test", APP_ORIGIN: undefined },
    photos: folderStore(dir),
    log: () => {},
  });
  await bootstrapAdmin(db, {
    ADMIN_EMAIL: "boss@x.io",
    ADMIN_PASSWORD: "admin password",
  });
  const login = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "boss@x.io", password: "admin password" }),
  });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const rpc = async (p: string, input: unknown) => {
    const res = await app.request(`/api/rpc/${p}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(input),
    });
    return (await res.json()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const upload = async (bytes: Buffer, withCookie = true) => {
    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array(bytes)], "TEE-RED.jpg", { type: "image/jpeg" }),
    );
    return app.request("/api/photos", {
      method: "POST",
      headers: withCookie ? { cookie } : {},
      body: form,
    });
  };
  return { app, rpc, upload };
}

describe("product photos", () => {
  it("uploads, resizes, serves and attaches photos to variants with the product as fallback", async () => {
    const { app, rpc, upload } = await signedIn();
    expect((await upload(await jpeg(10, 10), false)).status).toBe(401);
    expect((await upload(Buffer.from("not an image"))).status).toBe(400);

    const res = await upload(await jpeg(4000, 3000));
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toMatch(/^\/api\/photos\/[a-z0-9]{32}\.webp$/);

    const served = await app.request(url);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/webp");
    const meta = await sharp(
      Buffer.from(await served.arrayBuffer()),
    ).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(1600);
    expect((await app.request("/api/photos/../../etc/passwd")).status).toBe(
      404,
    );

    const productId = await rpc("products.create", {
      sku: "TEE",
      name: "Tee",
      category: "Tops",
      unitPrice: 10,
      uom: "pcs",
      reorderThreshold: 0,
      variants: [
        { sku: "TEE-RED", name: "Red" },
        { sku: "TEE-BLK", name: "Black" },
      ],
    });
    const matches = await rpc("products.matchPhotoSkus", {
      skus: ["tee-red", "TEE", "NOPE"],
    });
    expect(matches.map((m: { match: unknown }) => Boolean(m.match))).toEqual([
      true,
      true,
      false,
    ]);
    const red = matches[0].match;
    expect(red.label).toBe("Tee – Red");

    await rpc("products.setPhoto", {
      productId: red.productId,
      variantId: red.variantId,
      imageUrl: url,
    });
    await rpc("products.setPhoto", {
      productId,
      imageUrl: "https://example.com/tee.jpg",
    });
    const items = await rpc("products.listSellableItems", {});
    const byName = Object.fromEntries(
      items.map((i: { variantName: string; imageUrl: string }) => [
        i.variantName,
        i.imageUrl,
      ]),
    );
    expect(byName.Red).toBe(url);
    expect(byName.Black).toBe("https://example.com/tee.jpg");

    const bad = await rpc("products.setPhoto", {
      productId,
      imageUrl: "javascript:alert(1)",
    });
    expect(bad.code).toBe("BAD_REQUEST");
  });

  it("signs bucket links for the configured bucket", async () => {
    const store = bucketStore({
      endpoint: "https://t3.storageapi.dev",
      bucket: "auriance-photos-abc123",
      region: "auto",
      accessKeyId: "id",
      secretAccessKey: "secret",
    });
    const found = await store.serve("0123456789abcdef0123456789abcdef.webp");
    expect(found && "redirect" in found).toBe(true);
    const link = new URL((found as { redirect: string }).redirect);
    expect(link.host).toBe("auriance-photos-abc123.t3.storageapi.dev");
    expect(link.pathname).toBe("/0123456789abcdef0123456789abcdef.webp");
    expect(link.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(link.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
});
