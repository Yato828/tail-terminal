import { useEffect, useId, useRef, useState } from 'react';
import { Chart } from '../../../components/Chart';
import { isPoolAddr, searchAxioms, type AxiomCoin } from '../../../lib/axiom';
import { downloadChartJson, loadChartSettings, saveChartSettings, validateChartSettings, type ChartSettings } from './state';
import './charts.css';

type Slot = { id: string; mint: string | null; shared: boolean; sync: boolean };
type Preset = { version: 1; name: string; slots: Slot[]; settings: Record<string, ChartSettings> };
const STORAGE = 'tail:v2:chart-workbench';
function parseSlots(value: unknown): Slot[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 4) return null;
  const ids = new Set<string>(), slots: Slot[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^[a-z0-9-]{1,48}$/i.test(raw.id) || ids.has(raw.id)) return null;
    if (raw.mint !== null && (typeof raw.mint !== 'string' || !isPoolAddr(raw.mint))) return null;
    ids.add(raw.id); slots.push({ id: raw.id, mint: raw.mint, shared: raw.shared === true, sync: raw.sync === true });
  }
  return slots;
}
function initialSlots(): Slot[] {
  try { return parseSlots(JSON.parse(localStorage.getItem(STORAGE) ?? 'null')) ?? [{ id: 'chart-1', mint: null, shared: true, sync: false }]; }
  catch { return [{ id: 'chart-1', mint: null, shared: true, sync: false }]; }
}
const settingsKey = (id: string) => `workbench-${id}`;

