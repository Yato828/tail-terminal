import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedMarketRequest, MARKET_TTL, marketCacheDiagnostics, resetMarketCache } from './cache';
import { evaluateFilter, exportFilterPresets, importFilterPresets, sortMarketSnapshots, validateFilter } from './filters';
import { getMarketSnapshot, marketSubscriptionDiagnostics, publishMarketSpot, publishMarketStreamStatus, snapshotFromPair, sourcePairs, subscribeMarketSnapshot } from './snapshot';
import type { FilterNode, FilterPreset } from './types';
const mint = 'So11111111111111111111111111111111111111112';
const other = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const pool = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const raw = () => ({ chainId: 'solana', pairAddress: pool, baseToken: { address: mint, symbol: 'SOL', name: 'Wrapped SOL' }, priceUsd: '100', volume: { h24: 0 }, txns: { h24: { buys: 12, sells: 0 } }, pairCreatedAt: Date.now() - 60_000 });
beforeEach(() => resetMarketCache());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('market evidence preserves missing vs measured zero', () => {
  it('retains real zeros, unavailable ratio/security, case and distinct source timestamps', () => {
    const s = snapshotFromPair(mint, raw());
    expect(s.mint).toBe(mint); expect(s.fields.volume24h.value).toBe(0);
    expect(s.fields.liquidityUsd.value).toBeNull(); expect(s.fields.marketCap.value).toBeNull();
    expect(s.fields.buySellRatio.value).toBeNull(); expect(s.fields.txns24h.value).toBe(12);
    expect(s.fields.mintAuthority).toMatchObject({ value: null, status: 'unavailable' });
    expect(s.fields.priceUsd).toMatchObject({ value: 100, observedAt: null, source: expect.stringContaining('DexScreener') });
    expect(s.fields.ageMinutes.value).toBeCloseTo(1); expect(s.fields.ageMinutes.note).toContain('not token');
  });
  it('rejects wrong chain, mint, pool and malformed numerics instead of mixing identities', () => {
    expect(() => snapshotFromPair(other, raw())).toThrow('Mismatched');
    expect(() => snapshotFromPair(mint, { ...raw(), chainId: 'ethereum' })).toThrow('Mismatched');
    expect(() => sourcePairs({ malformed: true })).toThrow('Invalid');
    expect(sourcePairs([raw(), { ...raw(), baseToken: { address: other.toLowerCase() } }, { ...raw(), pairAddress: 'x' }])).toHaveLength(1);
    const s = snapshotFromPair(mint, { ...raw(), priceUsd: '', liquidity: { usd: -1 }, marketCap: Infinity, txns: { h24: { buys: 0.5, sells: 2 } } });
    expect(s.fields.priceUsd.value).toBeNull(); expect(s.fields.marketCap.value).toBeNull(); expect(s.fields.liquidityUsd.value).toBeNull(); expect(s.fields.buys24h.value).toBeNull();
  });
});
describe('validated three-valued filter DSL', () => {
  const unknownRule: FilterNode = { field: 'holderConcentration', op: 'lt', value: 1 };
  const zeroRule: FilterNode = { field: 'volume24h', op: 'eq', value: 0 };
  it('composes unknown under AND/OR without treating it as zero/false', () => {
    const s = snapshotFromPair(mint, raw());
    expect(evaluateFilter(s, unknownRule)).toBe('unknown'); expect(evaluateFilter(s, zeroRule)).toBe('match');
    expect(evaluateFilter(s, { logic: 'and', rules: [zeroRule, unknownRule] })).toBe('unknown');
    expect(evaluateFilter(s, { logic: 'or', rules: [zeroRule, unknownRule] })).toBe('match');
    expect(evaluateFilter(s, { logic: 'and', rules: [{ field: 'priceUsd', op: 'lt', value: 1 }, unknownRule] })).toBe('no-match');
    expect(evaluateFilter(s, { field: 'mintAuthority', op: 'neq', value: false })).toBe('unknown');
    expect(evaluateFilter(s, { field: 'holderConcentration', op: 'missing' })).toBe('match');
    s.fields.priceUsd.status = 'stale'; expect(evaluateFilter(s, { field: 'priceUsd', op: 'gt', value: 0 })).toBe('unknown');
  });
  it('rejects wrong types, prototype fields, nonnumeric comparisons, excessive depth and empty OR', () => {
    for (const f of [{ field: '__proto__', op: 'eq', value: 1 }, { field: 'priceUsd', op: 'gt', value: '' }, { field: 'dex', op: 'gt', value: 'raydium' }, { field: 'priceUsd', op: 'gte', value: Infinity }, { logic: 'or', rules: [] }]) expect(validateFilter(f).valid).toBe(false);
    let nested: unknown = zeroRule; for (let n = 0; n < 8; n++) nested = { logic: 'and', rules: [nested] };
    expect(validateFilter(nested).valid).toBe(false);
    expect(validateFilter({ logic: 'and', rules: [zeroRule, { logic: 'or', rules: [unknownRule, zeroRule] }] }).valid).toBe(true);
  });
  it('always sorts unknown evidence last in either direction and preserves data', () => {
    const a = snapshotFromPair(mint, raw()), b = snapshotFromPair(other, { ...raw(), baseToken: { address: other }, liquidity: { usd: 0 } });
    for (const direction of ['asc', 'desc'] as const) expect(sortMarketSnapshots([a, b], 'liquidityUsd', direction).map(s => s.mint)).toEqual([other, mint]);
  });
  it('roundtrips strict presets and rejects malformed imports', () => {
    const p: FilterPreset = { version: 1, id: 'test-signal', name: 'Volume above zero', filter: zeroRule, sort: { field: 'volume24h', direction: 'desc' }, signal: true };
    expect(importFilterPresets(exportFilterPresets([p]))).toEqual([p]);
    expect(() => importFilterPresets(JSON.stringify([{ ...p, filter: { field: 'volume24h', op: 'gt', value: null } }]))).toThrow();
    expect(() => importFilterPresets(' '.repeat(131073))).toThrow('128 KiB');
  });
});
describe('bounded cache, deduplication and telemetry', () => {
  it('shares pending work, separates TTLs and records actual rate limits', async () => {
    vi.useFakeTimers(); const load = vi.fn(async () => 42);
    expect(await Promise.all([cachedMarketRequest('price', 'x', 'test', load), cachedMarketRequest('price', 'x', 'test', load)])).toEqual([42, 42]);
    await cachedMarketRequest('price', 'x', 'test', load); expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MARKET_TTL.price + 1); await cachedMarketRequest('price', 'x', 'test', load); expect(load).toHaveBeenCalledTimes(2);
    await cachedMarketRequest('metadata', 'x', 'test', load); expect(load).toHaveBeenCalledTimes(3);
    await expect(cachedMarketRequest('price', 'bad', 'test', async () => { throw new Error('429 provider rate limited'); })).rejects.toThrow('429');
    expect(marketCacheDiagnostics().providers[0]).toMatchObject({ requests: 4, hits: 1, deduplicated: 1, errors: 1, rateLimits: 1, completed: 4 });
    for (let i = 0; i < 250; i++) await cachedMarketRequest('price', String(i), 'test', load);
    expect(marketCacheDiagnostics().entries).toBe(240);
  });
});
describe('shared market channels and existing-stream bridge', () => {
  it('shares HTTP, reference counts and never creates a new WebSocket', async () => {
    vi.useFakeTimers(); const fetch = vi.fn(async () => new Response(JSON.stringify([raw()]))); vi.stubGlobal('fetch', fetch);
    const a = vi.fn(), b = vi.fn(); const stopA = subscribeMarketSnapshot(mint, a), stopB = subscribeMarketSnapshot(mint, b);
    await vi.advanceTimersByTimeAsync(1); expect(fetch).toHaveBeenCalledTimes(1); expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenCalledTimes(1);
    expect(marketSubscriptionDiagnostics().subscriptions[0].subscribers).toBe(2);
    publishMarketStreamStatus(mint, pool, { state: 'live', message: 'Verified source update', provider: 'fixture' });
    publishMarketSpot(mint, pool, { price: 101, receivedAt: Date.now(), slot: 123, provider: 'fixture', commitment: 'confirmed', kind: 'orca', quote: 'USD' });
    expect(a.mock.calls.at(-1)?.[0].fields.priceUsd.value).toBe(101); expect(a.mock.calls.at(-1)?.[0].fields.volume24h.value).toBe(0);
    publishMarketSpot(mint, other, { price: 999, receivedAt: Date.now(), slot: 124, provider: 'fixture', commitment: 'confirmed', kind: 'orca', quote: 'USD' });
    expect(a).toHaveBeenCalledTimes(2);
    stopA(); expect(marketSubscriptionDiagnostics().subscriptions[0].subscribers).toBe(1); stopB();
    await vi.advanceTimersByTimeAsync(60_000); expect(fetch).toHaveBeenCalledTimes(1); expect(marketSubscriptionDiagnostics().subscriptions).toHaveLength(0);
  });
  it('pauses hidden-tab requests and preserves source evidence on stale errors', async () => {
    vi.useFakeTimers(); vi.stubGlobal('document', { hidden: true }); const fetch = vi.fn(async () => new Response(JSON.stringify([raw()]))); vi.stubGlobal('fetch', fetch);
    const listener = vi.fn(), stop = subscribeMarketSnapshot(mint, listener);
    await vi.advanceTimersByTimeAsync(1); expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal('document', { hidden: false }); await vi.advanceTimersByTimeAsync(60_000); expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockRejectedValueOnce(new Error('429 unavailable')); await vi.advanceTimersByTimeAsync(10_000);
    expect(listener.mock.calls.at(-1)?.[0].fields.priceUsd).toMatchObject({ value: 100, status: 'stale' });
    stop();
  });
  it('validates exact requested mint even if API supplies another mint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ ...raw(), baseToken: { address: other } }]))));
    const s = await getMarketSnapshot(mint); expect(s.mint).toBe(mint); expect(s.fields.priceUsd.value).toBeNull();
  });
});
