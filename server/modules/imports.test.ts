import { describe, expect, it } from "vitest";
import { setup, stockedProduct } from "../test/helpers.ts";

const base = { category: "Cat", uom: "pcs", reorderThreshold: 0 };

describe("imports", () => {
  it("imports products and variants and reports errors with CSV row numbers", () => {
    const { api } = setup();
    const result = api.imports.bulkProductImport({
      products: [
        {
          row: 2,
          sku: "TEE",
          name: "Tee",
          unitPrice: 0,
          ...base,
          variantName: "S",
          variantSku: "TEE-S",
        },
        {
          row: 3,
          sku: "TEE",
          name: "Tee v2",
          unitPrice: 0,
          ...base,
          variantName: "M",
          variantSku: "TEE-M",
        },
        { row: 4, sku: "MUG", name: "", unitPrice: 5, ...base },
        { row: 6, sku: "TEE-S", name: "Clash", unitPrice: 5, ...base },
      ],
    });
    expect(result.imported).toBe(1);
    expect(result.variants).toBe(2);
    expect(result.errors).toEqual([
      "Row 4: Missing a required value (name, uom)",
      'Row 6: SKU "TEE-S" already exists',
    ]);
    expect(result.warnings[0]).toMatch(/^Row 3:/);
  });

  it("restocks by variant SKU first, then by product SKU and variant name", () => {
    const { api } = setup();
    const { productId, variantIds } = stockedProduct(api, {
      sku: "TEE",
      variants: ["S", "M"],
    });
    const result = api.imports.bulkRestock({
      lines: [
        { row: 2, sku: "tee-s", quantity: 4, cost: 3 },
        { row: 3, sku: "TEE", variantName: "m", quantity: 2, cost: 5 },
        { row: 4, sku: "TEE", quantity: 1 },
        { row: 5, sku: "NOPE", quantity: 1 },
        { row: 7, sku: "TEE-S", quantity: 0 },
      ],
    });
    expect(result.imported).toBe(2);
    expect(result.units).toBe(6);
    expect(result.errors.map((e) => e.split(":")[0])).toEqual([
      "Row 4",
      "Row 5",
      "Row 7",
    ]);
    const p = api.products.get({ productId })!;
    expect(p.variants.find((v) => v._id === variantIds[0])!.onHand).toBe(4);
    expect(p.variants.find((v) => v._id === variantIds[1])!.onHand).toBe(2);
  });
});

describe("automatic SKUs", () => {
  it("assigns CIV numbers to products and -01, -02 to their variants, never twice", () => {
    const { api } = setup();
    const tee = api.products.create({
      name: "Tee",
      category: "Tops",
      unitPrice: 10,
      uom: "pcs",
      reorderThreshold: 0,
      variants: [{ name: "Red" }, { name: "Black" }],
    });
    const mug = api.products.create({
      name: "Mug",
      category: "Home",
      unitPrice: 5,
      uom: "pcs",
      reorderThreshold: 0,
    });
    const teeP = api.products.get({ productId: tee })!;
    expect(teeP.sku).toBe("CIV-0001");
    expect(teeP.variants.map((v) => v.sku)).toEqual([
      "CIV-0001-01",
      "CIV-0001-02",
    ]);
    expect(api.products.get({ productId: mug })!.sku).toBe("CIV-0002");

    api.products.addVariant({ productId: tee, name: "White" });
    expect(
      api.products.get({ productId: tee })!.variants.map((v) => v.sku),
    ).toContain("CIV-0001-03");

    // Import without SKUs groups rows by product name
    const result = api.imports.bulkProductImport({
      products: [
        { row: 2, name: "Short", unitPrice: 0, ...base, variantName: "S" },
        { row: 3, name: "Short", unitPrice: 0, ...base, variantName: "M" },
        { row: 4, name: "Socks", unitPrice: 0, ...base },
      ],
    });
    expect(result).toMatchObject({ imported: 2, variants: 2, errors: [] });
    const skus = api.products
      .list({})
      .map((p) => p.sku)
      .sort();
    expect(skus).toEqual(["CIV-0001", "CIV-0002", "CIV-0003", "CIV-0004"]);
  });

  it("deletes only items without activity, and the database refuses SKU clashes", () => {
    const { api, as, admin, db } = setup();
    const unused = api.products.create({
      name: "Typo",
      category: "X",
      unitPrice: 1,
      uom: "pcs",
      reorderThreshold: 0,
    });
    const { productId: used } = stockedProduct(api, { sku: "USED", stock: 1 });
    const elevated = as(admin, true);
    expect(
      elevated.admin.catalog.deletionPreview({
        target: { kind: "product", productId: used },
      })!.hasActivity,
    ).toBe(true);
    expect(() =>
      elevated.admin.catalog.deleteProduct({ productId: used }),
    ).toThrow(/Mark it inactive/);
    elevated.admin.catalog.deleteProduct({ productId: unused });
    // The newest number is free again once its product is gone
    const again = api.products.create({
      name: "Fixed",
      category: "X",
      unitPrice: 1,
      uom: "pcs",
      reorderThreshold: 0,
    });
    expect(api.products.get({ productId: again })!.sku).toBe("CIV-0001");

    expect(() =>
      db.$client
        .prepare(
          "insert into product_variants (id, created_at, product_id, sku, name) values ('v', 0, ?, 'used', 'x')",
        )
        .run(used),
    ).toThrow();
  });
});

describe("opening stock on new products", () => {
  it("puts counted stock in at its unit cost, for products and for each variant", () => {
    const { api } = setup();
    const plain = api.products.create({
      name: "Bib",
      category: "Baby",
      unitPrice: 50,
      uom: "pcs",
      reorderThreshold: 0,
      opening: { quantity: 12, unitCost: 20 },
    });
    expect(api.products.get({ productId: plain })).toMatchObject({
      onHand: 12,
      avgCost: 20,
    });
    const withVariants = api.products.create({
      name: "Onesie",
      category: "Baby",
      unitPrice: 150,
      uom: "pcs",
      reorderThreshold: 0,
      variants: [
        { name: "0-3", opening: { quantity: 4, unitCost: 60 } },
        { name: "3-6" },
      ],
    });
    const p = api.products.get({ productId: withVariants })!;
    expect(p.variants.map((v) => [v.name, v.onHand, v.avgCost])).toEqual([
      ["0-3", 4, 60],
      ["3-6", 0, 0],
    ]);
    const moves = api.inventory.listMovements({
      page: 1,
      pageSize: 10,
    } as never) as {
      items: { restockType: string | null; quantityChange: number }[];
    };
    expect(
      moves.items
        .filter((m) => m.restockType === "opening")
        .map((m) => m.quantityChange)
        .sort(),
    ).toEqual([12, 4].sort());
  });
});
