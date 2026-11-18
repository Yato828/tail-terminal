import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";

const base =
  process.env.TAIL_AUDIT_BASE || "https://tail-solana-workspace.vercel.app";
const out = "artifacts/production-release/walkthrough";
const mint = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 940 },
  recordVideo: { dir: out, size: { width: 1440, height: 940 } },
});
const page = await context.newPage(),
  errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
const hash = (b) => createHash("sha256").update(b).digest("hex");
try {
  const home = await page.goto(base);
  expect(home.status()).toBe(200);
  expect(home.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  await expect(page.locator(".ts-hero-mascot")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator(".ts-hero-mascot")).toHaveAttribute(
    "data-state",
    "idle",
  );
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/homepage.png` });
  await page.locator(".ts-nav .tail-logo").hover();
  await page.waitForTimeout(700);
  await page.mouse.move(900, 300);
  await page
    .getByRole("button", { name: "Get the extension", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download extension ZIP" }).click();
  await (await download).saveAs(`${out}/tail-extension.zip`);
  const zipped = await readFile(`${out}/tail-extension.zip`);
  expect(zipped.subarray(0, 2).toString()).toBe("PK");
  const zipHash = hash(zipped);
  expect(zipHash).toBe(hash(await readFile("public/tail-extension.zip")));
  await page.keyboard.press("Escape");
  results.push({
    check: "public extension download",
    bytes: zipped.length,
    sha256: zipHash,
  });
  await page.getByRole("button", { name: "Start exploring" }).click();
  const embedded = page.frameLocator(
    'iframe[title="Interactive TAIL terminal"]',
  );
  await expect(
    embedded.getByRole("textbox", { name: "Search Solana tokens" }),
  ).toBeVisible();
  await expect(embedded.locator(".chart-native")).toHaveCount(0);
  await embedded
    .getByRole("textbox", { name: "Search Solana tokens" })
    .fill(mint);
  await embedded
    .locator(".search-results button")
    .filter({ hasText: "JUP" })
    .first()
    .click();
  await expect
    .poll(
      async () =>
        Number(
          await embedded
            .locator(".sol-chart")
            .getAttribute("data-candle-count"),
        ),
      { timeout: 35000 },
    )
    .toBeGreaterThan(1);
  await page.screenshot({ path: `${out}/embedded-terminal.png` });
  await page.getByRole("button", { name: "Close preview" }).click();
  await expect(
    page.locator('iframe[title="Interactive TAIL terminal"]'),
  ).toHaveCount(0);
  results.push({
    check: "same-origin live terminal iframe",
    mint,
    closedAndUnmounted: true,
  });
  await page.evaluate(() => scrollTo(0, 0));
  await page
    .locator(".ts-nav")
    .getByRole("link", { name: "Open terminal" })
    .click();
  await expect(
    page.getByRole("status", { name: "Opening terminal", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".tail-terminal-route:not([inert])")).toBeVisible();
  await page.getByRole("textbox", { name: "Search Solana tokens" }).fill(mint);
  await page
    .locator(".search-results button")
    .filter({ hasText: "JUP" })
    .first()
    .click();
  await expect
    .poll(
      async () =>
        Number(
          await page.locator(".sol-chart").getAttribute("data-candle-count"),
        ),
      { timeout: 35000 },
    )
    .toBeGreaterThan(1);
  await page
    .locator(".tail-sidebar")
    .getByRole("button", { name: "Intelligence", exact: true })
    .click();
  await page
    .locator(".module-links")
    .getByRole("button", { name: "Bubble Map", exact: true })
    .click();
  await expect(page.locator(".bubble-wrap")).toHaveAttribute(
    "data-state",
    "ready",
    { timeout: 30000 },
  );
  const bubbleNodes = Number(
    await page.locator(".bubble-wrap").getAttribute("data-nodes"),
  );
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${out}/bubble-map.png` });
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page
    .getByRole("button", { name: "TAIL terminal", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Returning home", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ts-hero-mascot")).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Returning home", exact: true }),
  ).toHaveCount(0);
  await page.waitForTimeout(800);
  results.push({
    check: "live full terminal and round trip",
    bubbleNodes,
    source: "RugCheck",
    welcomeAndReturn: true,
  });
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(base);
  await expect(mobile.locator(".ts-hero-mascot")).toHaveAttribute(
    "data-ready",
    "true",
  );
  expect(
    await mobile.evaluate(() => document.documentElement.scrollWidth),
  ).toBe(390);
  await mobile.screenshot({ path: `${out}/mobile.png`, fullPage: true });
  await mobile.close();
  results.push({ check: "mobile homepage", width: 390, overflow: false });
  expect(errors).toEqual([]);
} finally {
  const video = page.video();
  await context.close();
  if (video) await rename(await video.path(), `${out}/TAIL_PRODUCTION.webm`);
  await browser.close();
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(
      { base, at: new Date().toISOString(), results, errors },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results, errors }));
}
