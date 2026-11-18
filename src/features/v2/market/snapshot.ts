import { getJson } from '../../../lib/http';
import { isSolanaAddress } from '../../../lib/validation';
import { loadCandleResult, type Interval } from '../../../lib/axiom';
import type { Evidence } from '../contracts';
import { V2_MARKET_EVENT } from '../contracts';
import type { SpotTick, StreamStatus } from '../../../lib/poolStream';
import { cachedMarketRequest, peekMarketCache, storeMarketCache, MARKET_TTL } from './cache';
import { MARKET_FIELDS, type MarketField, type MarketMetadata, type MarketSnapshot, type MarketValue } from './types';

// Raw public rows retain null/absent values that the legacy view normalizer coerces to zero.
export type SourcePair = {
  chainId?: string; pairAddress?: string; dexId?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: unknown; marketCap?: unknown; fdv?: unknown; pairCreatedAt?: unknown;
  liquidity?: { usd?: unknown }; volume?: { m5?: unknown; h1?: unknown; h24?: unknown };
  priceChange?: { m5?: unknown; h1?: unknown; h24?: unknown };
  txns?: { m5?: { buys?: unknown; sells?: unknown }; h24?: { buys?: unknown; sells?: unknown } };
  info?: { imageUrl?: string; websites?: { url?: string }[]; socials?: { type?: string; url?: string }[] };
};
const SOURCE = 'DexScreener · Solana pool snapshot';
const finite = (value: unknown) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : null;
const positive = (v: unknown) => { const n = finite(v); return n !== null && n > 0 ? n : null; };
const nonnegative = (v: unknown) => { const n = finite(v); return n !== null && n >= 0 ? n : null; };
const count = (v: unknown) => { const n = nonnegative(v); return n !== null && Number.isSafeInteger(n) ? n : null; };
function evidence<T>(value: T | null, fetchedAt: number, source = SOURCE, note?: string): Evidence<T> {
  return { value, source, fetchedAt, observedAt: null, status: value === null ? 'unavailable' : 'ready', note: note ?? 'Provider event timestamp unavailable; fetch time is not an on-chain timestamp.' };
}
export function snapshotFromPair(mint: string, pair: SourcePair | null, fetchedAt = Date.now()): MarketSnapshot {
  if (!isSolanaAddress(mint)) throw new Error('Invalid Solana mint');
  if (pair && (pair.chainId !== 'solana' || pair.baseToken?.address !== mint || !isSolanaAddress(pair.pairAddress))) throw new Error('Mismatched Solana source pair');
  const fields = Object.fromEntries(Object.keys(MARKET_FIELDS).map(field => [field, evidence<MarketValue>(null, fetchedAt, 'Unavailable', 'No verified source is connected for this field.')])) as MarketSnapshot['fields'];
  const put = (field: MarketField, value: MarketValue | null, note?: string) => { fields[field] = evidence(value, fetchedAt, SOURCE, note); };
  if (pair) {
    put('priceUsd', positive(pair.priceUsd)); put('marketCap', nonnegative(pair.marketCap)); put('fdv', nonnegative(pair.fdv)); put('liquidityUsd', nonnegative(pair.liquidity?.usd));
    for (const [key, source] of [['volume5m', 'm5'], ['volume1h', 'h1'], ['volume24h', 'h24']] as const) put(key, nonnegative(pair.volume?.[source]));
    for (const [key, source] of [['change5m', 'm5'], ['change1h', 'h1'], ['change24h', 'h24']] as const) put(key, finite(pair.priceChange?.[source]));
    put('buys5m', count(pair.txns?.m5?.buys)); put('sells5m', count(pair.txns?.m5?.sells)); put('buys24h', count(pair.txns?.h24?.buys)); put('sells24h', count(pair.txns?.h24?.sells));
    const buys = fields.buys24h.value, sells = fields.sells24h.value;
    put('txns24h', typeof buys === 'number' && typeof sells === 'number' ? buys + sells : null, 'Derived from provider 24h buy and sell counts.');
    put('buySellRatio', typeof buys === 'number' && typeof sells === 'number' && sells > 0 ? buys / sells : null, '24h buys / sells. Zero sells makes the ratio undefined.');
    const createdAt = positive(pair.pairCreatedAt);
    put('ageMinutes', createdAt !== null && createdAt <= fetchedAt ? (fetchedAt - createdAt) / 60000 : null, 'Pool age from provider pairCreatedAt; this is not token mint or launch age.');
    put('dex', typeof pair.dexId === 'string' && pair.dexId ? pair.dexId.slice(0, 80) : null);
  }
  const metadata = pair ? { name: String(pair.baseToken?.name ?? '').slice(0, 120), symbol: String(pair.baseToken?.symbol ?? '').slice(0, 40), logo: pair.info?.imageUrl ?? null, website: pair.info?.websites?.[0]?.url ?? null, twitter: pair.info?.socials?.find(s => s.type === 'twitter')?.url ?? null } : null;
  return { mint, poolAddress: pair?.pairAddress ?? null, metadata: evidence<MarketMetadata>(metadata, fetchedAt), fields, fetchedAt, warning: pair ? undefined : 'No indexed Solana pool found for this mint.' };
}
export function markSnapshotStale(snapshot: MarketSnapshot, warning?: string): MarketSnapshot {
  return { ...snapshot, warning: warning ?? snapshot.warning, fields: Object.fromEntries(Object.entries(snapshot.fields).map(([k, v]) => {
    const ttl=['mintAuthority','freezeAuthority','tokenProgram','holderConcentration'].includes(k)?30000:MARKET_TTL.price;
    const failedSource=!!warning&&v.source.startsWith('DexScreener');
    return[k,{...v,status:v.value!==null&&(failedSource||Date.now()-v.fetchedAt>=ttl)?'stale':v.status}];
  })) as MarketSnapshot['fields'] };
}
export function sourcePairs(body: unknown): SourcePair[] {
  const rows = Array.isArray(body) ? body : (body && typeof body === 'object' && 'pairs' in body ? (body as { pairs: unknown }).pairs ?? [] : null);
  if (!Array.isArray(rows)) throw new Error('Invalid DexScreener source response');
  return rows.filter((p): p is SourcePair => !!p && p.chainId === 'solana' && isSolanaAddress(p.baseToken?.address) && isSolanaAddress(p.pairAddress));
}
export function snapshotsFromPairs(pairs: SourcePair[], fetchedAt = Date.now()): MarketSnapshot[] {
  const best = new Map<string, SourcePair>();
  for (const p of sourcePairs(pairs)) { const mint = p.baseToken!.address!, old = best.get(mint); if (!old || (nonnegative(p.liquidity?.usd) ?? -1) > (nonnegative(old.liquidity?.usd) ?? -1)) best.set(mint, p); }
  return [...best].map(([mint, pair]) => snapshotFromPair(mint, pair, fetchedAt));
}
export async function getMarketSnapshot(mint: string, options: { force?: boolean } = {}): Promise<MarketSnapshot> {
  if (!isSolanaAddress(mint)) throw new Error('Invalid Solana mint');
  const snapshot = await cachedMarketRequest('price', mint, SOURCE, async () => {
    const body = await getJson<unknown>(`/dex/token-pairs/v1/solana/${mint}`, 12000);
    const result = snapshotsFromPairs(sourcePairs(body).filter(p => p.baseToken?.address === mint))[0] ?? snapshotFromPair(mint, null);
    const metadata = peekMarketCache<Evidence<MarketMetadata>>('metadata', mint);
    if (metadata && Date.now() - metadata.at < MARKET_TTL.metadata) result.metadata = metadata.value;
    else if (result.metadata.value) storeMarketCache('metadata', mint, result.metadata);
    return result;
  }, options.force);
  return mergeEnrichment(Date.now() - snapshot.fetchedAt > MARKET_TTL.price ? markSnapshotStale(snapshot) : snapshot);
}
const CHAIN_FIELDS = ['mintAuthority','freezeAuthority','tokenProgram','holderConcentration'] as const;
function mergeEnrichment(snapshot:MarketSnapshot):MarketSnapshot{
 const cached=peekMarketCache<Partial<MarketSnapshot['fields']>>('chain',snapshot.mint);
 if(!cached)return snapshot;
 const fields={...snapshot.fields};
 for(const key of CHAIN_FIELDS){const reading=cached.value[key];if(reading&&reading.value!==null)fields[key]={...reading,status:Date.now()-reading.fetchedAt>=MARKET_TTL.chain?'stale':reading.status};}
 return{...snapshot,fields};
}
/** Publishes only explicit verified mint/holder evidence to existing consumers.
 * It does not refresh the age of market price, liquidity or volume. */
