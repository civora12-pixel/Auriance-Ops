import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", "node_modules", "data", ".data"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-ignore": true, "ts-expect-error": true, "ts-nocheck": true }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "prefer-const": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs["recommended-latest"], reactRefresh.configs.vite],
    rules: {
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
  },
  {
    // Shared modules (shadcn/ui, providers, table helpers) export hooks and helpers next to components
    files: ["src/components/**/*.tsx", "src/lib/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    files: ["server/scripts/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    files: ["server/**/*.ts", "shared/**/*.ts", "*.config.ts"],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
  },
]);
