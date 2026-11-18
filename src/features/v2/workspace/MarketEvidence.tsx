import { useEffect, useRef, useState } from 'react';
import type { AxiomCoin } from '../../../lib/axiom';
import { getMarketSnapshot, markSnapshotStale, subscribeMarketSnapshot } from '../market/snapshot';
import type { MarketField, MarketSnapshot } from '../market/types';
import { evidenceTitle, marketValueLabel } from '../market/presentation';
const FIELDS: { key: MarketField; label: string }[] = [
  { key: 'priceUsd', label: 'Price USD' }, { key: 'marketCap', label: 'Market cap' }, { key: 'fdv', label: 'FDV' },
  { key: 'liquidityUsd', label: 'Liquidity' }, { key: 'volume5m', label: 'Volume 5m' }, { key: 'volume1h', label: 'Volume 1h' },
  { key: 'volume24h', label: 'Volume 24h' }, { key: 'change24h', label: 'Change 24h' }, { key: 'buys24h', label: 'Buys 24h' },
  { key: 'sells24h', label: 'Sells 24h' }, { key: 'ageMinutes', label: 'Pool age' }, { key: 'dex', label: 'DEX' },
];
export function MarketEvidence({ coin }: { coin: AxiomCoin | null }) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const [, refreshClock] = useState(0);
  useEffect(() => {
    generation.current++; setSnapshot(null); setError(''); setBusy(false);
    if (!coin) return;
    const stop = subscribeMarketSnapshot(coin.address, setSnapshot);
    return () => { generation.current++; stop(); };
  }, [coin?.address]);
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) refreshClock(v => v + 1); }, 10000); return () => clearInterval(timer); }, []);
  const view = snapshot ? markSnapshotStale(snapshot) : null;
  return <section aria-label="Market source evidence">
    {!coin ? <p>Select a Solana token for this widget.</p> : <>
      <h3>{coin.symbol} · source evidence</h3>
      <button disabled={busy} onClick={async () => { setBusy(true); setError(''); const mint = coin.address, version = generation.current; try { const result = await getMarketSnapshot(mint, { force: true }); if (version === generation.current) setSnapshot(result); } catch { if (version !== generation.current) return; setError('Market source unavailable. Previous evidence is retained with its original timestamps.'); setSnapshot(old => old ? markSnapshotStale(old, 'Source refresh failed') : null); } finally { if (version === generation.current) setBusy(false); } }}>{busy ? 'Refreshing…' : 'Refresh market evidence'}</button>
      {error && <p role="alert">{error}</p>}
      {!view && <p role="status">Loading source snapshot…</p>}
      {view && <><p>{view.poolAddress ? `Pool ${view.poolAddress}` : 'No indexed pool available.'}</p>{view.warning && <p role="status">{view.warning}</p>}<dl className="studio-evidence-grid">{FIELDS.map(({ key, label }) => <div key={key} title={evidenceTitle(view, key)}><dt>{label}</dt><dd>{marketValueLabel(view, key)}</dd><small>{view.fields[key].source} · {view.fields[key].status}</small></div>)}</dl><p>Fetched {new Date(view.fetchedAt).toISOString()}. Provider event time is unavailable unless an individual field says otherwise. Missing evidence is unavailable.</p></>}
    </>}
  </section>;
}
