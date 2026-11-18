import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const out = "artifacts/render-quality";
await mkdir(`${out}/video`, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 940 },
    deviceScaleFactor: 2,
    recordVideo: { dir: `${out}/video`, size: { width: 1440, height: 940 } },
  }),
  page = await context.newPage();
const errors = [],
  timings = {};
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://localhost:4664/");
  await expect(page.locator(".ts-hero-mascot")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page.screenshot({ path: `${out}/home-clean.png` });
  await page.locator(".ts-nav .tail-logo").hover();
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${out}/home-hover.png` });
  await page.mouse.move(900, 350);
  await page.waitForTimeout(1050);
  let start = Date.now();
  await page
    .locator(".ts-nav")
    .getByRole("link", { name: "Open terminal" })
    .click();
  await expect(
    page.getByRole("status", { name: "Opening terminal", exact: true }),
  ).toHaveAttribute("data-phase", "hold");
  await page.screenshot({ path: `${out}/enter-smooth.png` });
  await expect(page.locator(".tail-terminal-route:not([inert])")).toBeVisible();
  timings.enterMs = Date.now() - start;
  await expect(
    page.locator(".fable-heading [data-renderer=tail-2d]"),
  ).toHaveAttribute("data-ready", "true");
  await page.waitForTimeout(500);
  start = Date.now();
  await page
    .getByRole("button", { name: "TAIL terminal", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Returning home", exact: true }),
  ).toHaveAttribute("data-phase", "hold");
  await page.screenshot({ path: `${out}/leave-smooth.png` });
  await expect(
    page.getByRole("status", { name: "Returning home", exact: true }),
  ).toHaveCount(0);
  timings.leaveMs = Date.now() - start;
  await page.waitForTimeout(350);
  expect(timings.enterMs).toBeGreaterThan(2000);
  expect(timings.leaveMs).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
  await writeFile(
    `${out}/motion.json`,
    JSON.stringify({ timings, errors }, null, 2),
  );
  console.log(JSON.stringify({ timings, errors }));
} finally {
  await context.close();
  await page.video().saveAs(`${out}/TAIL_POLISHED.webm`);
  await browser.close();
}
