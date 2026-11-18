import { test, expect, type Page } from "@playwright/test";
import { fixtures, mint, pool, wallet, errors } from "./support";
test.skip(
  process.env.TAIL_V1_TESTS !== "1",
  "Requires the explicit local V1 dev server; run TAIL_V1_TESTS=1 npm run test:browser -- tests/backend-v1.spec.ts",
);
test.use({ baseURL: process.env.TAIL_V1_BASE || "http://localhost:4664" });
const asOf = "2026-11-15T12:00:00Z",
  sig = "4".repeat(88),
  session = "test-anonymous-session-token-with-no-wallet-identity";
function pair(address = mint) {
  return {
    mint: address,
    pairAddress: pool,
    symbol: address === wallet ? "SOL" : "USDC",
    name: "Fixture token",
    dex: "orca",
    quoteMint: wallet,
    priceUsd: 1,
    marketCap: 1000000,
    fdv: null,
    liquidityUsd: 200000,
    volume24h: 100000,
    volume1h: 1000,
    volume5m: 100,
    priceChange24h: 0.1,
    priceChange1h: 0.1,
    priceChange5m: 0.1,
    pairCreatedAt: 1700000000000,
    icon: null,
    websites: [],
    socials: [],
  };
}
async function v1Fixtures(page: Page) {
  await fixtures(page);
  // Keep screenshots independent of a stalled third-party font stylesheet.
  await page.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ contentType: "text/css", body: "" }),
  );
  const calls: {
    path: string;
    method: string;
    body: unknown;
    auth: string | undefined;
  }[] = [];
  let watched: string[] = [],
    alerts: any[] = [],
    events: any[] = [];
  await page.route("**/tail-api/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      path = u.pathname.slice("/tail-api".length),
      body = req.postData() ? JSON.parse(req.postData()!) : null;
    calls.push({
      path,
      method: req.method(),
      body,
      auth: req.headers()["authorization"],
    });
    const ok = (json: unknown, status = 200) => route.fulfill({ status, json });
    if (path === "/health")
      return ok({
        status: "ok",
        service: "TAIL Backend",
        version: "1.0.0",
        tradeExecution: false,
        asOf,
      });
    if (path === "/trade/capabilities")
      return ok({
        quote: true,
        buyExecution: false,
        sellExecution: false,
        signing: false,
        autotrading: false,
        reason: "Execution unavailable",
      });
    if (path === "/market/profiles" || path === "/market/trending")
      return ok({
        items: [{ chainId: "solana", tokenAddress: mint }],
        source: "DexScreener",
        asOf,
        warning: path.endsWith("trending")
          ? "Paid boosts, not organic trending"
          : "Recent indexed profiles",
      });
    if (path === "/market/new-pools")
      return ok({
        items: [
          {
            poolAddress: pool,
            baseMint: mint,
            quoteMint: wallet,
            name: "USDC / SOL",
            poolCreatedAt: asOf,
            reserveUsd: 100000,
            volume24h: 1000,
          },
        ],
        source: "GeckoTerminal",
        asOf,
        warning: "Indexer-discovered pools",
      });
    if (path === "/market/search" || path === "/market/filter")
      return ok({ items: [pair()], source: "DexScreener", asOf });
    if (path.startsWith("/market/token/")) {
      const address = path.split("/").at(-1)!;
      return ok({
        token: pair(address),
        markets: [pair(address)],
        source: "DexScreener",
        asOf,
      });
    }
    if (path.startsWith("/market/stream/"))
      return route.fulfill({
        contentType: "text/event-stream",
        body: `retry: 60000\nevent: snapshot\ndata: ${JSON.stringify({ token: pair(path.split("/").at(-1)), source: "DexScreener", asOf, delivery: "polling", pollIntervalMs: 10000 })}\n\n`,
      });
    if (path.endsWith("/ohlcv")) {
      const interval = u.searchParams.get("interval") || "1h";
      const step = (
        {
          "1m": 60,
          "5m": 300,
          "15m": 900,
          "1h": 3600,
          "4h": 14400,
          "1d": 86400,
        } as Record<string, number>
      )[interval];
      const before =
        Number(u.searchParams.get("before_timestamp")) ||
        Math.floor(Date.now() / (step * 1000)) * step;
      return ok({
        pool,
        token: u.searchParams.get("token") ?? "base",
        interval,
        live: false,
        source: "GeckoTerminal",
        asOf,
        candles: Array.from({ length: 40 }, (_, i) => ({
          time: before - (40 - i) * step,
          open: 1,
          high: 1.1,
          low: 0.9,
          close: 1.01,
          volumeUsd: 1000,
        })),
      });
    }
    if (path.endsWith("/trades"))
      return ok({
        pool,
        source: "GeckoTerminal",
        asOf,
        items: [
          {
            id: sig,
            hash: sig,
            kind: "buy",
            timestamp: asOf,
            volumeUsd: 10,
            wallet,
            fromMint: wallet,
            toMint: mint,
            fromAmount: "0.1",
            toAmount: "10",
            priceFromUsd: 100,
            priceToUsd: 1,
          },
        ],
      });
    if (path === "/trade/quote")
      return ok({
        source: "Jupiter Swap API V2",
        asOf,
        inputMint: u.searchParams.get("inputMint"),
        outputMint: u.searchParams.get("outputMint"),
        inAmount: u.searchParams.get("amount"),
        outAmount: "1234500",
        outputDecimals: 6,
        feeBps: 10,
        feeMint: mint,
        router: "metis",
        priceImpactPct: 0.1,
        routeAvailable: true,
        executable: false,
        transaction: "MUST_NEVER_BE_SIGNED",
      });
    if (path === "/fable/status")
      return ok({
        configured: true,
        provider: "OpenAI Responses API",
        brand: "Fable 5.2",
        model: null,
        liveDataTools: [],
        autoTrade: false,
      });
    if (path === "/fable/chat")
      return ok({
        answer: "Source-backed V1 response <script>text only</script>",
        model: "fixture-provider-model",
        brand: "Fable 5.2",
        toolCalls: 1,
        provider: "OpenAI",
        disclaimer: "Test fixture",
      });
    if (path.startsWith("/wallet/") && path.endsWith("/activity"))
      return ok({
        address: wallet,
        signatures: [
          {
            signature: sig,
            slot: 123,
            err: null,
            blockTime: 1700000000,
            confirmationStatus: "confirmed",
          },
        ],
        source: "Solana RPC",
        asOf,
        note: "Signatures are not trades",
      });
    if (path.startsWith("/wallet/"))
      return ok({
        address: wallet,
        lamports: "1230000000",
        sol: "1.23",
        tokens: [
          { mint, rawAmount: "2469000", decimals: 6, program: "Token-2022" },
        ],
        source: "Solana RPC",
        asOf,
        note: "Balances only, not PnL",
      });
    if (path.startsWith("/transaction/"))
      return ok({
        signature: sig,
        status: { confirmationStatus: "confirmed", err: null, slot: 123 },
        asOf,
      });
    if (path === "/session") return ok({ token: session }, 201);
    if (
      ["/watchlist", "/alerts", "/alerts/events"].includes(path) ||
      path.startsWith("/alerts/")
    ) {
      if (req.headers()["authorization"] !== `Bearer ${session}`)
        return ok(
          { error: { code: "AUTH_REQUIRED", message: "Session required" } },
          401,
        );
      if (path === "/watchlist") {
        if (body)
          watched = body.enabled
            ? [...new Set([...watched, body.mint])]
            : watched.filter((m) => m !== body.mint);
        return ok({ items: watched });
      }
      if (path === "/alerts/events") return ok({ items: events });
      if (path === "/alerts") {
        if (body) {
          const a = {
            id: "0123456789abcdef",
            mint: body.mint,
            direction: body.direction,
            priceUsd: body.priceUsd,
            triggered: false,
            createdAt: Date.now(),
          };
          alerts.push(a);
          return ok({ alert: a }, 201);
        }
        return ok({ items: alerts });
      }
      if (req.method() === "DELETE") {
        alerts = alerts.filter((a) => !path.endsWith(a.id));
        return ok({ deleted: true });
      }
    }
    return ok(
      { error: { code: "NOT_FOUND", message: `Unexpected V1 route ${path}` } },
      404,
    );
  });
  return calls;
}
test.afterEach(async ({ page }) => expect(errors.get(page) ?? []).toEqual([]));
test("V1 search, token, OHLCV paging, snapshot stream, quote-only policy and Fable preserve the terminal", async ({
  page,
}) => {
  const calls = await v1Fixtures(page);
  const forbidden: string[] = [];
  page.on("request", (r) => {
    if (
      r.url().includes("/ray/") ||
      /\/trade\/(execute|sign|copytrade)/.test(r.url())
    )
      forbidden.push(r.url());
  });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/terminal");
  await expect(page.locator(".tail-terminal-route:not([inert])")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Find your next market." }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search Solana tokens" })
    .fill("USDC");
  await page
    .getByRole("region", { name: "Token search results" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "40",
  );
  await page
    .getByRole("button", { name: "Older history", exact: true })
    .click();
  await expect
    .poll(() => calls.filter((c) => c.path.endsWith("/ohlcv")).length)
    .toBeGreaterThan(1);
  await expect
    .poll(() => calls.some((c) => c.path.startsWith("/market/stream/")))
    .toBe(true);
  await page.screenshot({
    path: "artifacts/backend-v1/terminal-1672.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await expect(page.locator(".quote-details")).toContainText("1.2345");
  await expect(page.locator(".quote-details")).toContainText("Not executable");
  await expect(
    page.getByRole("button", { name: "Review & swap", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".swap-slippage select")).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Ask Fable 5.2", exact: true })
    .fill("Analyze liquidity");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("log")).toContainText(
    "Source-backed V1 response <script>text only</script>",
  );
  const chat = calls.find((c) => c.path === "/fable/chat")!.body as any;
  expect(chat.message).toBe("Analyze liquidity");
  expect(chat.context.mint).toBe(mint);
  expect(forbidden).toEqual([]);
});
test("V1 missing credentials and source errors are explicit without old-provider fallback", async ({
  page,
}) => {
  await v1Fixtures(page);
  await page.route("**/tail-api/fable/status", (r) =>
    r.fulfill({
      json: {
        configured: false,
        brand: "Fable 5.2",
        reason: "OPENAI_API_KEY required on the server.",
      },
    }),
  );
  await page.route("**/tail-api/fable/chat", (r) =>
    r.fulfill({
      status: 503,
      json: {
        error: {
          code: "AI_NOT_CONFIGURED",
          message: "OPENAI_API_KEY and OPENAI_MODEL required.",
        },
      },
    }),
  );
  await page.route("**/tail-api/**/ohlcv?**", (r) =>
    r.fulfill({
      status: 502,
      json: {
        error: {
          code: "UPSTREAM_ERROR",
          message: "GeckoTerminal returned 403",
        },
      },
    }),
  );
  await page.goto(`/?mint=${mint}`);
  await expect(page.locator(".chart-state")).toContainText(
    "GeckoTerminal returned 403",
  );
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "0",
  );
  await expect(
    page.getByRole("textbox", { name: "Ask Fable 5.2", exact: true }),
  ).toBeEditable();
  await expect(
    page.getByRole("button", { name: "Send message" }),
  ).toBeDisabled();
  await expect(page.locator(".fable-panel")).toContainText(
    "Fable 5.2 needs its server connection configured.",
  );
  await expect(page.locator(".fable-panel")).not.toContainText(
    /OPENAI|ChatGPT|API_KEY/i,
  );
  const composer = page.getByRole("textbox", { name: "Ask Fable 5.2", exact: true });
  await expect(page.locator(".tail-terminal-route:not([inert])")).toBeVisible();
  await composer.fill("Inspect this market");
  await expect(composer).toHaveValue("Inspect this market");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".fable-panel [role=alert]")).toContainText("The workspace owner needs to finish setup.");
  await expect(composer).toHaveValue("Inspect this market");
  await expect(page.locator(".fable-transcript > article")).toHaveCount(0);
});
test("old blue preferences migrate and real-source hourly fallback stays correctly labelled", async ({
  page,
}) => {
  const calls = await v1Fixtures(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem("tail.audit.seeded")) {
      localStorage.setItem(
        "part.preferences.v1",
        JSON.stringify({
          version: 1,
          theme: "midnight",
          accent: "#77bdfb",
          defaultInterval: "5m",
          upColor: "#22c55e",
          downColor: "#ef4444",
        }),
      );
      localStorage.setItem("tail.audit.seeded", "1");
    }
  });
  await page.route("**/tail-api/**/ohlcv?**", (r) => {
    const u = new URL(r.request().url()),
      interval = u.searchParams.get("interval");
    if (interval !== "1h")
      return r.fulfill({
        status: 503,
        json: {
          error: {
            code: "HISTORY_PLAN_REQUIRED",
            message: "Minute candles require an indexer API key. Select 1h.",
          },
        },
      });
    return r.fulfill({
      json: {
        pool,
        token: mint,
        interval,
        source: "DexPaprika",
        live: false,
        historyLimited: true,
        asOf,
        warning:
          "Real indexed hourly history, last 24h. Edge candles may be partial.",
        candles: Array.from({ length: 23 }, (_, i) => ({
          time: Math.floor(Date.now() / 3600000) * 3600 - (23 - i) * 3600,
          open: 1,
          high: 1.1,
          low: 0.9,
          close: 1.01,
          volumeUsd: 1000,
        })),
      },
    });
  });
  await page.goto(`/?mint=${mint}`);
  await page.getByRole("button", { name: "1h", exact: true }).click();
  await expect(page.locator(".tail-app")).toHaveClass(/theme-black/);
  await expect(page.locator(".tail-app")).toHaveCSS("--accent", "#ff812e");
  await expect(page.locator(".chart-intervals button.selected")).toHaveText(
    "1h",
  );
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "23",
  );
  await expect(page.locator(".chart-bottom")).toContainText("DexPaprika");
  await expect(
    page.getByRole("button", { name: "24h history limit", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "5m", exact: true }).click();
  await expect(page.locator(".chart-state")).toContainText(
    "Minute candles require",
  );
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "0",
  );
  await page.getByRole("button", { name: "Load available 1h history" }).click();
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "23",
  );
  await expect(
    page.getByRole("button", { name: "Send message" }),
  ).toBeInViewport();
  await page.reload();
  await expect(page.locator(".tail-app")).toHaveCSS("--accent", "#ff812e");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("part.preferences.v1")!),
    ),
  ).toMatchObject({
    paletteRevision: 3,
    defaultInterval: "1h",
    upColor: "#22c55e",
    downColor: "#ef4444",
  });
  expect(calls.some((c) => c.path.startsWith("/trade/execute"))).toBe(false);
});
test("V1 public wallet balances, signatures and transaction status remain read-only", async ({
  page,
}) => {
  const calls = await v1Fixtures(page);
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Public wallet address" })
    .fill(wallet);
  await page
    .getByRole("button", { name: "Inspect wallet", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "1.23 SOL" })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("2.469");
  await expect(page.getByRole("dialog")).toContainText(
    "not classified as trades",
  );
  await page
    .getByRole("button", { name: "Inspect status", exact: true })
    .click();
  await page.getByRole("button", { name: "Check transaction status" }).click();
  await expect(page.getByRole("dialog").locator("[role=status]")).toContainText(
    "confirmed",
  );
  expect(
    calls
      .filter(
        (c) =>
          c.path.startsWith("/wallet/") || c.path.startsWith("/transaction/"),
      )
      .every((c) => c.method === "GET"),
  ).toBe(true);
});
test("V1 anonymous watchlist and price-alert CRUD use a bounded session, no background-delivery claim", async ({
  page,
}) => {
  const calls = await v1Fixtures(page);
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Alerts", exact: true }).click();
  await page.getByRole("textbox", { name: "Watched token mint" }).fill(mint);
  await page
    .getByRole("button", { name: "Add to watchlist", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Remove EPjF/ })).toBeVisible();
  await page.getByRole("textbox", { name: "Alert price USD" }).fill("0.5");
  await page.getByRole("button", { name: "Create price alert" }).click();
  await expect(
    page.getByRole("button", { name: "Delete alert", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("no 24/7 delivery");
  await page.getByRole("button", { name: "Delete alert", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Delete alert", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Remove EPjF/ }).click();
  await expect(page.getByRole("dialog")).toContainText("No watched tokens.");
  expect(calls.filter((c) => c.path === "/session")).toHaveLength(1);
  expect(
    calls
      .filter((c) => c.auth)
      .every((c) => c.path === "/watchlist" || c.path.startsWith("/alerts")),
  ).toBe(true);
});
test("V1 profiles, paid boosts, new pools and server filters are accessible in Pulse", async ({
  page,
}) => {
  const calls = await v1Fixtures(page);
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Pulse", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Solana discovery" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Paid boosts", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("not organic trending");
  await page.getByRole("button", { name: "New pools", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("USDC / SOL");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("textbox", { name: "Search", exact: true }).fill("USDC");
  await page
    .getByRole("textbox", { name: "Minimum liquidity USD", exact: true })
    .fill("100");
  await page.getByRole("button", { name: "Apply server filter" }).click();
  await expect(
    page.getByRole("button", { name: "Open USDC", exact: true }),
  ).toBeVisible();
  expect(calls.some((c) => c.path === "/market/filter")).toBe(true);
});

test("V1 mobile dialogs preserve the existing responsive shell without horizontal overflow", async ({
  page,
}) => {
  await v1Fixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/terminal");
  for (const entry of ["Pulse", "Alerts", "Account", "Settings"]) {
    if (entry === "Account") {
      await page
        .getByRole("button", { name: "Portfolio", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Wallet balances", exact: true })
        .click();
    } else await page.getByRole("button", { name: entry, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Close panel", exact: true })
      .click();
  }
  await page.screenshot({
    path: "artifacts/backend-v1/mobile-390.png",
    fullPage: true,
  });
});

test("unindexed default pool recovers to a covered pool of the same token and persists its actual identity", async ({
  page,
}) => {
  await v1Fixtures(page);
  const alternate = wallet;
  await page.route(`**/tail-api/market/token/${mint}`, (r) =>
    r.fulfill({
      json: {
        token: pair(),
        markets: [pair(), { ...pair(), pairAddress: alternate, dex: "orca" }],
        source: "DexScreener",
        asOf,
      },
    }),
  );
  await page.route("**/tail-api/**/ohlcv?**", (r) => {
    const u = new URL(r.request().url()),
      selected = u.pathname.split("/").at(-2);
    if (selected !== alternate)
      return r.fulfill({
        status: 502,
        json: {
          error: {
            code: "UPSTREAM_ERROR",
            message: "api.dexpaprika.com returned 404",
          },
        },
      });
    return r.fulfill({
      json: {
        pool: alternate,
        token: mint,
        interval: u.searchParams.get("interval"),
        source: "DexPaprika",
        asOf,
        live: false,
        historyLimited: true,
        candles: Array.from({ length: 20 }, (_, i) => ({
          time: Math.floor(Date.now() / 3600000) * 3600 - (20 - i) * 3600,
          open: 1,
          high: 1.1,
          low: 0.9,
          close: 1.01,
          volumeUsd: 1000,
        })),
      },
    });
  });
  await page.goto(`/?mint=${mint}`);
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "20",
  );
  await expect(page.locator(".market-recovery-note")).toContainText(
    `History source switched to orca pool ${alternate}`,
  );
  expect(new URL(page.url()).searchParams.get("pool")).toBe(alternate);
  expect(new URL(page.url()).searchParams.get("mint")).toBe(mint);
  await expect(page.locator(".chart-bottom a")).toHaveAttribute(
    "href",
    `https://dexscreener.com/solana/${alternate}`,
  );
  await page.reload();
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "20",
  );
  expect(new URL(page.url()).searchParams.get("pool")).toBe(alternate);
});

test("new markets open minute candles and All loads earlier token history without relabelling volume", async ({
  page,
}) => {
  await v1Fixtures(page);
  const now = Math.floor(Date.now() / 60000) * 60;
  await page.route(`**/tail-api/market/token/${mint}`, (r) =>
    r.fulfill({
      json: {
        token: { ...pair(), pairCreatedAt: Date.now() - 20 * 60000 },
        markets: [{ ...pair(), pairCreatedAt: Date.now() - 20 * 60000 }],
        source: "DexScreener",
        asOf,
      },
    }),
  );
  await page.route("**/tail-api/**/ohlcv?**", (r) => {
    const u = new URL(r.request().url()),
      before = Number(u.searchParams.get("before_timestamp"));
    return r.fulfill({
      json: {
        pool,
        token: mint,
        interval: u.searchParams.get("interval"),
        source: "Candle / Birdeye",
        scope: "token",
        volumeUnit: "token",
        paging: true,
        asOf,
        live: false,
        historyLimited: false,
        candles: before
          ? []
          : Array.from({ length: 20 }, (_, i) => ({
              time: now - (20 - i) * 60,
              open: 1,
              high: 1.1,
              low: 0.9,
              close: 1.01,
              volume: 42,
              volumeUsd: null,
            })),
      },
    });
  });
  await page.goto(`/?mint=${mint}`);
  await expect(page.locator(".chart-intervals .selected")).toHaveText("1m");
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "20",
  );
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-history-scope",
    "token",
  );
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-volume-unit",
    "token",
  );
  await expect(page.locator(".chart-bottom")).toContainText("token-wide");
  await expect(page.locator(".candle-key")).toContainText("42 USDC");
  await expect(
    page.getByRole("button", { name: "24h history limit", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".chart-native")).toHaveAttribute(
    "data-visible-from",
    /-/,
  );
  await page.getByRole("button", { name: "Latest", exact: true }).click();
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-history-view",
    "recent",
  );
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-history-view",
    "all",
  );
});

test("All includes older pages and Latest changes viewport without deleting history", async ({
  page,
}) => {
  await v1Fixtures(page);
  const end = Math.floor(Date.now() / 86400000) * 86400;
  const requests: number[] = [];
  await page.route("**/tail-api/**/ohlcv?**", (r) => {
    const u = new URL(r.request().url()),
      before = Number(u.searchParams.get("before_timestamp"));
    requests.push(before);
    const count = !before ? 500 : before >= end - 501 * 86400 ? 100 : 0;
    const start = !before ? end - 500 * 86400 : end - 600 * 86400;
    return r.fulfill({
      json: {
        pool,
        token: mint,
        interval: u.searchParams.get("interval"),
        source: "Candle / Birdeye",
        scope: "token",
        volumeUnit: "token",
        paging: true,
        asOf,
        live: false,
        candles: Array.from({ length: count }, (_, i) => ({
          time: start + i * 86400,
          open: 1,
          high: 1.1,
          low: 0.9,
          close: 1.01,
          volume: 42,
          volumeUsd: null,
        })),
      },
    });
  });
  await page.goto(`/?mint=${mint}`);
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "600",
  );
  await expect(page.locator(".chart-native")).toHaveAttribute(
    "data-visible-from",
    /-/,
  );
  await expect
    .poll(async () =>
      Number(
        await page.locator(".chart-native").getAttribute("data-visible-to"),
      ),
    )
    .toBeGreaterThan(599);
  await page.getByRole("button", { name: "Latest", exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        await page.locator(".chart-native").getAttribute("data-visible-from"),
      ),
    )
    .toBeGreaterThan(400);
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "600",
  );
  expect(requests.some((n) => n > 0)).toBe(true);
});

test("a recovering token-history source replaces the fallback series before paging", async ({
  page,
}) => {
  await v1Fixtures(page);
  const end = Math.floor(Date.now() / 86400000) * 86400;
  let recovered = false;
  const cursors: number[] = [];
  await page.route("**/tail-api/**/ohlcv?**", (r) => {
    const u = new URL(r.request().url());
    const before = Number(u.searchParams.get("before_timestamp"));
    if (recovered && before) cursors.push(before);
    const start = recovered ? end - 20 * 86400 : end - 700 * 86400;
    return r.fulfill({
      json: {
        pool,
        token: mint,
        interval: u.searchParams.get("interval"),
        live: false,
        asOf,
        source: recovered ? "Candle / Birdeye" : "GeckoTerminal",
        scope: recovered ? "token" : "pool",
        volumeUnit: recovered ? "token" : "usd",
        paging: recovered,
        candles: before
          ? []
          : Array.from({ length: recovered ? 20 : 40 }, (_, i) => ({
              time: start + i * 86400,
              open: 1,
              high: 1.1,
              low: 0.9,
              close: 1.01,
              volume: recovered ? 42 : undefined,
              volumeUsd: recovered ? null : 1000,
            })),
      },
    });
  });
  await page.goto(`/?mint=${mint}`);
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "40",
  );
  recovered = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-history-scope",
    "token",
  );
  await expect(page.locator(".sol-chart .data-note")).toContainText(
    "Source returned no older candles",
  );
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "20",
  );
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-first-candle",
    String((end - 20 * 86400) * 1000),
  );
  expect(cursors[0]).toBe(end - 20 * 86400 - 1);
});

