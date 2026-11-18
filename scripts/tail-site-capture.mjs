import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const out = "artifacts/site-release";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 980 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:4667/");
  await page.locator(".ts-hero-mascot svg").waitFor();
  await page.screenshot({ path: `${out}/home-desktop.png` });
  await page.screenshot({ path: `${out}/home-full.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/home-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.getByRole("button", { name: "Start exploring" }).click();
  const frame = page.frameLocator("iframe");
  await frame
    .getByRole("textbox", { name: "Search Solana tokens" })
    .fill("So11111111111111111111111111111111111111112");
  await frame
    .locator(".search-results button")
    .filter({ hasText: "SOL" })
    .first()
    .click();
  await expect
    .poll(
      async () =>
        Number(
          await frame.locator(".sol-chart").getAttribute("data-candle-count"),
        ),
      { timeout: 30000 },
    )
    .toBeGreaterThan(1);
  await expect(
    frame.getByRole("button", { name: "Stop loading history", exact: true }),
  ).toHaveCount(0, { timeout: 30000 });
  await page.locator("#try").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/interactive-terminal.png` });
  const result = {
    at: new Date().toISOString(),
    errors,
    bars: await frame.locator(".sol-chart").getAttribute("data-candle-count"),
    source: await frame.locator(".chart-bottom").textContent(),
  };
  await writeFile(`${out}/results.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