export function publishMintEvidence(snapshot:MarketSnapshot){
 if(!isSolanaAddress(snapshot.mint))return;
 const fields:Partial<MarketSnapshot['fields']>={};
 for(const key of CHAIN_FIELDS){const reading=snapshot.fields[key];if(reading?.value!==null&&reading?.status==='ready')fields[key]={...reading};}
 storeMarketCache('chain',snapshot.mint,fields);
 const existing=channels.get(snapshot.mint)?.snapshot??peekMarketCache<MarketSnapshot>('price',snapshot.mint)?.value;
 if(existing)emit(mergeEnrichment(existing));
}
export async function getMarketSnapshots(mints: string[]): Promise<MarketSnapshot[]> {
  const unique = [...new Set(mints)];
  if (unique.length > 30 || unique.some(m => !isSolanaAddress(m))) throw new Error('Expected up to 30 valid Solana mints');
  if (!unique.length) return [];
  const key = `batch:${[...unique].sort().join(',')}`;
  return cachedMarketRequest('price', key, `${SOURCE} · batch`, async () => {
    const body = await getJson<unknown>(`/dex/tokens/v1/solana/${unique.join(',')}`, 12000);
    const allowed = new Set(unique), rows = snapshotsFromPairs(sourcePairs(body).filter(p => allowed.has(p.baseToken!.address!)));
    rows.forEach(s => storeMarketCache('price', s.mint, s)); return rows;
  });
}
export function loadMarketHistory(mint: string, pool: string, interval: Interval, before?: number) {
  if (!isSolanaAddress(mint) || !isSolanaAddress(pool)) throw new Error('Invalid history context');
  return cachedMarketRequest('history', `${mint}:${pool}:${interval}:${before ?? 'latest'}`, 'Existing OHLCV adapter · measured adapter latency', () => loadCandleResult(pool, interval, mint, before));
}

