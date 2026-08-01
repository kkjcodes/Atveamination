import { defineConfig, devices } from "@playwright/test"

// Prod-facing tests that double as demo recordings. Runs against
// https://www.atveanimation.com, records video for every test.
export default defineConfig({
  testDir: "./scripts/promo/e2e",
  fullyParallel: false,          // one at a time; the app scale-to-zero can only handle so much
  workers: 1,
  retries: 0,                    // fail loud, no silent hide
  timeout: 30 * 60 * 1000,       // 30 min per test — LoRA training + video render take a while
  reporter: [["list"], ["html", { outputFolder: "scripts/promo/playwright-report", open: "never" }]],
  outputDir: "scripts/promo/videos",
  use: {
    baseURL: "https://www.atveanimation.com",
    trace: "retain-on-failure",
    video: "on",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
    actionTimeout: 60 * 1000,    // generous — some clicks trigger long-running requests
    navigationTimeout: 60 * 1000,
    ignoreHTTPSErrors: false,
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],
})
