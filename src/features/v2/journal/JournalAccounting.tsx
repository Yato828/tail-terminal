import { useEffect, useMemo, useState } from 'react';
import type { AxiomCoin } from '../../../lib/axiom';
import { fmtUsd, shortAddr } from '../../../lib/format';
import { errorMessage, isSolanaAddress } from '../../../lib/validation';
import type { Evidence } from '../contracts';
import { weightedAverageAccounting, decimalProduct, csvExport, type AccountingEntry } from '../intelligence/accounting';
import { getMarketSnapshot } from '../market/snapshot';
import { MARKET_TTL } from '../market/cache';
import { downloadFile, useBrowserData } from '../storage';
import { parseJournal, type JournalEntry } from './model';
import '../intelligence/intelligence.css';

export type TransferDirections = Record<string, 'in' | 'out'>;
export type JournalAccountingOptions = { openingKnown?: boolean; transferDirections?: TransferDirections; marks?: Record<string, number | null> };
/** Journal quantities/prices are already stored as JS numbers. Preserve those
 * decimal values exactly; do not claim to recover precision lost before storage. */
export function accountManualJournal(raw: readonly JournalEntry[], options: JournalAccountingOptions = {}) {
  const rows = parseJournal(raw);
  const issues: Array<{ id: string; mint: string; reason: string }> = [];
  const entries: AccountingEntry[] = [];
  for (const r of rows) {
    if (r.side === 'note') continue;
    if (r.quantity === null || r.quantity <= 0) { issues.push({ id: r.id, mint: r.mint, reason: 'Quantity is missing or zero; this record cannot establish inventory.' }); continue; }
    const direction = options.transferDirections?.[r.id];
    if (r.side === 'transfer' && !direction) { issues.push({ id: r.id, mint: r.mint, reason: 'Transfer direction is unspecified; choose incoming or outgoing explicitly.' }); continue; }
    const usdTotal = r.priceUsd === null ? null : r.quantity * r.priceUsd;
    const validTotal = usdTotal !== null && Number.isFinite(usdTotal) ? usdTotal : null;
    if (r.side !== 'transfer' && validTotal === null) issues.push({ id: r.id, mint: r.mint, reason: 'Historical manual execution price is missing or out of range.' });
    if (r.feeUsd === null && r.side !== 'transfer') issues.push({ id: r.id, mint: r.mint, reason: 'Manual fee USD is unknown; enter an explicit zero only when known.' });
    entries.push({ id: r.id, at: r.at, mint: r.mint, kind: r.side === 'transfer' ? direction === 'in' ? 'transfer-in' : 'transfer-out' : r.side, quantity: r.quantity, quantityExact: r.quantity.toString(), usdTotal: validTotal, ...(r.priceUsd !== null ? {usdTotalExact: decimalProduct(r.quantity,r.priceUsd) ?? undefined} : {}), tradeFeeUsd: r.feeUsd });
  }
  const inputRejected = raw.length > 500 || raw.slice(0, 500).length !== rows.length;
  if (inputRejected) issues.push({ id: '', mint: '', reason: 'Invalid or duplicate stored records were excluded; complete opening history cannot be established.' });
  const incompleteInventory = inputRejected || rows.some(r => r.side !== 'note' && (r.quantity === null || r.quantity <= 0 || r.side === 'transfer' && !options.transferDirections?.[r.id]));
  const openingKnown = options.openingKnown === true && !incompleteInventory;
  const transfers=rows.filter(r=>r.side==='transfer');
  const transferFeesUsd=transfers.some(r=>r.feeUsd===null)?null:transfers.reduce((sum,r)=>sum+(r.feeUsd??0),0);
  return { ...weightedAverageAccounting(entries, options.marks ?? {}, openingKnown), transferFeesUsd, issues, mappedCount: entries.length, journalCount: rows.length, manual: true as const };
}

