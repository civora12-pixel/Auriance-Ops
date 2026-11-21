import { describe, expect, it } from "vitest";
import { matchesSearch, parseSearch } from "./search.ts";

describe("search syntax", () => {
  it("splits | into alternatives and spaces into words", () => {
    expect(parseSearch(" TEE red | ord-12|| ")).toEqual([
      ["tee", "red"],
      ["ord-12"],
    ]);
    expect(parseSearch("")).toEqual([]);
  });

  it("matches any alternative, all words within one", () => {
    expect(matchesSearch("Tee shirt – Red TEE-RED", "TEE-RED|TEE-BLK")).toBe(
      true,
    );
    expect(matchesSearch("Tee shirt – Black TEE-BLK", "TEE-RED|TEE-BLK")).toBe(
      true,
    );
    expect(matchesSearch("Hoodie HOOD-1", "TEE-RED|TEE-BLK")).toBe(false);
    expect(matchesSearch("Tee shirt red", "tee red")).toBe(true);
    expect(matchesSearch("Tee shirt blue", "tee red")).toBe(false);
    expect(matchesSearch("anything", "  ")).toBe(true);
  });
});
