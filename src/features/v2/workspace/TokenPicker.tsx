import { useEffect, useRef, useState } from 'react';
import { searchAxioms, type AxiomCoin } from '../../../lib/axiom';
export function TokenPicker({ label, mint, onChoose }: { label: string; mint: string | null; onChoose: (mint: string | null) => void }) {
  const [query, setQuery] = useState(''), [results, setResults] = useState<AxiomCoin[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const version = useRef(0);
  useEffect(() => () => { version.current++; }, []);
  return <div className="studio-token-picker">
    <form onSubmit={async e => { e.preventDefault(); const run = ++version.current; setBusy(true); setMessage(''); setResults([]); try { const rows = await searchAxioms(query.trim()); if (run !== version.current) return; const valid = rows.filter(c => c.chainId === 'solana').slice(0, 8); setResults(valid); if (!valid.length) setMessage('No matching Solana market returned.'); } catch { if (run === version.current) setMessage('Solana search source unavailable. Retry search.'); } finally { if (run === version.current) setBusy(false); } }}>
      <label>{label}<input aria-label={label} value={query} maxLength={100} placeholder="Symbol or Solana mint" onChange={e => { setQuery(e.target.value); version.current++; setResults([]); setBusy(false); }} /></label>
      <button disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search tokens'}</button>
      <button type="button" disabled={!mint} onClick={() => { version.current++; setResults([]); setBusy(false); onChoose(null); }}>Clear token</button>
    </form>
    {mint && <code title={mint}>{mint}</code>}
    {message && <p role="status">{message}</p>}
    {!!results.length && <div className="studio-token-results" role="list" aria-label={`${label} results`}>{results.map(c => <button key={`${c.address}:${c.pairAddress}`} onClick={() => { onChoose(c.address); setResults([]); setQuery(''); }}>{c.symbol} · {c.name} · {c.address.slice(0, 6)}…{c.address.slice(-4)}</button>)}</div>}
  </div>;
}