type Listener = (snapshot: MarketSnapshot) => void;
type Channel = { listeners: Set<Listener>; timer?: ReturnType<typeof setTimeout>; snapshot?: MarketSnapshot; closed: boolean; attempts: number };
const channels = new Map<string, Channel>();
const streamStates = new Map<string, { pool: string; status: StreamStatus; receivedAt: number; lastTickAt: number | null; deliveryLatencyMs: number | null }>();
function emit(snapshot: MarketSnapshot) {
  const channel = channels.get(snapshot.mint); if (channel) { channel.snapshot = snapshot; channel.listeners.forEach(l => l(snapshot)); }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(V2_MARKET_EVENT, { detail: snapshot }));
}
/** Called by the existing chart pool stream. This bridge creates no additional socket. */
export function publishMarketSpot(mint: string, pool: string, tick: SpotTick) {
  if (!isSolanaAddress(mint) || !isSolanaAddress(pool) || !(tick.price > 0) || !Number.isFinite(tick.price) || !Number.isFinite(tick.receivedAt)) return;
  const state = streamStates.get(mint); if (state && state.pool === pool) { state.lastTickAt = tick.receivedAt; state.deliveryLatencyMs = Math.max(0, Date.now() - tick.receivedAt); }
  const current = channels.get(mint)?.snapshot ?? peekMarketCache<MarketSnapshot>('price', mint)?.value;
  if (!current || current.poolAddress !== pool) return;
  const snapshot: MarketSnapshot = { ...current, fields: { ...current.fields, priceUsd: { value: tick.price, source: `${tick.provider} · ${tick.kind} · ${tick.commitment}`, fetchedAt: tick.receivedAt, observedAt: null, status: 'ready', note: `Read-only account PubSub spot; slot ${tick.slot}; received timestamp, block event time unavailable. Volume is not derived from spot.` } } };
  // Pool push never refreshes liquidity, volume or metadata ages.
  emit(snapshot);
}
export function publishMarketStreamStatus(mint: string, pool: string, status: StreamStatus) {
  if (!isSolanaAddress(mint) || !isSolanaAddress(pool)) return;
  const previous = streamStates.get(mint);
  streamStates.set(mint, { pool, status, receivedAt: Date.now(), lastTickAt: previous?.pool === pool ? previous.lastTickAt : null, deliveryLatencyMs: previous?.pool === pool ? previous.deliveryLatencyMs : null });
  while (streamStates.size > 80) streamStates.delete(streamStates.keys().next().value!);
}
export function marketSubscriptionDiagnostics() {
  return { subscriptions: [...channels].map(([mint, c]) => ({ mint, subscribers: c.listeners.size, ageMs: c.snapshot ? Date.now() - c.snapshot.fetchedAt : null })), streams: [...streamStates].map(([mint, state]) => ({ mint, ...state, eventAgeMs: state.lastTickAt === null ? null : Date.now() - state.lastTickAt })) };
}
export function subscribeMarketSnapshot(mint: string, listener: Listener): () => void {
  if (!isSolanaAddress(mint)) throw new Error('Invalid Solana mint');
  let channel = channels.get(mint);
  if (!channel) {
    if (channels.size >= 64) throw new Error('Market subscription budget reached');
    channel = { listeners: new Set(), closed: false, attempts: 0 }; channels.set(mint, channel);
    const active = channel;
    const run = async () => {
      if (active.closed) return;
      if (typeof document !== 'undefined' && document.hidden) { active.timer = setTimeout(run, 60_000); return; }
      try { const snapshot = await getMarketSnapshot(mint); if (!active.closed) { active.attempts = 0; emit(snapshot); } }
      catch (error) { if (!active.closed) { active.attempts++; const old = active.snapshot; emit(markSnapshotStale(old ?? snapshotFromPair(mint, null), error instanceof Error ? error.message : 'Market source unavailable')); } }
      if (!active.closed) active.timer = setTimeout(run, Math.min(120_000, MARKET_TTL.price * 2 ** Math.min(4, active.attempts)));
    };
    // Schedule after registration so all listeners receive the initial result.
    active.timer = setTimeout(run, 0);
  }
  channel.listeners.add(listener); if (channel.snapshot) listener(channel.snapshot);
  const active = channel;
  return () => { active.listeners.delete(listener); if (!active.listeners.size) { active.closed = true; clearTimeout(active.timer); channels.delete(mint); } };
}
