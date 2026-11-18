import { useState } from 'react';
import type { AxiomCoin } from '../../../lib/axiom';
import { FABLE_TOOL_DEFINITIONS, type FableToolName } from './toolSchemas';
import { runFableDataTool, type FableToolResult } from './tools';
import { useFableContext } from './context';
import { ProposalReview } from './ProposalReview';
import './fable.css';
const defaults = (name: FableToolName, coin: Pick<AxiomCoin, 'address' | 'symbol'> | null, wallet = '', interval = '1h'): Record<string, unknown> => {
  const mint = coin?.address ?? '';
  if (name === 'search_tokens') return { query: coin?.symbol || 'SOL' };
  if (name === 'compare_tokens') return { mints: mint ? [mint] : [] };
  if (name === 'get_wallet_comparison') return { addresses: [wallet, ''] };
  if (name === 'get_chart_data') return { mint, interval, limit: 100 };
  if (name === 'build_token_filter') return { name: 'Liquid Solana sample', filterJson: JSON.stringify({ logic: 'and', rules: [{ field: 'liquidityUsd', op: 'gte', value: 10000 }] }), sortField: 'volume24h', sortDirection: 'desc', proposeSave: true };
  if (name === 'configure_workspace') return { actions: [{ type: 'open_widget', widget: 'compare' }] };
  if (name === 'explain_chart_indicator') return { indicator: 'RSI' };
  if (name === 'explain_this_move') return { mint, from: null, to: null, interval };
  return { mint };
};
export function FableTools({ coin, wallet, tokenContext }: { coin: AxiomCoin | null; wallet?: string; tokenContext?: { mint: string; symbol: string } | null }) {
  const selected = coin ?? (tokenContext ? { address: tokenContext.mint, symbol: tokenContext.symbol } : null);
  const { context, range } = useFableContext(selected?.address ?? null);
  const [name, setName] = useState<FableToolName>('get_market_data'), [args, setArgs] = useState(() => JSON.stringify(defaults('get_market_data', selected, wallet), null, 2));
  const [result, setResult] = useState<FableToolResult | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true); setError(''); setResult(null);
    try { const parsed = JSON.parse(args); const output = await runFableDataTool(name, parsed); setResult(output); }
    catch (e) { setError(e instanceof Error ? e.message : 'Public source unavailable'); }
    finally { setBusy(false); }
  }
  return <section className="tool-page fable-local-tools" aria-label="Fable local data tools"><h2>Local data tools</h2><p>Factual source output and local computation. These tools work without AI configuration and make no model request. Public APIs may rate limit; unknown data stays unavailable.</p>
    <p>Context: {selected?.symbol ?? 'No token'} · {context.interval} · {context.chartMode} · {context.widgets.length} widgets. Personal portfolio sharing is off.</p>
    <form className="tool-form" onSubmit={e => { e.preventDefault(); void run(); }}><label>Read-only tool<select aria-label="Local data tool" value={name} disabled={busy} onChange={e => { const tool = e.target.value as FableToolName; setName(tool); setArgs(JSON.stringify(defaults(tool, selected, wallet, context.interval), null, 2)); setResult(null); setError(''); }}>{FABLE_TOOL_DEFINITIONS.map(([id]) => <option key={id}>{id}</option>)}</select></label><button disabled={busy}>Run local data tool</button><button type="button" disabled={busy} onClick={() => setArgs(JSON.stringify(defaults(name, selected, wallet, context.interval), null, 2))}>Use selected context</button></form>
    <p>{FABLE_TOOL_DEFINITIONS.find(d => d[0] === name)?.[1]}</p>
    <label>Validated tool arguments<textarea aria-label="Local tool arguments" value={args} maxLength={16000} rows={9} disabled={busy} onChange={e => setArgs(e.target.value)} /></label>
    {range && <button disabled={busy} onClick={() => { setName('explain_this_move'); setArgs(JSON.stringify({ mint: range.mint, from: range.from, to: range.to, interval: range.interval }, null, 2)); setResult(null); }}>Use selected chart range</button>}
    {!range && name === 'explain_this_move' && <p>Select a real chart range first or enter UTC millisecond bounds spanning at most seven days. No example market observations are inserted.</p>}
    {busy && <p role="status">Reading the selected public source…</p>}{error && <p role="alert" className="tail-error">{error}</p>}
    {result && <section aria-label="Factual local tool result"><h3>Factual tool output · no AI response</h3><p>{result.source} · fetched {new Date(result.fetchedAt).toISOString()} · source event time {result.observedAt ? new Date(result.observedAt).toISOString() : 'Unavailable'}</p>{result.scope && <p>{result.scope}</p>}{result.unavailable && <p role="status">{result.unavailable}</p>}<pre>{JSON.stringify(result.data, null, 2)}</pre><ProposalReview proposals={result.proposals} /></section>}
  </section>;
}
export default FableTools;
