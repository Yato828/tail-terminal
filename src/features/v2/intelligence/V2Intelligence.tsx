import { useEffect, useRef, useState } from 'react';
import type { V2TokenContext } from '../contracts';
import { isSolanaAddress, readLocal, saveLocal, errorMessage } from '../../../lib/validation';
import { EXPLORER } from '../../../lib/const';
import { fmtQty, fmtUsd, shortAddr } from '../../../lib/format';
import { parseWatchlist, type WatchedWallet } from '../../intelligence/walletData';
import { fetchWalletActivityV2, fetchWalletPortfolio, walletOverlap, type ActivityRow } from './wallet';
import { fetchTokenSecurity, type SecurityReport } from './security';
import { collectTokenSnapshot, listTokenSnapshots, compareTokenSnapshots, deleteTokenSnapshot } from './memory';
import { csvExport } from './accounting';
import './intelligence.css';
const TABS=['Wallets','Activity','Overlap','Portfolio','Security','Token Memory'] as const;
type Tab=typeof TABS[number];
type WatchHistory={at:number;address:string;action:string};
function download(name:string,content:string){const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function time(n:number|null|undefined){return n?new Date(n).toLocaleString():'Unknown';}
function Explorer({address,tx=false}:{address:string;tx?:boolean}){return <a href={`${EXPLORER}/${tx?'tx':'account'}/${address}`} target="_blank" rel="noopener noreferrer" title={address}>{shortAddr(address)} ↗</a>;}
export function V2Intelligence({coin,wallet,selectMint,selectWallet,initialView='Wallets'}:V2TokenContext&{initialView?:Tab}){
  const [tab,setTab]=useState<Tab>(initialView);
  useEffect(()=>setTab(initialView),[initialView]);
  const [wallets,setWallets]=useState(()=>readLocal('part.wallets.v1',parseWatchlist,[]));
  const [selected,setSelected]=useState(wallet??wallets[0]?.address??'');
  const [checked,setChecked]=useState<string[]>(wallets.slice(0,3).map(w=>w.address));
  const [address,setAddress]=useState(''),[label,setLabel]=useState('');
  const [history,setHistory]=useState<WatchHistory[]>(()=>readLocal('tail.v2.wallet-history',r=>Array.isArray(r)?r.filter(h=>h&&Number.isFinite(h.at)&&isSolanaAddress(h.address)&&typeof h.action==='string').slice(-200):[],[]));
  const [rows,setRows]=useState<ActivityRow[]>([]),[activityAt,setActivityAt]=useState<number|null>(null);
  const [portfolio,setPortfolio]=useState<Awaited<ReturnType<typeof fetchWalletPortfolio>>|null>(null);
  const [security,setSecurity]=useState<SecurityReport|null>(null);
  const [snapshots,setSnapshots]=useState(()=>listTokenSnapshots(coin?.address));
  const [compare,setCompare]=useState<string[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [filter,setFilter]=useState({wallet:'',mint:'',kind:'',since:'',minimum:'',program:''});
  const generation=useRef(0);
  const [poll,setPoll]=useState(false);
  const [before,setBefore]=useState<string|undefined>();
  useEffect(()=>{if(wallet&&wallet!==selected){setSelected(wallet);setPortfolio(null);}},[wallet]);
  useEffect(()=>{generation.current++;setRows([]);setActivityAt(null);setPortfolio(null);setBefore(undefined);setBusy(false);setError('');},[selected,checked.join(',')]);
  useEffect(()=>{generation.current++;setSecurity(null);setBusy(false);setCompare([]);setSnapshots(listTokenSnapshots(coin?.address));setError('');},[coin?.address]);
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>{
    const clear=()=>{generation.current++;setWallets([]);setSelected('');setChecked([]);setHistory([]);setRows([]);setActivityAt(null);setPortfolio(null);setSecurity(null);setSnapshots([]);setCompare([]);setBefore(undefined);setError('');setBusy(false);setPoll(false);setAddress('');setLabel('');setFilter({wallet:'',mint:'',kind:'',since:'',minimum:'',program:''});};
    window.addEventListener('part:clear-data',clear);return()=>window.removeEventListener('part:clear-data',clear);
  },[]);
  const persist=(next:WatchedWallet[])=>{setWallets(next);if(!saveLocal('part.wallets.v1',next))setError('Browser storage unavailable; watchlist cannot survive reload.');};
  const record=(a:string,action:string)=>{const next=[...history,{at:Date.now(),address:a,action}].slice(-200);setHistory(next);saveLocal('tail.v2.wallet-history',next);};
  const update=(w:WatchedWallet,patch:Partial<WatchedWallet>,action='Updated label/group')=>{persist(wallets.map(x=>x.address===w.address?{...x,...patch,updatedAt:Date.now()}:x));if(action)record(w.address,action);};
  const choose=(a:string)=>{setSelected(a);saveLocal('part.wallet.selected',a);selectWallet?.(a);};
  async function load(force=true,more=false){
    const version=++generation.current;setBusy(true);setError('');
    try {
      if(tab==='Portfolio') {if(!isSolanaAddress(selected))throw new Error('Select or track a valid public wallet.');const result=await fetchWalletPortfolio(selected,force);if(version===generation.current)setPortfolio(result);}
      else if(tab==='Security') {if(!coin)throw new Error('Select a token in the terminal first.');const result=await fetchTokenSecurity(coin,force);if(version===generation.current)setSecurity(result);}
      else {
        const chosen=tab==='Overlap'||selected==='*'?checked.slice(0,3):selected?[selected]:[];
        if(!chosen.length)throw new Error('Select public wallets before loading activity.');
        const results=await Promise.allSettled(chosen.map(a=>fetchWalletActivityV2(a,more?before:undefined,force)));
        if(version!==generation.current)return;
        const next=results.flatMap(r=>r.status==='fulfilled'?r.value.rows:[]).sort((a,b)=>(b.at??0)-(a.at??0));
        setRows(old=>more?[...old,...next.filter(r=>!old.some(o=>o.id===r.id))]:next);setActivityAt(Date.now());
        setBefore(results.length===1&&results[0].status==='fulfilled'?results[0].value.before:undefined);
        if(results.some(r=>r.status==='rejected'||r.value.partial))setError('Some transaction details are unavailable or rate limited. Available rows are retained.');
        if(!next.length&&results.every(r=>r.status==='rejected'))setError(results.map(r=>r.status==='rejected'?errorMessage(r.reason):'').join(' · '));
      }
    }catch(e){if(version===generation.current)setError(errorMessage(e));}finally{if(version===generation.current)setBusy(false);}
  }
  useEffect(()=>{if(!poll||!['Activity','Overlap'].includes(tab))return;const timer=setInterval(()=>{if(!document.hidden&&!busy)void load(false);},30000);return()=>clearInterval(timer);},[poll,tab,busy,selected,checked.join(',')]);
  const changeTab=(next:Tab)=>{generation.current++;setBusy(false);setError('');setTab(next);};
  const filtered=rows.filter(r=>(!filter.wallet||r.wallet===filter.wallet)&&(!filter.mint||r.mint.includes(filter.mint))&&(!filter.kind||r.kind===filter.kind)&&(!filter.since||(r.at!==null&&r.at>=Date.parse(filter.since)))&&(!filter.minimum||(r.delta!==null&&Math.abs(r.delta)>=Number(filter.minimum)))&&(!filter.program||r.programs.some(p=>p.includes(filter.program))));
  const overlap=walletOverlap(rows,checked);
  const activityCsv=()=>csvExport(['wallet','signature','mint','action','delta_ui','delta_raw','decimals','fee_sol_if_payer','observed_at','fetched_at','source','programs','note'],filtered.map(r=>[r.wallet,r.hash,r.mint,r.kind,r.delta,r.rawDelta,r.decimals,r.feeSol,r.at?new Date(r.at).toISOString():null,new Date(r.fetchedAt).toISOString(),r.source,r.programs.join(' '),r.note]));
  const comparedSnapshots=compare.map(id=>snapshots.find(s=>s.id===id));
  const comparisonMint=comparedSnapshots[0]?.mint;
  const [comparisonFrom,comparisonTo]=comparedSnapshots;
  const comparison=comparedSnapshots.length===2&&comparisonFrom&&comparisonTo&&comparisonFrom.mint===comparisonTo.mint?compareTokenSnapshots(comparisonFrom,comparisonTo):[];
  return <section className="tool-page v2-intelligence" aria-label="TAIL Wallet and Token Intelligence">
    <header className="tool-heading"><div><small>SOLANA MAINNET / READ-ONLY INTELLIGENCE</small><h1>Wallet & Token Intelligence</h1><p>Public evidence, local watchlists and snapshots. No signatures required.</p></div>{['Activity','Overlap','Portfolio','Security'].includes(tab)&&<button disabled={busy} onClick={()=>void load()}>{busy?'Loading…':'Refresh evidence'}</button>}</header>
    <nav className="v2-intel-tabs" aria-label="Intelligence views">{TABS.map(t=><button key={t} aria-pressed={tab===t} onClick={()=>changeTab(t)}>{t}</button>)}</nav>
    {error&&<p role="alert" className="tool-error">{error}</p>}
    {['Activity','Portfolio'].includes(tab)&&<label className="v2-intel-select">Public wallet<select aria-label="Selected public wallet" value={selected} onChange={e=>choose(e.target.value)}><option value="">Select wallet</option>{tab==='Activity'&&<option value="*">Shared feed · selected comparison wallets (max 3)</option>}{wallet&&!wallets.some(w=>w.address===wallet)&&<option value={wallet}>{shortAddr(wallet)}</option>}{wallets.map(w=><option key={w.address} value={w.address}>{w.label} · {shortAddr(w.address)}</option>)}</select></label>}
    {tab==='Wallets'&&<>
      <form className="tool-form inline-form" onSubmit={e=>{e.preventDefault();const a=address.trim();if(!isSolanaAddress(a)){setError('Enter a valid case-sensitive Solana public key.');return;}if(wallets.some(w=>w.address===a)){setError('Wallet already tracked.');return;}if(wallets.length>=20){setError('Maximum 20 locally tracked wallets.');return;}const now=Date.now();persist([...wallets,{address:a,label:label.trim()||shortAddr(a),pinned:false,color:'#ff974f',group:'Personal Watchlist',favorite:false,addedAt:now,updatedAt:now}]);record(a,'Started tracking');choose(a);setChecked(c=>c.length<3?[...c,a]:c);setAddress('');setLabel('');setError('');}}>
      <label>Public Solana address<input aria-label="Track public wallet address" maxLength={44} value={address} onChange={e=>setAddress(e.target.value)}/></label><label>Label<input aria-label="New wallet label" maxLength={48} value={label} onChange={e=>setLabel(e.target.value)}/></label><button className="primary-action">Track wallet</button></form>
      {!wallets.length&&<p className="data-note">No tracked wallets. Add a public address to begin.</p>}
      <div className="v2-wallet-list">{[...wallets].sort((a,b)=>Number(!!b.favorite)-Number(!!a.favorite)||Number(b.pinned)-Number(a.pinned)).map(w=><article key={w.address} style={{borderLeftColor:w.color??'#ff974f'}}>
      <Explorer address={w.address}/><input aria-label={`Wallet name ${w.address}`} value={w.label} maxLength={48} onChange={e=>update(w,{label:e.target.value},'')} onBlur={()=>record(w.address,'Edited label')}/>
      <input aria-label={`Wallet color ${w.address}`} type="color" value={w.color??'#ff974f'} onChange={e=>update(w,{color:e.target.value},'Changed color')}/>
      <input aria-label={`Wallet group ${w.address}`} list="tail-wallet-groups" value={w.group??''} placeholder="Group" maxLength={40} onChange={e=>update(w,{group:e.target.value},'')} onBlur={()=>record(w.address,'Edited group')}/>
      <button aria-label={`Favorite ${w.address}`} aria-pressed={!!w.favorite} onClick={()=>update(w,{favorite:!w.favorite},w.favorite?'Removed favorite':'Added favorite')}>{w.favorite?'★':'☆'}</button><button onClick={()=>{choose(w.address);changeTab('Activity');}}>Activity</button><button onClick={()=>{choose(w.address);changeTab('Portfolio');}}>Portfolio</button><button aria-label={`Delete wallet ${w.address}`} onClick={()=>{persist(wallets.filter(x=>x.address!==w.address));setChecked(c=>c.filter(x=>x!==w.address));if(selected===w.address)choose('');record(w.address,'Stopped tracking');}}>Remove</button><small>Tracked {time(w.addedAt)}</small>
      </article>)}</div><datalist id="tail-wallet-groups">{['Smart Money','Developers','KOLs','Personal Watchlist'].map(g=><option key={g}>{g}</option>)}</datalist>
      <p className="data-note">Groups and labels are user supplied. “Smart Money”, “Developer” and “KOL” do not verify identity or performance.</p>
      <details><summary>Local tracking history · {history.length}</summary>{[...history].reverse().slice(0,50).map((h,i)=><p key={`${h.at}:${i}`}>{time(h.at)} · {h.action} · {shortAddr(h.address)}</p>)}</details>
    </>}
    {tab==='Activity'&&<>
      <div className="v2-intel-filters"><label>Wallet<select aria-label="Activity wallet filter" value={filter.wallet} onChange={e=>setFilter({...filter,wallet:e.target.value})}><option value="">All loaded wallets</option>{wallets.map(w=><option key={w.address} value={w.address}>{w.label}</option>)}</select></label><label>Token / mint<input aria-label="Activity token filter" value={filter.mint} onChange={e=>setFilter({...filter,mint:e.target.value})}/></label><label>Action<select aria-label="Activity action filter" value={filter.kind} onChange={e=>setFilter({...filter,kind:e.target.value})}><option value="">All actions</option>{['received','sent','sol-delta','failed','unavailable','no-change'].map(k=><option key={k}>{k}</option>)}</select></label><label>Since (local time)<input type="datetime-local" value={filter.since} onChange={e=>setFilter({...filter,since:e.target.value})}/></label><label>Minimum absolute token units<input aria-label="Minimum activity units" type="number" min="0" value={filter.minimum} onChange={e=>setFilter({...filter,minimum:e.target.value})}/></label><label>Source program<input aria-label="Activity program filter" value={filter.program} onChange={e=>setFilter({...filter,program:e.target.value})}/></label></div>
      <div className="tool-actions"><button disabled={!rows.length} onClick={()=>download('tail-wallet-activity.csv',activityCsv())}>Export activity CSV</button><label><input type="checkbox" checked={poll} onChange={e=>setPoll(e.target.checked)}/> Refresh every 30s while visible</label></div>
      <p className="data-note">Latest 12 confirmed signatures per page. Net changes include transfers, fees and rent; buy/sell classification is unavailable without verified execution decoding. Failed transactions can still pay a fee.</p>
      <div className="table-overflow"><table className="market-table"><thead><tr><th>Wallet / observed</th><th>Asset</th><th>Action / delta</th><th>Fee paid SOL</th><th>Transaction</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{wallets.find(w=>w.address===r.wallet)?.label??shortAddr(r.wallet)}<br/>{time(r.at)}</td><td>{isSolanaAddress(r.mint)?<button title={r.mint} onClick={()=>selectMint(r.mint)}>{shortAddr(r.mint)}</button>:r.mint||'Unknown'}</td><td title={r.note}>{r.kind}<br/>{r.delta===null?'Unavailable':fmtQty(r.delta)}</td><td>{r.feeSol===null?'Not payer / unknown':r.feeSol}</td><td><Explorer address={r.hash} tx/><details><summary>Programs / source</summary><p>{r.programs.join('\n')||'Unavailable'}</p><small>{r.source} · fetched {time(r.fetchedAt)}</small></details></td></tr>)}</tbody></table></div>{!rows.length&&<p>No activity loaded. Choose a wallet and refresh evidence.</p>}<p className="data-note">Last fetched {time(activityAt)}</p>{before&&<button disabled={busy} onClick={()=>void load(false,true)}>Load older 12 signatures</button>}
    </>}
    {tab==='Overlap'&&<>
      <p>Select up to three public wallets, then refresh evidence. Overlap describes observed token activity, not current ownership or coordinated trading.</p>
      <div className="tool-actions">{wallets.map(w=><label key={w.address}><input type="checkbox" checked={checked.includes(w.address)} disabled={!checked.includes(w.address)&&checked.length>=3} onChange={e=>setChecked(c=>e.target.checked?[...c,w.address]:c.filter(a=>a!==w.address))}/>{w.label}</label>)}</div>
      <div className="table-overflow"><table className="market-table"><thead><tr><th>Wallet comparison</th><th>Signatures sampled</th><th>Token assets</th><th>Received / sent events</th><th>Observed network fees SOL</th></tr></thead><tbody>{checked.map(a=>{const sample=rows.filter(r=>r.wallet===a),txs=new Set(sample.map(r=>r.hash));const fees=[...new Map(sample.map(r=>[r.hash,r.feeSol])).values()];return <tr key={a}><td>{wallets.find(w=>w.address===a)?.label??shortAddr(a)}</td><td>{sample.length?txs.size:'Not loaded'}</td><td>{sample.length?new Set(sample.filter(r=>isSolanaAddress(r.mint)).map(r=>r.mint)).size:'Not loaded'}</td><td>{sample.length?`${sample.filter(r=>r.kind==='received').length} / ${sample.filter(r=>r.kind==='sent').length}`:'Not loaded'}</td><td>{fees.some(f=>f!==null)?fees.reduce<number>((s,f)=>s+(f??0),0):'Unavailable'}</td></tr>;})}</tbody></table></div>
      <h2>Wallet Overlap</h2>{overlap.map(o=><article className="v2-overlap-row" key={o.mint}><button onClick={()=>selectMint(o.mint)}>{shortAddr(o.mint)}</button><span>{o.wallets.length} wallets · {o.events} balance events</span><small>{o.wallets.map(a=>wallets.find(w=>w.address===a)?.label??shortAddr(a)).join(', ')}</small></article>)}{!overlap.length&&<p className="data-note">{rows.length?'No shared token activity in this bounded sample.':'Load activity for the selected wallets to compare.'}</p>}<p className="data-note">Last fetch {time(activityAt)}. Full-history PnL, win rate, early-entry ranking and holding time are unavailable from this bounded sample.</p>
    </>}
    {tab==='Portfolio'&&<>
      {!portfolio&&<p>Choose a public wallet and refresh evidence to load SOL, SPL Token and Token-2022 accounts.</p>}
      {portfolio&&<><div className="metric-grid"><div><small>Known priced subtotal</small><strong>{portfolio.knownValueUsd===null?'Unavailable':fmtUsd(portfolio.knownValueUsd)}</strong></div><div><small>Unpriced holdings</small><strong>{portfolio.unpriced}</strong></div><div><small>Cost basis / realized / unrealized PnL</small><strong>Unavailable</strong></div></div>
      {portfolio.errors.map((e,i)=><p key={i} className="tool-error">{e}</p>)}<p className="data-note">{portfolio.note} Last fetched {time(portfolio.fetchedAt)}. Token-account rent reserves are not included in token valuation.</p>
      <button onClick={()=>download('tail-portfolio.csv',csvExport(['wallet','mint','symbol','raw_balance','decimals','quantity','program','accounts','price_usd','known_value_usd','price_source','price_fetched_at','balance_fetched_at','cost_basis_usd','realized_pnl_usd'],portfolio.holdings.map(h=>[portfolio.wallet,h.mint,h.symbol,h.rawAmount,h.decimals,h.quantity,h.program,h.accounts,h.priceUsd,h.valueUsd,h.priceSource,h.priceFetchedAt?new Date(h.priceFetchedAt).toISOString():null,new Date(portfolio.fetchedAt).toISOString(),null,null])))}>Export holdings CSV</button>
      <div className="table-overflow"><table className="market-table"><thead><tr><th>Asset</th><th>Balance</th><th>Current price</th><th>Value</th><th>Evidence</th></tr></thead><tbody>{portfolio.holdings.map(h=><tr key={h.mint}><td>{h.mint==='SOL'?'SOL':<button title={h.mint} onClick={()=>selectMint(h.mint)}>{h.symbol}</button>}</td><td title={`Raw ${h.rawAmount}; decimals ${h.decimals}`}>{fmtQty(h.quantity)}</td><td>{h.priceUsd===null?'Unavailable':fmtUsd(h.priceUsd)}</td><td>{h.valueUsd===null?'Unpriced':fmtUsd(h.valueUsd)}</td><td><small title={h.program}>{h.program==='native'?'Native SOL':h.program.startsWith('Tokenz')?'Token-2022':'SPL Token'} · {h.accounts} account(s)<br/>{h.priceSource} · {time(h.priceFetchedAt)}</small></td></tr>)}</tbody></table></div></>}
      <details><summary>Accounting method and limits</summary><p>Weighted average cost is available for explicitly priced execution records in the local accounting library. Incoming transfers, missing execution prices, unknown opening inventory and missing fee conversion propagate unknown cost basis. The read-only balance scan does not invent execution records. Native SOL deltas can include rent refunds on account closure. Network fees remain in SOL unless a historical USD price is supplied.</p></details>
    </>}
    {tab==='Security'&&<>
      {!coin?<p>Select a Solana token first.</p>:<><h2>{coin.symbol} / Security evidence</h2><p className="data-note">Each item has its own source and timestamp. A capability or concentration flag alone does not establish fraud.</p>{!security&&<p>Refresh evidence to inspect the confirmed mint account and sampled largest owners.</p>}
      {security&&<><div className="table-overflow"><table className="market-table"><thead><tr><th>Check</th><th>Evidence</th><th>Source / confidence</th></tr></thead><tbody>{security.checks.map(c=><tr key={c.key}><td>{c.title}<br/><small>{c.evidence.status}</small></td><td>{c.evidence.value??'Unavailable'}{c.key==='concentration'&&c.evidence.value!==null?'%':''}<p className="data-note">{c.evidence.note}</p></td><td>{c.evidence.source} · {c.confidence}<br/><small>Observed: {time(c.evidence.observedAt)}<br/>Fetched: {time(c.evidence.fetchedAt)}</small></td></tr>)}</tbody></table></div>
      <h2>Developer DNA · unavailable</h2><p>{security.developerDna.reason}</p><h2>Token Timeline</h2>{security.timeline.map((t,i)=><p key={i}>{time(t.at)} · {t.event} · {t.source}<br/><small>{t.note}</small></p>)}<p className="data-note">Mint creation, migrations, liquidity locks, creator launches and external social events require additional verifiable sources and are unavailable here.</p></>}
      </>}
    </>}
    {tab==='Token Memory'&&<>
      <h2>{coin?.symbol??'Token'} / Browser snapshots</h2><p className="data-note">Local snapshots of available evidence, not full blockchain history. A save timestamp does not establish the age of the selected market data. Up to 240 snapshots are kept in this browser.</p><p className="data-note">Compare two snapshots of the same Solana mint. Clear the selected snapshots to compare another mint.</p>
      <div className="tool-actions"><button disabled={!coin||busy} onClick={()=>{if(!coin)return;const version=++generation.current;setBusy(true);void collectTokenSnapshot(coin,security,true,()=>version===generation.current).then(()=>{if(version===generation.current){setSnapshots(listTokenSnapshots(coin.address));setError('');}}).catch(e=>{if(version===generation.current)setError(errorMessage(e));}).finally(()=>{if(version===generation.current)setBusy(false);});}}>{busy?'Fetching raw market evidence…':'Save current token snapshot'}</button><button disabled={!snapshots.length} onClick={()=>download('tail-token-memory.csv',csvExport(['mint','symbol','saved_at','source_observed_at','price_usd','liquidity_usd','market_cap','volume_24h','holder_sample_pct','holder_source','holder_observed_at','holder_fetched_at'],snapshots.map(s=>[s.mint,s.symbol,new Date(s.savedAt).toISOString(),s.observedAt?new Date(s.observedAt).toISOString():null,s.priceUsd,s.liquidityUsd,s.marketCap,s.volume24h,s.holderConcentrationPct,s.holderSource,s.holderObservedAt?new Date(s.holderObservedAt).toISOString():null,s.holderFetchedAt?new Date(s.holderFetchedAt).toISOString():null])))}>Export memory CSV</button></div>
      <div className="table-overflow"><table className="market-table"><thead><tr><th>Compare</th><th>Saved / observed</th><th>Price</th><th>Liquidity</th><th>Market cap</th><th>24h volume</th><th>Sample / supply</th><th>Actions</th></tr></thead><tbody>{snapshots.map(s=><tr key={s.id}><td><input aria-label={`Compare snapshot ${s.id}`} type="checkbox" checked={compare.includes(s.id)} disabled={!compare.includes(s.id)&&(compare.length===2||!!comparisonMint&&comparisonMint!==s.mint)} onChange={e=>setCompare(c=>e.target.checked?[...c,s.id]:c.filter(x=>x!==s.id))}/></td><td>{time(s.savedAt)}<br/><small>{s.symbol} · {shortAddr(s.mint)}<br/>Source observed: {time(s.observedAt)}<br/>{s.source}<br/>Market fetched {time(s.marketFetchedAt)}<br/>Holder fetched {time(s.holderFetchedAt)}</small></td><td title={s.marketEvidence?.priceUsd?`${s.marketEvidence.priceUsd.source} · ${s.marketEvidence.priceUsd.status} · fetched ${time(s.marketEvidence.priceUsd.fetchedAt)}`:'Legacy snapshot: per-field provenance unavailable'}>{s.priceUsd===null?'Unknown':fmtUsd(s.priceUsd)}</td><td title={s.marketEvidence?.liquidityUsd?`${s.marketEvidence.liquidityUsd.source} · ${s.marketEvidence.liquidityUsd.status} · fetched ${time(s.marketEvidence.liquidityUsd.fetchedAt)}`:'Legacy snapshot: per-field provenance unavailable'}>{s.liquidityUsd===null?'Unknown':fmtUsd(s.liquidityUsd)}</td><td>{s.marketCap===null?'Unknown':fmtUsd(s.marketCap)}</td><td>{s.volume24h===null?'Unknown':fmtUsd(s.volume24h)}</td><td>{s.holderConcentrationPct===null?'Unknown':s.holderConcentrationPct.toFixed(2)+'%'}</td><td><button onClick={()=>{try{deleteTokenSnapshot(s.id);setCompare(c=>c.filter(x=>x!==s.id));setSnapshots(listTokenSnapshots(coin?.address));}catch(e){setError(errorMessage(e));}}}>Delete</button></td></tr>)}</tbody></table></div>
      {comparison.length>0&&<><h3>Snapshot comparison · selection order</h3>{comparison.map(c=><p key={c.key}>{c.key}: {c.from??'Unknown'} → {c.to??'Unknown'} · change {c.changePct===null?'Unavailable':c.changePct.toFixed(2)+'%'}</p>)}</>}{!snapshots.length&&<p>No snapshots saved for the selected token.</p>}
    </>}
  </section>;
}
export default V2Intelligence;
