import { test, expect } from "@playwright/test"

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/login")
  })

  test("renders email field, password field, and submit button", async ({ page }) => {
    await expect(page.getByLabel("Email")).toBeVisible()
    await expect(page.getByLabel("Password")).toBeVisible()
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible()
  })

  test("email and password fields have required attribute", async ({ page }) => {
    const email = page.getByLabel("Email")
    const password = page.getByLabel("Password")
    await expect(email).toHaveAttribute("required", "")
    await expect(password).toHaveAttribute("required", "")
  })

  test("has a link to the signup page", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Sign up free" })).toBeVisible()
  })
})

test.describe("Signup page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/signup")
  })

  test("renders name, email, and password fields", async ({ page }) => {
    await expect(page.getByLabel("Full name")).toBeVisible()
    await expect(page.getByLabel("Email")).toBeVisible()
    await expect(page.getByLabel("Password")).toBeVisible()
  })

  test("submit button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Get Started Free" })).toBeVisible()
  })

  test("has a link back to the login page", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible()
  })
})

test.describe("Protected route redirect", () => {
  test("visiting /dashboard without auth redirects to /auth/login", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
