import { getJson } from '../../../lib/http';
import { isSolanaAddress } from '../../../lib/validation';
import { rpc } from '../../../lib/rpcFeed';
import { fetchHolderSnapshot } from '../../../lib/holders';
import { fetchTrades } from '../../../lib/api';
import { walletActivity } from '../../intelligence/walletData';
import { getMarketSnapshot, getMarketSnapshots, loadMarketHistory, snapshotsFromPairs, sourcePairs } from '../market/snapshot';
import { validateFilter } from '../market/filters';
import { MARKET_FIELDS, type MarketSnapshot, type MarketField } from '../market/types';
import type { WorkspaceAction } from '../contracts';
import { FABLE_INTERVALS, parseWorkspaceProposals } from './contracts';
import { FABLE_TOOL_DEFINITIONS, type FableToolName } from './toolSchemas';
export type FableToolResult = { tool: string; source: string; fetchedAt: number; observedAt: number | null; data?: unknown; unavailable?: string; scope?: string; proposals?: WorkspaceAction[] };
const SPL = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
function compactMarket(s: MarketSnapshot, fields: MarketField[] = ['priceUsd', 'marketCap', 'fdv', 'liquidityUsd', 'volume24h', 'ageMinutes', 'change24h', 'mintAuthority', 'freezeAuthority', 'holderConcentration']) { return { mint: s.mint, pool: s.poolAddress, name: s.metadata.value?.name ?? null, symbol: s.metadata.value?.symbol ?? null, fetchedAt: s.fetchedAt, fields: Object.fromEntries(fields.map(f => { const e = s.fields[f]; return [f, { value: e.value, status: e.status, source: e.source, fetchedAt: e.fetchedAt, observedAt: e.observedAt }]; })), note: 'Age is pool age, not mint launch age; unavailable fields are not zero. Event time unavailable unless explicitly supplied.' }; }
const cache = new Map<string, { value: FableToolResult; until: number }>(), pending = new Map<string, Promise<FableToolResult>>();
export function validateFableToolArgs(name: string, input: unknown): Record<string, unknown> {
  const definition = FABLE_TOOL_DEFINITIONS.find(d => d[0] === name);
  if (!definition || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Unsupported read-only tool');
  const a = input as Record<string, unknown>, properties = definition[2].properties;
  if (Object.keys(a).some(k => !Object.hasOwn(properties, k)) || Object.keys(properties).some(k => !Object.hasOwn(a, k))) throw new Error('Unexpected or missing tool argument');
  if ('mint' in properties && !isSolanaAddress(a.mint)) throw new Error('Invalid Solana mint argument');
  if ('interval' in properties && !FABLE_INTERVALS.includes(a.interval as typeof FABLE_INTERVALS[number])) throw new Error('Invalid chart interval');
  if (name === 'get_chart_data' && (!Number.isSafeInteger(a.limit) || Number(a.limit) < 20 || Number(a.limit) > 500)) throw new Error('Chart limit must be 20–500');
  if (name === 'compare_tokens' && (!Array.isArray(a.mints) || a.mints.length < 1 || a.mints.length > 4 || !a.mints.every(isSolanaAddress) || new Set(a.mints).size !== a.mints.length)) throw new Error('Use one to four unique exact Solana mints');
  if (name === 'get_wallet_comparison' && (!Array.isArray(a.addresses) || a.addresses.length !== 2 || !a.addresses.every(isSolanaAddress) || a.addresses[0] === a.addresses[1])) throw new Error('Use two different valid Solana wallets');
  if (name === 'search_tokens' && (typeof a.query !== 'string' || !a.query.trim() || a.query.length > 120)) throw new Error('Search must contain 1–120 characters');
  if (name === 'explain_chart_indicator' && !['SMA', 'EMA', 'RSI', 'MACD', 'VWAP', 'Bollinger Bands'].includes(String(a.indicator))) throw new Error('Unsupported indicator');
  if (name === 'configure_workspace') { const actions = parseWorkspaceProposals(a.actions); if (!actions.length) throw new Error('At least one proposal is required'); }
  if (name === 'build_token_filter') {
    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 80 || typeof a.filterJson !== 'string' || a.filterJson.length > 12000 || typeof a.sortField !== 'string' || !Object.hasOwn(MARKET_FIELDS, a.sortField) || !['asc', 'desc'].includes(String(a.sortDirection)) || typeof a.proposeSave !== 'boolean') throw new Error('Invalid filter builder arguments');
    const valid = validateFilter(JSON.parse(a.filterJson)); if (!valid.valid) throw new Error(valid.errors.join('; '));
  }
  if (name === 'explain_this_move' && (typeof a.from !== 'number' || typeof a.to !== 'number' || !Number.isFinite(a.from) || !Number.isFinite(a.to) || a.from <= 0 || a.to <= a.from || a.to > Date.now() + 60_000 || a.to - a.from > 7 * 86400000)) throw new Error('Selected range must span at most seven days of real history');
  return a;
}
const indicators: Record<string, { formula: string; inputs: string; limitation: string }> = {
  SMA: { formula: 'Mean of the last N source closing prices.', inputs: 'N complete source candles.', limitation: 'Lagging; gaps are not synthetic zero-price candles.' },
  EMA: { formula: 'EMA(t) = alpha × close(t) + (1 − alpha) × EMA(t−1), alpha = 2/(N+1). Seed with the first N closes mean.', inputs: 'At least N source candles for a seeded value.', limitation: 'Sensitive to warm-up history and missing source coverage.' },
  RSI: { formula: 'RSI = 100 − 100/(1 + average gain / average loss), using Wilder smoothing.', inputs: 'N+1 closing prices for initial N changes.', limitation: 'Momentum measure; overbought or oversold does not predict reversal.' },
  MACD: { formula: 'MACD = EMA(12) − EMA(26); signal = EMA(9) of MACD; histogram = MACD − signal.', inputs: 'Enough source closes to seed slow and signal averages.', limitation: 'Lag and warm-up depend on the available history.' },
  VWAP: { formula: 'Cumulative sum(typical price × volume) / cumulative volume; typical price = (high+low+close)/3.', inputs: 'Source OHLCV and explicitly disclosed volume units and session anchor.', limitation: 'Candle approximation; USD-volume weighting is not token-volume weighting. No volume is invented from spot.' },
  'Bollinger Bands': { formula: 'Middle = SMA(N); upper/lower = SMA(N) ± K × population standard deviation of last N closes.', inputs: 'N source closes; commonly N=20 and K=2.', limitation: 'Volatility bands are descriptive; they do not guarantee future price bounds.' },
};
async function execute(name: FableToolName, a: Record<string, unknown>): Promise<FableToolResult> {
  const result = (source: string, data: unknown, scope?: string): FableToolResult => ({ tool: name, source, fetchedAt: Date.now(), observedAt: null, data, scope });
  if (name === 'explain_chart_indicator') return result('Documented local formula · no AI request', indicators[a.indicator as string]);
  if (name === 'configure_workspace') return { ...result('Validated local proposal · no workspace change performed', { requiresConfirmation: true }), proposals: parseWorkspaceProposals(a.actions) };
  if (name === 'build_token_filter') {
    const filter = validateFilter(JSON.parse(a.filterJson as string)).filter!;
    return { ...result('Local typed filter validator · no AI request or save performed', { name: a.name, filter, sort: { field: a.sortField, direction: a.sortDirection }, requiresConfirmation: a.proposeSave }), proposals: a.proposeSave ? [{ type: 'save_filter', name: (a.name as string).trim(), filter }] : [] };
  }
  if (name === 'search_tokens') {
    const query = (a.query as string).trim();
    const body = await getJson<unknown>(isSolanaAddress(query) ? `/dex/token-pairs/v1/solana/${query}` : `/dex/latest/dex/search?q=${encodeURIComponent(query)}`, 12000);
    return result('DexScreener · Solana search sample', snapshotsFromPairs(sourcePairs(body).filter(p => !isSolanaAddress(query) || p.baseToken?.address === query)).slice(0, 20).map(s => compactMarket(s, ['priceUsd', 'liquidityUsd', 'volume24h'])), 'At most 20 matching mints. Not a complete market scan.');
  }
  if (name === 'compare_tokens') return result('DexScreener · batched exact Solana mint sample', (await getMarketSnapshots(a.mints as string[])).map(s => compactMarket(s)), 'Missing indexed markets omitted; security and holder checks unavailable in market-only evidence.');
  if (name === 'get_wallet_comparison') {
    const addresses = a.addresses as string[], results = await Promise.allSettled(addresses.map(address => walletActivity({ address, label: 'Public wallet', pinned: false })));
    const wallets = results.map((r, i) => ({ address: addresses[i], available: r.status === 'fulfilled', partial: r.status === 'fulfilled' ? r.value.partial : true, observations: r.status === 'fulfilled' ? r.value.rows : null, error: r.status === 'rejected' ? 'Public RPC activity unavailable' : null }));
    const mints = wallets.map(w => new Set((w.observations ?? []).map(r => r.mint).filter(isSolanaAddress)));
    return result('Solana mainnet RPC · bounded recent activity', { wallets, overlappingMints: wallets.every(w => w.available) ? [...mints[0]].filter(m => mints[1].has(m)) : null, partial: wallets.some(w => !w.available || w.partial || w.observations?.some(r => !r.mint)) }, 'At most eight recent transactions per wallet. Observed net changes are not holdings, classified trades, identities or PnL. Empty overlap only describes this bounded observed sample.');
  }
  const mint = a.mint as string;
  if (name === 'get_token_holders') {
    const snapshot = await fetchHolderSnapshot(mint);
    return { tool: name, source: snapshot.source, fetchedAt: snapshot.fetchedAt, observedAt: null, data: snapshot, scope: 'Owners of up to 20 largest token accounts. Fetched time differs from unknown indexed balance time. Not complete holder distribution; no inferred clusters.' };
  }
  if (name === 'get_security_flags') {
    const account = await rpc<{ value: { owner?: string; data?: { parsed?: { type?: string; info?: Record<string, unknown> } } } | null }>('getAccountInfo', [mint, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    const token = account.value, info = token?.data?.parsed?.info;
    if (!token || ![SPL, TOKEN2022].includes(token.owner ?? '') || token.data?.parsed?.type !== 'mint' || !info) return { ...result('Solana mainnet RPC · confirmed mint account', null), unavailable: 'Verified SPL mint account unavailable from connected RPC.' };
    const authority = (field: string) => !Object.hasOwn(info, field) ? { status: 'unavailable', value: null } : info[field] === null ? { status: 'ready', value: null, meaning: 'Authority revoked' } : isSolanaAddress(info[field]) ? { status: 'ready', value: info[field], meaning: 'Authority present' } : { status: 'unavailable', value: null };
    return result('Solana mainnet RPC · confirmed mint account', { mint, tokenProgram: token.owner === SPL ? 'SPL Token' : 'Token-2022', mintAuthority: authority('mintAuthority'), freezeAuthority: authority('freezeAuthority'), supplyRaw: typeof info.supply === 'string' && /^\d+$/.test(info.supply) ? info.supply : null, decimals: Number.isSafeInteger(info.decimals) && Number(info.decimals) >= 0 && Number(info.decimals) <= 255 ? info.decimals : null, lpLock: null, developerIdentity: null, developerHoldings: null, hiddenExtensionsReview: token.owner === TOKEN2022 ? 'Unavailable; Token-2022 extensions require additional review.' : 'Not applicable to classic SPL mint' }, 'Authority checks are factual flags, never a safety guarantee. Liquidity lock, developer attribution and complete security assessment unavailable.');
  }
  const snapshot = await getMarketSnapshot(mint);
  if (name === 'get_market_data') return result('DexScreener · per-value evidence', snapshot);
  if (name === 'get_liquidity_data') return result('DexScreener · indexed selected pool', { mint, pool: snapshot.poolAddress, liquidityUsd: snapshot.fields.liquidityUsd, marketCap: snapshot.fields.marketCap, volume24h: snapshot.fields.volume24h, lpLock: null, lpOwner: null }, 'Pool liquidity snapshot; no lock or LP ownership claim.');
  if (!snapshot.poolAddress) return { ...result('Public market sources', null), unavailable: 'No verified Solana pool is available for source history.' };
  const history = await loadMarketHistory(mint, snapshot.poolAddress, a.interval as typeof FABLE_INTERVALS[number], name === 'explain_this_move' ? Number(a.to) + 1 : undefined);
  if (name === 'get_chart_data') return { tool: name, source: history.source, fetchedAt: history.fetchedAt, observedAt: history.bars.at(-1)?.t ?? null, scope: 'Source candle bucket timestamps, not on-chain trade times. Original source scope and volume units are retained.', data: { mint, pool: snapshot.poolAddress, interval: a.interval, scope: history.scope ?? 'pool', volumeUnit: history.volumeUnit ?? 'usd', historyLimited: history.historyLimited ?? false, warning: history.warning ?? null, bars: history.bars.slice(-Number(a.limit)) } };
  const from = a.from as number, to = a.to as number, bars = history.bars.filter(b => b.t >= from && b.t <= to), tradesResult = await Promise.allSettled([fetchTrades(snapshot.poolAddress, mint, Number(snapshot.fields.priceUsd.value) || 0)]);
  return result(history.source, { mint, pool: snapshot.poolAddress, from, to, interval: a.interval, volumeUnit: history.volumeUnit ?? 'usd', sourceSnapshotAt: history.fetchedAt, bars, observedPriceChangePct: bars.length > 1 ? (bars.at(-1)!.c / bars[0].o - 1) * 100 : null, summedSourceVolume: bars.length ? bars.reduce((n, b) => n + b.v, 0) : null, recentTrades: tradesResult[0].status === 'fulfilled' ? tradesResult[0].value.slice(0, 20).filter(t => { const time = Date.parse(String(t.timestamp)); return Number.isFinite(time) && time >= from && time <= to; }) : null, coverage: 'Available candle page and at most 20 recent indexed trades; this is not an exhaustive event history.', explanation: bars.length ? 'Observed price and volume describe this covered interval. Events may correlate; no causal explanation is established by this evidence.' : 'No source candles cover the selected interval; price change and volume are unavailable.' }, 'Read-only move evidence. No AI call, forecast, fabricated candles or proven cause.');
}
export async function runFableDataTool(name: string, input: unknown): Promise<FableToolResult> {
  const args = validateFableToolArgs(name, input), key = `${name}:${JSON.stringify(args)}`;
  const hit = cache.get(key); if (hit && hit.until > Date.now()) return hit.value;
  const running = pending.get(key); if (running) return running;
  if (pending.size >= 8) throw new Error('Local data request budget reached; retry after the current tools finish.');
  const job = execute(name as FableToolName, args).then(value => { const ttl = ['get_market_data', 'get_liquidity_data', 'compare_tokens'].includes(name) ? 0 : name.startsWith('explain_chart') || name === 'build_token_filter' || name === 'configure_workspace' ? 300000 : 10000; cache.set(key, { value, until: Date.now() + ttl }); while (cache.size > 80) cache.delete(cache.keys().next().value!); return value; }).finally(() => pending.delete(key));
  pending.set(key, job); return job;
}

export function clearFableToolCache() { cache.clear(); }
if (typeof window !== 'undefined') window.addEventListener('part:clear-data', clearFableToolCache);
