import { Market, parseFilters } from "../../../backend/tail-v1/src/market.js";
import { Charts } from "../../../backend/tail-v1/src/charts.js";
import { Rpc } from "../../../backend/tail-v1/src/rpc.js";
import { Jupiter } from "../../../backend/tail-v1/src/jupiter.js";
import { isExtension } from "../../lib/env";
import { isSolanaAddress } from "../../lib/validation";
import { WSOL, USDC } from "../../lib/const";
import type { AlertEvent, PriceAlert } from "./contracts";

// The same fixed read-only upstreams as V1; no server process or credential is shipped.
const origins: Record<string, string> = {
  "https://api.dexscreener.com": "/dex",
  "https://api.geckoterminal.com": "/gecko",
  "https://api.dexpaprika.com": "/paprika",
  "https://api.candle.tv": "/candle",
  "https://api.mainnet-beta.solana.com": "/rpc",
  "https://solana-rpc.publicnode.com": "/rpc-backup",
  "https://api.jup.ag": "/jupiter",
};
const publicFetch: typeof fetch = (input, init) => {
  const url = new URL(String(input));
  const prefix = origins[url.origin];
  if (!prefix) throw new Error("Unsupported public market source");
  let path = url.pathname;
  if (prefix === "/rpc" || prefix === "/rpc-backup") path = "";
  if (prefix === "/gecko") path = path.replace(/^\/api\/v2/, "");
  if (prefix === "/candle") path = path.replace(/^\/api\/v1/, "");
  return fetch(typeof window === 'undefined' || isExtension() ? url : prefix + path + url.search, {
    ...init,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
};
const market = new Market({ fetchImpl: publicFetch });
const charts = new Charts({ fetchImpl: publicFetch });
const rpc = new Rpc({
  backup: new URL("https://solana-rpc.publicnode.com"),
  fetchImpl: publicFetch,
});
const jupiter = new Jupiter({ fetchImpl: publicFetch });
const STORE = "tail.browser-data.v1";
type BrowserData = {
  version: 1;
  watchlist: string[];
  alerts: PriceAlert[];
  events: AlertEvent[];
};
function failure(status: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { status, code });
}
function mint(value: unknown): string {
  if (!isSolanaAddress(value))
    failure(400, "BAD_ADDRESS", "Invalid Solana address");
  return value;
}
const id = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
function readStore(): BrowserData {
  const empty: BrowserData = {
    version: 1,
    watchlist: [],
    alerts: [],
    events: [],
  };
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return empty;
    const value = JSON.parse(raw);
    if (
      value.version !== 1 ||
      !Array.isArray(value.watchlist) ||
      !Array.isArray(value.alerts) ||
      !Array.isArray(value.events)
    )
      return empty;
    return {
      version: 1,
      watchlist: value.watchlist.filter(isSolanaAddress).slice(0, 100),
      alerts: value.alerts
        .filter(
          (a: PriceAlert) =>
            a &&
            /^[a-f0-9]{16}$/.test(a.id) &&
            isSolanaAddress(a.mint) &&
            ["above", "below"].includes(a.direction) &&
            Number.isFinite(a.priceUsd) &&
            a.priceUsd > 0 &&
            Number.isFinite(a.createdAt) &&
            typeof a.triggered === "boolean",
        )
        .slice(0, 100),
      events: value.events
        .filter(
          (e: AlertEvent) =>
            e &&
            /^[a-f0-9]{16}$/.test(e.id) &&
            isSolanaAddress(e.mint) &&
            Number.isFinite(e.priceUsd) &&
            e.priceUsd > 0 &&
            Number.isFinite(e.createdAt),
        )
        .slice(0, 200),
    };
  } catch {
    return empty;
  }
}
function save(data: BrowserData) {
  try {
    localStorage.setItem(STORE, JSON.stringify(data));
  } catch {
    failure(
      503,
      "STORAGE_UNAVAILABLE",
      "Browser storage is unavailable. Changes could not be saved.",
    );
  }
}
export function observeBrowserPrice(address: string, price: number) {
  if (!isSolanaAddress(address) || !Number.isFinite(price) || price <= 0)
    return;
  const data = readStore();
  let changed = false;
  for (const a of data.alerts) {
    if (
      a.mint !== address ||
      a.triggered ||
      !(a.direction === "above" ? price >= a.priceUsd : price <= a.priceUsd)
    )
      continue;
    a.triggered = true;
    data.events.unshift({
      id: id(),
      alertId: a.id,
      mint: address,
      direction: a.direction,
      priceUsd: price,
      createdAt: Date.now(),
    });
    changed = true;
  }
  if (changed) {
    data.events = data.events.slice(0, 200);
    save(data);
  }
}

