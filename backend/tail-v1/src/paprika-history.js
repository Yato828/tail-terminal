import { Cache, fetchJSON, solAddress, assert, now } from "./core.js";

const ROOT = "https://api.dexpaprika.com/networks/solana/";
const HOUR = 3600;
const PERIOD = {
  "1h": HOUR,
  "4h": 4 * HOUR,
  "12h": 12 * HOUR,
  "1d": 24 * HOUR,
};
const valid = (c) =>
  [c.time, c.open, c.high, c.low, c.close, c.volumeUsd].every(
    Number.isFinite,
  ) &&
  Number.isInteger(c.time) &&
  c.time > 0 &&
  c.low > 0 &&
  c.high >= Math.max(c.open, c.low, c.close) &&
  c.low <= Math.min(c.open, c.close) &&
  c.volumeUsd >= 0;

// Aggregate only observed hourly records. Never fill missing intervals or invent volume.
export function aggregateHistory(rows, seconds) {
  const candles = new Map();
  for (const c of [...rows].filter(valid).sort((a, b) => a.time - b.time)) {
    const time = Math.floor(c.time / seconds) * seconds,
      previous = candles.get(time);
    candles.set(
      time,
      previous
        ? {
            time,
            open: previous.open,
            high: Math.max(previous.high, c.high),
            low: Math.min(previous.low, c.low),
            close: c.close,
            volumeUsd: previous.volumeUsd + c.volumeUsd,
          }
        : { ...c, time },
    );
  }
  return [...candles.values()];
}
export class PaprikaHistory {
  constructor({ fetchImpl = fetch } = {}) {
    this.fetchImpl = fetchImpl;
    this.cache = new Cache();
  }
  get(path) {
    return fetchJSON(new URL(path, ROOT), {
      fetchImpl: this.fetchImpl,
      timeoutMs: 3000,
    });
  }
  async ohlcv(pool, interval, limit, { token = "base", before } = {}) {
    assert(
      PERIOD[interval],
      503,
      "HISTORY_PLAN_REQUIRED",
      "Minute candles require an available GeckoTerminal source or an indexer API key. Select 1h for keyless DexPaprika history.",
    );
    return this.cache.get(
      `history:${pool}:${interval}:${token}:${before ?? ""}:${limit}`,
      60000,
      async () => {
        const meta = await this.cache.get(`pool:${pool}`, 300000, () =>
          this.get(`pools/${pool}`),
        );
        assert(
          meta.id === pool && meta.chain === "solana",
          502,
          "POOL_MISMATCH",
          "Historical pool identity does not match Solana selection",
        );
        const base = solAddress(meta.base_token_id ?? meta.tokens?.[0]?.id),
          quote = solAddress(meta.quote_token_id ?? meta.tokens?.[1]?.id);
        const mint =
          token === "base" ? base : token === "quote" ? quote : token;
        assert(
          mint === base || mint === quote,
          502,
          "TOKEN_MISMATCH",
          "Selected mint is not a token in this pool",
        );
        const current = Date.now() / 1000,
          start = Math.floor(current / HOUR) * HOUR - 23 * HOUR,
          end = Math.min(Number(before) || current, current);
        assert(
          end > start,
          503,
          "HISTORY_WINDOW",
          "Keyless history covers the last 24 hours. Older history requires an indexer API key.",
        );
        const qs = new URLSearchParams({
          start: new Date(start * 1000).toISOString(),
          end: new Date(end * 1000).toISOString(),
          interval: "1h",
          limit: "24",
          inversed: String(mint === quote),
        });
        // Share one hourly request across 1h / 4h / 12h / 1d views.
        const raw = await this.cache.get(
          `hours:${pool}:${mint}:${before ?? ""}`,
          60000,
          async () => ({ rows: await this.get(`pools/${pool}/ohlcv?${qs}`) }),
        );
        assert(
          Array.isArray(raw.rows),
          502,
          "BAD_HISTORY",
          "Invalid hourly history response",
        );
        const observed = new Map();
        for (const r of raw.rows) {
          const c = {
            time: Date.parse(r.time_open) / 1000,
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            volumeUsd: r.volume,
          };
          if (
            valid(c) &&
            c.time >= start &&
            c.time <= current &&
            (!before || c.time < Number(before))
          )
            observed.set(c.time, c);
        }
        const candles = aggregateHistory(
          [...observed.values()],
          PERIOD[interval],
        ).slice(-limit);
        assert(
          candles.length,
          502,
          "NO_CANDLES",
          "No valid hourly candles for this pool in the last 24 hours",
        );
        return {
          pool,
          token,
          interval,
          candles,
          asOf: now(),
          source: "DexPaprika",
          live: false,
          historyLimited: true,
          warning:
            "GeckoTerminal unavailable. Real DexPaprika USD history, last 24h only. Larger intervals aggregate observed hourly records; edge candles may be partial. Source refresh: 60s; live pool spot is separate.",
        };
      },
    );
  }
  async newPools(limit) {
    return this.cache.get(`new:${limit}`, 60000, async () => {
      const raw = await this.get(
        `pools/search?order_by=created_at&sort=desc&limit=${limit}`,
      );
      assert(
        Array.isArray(raw.results),
        502,
        "BAD_POOLS",
        "Invalid pool discovery response",
      );
      const items = raw.results
        .filter((p) => p.chain === "solana")
        .flatMap((p) => {
          try {
            const poolAddress = solAddress(p.id),
              tokens = p.tokens ?? [];
            const base = solAddress(p.base_token_id ?? tokens[0]?.id),
              quote = solAddress(p.quote_token_id ?? tokens[1]?.id);
            // Prefer the tradable mint over SOL/USDC when the provider lists a quote asset first.
            const isQuote = (m) =>
              [
                "So11111111111111111111111111111111111111112",
                "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
              ].includes(m);
            return [
              {
                id: `solana_${poolAddress}`,
                poolAddress,
                baseMint: isQuote(base) && !isQuote(quote) ? quote : base,
                quoteMint: isQuote(base) && !isQuote(quote) ? base : quote,
                name: tokens
                  .map((t) => t.symbol ?? `${t.id.slice(0, 6)}…`)
                  .join(" / "),
                poolCreatedAt: p.created_at ?? null,
                reserveUsd: Number.isFinite(p.liquidity_usd)
                  ? p.liquidity_usd
                  : null,
                volume24h: Number.isFinite(p.volume_usd_24h)
                  ? p.volume_usd_24h
                  : null,
              },
            ];
          } catch {
            return [];
          }
        })
        .slice(0, limit);
      return {
        items,
        source: "DexPaprika",
        asOf: now(),
        warning:
          "Recently indexed Solana pools. Keyless discovery excludes the newest hour; not a complete launch feed.",
      };
    });
  }
}
