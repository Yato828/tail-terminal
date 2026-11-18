import test from "node:test";
import assert from "node:assert/strict";
import { Charts } from "../src/charts.js";
const pool = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE",
  sol = "So11111111111111111111111111111111111111112",
  usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });
const hour = Math.floor(Date.now() / 3600000) * 3600000;
const record = (ago, values = {}) => ({
  time_open: new Date(hour - ago * 3600000).toISOString(),
  open: 70,
  high: 72,
  low: 69,
  close: 71,
  volume: 123,
  ...values,
});
function fixture({
  rows = [record(3), record(1)],
  meta = {},
  pools = [],
} = {}) {
  const calls = [];
  const charts = new Charts({
    fetchImpl: async (url) => {
      const u = new URL(url);
      calls.push(u);
      if (u.hostname === "api.geckoterminal.com") return json({}, 403);
      assert.equal(u.hostname, "api.dexpaprika.com");
      if (u.pathname.endsWith("/search")) return json({ results: pools });
      if (u.pathname.endsWith("/ohlcv")) return json(rows);
      return json({
        id: pool,
        chain: "solana",
        base_token_id: sol,
        quote_token_id: usdc,
        ...meta,
      });
    },
  });
  return { charts, calls };
}
test("blocked Gecko falls back to real hourly history, shares requests, preserves gaps and volumes", async () => {
  const { charts, calls } = fixture({
    rows: [
      record(1),
      record(3),
      record(2, { high: 60 }),
      record(4, { volume: -1 }),
      record(1),
    ],
  });
  const r = await charts.ohlcv(pool, "1h", 500, { token: sol });
  assert.equal(r.source, "DexPaprika");
  assert.equal(r.historyLimited, true);
  assert.equal(r.interval, "1h");
  assert.equal(r.token, sol);
  assert.equal(r.live, false);
  assert.equal(r.candles.length, 2);
  assert.equal(r.candles[1].time - r.candles[0].time, 7200);
  assert.equal(r.candles[0].volumeUsd, 123);
  const four = await charts.ohlcv(pool, "4h", 500, { token: sol });
  assert.equal(
    four.candles.reduce((n, c) => n + c.volumeUsd, 0),
    246,
  );
  assert.equal(
    calls.filter((u) => u.hostname === "api.geckoterminal.com").length,
    1,
  );
  assert.equal(calls.filter((u) => u.pathname.endsWith("/ohlcv")).length, 1);
  assert.equal(
    calls
      .find((u) => u.pathname.endsWith("/ohlcv"))
      .searchParams.get("inversed"),
    "false",
  );
});
test("quote-token USD history requests inversed and refuses a different mint or pool chain", async () => {
  const { charts, calls } = fixture();
  await charts.ohlcv(pool, "1h", 20, { token: usdc });
  assert.equal(
    calls
      .find((u) => u.pathname.endsWith("/ohlcv"))
      .searchParams.get("inversed"),
    "true",
  );
  await assert.rejects(
    charts.ohlcv(pool, "1h", 20, { token: pool }),
    (e) => e.code === "TOKEN_MISMATCH",
  );
  await assert.rejects(
    fixture({ meta: { chain: "ethereum" } }).charts.ohlcv(pool, "1h"),
    (e) => e.code === "POOL_MISMATCH",
  );
});
test("unavailable minute/history/trade sources fail explicitly rather than inventing records", async () => {
  const { charts } = fixture();
  await assert.rejects(
    charts.ohlcv(pool, "5m"),
    (e) => e.code === "HISTORY_PLAN_REQUIRED",
  );
  await assert.rejects(
    charts.ohlcv(pool, "1h", 20, {
      before: Math.floor(Date.now() / 1000) - 48 * 3600,
    }),
    (e) => e.code === "HISTORY_WINDOW",
  );
  await assert.rejects(
    charts.trades(pool),
    (e) => e.code === "TRADES_SOURCE_REQUIRED",
  );
  await assert.rejects(
    fixture({ rows: [] }).charts.ohlcv(pool, "1h"),
    (e) => e.code === "NO_CANDLES",
  );
});
test("new-pool fallback uses current pool search, labels its delay and preserves Solana mint case", async () => {
  const { charts, calls } = fixture({
    pools: [
      {
        id: pool,
        chain: "solana",
        tokens: [{ id: sol }, { id: usdc }],
        created_at: "2026-11-15T10:00:00Z",
        liquidity_usd: 10,
        volume_usd_24h: 20,
      },
      { id: pool, chain: "ethereum" },
    ],
  });
  const r = await charts.newPools(2);
  assert.equal(r.source, "DexPaprika");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].poolAddress, pool);
  assert.equal(r.items[0].baseMint, sol);
  assert.match(r.warning, /newest hour/);
  assert.equal(
    calls
      .find((u) => u.pathname.endsWith("/search"))
      .searchParams.get("order_by"),
    "created_at",
  );
});
