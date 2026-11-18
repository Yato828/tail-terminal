import { lazy, Suspense } from 'react';
import { Chart } from '../../../components/Chart';
import type { AxiomCoin } from '../../../lib/axiom';
import type { StudioCard } from './model';
import { MarketEvidence } from './MarketEvidence';
const Discovery = lazy(() => import('../market/AdvancedDiscovery').then(m => ({ default: m.AdvancedDiscovery })));
const Intelligence = lazy(() => import('../intelligence/V2Intelligence'));
const Routes = lazy(() => import('../trading/TradingDesk'));
const Fable = lazy(() => import('../../tail/FablePanel').then(m => ({ default: m.FablePanel })));
export function StudioWidget({ card, coin, wallet, selectMint, selectWallet, maximize, maximized, namespace }: { card: StudioCard; coin: AxiomCoin | null; wallet: string; selectMint: (mint: string) => void; selectWallet?: (address: string) => void; maximize: () => void; maximized: boolean; namespace: string }) {
  return <Suspense fallback={<p role="status">Loading workspace tool…</p>}>
    {card.kind === 'chart' && (coin ? <Chart key={`${card.id}:${coin.address}:${coin.pairAddress}`} chartId={`studio-${namespace}-${card.id}`} settingsKey={`studio-${card.id}`} pool={coin.pairAddress} token={coin.address} symbol={coin.symbol} priceUsd={coin.priceUsd} mcap={coin.mcap} createdAt={coin.createdAt} syncGroup={card.scope === 'independent' ? undefined : `studio-${namespace}-${card.scope}`} /> : <p>Select a Solana token for this chart. No candles are generated.</p>)}
    {card.kind === 'stats' && <MarketEvidence coin={coin} />}
    {card.kind === 'discovery' && <Discovery selectMint={selectMint} />}
    {card.kind === 'intelligence' && <Intelligence coin={coin} wallet={wallet} selectMint={selectMint} selectWallet={selectWallet} />}
    {card.kind === 'routes' && <Routes coin={coin} wallet={wallet} />}
    {card.kind === 'fable' && <Fable coin={coin} wallet={wallet} expanded={maximized} onExpand={maximize} />}
  </Suspense>;
}
