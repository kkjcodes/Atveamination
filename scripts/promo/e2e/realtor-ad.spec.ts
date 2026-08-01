import { test, expect } from "@playwright/test"
import { readFileSync, mkdirSync } from "fs"
import { join } from "path"

/**
 * Realtor ad E2E — every action is a real click / type / keyboard event.
 * No API calls, no page.request. The recorded video (scripts/promo/videos)
 * is the LinkedIn demo footage; the screenshots are the UX audit.
 *
 * Test-account credentials come from ~/Desktop/atve-linkedin-2026-07-26/test-account.json
 * (created by scripts/promo/setup-test-user.mjs — the sole admin-elevated setup step).
 */

const CREDS_PATH = join(process.env.HOME!, "Desktop/atve-linkedin-2026-07-26/test-account.json")
const PHOTOS_DIR = join(process.env.HOME!, "Desktop/atve-linkedin-2026-07-26/realtor-photos")
const SCREENSHOTS_DIR = join(process.env.HOME!, "Desktop/atve-linkedin-2026-07-26/screenshots/realtor")
const OUTPUTS_DIR = join(process.env.HOME!, "Desktop/atve-linkedin-2026-07-26/outputs")

mkdirSync(SCREENSHOTS_DIR, { recursive: true })
mkdirSync(OUTPUTS_DIR, { recursive: true })

const { email, password } = JSON.parse(readFileSync(CREDS_PATH, "utf8"))

// Suffix the business name so it never collides with businesses left over
// from earlier test runs (the test account has accumulated a few from the
// pre-Wave-1 whack-a-mole session).
const RUN_SUFFIX = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)
const BIZ_NAME = `Ridgeview Realty ${RUN_SUFFIX}`
const BIZ_ONELINER = `Beautifully renovated 4-bed on Ridgeview Drive ${RUN_SUFFIX}`

async function shot(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: join(SCREENSHOTS_DIR, `${name}.png`), fullPage: true })
}

test("realtor ad end-to-end (UI-driven)", async ({ page }) => {
  test.setTimeout(25 * 60 * 1000)

  // ── Step 1: landing → login ─────────────────────────────────────────────
  await page.goto("/")
  await shot(page, "01-landing")

  await page.goto("/auth/login")
  await shot(page, "02-login")
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole("button", { name: /sign in|log in/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 })
  await shot(page, "03-after-login")

  // ── Step 2: create business ─────────────────────────────────────────────
  await page.goto("/business/new")
  await shot(page, "04-business-new-empty")

  await page.locator("#name").fill(BIZ_NAME)
  await page.locator("#oneLiner").fill(BIZ_ONELINER)
  await page.locator("#address").fill("42 Ridgeview Drive · Open Saturday 11am")
  await page.locator("#notes").fill(
    "New kitchen with quartz island, hardwood floors throughout, quiet cul-de-sac, walk to Ridgeview Elementary. Asking $749,000.",
  )
  await shot(page, "05-business-new-filled-nopics")

  // ── Step 3: upload 5 photos via file input ─────────────────────────────
  const photoNames = ["exterior", "kitchen", "living", "bedroom", "street"]
  const photoPaths = photoNames.map((n) => join(PHOTOS_DIR, `${n}.jpg`))
  const photoInput = page.locator('input[type="file"][accept="image/*"]').last()
  await photoInput.setInputFiles(photoPaths)
  await expect(page.locator('img[alt=""]')).toHaveCount(5, { timeout: 90_000 })
  await shot(page, "06-business-new-with-photos")

  // ── Step 4: Save and keep going (copy change from "Save & continue") ───
  await page.getByRole("button", { name: /save and keep going/i }).click()
  await page.waitForURL(/\/business$/, { timeout: 45_000 })
  await shot(page, "07-business-list")

  // ── Step 5: open the newly-created business ────────────────────────────
  // The oneLiner includes RUN_SUFFIX so we match the exact business we just
  // created — earlier test runs may have left orphan "Ridgeview Realty"
  // businesses without photos.
  const bizLink = page.getByRole("link").filter({ hasText: new RegExp(RUN_SUFFIX) }).first()
  await expect(bizLink).toBeVisible({ timeout: 10_000 })
  await bizLink.click()
  await page.waitForURL(/\/business\/[a-f0-9-]{36}$/, { timeout: 15_000 })
  await shot(page, "08-business-detail-empty")

  // ── Step 6: pick template, aspect, voice, Generate ─────────────────────
  // Template labels changed in Wave 2. "Attention-grabber" = bold_promo.
  await page.getByRole("button", { name: /attention-grabber/i }).click()
  await page.getByRole("button", { name: /9:16/ }).click()

  // NEW: voice picker. Pick "Deep and calm" for realtor (confident_m).
  await page.getByRole("button", { name: /deep and calm/i }).click()
  await shot(page, "09-business-detail-picked")

  // CTA copy changed to "Bring my ad to life".
  await page.getByRole("button", { name: /bring my ad to life/i }).click()
  await page.waitForURL(/\/business\/ads\/[a-f0-9-]{36}$/, { timeout: 3 * 60 * 1000 })
  await shot(page, "10-ad-detail-fresh")
  console.log(`Ad generated: ${page.url()}`)

  // ── Step 7: Make video (was "Render") ──────────────────────────────────
  await page.getByRole("button", { name: /^make video$/i }).click()
  await shot(page, "11-ad-rendering")

  // Wait for video element (rendered MP4 embed).
  const video = page.locator("video")
  await expect(video).toBeVisible({ timeout: 8 * 60 * 1000 })
  await shot(page, "12-ad-video-ready")

  // ── Step 8: Download video (was "Download MP4") ────────────────────────
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("link", { name: /download video/i }).click()
  const download = await downloadPromise
  const savePath = join(OUTPUTS_DIR, "realtor-ad-ridgeview-9x16.mp4")
  await download.saveAs(savePath)
  console.log(`✓ downloaded → ${savePath}`)
  await shot(page, "13-final")
})
