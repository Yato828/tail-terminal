import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const directory = "artifacts/functional-audit";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 } }),
  errors = [],
  apiFailures = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (
    r.status() >= 400 &&
    /\/(tail-api|rpc|paprika|gecko)\b/.test(new URL(r.url()).pathname)
  )
    apiFailures.push({ path: new URL(r.url()).pathname, status: r.status() });
});
await page.addInitScript(() =>
  localStorage.setItem(
    "part.preferences.v1",
    JSON.stringify({
      version: 1,
      theme: "midnight",
      accent: "#77bdfb",
      defaultInterval: "5m",
    }),
  ),
);
await page.goto(
  "http://localhost:4664/?mint=So11111111111111111111111111111111111111112",
);
await page.waitForFunction(
  () =>
    Number(
      document.querySelector(".sol-chart")?.getAttribute("data-candle-count"),
    ) > 0,
  { timeout: 30000 },
);
// Allow the real read-only WSS stream to produce a notification; HTTP bootstraps do not count.
await page
  .waitForFunction(
    () =>
      Number(
        document.querySelector(".sol-chart")?.getAttribute("data-live-slot"),
      ) > 0,
    null,
    { timeout: 15000 },
  )
  .catch(() => {});
const result = await page.evaluate(() => {
  const chart = document.querySelector(".sol-chart"),
    app = document.querySelector(".tail-app"),
    send = document.querySelector('[aria-label="Send message"]');
  const r = send?.getBoundingClientRect();
  return {
    candleCount: Number(chart?.getAttribute("data-candle-count")),
    interval: document.querySelector(".chart-intervals .selected")?.textContent,
    source: document.querySelector(".chart-bottom")?.textContent,
    feed: document.querySelector(".spot-feed")?.textContent,
    liveSlot: chart?.getAttribute("data-live-slot"),
    livePrice: chart?.getAttribute("data-live-price"),
    theme: app?.className,
    accent: app ? getComputedStyle(app).getPropertyValue("--accent") : "",
    sendInViewport: !!r && r.top >= 0 && r.bottom <= innerHeight,
    prefs: JSON.parse(localStorage.getItem("part.preferences.v1") || "{}"),
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
});
await page.screenshot({
  path: `${directory}/orange-black-hourly-1672.png`,
  fullPage: true,
});
await page.setViewportSize({ width: 390, height: 844 });
const mobileOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth > innerWidth,
);
await page.screenshot({
  path: `${directory}/orange-black-mobile-390.png`,
  fullPage: true,
});
await writeFile(
  `${directory}/runtime.json`,
  JSON.stringify(
    {
      observedAt: new Date().toISOString(),
      realData: true,
      result,
      mobileOverflow,
      errors,
      apiFailures,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ result, mobileOverflow, errors, apiFailures }));
await browser.close();
