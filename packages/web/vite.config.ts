/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  test: {
    // happy-dom is significantly faster than jsdom and our tests don't
    // need any of the jsdom-only quirks.
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false, // we don't assert on Tailwind classes; skip CSS parsing for speed
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
