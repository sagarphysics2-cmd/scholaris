import { expect, test } from "@playwright/test";
import { USERS, login } from "./helpers";

const PAGES: Record<string, string[]> = {
  admin: ["/dashboard", "/students", "/attendance?tab=overview", "/fees", "/timetable", "/reports/student-list"],
  teacher: ["/dashboard", "/attendance", "/assignments"],
  parent: ["/dashboard", "/results", "/fees"],
};

test.describe("responsive layout", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile only");

  for (const [role, paths] of Object.entries(PAGES)) {
    test(`${role}: pages fit the phone screen`, async ({ page }) => {
      await login(page, USERS[role as keyof typeof USERS]);
      for (const path of paths) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(1);
        await expect(page.getByRole("navigation", { name: "Quick navigation" })).toBeVisible();
      }
    });
  }

  test("mobile menu drawer opens and navigates", async ({ page }) => {
    await login(page, USERS.admin);
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation menu" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Teachers" }).click();
    await expect(page).toHaveURL(/\/teachers/);
    await expect(drawer).toBeHidden();
  });

  test("tables become stacked cards on small screens", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/students");
    await expect(page.locator("thead").first()).toBeHidden();
    await expect(page.locator('td[data-label="Class"]').first()).toBeVisible();
  });
});
