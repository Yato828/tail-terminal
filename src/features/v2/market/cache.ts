export type CacheKind = 'metadata' | 'price' | 'history' | 'profiles' | 'chain';
export const MARKET_TTL: Record<CacheKind, number> = { metadata: 86_400_000, price: 10_000, history: 25_000, profiles: 60_000, chain: 30_000 };
export type ProviderMetric = { requests: number; completed: number; hits: number; deduplicated: number; errors: number; rateLimits: number; lastLatencyMs: number | null; totalLatencyMs: number; lastSuccessAt: number | null; lastError: string | null };
const metrics = new Map<string, ProviderMetric>();
const cache = new Map<string, { value: unknown; at: number; kind: CacheKind }>();
const pending = new Map<string, Promise<unknown>>();
function metric(provider: string) {
  let m = metrics.get(provider);
  if (!m) { m = { requests: 0, completed: 0, hits: 0, deduplicated: 0, errors: 0, rateLimits: 0, lastLatencyMs: null, totalLatencyMs: 0, lastSuccessAt: null, lastError: null }; metrics.set(provider, m); }
  return m;
}
export function peekMarketCache<T>(kind: CacheKind, key: string): { value: T; at: number } | undefined {
  return cache.get(`${kind}:${key}`) as { value: T; at: number } | undefined;
}
export function storeMarketCache<T>(kind: CacheKind, key: string, value: T) {
  const k = `${kind}:${key}`;
  cache.delete(k); cache.set(k, { value, at: Date.now(), kind });
  while (cache.size > 240) cache.delete(cache.keys().next().value!);
}
export async function cachedMarketRequest<T>(kind: CacheKind, key: string, provider: string, load: () => Promise<T>, force = false): Promise<T> {
  const k = `${kind}:${key}`, m = metric(provider), hit = cache.get(k);
  if (!force && hit && Date.now() - hit.at < MARKET_TTL[kind]) { m.hits++; return hit.value as T; }
  const running = pending.get(k);
  if (running) { m.deduplicated++; return running as Promise<T>; }
  if (pending.size >= 64) throw new Error('Market request budget reached; retry shortly.');
  const start = performance.now(); m.requests++;
  const job = Promise.resolve().then(load).then(value => {
    m.lastSuccessAt = Date.now(); m.lastError = null;
    storeMarketCache(kind, key, value); return value;
  }).catch((error: unknown) => {
    m.errors++; m.lastError = error instanceof Error ? error.message : 'Source unavailable';
    if (/\b429\b|rate.limit/i.test(m.lastError)) m.rateLimits++;
    throw error;
  }).finally(() => {
    m.completed++; m.lastLatencyMs = Math.max(0, performance.now() - start); m.totalLatencyMs += m.lastLatencyMs;
    pending.delete(k);
  });
  pending.set(k, job); return job;
}
export function marketCacheDiagnostics() {
  return { entries: cache.size, pending: pending.size, ttl: MARKET_TTL, providers: [...metrics].map(([provider, m]) => ({ provider, ...m, cacheHitRatio: (m.hits + m.requests) ? m.hits / (m.hits + m.requests) : null })) };
}
/** Isolated deterministic tests; callers should not clear caches on every refresh. */
export function resetMarketCache() { cache.clear(); metrics.clear(); }
