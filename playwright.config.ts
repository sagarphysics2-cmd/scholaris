import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Use a system Chromium when available (sandboxes / CI images); otherwise Playwright's own.
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

/**
 * End-to-end tests run against a seeded database. By default they start the production
 * server (`npm run build` first); set E2E_BASE_URL to target an already running server.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure", launchOptions: { executablePath } },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start -- -p 3100", url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 120_000 },
});
