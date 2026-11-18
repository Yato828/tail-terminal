import {
  Cache,
  fetchJSON,
  solAddress,
  boundedInt,
  assert,
  now,
  HttpError,
} from "./core.js";
import { PaprikaHistory } from "./paprika-history.js";
import { CandleHistory } from "./candle-history.js";
const GECKO = "https://api.geckoterminal.com/api/v2/";
const TIMEFRAMES = {
  "1m": ["minute", 1],
  "5m": ["minute", 5],
  "15m": ["minute", 15],
  "1h": ["hour", 1],
  "4h": ["hour", 4],
  "12h": ["hour", 12],
  "1d": ["day", 1],
};
export class Charts {
  constructor({ fetchImpl = fetch } = {}) {
    this.fetchImpl = fetchImpl;
    this.cache = new Cache();
    this.paprika = new PaprikaHistory({ fetchImpl });
    this.candle = new CandleHistory({ fetchImpl });
    this.blockedUntil = 0;
  }
  async gecko(url) {
    if (Date.now() < this.blockedUntil)
      throw new HttpError(
        503,
        "SOURCE_RESTRICTED",
        "GeckoTerminal is temporarily unavailable",
      );
    try {
      return await fetchJSON(url, {
        headers: { accept: "application/json;version=20230203" },
        fetchImpl: this.fetchImpl,
        timeoutMs: 2500,
      });
    } catch (e) {
      if ([401, 403, 429].includes(e.details?.upstreamStatus))
        this.blockedUntil = Date.now() + 60000;
      throw e;
    }
  }
  async ohlcv(
    pool,
    interval = "1m",
    limit = 150,
    { token = "base", before } = {},
  ) {
    pool = solAddress(pool);
    assert(
      TIMEFRAMES[interval],
      400,
      "BAD_TIMEFRAME",
      "Supported: " + Object.keys(TIMEFRAMES).join(", "),
    );
    limit = boundedInt(limit, 150, 1, 500);
    const [timeframe, aggregate] = TIMEFRAMES[interval];
    const url = new URL(
      `networks/solana/pools/${pool}/ohlcv/${timeframe}`,
      GECKO,
    );
    url.searchParams.set("aggregate", String(aggregate));
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("currency", "usd");
    if (token !== "base" && token !== "quote") solAddress(token);
    url.searchParams.set("token", token);
    if (before != null) {
      assert(
        Number.isInteger(Number(before)) && Number(before) > 0,
        400,
        "BAD_TIMESTAMP",
        "before_timestamp must be positive integer seconds",
      );
      url.searchParams.set("before_timestamp", String(before));
    }
    return this.cache.get(url.toString(), before ? 300000 : 15000, async () => {
      if (token !== "base" && token !== "quote") {
        try {
          return await this.candle.ohlcv(pool, token, interval, limit, before);
        } catch {
          /* Retain pool-based fallbacks if token history is unavailable. */
        }
      }
      try {
        const raw = await this.gecko(url);
        const rows = raw?.data?.attributes?.ohlcv_list || [];
        const candles = rows
          .filter(
            (r) =>
              Array.isArray(r) &&
              r.length >= 6 &&
              r
                .slice(0, 6)
                .every((x) => typeof x === "number" && Number.isFinite(x)) &&
              Number.isInteger(r[0]) &&
              r[0] > 0 &&
              r[1] > 0 &&
              r[2] >= Math.max(r[1], r[3], r[4]) &&
              r[3] > 0 &&
              r[3] <= Math.min(r[1], r[4]) &&
              r[5] >= 0,
          )
          .map((r) => ({
            time: Number(r[0]),
            open: Number(r[1]),
            high: Number(r[2]),
            low: Number(r[3]),
            close: Number(r[4]),
            volumeUsd: Number(r[5]),
          }))
          .sort((a, b) => a.time - b.time);
        assert(
          candles.length,
          502,
          "NO_CANDLES",
          "No valid historical candles returned",
        );
        return {
          pool,
          interval,
          token,
          candles,
          asOf: now(),
          source: "GeckoTerminal",
          live: false,
          scope: "pool",
          volumeUnit: "usd",
          paging: true,
          warning:
            "Indexed historical OHLCV. Not a low-latency live tick stream.",
        };
      } catch {
        return this.paprika.ohlcv(pool, interval, limit, { token, before });
      }
    });
  }
  async newPools(limit = 20) {
    limit = boundedInt(limit, 20, 1, 100);
    const url = new URL("networks/solana/new_pools", GECKO);
    return this.cache.get("newPools:" + limit, 30000, async () => {
      let r;
      try {
        r = await this.gecko(url);
      } catch {
        return this.paprika.newPools(limit);
      }
      return {
        items: (r?.data || []).slice(0, limit).map((x) => ({
          id: x.id,
          poolAddress: x.attributes?.address || null,
          baseMint:
            x.relationships?.base_token?.data?.id?.replace(/^solana_/, "") ||
            null,
          quoteMint:
            x.relationships?.quote_token?.data?.id?.replace(/^solana_/, "") ||
            null,
          name: x.attributes?.name || null,
          poolCreatedAt: x.attributes?.pool_created_at || null,
          reserveUsd:
            x.attributes?.reserve_in_usd != null
              ? Number(x.attributes.reserve_in_usd)
              : null,
          volume24h:
            x.attributes?.volume_usd?.h24 != null
              ? Number(x.attributes.volume_usd.h24)
              : null,
        })),
        asOf: now(),
        source: "GeckoTerminal",
        warning:
          "Indexer-discovered pools, may lag on-chain launch and does not guarantee complete Pump.fun bonding-curve coverage",
      };
    });
  }
  async trades(pool, limit = 20) {
    pool = solAddress(pool);
    limit = boundedInt(limit, 20, 1, 100);
    const url = new URL(`networks/solana/pools/${pool}/trades`, GECKO);
    return this.cache.get("trades:" + pool + ":" + limit, 10000, async () => {
      let r;
      try {
        r = await this.gecko(url);
      } catch {
        throw new HttpError(
          503,
          "TRADES_SOURCE_REQUIRED",
          "Trade history requires an available GeckoTerminal source or a configured paid indexer. Live pool spot is separate from indexed trades.",
        );
      }
      return {
        pool,
        items: (r?.data || []).slice(0, limit).map((x) => ({
          id: x.id,
          hash: x.attributes?.tx_hash || null,
          kind: x.attributes?.kind || null,
          timestamp: x.attributes?.block_timestamp || null,
          volumeUsd:
            x.attributes?.volume_in_usd != null
              ? Number(x.attributes.volume_in_usd)
              : null,
          priceUsd: null,
          fromMint: x.attributes?.from_token_address || null,
          toMint: x.attributes?.to_token_address || null,
          wallet: x.attributes?.tx_from_address || null,
          fromAmount: x.attributes?.from_token_amount ?? null,
          toAmount: x.attributes?.to_token_amount ?? null,
          priceFromUsd:
            x.attributes?.price_from_in_usd != null
              ? Number(x.attributes.price_from_in_usd)
              : null,
          priceToUsd:
            x.attributes?.price_to_in_usd != null
              ? Number(x.attributes.price_to_in_usd)
              : null,
        })),
        source: "GeckoTerminal",
        asOf: now(),
        warning: "Indexer trades, not a complete on-chain swap parser",
      };
    });
  }
}
