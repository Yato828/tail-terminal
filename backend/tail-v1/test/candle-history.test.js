import test from "node:test";
import assert from "node:assert/strict";
import { CandleHistory } from "../src/candle-history.js";
import { Charts } from "../src/charts.js";
const mint = "So11111111111111111111111111111111111111112",
  pool = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE",
  other = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const raw = (extra = {}) => ({
  success: true,
  chain: "solana",
  mint,
  interval: "1m",
  source: "birdeye",
  volumeUnit: "token",
  candles: [
    { time: 1700000000, open: 2, high: 3, low: 1, close: 2.5, volume: 50 },
  ],
  ...extra,
});
const json = (b) =>
  new Response(JSON.stringify(b), {
    headers: { "content-type": "application/json" },
  });
test("public token history is explicit about token-wide scope, native volume and independent pool context", async () => {
  const calls = [];
  const history = new CandleHistory({
    fetchImpl: async (u, init) => {
      calls.push({ u: new URL(u), init });
      return json(raw());
    },
  });
  const result = await history.ohlcv(pool, mint, "1m", 500, 1700000060);
  assert.equal(result.source, "Candle / Birdeye");
  assert.equal(result.scope, "token");
  assert.equal(result.volumeUnit, "token");
  assert.equal(result.candles[0].volume, 50);
  assert.equal(result.candles[0].volumeUsd, null);
  assert.equal(result.pool, pool);
  assert.equal(calls[0].u.searchParams.get("to"), "1700000060");
  assert.equal(calls[0].u.pathname, `/api/v1/markets/solana/${mint}/candles`);
  assert.equal(calls[0].init.headers.authorization, undefined);
  const shared = await history.ohlcv(other, mint, "1m", 500, 1700000060);
  assert.equal(calls.length, 1);
  assert.equal(shared.pool, other);
  assert.equal(shared.token, mint);
});
test("source identity, chain and units are validated; gaps and valid USD volume are not fabricated", async () => {
  for (const invalid of [
    { mint: other },
    { chain: "ethereum" },
    { interval: "1h" },
    { volumeUnit: "unknown" },
  ]) {
    const h = new CandleHistory({ fetchImpl: async () => json(raw(invalid)) });
    await assert.rejects(h.ohlcv(pool, mint, "1m", 10), (e) =>
      ["CANDLE_MISMATCH", "BAD_HISTORY"].includes(e.code),
    );
  }
  const rows = [
    { time: 1700000000, open: 2, high: 3, low: 1, close: 2.5, volume: 50 },
    { time: 1700000900, open: 2, high: 3, low: 1, close: 2.5, volume: 12 },
    { time: 1700000300, open: 2, high: 1, low: 4, close: 2.5, volume: 50 },
  ];
  const h = new CandleHistory({
    fetchImpl: async () =>
      json(raw({ source: "candle", volumeUnit: "usd", candles: rows })),
  });
  const r = await h.ohlcv(pool, mint, "1m", 500, 1700001000);
  assert.equal(r.candles.length, 2);
  assert.equal(r.candles[1].time - r.candles[0].time, 900);
  assert.equal(r.candles[0].volumeUsd, 50);
});
test("empty older pages remain empty and current requests use the real source before hourly fallback", async () => {
  const h = new CandleHistory({
    fetchImpl: async () => json(raw({ candles: [] })),
  });
  assert.equal(
    (await h.ohlcv(pool, mint, "1m", 10, 1700000000)).candles.length,
    0,
  );
  await assert.rejects(
    h.ohlcv(pool, mint, "1m", 10),
    (e) => e.code === "NO_CANDLES",
  );
  const calls = [];
  const charts = new Charts({
    fetchImpl: async (u) => {
      calls.push(new URL(u).hostname);
      return json(raw());
    },
  });
  const r = await charts.ohlcv(pool, "1m", 500, { token: mint });
  assert.equal(r.candles.length, 1);
  assert.deepEqual(calls, ["api.candle.tv"]);
});
