// Renders public/icons/icon.svg to the PNG sizes needed for the PWA manifest and iOS.
// Uses the Playwright Chromium already available in development/CI: `npm run icons`.
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const svg = await readFile(new URL("../public/icons/icon.svg", import.meta.url), "utf8");
const targets = [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["maskable-512.png", 512, 0.12], // safe-zone padding for Android adaptive icons
  ["apple-touch-icon.png", 180, 0],
];
// Prefer a system Chromium when provided (CI images / sandboxes ship one).
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
for (const [name, size, pad] of targets) {
  const inner = Math.round(size * (1 - pad * 2));
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;display:grid;place-items:center;width:${size}px;height:${size}px;background:${pad ? "#4a3de0" : "transparent"}">${svg.replace("<svg", `<svg width="${inner}" height="${inner}"`)}</body></html>`);
  await writeFile(new URL(`../public/icons/${name}`, import.meta.url), await page.screenshot({ omitBackground: !pad }));
  console.log("wrote", name);
}
await browser.close();
