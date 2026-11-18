import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 940 },
    deviceScaleFactor: 2,
  });
  await page.route("**/__tail-poster", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<html><div id="actor" style="width:320px;height:320px"></div></html>',
    }),
  );
  await page.goto("http://localhost:4664/__tail-poster");
  const png = await page.evaluate(async () => {
    const { createTailMascot } = await import(
      "/src/mascot/runtime/tail-mascot.mjs"
    );
    const actor = await createTailMascot(document.getElementById("actor"), {
      assetBase: new URL("/tail-mascot/", location.href).href,
      interactive: false,
      autoSleepMs: 0,
    });
    actor.pause();
    actor.sample("sleep", 1);
    const png = actor.canvas.toDataURL("image/png");
    actor.destroy();
    return png.split(",")[1];
  });
  await mkdir("public/tail-mascot/posters", { recursive: true });
  await writeFile(
    "public/tail-mascot/posters/sleep.png",
    Buffer.from(png, "base64"),
  );
  await mkdir("artifacts/production-release", { recursive: true });
  await page.goto("http://localhost:4664/");
  await expect(page.locator(".ts-hero-mascot")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page.screenshot({
    path: "artifacts/production-release/home-desktop.png",
  });
  await page.screenshot({
    path: "artifacts/production-release/home-full.png",
    fullPage: true,
  });
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  await mobile.goto("http://localhost:4664/");
  await expect(mobile.locator(".ts-hero-mascot")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await mobile.screenshot({
    path: "artifacts/production-release/home-mobile.png",
    fullPage: true,
  });
  await mobile.screenshot({
    path: "artifacts/production-release/mobile-viewport.png",
  });
  expect(
    await mobile.evaluate(() => document.documentElement.scrollWidth),
  ).toBe(390);
  await mobile.close();
  console.log("Supplied sleep pose exported; hero and mobile captured.");
} finally {
  await browser.close();
}
