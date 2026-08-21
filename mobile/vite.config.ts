import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
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
