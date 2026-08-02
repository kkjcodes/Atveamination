import { test, expect } from "@playwright/test"

// Landing is now a compact two-audience hub, not a single consumer pitch.
// These tests reflect the routes actually present after the /personal + /business
// split — a business visitor and personal visitor both need to land here and
// see the right onward path.

test.describe("Root hub /", () => {
  test.beforeEach(async ({ page }) => {
    // domcontentloaded, not the default 'load' — marketing pages have priority
    // images that trigger the browser to wait past the 30s test timeout on
    // local dev builds. Content assertions work fine on DOM-ready.
    await page.goto("/", { waitUntil: "domcontentloaded" })
  })

  test("page title is the brand + hub headline", async ({ page }) => {
    await expect(page).toHaveTitle(/AtVeAnimation/)
  })

  test("shows the brand headline", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Turn photos into videos worth sharing/i })).toBeVisible()
  })

  test("shows both audience cards with distinct pitches", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Cartoon videos starring you/i })).toBeVisible()
    await expect(page.getByRole("heading", { name: /Turn photos of your work into a ready-to-post ad/i })).toBeVisible()
  })

  test("personal card links to /personal (See how it works)", async ({ page }) => {
    // Two "See how it works" — one per card. Personal is the first.
    await page.getByRole("link", { name: /See how it works/i }).first().click()
    await expect(page).toHaveURL(/\/personal$/)
  })

  test("business card links to /business (See how it works)", async ({ page }) => {
    // Second occurrence is the business card.
    await page.getByRole("link", { name: /See how it works/i }).nth(1).click()
    await expect(page).toHaveURL(/\/business$/)
  })

  test("personal Start free links to signup with dashboard redirect and personal segment", async ({ page }) => {
    await page.getByRole("link", { name: /Start free/i }).click()
    // Next.js Link preserves the href verbatim — slashes NOT percent-encoded.
    await expect(page).toHaveURL(/\/auth\/signup\?redirect=\/dashboard&segment=personal/)
  })

  test("business Make an ad links to signup with business-new redirect and business segment", async ({ page }) => {
    await page.getByRole("link", { name: /Make an ad from my photos/i }).click()
    await expect(page).toHaveURL(/\/auth\/signup\?redirect=\/business\/new&segment=business/)
  })

  test("mobile viewport still shows both audience CTAs", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(page.getByRole("link", { name: /Start free/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /Make an ad from my photos/i })).toBeVisible()
  })

  test("trust band lists the three shared guarantees", async ({ page }) => {
    // Exact match — "No filming or editing" also appears in the business
    // card body, so getByText without exact would match multiple elements.
    await expect(page.getByText("Downloadable MP4", { exact: true })).toBeVisible()
    await expect(page.getByText("No filming or editing", { exact: true })).toBeVisible()
    await expect(page.getByText("Your work is saved", { exact: true })).toBeVisible()
  })
})

test.describe("Business landing (anonymous /business)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/business", { waitUntil: "domcontentloaded" })
  })

  test("shows business-only hero copy", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Turn photos of your work into a ready-to-post video ad/i })).toBeVisible()
  })

  test("primary CTA sends to signup with business-new redirect", async ({ page }) => {
    // React renders href literally — no URL encoding on the slashes.
    const cta = page.getByRole("link", { name: /Make an ad from my photos/i }).first()
    await expect(cta).toHaveAttribute("href", /\/auth\/signup\?redirect=\/business\/new/)
  })

  test("sign-in link preserves /business redirect (auth intent kept)", async ({ page }) => {
    const signIn = page.getByRole("link", { name: /Sign in/i })
    await expect(signIn).toHaveAttribute("href", /\/auth\/login\?redirect=\/business/)
  })

  test("does not show consumer-only copy", async ({ page }) => {
    // No "kids", no "family chat", no "cartoon" in the business marketing.
    await expect(page.getByText(/kids/i)).toHaveCount(0)
    await expect(page.getByText(/family chat/i)).toHaveCount(0)
  })
})

test.describe("Personal landing (/personal)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/personal", { waitUntil: "domcontentloaded" })
  })

  test("shows the consumer hero", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Cartoon videos starring you/i })).toBeVisible()
  })
})
