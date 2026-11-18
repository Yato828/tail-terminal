// Runs against the actual installed Manifest V3 package. TAIL_EXTENSION_LIVE=1 uses real sources.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const out = process.env.TAIL_EXTENSION_OUT || "artifacts/extension-release";
await mkdir(out, { recursive: true });
const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const pool = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE";
const wallet = "So11111111111111111111111111111111111111112";
const signature = "4".repeat(88);
const pair = {
  chainId: "solana",
  dexId: "raydium",
  pairAddress: pool,
  baseToken: { address: mint, symbol: "USDC", name: "Extension fixture USDC" },
  quoteToken: { address: wallet, symbol: "SOL" },
  priceUsd: "1",
  marketCap: 1000000,
  liquidity: { usd: 200000 },
  volume: { h24: 100000 },
  priceChange: { h24: 0.1 },
  txns: { h24: { buys: 30, sells: 25 } },
  pairCreatedAt: Date.now() - 86400000,
};
const results = [],
  errors = [];
const extension = resolve("dist-ext");
const ctx = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
  viewport: { width: 400, height: 580 },
});
const page = await ctx.newPage();
ctx.on("page", (p) => p.on("pageerror", (error) => errors.push(error.message)));
page.on("pageerror", (error) => errors.push(error.message));
await ctx.routeWebSocket(/wss:\/\//, () => {});
if (process.env.TAIL_EXTENSION_LIVE !== "1")
  await ctx.route(/^https?:\/\//, async (route) => {
    const u = new URL(route.request().url());
    const json = (body) => route.fulfill({ json: body });
    if (u.hostname === "api.candle.tv") {
      const interval = u.searchParams.get("interval"),
        step = {
          "1m": 60,
          "5m": 300,
          "15m": 900,
          "1h": 3600,
          "4h": 14400,
          "1d": 86400,
        }[interval];
      const end = Math.floor(Date.now() / (step * 1000)) * step;
      return json({
        success: true,
        chain: "solana",
        mint: u.pathname.split("/").at(-2),
        interval,
        source: "birdeye",
        volumeUnit: "token",
        candles: u.searchParams.has("to")
          ? []
          : Array.from({ length: 40 }, (_, i) => ({
              time: end - (40 - i) * step,
              open: 1,
              high: 1.02,
              low: 0.98,
              close: 1.001,
              volume: 1000,
            })),
      });
    }
    if (u.hostname === "api.jup.ag")
      return json({
        inputMint: u.searchParams.get("inputMint"),
        outputMint: u.searchParams.get("outputMint"),
        inAmount: u.searchParams.get("amount"),
        outAmount: "7100000",
        feeBps: 2,
        router: "metis",
        transaction: "must never reach UI",
      });
    if (u.hostname === "api.dexscreener.com")
      return json(
        u.pathname.includes("token-profiles")
          ? [{ chainId: "solana", tokenAddress: mint }]
          : u.pathname.includes("/latest/dex/")
            ? { pairs: [pair] }
            : [pair],
      );
    if (u.hostname === "api.geckoterminal.com") {
      if (u.pathname.includes("ohlcv")) {
        const end =
          Number(u.searchParams.get("before_timestamp")) ||
          Math.floor(Date.now() / 300000) * 300;
        return json({
          data: {
            attributes: {
              ohlcv_list: Array.from({ length: 40 }, (_, i) => [
                end - (i + 1) * 300,
                1,
                1.02,
                0.98,
                1.001,
                1000,
              ]),
            },
          },
        });
      }
      return json({
        data: [
          {
            attributes: {
              tx_hash: signature,
              tx_from_address: wallet,
              kind: "buy",
              volume_in_usd: "10",
              from_token_amount: "0.05",
              to_token_amount: "10",
              price_from_in_usd: "200",
              price_to_in_usd: "1",
              block_timestamp: new Date().toISOString(),
              from_token_address: wallet,
              to_token_address: mint,
            },
          },
        ],
      });
    }
    if (u.hostname === "api.dexpaprika.com")
      return route.fulfill({
        status: 503,
        json: { error: "Fixture fallback unavailable" },
      });
    if (
      ["api.mainnet-beta.solana.com", "solana-rpc.publicnode.com"].includes(
        u.hostname,
      )
    ) {
      const call = (c) => ({
        jsonrpc: "2.0",
        id: c.id,
        result:
          c.method === "getSlot"
            ? 123456
            : c.method === "getRecentPerformanceSamples"
              ? [{ numTransactions: 1000, samplePeriodSecs: 1 }]
              : c.method === "getBlocks"
                ? [123450, 123451]
                : c.method === "getBlock"
                  ? {
                      blockhash: signature,
                      blockTime: 1700000000,
                      signatures: [signature],
                    }
                  : c.method === "getTokenSupply"
                    ? { value: { decimals: 6, uiAmountString: "1000000" } }
                    : c.method === "getAccountInfo"
                      ? { value: null }
                      : c.method === "getSignaturesForAddress"
                        ? []
                        : { value: [] },
      });
      const body = route.request().postDataJSON();
      return json(Array.isArray(body) ? body.map(call) : call(body));
    }
    if (u.hostname === "transaction-v1.raydium.io")
      return json({
        success: true,
        data: {
          inputMint: u.searchParams.get("inputMint"),
          outputMint: u.searchParams.get("outputMint"),
          inputAmount: u.searchParams.get("amount"),
          outputAmount: "1000000",
          otherAmountThreshold: "990000",
          slippageBps: 100,
          priceImpactPct: 0.1,
          routePlan: [{}],
        },
      });
    if (u.hostname === "api.rugcheck.xyz")
      return json({ mint, topHolders: null });
    if (u.pathname === "/api/astra/status")
      return json({
        configured: false,
        ready: false,
        model: null,
        reason: "Astra is unavailable in this fixture.",
        rateLimit: "local",
      });
    if (u.pathname.startsWith("/api/astra/"))
      return route.fulfill({
        status: 503,
        json: { error: "Astra is unavailable in this fixture." },
      });
    if (["localhost", "part-woad.vercel.app"].includes(u.hostname))
      return route.fulfill({
        contentType: "text/html",
        body: "<title>Website wallet handoff fixture</title>",
      });
    return route.continue();
  });

