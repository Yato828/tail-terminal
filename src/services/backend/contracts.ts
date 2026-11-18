export type Observation = { source: string; asOf: string; warning?: string };
export type BackendPair = {
  mint: string;
  pairAddress: string;
  symbol: string;
  name: string;
  dex: string;
  quoteMint: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidityUsd: number;
  volume24h: number;
  volume1h: number;
  volume5m: number;
  priceChange24h: number | null;
  priceChange1h: number | null;
  priceChange5m: number | null;
  buys24h?: number | null;
  sells24h?: number | null;
  pairCreatedAt: number | null;
  icon: string | null;
  websites: { url: string }[];
  socials: { type?: string; url: string }[];
};
export type TokenResult = Observation & {
  token: BackendPair | null;
  markets: BackendPair[];
};
export type PairList = Observation & { items: BackendPair[] };
export type Profile = {
  tokenAddress: string;
  chainId: string;
  description?: string;
};
export type ProfileList = Observation & { items: Profile[] };
export type NewPool = {
  poolAddress: string | null;
  baseMint: string | null;
  quoteMint: string | null;
  name: string | null;
  poolCreatedAt: string | null;
  reserveUsd: number | null;
  volume24h: number | null;
};
export type PoolList = Observation & { items: NewPool[] };
export type WalletSnapshot = Observation & {
  address: string;
  lamports: string;
  sol: string;
  tokens: {
    mint: string;
    rawAmount: string;
    decimals: number;
    program: string;
  }[];
  note: string;
};
export type WalletActivity = Observation & {
  address: string;
  signatures: {
    signature: string;
    slot: number;
    err: unknown;
    blockTime: number | null;
    confirmationStatus?: string;
  }[];
  note: string;
};
export type TxStatus = {
  signature: string;
  status: { err: unknown; confirmationStatus?: string; slot?: number } | null;
  asOf: string;
};
export type JupiterQuote = Observation & {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string | null;
  outputDecimals: number | null;
  feeBps: number | null;
  feeMint: string | null;
  router: string | null;
  priceImpactPct: number | null;
  routeAvailable: boolean;
  executable: false;
  createdAt: number;
};
export type Capabilities = {
  quote: boolean;
  buyExecution: false;
  sellExecution: false;
  signing: false;
  autotrading: false;
  reason: string;
};
export type FableStatus = {
  model?: string | null;
  configured: boolean;
  provider: string;
  brand: string;
  liveDataTools: string[];
  autoTrade: false;
};
export type FableResult = {
  answer: string;
  model: string;
  brand: string;
  provider: string;
  toolCalls: number;
  disclaimer: string;
};
export type PriceAlert = {
  id: string;
  mint: string;
  direction: "above" | "below";
  priceUsd: number;
  triggered: boolean;
  createdAt: number;
};
export type AlertEvent = {
  id: string;
  alertId: string;
  mint: string;
  direction: "above" | "below";
  priceUsd: number;
  createdAt: number;
};
export type BackendCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeUsd: number | null;
  volume?: number;
};
export type OhlcvResult = Observation & {
  scope?: "pool" | "token";
  volumeUnit?: "usd" | "token";
  paging?: boolean;
  historyLimited?: boolean;
  pool: string;
  token: string;
  interval: string;
  live: false;
  candles: BackendCandle[];
};
export type PoolTrade = {
  id: string;
  hash: string | null;
  kind: string | null;
  timestamp: string | null;
  volumeUsd: number | null;
  wallet: string | null;
  fromMint: string | null;
  toMint: string | null;
  fromAmount: string | null;
  toAmount: string | null;
  priceFromUsd: number | null;
  priceToUsd: number | null;
};
export type StreamSnapshot = Observation & {
  token: BackendPair | null;
  delivery: "polling";
  pollIntervalMs: number;
};
