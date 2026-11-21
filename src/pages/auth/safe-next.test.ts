import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next.ts";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/orders/abc?tab=items")).toBe("/orders/abc?tab=items");
  });

  it("rejects other sites and auth pages", () => {
    for (const next of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "/login?next=/x", "/setup"]) {
      expect(safeNext(next)).toBe("/");
    }
  });
});
