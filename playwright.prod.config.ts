import { defineConfig, devices } from "@playwright/test"

// Prod-run config: drives the live Container App. No webServer.
// Only chromium (Mobile Safari duplicates for the promo videos).
export default defineConfig({
  testDir: "./scripts/promo/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "scripts/promo/playwright-report" }]],
  timeout: 30 * 60 * 1000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://www.atveanimation.com",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
})
