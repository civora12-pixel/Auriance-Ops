import { defineConfig } from "tsup";

// Bundles the API server into dist/server/index.js. Native and heavy deps stay external.
export default defineConfig({
  entry: { index: "server/index.ts" },
  outDir: "dist/server",
  format: ["esm"],
  platform: "node",
  target: "node22",
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ["better-sqlite3", "sharp"],
});
