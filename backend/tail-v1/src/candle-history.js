import { Cache, fetchJSON, solAddress, assert, now } from "./core.js";
const ROOT = "https://api.candle.tv/api/v1/markets/solana/";
const INTERVALS = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);
/** Public, documented token-wide USD OHLC. Volume units are preserved, never estimated as USD. */
export class CandleHistory {
  constructor({ fetchImpl = fetch } = {}) {
    this.fetchImpl = fetchImpl;
    this.cache = new Cache();
  }
  async ohlcv(pool, token, interval, limit, before) {
    solAddress(token);
    assert(
      INTERVALS.has(interval),
      400,
      "BAD_TIMEFRAME",
      "Unsupported candle interval",
    );
    const qs = new URLSearchParams({ interval, limit: String(limit) });
    if (before) qs.set("to", String(before));
    return this.cache
      .get(
        `${token}:${interval}:${limit}:${before ?? ""}`,
        before ? 300000 : 15000,
        async () => {
          const raw = await fetchJSON(new URL(`${token}/candles?${qs}`, ROOT), {
            fetchImpl: this.fetchImpl,
            timeoutMs: 4500,
          });
          assert(
            raw?.success === true &&
              raw.chain === "solana" &&
              raw.mint === token &&
              raw.interval === interval,
            502,
            "CANDLE_MISMATCH",
            "Token history identity does not match the selected Solana mint",
          );
          assert(
            ["birdeye", "candle"].includes(raw.source) &&
              ["usd", "token"].includes(raw.volumeUnit) &&
              Array.isArray(raw.candles),
            502,
            "BAD_HISTORY",
            "Unknown candle source or volume denomination",
          );
          const candles = new Map();
          const end = before ?? Math.floor(Date.now() / 1000);
          for (const r of raw.candles) {
            if (
              !r ||
              ![r.time, r.open, r.high, r.low, r.close, r.volume].every(
                (x) => typeof x === "number" && Number.isFinite(x),
              ) ||
              !Number.isInteger(r.time) ||
              r.time <= 0 ||
              r.time > end ||
              r.low <= 0 ||
              r.low > Math.min(r.open, r.close) ||
              r.high < Math.max(r.open, r.low, r.close) ||
              r.volume < 0
            )
              continue;
            candles.set(r.time, {
              time: r.time,
              open: r.open,
              high: r.high,
              low: r.low,
              close: r.close,
              volume: r.volume,
              volumeUsd: raw.volumeUnit === "usd" ? r.volume : null,
            });
          }
          assert(
            !raw.candles.length || candles.size > 0,
            502,
            "BAD_HISTORY",
            "No valid indexed candles",
          );
          assert(
            before || candles.size > 0,
            502,
            "NO_CANDLES",
            "No current indexed candles for this mint",
          );
          return {
            pool,
            token,
            interval,
            candles: [...candles.values()]
              .sort((a, b) => a.time - b.time)
              .slice(-limit),
            source: raw.source === "birdeye" ? "Candle / Birdeye" : "Candle",
            asOf: now(),
            live: false,
            scope: "token",
            volumeUnit: raw.volumeUnit,
            paging: true,
            historyLimited: false,
            warning:
              "Indexed USD history for the selected token across venues. " +
              (raw.volumeUnit === "token"
                ? "Volume is in token units, not USD. "
                : "Volume is in USD. ") +
              "Gaps are preserved. Pool spot is separate; coverage depends on the indexer.",
          };
        },
      )
      .then((r) => ({ ...r, pool }));
  }
}