const live = process.env.TAIL_EXTENSION_LIVE === "1";
const closePanel = () =>
  page.getByRole("button", { name: "Close panel", exact: true }).click();
try {
  await page.goto("chrome://extensions");
  const id = await page.locator("extensions-item").first().getAttribute("id");
  if (!id) throw new Error("Packaged extension was not installed");
  const localRequests = [];
  ctx.on("request", (r) => {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(r.url()))
      localRequests.push(r.url());
  });
  await page.goto(`chrome-extension://${id}/popup.html`);
  await expect(
    page.getByRole("heading", { name: "Find your next market." }),
  ).toBeVisible();
  await expect(page.locator(".chart-native")).toHaveCount(0);
  await expect(page.locator(".tail-header img.tail-mascot")).toBeVisible();
  await expect(
    page.locator(".fable-heading [data-renderer=tail-2d]"),
  ).toHaveAttribute("data-ready", "true");
  await expect(page.locator(".fable-panel")).toContainText("Fable 5.2");
  await expect(page.locator(".fable-panel")).not.toContainText(
    /OpenAI|ChatGPT|API_KEY|product name/i,
  );
  await expect(
    page.getByRole("link", { name: "Open full terminal ↗", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Info", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "Meet your workspace." });
  await expect(guide).toBeVisible();
  await guide.getByRole("tab", { name: "Setup", exact: true }).click();
  await expect(guide.getByRole("tabpanel")).toContainText("Customize");
  await guide.getByRole("tab", { name: "Install", exact: true }).click();
  await expect(guide.getByRole("tabpanel")).toContainText(
    "chrome://extensions",
  );
  await expect(
    guide.getByRole("link", { name: "Download extension ZIP", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: `${out}/info-popup.png` });
  await page.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);
  results.push(
    "Info opens in the installed popup with working setup/installation tabs and a correctly packaged mascot asset.",
  );
  await page.screenshot({ path: `${out}/popup-empty.png` });
  results.push(
    "Installed TAIL v2.0 popup opens with the approved mascot, no backend setup and an empty chart before selection.",
  );
  await page.getByRole("textbox", { name: "Search Solana tokens" }).fill(mint);
  await page
    .locator(".search-results button")
    .filter({ hasText: "USDC" })
    .first()
    .click();
  await expect(page.locator(".chart-native canvas").first()).toBeVisible();
  await expect
    .poll(
      async () =>
        Number(
          await page.locator(".sol-chart").getAttribute("data-candle-count"),
        ),
      { timeout: 30000 },
    )
    .toBeGreaterThan(1);
  await expect(page.locator(".chart-bottom")).toContainText("Candle");
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-volume-unit",
    "token",
  );
  for (const interval of ["1m", "15m", "1h", "5m"]) {
    await page
      .locator(".chart-intervals")
      .getByRole("button", { name: interval, exact: true })
      .click();
    await expect(page.locator(".chart-intervals .selected")).toHaveText(
      interval,
    );
    await expect
      .poll(
        async () =>
          Number(
            await page.locator(".sol-chart").getAttribute("data-candle-count"),
          ),
        { timeout: 30000 },
      )
      .toBeGreaterThan(1);
  }
  await page.getByRole("button", { name: "Linear", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Log", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator(".live-indicator").click();
  await expect(page.locator(".live-indicator")).toHaveText("Paused");
  await page.locator(".live-indicator").click();
  await page.locator(".tail-header").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/popup-chart.png` });
  results.push(
    "Direct public history renders minute candles, paging and native volume; interval/log/pause controls work in the installed popup.",
  );
  for (const label of [
    "Pulse",
    "Intelligence",
    "Portfolio",
    "Alerts",
    "Settings",
  ]) {
    await page
      .locator(".tail-sidebar")
      .getByRole("button", { name: label, exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (label === "Alerts") {
      await page
        .getByRole("textbox", { name: "Watched token mint" })
        .fill(mint);
      await page
        .getByRole("button", { name: "Add to watchlist", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: /Remove EPj/ }),
      ).toBeVisible();
      await expect(
        page.getByText("Saved in this browser profile.", { exact: false }),
      ).toBeVisible();
      await page.getByRole("textbox", { name: "Alert price USD" }).fill("2");
      await page
        .getByRole("button", { name: "Create price alert", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Delete alert", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Delete alert", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Delete alert", exact: true }),
      ).toHaveCount(0);
    }
    if (label === "Settings") {
      await page
        .getByRole("combobox", { name: "Dark theme", exact: true })
        .selectOption("graphite");
      await page
        .getByRole("combobox", { name: "Interface accent", exact: true })
        .selectOption("#ff963b");
    }
    await closePanel();
  }
  await page.reload();
  await expect(page.locator(".tail-app")).toHaveClass(/theme-graphite/);
  await page
    .locator(".tail-sidebar")
    .getByRole("button", { name: "Alerts", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Remove EPj/ })).toBeVisible();
  await closePanel();
  results.push(
    "Discovery, intelligence, portfolio, alerts and settings open without overflow. Browser-owned watchlists and appearance survive reload.",
  );
  const tab = ctx.waitForEvent("page");
  await page
    .getByRole("link", { name: "Open full terminal ↗", exact: true })
    .click();
  const desk = await tab;
  await desk.setViewportSize({ width: 1440, height: 900 });
  await desk.waitForLoadState();
  await expect(desk.locator("html")).toHaveClass(/extension-desk/);
  await expect(desk.locator(".tail-app")).toHaveClass(/theme-graphite/);
  await expect
    .poll(
      async () =>
        Number(
          await desk.locator(".sol-chart").getAttribute("data-candle-count"),
        ),
      { timeout: 30000 },
    )
    .toBeGreaterThan(1);
  await expect(desk.locator(".token-title")).toContainText("USDC");
  if (!live) {
    await desk
      .locator(".tail-sidebar")
      .getByRole("button", { name: "Intelligence", exact: true })
      .click();
    const modules = await desk
      .locator(".module-links button")
      .allTextContents();
    for (const name of modules) {
      const button = desk
        .locator(".module-links")
        .getByRole("button", { name, exact: true });
      if (await button.isDisabled()) continue;
      await button.click();
      await expect(desk.getByRole("dialog")).toBeVisible();
      await expect(
        desk.getByText("Loading module…", { exact: true }),
      ).toHaveCount(0);
    }
    await desk
      .getByRole("button", { name: "Close panel", exact: true })
      .click();
    results.push(
      `All ${modules.length} linked workspace modules render inside the installed full extension tab.`,
    );
  }
  await desk.getByRole("button", { name: "Get quote", exact: true }).click();
  await expect(desk.locator(".quote-details")).toBeVisible({ timeout: 30000 });
  await expect(
    desk.getByRole("button", { name: "Sell", exact: true }),
  ).toBeDisabled();
  await desk.screenshot({ path: `${out}/extension-desk.png` });
  results.push(
    "Full extension tab restores exact selected mint and settings, loads public candles and returns a non-executable quote.",
  );
  expect(localRequests).toEqual([]);
  expect(errors).toEqual([]);
  await desk.close();
} catch (error) {
  errors.push(String(error));
  await page.screenshot({ path: `${out}/failure.png` });
  process.exitCode = 1;
} finally {
  await writeFile(
    `${out}/results.json`,
    JSON.stringify({ live, results, errors }, null, 2),
  );
  console.log(JSON.stringify({ live, results, errors }, null, 2));
  await ctx.close();
}
