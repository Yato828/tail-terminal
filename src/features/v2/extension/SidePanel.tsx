import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { fetchSolCoinByAddress, searchAxioms, type AxiomCoin } from '../../../lib/axiom';
import { errorMessage, isSolanaAddress, readLocal, saveLocal } from '../../../lib/validation';
import { PreferencesProvider, usePreferences } from '../../preferences/preferences';
import { tailSession } from '../../../services/backend/client';
import { getMarketSnapshot } from '../market/snapshot';
import type { MarketSnapshot } from '../market/types';
import { fetchWalletActivityV2, type ActivityRow } from '../intelligence/wallet';
import SocialAnalysis from '../social/SocialAnalysis';
import { CONTEXT_KEY, extensionChrome, parseSelectedContext } from './chrome';
import { CompactChart } from './CompactChart';
import './extension.css';
const SELECTED_KEY = 'tail.extension.selected.v2';
const parseMint = (v: unknown) => isSolanaAddress(v) ? v : '';
function Companion() {
  const { preferences, update, storageError } = usePreferences();
  const [coin, setCoin] = useState<AxiomCoin | null>(null), [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null), [query, setQuery] = useState(''), [hits, setHits] = useState<AxiomCoin[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [text, setText] = useState(''), [expiresAt, setExpiresAt] = useState(0), [watchlist, setWatchlist] = useState<string[]>([]), [wallet, setWallet] = useState(() => readLocal('tail.selectedWallet.v1', parseMint, ''));
  const [activity, setActivity] = useState<ActivityRow[]>([]), [walletBusy, setWalletBusy] = useState(false), [walletError, setWalletError] = useState(''), [walletStatus, setWalletStatus] = useState('');
  const request = useRef(0), walletRequest = useRef(0);
  const select = async (mint: string) => {
    const run = ++request.current; setBusy(true); setError(''); setHits([]); setCoin(null); setSnapshot(null);
    try {
      if (!isSolanaAddress(mint)) throw new Error('Invalid Solana mint.');
      const [next, evidence] = await Promise.all([fetchSolCoinByAddress(mint), getMarketSnapshot(mint)]);
      if (run !== request.current) return;
      if (!next || !evidence.metadata.value) throw new Error('No source-confirmed Solana market for this address candidate.');
      setCoin(next); setSnapshot(evidence);
      if (!saveLocal(SELECTED_KEY, mint)) setError('Selected token remains in this session; local storage unavailable.');
    } catch (e) { if (run === request.current) setError(errorMessage(e)); }
    finally { if (run === request.current) setBusy(false); }
  };
  useEffect(() => {
    const selected = readLocal(SELECTED_KEY, parseMint, ''); if (selected) void select(selected);
    void tailSession.watchlist().then(r => setWatchlist(r.items)).catch(e => setError(errorMessage(e)));
    const sync = (e: StorageEvent) => {
      if (e.key === SELECTED_KEY) { const mint = readLocal(SELECTED_KEY, parseMint, ''); if (mint) void select(mint); }
      if (e.key === 'tail.browser-data.v1') void tailSession.watchlist().then(r => setWatchlist(r.items)).catch(e => setError(errorMessage(e)));
    };
    window.addEventListener('storage', sync);
    const api = extensionChrome();
    const receive = (raw: unknown) => { const context = parseSelectedContext(raw); setText(context?.text || ''); setExpiresAt(context ? context.at + 1800000 : 0); };
    const changed = (changes: Record<string, { newValue?: unknown }>, area: string) => { if (area === 'session' && CONTEXT_KEY in changes) receive(changes[CONTEXT_KEY].newValue); if (area === 'session' && changes['tail.extension.error.v2']) { const raw = changes['tail.extension.error.v2'].newValue as { message?: string; at?: number }; if (raw?.at && Date.now() - raw.at < 60000) setError(raw.message || 'Page access unavailable.'); } };
    if (api?.storage) { void api.storage.session.get(CONTEXT_KEY).then(data => receive(data[CONTEXT_KEY])).catch(() => setError('Extension session storage unavailable. Paste text manually.')); api.storage.onChanged.addListener(changed); }
    return () => { request.current++; walletRequest.current++; window.removeEventListener('storage', sync); api?.storage?.onChanged.removeListener(changed); };
  }, []);
  useEffect(() => { if (!expiresAt) return; const timer = setTimeout(() => { setText(''); setExpiresAt(0); void extensionChrome()?.storage.session.remove(CONTEXT_KEY).catch(() => {}); }, Math.max(0, expiresAt - Date.now())); return () => clearTimeout(timer); }, [expiresAt]);
  const desk = (module?: string) => { const url = new URL('popup.html', location.href); url.search = new URLSearchParams({ view: 'desk', ...(coin ? { mint: coin.address } : {}), ...(module ? { module } : {}) }).toString(); return url.href; };
  const hosted = new URL('https://tail-solana-workspace.vercel.app/terminal'); if (coin) hosted.searchParams.set('mint', coin.address);
  const metric = (key: 'priceUsd' | 'liquidityUsd' | 'volume24h') => { const field = snapshot?.fields[key]; return typeof field?.value === 'number' ? `$${field.value.toLocaleString(undefined, { maximumSignificantDigits: 6 })}` : 'Unavailable'; };
  return <main className={`v2-companion theme-${preferences.theme}`} style={{ '--accent': preferences.accent } as CSSProperties}>
    <header><img src="tail-mascot/assets/rig/poster.png" alt="" onError={e => { e.currentTarget.hidden = true; }} /><div><b>TAIL</b><small>Solana mainnet companion</small></div><a href={desk()} target="_blank" rel="noopener noreferrer">Full workspace ↗</a></header>
    <section><h1>Token quick look</h1><form onSubmit={e => { e.preventDefault(); const run = ++request.current; setBusy(true); setError(''); setHits([]); void searchAxioms(query.trim()).then(rows => { if (run === request.current) { const valid = rows.filter(c => isSolanaAddress(c.address)); setHits(valid.slice(0, 8)); if (!valid.length) setError('No Solana market found.'); } }).catch(e => { if (run === request.current) setError(errorMessage(e)); }).finally(() => { if (run === request.current) setBusy(false); }); }}><input aria-label="Quick search Solana tokens" value={query} maxLength={120} onChange={e => setQuery(e.target.value)} placeholder="Token name or exact mint" /><button disabled={busy || !query.trim()}>Search</button></form>
      {busy && <p role="status">Loading public sources…</p>}{error && <p role="alert">{error}</p>}
      {hits.map(c => <button className="v2-token-hit" key={c.address} onClick={() => void select(c.address)}>{c.symbol} · {c.name}<small>{c.address}</small></button>)}
      {!coin && <p>Choose a token to view market evidence and source candles.</p>}
      {coin && <><h2>{coin.symbol} <small>{coin.name}</small></h2><code>{coin.address}</code><dl><div><dt>Price</dt><dd>{metric('priceUsd')}</dd></div><div><dt>Liquidity</dt><dd>{metric('liquidityUsd')}</dd></div><div><dt>24h volume</dt><dd>{metric('volume24h')}</dd></div></dl><small>DexScreener · fetched {snapshot && new Date(snapshot.fetchedAt).toLocaleString()} · manual refresh · pool metrics, not an endorsement</small><div className="v2-companion-actions"><button onClick={() => void select(coin.address)}>Refresh summary</button><button onClick={() => void tailSession.watch(coin.address, !watchlist.includes(coin.address)).then(r => setWatchlist(r.items)).catch(e => setError(errorMessage(e)))}>{watchlist.includes(coin.address) ? 'Remove from watchlist' : 'Add to watchlist'}</button><a href={hosted.href} target="_blank" rel="noopener noreferrer">Open in TAIL ↗</a></div><CompactChart coin={coin} /></>}
    </section>
    <section><h2>Watchlist</h2>{!watchlist.length && <p>No saved tokens.</p>}{watchlist.map(mint => <div className="v2-watch-row" key={mint}><button onClick={() => void select(mint)}>{mint}</button><button aria-label={`Remove watched ${mint}`} onClick={() => void tailSession.watch(mint, false).then(r => setWatchlist(r.items)).catch(e => setError(errorMessage(e)))}>×</button></div>)}</section>
    <section><h2>Public wallet tracker</h2><p>Read-only recent activity. A public address is not proof of ownership.</p><input aria-label="Tracked wallet address" value={wallet} maxLength={44} onChange={e => { walletRequest.current++; setWalletBusy(false); setActivity([]); setWalletStatus(''); setWallet(e.target.value); }} /><button disabled={walletBusy} onClick={() => { if (!isSolanaAddress(wallet)) { setWalletError('Enter a valid Solana wallet address.'); return; } const run = ++walletRequest.current; setWalletBusy(true); setWalletError(''); saveLocal('tail.selectedWallet.v1', wallet); void fetchWalletActivityV2(wallet).then(r => { if (run === walletRequest.current) { setActivity(r.rows); setWalletStatus(`Solana mainnet RPC · confirmed · fetched ${new Date(r.fetchedAt).toLocaleString()} · ${r.scope}. ${r.partial ? 'Some transaction details unavailable.' : r.rows.length ? 'Observed account deltas, not trade PnL.' : 'No activity rows returned in this bounded window.'}`); } }).catch(e => { if (run === walletRequest.current) setWalletError(errorMessage(e)); }).finally(() => { if (run === walletRequest.current) setWalletBusy(false); }); }}>{walletBusy ? 'Loading activity…' : 'Inspect wallet'}</button>{walletError && <p role="alert">{walletError}</p>}{walletStatus && <p role="status">{walletStatus}</p>}{activity.slice(0, 8).map((row, i) => <p key={row.id + i}><a target="_blank" rel="noopener noreferrer" href={`https://solscan.io/tx/${encodeURIComponent(row.hash)}`}>{row.kind}</a> · {row.delta === null ? 'Unavailable' : row.delta} · {row.at ? new Date(row.at).toLocaleString() : 'Event time unavailable'}</p>)}{isSolanaAddress(wallet) && <a target="_blank" rel="noopener noreferrer" href={`https://solscan.io/account/${wallet}`}>View wallet on Solscan ↗</a>}</section>
    <section><h2>Page context</h2><p>Scanning reads up to 16,000 visible text characters only after your click and Chrome's temporary active-tab grant. Invoke TAIL on the page first. Browser/store pages are unsupported.</p><button onClick={() => { const api = extensionChrome(); if (!api?.runtime?.sendMessage) { setError('Page scanning requires the installed Chrome extension. Paste text below.'); return; } void api.runtime.sendMessage({ type: 'TAIL_SCAN_ACTIVE_PAGE' }).then(r => { if (!r?.ok) setError(r?.error || 'Page access unavailable.'); else setError(''); }).catch(e => setError(errorMessage(e))); }}>Scan active page now</button><button onClick={() => { setText(''); setExpiresAt(0); void extensionChrome()?.storage.session.remove(CONTEXT_KEY).catch(() => setError('Could not clear session storage.')); }}>Clear captured text</button>{expiresAt > 0 && <small>Captured content expires {new Date(expiresAt).toLocaleTimeString()}.</small>}<SocialAnalysis coin={coin} selectMint={mint => void select(mint)} initialText={text} /></section>
    <section><h2>Appearance & shortcuts</h2><p>Settings and watchlists are shared with this extension's popup and full workspace. The website has separate browser storage.</p><label>Dark theme<select aria-label="Companion dark theme" value={preferences.theme} onChange={e => update({ theme: e.target.value as 'black' })}><option value="black">Warm black</option><option value="graphite">Graphite</option><option value="midnight">Midnight</option></select></label><label>Accent<select aria-label="Companion accent" value={preferences.accent} onChange={e => update({ accent: e.target.value })}><option value="#ff812e">TAIL orange</option><option value="#ff963b">Amber</option><option value="#e97842">Copper</option></select></label>{storageError && <p role="alert">Settings storage unavailable. Changes remain in this session.</p>}<nav><a href={desk()} target="_blank" rel="noopener noreferrer">Chart workspace ↗</a><a href={desk('wallet-tracker')} target="_blank" rel="noopener noreferrer">Wallet workspace ↗</a><a href={desk('social')} target="_blank" rel="noopener noreferrer">Social workspace ↗</a></nav></section>
  </main>;
}
export default function SidePanel() { return <PreferencesProvider><Companion /></PreferencesProvider>; }
