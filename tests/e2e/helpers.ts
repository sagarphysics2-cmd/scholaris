import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Scholaris!2026";
export const USERS = {
  admin: "admin@greenfield.example",
  teacher: "teacher@greenfield.example",
  student: "student@greenfield.example",
  parent: "parent@greenfield.example",
  superAdmin: "superadmin@scholaris.example",
} as const;

export async function login(page: Page, email: string, next = "") {
  await page.goto(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
