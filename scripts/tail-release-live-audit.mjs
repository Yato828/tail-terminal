import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.TAIL_AUDIT_BASE || "http://127.0.0.1:4668",
  out = process.env.TAIL_AUDIT_OUT || "artifacts/production-release/live";
const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" }),
  page = await browser.newPage({ viewport: { width: 1672, height: 941 } }),
  errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
const close = async () => {
  const button = page.getByRole("button", { name: "Close panel", exact: true });
  if (await button.count()) await button.click();
};
async function step(name, fn) {
  try {
    const evidence = await fn();
    results.push({ name, status: "passed", ...evidence });
    console.log(name, JSON.stringify(evidence));
  } catch (e) {
    results.push({ name, status: "failed", error: e.message.slice(0, 900) });
    await page.screenshot({ path: `${out}/${name}.png` }).catch(() => {});
    console.log(name, "FAILED", e.message.slice(0, 250));
    await close().catch(() => {});
  }
}
try {
  await page.goto(`${base}/terminal`);
  await expect(page.locator(".tail-terminal-route:not([inert])")).toBeVisible();
  await expect(
    page.locator(".fable-heading [data-renderer=tail-2d]"),
  ).toHaveAttribute("data-ready", "true");
  await step("search", async () => {
    const searches = [];
    for (const query of ["SOL", "JUP", usdc]) {
      await page
        .getByRole("textbox", { name: "Search Solana tokens" })
        .fill(query);
      const hits = page.locator(".search-results button");
      await expect
        .poll(() => hits.count(), { timeout: 20000 })
        .toBeGreaterThan(0);
      searches.push({ query, results: await hits.count() });
    }
    await page.locator(".search-results button").first().click();
    await expect(page.locator(".token-title")).toContainText("USDC");
    await expect
      .poll(
        async () =>
          Number(
            await page.locator(".sol-chart").getAttribute("data-candle-count"),
          ),
        { timeout: 30000 },
      )
      .toBeGreaterThan(1);
    await page.getByRole("button", { name: "Latest", exact: true }).click();
    return { searches, mint: new URL(page.url()).searchParams.get("mint") };
  });
  await step("all-chart-intervals", async () => {
    const rows = [];
    for (const interval of ["1m", "5m", "15m", "1h", "4h", "1d"]) {
      const r = await page.request.get(
        `${base}/candle/markets/solana/${usdc}/candles?interval=${interval}&limit=80`,
        { timeout: 15000 },
      );
      const body = await r.json();
      expect(r.status()).toBe(200);
      expect(body.mint).toBe(usdc);
      expect(body.chain).toBe("solana");
      expect(body.interval).toBe(interval);
      expect(body.candles.length).toBeGreaterThan(1);
      expect(
        body.candles.every(
          (c) =>
            c.high >= Math.max(c.open, c.close, c.low) &&
            c.low <= Math.min(c.open, c.close) &&
            c.volume >= 0,
        ),
      ).toBe(true);
      await page
        .locator(".sol-chart")
        .getByRole("button", { name: interval, exact: true })
        .click();
      await page.getByRole("button", { name: "Latest", exact: true }).click();
      await expect
        .poll(
          async () =>
            Number(
              await page
                .locator(".sol-chart")
                .getAttribute("data-candle-count"),
            ),
          { timeout: 20000 },
        )
        .toBeGreaterThan(1);
      rows.push({
        interval,
        candles: body.candles.length,
        source: body.source,
        volumeUnit: body.volumeUnit,
      });
    }
    for (const name of ["Line", "Candles", "Log", "Fit", "Latest"])
      await page
        .locator(".sol-chart")
        .getByRole("button", { name, exact: true })
        .click();
    await page.screenshot({ path: `${out}/chart.png` });
    return { rows, source: await page.locator(".chart-bottom").innerText() };
  });
  await step("bubble-map", async () => {
    const jup = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
    await page.getByRole("textbox", { name: "Search Solana tokens" }).fill(jup);
    await page
      .locator(".search-results button")
      .filter({ hasText: "JUP" })
      .first()
      .click();
    await expect(page.locator(".token-title")).toContainText("JUP");
    await page
      .locator(".tail-sidebar")
      .getByRole("button", { name: "Intelligence", exact: true })
      .click();
    await page
      .locator(".module-links")
      .getByRole("button", { name: "Bubble Map", exact: true })
      .click();
    const map = page.locator(".bubble-wrap");
    await expect(map).toBeVisible();
    await expect(map).not.toHaveAttribute("data-state", "load", {
      timeout: 30000,
    });
    const state = await map.getAttribute("data-state"),
      nodes = Number(await map.getAttribute("data-nodes"));
    if (nodes > 0) {
      const box = await map.locator("canvas").boundingBox();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width * 0.5 + 30,
        box.y + box.height * 0.45 + 15,
      );
      await page.mouse.up();
      await page.mouse.wheel(0, -100);
      await page.getByRole("button", { name: "Reset", exact: true }).click();
    }
    const source = await page.locator(".bubble-source").innerText(),
      text = await page.locator(".bubble-module").innerText();
    await page.screenshot({ path: `${out}/bubble-map.png` });
    await close();
    expect(state).toBe("ready");
    expect(nodes).toBeGreaterThan(0);
    await page
      .getByRole("textbox", { name: "Search Solana tokens" })
      .fill(usdc);
    await page
      .locator(".search-results button")
      .filter({ hasText: "USDC" })
      .first()
      .click();
    await expect(page.locator(".token-title")).toContainText("USDC");
    return {
      mint: jup,
      state,
      nodes,
      source,
      text: text.slice(-600),
      coverage:
        "JUP indexed holders. USDC has no indexed snapshot and its public largest-account RPC is restricted; the app shows a source error without inventing nodes.",
    };
  });
  await step("quote-only", async () => {
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await expect(page.locator(".quote-details")).toContainText(
      "Not executable",
      { timeout: 30000 },
    );
    await expect(
      page.getByRole("button", { name: "Review & swap", exact: true }),
    ).toHaveCount(0);
    return { text: await page.locator(".quote-details").innerText() };
  });
  await step("workspace-modules", async () => {
    await page
      .locator(".tail-sidebar")
      .getByRole("button", { name: "Intelligence", exact: true })
      .click();
    const names = await page.locator(".module-links button").allTextContents(),
      checked = [];
    for (const name of names) {
      const button = page
        .locator(".module-links")
        .getByRole("button", { name, exact: true });
      if (await button.isDisabled()) continue;
      await button.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(
        page.getByText("Loading module…", { exact: true }),
      ).toHaveCount(0);
      checked.push(name);
    }
    await close();
    return { checked };
  });
  await step("local-alerts", async () => {
    await page
      .locator(".tail-sidebar")
      .getByRole("button", { name: "Alerts", exact: true })
      .click();
    await page.getByRole("textbox", { name: "Watched token mint" }).fill(usdc);
    await page
      .getByRole("button", { name: "Add to watchlist", exact: true })
      .click();
    await page.getByRole("textbox", { name: "Alert price USD" }).fill("0.01");
    await page
      .getByRole("button", { name: "Create price alert", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Delete alert", exact: true }),
    ).toHaveCount(1);
    await page.reload();
    await page
      .locator(".tail-sidebar")
      .getByRole("button", { name: "Alerts", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Delete alert", exact: true }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "Delete alert", exact: true })
      .click();
    await close();
    return { persistedAcrossReload: true, deleted: true };
  });
  await step("fable-availability", async () => ({
    sendEnabled: await page
      .getByRole("textbox", { name: "Ask Fable 5.2", exact: true })
      .isEnabled(),
    label: await page.locator(".fable-heading").innerText(),
    note: "No paid AI request is made by this audit.",
  }));
} finally {
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(
      {
        base,
        at: new Date().toISOString(),
        realSources: true,
        results,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
  console.log(
    JSON.stringify({
      results: results.map((r) => ({ name: r.name, status: r.status })),
      errors,
    }),
  );
  if (errors.length || results.some((r) => r.status === "failed"))
    process.exitCode = 1;
}
