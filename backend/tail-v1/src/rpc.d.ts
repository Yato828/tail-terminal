import type {
  WalletSnapshot,
  WalletActivity,
  TxStatus,
} from "../../../src/services/backend/contracts";
export class Rpc {
  constructor(options?: { url?: URL; backup?: URL; fetchImpl?: typeof fetch });
  call(method: string, params: unknown[]): Promise<any>;
  wallet(address: string): Promise<WalletSnapshot>;
  activity(address: string, limit?: unknown): Promise<WalletActivity>;
  txStatus(signature: string): Promise<TxStatus>;
}
