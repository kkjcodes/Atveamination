import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { resolve } from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: [
      "node_modules",
      "__tests__/e2e/**",
      // Playwright specs live under scripts/promo/e2e too — Vitest tries to
      // collect them and fails because they call `test()` from @playwright/test
      // outside a real Playwright runner. Exclude the whole promo tree.
      "scripts/promo/e2e/**",
    ],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
})
