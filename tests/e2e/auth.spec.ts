import { expect, test } from "@playwright/test";
import { PASSWORD, USERS, login } from "./helpers";

test.describe("authentication", () => {
  test("protected pages redirect to login and back after sign-in", async ({ page }) => {
    await page.goto("/attendance");
    await expect(page).toHaveURL(/\/login\?next=%2Fattendance/);
    await page.getByLabel("Email").fill(USERS.teacher);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/attendance/);
  });

  test("shows validation and credential errors", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await page.getByLabel("Email").fill(USERS.admin);
    await page.locator('input[name="password"]').fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password.").first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("sign out ends the session", async ({ page }) => {
    await login(page, USERS.admin);
    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("forgot password never reveals whether an account exists", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(`nobody-${Date.now()}@nowhere.example`);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("Check your inbox")).toBeVisible();
  });
});
