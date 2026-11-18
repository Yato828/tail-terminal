import { expect, type Page } from "@playwright/test";
export const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const pool = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE";
export const wallet = "So11111111111111111111111111111111111111112";
const signature = "4".repeat(88);
const pair = {
  chainId: "solana",
  dexId: "raydium",
  pairAddress: pool,
  baseToken: { address: mint, symbol: "USDC", name: "Test fixture USDC" },
  quoteToken: { address: wallet, symbol: "SOL" },
  priceUsd: "1",
  marketCap: 1000000,
  liquidity: { usd: 200000 },
  volume: { h24: 100000 },
  priceChange: { h24: 0.1 },
  txns: { h24: { buys: 30, sells: 25 } },
  pairCreatedAt: Date.now() - 86400000,
};
export const errors = new WeakMap<Page, string[]>();
export async function fixtures(
  page: Page,
  options: { liveSocket?: boolean } = {},
) {
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
  if (!options.liveSocket)
    await page.routeWebSocket(/wss:\/\//, (socket) => {
      /* Quiet deterministic feed unless a test installs its own socket. */
    });
  await page.route("**/candle/**", (route) => {
    const u = new URL(route.request().url()),
      interval = u.searchParams.get("interval") ?? "1m";
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
    const end = Math.floor(Date.now() / (step * 1000)) * step;
    return route.fulfill({
      json: {
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
      },
    });
  });
  await page.route("**/rugcheck/**", (r) =>
    r.fulfill({ json: { mint, topHolders: null } }),
  );
  await page.route("**/api/astra/status", (r) =>
    r.fulfill({
      json: {
        configured: false,
        ready: false,
        model: null,
        reason: "Fable 5.2 isn't configured. Add OPENAI_API_KEY on the server.",
        rateLimit: "local",
      },
    }),
  );
  await page.route("**/api/astra/chat", (r) =>
    r.fulfill({
      status: 503,
      json: {
        error: "Fable 5.2 isn't configured. Add OPENAI_API_KEY on the server.",
      },
    }),
  );
  await page.route("**/dex/**", async (route) => {
    const url = route.request().url();
    await route.fulfill({
      json: url.includes("token-profiles")
        ? [{ chainId: "solana", tokenAddress: mint }]
        : url.includes("/latest/dex/")
          ? { pairs: [pair] }
          : [pair],
    });
  });
  await page.route("**/gecko/**", async (route) => {
    if (route.request().url().includes("ohlcv")) {
      const u = new URL(route.request().url());
      const before = u.searchParams.get("before_timestamp");
      const step =
        Number(u.searchParams.get("aggregate") || 1) *
        (u.pathname.endsWith("/day")
          ? 86400
          : u.pathname.endsWith("/hour")
            ? 3600
            : 60);
      const end = before
        ? Number(before)
        : Math.floor(Date.now() / (step * 1000)) * step;
      await route.fulfill({
        json: {
          data: {
            attributes: {
              ohlcv_list: Array.from({ length: 40 }, (_, i) => [
                end - (i + 1) * step,
                1,
                1.02,
                0.98,
                1.001,
                1000,
              ]),
            },
          },
        },
      });
    } else await route.fulfill({ json: { data: { attributes: {} } } });
  });
  await page.route("**/paprika/**", (r) =>
    r.fulfill({ status: 503, json: { error: "Fixture fallback unavailable" } }),
  );
  await page.route(/\/rpc(?:-backup)?$/, async (route) => {
    const body = route.request().postDataJSON();
    const call = (c: { method: string; id: number }) => ({
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
                  : c.method === "getTokenLargestAccounts"
                    ? { value: [] }
                    : c.method === "getSignaturesForAddress"
                      ? [{ signature, blockTime: 1700000000, err: null }]
                      : c.method === "getTransaction"
                        ? {
                            blockTime: 1700000000,
                            transaction: {
                              message: { accountKeys: [{ pubkey: wallet }] },
                            },
                            meta: {
                              err: null,
                              preBalances: [2000000000],
                              postBalances: [1000000000],
                              preTokenBalances: [],
                              postTokenBalances: [
                                {
                                  accountIndex: 0,
                                  mint,
                                  owner: wallet,
                                  uiTokenAmount: { uiAmountString: "10" },
                                },
                              ],
                            },
                          }
                        : { value: [] },
    });
    await route.fulfill({
      json: Array.isArray(body) ? body.map(call) : call(body),
    });
  });
  await page.route("**/ray/**", (route) => {
    const u = new URL(route.request().url());
    return route.fulfill({
      json: {
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
      },
    });
  });
}
export async function enter(page: Page) {
  // Exercise the explicitly retained legacy terminal. TAIL has its own full-flow suite.
  await page.goto("/?legacy=1");
  await page
    .getByRole("button", { name: "Enter Terminal", exact: true })
    .first()
    .click();
  await expect(page.locator(".term-overlay")).toHaveClass(/on/);
}
export async function launch(page: Page, title: string) {
  await page
    .getByRole("button", { name: "Add Panel", exact: true })
    .first()
    .click();
  await page.getByRole("textbox", { name: "Find a module" }).fill(title);
  await page
    .locator(".launcher-results button")
    .filter({ has: page.getByText(title, { exact: true }) })
    .click();
}
export async function choose(page: Page) {
  await page.getByRole("combobox", { name: "Search Solana tokens" }).fill(mint);
  await page.getByRole("listbox").getByRole("option").first().click();
  await expect(page.locator(".chart-native canvas").first()).toBeVisible();
}
