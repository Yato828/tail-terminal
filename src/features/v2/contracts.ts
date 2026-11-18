import type { AxiomCoin, Interval } from '../../lib/axiom';

export type EvidenceStatus = 'ready' | 'stale' | 'unavailable' | 'error';
export type Evidence<T> = {
  value: T | null;
  source: string;
  observedAt: number | null;
  fetchedAt: number;
  status: EvidenceStatus;
  note?: string;
};
export type V2TokenContext = {
  coin: AxiomCoin | null;
  wallet?: string;
  selectMint: (mint: string) => void;
  selectWallet?: (address: string) => void;
};
export type WorkspaceContext = {
  mint: string | null;
  interval: Interval;
  chartMode: string;
  filters: unknown;
  widgets: string[];
  allowPortfolio: boolean;
};
export type WorkspaceAction =
  | { type: 'open_widget'; widget: string }
  | { type: 'set_interval'; interval: Interval }
  | { type: 'search_tokens'; query: string }
  | { type: 'compare_tokens'; mints: string[] }
  | { type: 'save_filter'; name: string; filter: unknown };

// Events carry explicit proposals; the terminal validates them and asks the user
// to apply workspace changes. This channel cannot request wallet signatures.
export const V2_ACTION_EVENT = 'tail:workspace-proposal';
export const V2_MARKET_EVENT = 'tail:market-observation';
