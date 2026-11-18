import { useEffect, useMemo, useState } from 'react';
import { shortAddr } from '../../../lib/format';
import { downloadFile } from '../../create/draft';
import { discoverMarket } from './discovery';
import { EMPTY_FILTER, evaluateFilter, exportFilterPresets, filterValue, importFilterPresets, readFilterPresets, sortMarketSnapshots, validateFilter, writeFilterPresets } from './filters';
import { MARKET_FIELDS, type DiscoveryCategory, type DiscoveryResult, type FilterNode, type FilterPreset, type MarketField, type MarketSnapshot } from './types';
import { MarketDiagnostics } from './MarketDiagnostics';
import { MARKET_TTL } from './cache';
import { markSnapshotStale } from './snapshot';
import {enrichMintEvidence} from './enrich';
import { marketValueLabel, evidenceTitle } from './presentation';
const CATEGORIES: { id: DiscoveryCategory; name: string }[] = [
  { id: 'new', name: 'New Tokens' }, { id: 'migrated', name: 'Recently Migrated' }, { id: 'trending', name: 'Trending' }, { id: 'volume', name: 'Top Volume' }, { id: 'gainers', name: 'Biggest Gainers' }, { id: 'losers', name: 'Biggest Losers' }, { id: 'liquidity', name: 'High Liquidity' }, { id: 'watchlist', name: 'Watchlist' }, { id: 'custom', name: 'Custom Screens' },
];
export function AdvancedDiscovery({ selectMint }: { selectMint: (mint: string) => void }) {
  const [category, setCategory] = useState<DiscoveryCategory>('trending'), [query, setQuery] = useState(''), [submittedQuery, setSubmittedQuery] = useState(''), [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now), [autoRefresh, setAutoRefresh] = useState(false);
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 5000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!autoRefresh) return; const timer = setInterval(() => { if (!document.hidden) setRevision(v => v + 1); }, 30000); return () => clearInterval(timer); }, [autoRefresh]);
  const [result, setResult] = useState<DiscoveryResult | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<FilterNode>(EMPTY_FILTER), [logic, setLogic] = useState<'and' | 'or'>('and'), [field, setField] = useState<MarketField>('liquidityUsd'), [op, setOp] = useState('gte'), [value, setValue] = useState('10000');
  const [sortField, setSortField] = useState<MarketField>('volume1h'), [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [presets, setPresets] = useState(readFilterPresets), [presetName, setPresetName] = useState(''), [signal, setSignal] = useState(false), [notice, setNotice] = useState(''), [json, setJson] = useState('');
  useEffect(()=>{if('logic'in filter)setLogic(filter.logic);window.dispatchEvent(new CustomEvent('tail:filter-context',{detail:filter}));},[filter]);
  useEffect(() => {
    let stopped = false; setBusy(true); setError(''); setResult(null);
    void discoverMarket(category, submittedQuery, revision > 0).then(r => { if (!stopped) setResult(r); }).catch(e => { if (!stopped) setError(e instanceof Error ? e.message : 'Discovery source unavailable'); }).finally(() => { if (!stopped) setBusy(false); });
    return () => { stopped = true; };
  }, [category, submittedQuery, revision]);
  const evaluated = useMemo(() => (result?.items ?? []).map(source => { const snapshot = now - source.fetchedAt > MARKET_TTL.price ? markSnapshotStale(source) : source; return { snapshot, result: evaluateFilter(snapshot, filter) }; }), [result, filter, now]);
  const matches = sortMarketSnapshots(evaluated.filter(x => x.result === 'match').map(x => x.snapshot), sortField, direction);
  const unknown = evaluated.filter(x => x.result === 'unknown').length;
  const setCategoryAndSort = (next: DiscoveryCategory) => { setCategory(next); setSortField(next === 'new' ? 'ageMinutes' : next === 'volume' ? 'volume24h' : next === 'gainers' || next === 'losers' ? 'change24h' : next === 'liquidity' ? 'liquidityUsd' : 'volume1h'); setDirection(next === 'new' || next === 'losers' ? 'asc' : 'desc'); };
  function persist(next: FilterPreset[]) { writeFilterPresets(next); setPresets(next); }
  return <section className="tool-page v2-market" aria-label="Advanced token discovery">
    <h2>Advanced token discovery</h2>
    <div className="tool-actions">{CATEGORIES.map(c => <button key={c.id} aria-pressed={category === c.id} onClick={() => setCategoryAndSort(c.id)}>{c.name}</button>)}</div>
    <form className="tool-form" onSubmit={e => { e.preventDefault(); setSubmittedQuery(query.trim()); setRevision(v => v + 1); }}>
      <label>Solana search sample<input aria-label="Advanced token search" value={query} maxLength={120} onChange={e => setQuery(e.target.value)} placeholder="Token name or exact mint" /></label>
      <button disabled={busy}>Search / refresh sample</button><label><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />Auto-refresh sample every 30s while visible</label>
    </form>
    <p>{result?.warning ?? 'Discovery uses free public Solana sources. Unknown fields remain unavailable.'}</p>
    {result && <small>Fetched {new Date(result.fetchedAt).toLocaleString()} · {result.items.length} covered mints{result.partial ? ' · partial coverage' : ''}</small>}
    <button disabled={busy||!result?.items.length} onClick={async()=>{if(!result)return;setBusy(true);setNotice('');try{const items=await enrichMintEvidence(result.items);setResult({...result,items});setNow(Date.now());setNotice('Loaded available authority/program evidence for at most 8 mints and holder samples for 4. Unsupported fields remain unavailable.');}catch(e){setNotice(e instanceof Error?e.message:'Mint evidence unavailable');}finally{setBusy(false);}}}>Load on-chain filter evidence</button>
    {busy && <p role="status">Loading Solana market sample…</p>}{error && <p role="alert" className="tail-error">{error}</p>}
    <fieldset><legend>Local filter and custom signal builder</legend>
      <p>Rules run locally over this sample. Missing or stale evidence produces Unknown. Pool age is not mint launch age. Lifecycle, authority, holder and wallet fields need separate verified evidence.</p>
      <form className="tool-form" onSubmit={e => {
        e.preventDefault(); setNotice('');
        const rule = { field, op, ...(['exists', 'missing'].includes(op) ? {} : { value: filterValue(field, value) }) };
        const next = { logic:'logic'in filter&&filter.rules.length?filter.logic:logic, rules: [...('logic' in filter ? filter.rules : [filter]), rule] };
        const validation = validateFilter(next); if (validation.valid) setFilter(validation.filter!); else setNotice(validation.errors.join('; '));
      }}>
        <label>Match rules<select aria-label="Filter logic" value={logic} onChange={e => { const next = e.target.value as 'and' | 'or'; setLogic(next); if ('logic' in filter && filter.rules.length) setFilter({ ...filter, logic: next }); }}><option value="and">All (AND)</option><option value="or">Any (OR)</option></select></label>
        <label>Field<select aria-label="Filter field" value={field} onChange={e => { setField(e.target.value as MarketField); setOp('eq'); setValue(MARKET_FIELDS[e.target.value as MarketField] === 'boolean' ? 'true' : ''); }}>{Object.keys(MARKET_FIELDS).map(f => <option key={f}>{f}</option>)}</select></label>
        <label>Operator<select aria-label="Filter operator" value={op} onChange={e => setOp(e.target.value)}>{['eq', 'neq', ...(MARKET_FIELDS[field] === 'number' ? ['gt', 'gte', 'lt', 'lte'] : []), 'exists', 'missing'].map(o => <option key={o}>{o}</option>)}</select></label>
        {!['exists', 'missing'].includes(op) && <label>Value{MARKET_FIELDS[field] === 'boolean' ? <select aria-label="Filter value" value={value} onChange={e => setValue(e.target.value)}><option>true</option><option>false</option></select> : <input aria-label="Filter value" value={value} onChange={e => setValue(e.target.value)} />}</label>}
        <button>Add rule</button><button type="button" onClick={() => { setFilter(EMPTY_FILTER); setNotice('Filters cleared.'); }}>Clear filters</button>
      </form>
      <ol>{('logic' in filter ? filter.rules : [filter]).map((r, i) => <li key={i}><code>{JSON.stringify(r)}</code> <button aria-label={`Remove rule ${i + 1}`} onClick={() => { const rules = ('logic' in filter ? filter.rules : [filter]).filter((_, n) => n !== i); setFilter(rules.length ? { logic, rules } : EMPTY_FILTER); }}>Remove</button></li>)}</ol>
      <div className="tool-form"><label>Sort field<select aria-label="Discovery sort" value={sortField} onChange={e => setSortField(e.target.value as MarketField)}>{Object.keys(MARKET_FIELDS).map(f => <option key={f}>{f}</option>)}</select></label><label>Direction<select aria-label="Sort direction" value={direction} onChange={e => setDirection(e.target.value as 'asc' | 'desc')}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label></div>
      <form className="tool-form" onSubmit={e => { e.preventDefault(); try { const name = presetName.trim(); if (!name) throw new Error('Preset needs a name'); persist([...presets, { version: 1, id: crypto.randomUUID(), name, filter, sort: { field: sortField, direction }, signal }]); setPresetName(''); setNotice('Saved locally. Custom signals evaluate in this open screen; no background delivery.'); } catch (e) { setNotice(e instanceof Error ? e.message : 'Local storage unavailable'); } }}>
        <label>Preset name<input aria-label="Filter preset name" value={presetName} maxLength={80} onChange={e => setPresetName(e.target.value)} /></label><label><input type="checkbox" checked={signal} onChange={e => setSignal(e.target.checked)} />Save as custom signal</label><button>Save filter preset</button>
      </form>
      {presets.filter(p => p.signal).map(p => { const values = (result?.items ?? []).map(s => evaluateFilter(now - s.fetchedAt > MARKET_TTL.price ? markSnapshotStale(s) : s, p.filter)); return <p key={p.id}>{p.name} signal: {values.filter(v => v === 'match').length} matches · {values.filter(v => v === 'unknown').length} Unknown · foreground sample only</p>; })}
      <div className="tool-actions">{presets.map(p => <span key={p.id}><button onClick={() => { setFilter(p.filter); setSortField(p.sort.field); setDirection(p.sort.direction); setNotice(`Loaded ${p.name}${p.signal ? ' · local custom signal' : ''}`); }}>{p.name}{p.signal ? ' · signal' : ''}</button><button aria-label={`Delete preset ${p.name}`} onClick={() => { try { persist(presets.filter(x => x.id !== p.id)); } catch { setNotice('Local storage unavailable'); } }}>×</button></span>)}<button onClick={() => downloadFile('tail-market-presets.json', exportFilterPresets(presets), 'application/json')}>Export presets</button></div>
      <details><summary>Nested rules / import presets</summary><label>Filter or preset JSON<textarea aria-label="Filter JSON" value={json} maxLength={131072} rows={6} onChange={e => setJson(e.target.value)} /></label><div className="tool-actions"><button onClick={() => { try { const v = validateFilter(JSON.parse(json)); if (!v.valid) throw new Error(v.errors.join('; ')); setFilter(v.filter!); setNotice('Nested filter applied.'); } catch (e) { setNotice(e instanceof Error ? e.message : 'Invalid JSON'); } }}>Apply filter JSON</button><button onClick={() => setJson(JSON.stringify(filter, null, 2))}>Copy current filter to editor</button><button onClick={() => { try { const imported = importFilterPresets(json); persist(imported); setNotice(`Imported ${imported.length} validated presets.`); } catch (e) { setNotice(e instanceof Error ? e.message : 'Invalid preset JSON'); } }}>Import presets</button></div></details>
      {notice && <p role="status">{notice}</p>}
    </fieldset>
    <p aria-live="polite">{matches.length} matches · {unknown} Unknown (missing or stale evidence){signal ? ' · custom signal is foreground only' : ''}</p>
    <div className="activity-table"><table><thead><tr><th>Token</th><th>Price USD</th><th>Market cap</th><th>Liquidity</th><th>24h volume</th><th>24h change</th><th>Pool age</th><th>Source / coverage</th><th>Open</th></tr></thead><tbody>{matches.map(s => <tr key={s.mint}><td title={s.mint}>{s.metadata.value?.symbol || shortAddr(s.mint)}<br /><small>{shortAddr(s.mint)}</small></td>{(['priceUsd', 'marketCap', 'liquidityUsd', 'volume24h', 'change24h', 'ageMinutes'] as const).map(f => <td key={f} title={evidenceTitle(s, f)}>{marketValueLabel(s, f)}</td>)}<td><details><summary>Evidence</summary>{(['priceUsd', 'marketCap', 'liquidityUsd', 'volume24h', 'ageMinutes'] as const).map(f => <p key={f}>{f}: {evidenceTitle(s, f)}</p>)}<p>Lifecycle / security: unavailable</p></details></td><td><button onClick={() => selectMint(s.mint)}>Open {s.metadata.value?.symbol || shortAddr(s.mint)}</button></td></tr>)}</tbody></table></div>
    {!busy && !matches.length && <p>No matching covered tokens. Unknown evidence does not satisfy numeric rules.</p>}
    <MarketDiagnostics />
  </section>;
}
