import type { AxiomCoin } from '../../../lib/axiom';
import { isSolanaAddress, readLocal, saveLocal } from '../../../lib/validation';
import type { Evidence } from '../contracts';
import { getMarketSnapshot } from '../market/snapshot';
import type { MarketSnapshot } from '../market/types';
import type { SecurityReport } from './security';

type MemoryField = 'priceUsd' | 'liquidityUsd' | 'marketCap' | 'volume24h';
export type TokenSnapshot = {
  id: string; mint: string; symbol: string; savedAt: number; source: string;
  observedAt: number | null; marketFetchedAt: number | null; securityFetchedAt: number | null;
  priceUsd: number | null; liquidityUsd: number | null; marketCap: number | null; volume24h: number | null;
  holderConcentrationPct: number | null; holderSource: string | null;
  holderObservedAt: number | null; holderFetchedAt: number | null;
  /** Optional in pre-V2 snapshots; original evidence dates survive local saves. */
  marketEvidence?: Record<MemoryField, Evidence<number>>;
};
const KEY = 'tail.v2.token-memory';
const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
const fields: MemoryField[] = ['priceUsd', 'liquidityUsd', 'marketCap', 'volume24h'];
function parseEvidence(raw: unknown): Evidence<number> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Evidence<number>>;
  if (typeof r.source !== 'string' || finite(r.fetchedAt) === null || !['ready', 'stale', 'unavailable', 'error'].includes(r.status ?? '')) return null;
  const value = finite(r.value);
  return { value, source: r.source.slice(0, 160), fetchedAt: r.fetchedAt!, observedAt: finite(r.observedAt), status: value === null && r.status === 'ready' ? 'unavailable' : r.status!, ...(typeof r.note === 'string' ? { note: r.note.slice(0, 500) } : {}) };
}
export function listTokenSnapshots(mint?: string): TokenSnapshot[] {
  return readLocal(KEY, raw => Array.isArray(raw) ? raw.flatMap((r): TokenSnapshot[] => {
    if (!r || !isSolanaAddress(r.mint) || typeof r.id !== 'string' || !Number.isFinite(r.savedAt) || typeof r.symbol !== 'string') return [];
    const evidence = Object.fromEntries(fields.map(k => [k, parseEvidence(r.marketEvidence?.[k])]));
    const hasEvidence = fields.every(k => evidence[k] !== null);
    return [{ id: r.id.slice(0, 160), mint: r.mint, symbol: r.symbol.slice(0, 32), savedAt: r.savedAt, source: typeof r.source === 'string' ? r.source.slice(0, 160) : 'Unknown source', observedAt: finite(r.observedAt), marketFetchedAt: finite(r.marketFetchedAt), securityFetchedAt: finite(r.securityFetchedAt), priceUsd: finite(r.priceUsd), liquidityUsd: finite(r.liquidityUsd), marketCap: finite(r.marketCap), volume24h: finite(r.volume24h), holderConcentrationPct: finite(r.holderConcentrationPct), holderSource: typeof r.holderSource === 'string' ? r.holderSource.slice(0, 80) : null, holderObservedAt: finite(r.holderObservedAt), holderFetchedAt: finite(r.holderFetchedAt), ...(hasEvidence ? { marketEvidence: evidence as Record<MemoryField, Evidence<number>> } : {}) }];
  }).slice(-240) : [], []).filter(r => !mint || r.mint === mint);
}
/** Legacy normalized AxiomCoin numbers are deliberately not market evidence. */
export function captureTokenSnapshot(coin: AxiomCoin, security?: SecurityReport | null, _legacyMarketFetchedAt: number | null = null, market?: MarketSnapshot | null): TokenSnapshot {
  if (!isSolanaAddress(coin.address)) throw new Error('Invalid Solana mint');
  if (market && market.mint !== coin.address) throw new Error('Market snapshot does not match selected Solana mint');
  const savedAt = Date.now();
  const relevant = security?.mint === coin.address ? security : null;
  const concentration = relevant?.checks.find(c => c.key === 'concentration')?.evidence;
  const marketEvidence = Object.fromEntries(fields.map(key => {
    const e = market?.fields[key];
    const value = e && e.status !== 'error' && e.status !== 'unavailable' ? finite(e.value) : null;
    return [key, e ? { ...e, value, status: value === null && e.status === 'ready' ? 'unavailable' : e.status } : { value: null, source: 'Unavailable', observedAt: null, fetchedAt: savedAt, status: 'unavailable', note: 'Raw market evidence unavailable; legacy normalized values are not used.' }];
  })) as Record<MemoryField, Evidence<number>>;
  const sourceEvidence = marketEvidence.priceUsd;
  const s: TokenSnapshot = {
    id: `${coin.address}:${savedAt}:${Math.random().toString(36).slice(2, 7)}`, mint: coin.address,
    symbol: market?.metadata.value?.symbol || coin.symbol, savedAt,
    source: market ? sourceEvidence.source : 'Unavailable raw market evidence',
    observedAt: market ? sourceEvidence.observedAt : null, marketFetchedAt: market ? sourceEvidence.fetchedAt : null,
    securityFetchedAt: relevant?.fetchedAt ?? null,
    priceUsd: marketEvidence.priceUsd.value, liquidityUsd: marketEvidence.liquidityUsd.value,
    marketCap: marketEvidence.marketCap.value, volume24h: marketEvidence.volume24h.value,
    holderConcentrationPct: finite(concentration?.value), holderSource: relevant?.holders?.source ?? null,
    holderObservedAt: relevant?.holders?.observedAt ?? null, holderFetchedAt: relevant?.holders?.fetchedAt ?? null,
    marketEvidence,
  };
  if (!saveLocal(KEY, [...listTokenSnapshots(), s].slice(-240))) throw new Error('Browser storage unavailable or full; snapshot was not saved');
  return s;
}
/** Bounded shared raw-market request; provider failure saves explicit unknowns. */
export async function collectTokenSnapshot(coin: AxiomCoin, security?: SecurityReport | null, force = false, isCurrent: () => boolean = () => true): Promise<TokenSnapshot> {
  let market: MarketSnapshot | null = null;
  try { market = await getMarketSnapshot(coin.address, { force }); } catch { /* Null evidence remains unavailable, never a normalized zero. */ }
  if (!isCurrent()) throw new Error('Snapshot collection cancelled after context or storage changed');
  return captureTokenSnapshot(coin, security, null, market);
}
export function deleteTokenSnapshot(id: string) {
  if (!saveLocal(KEY, listTokenSnapshots().filter(s => s.id !== id))) throw new Error('Snapshot deletion could not be saved');
}
export function compareTokenSnapshots(a: TokenSnapshot, b: TokenSnapshot) {
  if (a.mint !== b.mint) throw new Error('Compare snapshots of the same Solana mint');
  return (['priceUsd', 'liquidityUsd', 'marketCap', 'volume24h', 'holderConcentrationPct'] as const).map(key => ({ key, from: a[key], to: b[key], delta: a[key] !== null && b[key] !== null ? b[key]! - a[key]! : null, changePct: a[key] !== null && a[key] !== 0 && b[key] !== null ? (b[key]! - a[key]!) / a[key]! * 100 : null }));
}
