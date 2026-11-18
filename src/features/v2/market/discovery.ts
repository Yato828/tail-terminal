import { getJson } from '../../../lib/http';
import { isSolanaAddress } from '../../../lib/validation';
import { tailApi, tailSession } from '../../../services/backend/client';
import { cachedMarketRequest } from './cache';
import { getMarketSnapshots, snapshotsFromPairs, sourcePairs } from './snapshot';
import { sortMarketSnapshots } from './filters';
import type { DiscoveryCategory, DiscoveryResult, MarketSnapshot, MarketField } from './types';
export async function discoverMarket(category: DiscoveryCategory, query = '', force = false): Promise<DiscoveryResult> {
  if (query.length > 120) throw new Error('Search is limited to 120 characters');
  if (category === 'migrated') return { items: [], fetchedAt: Date.now(), partial: false, warning: 'Recently Migrated is unavailable: no verified migration event source is connected. A new pool or DEX name is not proof of migration.' };
  return cachedMarketRequest('price', `discovery:${category}:${query}`, 'Solana discovery adapters · observed end-to-end latency', async () => {
    let items: MarketSnapshot[] = [], warning = '', partial = false;
    if (category === 'watchlist') {
      const watchlist = await tailSession.watchlist(); items = await getMarketSnapshots(watchlist.items.filter(isSolanaAddress).slice(0, 30));
      warning = 'Your existing watchlist · up to 30 mints per screen. Missing indexed markets are omitted.';
    } else if (query.trim()) {
      const trimmed = query.trim();
      const body = await getJson<unknown>(isSolanaAddress(trimmed) ? `/dex/token-pairs/v1/solana/${trimmed}` : `/dex/latest/dex/search?q=${encodeURIComponent(trimmed)}`, 12000);
      items = snapshotsFromPairs(sourcePairs(body).filter(p => !isSolanaAddress(trimmed) || p.baseToken?.address === trimmed));
      warning = 'DexScreener Solana search sample; rankings apply only to returned rows.';
    } else if (category === 'new') {
      const pools = await cachedMarketRequest('profiles', 'new-pools:20', 'GeckoTerminal new pools · existing adapter', () => tailApi.newPools(20), force), mints = [...new Set(pools.items.map(p => p.baseMint).filter(isSolanaAddress))].slice(0, 20);
      items = await getMarketSnapshots(mints);
      warning = 'GeckoTerminal indexed new-pool sample; market columns use the most liquid indexed DexScreener pool. Pool age is not mint launch age. This is not every Solana launch.';
      partial = items.length < mints.length;
    } else {
      const profiles = await cachedMarketRequest('profiles', 'profiles:30', 'DexScreener profiles · existing adapter', () => tailApi.profiles(30), force), mints = [...new Set(profiles.items.filter(p => p.chainId === 'solana' && isSolanaAddress(p.tokenAddress)).map(p => p.tokenAddress))].slice(0, 30);
      items = await getMarketSnapshots(mints); partial = items.length < mints.length;
      warning = 'Latest indexed profile sample, up to 30 Solana mints; not a global ranking or complete launch feed. Trending is a local 1h-volume ranking, not paid boosts.';
    }
    const sort: [MarketField, 'asc' | 'desc'] = category === 'new' ? ['ageMinutes', 'asc'] : category === 'volume' ? ['volume24h', 'desc'] : category === 'gainers' ? ['change24h', 'desc'] : category === 'losers' ? ['change24h', 'asc'] : category === 'liquidity' ? ['liquidityUsd', 'desc'] : ['volume1h', 'desc'];
    items = sortMarketSnapshots(items, sort[0], sort[1]);
    return { items, fetchedAt: Date.now(), warning, partial };
  }, force);
}
