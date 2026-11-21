import { describe, expect, it } from "vitest";
import { pieceColor, pieceStyle } from "./piece-colors.ts";

describe("piece colours", () => {
  it("gives every count its own fixed colour", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 12].map((n) => pieceColor(n).bg)).toEqual([
      "#ffffff", // white
      "#facc15", // yellow
      "#15803d", // green
      "#7c3aed", // violet
      "#ea580c", // orange
      "#4ade80", // light green
      "#14b8a6", // turquoise
      "#14b8a6",
    ]);
    // Set straight on the element, printed as shown
    expect(pieceStyle(3)).toMatchObject({ backgroundColor: "#15803d", color: "#ffffff", printColorAdjust: "exact" });
  });
});
