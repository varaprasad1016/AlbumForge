import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Renderer-only Vite dev server for the Tauri shell (`npm run dev:native` /
 * `npm run dev:renderer`).
 *
 * Mirrors the `renderer` block of `electron.vite.config.ts` so the Electron
 * and Tauri shells serve byte-identical frontend code: same React plugin,
 * same `@` / `@shared` aliases, fixed port 5173 (`strictPort` so
 * `tauri.conf.json`'s `devUrl` always matches). Vite serves
 * `src/renderer/index.html` at the configured root.
 */
export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/renderer/src"),
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
