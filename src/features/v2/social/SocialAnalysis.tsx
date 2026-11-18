import { useEffect, useRef, useState } from 'react';
import type { AxiomCoin } from '../../../lib/axiom';
import { errorMessage } from '../../../lib/validation';
import { getMarketSnapshot } from '../market/snapshot';
import type { MarketSnapshot } from '../market/types';
import { downloadFile, useBrowserData } from '../storage';
import { extractSolanaCandidates, importSocialNotes, MAX_SOCIAL_TEXT, parseSocialNotes, publicSocialUrl } from './analysis';
import './social.css';

export type SocialAnalysisProps = { coin?: AxiomCoin | null; selectMint: (mint: string) => void; initialText?: string };
export function SocialAnalysis({ coin, selectMint, initialText = '' }: SocialAnalysisProps) {
  const [text, setText] = useState(initialText), [results, setResults] = useState<Array<{ mint: string; snapshot?: MarketSnapshot; error?: string }>>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState(''), [url, setUrl] = useState('');
  const { value: notes, update, storageError } = useBrowserData('social-notes', parseSocialNotes, []);
  const generation = useRef(0);
  useEffect(() => { setText(initialText.slice(0, MAX_SOCIAL_TEXT)); setResults([]); generation.current++; setBusy(false); }, [initialText]);
  useEffect(() => () => { generation.current++; }, []);
  const analyze = async () => {
    const run = ++generation.current, candidates = extractSolanaCandidates(text);
    setBusy(true); setError(''); setResults(candidates.map(mint => ({ mint })));
    if (!candidates.length) setError('No valid 32-byte Solana address candidates in this text.');
    // Three bounded concurrent source requests. No social URL is fetched.
    const rows: typeof results = [];
    for (let i = 0; i < candidates.length; i += 3) {
      rows.push(...await Promise.all(candidates.slice(i, i + 3).map(async mint => {
        try { return { mint, snapshot: await getMarketSnapshot(mint) }; }
        catch (e) { return { mint, error: errorMessage(e) }; }
      })));
      if (generation.current !== run) return;
      setResults([...rows]);
    }
    if (generation.current === run) setBusy(false);
  };
  return <section className="v2-social" aria-label="Manual social analysis">
    <p className="v2-social-kicker">SOLANA MAINNET · USER-PROVIDED CONTENT</p>
    <h2>Social notes</h2>
    <p>Paste an X post, Telegram message or public text. Analysis extracts exact-case address candidates and looks up public Solana markets. It does not verify a claim, identify an author or measure sentiment.</p>
    <label>Public text<textarea aria-label="Public social text" maxLength={MAX_SOCIAL_TEXT} value={text} onChange={e => { generation.current++; setBusy(false); setResults([]); setText(e.target.value); }} placeholder="Paste public content here…" /></label>
    <div className="v2-social-actions"><button disabled={busy || !text.trim()} onClick={() => void analyze()}>{busy ? 'Checking public sources…' : 'Analyze pasted text'}</button><small>{text.length}/{MAX_SOCIAL_TEXT} · up to 12 candidates</small></div>
    {error && <p role="status">{error}</p>}
    {results.map(row => <article key={row.mint}><code>{row.mint}</code><p>{row.snapshot?.metadata.value ? `Source-confirmed Solana market · ${row.snapshot.metadata.value.symbol} · ${row.snapshot.metadata.value.name}` : `Address candidate · ${row.error || row.snapshot?.warning || 'mint status unconfirmed'}`}</p>
      {row.snapshot?.metadata.value && <><small>DexScreener · fetched {new Date(row.snapshot.fetchedAt).toLocaleString()}. Indexed market match; no social endorsement.</small><button onClick={() => selectMint(row.mint)}>Open token in TAIL</button></>}
    </article>)}
    <h3>Saved links & notes</h3><p>Links open only when you click them. URL content is not fetched; paste the permitted content above. Notes are private to this browser origin.</p>
    <label>Public HTTPS link<input aria-label="Social link URL" value={url} maxLength={2048} onChange={e => setUrl(e.target.value)} placeholder="https://x.com/… or https://t.me/…" /></label>
    <label>Your note<textarea aria-label="Social note" maxLength={4000} value={note} onChange={e => setNote(e.target.value)} /></label>
    <button onClick={() => {
      setError(''); const safe = url.trim() ? publicSocialUrl(url.trim()) : '';
      if (url.trim() && !safe) { setError('Use a public HTTPS URL without credentials.'); return; }
      if (!note.trim() && !safe) { setError('Add a link or a note.'); return; }
      if (notes.length >= 100) { setError('Limit reached: export or remove notes before adding more.'); return; }
      void update([{ id: crypto.randomUUID(), mint: coin?.address ?? null, url: safe || '', note: note.trim(), at: Date.now() }, ...notes]); setNote(''); setUrl('');
    }}>Save {coin ? `${coin.symbol} ` : ''}note</button>
    {storageError && <p role="alert">{storageError}</p>}
    <div className="v2-social-actions"><button onClick={() => downloadFile('tail-social-notes.json', JSON.stringify({ version: 1, notes }, null, 2))}>Export notes</button><label className="v2-social-import">Import notes<input aria-label="Import social notes" type="file" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 600000) throw new Error('Import exceeds 600 KB.'); const imported = importSocialNotes(await file.text()); const merged = [...new Map([...notes, ...imported].map(n => [n.id, n])).values()]; if (merged.length > 100) throw new Error('Merged notes exceed 100 entries.'); await update(merged); setError(''); } catch (e) { setError(errorMessage(e)); } }} /></label></div>
    {!notes.length && <p>No saved social notes.</p>}
    {notes.map(n => <article key={n.id}><small>{new Date(n.at).toLocaleString()} · {n.mint || 'Unassigned note'}</small>{n.url && <a href={n.url} target="_blank" rel="noopener noreferrer">{n.url}</a>}<p className="v2-social-note">{n.note}</p><button onClick={() => void update(notes.filter(x => x.id !== n.id))}>Remove note</button></article>)}
  </section>;
}
export default SocialAnalysis;