function ChartSlot({ slot, index, coin, onChange, selectMint, remove, group }: { slot: Slot; index: number; coin: AxiomCoin | null; onChange: (slot: Slot) => void; selectMint: (mint: string) => void; remove: () => void; group: string }) {
  const [selected, setSelected] = useState<AxiomCoin | null>(slot.shared ? coin : null);
  const [query, setQuery] = useState(''), [results, setResults] = useState<AxiomCoin[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const run = useRef(0);
  useEffect(() => {
    if (slot.shared) { setSelected(coin); return; }
    if (!slot.mint) { setSelected(null); return; }
    if (selected?.address === slot.mint) return;
    let stopped = false;
    setBusy(true); setError('');
    searchAxioms(slot.mint).then(coins => {
      if (stopped) return;
      const result = coins.find(c => c.chainId === 'solana' && c.address === slot.mint) ?? null;
      setSelected(result);
      if (!result) setError('Saved Solana token source is unavailable. Search again to choose a current pool.');
    }).catch(() => { if (!stopped) { setSelected(null); setError('Token source unavailable. Retry search.'); } }).finally(() => { if (!stopped) setBusy(false); });
    return () => { stopped = true; };
  }, [slot.shared, slot.mint, coin]);
  useEffect(() => {
    const version = ++run.current;
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(() => {
      setBusy(true); setError('');
      searchAxioms(query.trim()).then(rows => { if (run.current === version) setResults(rows.filter(c => c.chainId === 'solana').slice(0, 8)); })
        .catch(() => { if (run.current === version) { setResults([]); setError('Solana search source unavailable.'); } })
        .finally(() => { if (run.current === version) setBusy(false); });
    }, 400);
    return () => { clearTimeout(timer); run.current++; };
  }, [query]);
  return <section className="v2-chart-slot" aria-label={`Independent chart ${index + 1}`}>
    <div className="v2-chart-slot-controls">
      <b>Chart {index + 1}{selected ? ` · ${selected.symbol}` : ''}</b>
      <label><input type="checkbox" checked={slot.shared} onChange={e => onChange({ ...slot, shared: e.target.checked, mint: e.target.checked ? null : selected?.address ?? null })} />Follow selected token</label>
      <label><input type="checkbox" checked={slot.sync} onChange={e => onChange({ ...slot, sync: e.target.checked })} />Sync crosshair</label>
      {selected && <button onClick={() => selectMint(selected.address)}>Use in terminal</button>}
      <button aria-label={`Remove chart ${index + 1}`} onClick={remove}>Remove</button>
    </div>
    <label className="v2-chart-search">Independent Solana token<input aria-label={`Search chart ${index + 1} token`} placeholder="Symbol or Solana mint" value={query} onChange={e => setQuery(e.target.value)} /></label>
    {!!query.trim() && <div className="v2-chart-search-results" role="list" aria-label={`Chart ${index + 1} token results`}>{results.map(result => <button key={`${result.address}:${result.pairAddress}`} onClick={() => { setSelected(result); onChange({ ...slot, shared: false, mint: result.address }); setQuery(''); setResults([]); }}>{result.symbol} · {result.name} · {result.address.slice(0, 6)}…{result.address.slice(-4)}</button>)}</div>}
    {busy && <p role="status">Loading Solana token source…</p>}{error && <p role="alert">{error}</p>}
    {selected ? <Chart key={`${slot.id}:${selected.address}:${selected.pairAddress}`} chartId={`workbench-${group}-${slot.id}`} settingsKey={settingsKey(slot.id)} syncGroup={slot.sync ? group : undefined} pool={selected.pairAddress} token={selected.address} symbol={selected.symbol} priceUsd={selected.priceUsd} mcap={selected.mcap} createdAt={selected.createdAt} /> : <p className="data-note">Select a Solana token to load real source candles.</p>}
  </section>;
}

export function ChartWorkbench({ coin, selectMint }: { coin: AxiomCoin | null; selectMint: (mint: string) => void }) {
  const group = useId();
  const [slots, setSlots] = useState<Slot[]>(initialSlots), [epoch, setEpoch] = useState(0);
  const [name, setName] = useState('Research charts'), [message, setMessage] = useState('');
  const [presets, setPresets] = useState<Preset[]>(() => { try { const rows = JSON.parse(localStorage.getItem(`${STORAGE}:presets`) ?? '[]'); return Array.isArray(rows) ? rows.filter(p => p?.version === 1 && typeof p.name === 'string' && parseSlots(p.slots)).slice(0, 12) : []; } catch { return []; } });
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify(slots)); } catch { setMessage('Storage unavailable; charts remain usable for this session.'); } }, [slots]);
  const snapshot = (): Preset => ({ version: 1, name: name.trim().slice(0, 60) || 'Saved charts', slots, settings: Object.fromEntries(slots.map(s => [s.id, loadChartSettings(settingsKey(s.id))])) });
  const apply = (input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('Invalid chart preset.');
    const raw = input as Partial<Preset>, parsed = parseSlots(raw.slots);
    if (raw.version !== 1 || !parsed) throw new Error('Preset must contain 1–4 valid Solana chart contexts.');
    for (const slot of parsed) { const settings = validateChartSettings(raw.settings?.[slot.id]); if (settings) saveChartSettings(settingsKey(slot.id), settings); }
    setSlots(parsed); setEpoch(v => v + 1); setName(typeof raw.name === 'string' ? raw.name.slice(0, 60) : 'Imported charts'); setMessage('Chart preset loaded. Token metadata and candles are refreshed from sources.');
  };
  return <div className="v2-chart-workbench">
    <div className="v2-chart-workbench-controls">
      <b>Chart workbench · {slots.length}/4</b>
      <button disabled={slots.length >= 4} onClick={() => setSlots(old => [...old, { id: `chart-${Date.now().toString(36)}`, mint: null, shared: false, sync: false }])}>Add independent chart</button>
      <label>Preset name<input value={name} maxLength={60} onChange={e => setName(e.target.value)} /></label>
      <button onClick={() => { const next = [snapshot(), ...presets.filter(p => p.name !== name.trim())].slice(0, 12); setPresets(next); try { localStorage.setItem(`${STORAGE}:presets`, JSON.stringify(next)); setMessage('Chart preset saved locally.'); } catch { setMessage('Could not persist preset; browser storage is unavailable.'); } }}>Save chart preset</button>
      <button onClick={() => downloadChartJson('tail-chart-preset.json', snapshot())}>Export chart preset</button>
      <button onClick={() => file.current?.click()}>Import chart preset</button>
      <input ref={file} type="file" accept="application/json,.json" hidden aria-label="Import chart preset file" onChange={async e => { const input = e.target.files?.[0]; if (!input) return; try { if (input.size > 100000) throw new Error('Preset file must be under 100 KB.'); apply(JSON.parse(await input.text())); } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid preset.'); } e.target.value = ''; }} />
      <button onClick={() => { setSlots([{ id: 'chart-1', mint: null, shared: true, sync: false }]); setEpoch(v => v + 1); }}>Reset chart layout</button>
    </div>
    {!!presets.length && <div className="v2-chart-workbench-controls">{presets.map((preset, i) => <span key={`${preset.name}:${i}`}><button onClick={() => { try { apply(preset); } catch { setMessage('Saved preset is invalid.'); } }}>{preset.name}</button><button aria-label={`Delete chart preset ${preset.name}`} onClick={() => { const next = presets.filter((_, n) => n !== i); setPresets(next); try { localStorage.setItem(`${STORAGE}:presets`, JSON.stringify(next)); } catch { setMessage('Could not persist deletion.'); } }}>×</button></span>)}</div>}
    {message && <p role="status">{message}</p>}
    <p className="data-note">Independent Solana mainnet chart contexts. Crosshair sync uses matching UTC candle times only; each chart retains its own interval, source and indicators. No candles appear until a token is selected.</p>
    <div className={`v2-chart-grid ${slots.length > 1 ? 'multiple' : ''}`}>{slots.map((slot, index) => <ChartSlot key={`${epoch}:${slot.id}`} slot={slot} index={index} coin={coin} selectMint={selectMint} group={group} onChange={updated => setSlots(old => old.map(s => s.id === slot.id ? updated : s))} remove={() => setSlots(old => old.length > 1 ? old.filter(s => s.id !== slot.id) : [{ id: 'chart-1', mint: null, shared: false, sync: false }])} />)}</div>
  </div>;
}
