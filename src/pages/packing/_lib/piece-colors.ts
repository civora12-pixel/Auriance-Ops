import type { CSSProperties } from "react";

/**
 * A fixed, solid colour for each number of pieces, so the count is read at a
 * glance: 1 white, 2 yellow, 3 green, 4 violet, 5 orange, 6 light green, 7 or
 * more turquoise. Set inline (not through theme classes) so no theme, dark
 * mode, browser auto-darkening or print setting can wash it out.
 */
export const PIECE_COLORS: Record<number, { bg: string; fg: string; ring: string }> = {
  1: { bg: "#ffffff", fg: "#111111", ring: "#9ca3af" },
  2: { bg: "#facc15", fg: "#1f1600", ring: "#a16207" },
  3: { bg: "#15803d", fg: "#ffffff", ring: "#14532d" },
  4: { bg: "#7c3aed", fg: "#ffffff", ring: "#4c1d95" },
  5: { bg: "#ea580c", fg: "#ffffff", ring: "#9a3412" },
  6: { bg: "#4ade80", fg: "#052e16", ring: "#15803d" },
};
const TURQUOISE = { bg: "#14b8a6", fg: "#042f2e", ring: "#0f766e" };
export const pieceColor = (n: number) => PIECE_COLORS[Math.max(1, n)] ?? TURQUOISE;

export function pieceStyle(n: number): CSSProperties {
  const c = pieceColor(n);
  return {
    backgroundColor: c.bg,
    color: c.fg,
    boxShadow: `0 0 0 2px ${c.ring}`,
    printColorAdjust: "exact",
    WebkitPrintColorAdjust: "exact",
    forcedColorAdjust: "none",
  };
}
