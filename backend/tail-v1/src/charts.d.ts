import type {
  OhlcvResult,
  PoolList,
  PoolTrade,
  Observation,
} from "../../../src/services/backend/contracts";
export class Charts {
  constructor(options?: { fetchImpl?: typeof fetch });
  ohlcv(
    pool: string,
    interval?: string,
    limit?: unknown,
    options?: { token?: string; before?: unknown },
  ): Promise<OhlcvResult>;
  newPools(limit?: unknown): Promise<PoolList>;
  trades(
    pool: string,
    limit?: unknown,
  ): Promise<Observation & { pool: string; items: PoolTrade[] }>;
}