export type JournalAccountingProps = {
  entries?: readonly JournalEntry[];
  mint?: string;
  coin?: AxiomCoin | null;
  marketMark?: Evidence<number> | null;
};
const amount = (value: number | null) => value === null ? 'Unavailable' : fmtUsd(value);
export function JournalAccounting({ entries, mint = '', coin = null, marketMark = null }: JournalAccountingProps) {
  const store = useBrowserData('journal', parseJournal, []);
  const rows = useMemo(() => parseJournal(entries ?? store.value), [entries, store.value]);
  const [enabled, setEnabled] = useState(false);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{if(!enabled)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[enabled]);
  const [openingKnown, setOpeningKnown] = useState(false);
  const [directions, setDirections] = useState<TransferDirections>({});
  const [selectedMint, setSelectedMint] = useState(mint || coin?.address || rows[0]?.mint || '');
  const [manualMarkEnabled, setManualMarkEnabled] = useState(false);
  const [manualMarkText, setManualMarkText] = useState('');
  const [fetchedMark, setFetchedMark] = useState<{ mint: string; evidence: Evidence<number> } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { const clear=()=>{setEnabled(false);setOpeningKnown(false);setDirections({});setManualMarkEnabled(false);setManualMarkText('');setFetchedMark(null);setError('');};window.addEventListener('part:clear-data',clear);return()=>window.removeEventListener('part:clear-data',clear); },[]);
  useEffect(() => { if (isSolanaAddress(mint || coin?.address)) setSelectedMint(mint || coin!.address); }, [mint, coin?.address]);
  useEffect(() => { if (!selectedMint && rows[0]) setSelectedMint(rows[0].mint); }, [selectedMint, rows]);
  useEffect(() => { setManualMarkEnabled(false); setManualMarkText(''); setError(''); }, [selectedMint]);
  const mints = [...new Set([...rows.map(r => r.mint), ...(isSolanaAddress(mint) ? [mint] : []), ...(coin ? [coin.address] : [])])];
  const suppliedMark = (coin?.address || mint) === selectedMint ? marketMark : null;
  const evidence = fetchedMark?.mint === selectedMint ? fetchedMark.evidence : suppliedMark;
  const markStatus=evidence?.status==='ready'&&(now-evidence.fetchedAt>MARKET_TTL.price||evidence.fetchedAt>now+1000)?'stale':evidence?.status;
  const marketValue = markStatus === 'ready' && typeof evidence?.value === 'number' && Number.isFinite(evidence.value) && evidence.value > 0 ? evidence.value : null;
  const manualValue = manualMarkText.trim() && Number.isFinite(Number(manualMarkText)) && Number(manualMarkText) >= 0 ? Number(manualMarkText) : null;
  const mark = manualMarkEnabled ? manualValue : marketValue;
  const report = useMemo(() => enabled ? accountManualJournal(rows, { openingKnown, transferDirections: directions, marks: selectedMint ? { [selectedMint]: mark } : {} }) : null, [enabled, rows, openingKnown, directions, selectedMint, mark]);
  const selected = report?.positions.find(p => p.mint === selectedMint);
  async function refreshMark() {
    if (!isSolanaAddress(selectedMint)) return;
    const requestedMint = selectedMint;
    setBusy(true); setError('');
    try {
      const snapshot = await getMarketSnapshot(requestedMint, { force: true });
      if (snapshot.mint !== requestedMint) throw new Error('Market mark does not match selected Solana mint');
      const raw = snapshot.fields.priceUsd;
      const value = typeof raw.value === 'number' && Number.isFinite(raw.value) && raw.value > 0 ? raw.value : null;
      setFetchedMark({ mint: requestedMint, evidence: { ...raw, value, status: value === null ? 'unavailable' : raw.status } });
    } catch (e) {
      setFetchedMark({ mint: requestedMint, evidence: { value: null, source: 'Unavailable market source', fetchedAt: Date.now(), observedAt: null, status: 'error', note: errorMessage(e) } });
      setError(errorMessage(e));
    } finally { setBusy(false); }
  }
  return <section className="v2-journal-accounting" aria-label="Manual journal accounting">
    <h2>Manual journal accounting</h2>
    <p className="data-note">Optional estimates from your browser journal. Entries and signatures are user supplied, not verified executions or wallet balances.</p>
    <label className="check-label"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Calculate from manual journal records</label>
    {enabled && <>
      <div className="v2-intel-filters"><label>Accounting token<select aria-label="Accounting token" value={selectedMint} onChange={e => setSelectedMint(e.target.value)}><option value="">Select journal token</option>{mints.map(m => <option key={m} value={m}>{coin?.address === m ? coin.symbol : shortAddr(m)}</option>)}</select></label></div>
      <label className="check-label"><input aria-label="Complete manual opening history" type="checkbox" checked={openingKnown} onChange={e => setOpeningKnown(e.target.checked)} /> I confirm the journal includes every acquisition and disposal from a known zero opening balance.</label>
      <p className="data-note">Opening inventory is unknown by default. Missing quantities, transfer directions, prices or fees keep the affected accounting unavailable. This calculation uses the stored decimal quantities and cannot recover precision lost before journal entry.</p>
      {rows.some(r => r.side === 'transfer') && <details open><summary>Explicit manual transfer directions</summary>{rows.filter(r => r.side === 'transfer').map(r => <label className="v2-transfer-direction" key={r.id}>{shortAddr(r.mint)} · {r.quantity ?? 'Unknown'} units · {new Date(r.at).toLocaleString()}<select aria-label={`Transfer direction ${r.id}`} value={directions[r.id] ?? ''} onChange={e => setDirections(old => { const next = { ...old }; if (e.target.value) next[r.id] = e.target.value as 'in' | 'out'; else delete next[r.id]; return next; })}><option value="">Unknown direction</option><option value="in">Incoming · historical basis unknown</option><option value="out">Outgoing · no sale proceeds</option></select></label>)}</details>}
      <div className="tool-actions"><button disabled={busy || !isSolanaAddress(selectedMint)} onClick={() => void refreshMark()}>{busy ? 'Loading market mark…' : 'Fetch current market mark'}</button><label className="check-label"><input type="checkbox" checked={manualMarkEnabled} onChange={e => setManualMarkEnabled(e.target.checked)} /> Use a manual USD mark</label>{manualMarkEnabled && <label>Manual USD mark<input aria-label="Manual accounting mark USD" inputMode="decimal" value={manualMarkText} onChange={e => setManualMarkText(e.target.value)} /></label>}</div>
      <p className="data-note">Mark: {mark === null ? 'Unavailable' : fmtUsd(mark)} · {manualMarkEnabled ? 'Manual user input · not a fetched quote' : evidence ? `${evidence.source} · ${markStatus} · fetched ${new Date(evidence.fetchedAt).toLocaleString()} · observed ${evidence.observedAt === null ? 'Unknown' : new Date(evidence.observedAt).toLocaleString()}` : 'No current market evidence loaded'}</p>
      {(error || store.storageError) && <p role="alert" className="tool-error">{error || store.storageError}</p>}
      <p className="data-note">{report?.mappedCount ?? 0} priced/unpriced manual movements mapped from {rows.length} bounded journal records. Opening history: {report?.completeHistory ? 'user asserted complete' : 'incomplete or unknown'}. USD fees are the amounts entered in the journal; network fees are not independently verified. Transfer fees are excluded from trade PnL; their known manual subtotal is {amount(report?.transferFeesUsd??null)}.</p>
      {selected ? <div className="table-overflow"><table className="market-table"><thead><tr><th>Journal units</th><th>Remaining cost basis</th><th>Average unit cost</th><th>Realized PnL</th><th>Unrealized PnL</th></tr></thead><tbody><tr><td>{selected.quantityExact}</td><td>{amount(selected.costBasisUsd)}</td><td>{amount(selected.averageCostUsd)}</td><td>{amount(selected.realizedPnlUsd)}</td><td>{amount(selected.unrealizedPnlUsd)}</td></tr></tbody></table><p className="data-note">{selected.reasons.join(' · ') || 'Weighted-average cost using explicit manual execution prices and USD fees.'}</p></div> : <p>No quantified manual movements for this mint.</p>}
      {report?.issues.length ? <details><summary>Missing or excluded manual inputs · {report.issues.length}</summary>{report.issues.map((issue, i) => <p className="data-note" key={`${issue.id}:${i}`}>{issue.mint ? shortAddr(issue.mint) + ' · ' : ''}{issue.reason}</p>)}</details> : null}
      <button disabled={!report?.positions.length} onClick={() => { if (!report) return; downloadFile('tail-manual-accounting.csv', csvExport(['mint', 'quantity_exact', 'cost_basis_usd', 'average_cost_usd', 'realized_pnl_usd', 'unrealized_pnl_usd', 'provenance', 'opening_history_user_asserted', 'mark_source', 'limitations'], report.positions.map(p => [p.mint, p.quantityExact, p.costBasisUsd, p.averageCostUsd, p.realizedPnlUsd, p.unrealizedPnlUsd, 'manual journal input', report.completeHistory, p.mint === selectedMint ? manualMarkEnabled ? 'manual mark' : evidence?.source ?? 'unavailable' : 'unavailable', p.reasons.join('; ')])), 'text/csv;charset=utf-8'); }}>Export manual accounting CSV</button>
    </>}
  </section>;
}
export default JournalAccounting;
