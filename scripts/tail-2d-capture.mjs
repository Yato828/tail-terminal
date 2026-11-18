import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.TAIL_CAPTURE_BASE || "http://localhost:4664";
const out = "artifacts/tail-2d";
const mint = "So11111111111111111111111111111111111111112";
await mkdir(`${out}/video`, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1672, height: 941 },
  recordVideo: { dir: `${out}/video`, size: { width: 1672, height: 941 } },
});
const page = await context.newPage(),
  errors = [],
  missingLayers = [],
  timeline = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (response.url().includes("/tail-mascot/assets/") && !response.ok())
    missingLayers.push(response.url());
});
// Only Fable is intercepted: this recording must not consume paid AI calls.
await page.route("**/tail-api/fable/status", (route) =>
  route.fulfill({
    json: { configured: true, brand: "Fable 5.2", model: "local-test-fixture" },
  }),
);
let reply;
await page.route("**/tail-api/fable/chat", async (route) => {
  await new Promise((resolve) => {
    reply = resolve;
  });
  const request = route.request().postDataJSON();
  if (request.message.includes("unavailable"))
    return route
      .fulfill({
        status: 503,
        json: {
          error: {
            code: "TEST_UNAVAILABLE",
            message: "Local test fixture failure",
          },
        },
      })
      .catch(() => {});
  return route
    .fulfill({
      json: {
        answer:
          "Local integration test completed. This reply is a test fixture; no AI service was called. Market candles come from the connected public source.",
        model: "local-test-fixture",
        brand: "Fable 5.2",
        toolCalls: 0,
      },
    })
    .catch(() => {});
});
const mascot = page.locator(".fable-heading [data-renderer=tail-2d]");
const state = async (name) => {
  await expect(mascot).toHaveAttribute("data-state", name, { timeout: 7000 });
  timeline.push({ state: name, at: new Date().toISOString() });
};
let video;
try {
  await page.goto(`${base}/terminal`);
  await expect(page.locator(".tail-terminal-route:not([inert])")).toBeVisible();
  await expect(mascot).toHaveAttribute("data-ready", "true");
  await state("idle");
  await expect(mascot).toHaveCSS("width", "128px");
  await expect(mascot).toHaveCSS("height", "128px");
  await page.screenshot({ path: `${out}/terminal-neutral.png` });
  await mascot.screenshot({ path: `${out}/neutral-128.png` });
  const canvas = mascot.locator("canvas");
  await canvas.click();
  await state("tap");
  await page.waitForTimeout(450);
  await canvas.click();
  await state("tickle");
  await page.waitForTimeout(250);
  await canvas.click({ clickCount: 3, delay: 60 });
  await state("secret");
  await state("idle");
  const search = page.getByRole("textbox", { name: "Search Solana tokens" });
  await search.fill(mint);
  await page.locator(".search-results button").first().click();
  await expect
    .poll(
      async () =>
        Number(
          await page.locator(".sol-chart").getAttribute("data-candle-count"),
        ),
      { timeout: 45000 },
    )
    .toBeGreaterThan(1);
  await expect(
    page.getByRole("button", { name: "Stop loading history", exact: true }),
  ).toHaveCount(0, { timeout: 35000 });
  const input = page.getByRole("textbox", {
    name: "Ask Fable 5.2",
    exact: true,
  });
  await input.pressSequentially(
    "Local integration check: summarize this token.",
    { delay: 30 },
  );
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await state("thinking");
  await page.waitForTimeout(1700);
  // Hold one real chart response briefly to make its existing analysis lifecycle visible.
  let chartReply,
    firstRefresh = true;
  await page.route(
    /\/tail-api\/market\/pool\/[^/]+\/ohlcv\?/,
    async (route) => {
      if (!firstRefresh) return route.continue();
      firstRefresh = false;
      const response = await route.fetch();
      await new Promise((resolve) => {
        chartReply = resolve;
      });
      await route.fulfill({ response }).catch(() => {});
    },
  );
  await page
    .locator(".chart-bottom")
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await state("analyzing");
  await expect.poll(() => Boolean(chartReply)).toBe(true);
  await page.waitForTimeout(1300);
  chartReply();
  await state("thinking");
  reply();
  await state("success");
  await state("idle");
  await input.fill("Local test: unavailable request");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await state("thinking");
  await page.waitForTimeout(1300);
  reply();
  await state("error");
  await page.screenshot({ path: `${out}/terminal-error.png` });
  await state("idle");
  await input.fill("Local test: cancel this request");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await state("thinking");
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  reply();
  await state("idle");
  await page.waitForTimeout(900);
  const chart = {
    bars: await page.locator(".sol-chart").getAttribute("data-candle-count"),
    source: await page.locator(".chart-bottom").textContent(),
  };
  await page.screenshot({ path: `${out}/terminal-final.png` });
  await page
    .getByRole("button", { name: "TAIL terminal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Follow your instinct/ }),
  ).toBeVisible();
  await page.screenshot({ path: `${out}/home-2d.png` });
  video = page.video();
  await writeFile(
    `${out}/recording.json`,
    JSON.stringify(
      {
        base,
        at: new Date().toISOString(),
        size: 128,
        renderer: "provided PNG / Canvas 2D runtime",
        fable: "Test fixtures for success/error/cancel; no paid provider call",
        market:
          "Real read-only sources; one unmodified chart response was delayed to show its pending state",
        chart,
        timeline,
        errors,
        missingLayers,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ chart, errors, missingLayers }));
  expect(errors).toEqual([]);
  expect(missingLayers).toEqual([]);
} finally {
  await context.close();
  if (video) await video.saveAs(`${out}/TAIL_2D_TERMINAL.webm`);
  await browser.close();
}