/** V1-compatible browser transport. Ownership is this browser profile, never a wallet identity. */
export async function portableRequest(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  init.signal?.throwIfAborted();
  const url = new URL(path, "https://tail.invalid");
  const p = url.pathname,
    q = url.searchParams,
    method = init.method ?? "GET";
  const time = new Date().toISOString();
  const body = init.body ? JSON.parse(String(init.body)) : {};
  if (method === "GET" && p === "/health")
    return {
      status: "ok",
      service: "TAIL Browser",
      version: "2.0.0",
      tradeExecution: false,
      storage: "browser",
      asOf: time,
    };
  if (method === "GET" && p === "/trade/capabilities")
    return {
      quote: true,
      buyExecution: false,
      sellExecution: false,
      signing: false,
      autotrading: false,
      reason: "Read-only public quotes. No transaction signing in this build.",
    };
  if (p === "/fable/status")
    return {
      configured: false,
      provider: "OpenAI",
      brand: "Fable 5.2",
      model: null,
      liveDataTools: [],
      autoTrade: false,
    };
  if (p === "/fable/chat")
    failure(
      503,
      "AI_NOT_CONFIGURED",
      "Fable 5.2 requires a configured TAIL AI server. Public market tools are available without an account.",
    );
  if (method === "POST" && p === "/session")
    return {
      token: id() + id(),
      notice: "Local browser storage; no wallet ownership or server account.",
    };
  if (p === "/watchlist") {
    const data = readStore();
    if (method === "POST") {
      const address = mint(body.mint);
      data.watchlist = data.watchlist.filter((m) => m !== address);
      if (body.enabled !== false) {
        if (data.watchlist.length >= 100)
          failure(422, "WATCH_LIMIT", "Up to 100 watched tokens");
        data.watchlist.push(address);
      }
      save(data);
    } else if (method !== "GET")
      failure(405, "METHOD_NOT_ALLOWED", "Unsupported watchlist method");
    return { items: data.watchlist, storage: "browser" };
  }
  if (p === "/alerts/events" && method === "GET")
    return { items: readStore().events, storage: "browser" };
  if (p === "/alerts") {
    const data = readStore();
    if (method === "GET") return { items: data.alerts, storage: "browser" };
    if (method !== "POST")
      failure(405, "METHOD_NOT_ALLOWED", "Unsupported alert method");
    if (
      !["above", "below"].includes(body.direction) ||
      !Number.isFinite(body.priceUsd) ||
      body.priceUsd <= 0
    )
      failure(400, "BAD_ALERT", "Set a valid direction and positive USD price");
    if (data.alerts.length >= 100)
      failure(422, "ALERT_LIMIT", "Up to 100 local alerts");
    const alert: PriceAlert = {
      id: id(),
      mint: mint(body.mint),
      direction: body.direction,
      priceUsd: body.priceUsd,
      createdAt: Date.now(),
      triggered: false,
    };
    data.alerts.push(alert);
    save(data);
    return { alert, storage: "browser" };
  }
  const deletion = p.match(/^\/alerts\/([a-f0-9]{16})$/);
  if (deletion && method === "DELETE") {
    const data = readStore();
    data.alerts = data.alerts.filter((a) => a.id !== deletion[1]);
    save(data);
    return { deleted: true };
  }
  if (method !== "GET")
    failure(
      405,
      "METHOD_NOT_ALLOWED",
      "Only read-only public requests are supported",
    );
  if (p === "/market/search")
    return market.search(q.get("q"), q.get("limit") ?? 20);
  if (p === "/market/profiles") return market.profiles(q.get("limit") ?? 20);
  if (p === "/market/trending") return market.trending(q.get("limit") ?? 20);
  if (p === "/market/new-pools") return charts.newPools(q.get("limit") ?? 20);
  if (p === "/market/filter")
    return market.filter(q.get("q"), parseFilters(q), q.get("limit") ?? 20);
  let match = p.match(/^\/market\/token\/([^/]+)$/);
  if (match) {
    const r = await market.token(mint(match[1]));
    if (r.token?.priceUsd) observeBrowserPrice(r.token.mint, r.token.priceUsd);
    return r;
  }
  match = p.match(/^\/market\/pool\/([^/]+)\/(ohlcv|trades)$/);
  if (match)
    return match[2] === "ohlcv"
      ? charts.ohlcv(
          mint(match[1]),
          q.get("interval") ?? "1m",
          q.get("limit") ?? 500,
          {
            token: q.get("token") ?? "base",
            before: q.get("before_timestamp"),
          },
        )
      : charts.trades(mint(match[1]), q.get("limit") ?? 50);
  match = p.match(/^\/wallet\/([^/]+)(\/activity)?$/);
  if (match)
    return match[2]
      ? rpc.activity(mint(match[1]), q.get("limit") ?? 15)
      : rpc.wallet(mint(match[1]));
  match = p.match(/^\/transaction\/([^/]+)$/);
  if (match) return rpc.txStatus(match[1]);
  if (p === "/trade/quote") {
    const output = mint(q.get("outputMint"));
    const quote = await jupiter.quote(
      mint(q.get("inputMint")),
      output,
      q.get("amount") ?? "",
    );
    // Canonical mainnet mints have fixed decimals. Other tokens require observed metadata.
    let outputDecimals: number | null =
      output === USDC ? 6 : output === WSOL ? 9 : null;
    try {
      if (outputDecimals === null) {
        const supply = await rpc.call("getTokenSupply", [output]);
        const d = supply?.value?.decimals;
        if (Number.isInteger(d) && d >= 0 && d <= 18) outputDecimals = d;
      }
    } catch {
      /* Amount remains explicitly atomic. */
    }
    return { ...quote, outputDecimals };
  }
  failure(404, "NOT_FOUND", "Unknown TAIL tool");
}
