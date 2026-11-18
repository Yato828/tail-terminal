import { useEffect, useState } from 'react';
import { isSolanaAddress } from '../../../lib/validation';
import { shortAddr } from '../../../lib/format';
import { subscribeMarketSnapshot } from './snapshot';
import { evidenceTitle, marketValueLabel } from './presentation';
import { MARKET_FIELDS, type MarketField, type MarketSnapshot } from './types';
const FIELDS: MarketField[] = ['priceUsd', 'marketCap', 'fdv', 'liquidityUsd', 'volume24h', 'ageMinutes', 'change5m', 'change1h', 'change24h', 'buys24h', 'sells24h', 'holderConcentration', 'mintAuthority', 'freezeAuthority', 'devHoldings', 'launchStage'];
function CompareColumn({ mint, selectMint, remove }: { mint: string; selectMint: (mint: string) => void; remove: () => void }) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  useEffect(() => { setSnapshot(null); return subscribeMarketSnapshot(mint, setSnapshot); }, [mint]);
  const coverage = snapshot ? Object.values(snapshot.fields).filter(f => f.value !== null && f.status === 'ready').length : 0;
  return <article className="v2-compare-token"><h3>{snapshot?.metadata.value?.symbol || shortAddr(mint)}</h3><p title={mint}>{shortAddr(mint)} · {coverage} / {snapshot ? Object.keys(snapshot.fields).length : Object.keys(MARKET_FIELDS).length} fields ready</p><div className="tool-actions"><button onClick={() => selectMint(mint)}>Open {snapshot?.metadata.value?.symbol || shortAddr(mint)}</button><button onClick={remove}>Remove {shortAddr(mint)}</button></div>{snapshot?.warning && <p role="status">{snapshot.warning}</p>}
    {!snapshot ? <p role="status">Loading market evidence…</p> : <dl>{FIELDS.map(f => <div key={f}><dt>{f}</dt><dd><span className="market-evidence-value">{marketValueLabel(snapshot, f)}</span><details><summary>Source / time</summary><small>{evidenceTitle(snapshot, f)}</small></details></dd></div>)}</dl>}
  </article>;
}
export function TokenCompare({ initialMints = [], selectMint }: { initialMints?: string[]; selectMint: (mint: string) => void }) {
  const [mints, setMints] = useState(() => [...new Set(initialMints.filter(isSolanaAddress))].slice(0, 4)), [input, setInput] = useState(''), [error, setError] = useState('');
  return <section className="tool-page v2-market" aria-label="Token comparison"><h2>Token Compare</h2><p>Compare up to four exact Solana mints. Pool age, source fetch time and unavailable security / holder coverage are disclosed per value. Separate chart panels provide independent chart contexts.</p>
    <form className="tool-form" onSubmit={e => { e.preventDefault(); const mint = input.trim(); if (!isSolanaAddress(mint)) return setError('Enter a valid Solana mint; address case is preserved.'); if (mints.includes(mint)) return setError('This mint is already in the comparison.'); if (mints.length >= 4) return setError('Compare supports up to four mints.'); setMints(current => [...current, mint]); setInput(''); setError(''); }}><label>Compare mint<input aria-label="Compare token mint" value={input} onChange={e => setInput(e.target.value)} /></label><button disabled={mints.length >= 4}>Add comparison token</button></form>{error && <p role="alert">{error}</p>}
    {!mints.length && <p>Add a mint to begin. No default token or invented comparison is loaded.</p>}
    <div className="v2-compare-grid">{mints.map(mint => <CompareColumn key={mint} mint={mint} selectMint={selectMint} remove={() => setMints(current => current.filter(m => m !== mint))} />)}</div>
  </section>;
}
