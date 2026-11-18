import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const out = "artifacts/chart-history";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true }),
  page = await browser.newPage({ viewport: { width: 1672, height: 941 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(
  "http://localhost:4664/?mint=So11111111111111111111111111111111111111112",
);
await page.waitForFunction(
  () =>
    Number(
      document.querySelector(".sol-chart")?.getAttribute("data-candle-count"),
    ) > 500,
  null,
  { timeout: 30000 },
);
await page.waitForFunction(
  () =>
    !document
      .querySelector(".chart-bottom")
      ?.textContent?.includes("Stop loading history"),
  null,
  { timeout: 30000 },
);
const sol = await page.evaluate(() => ({
  bars: document.querySelector(".sol-chart")?.getAttribute("data-candle-count"),
  first: Number(
    document.querySelector(".sol-chart")?.getAttribute("data-first-candle"),
  ),
  interval: document.querySelector(".chart-intervals .selected")?.textContent,
  source: document.querySelector(".chart-bottom")?.textContent,
  scope: document
    .querySelector(".sol-chart")
    ?.getAttribute("data-history-scope"),
  volumeUnit: document
    .querySelector(".sol-chart")
    ?.getAttribute("data-volume-unit"),
  from: document
    .querySelector(".chart-native")
    ?.getAttribute("data-visible-from"),
  to: document.querySelector(".chart-native")?.getAttribute("data-visible-to"),
}));
const logo = page.getByRole("button", { name: "TAIL terminal", exact: true });
await logo.hover();
const hover = await logo.evaluate((e) => ({
  background: getComputedStyle(e).backgroundColor,
  shadow: getComputedStyle(e).boxShadow,
}));
await page.screenshot({ path: `${out}/sol-all-hover.png`, fullPage: true });
await page.getByRole("button", { name: "1m", exact: true }).click();
await page.waitForFunction(
  () =>
    document.querySelector(".chart-intervals .selected")?.textContent ===
      "1m" &&
    Number(
      document.querySelector(".sol-chart")?.getAttribute("data-candle-count"),
    ) > 10 &&
    Number(
      document.querySelector(".sol-chart")?.getAttribute("data-last-candle"),
    ) -
      Number(
        document.querySelector(".sol-chart")?.getAttribute("data-first-candle"),
      ) <
      86400000,
);
const minute = await page
  .locator(".sol-chart")
  .evaluate((el) => ({
    bars: el.getAttribute("data-candle-count"),
    first: el.getAttribute("data-first-candle"),
    last: el.getAttribute("data-last-candle"),
    scope: el.getAttribute("data-history-scope"),
    volumeUnit: el.getAttribute("data-volume-unit"),
  }));
await page.screenshot({ path: `${out}/sol-1m.png`, fullPage: true });
const r = await page.request.get(
    "http://localhost:4664/tail-api/market/new-pools?limit=3",
  ),
  pools = (await r.json()).items ?? [];
const fresh = pools.find((p) => p.baseMint)?.baseMint;
let young;
if (fresh) {
  await page.goto(`http://localhost:4664/?mint=${fresh}`);
  try {
    await page.waitForFunction(
      () =>
        Number(
          document
            .querySelector(".sol-chart")
            ?.getAttribute("data-candle-count"),
        ) > 1,
      null,
      { timeout: 25000 },
    );
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".chart-bottom")
          ?.textContent?.includes("Stop loading history"),
      null,
      { timeout: 30000 },
    );
    young = await page.evaluate(() => ({
      mint: new URL(location.href).searchParams.get("mint"),
      bars: document
        .querySelector(".sol-chart")
        ?.getAttribute("data-candle-count"),
      interval: document.querySelector(".chart-intervals .selected")
        ?.textContent,
      source: document.querySelector(".chart-bottom")?.textContent,
    }));
    await page.screenshot({ path: `${out}/fresh-market.png`, fullPage: true });
  } catch {
    young = {
      mint: fresh,
      error: await page.locator(".chart-state").allTextContents(),
    };
  }
}
await writeFile(
  `${out}/runtime.json`,
  JSON.stringify(
    { at: new Date().toISOString(), sol, minute, hover, young, errors },
    null,
    2,
  ),
);
console.log(JSON.stringify({ sol, minute, hover, young, errors }));
await browser.close();
