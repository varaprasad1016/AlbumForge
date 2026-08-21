import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import pkg from "./package.json";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/lib"),
    },
  },
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