test("Latest cancels slow history paging and retains its trading viewport", async ({
  page,
}) => {
  await v1Fixtures(page);
  const end = Math.floor(Date.now() / 86400000) * 86400;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let waiting = false;
  await page.route("**/tail-api/**/ohlcv?**", async (r) => {
    const u = new URL(r.request().url());
    const before = Number(u.searchParams.get("before_timestamp"));
    if (before) {
      waiting = true;
      await pending;
    }
    const start = end - (before ? 1000 : 500) * 86400;
    return r.fulfill({
      json: {
        pool,
        token: mint,
        interval: u.searchParams.get("interval"),
        live: false,
        asOf,
        source: "Candle / Birdeye",
        scope: "token",
        volumeUnit: "token",
        paging: true,
        candles: Array.from({ length: 500 }, (_, i) => ({
          time: start + i * 86400,
          open: 1,
          high: 1.1,
          low: 0.9,
          close: 1.01,
          volume: 42,
          volumeUsd: null,
        })),
      },
    });
  });
  await page.goto(`/?mint=${mint}`);
  await expect.poll(() => waiting).toBe(true);
  await page.getByRole("button", { name: "Latest", exact: true }).click();
  const delivered = page.waitForResponse((r) =>
    r.url().includes("before_timestamp="),
  );
  release();
  await (await delivered).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-history-view",
    "recent",
  );
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "500",
  );
  await expect(
    page.getByRole("button", { name: "Stop loading history", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(async () =>
      Number(
        await page.locator(".chart-native").getAttribute("data-visible-from"),
      ),
    )
    .toBeGreaterThan(300);
});

test("Stop also cancels manual Older history without replacing the loaded series", async ({
  page,
}) => {
  await v1Fixtures(page);
  const end = Math.floor(Date.now() / 86400000) * 86400;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let olderRequests = 0;
  await page.route("**/tail-api/**/ohlcv?**", async (r) => {
    const u = new URL(r.request().url());
    const before = Number(u.searchParams.get("before_timestamp"));
    if (before && ++olderRequests > 1) await pending;
    const start = end - (before ? 1000 : 500) * 86400;
    return r.fulfill({
      json: {
        pool,
        token: mint,
        interval: u.searchParams.get("interval"),
        live: false,
        asOf,
        source: "Candle / Birdeye",
        scope: "token",
        volumeUnit: "token",
        paging: true,
        candles:
          before && olderRequests === 1
            ? []
            : Array.from({ length: 500 }, (_, i) => ({
                time: start + i * 86400,
                open: 1,
                high: 1.1,
                low: 0.9,
                close: 1.01,
                volume: 42,
                volumeUsd: null,
              })),
      },
    });
  });
  await page.goto(`/?mint=${mint}`);
  await expect(page.locator(".sol-chart .data-note")).toContainText(
    "Source returned no older candles",
  );
  await page
    .getByRole("button", { name: "Older history", exact: true })
    .click();
  await expect.poll(() => olderRequests).toBe(2);
  await page
    .getByRole("button", { name: "Stop loading history", exact: true })
    .click();
  const delivered = page.waitForResponse((r) =>
    r.url().includes("before_timestamp="),
  );
  release();
  await (await delivered).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator(".sol-chart .data-note")).toContainText(
    "History loading stopped",
  );
  await expect(page.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "500",
  );
});
