import { test, expect } from "@playwright/test"

test.describe("Navigation and redirects", () => {
  test("/ loads and shows landing content", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: /Cartoon Star/ })).toBeVisible()
  })

  test("/auth/login loads correctly", async ({ page }) => {
    await page.goto("/auth/login")
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.getByLabel("Email")).toBeVisible()
  })

  test("/auth/signup loads correctly", async ({ page }) => {
    await page.goto("/auth/signup")
    await expect(page).toHaveURL(/\/auth\/signup/)
    await expect(page.getByLabel("Full name")).toBeVisible()
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
    await page.goto("/")
    const nav = page.locator("nav")
    await expect(nav.getByRole("link", { name: "Sign In" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "Get Started" })).toBeVisible()
  })

  test.describe("Page titles", () => {
    test("/ has correct title", async ({ page }) => {
      await page.goto("/")
      await expect(page).toHaveTitle(/AtVeAnimation/)
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
})
