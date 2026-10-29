import { expect, test } from "@playwright/test";
import { USERS, login } from "./helpers";

test.describe("core flows", () => {
  test.skip(({ isMobile }) => isMobile, "covered on desktop");

  test("admin creates a student with validation feedback", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/students/new");
    await page.getByRole("button", { name: "Create student" }).click();
    await expect(page.getByText("First name is required.")).toBeVisible();
    const suffix = Date.now().toString().slice(-6);
    await page.getByLabel("First name").fill("Playwright");
    await page.getByLabel("Last name").fill(`Tester${suffix}`);
    await page.getByLabel("Date of birth").fill("2014-04-04");
    await page.getByLabel("Gender").selectOption("FEMALE");
    await page.getByLabel("Admission number").fill(`E2E-${suffix}`);
    await page.getByLabel("Class & section").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Create student" }).click();
    await expect(page.getByText("Student created.")).toBeVisible();
    await expect(page.getByRole("heading", { name: `Playwright Tester${suffix}` })).toBeVisible();
  });

  test("teacher takes attendance for their class", async ({ page }) => {
    await login(page, USERS.teacher);
    await page.goto("/attendance?tab=mark");
    await page.getByRole("button", { name: "Mark rest present" }).click();
    await page.getByRole("radio", { name: "Absent" }).first().click();
    await page.getByRole("button", { name: /(Save|Update) attendance/ }).click();
    await expect(page.getByText(/Attendance saved for \d+ students/)).toBeVisible();
  });

  test("global search finds students for admins", async ({ page }) => {
    await login(page, USERS.admin);
    await page.getByLabel("Global search").fill("Okafor");
    await page.getByLabel("Global search").press("Enter");
    await expect(page).toHaveURL(/\/search\?q=Okafor/);
    await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
  });

  test("dark mode toggle works", async ({ page }) => {
    await login(page, USERS.admin);
    await page.getByRole("button", { name: /Switch to dark theme/ }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: /Switch to light theme/ }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});
