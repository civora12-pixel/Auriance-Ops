import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// Dev: Vite on 5173 proxies /api to the API server on 3000 (`pnpm dev` starts both).
// Build: the SPA goes to dist/client, which the API server serves in production.
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": { target: `http://localhost:${process.env.PORT ?? 3000}` },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
});
