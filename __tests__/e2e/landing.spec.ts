import { test, expect } from "@playwright/test"

test.describe("Landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  test("page title contains AtVeAnimation", async ({ page }) => {
    await expect(page).toHaveTitle(/AtVeAnimation/)
  })

  test('"Get Started Free" button is visible', async ({ page }) => {
    // There are two CTA buttons on the page — check at least one is visible
    const cta = page.getByRole("link", { name: "Get Started Free" }).first()
    await expect(cta).toBeVisible()
  })

  test('"Sign In" button is visible', async ({ page }) => {
    await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible()
  })

  test('clicking "Get Started Free" navigates to /auth/signup', async ({ page }) => {
    await page.getByRole("link", { name: "Get Started Free" }).first().click()
    await expect(page).toHaveURL(/\/auth\/signup/)
  })

  test('clicking "Sign In" navigates to /auth/login', async ({ page }) => {
    await page.getByRole("link", { name: "Sign In" }).click()
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test("four feature cards are visible", async ({ page }) => {
    // The cards are titled by step labels from the features array
    const stepLabels = ["Upload Photo", "Pick Your Style", "Record Your Voice", "Generate Video"]
    for (const label of stepLabels) {
      await expect(page.getByText(label, { exact: true })).toBeVisible()
    }
  })

  test("mobile viewport still shows CTA buttons", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const cta = page.getByRole("link", { name: "Get Started Free" }).first()
    const signIn = page.getByRole("link", { name: "Sign In" })
    await expect(cta).toBeVisible()
    await expect(signIn).toBeVisible()
  })
})
