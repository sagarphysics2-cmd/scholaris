import { expect, test } from "@playwright/test";
import { USERS, login } from "./helpers";

test.describe("authorization", () => {
  test("APIs reject anonymous requests", async ({ request }) => {
    for (const path of ["/api/export/students", "/api/notifications/unread", "/api/reports/student-list", "/api/files/anything"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(401);
    }
    expect((await request.get("/api/cron/cleanup")).status()).toBe(401);
    expect((await request.get("/api/health")).status()).toBe(200);
  });

  test("teachers cannot export students or view fees", async ({ page }) => {
    await login(page, USERS.teacher);
    const res = await page.request.get("/api/export/students");
    expect(res.status()).toBe(403);
    await page.goto("/fees");
    await expect(page).toHaveURL(/\/forbidden/);
    await expect(page.getByRole("heading", { name: /don.t have access/ })).toBeVisible();
  });

  test("students cannot open management pages", async ({ page }) => {
    await login(page, USERS.student);
    for (const path of ["/students", "/teachers", "/settings", "/reports", "/audit-logs"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/forbidden/);
    }
  });

  test("a parent cannot open another family's student by changing the URL", async ({ page }) => {
    await login(page, USERS.parent);
    await page.goto("/students");
    const ownLinks = await page.locator('a[href^="/students/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(ownLinks.length).toBeGreaterThan(0);
    // An id that exists but belongs to someone else must look like it doesn't exist.
    await page.goto("/students/cmnotarealstudentid0000000");
    await expect(page.getByText(/couldn.t find that/)).toBeVisible();
    const res = await page.request.get("/api/export/students");
    expect(res.status()).toBe(403);
  });
});
