import { test, expect } from "@playwright/test"
import { readFileSync, mkdirSync } from "fs"
import { join } from "path"

/**
 * Scrapbook E2E — through the actual UI, no API bypasses.
 * Video capture in scripts/promo/videos is the LinkedIn demo footage.
 */

const CREDS_PATH = join(process.env.HOME!, "Desktop/atve-linkedin-2026-07-26/test-account.json")
const PHOTOS_DIR = join(process.env.HOME!, "Desktop/atve-linkedin-2026-07-26/scrapbook-photos")
const SCREENSHOTS_DIR = join(process.env.HOME!, "Desktop/atve-linkedin-2026-07-26/screenshots/scrapbook")
const OUTPUTS_DIR = join(process.env.HOME!, "Desktop/atve-linkedin-2026-07-26/outputs")

mkdirSync(SCREENSHOTS_DIR, { recursive: true })
mkdirSync(OUTPUTS_DIR, { recursive: true })

const { email, password } = JSON.parse(readFileSync(CREDS_PATH, "utf8"))

async function shot(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: join(SCREENSHOTS_DIR, `${name}.png`), fullPage: true })
}

test("scrapbook end-to-end (UI-driven)", async ({ page }) => {
  test.setTimeout(30 * 60 * 1000)

  // ── Step 1: log in ──
  await page.goto("/auth/login")
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole("button", { name: /sign in|log in/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 })
  await shot(page, "01-after-login")

  // ── Step 2: navigate to /scrapbook/new ──
  await page.goto("/scrapbook/new")
  await shot(page, "02-scrapbook-new-empty")

  // ── Step 3: fill title, pick watercolor style ──
  await page.locator("#title").fill("Family Through the Years")
  // Style tiles are buttons — pick "Watercolor" (or first available).
  await page.getByRole("button", { name: /watercolor/i }).click()
  await shot(page, "03-scrapbook-form-filled")

  // ── Step 4: upload 8 family photos ──
  const photoPaths: string[] = []
  for (let i = 1; i <= 8; i++) photoPaths.push(join(PHOTOS_DIR, `family-${i}.jpg`))
  const photoInput = page.locator('input[type="file"][accept="image/*"]').first()
  await photoInput.setInputFiles(photoPaths)
  // Wait for all 8 staged previews to appear.
  await expect(page.locator('img[alt=""]')).toHaveCount(8, { timeout: 60_000 })
  await shot(page, "04-scrapbook-photos-staged")

  // ── Step 5: click Make my scrapbook (copy change) ──
  await page.getByRole("button", { name: /make my scrapbook/i }).click()
  await page.waitForURL(/\/scrapbook\/[a-f0-9-]{36}$/, { timeout: 60_000 })

  // Wait for the client-side data fetch to finish. Detail page mounts empty,
  // shows the loading skeleton, then hydrates with pages. Waiting for the
  // first Generate button is the cheapest robust signal.
  await expect(page.getByRole("button", { name: /^generate$/i }).first())
    .toBeVisible({ timeout: 45_000 })
  await shot(page, "05-scrapbook-detail-fresh")

  // ── Step 6: generate each page sequentially, waiting for FULL completion ──
  // Not just for the button label to change (which only signals "kicked off").
  // Each page's terminal state is "Regenerate" (done) or "Retry" (failed) —
  // both are non-"Generate" and stable. Poll for the sum
  //   Regenerate + Retry buttons == initial page count
  // to know all pages have run through the pipeline.
  const initialGenerateCount = await page.getByRole("button", { name: /^generate$/i }).count()
  console.log(`Scrapbook has ${initialGenerateCount} pages to generate`)
  if (initialGenerateCount === 0) throw new Error("No Generate buttons visible — page may not be hydrated")

  for (let i = 0; i < initialGenerateCount; i++) {
    // Click the next available Generate button.
    await page.getByRole("button", { name: /^generate$/i }).first().click()
    // Wait until the count of "settled" buttons (Regenerate + Retry) reaches i+1.
    // Each iteration adds exactly one settled page. Up to 8 min per page.
    const targetSettled = i + 1
    await expect
      .poll(async () => {
        const regen = await page.getByRole("button", { name: /^regenerate$/i }).count()
        const retry = await page.getByRole("button", { name: /^retry$/i }).count()
        return regen + retry
      }, { timeout: 8 * 60 * 1000, intervals: [3000] })
      .toBeGreaterThanOrEqual(targetSettled)
    console.log(`Page ${i + 1}/${initialGenerateCount} settled`)
  }

  await shot(page, "06-all-generations-done")

  // ── Step 6b: wait until final-video button becomes enabled ──
  // Copy dictionary in lib/copy.ts: PRODUCT_TERMS.stitchButton = "Create final video".
  const stitchBtn = page.getByRole("button", { name: /create final video/i })
  await expect(stitchBtn).toBeEnabled({ timeout: 30 * 60 * 1000 })
  await shot(page, "07-all-pages-ready-to-stitch")

  // ── Step 7: click to make the final video ──
  await stitchBtn.click()
  await shot(page, "08-stitching")

  // Wait for the "Create it again" button (only appears once finalVideoUrl is set).
  await expect(page.getByRole("button", { name: /create it again/i })).toBeVisible({ timeout: 15 * 60 * 1000 })
  await shot(page, "09-final-ready")

  // ── Step 8: click Download (proxy endpoint routes it correctly) ──
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("link", { name: /^download$/i }).first().click()
  const download = await downloadPromise
  const savePath = join(OUTPUTS_DIR, "scrapbook-family-vintage.mp4")
  await download.saveAs(savePath)
  console.log(`✓ downloaded → ${savePath}`)
  await shot(page, "10-complete")
})
