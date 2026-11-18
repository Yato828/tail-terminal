import type {
  PairList,
  TokenResult,
  ProfileList,
} from "../../../src/services/backend/contracts";
export function parseFilters(params: URLSearchParams): Record<string, unknown>;
export class Market {
  constructor(options?: { fetchImpl?: typeof fetch });
  search(q: unknown, limit?: unknown): Promise<PairList>;
  token(mint: string): Promise<TokenResult>;
  profiles(limit?: unknown): Promise<ProfileList>;
  trending(limit?: unknown): Promise<ProfileList>;
  filter(q: unknown, filters: unknown, limit?: unknown): Promise<PairList>;
}
