import {useEffect,useRef,useState} from 'react';
import type {AxiomCoin} from '../../../lib/axiom';
import {tailApi,formatAtomic} from '../../../services/backend/client';
import type {JupiterQuote} from '../../../services/backend/contracts';
import {rpc} from '../../../lib/rpcFeed';
import {WSOL,EXPLORER} from '../../../lib/const';
import {isSolanaAddress,errorMessage} from '../../../lib/validation';
import {useBrowserData} from '../storage';
import {parseTokenAmount,minimumOutput,EXECUTION_POLICY,parseExecutionRecords,type ExecutionRecord} from './policy';
export default function TradingDesk({coin,wallet=''}:{coin:AxiomCoin|null;wallet?:string}){
 const [side,setSide]=useState<'buy'|'sell'>('buy'),[amount,setAmount]=useState('0.1'),[slippage,setSlippage]=useState(100),[quote,setQuote]=useState<JupiterQuote|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now()),[signature,setSignature]=useState(''),[status,setStatus]=useState(''),[balance,setBalance]=useState<string|null>(null);
 const records=useBrowserData('execution-records',parseExecutionRecords,[]),expired=!!quote&&now-quote.createdAt>EXECUTION_POLICY.quoteTtlMs;
 const generation=useRef(0);
 useEffect(()=>{generation.current++;setBusy(false);setQuote(null);setError('');setBalance(null);return()=>{generation.current++;};},[coin?.address,side,amount,wallet]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 async function request(){
  if(!coin)return;const requestId=++generation.current;setBusy(true);setError('');setQuote(null);
  try{
   const inputMint=side==='buy'?WSOL:coin.address,outputMint=side==='buy'?coin.address:WSOL;
   const decimals=inputMint===WSOL?9:(await rpc<{value:{decimals:number}}>('getTokenSupply',[inputMint])).value.decimals;
   const raw=parseTokenAmount(amount,decimals);
   if(isSolanaAddress(wallet)){
    const snapshot=await tailApi.wallet(wallet),available=inputMint===WSOL?snapshot.lamports:snapshot.tokens.filter(t=>t.mint===inputMint).reduce((n,t)=>n+BigInt(t.rawAmount),0n).toString();
    if(requestId!==generation.current)return;setBalance(formatAtomic(available,decimals));if(BigInt(raw)>BigInt(available))throw Error('Insufficient observed balance. Network fees require an additional SOL reserve.');
   }
   const q=await tailApi.quote(inputMint,outputMint,raw);if(requestId!==generation.current)return;setQuote(q);setNow(Date.now());
   const record:ExecutionRecord={id:crypto.randomUUID(),at:Date.now(),inputMint,outputMint,amount:raw,state:'quoted',signature:null,source:'manual-observation'};await records.update([record,...records.value].slice(0,300));
  }catch(e){if(requestId===generation.current)setError(errorMessage(e));}finally{if(requestId===generation.current)setBusy(false);}
 }
 return <section className="tool-page v2-page"><h1>Trading Routes</h1><p>Buy/sell quotes from Jupiter. Network and route fees are paid by the trader. Execution remains disabled until every instruction and account is verified; no transaction is requested for signing.</p>
 {!coin?<p>Select a Solana token first.</p>:<><div className="tool-actions"><button aria-pressed={side==='buy'} onClick={()=>setSide('buy')}>Buy quote</button><button aria-pressed={side==='sell'} onClick={()=>setSide('sell')}>Sell quote</button></div><form className="tool-form" onSubmit={e=>{e.preventDefault();void request();}}><label>Input amount ({side==='buy'?'SOL':coin.symbol})<input aria-label="Route input amount" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Slippage bps<select aria-label="Route slippage bps" value={slippage} onChange={e=>setSlippage(Number(e.target.value))}>{[50,100,200,500].map(n=><option key={n} value={n}>{n}</option>)}</select></label><button disabled={busy}>{busy?'Finding route…':'Get read-only route'}</button></form>{balance!==null&&<p>Observed input balance: {balance}. A balance is not wallet authentication.</p>}
 {quote&&<div className="v2-rule"><h2>{expired?'Quote expired':'Quote observed'}</h2><p>Output: {quote.outAmount?formatAtomic(quote.outAmount,quote.outputDecimals):'Unavailable'}</p><p>Hypothetical slippage floor: {quote.outAmount?formatAtomic(minimumOutput(quote.outAmount,slippage),quote.outputDecimals):'Unavailable'}. This is a local estimate; no execution order is created.</p><p>Price impact: {quote.priceImpactPct==null?'Unavailable':quote.priceImpactPct+'%'} · provider fee: {quote.feeBps==null?'Unavailable':quote.feeBps+' bps'} · network fee: unavailable without a validated transaction.</p><small>{quote.source} · {quote.asOf} · {quote.router??'Router unavailable'} · {expired?'Refresh required':'45 second quote lifetime'}</small><p>State: quoted → {expired?'expired':'awaiting a vetted execution adapter'}. Simulation / signing / submission: disabled.</p><button onClick={()=>void request()}>Refresh route</button><a href={`https://jup.ag/swap/${quote.inputMint}-${quote.outputMint}`} target="_blank" rel="noreferrer">Open Jupiter ↗</a></div>}</>}
 {error&&<p role="alert" className="tail-error">{error}</p>}
 <h2>Observe a submitted transaction</h2><p>Read-only status of a user-provided signature. This does not verify trade intent or prove the transaction belongs to this user.</p><form className="tool-form" onSubmit={async e=>{e.preventDefault();try{const r=await tailApi.transaction(signature);setStatus(r.status?.err?'Failed':r.status?.confirmationStatus??'Not found or pending');}catch(err){setStatus(errorMessage(err));}}}><label>Public signature<input aria-label="Observed transaction signature" value={signature} onChange={e=>setSignature(e.target.value)}/></label><button disabled={!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature)}>Check transaction status</button></form>{status&&<p role="status">{status} <a href={`${EXPLORER}/tx/${signature}`} target="_blank" rel="noreferrer">Explorer ↗</a></p>}
 <h2>Local quote journal</h2>{records.value.slice(0,20).map(r=><p key={r.id}>{new Date(r.at).toLocaleString()} · {r.state} · {r.source}</p>)}{records.storageError&&<p role="alert">{records.storageError}</p>}
 </section>;
}
