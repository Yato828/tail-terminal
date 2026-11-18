import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { tailApi, tailRequest, formatAtomic, TailApiError } from "./client";
import { tailApiBase, tailBackendEnabled } from "./config";
import { coinFromPair, backendPool } from "./market";
import { loadCandleResult } from "../../lib/axiom";
import { askAstra } from "../../features/astra/client";
import { executeSwap } from "../../lib/swap";
import { subscribeBackendSnapshot } from "./stream";
import type { BackendPair } from "./contracts";
const mint = "So11111111111111111111111111111111111111112",
  token = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const pair: BackendPair = {
  mint: token,
  pairAddress: mint,
  symbol: "USDC",
  name: "USD Coin",
  dex: "orca",
  quoteMint: mint,
  priceUsd: 1,
  marketCap: null,
  fdv: null,
  liquidityUsd: 500,
  volume24h: 100,
  volume1h: 10,
  volume5m: 1,
  priceChange24h: null,
  priceChange1h: null,
  priceChange5m: null,
  pairCreatedAt: null,
  icon: null,
  websites: [],
  socials: [],
};
const mock = vi.fn();
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
beforeEach(() => {
  vi.stubEnv("VITE_TAIL_API_URL", "/tail-api");
  vi.stubEnv("VITE_PART_SHELL", "web");
  vi.stubGlobal("fetch", mock);
  mock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("requires a safe server API and uses standalone sources in an unconfigured extension", () => {
  expect(tailBackendEnabled()).toBe(true);
  vi.stubEnv("VITE_TAIL_API_URL", "http://evil.example");
  expect(() => tailApiBase()).toThrow();
  vi.stubEnv("VITE_TAIL_API_URL", "https://user:secret@example.com");
  expect(() => tailApiBase()).toThrow();
  vi.stubEnv("VITE_TAIL_API_URL", "");
  expect(tailBackendEnabled()).toBe(false);
  vi.stubEnv("VITE_TAIL_API_URL", "/tail-api");
  vi.stubEnv("VITE_PART_SHELL", "ext");
  expect(tailBackendEnabled()).toBe(true);
  vi.stubEnv("VITE_TAIL_API_URL", "");
  expect(tailApiBase()).toBe("browser-local");
});
it("preserves nested API errors and fails closed without legacy fallback", async () => {
  mock.mockResolvedValue(
    json(
      { error: { code: "UPSTREAM_ERROR", message: "Gecko returned 403" } },
      502,
    ),
  );
  await expect(tailRequest("/health")).rejects.toMatchObject({
    status: 502,
    code: "UPSTREAM_ERROR",
    message: "Gecko returned 403",
  });
  expect(mock).toHaveBeenCalledTimes(1);
});
it("maps observations without inventing unavailable 24h buys/holders/prices", () => {
  const c = coinFromPair(pair, {
    source: "DexScreener",
    asOf: "2026-11-15T00:00:00Z",
  });
  expect(c?.address).toBe(token);
  expect(c?.priceUsd).toBe(1);
  expect(c?.change24h).toBeUndefined();
  expect(c?.buys24h).toBeUndefined();
  expect(c?.observedAt).toBe("2026-11-15T00:00:00Z");
  expect(coinFromPair({ ...pair, priceUsd: null })).toBeNull();
  expect(coinFromPair({ ...pair, mint: "0xabc" })).toBeNull();
});
it("does not silently change the selected pool when the best pool differs", async () => {
  mock.mockResolvedValue(
    json({
      token: pair,
      markets: [pair],
      source: "DexScreener",
      asOf: new Date().toISOString(),
    }),
  );
  expect(await backendPool(token, token)).toBeNull();
});
it("candle adapter binds the selected mint, cursor, seconds/milliseconds and source time", async () => {
  const asOf = "2026-11-15T00:00:00Z";
  mock.mockResolvedValue(
    json({
      pool: mint,
      token,
      interval: "5m",
      live: false,
      source: "DexPaprika",
      historyLimited: true,
      warning: "Last 24h",
      asOf,
      candles: [
        {
          time: 1700000000,
          open: 1,
          high: 2,
          low: 0.5,
          close: 1.5,
          volumeUsd: 10,
        },
      ],
    }),
  );
  const r = await loadCandleResult(mint, "5m", token, 1700000000000);
  expect(r.bars[0].t).toBe(1700000000000);
  expect(r.fetchedAt).toBe(Date.parse(asOf));
  expect(r).toMatchObject({
    source: "DexPaprika",
    historyLimited: true,
    warning: "Last 24h",
  });
  const url = mock.mock.calls[0][0];
  expect(url).toContain(`token=${token}`);
  expect(url).toContain("before_timestamp=1700000000");
  mock.mockResolvedValue(
    json({ pool: mint, token: mint, interval: "5m", live: false, candles: [] }),
  );
  await expect(loadCandleResult(mint, "5m", token)).rejects.toThrow(
    "Mismatched",
  );
});
it("quote binding, uint64 amounts, exact decimal rendering and transaction stripping", async () => {
  mock.mockResolvedValue(
    json({
      source: "Jupiter",
      asOf: new Date().toISOString(),
      inputMint: mint,
      outputMint: token,
      inAmount: "100",
      outAmount: "1234567",
      outputDecimals: 6,
      routeAvailable: true,
      executable: false,
      transaction: "malicious",
      requestId: "secret",
    }),
  );
  const q = await tailApi.quote(mint, token, "100");
  expect(q).not.toHaveProperty("transaction");
  expect(q).not.toHaveProperty("requestId");
  expect(formatAtomic(q.outAmount!, q.outputDecimals)).toBe("1.234567");
  expect(formatAtomic("18446744073709551615", null)).toContain("atomic units");
  await expect(
    tailApi.quote(mint, token, "18446744073709551616"),
  ).rejects.toThrow();
  mock.mockResolvedValue(
    json({
      inputMint: token,
      outputMint: mint,
      inAmount: "100",
      outAmount: "1",
      routeAvailable: true,
      executable: false,
    }),
  );
  await expect(tailApi.quote(mint, token, "100")).rejects.toThrow("mismatched");
});
it("blocks the legacy signing entry point before any wallet/provider calls", async () => {
  await expect(executeSwap({} as never, () => {})).rejects.toThrow(
    "quote-only",
  );
  expect(mock).not.toHaveBeenCalled();
});
it("adapts bounded Fable history and reports the actual served model", async () => {
  mock.mockResolvedValue(
    json({
      answer: "Source analysis",
      model: "actual-model",
      toolCalls: 1,
      brand: "Fable 5.2",
      provider: "OpenAI",
    }),
  );
  const r = await askAstra(
    [
      { role: "assistant", content: "previous" },
      { role: "user", content: "Analyze" },
    ],
    { mint: token, pool: mint, symbol: "USDC", chainId: "solana" },
  );
  expect(r.text).toBe("Source analysis");
  expect(r.model).toBe("actual-model");
  const body = JSON.parse(mock.mock.calls[0][1].body);
  expect(body.message).toBe("Analyze");
  expect(body.context.mint).toBe(token);
  expect(body.history).toEqual([{ role: "assistant", content: "previous" }]);
  await expect(
    askAstra([{ role: "user", content: "x".repeat(2001) }], null),
  ).rejects.toThrow("2000");
});
it("SSE shares a single polled snapshot channel and closes it after the last subscriber", () => {
  class Source {
    static instances: Source[] = [];
    listeners = new Map<string, (event: unknown) => void>();
    closed = false;
    constructor(public url: string) {
      Source.instances.push(this);
    }
    addEventListener(name: string, fn: (event: unknown) => void) {
      this.listeners.set(name, fn);
    }
    close() {
      this.closed = true;
    }
  }
  vi.stubGlobal("EventSource", Source);
  const a = vi.fn(),
    b = vi.fn(),
    err = vi.fn();
  const offA = subscribeBackendSnapshot(token, { snapshot: a, error: err }),
    offB = subscribeBackendSnapshot(token, { snapshot: b, error: err });
  expect(Source.instances).toHaveLength(1);
  const source = Source.instances[0];
  source.listeners.get("snapshot")!({
    data: JSON.stringify({
      token: pair,
      source: "DexScreener",
      asOf: new Date().toISOString(),
      delivery: "polling",
      pollIntervalMs: 10000,
    }),
  });
  expect(a).toHaveBeenCalledTimes(1);
  expect(b.mock.calls[0][0].delivery).toBe("polling");
  offA();
  expect(source.closed).toBe(false);
  offB();
  expect(source.closed).toBe(true);
});
it("keeps token-wide native volume separate from pool/USD history", async () => {
  const asOf = new Date().toISOString();
  mock.mockResolvedValue(
    json({
      pool: mint,
      token,
      interval: "1m",
      scope: "token",
      volumeUnit: "token",
      paging: true,
      live: false,
      source: "Candle / Birdeye",
      asOf,
      candles: [
        {
          time: 1700000000,
          open: 1,
          high: 2,
          low: 0.5,
          close: 1.2,
          volume: 42,
          volumeUsd: null,
        },
      ],
    }),
  );
  const r = await loadCandleResult(mint, "1m", token);
  expect(r).toMatchObject({
    scope: "token",
    volumeUnit: "token",
    paging: true,
    source: "Candle / Birdeye",
  });
  expect(r.bars[0].v).toBe(42);
  mock.mockResolvedValue(
    json({
      pool: mint,
      token,
      interval: "1m",
      scope: "token",
      volumeUnit: "token",
      paging: true,
      live: false,
      source: "Candle / Birdeye",
      asOf,
      candles: [],
    }),
  );
  expect(
    (await loadCandleResult(mint, "1m", token, 1700000000000)).bars,
  ).toEqual([]);
});
