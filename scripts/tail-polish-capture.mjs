import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const out = "artifacts/site-polish";
const base = process.env.TAIL_CAPTURE_BASE || "http://localhost:4664";
const mint = "So11111111111111111111111111111111111111112";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 940 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.locator(".ts-hero-mascot svg").waitFor();
  await page.screenshot({ path: `${out}/home-desktop.png` });
  await page.screenshot({ path: `${out}/home-full.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/home-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 940 });
  await page
    .locator(".ts-nav")
    .getByRole("link", { name: "Open terminal" })
    .click();
  const opening = page.getByRole("status", {
    name: "Opening terminal",
    exact: true,
  });
  await expect(opening).toHaveAttribute("data-phase", "hold");
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/welcome-live.png` });
  await expect(opening).toHaveCount(0);
  await page
    .getByRole("button", { name: "TAIL terminal", exact: true })
    .click();
  const returning = page.getByRole("status", {
    name: "Returning home",
    exact: true,
  });
  await expect(returning).toHaveAttribute("data-phase", "hold");
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/return-home.png` });
  await expect(returning).toHaveCount(0);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto(`${base}/terminal?mint=${mint}`);
  await expect(
    page.getByRole("status", { name: "Opening terminal", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(
      async () =>
        Number(
          await page.locator(".sol-chart").getAttribute("data-candle-count"),
        ),
      { timeout: 45000 },
    )
    .toBeGreaterThan(1);
  const loading = page.getByRole("button", {
    name: "Stop loading history",
    exact: true,
  });
  await expect(loading).toHaveCount(0, { timeout: 35000 });
  await expect(page.locator(".fable-panel")).toContainText(
    "Fable 5.2 is currently unavailable.",
  );
  await expect(page.locator(".fable-panel")).not.toContainText(
    /OpenAI|ChatGPT|API_KEY|product name/i,
  );
  await page.screenshot({ path: "public/tail-site/terminal.png" });
  await page.screenshot({ path: `${out}/terminal-live.png` });
  const results = {
    at: new Date().toISOString(),
    base,
    errors,
    bars: await page.locator(".sol-chart").getAttribute("data-candle-count"),
    source: await page.locator(".chart-bottom").textContent(),
    fable: await page.locator(".fable-panel").innerText(),
  };
  // Refresh the home captures so the raster preview includes the new Fable copy.
  await page.goto(base);
  await page.locator(".ts-hero-mascot svg").waitFor();
  await page.setViewportSize({ width: 1440, height: 940 });
  await page.screenshot({ path: `${out}/home-desktop.png` });
  await page.screenshot({ path: `${out}/home-full.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/home-mobile.png`, fullPage: true });
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  expect(errors).toEqual([]);
} finally {
  await browser.close();
}
