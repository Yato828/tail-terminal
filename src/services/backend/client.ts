import { tailApiBase, tailStandalone } from "./config";
import { isSolanaAddress } from "../../lib/validation";
import type {
  TokenResult,
  PairList,
  ProfileList,
  PoolList,
  WalletSnapshot,
  WalletActivity,
  TxStatus,
  JupiterQuote,
  Capabilities,
  FableStatus,
  FableResult,
  PriceAlert,
  AlertEvent,
  OhlcvResult,
  PoolTrade,
  Observation,
} from "./contracts";
export class TailApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function mintPath(mint: string) {
  if (!isSolanaAddress(mint)) throw new Error("Invalid Solana address");
  return encodeURIComponent(mint);
}
export async function tailRequest<T>(
  path: string,
  init: RequestInit = {},
  timeout = 15000,
): Promise<T> {
  if (tailStandalone()) {
    const { portableRequest } = await import("./portable");
    try {
      return (await portableRequest(path, init)) as T;
    } catch (e) {
      if (e && typeof e === "object" && "status" in e && "code" in e)
        throw new TailApiError(
          Number(e.status),
          String(e.code),
          e instanceof Error ? e.message : "Source unavailable",
        );
      throw e;
    }
  }
  const base = tailApiBase();
  if (!base) throw new Error("TAIL Backend V1 is not enabled.");
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(timeout)])
      : AbortSignal.timeout(timeout),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new TailApiError(
      response.status,
      "INVALID_RESPONSE",
      "TAIL Backend V1 returned a non-JSON response.",
    );
  const data = await response.json();
  if (!response.ok)
    throw new TailApiError(
      response.status,
      data?.error?.code ?? "REQUEST_FAILED",
      data?.error?.message ?? "TAIL backend request failed.",
    );
  return data;
}
const query = (values: Record<string, string | number | undefined>) =>
  new URLSearchParams(
    Object.entries(values)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
export const tailApi = {
  health: () =>
    tailRequest<{
      status: string;
      service: string;
      version: string;
      tradeExecution: false;
      asOf: string;
    }>("/health"),
  search: (q: string, signal?: AbortSignal) =>
    tailRequest<PairList>(`/market/search?${query({ q, limit: 20 })}`, {
      signal,
    }),
  token: (mint: string) =>
    tailRequest<TokenResult>(`/market/token/${mintPath(mint)}`),
  profiles: (limit = 20) =>
    tailRequest<ProfileList>(`/market/profiles?limit=${limit}`),
  trending: (limit = 20) =>
    tailRequest<ProfileList>(`/market/trending?limit=${limit}`),
  newPools: (limit = 20) =>
    tailRequest<PoolList>(`/market/new-pools?limit=${limit}`),
  filter: (filters: Record<string, string | number | undefined>) =>
    tailRequest<PairList>(`/market/filter?${query(filters)}`),
  candles: (pool: string, interval: string, token?: string, before?: number) =>
    tailRequest<OhlcvResult>(
      `/market/pool/${mintPath(pool)}/ohlcv?${query({ interval, limit: 500, token, before_timestamp: before ? Math.floor(before / 1000) : undefined })}`,
    ),
  trades: (pool: string) =>
    tailRequest<Observation & { pool: string; items: PoolTrade[] }>(
      `/market/pool/${mintPath(pool)}/trades?limit=50`,
    ),
  wallet: (wallet: string) =>
    tailRequest<WalletSnapshot>(`/wallet/${mintPath(wallet)}`),
  activity: (wallet: string) =>
    tailRequest<WalletActivity>(
      `/wallet/${mintPath(wallet)}/activity?limit=15`,
    ),
  transaction: (signature: string) => {
    if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature))
      throw new Error("Invalid Solana signature");
    return tailRequest<TxStatus>(
      `/transaction/${encodeURIComponent(signature)}`,
    );
  },
  capabilities: () => tailRequest<Capabilities>("/trade/capabilities"),
  quote: async (inputMint: string, outputMint: string, amount: string) => {
    if (
      !/^[1-9][0-9]{0,19}$/.test(amount) ||
      BigInt(amount) > 18446744073709551615n
    )
      throw new Error("Invalid atomic amount");
    mintPath(inputMint);
    mintPath(outputMint);
    const q = await tailRequest<JupiterQuote>(
      `/trade/quote?${query({ inputMint, outputMint, amount })}`,
      {},
      25000,
    );
    if (
      q.inputMint !== inputMint ||
      q.outputMint !== outputMint ||
      q.inAmount !== amount ||
      q.executable !== false ||
      !q.routeAvailable ||
      !q.outAmount ||
      !/^\d+$/.test(q.outAmount) ||
      BigInt(q.outAmount) <= 0n
    )
      throw new Error(
        "Jupiter returned an invalid or mismatched read-only quote.",
      );
    // Explicit allowlist: transaction/requestId/provider extras must never reach an execution path.
    return {
      source: q.source,
      asOf: q.asOf,
      inputMint,
      outputMint,
      inAmount: amount,
      outAmount: q.outAmount,
      outputDecimals:
        Number.isInteger(q.outputDecimals) &&
        q.outputDecimals !== null &&
        q.outputDecimals >= 0 &&
        q.outputDecimals <= 18
          ? q.outputDecimals
          : null,
      feeBps: q.feeBps,
      feeMint: q.feeMint,
      router: q.router,
      priceImpactPct: q.priceImpactPct,
      routeAvailable: true,
      executable: false as const,
      warning: q.warning,
      createdAt: Date.now(),
    };
  },
  fableStatus: (signal?: AbortSignal) =>
    tailRequest<FableStatus>("/fable/status", { signal }),
  chat: (
    message: string,
    context: { mint?: string },
    history: { role: string; content: string }[],
    signal?: AbortSignal,
  ) =>
    tailRequest<FableResult>(
      "/fable/chat",
      {
        method: "POST",
        body: JSON.stringify({ message, context, history }),
        signal,
      },
      150000,
    ),
};
let pendingSession: Promise<string> | undefined;
const sessionKey = () => `tail.backend.session:${tailApiBase()}`;
function readSession() {
  try {
    return sessionStorage.getItem(sessionKey()) ?? "";
  } catch {
    return "";
  }
}
async function session() {
  const existing = readSession();
  if (existing) return existing;
  if (!pendingSession)
    pendingSession = tailRequest<{ token: string }>("/session", {
      method: "POST",
    })
      .then((r) => {
        if (!/^[a-zA-Z0-9_-]{25,128}$/.test(r.token))
          throw new Error("Invalid anonymous session");
        try {
          sessionStorage.setItem(sessionKey(), r.token);
        } catch {}
        return r.token;
      })
      .finally(() => {
        pendingSession = undefined;
      });
  return pendingSession;
}
async function authenticated<T>(path: string, init: RequestInit = {}) {
  const token = await session();
  try {
    return await tailRequest<T>(path, {
      ...init,
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    if (e instanceof TailApiError && e.status === 401) {
      try {
        sessionStorage.removeItem(sessionKey());
      } catch {}
    }
    throw e;
  }
}
export const tailSession = {
  watchlist: () => authenticated<{ items: string[] }>("/watchlist"),
  watch: (mint: string, enabled: boolean) => {
    mintPath(mint);
    return authenticated<{ items: string[] }>("/watchlist", {
      method: "POST",
      body: JSON.stringify({ mint, enabled }),
    });
  },
  alerts: () => authenticated<{ items: PriceAlert[] }>("/alerts"),
  createAlert: (
    mint: string,
    direction: "above" | "below",
    priceUsd: number,
  ) => {
    mintPath(mint);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0)
      throw new Error("Invalid alert price");
    return authenticated<{ alert: PriceAlert }>("/alerts", {
      method: "POST",
      body: JSON.stringify({ mint, direction, priceUsd }),
    });
  },
  events: () => authenticated<{ items: AlertEvent[] }>("/alerts/events"),
  deleteAlert: (id: string) => {
    if (!/^[a-f0-9]{16}$/.test(id)) throw new Error("Invalid alert ID");
    return authenticated<{ deleted: boolean }>(`/alerts/${id}`, {
      method: "DELETE",
    });
  },
};
export function formatAtomic(raw: string, decimals: number | null): string {
  if (!/^\d+$/.test(raw)) throw new Error("Invalid atomic quantity");
  if (
    decimals === null ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 255
  )
    return `${raw} atomic units`;
  const padded = raw.padStart(decimals + 1, "0");
  const whole = decimals ? padded.slice(0, -decimals) : padded;
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, "") : "";
  return `${BigInt(whole).toLocaleString("en-US")}${fraction ? "." + fraction : ""}`;
}
