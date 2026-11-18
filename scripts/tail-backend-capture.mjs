import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("artifacts/backend-v1", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
const proxyChecks = [];
for (const endpoint of ["health", "fable/status", "trade/capabilities"]) {
  const r = await page.request.get(
    `http://localhost:4664/tail-api/${endpoint}`,
  );
  proxyChecks.push({ endpoint, status: r.status() });
}
const errors = [],
  failures = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (
    r.status() >= 400 &&
    /\/(tail-api|dex|gecko|rpc|paprika|api)\//.test(r.url())
  )
    failures.push({ url: r.url(), status: r.status() });
});
await page.goto(
  "http://localhost:4664/?mint=So11111111111111111111111111111111111111112",
);
try {
  await page
    .locator(".chart-native canvas")
    .first()
    .waitFor({ timeout: 25000 });
} catch {
  /* Capture the honest source failure state as well. */
}
try {
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".sol-chart");
      return (
        el &&
        (Number(el.getAttribute("data-candle-count")) > 0 ||
          document
            .querySelector(".chart-state")
            ?.textContent?.includes("unavailable"))
      );
    },
    { timeout: 20000 },
  );
} catch {}
await page.waitForTimeout(2000);
await page.screenshot({
  path: "artifacts/backend-v1/live-terminal-1672.png",
  fullPage: true,
});
const geometry = await page
  .locator(".tail-header,.tail-sidebar,[data-widget]")
  .evaluateAll((nodes) =>
    nodes.map((el) => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return {
        element: el.getAttribute("data-widget") ?? el.className,
        x,
        y,
        width,
        height,
      };
    }),
  );
const chart = await page
  .locator(".chart-bottom")
  .textContent()
  .catch(() => "No source chart available");
await writeFile(
  "artifacts/backend-v1/live-browser.json",
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      viewport: { width: 1672, height: 941 },
      chart,
      geometry,
      errors,
      proxyChecks,
      failures,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    chart,
    errors,
    failures: failures.length,
    screenshot: "artifacts/backend-v1/live-terminal-1672.png",
  }),
);
await browser.close();
