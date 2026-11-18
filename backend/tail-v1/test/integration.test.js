import { Jupiter } from '../src/jupiter.js';
import { Fable } from '../src/fable.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Charts } from '../src/charts.js';
import { Streams } from '../src/streams.js';
import { createApp } from '../src/server.js';
const mint='So11111111111111111111111111111111111111112',usdc='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const pair={chainId:'solana',dexId:'orca',pairAddress:mint,baseToken:{address:mint,symbol:'SOL',name:'SOL'},quoteToken:{address:usdc},priceUsd:'70',liquidity:{usd:1000},marketCap:10000,txns:{m5:{buys:10}},volume:{h24:100}};
const response=(r,status=200)=>new Response(JSON.stringify(r),{status,headers:{'content-type':'application/json'}});
function upstream(url,init={}) {
 const u=new URL(url);
 if(u.hostname==='api.dexscreener.com'){
  if(u.pathname.includes('search'))return Promise.resolve(response({pairs:[pair]}));
  if(u.pathname.includes('token-pairs'))return Promise.resolve(response([pair]));
  return Promise.resolve(response([{chainId:'solana',tokenAddress:mint}]));
 }
 if(u.hostname==='api.geckoterminal.com'){
  if(u.pathname.includes('ohlcv'))return Promise.resolve(response({data:{attributes:{ohlcv_list:[[1700000000,1,2,0.5,1.5,10],[1700000060,2,1,3,2,10],[1700000120,1,2,0.5,1.5,-1]]}}}));
  if(u.pathname.includes('new_pools'))return Promise.resolve(response({data:Array.from({length:4},(_,i)=>({id:`pool${i}`,attributes:{address:mint},relationships:{base_token:{data:{id:`solana_${mint}`}},quote_token:{data:{id:`solana_${usdc}`}}}}))}));
  return Promise.resolve(response({data:[{id:'trade',attributes:{tx_hash:'4'.repeat(88),kind:'buy',block_timestamp:'2026-11-15T00:00:00Z',volume_in_usd:'10',price_from_in_currency_token:'900',price_from_in_usd:'70',price_to_in_usd:'1',from_token_address:mint,to_token_address:usdc,from_token_amount:'0.14',to_token_amount:'10',tx_from_address:mint}}]}));
 }
 if(u.hostname==='api.jup.ag')return Promise.resolve(response({inAmount:'100',outAmount:'99',router:'metis',transaction:'unsafe',requestId:'unsafe'}));
 if(u.hostname==='api.mainnet-beta.solana.com'){
  const req=JSON.parse(init.body);const result=req.method==='getTokenSupply'?{value:{decimals:6}}:req.method==='getBalance'?{value:100}:req.method==='getTokenAccountsByOwner'?{value:[]}:req.method==='getSignaturesForAddress'?[]:req.method==='getSignatureStatuses'?{value:[null]}:null;
  return Promise.resolve(response({result}));
 }
 throw new Error(`Unexpected upstream ${u.host}`);
}
test('OHLCV binds selected mint and historical cursor; invalid candles are rejected',async()=>{
 let seen;const c=new Charts({fetchImpl:(url,init)=>{seen=new URL(url);return upstream(url,init);}});
 const r=await c.ohlcv(mint,'5m',150,{token:usdc,before:1700000090});assert.equal(r.token,usdc);assert.equal(seen.searchParams.get('token'),usdc);assert.equal(seen.searchParams.get('before_timestamp'),'1700000090');assert.equal(r.candles.length,1);
 await assert.rejects(c.ohlcv(mint,'5m',150,{token:'invalid'}));await assert.rejects(c.ohlcv(mint,'5m',150,{before:-1}));
});
test('new-pool/trade limits have independent cache keys and preserve token identity, not fake USD conversion',async()=>{
 const c=new Charts({fetchImpl:upstream});assert.equal((await c.newPools(1)).items.length,1);const p=await c.newPools(4);assert.equal(p.items.length,4);assert.equal(p.items[0].baseMint,mint);
 const t=(await c.trades(mint)).items[0];assert.equal(t.toMint,usdc);assert.equal(t.priceFromUsd,70);assert.equal(t.priceUsd,null);
});
test('SSE initial disconnect does not leak a polling timer; simultaneous subscriptions share one channel',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});
 const streams=new Streams({market:{token:()=>pending},store:{onPrice:async()=>{}},periodMs:10000,maxTokens:2});
 class Res extends EventEmitter{destroyed=false;frames=[];writeHead(){}write(data){this.frames.push(data)}end(){this.destroyed=true;this.emit('close')}}
 const a=new Res(),b=new Res();const subscription=streams.subscribe(mint,a);await streams.subscribe(mint,b);a.end();b.end();resolve({token:{mint,priceUsd:1},source:'DexScreener',asOf:new Date().toISOString()});await subscription;assert.equal(streams.channels.size,0);streams.close();
});
test('all V1 HTTP contracts: profiles, boosts, new pools, filters, wallet, status, alerts, quote and unavailable AI',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'tail-v1-contract-'));
 const cfg={dataDir:dir,origins:['http://localhost:4664'],rpc:new URL('https://api.mainnet-beta.solana.com'),maxStreamTokens:4,marketPollMs:10000};
 const app=await createApp({cfg,storeDir:dir,fetchImpl:upstream});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const get=async p=>{const r=await fetch(base+p);assert.equal(r.status,200,p);return r.json()};
 try{
  for(const p of ['/api/market/profiles','/api/market/trending','/api/market/new-pools','/api/market/filter?q=sol&minLiquidity=10',`/api/wallet/${mint}`,`/api/wallet/${mint}/activity`,`/api/transaction/${'4'.repeat(88)}`])await get(p);
  const q=await get(`/api/trade/quote?inputMint=${mint}&outputMint=${usdc}&amount=100`);assert.equal(q.executable,false);assert.equal(q.outputDecimals,6);assert.equal(q.transaction,undefined);assert.equal(q.requestId,undefined);
  const session=await(await fetch(base+'/api/session',{method:'POST'})).json(),headers={authorization:`Bearer ${session.token}`,'content-type':'application/json'};
  const create=await fetch(base+'/api/alerts',{method:'POST',headers,body:JSON.stringify({mint,direction:'above',priceUsd:2})});assert.equal(create.status,201);const {alert}=await create.json();await app.store.onPrice(mint,3);
  assert.equal((await(await fetch(base+'/api/alerts/events',{headers})).json()).items.length,1);
  assert.equal((await fetch(base+'/api/alerts/'+alert.id,{method:'DELETE',headers})).status,200);
  assert.equal((await fetch(base+'/api/watchlist')).status,401);
  const ai=await fetch(base+'/api/fable/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'hello'})});assert.equal(ai.status,503);assert.equal((await ai.json()).error.code,'AI_NOT_CONFIGURED');
  for(const endpoint of ['execute','sign','copytrade'])assert.equal((await fetch(`${base}/api/trade/${endpoint}`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('Jupiter rejects upstream mismatches and zero routes before returning a quote',async()=>{
 const mismatch=new Jupiter({fetchImpl:async()=>response({inputMint:usdc,outputMint:mint,inAmount:'100',outAmount:'1'})});await assert.rejects(mismatch.quote(mint,usdc,'100'),e=>e.code==='QUOTE_MISMATCH');
 const zero=new Jupiter({fetchImpl:async()=>response({inAmount:'100',outAmount:'0'})});await assert.rejects(zero.quote(mint,usdc,'100'),e=>e.code==='NO_ROUTE');
});
test('Fable cancellation reaches the provider request rather than continuing tool rounds',async()=>{
 let observed;const model=new Fable({key:'unit-test-key',model:'unit-test-model',fetchImpl:async(url,init)=>new Promise((resolve,reject)=>{observed=init.signal;init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});})});
 const ac=new AbortController(),pending=model.chat({message:'Analyze'},'cancel-test',ac.signal);ac.abort();await assert.rejects(pending,e=>e.code==='UPSTREAM_TIMEOUT');assert.equal(observed.aborted,true);
});

test('token market forwards observed 24h transaction counts without fabricating missing counts', async()=>{
 const {normalizePair}=await import('../src/market.js');
 const value=normalizePair({...pair,txns:{h24:{buys:123,sells:45}}});assert.equal(value.buys24h,123);assert.equal(value.sells24h,45);
 const missing=normalizePair({...pair,txns:{}});assert.equal(missing.buys24h,null);assert.equal(missing.sells24h,null);
});
