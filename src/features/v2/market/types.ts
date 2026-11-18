import type { Evidence } from '../contracts';

export const MARKET_FIELDS = {
  priceUsd: 'number', marketCap: 'number', fdv: 'number', liquidityUsd: 'number',
  volume5m: 'number', volume1h: 'number', volume24h: 'number', change5m: 'number',
  change1h: 'number', change24h: 'number', buys5m: 'number', sells5m: 'number',
  buys24h: 'number', sells24h: 'number', txns24h: 'number', buySellRatio: 'number',
  ageMinutes: 'number', dex: 'string', launchStage: 'string', mintAuthority: 'boolean',
  freezeAuthority: 'boolean', holderConcentration: 'number', devHoldings: 'number',
  verifiedSocial: 'boolean', trackedWalletActivity: 'boolean', tokenProgram: 'string',
  migrationAt: 'number',
} as const;
export type MarketField = keyof typeof MARKET_FIELDS;
export type MarketValue = number | string | boolean;
export type MarketMetadata = { name: string; symbol: string; logo: string | null; website: string | null; twitter: string | null };
export type MarketSnapshot = {
  mint: string;
  poolAddress: string | null;
  metadata: Evidence<MarketMetadata>;
  fields: Record<MarketField, Evidence<MarketValue>>;
  fetchedAt: number;
  warning?: string;
};
export type FilterOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'exists' | 'missing';
export type FilterNode = { logic: 'and' | 'or'; rules: FilterNode[] } | { field: MarketField; op: FilterOperator; value?: MarketValue };
export type FilterResult = 'match' | 'no-match' | 'unknown';
export type FilterPreset = { version: 1; id: string; name: string; filter: FilterNode; sort: { field: MarketField; direction: 'asc' | 'desc' }; signal: boolean };
export type DiscoveryCategory = 'new' | 'migrated' | 'trending' | 'volume' | 'gainers' | 'losers' | 'liquidity' | 'watchlist' | 'custom';
export type DiscoveryResult = { items: MarketSnapshot[]; warning: string; fetchedAt: number; partial: boolean };
