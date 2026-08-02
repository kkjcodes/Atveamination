import { test, expect } from "@playwright/test"

test.describe("Navigation and redirects", () => {
  test("/ loads the two-audience hub", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: /Turn photos into videos worth sharing/i })).toBeVisible()
  })

  test("/personal loads the consumer landing", async ({ page }) => {
    await page.goto("/personal", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: /Cartoon videos starring you/i })).toBeVisible()
  })

  test("/business (anonymous) loads the business marketing page", async ({ page }) => {
    await page.goto("/business", { waitUntil: "domcontentloaded" })
    // Should NOT be redirected to /auth/login — /business is now auth-aware
    // and renders marketing for anonymous visitors.
    await expect(page).toHaveURL(/\/business$/)
    await expect(page.getByRole("heading", { name: /Turn photos of your work into a ready-to-post video ad/i })).toBeVisible()
  })

  test("/auth/login loads correctly", async ({ page }) => {
    await page.goto("/auth/login")
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.getByLabel("Email")).toBeVisible()
  })

  test("/auth/signup loads correctly", async ({ page }) => {
    await page.goto("/auth/signup")
    await expect(page).toHaveURL(/\/auth\/signup/)
    await expect(page.getByLabel(/your name/i)).toBeVisible()
  })

  test("/dashboard without auth redirects to /auth/login", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test("/character/new without auth redirects to /auth/login", async ({ page }) => {
    await page.goto("/character/new")
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('nav shows "Sign In" and "Get Started" when not logged in', async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    const nav = page.locator("nav").first()
    await expect(nav.getByRole("link", { name: "Sign In" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "Get Started" })).toBeVisible()
  })

  test.describe("Page titles are audience-specific", () => {
    test("/ title mentions the brand + hub tagline", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" })
      await expect(page).toHaveTitle(/AtVeAnimation.*Turn photos/i)
    })

    test("/personal title mentions cartoon videos", async ({ page }) => {
      await page.goto("/personal", { waitUntil: "domcontentloaded" })
      await expect(page).toHaveTitle(/Cartoon videos/i)
    })

    test("/business title mentions AI ad generator", async ({ page }) => {
      await page.goto("/business", { waitUntil: "domcontentloaded" })
      await expect(page).toHaveTitle(/AI ad generator/i)
    })

    test("/auth/login has correct title", async ({ page }) => {
      await page.goto("/auth/login")
      await expect(page).toHaveTitle(/AtVeAnimation/)
    })

    test("/auth/signup has correct title", async ({ page }) => {
      await page.goto("/auth/signup")
      await expect(page).toHaveTitle(/AtVeAnimation/)
    })
  })

  test.describe("Marketing asset accessibility (H1 regression guard)", () => {
    // Previous round shipped hero videos under /public/business/ which shared
    // the middleware-protected /business/:path+ namespace, so anonymous
    // visitors got a 307 to /auth/login for the video preview. Fix: keep
    // marketing assets under /public/marketing/ (unprotected namespace).
    // These assertions guard against reintroducing the collision.

    test("personal hero video is public (200)", async ({ request }) => {
      const res = await request.get("/marketing/personal-hero.mp4")
      expect(res.status()).toBe(200)
    })

    test("personal hero poster is public (200)", async ({ request }) => {
      const res = await request.get("/marketing/personal-hero-poster.jpg")
      expect(res.status()).toBe(200)
    })

    test("business hero video is public (200)", async ({ request }) => {
      const res = await request.get("/marketing/business-hero.mp4")
      expect(res.status()).toBe(200)
    })

    test("business hero poster is public (200)", async ({ request }) => {
      const res = await request.get("/marketing/business-hero-poster.jpg")
      expect(res.status()).toBe(200)
    })

    test("protected business children still require auth (proves middleware coverage)", async ({ request }) => {
      // Sanity: middleware still redirects children of /business — proves
      // the split matcher `/business/:path+` didn't accidentally open
      // /business/new to anonymous access.
      const res = await request.get("/business/new", { maxRedirects: 0 })
      expect([302, 307]).toContain(res.status())
    })
  })

  test.describe("Auth intent preservation (M3)", () => {
    test("business Sign-in link carries redirect param", async ({ page }) => {
      await page.goto("/business", { waitUntil: "domcontentloaded" })
      const signInLink = page.getByRole("link", { name: /Sign in/i })
      await expect(signInLink).toHaveAttribute("href", /\/auth\/login\?redirect=\/business/)
    })

    test("business Sign-up CTA carries redirect to /business/new", async ({ page }) => {
      await page.goto("/business", { waitUntil: "domcontentloaded" })
      const ctaLink = page.getByRole("link", { name: /Make an ad from my photos/i }).first()
      await expect(ctaLink).toHaveAttribute("href", /\/auth\/signup\?redirect=\/business\/new/)
    })
  })
})
