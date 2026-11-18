import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, rename } from "node:fs/promises";
const base =
  process.env.TAIL_REVIEW_BASE || "https://tail-solana-workspace.vercel.app";
const out = process.env.TAIL_REVIEW_OUT || "artifacts/star-restored/production";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" }),
  errors = [],
  assetErrors = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 940 },
  deviceScaleFactor: 1,
  recordVideo: { dir: out, size: { width: 1440, height: 940 } },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.url().includes("/tail-mascot/") && !r.ok())
    assetErrors.push({ url: r.url(), status: r.status() });
});
const result = { base, at: new Date().toISOString() };
const canvasHash = (el) => {
  const pixels = el
    .getContext("2d")
    .getImageData(0, 0, el.width, el.height).data;
  let hash = 2166136261;
  for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619);
  return hash >>> 0;
};
try {
  const r = await page.goto(base);
  expect(r.status()).toBe(200);
  const actor = page.locator(".ts-hero-mascot");
  await expect(actor).toHaveAttribute("data-ready", "true");
  await expect(actor).toHaveAttribute("data-presentation", "floating");
  await expect(page.locator(".ts-star-skiff")).toBeVisible();
  await expect(page.locator(".ts-planet")).toHaveCount(0);
  expect(
    await page.locator(".ts-flight-body").evaluate((el) => el.offsetWidth),
  ).toBeLessThanOrEqual(320);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/desktop.png` });
  await page.waitForTimeout(6200);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".ts-flight-body")
      .evaluate((el) => el.getAnimations().length),
  ).toBe(0);
  expect(
    await page
      .locator(".ts-flight-deck")
      .evaluate((el) => el.getAnimations().length),
  ).toBe(0);
  await expect
    .poll(
      async () => {
        const still = await actor.locator("canvas").evaluate(canvasHash);
        await page.waitForTimeout(150);
        return still === (await actor.locator("canvas").evaluate(canvasHash));
      },
      { timeout: 4000 },
    )
    .toBe(true);
  await page
    .locator(".ts-nav")
    .getByRole("link", { name: "Open terminal" })
    .click();
  await expect(page.locator(".tail-terminal-route:not([inert])")).toBeVisible();
  await expect(
    page.locator(".fable-heading [data-renderer=tail-2d]"),
  ).toHaveAttribute("data-presentation", "default");
  await expect(
    page.locator(".fable-heading [data-renderer=tail-2d]"),
  ).toHaveAttribute("data-ready", "true");
  await expect(page.locator(".chart-native")).toHaveCount(0);
  await page
    .getByRole("button", { name: "TAIL terminal", exact: true })
    .click();
  await expect(page.locator(".ts-hero-mascot")).toBeVisible();
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
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
  result.checks = [
    "Approved orange star is present; the animated mascot uses the floating pose and stays within 320px.",
    "Reduced motion stops scene animations and leaves a stable canvas.",
    "Terminal keeps its default pose, one ready canvas and an empty chart before selection.",
    "Return home and the 390px mobile layout work.",
  ];
  expect(errors).toEqual([]);
  expect(assetErrors).toEqual([]);
  result.status = "passed";
} catch (e) {
  result.status = "failed";
  result.error = e.message;
  throw e;
} finally {
  const video = page.video();
  await context.close();
  if (video) await rename(await video.path(), `${out}/TAIL_FREE_FLIGHT.webm`);
  await browser.close();
  await writeFile(
    `${out}/results.json`,
    JSON.stringify({ ...result, errors, assetErrors }, null, 2),
  );
  console.log(JSON.stringify({ ...result, errors, assetErrors }));
}
