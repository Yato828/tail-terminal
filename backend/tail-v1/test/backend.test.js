import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {solAddress,rawAmount,fetchJSON,HttpError} from '../src/core.js';
import {normalizePair,uniqueTokens,filterTokens,parseFilters,Market} from '../src/market.js';
import {Jupiter} from '../src/jupiter.js';
import {Charts} from '../src/charts.js';
import {Rpc} from '../src/rpc.js';
import {Store} from '../src/store.js';
import {Fable} from '../src/fable.js';
import {createApp} from '../src/server.js';
const MINT='So11111111111111111111111111111111111111112';
const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WALLET='11111111111111111111111111111111';
const pair={chainId:'solana',dexId:'raydium',pairAddress:MINT,baseToken:{address:MINT,name:'Wrapped SOL',symbol:'SOL'},quoteToken:{address:USDC,symbol:'USDC'},liquidity:{usd:140000},volume:{h24:200000,m5:10000},txns:{m5:{buys:30,sells:7}},marketCap:340000,priceUsd:'210.23'};
function response(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})}
function mockFetch(url,options={}){
  const u=new URL(url);if(u.hostname==='api.dexscreener.com'){
   if(u.pathname.includes('/dex/search'))return Promise.resolve(response({pairs:[pair,pair,{...pair,chainId:'ethereum'}]}));
   if(u.pathname.includes('/token-pairs'))return Promise.resolve(response([pair]));
   if(u.pathname.includes('token-profiles'))return Promise.resolve(response([{chainId:'solana',tokenAddress:MINT},{chainId:'ethereum'}]));
   if(u.pathname.includes('token-boosts'))return Promise.resolve(response([{chainId:'solana',tokenAddress:MINT}]));
  }
  if(u.hostname==='api.geckoterminal.com'){
   if(u.pathname.includes('/ohlcv/'))return Promise.resolve(response({data:{attributes:{ohlcv_list:[[1730000060,1,2,0.9,1.5,123],[1730000000,1,1.8,0.8,1.2,80]]}}}));
   if(u.pathname.includes('/new_pools'))return Promise.resolve(response({data:[{id:'solana_123',attributes:{address:MINT,name:'SOL / USDC',reserve_in_usd:'4500'}}]}));
   if(u.pathname.includes('/trades'))return Promise.resolve(response({data:[{id:'1',attributes:{tx_hash:'abcd',kind:'buy',block_timestamp:'2026-11-15T12:00:00Z',volume_in_usd:'123'}}]}));
  }
  if(u.hostname==='api.jup.ag')return Promise.resolve(response({inAmount:'100000000',outAmount:'48000000',router:'metis',feeBps:10,transaction:'MALICIOUS_SENSITIVE_TRANSACTION',requestId:'SECRET_REQUEST_ID'}));
  if(u.hostname==='api.mainnet-beta.solana.com'){
   const b=JSON.parse(options.body);
   if(b.method==='getBalance')return Promise.resolve(response({result:{value:1230000000}}));
   if(b.method==='getTokenAccountsByOwner')return Promise.resolve(response({result:{value:[{account:{owner:'program',data:{parsed:{info:{mint:USDC,tokenAmount:{amount:'1234500',decimals:6}}}}}}]}}));
   if(b.method==='getSignatureStatuses')return Promise.resolve(response({result:{value:[{confirmationStatus:'confirmed',err:null}]}}));
   if(b.method==='getSignaturesForAddress')return Promise.resolve(response({result:[{signature:'test',slot:1}]}));
  }
  if(u.hostname==='api.openai.com')return Promise.resolve(response({output:[{type:'message',content:[{type:'output_text',text:'Available sources show a quoted price; no trading recommendation.'}]}]}));
  throw new Error('Unexpected URL: '+u);
}

test('validation rejects non-base58, URLs, bad swap amounts',()=>{
 assert.equal(solAddress(MINT),MINT);assert.throws(()=>solAddress('https://evil.com'),/Invalid/);assert.throws(()=>rawAmount('-5'),/positive/);assert.throws(()=>rawAmount('0'),/positive/);assert.throws(()=>rawAmount('1e4'),/positive/);
});
test('market normalization, de-duplication, filters avoid missing fields',async()=>{
 assert.equal(uniqueTokens([pair,pair]).length,1);
 assert.equal(normalizePair({...pair,chainId:'ethereum'}),null);
 const f=parseFilters(new URLSearchParams('minLiquidity=1000&maxMarketCap=400000&minBuys5m=2'));
 assert.equal(filterTokens(uniqueTokens([pair]),f).length,1);
 assert.equal(filterTokens(uniqueTokens([{...pair,marketCap:null}]),f).length,0);
 const market=new Market({fetchImpl:mockFetch});const x=await market.search('sol');assert.equal(x.items.length,1);assert.equal(x.items[0].priceUsd,210.23);
 const d=await market.token(MINT);assert.equal(d.token.mint,MINT);assert.equal((await market.profiles()).items.length,1);
});
test('Jupiter is quote-only; malicious transaction fields never leak to frontend',async()=>{
 const j=new Jupiter({fetchImpl:mockFetch});const x=await j.quote(MINT,USDC,'100000000');assert.equal(x.executable,false);assert.equal(x.outAmount,'48000000');assert.equal(x.transaction,undefined);assert.equal(x.requestId,undefined);
 await assert.rejects(j.quote(MINT,MINT,'100'),e=>e.code==='SAME_MINT');
});
test('a missing linked mint recovers immediately on explicit retry while positive results remain cached',async()=>{
 let calls=0;const market=new Market({fetchImpl:async()=>response(++calls===1?[]:[pair])});
 assert.equal((await market.token(MINT)).token,null);
 assert.equal((await market.token(MINT)).token.mint,MINT);
 assert.equal((await market.token(MINT)).token.mint,MINT);
 assert.equal(calls,2);
});
test('GeckoTerminal OHLCV sorts history and does not fabricate candles',async()=>{
 const charts=new Charts({fetchImpl:mockFetch});const v=await charts.ohlcv(MINT,'1m',2);assert.equal(v.candles.length,2);assert.ok(v.candles[0].time<v.candles[1].time);assert.equal(v.live,false);
 const p=await charts.newPools();assert.equal(p.items[0].poolAddress,MINT);const t=await charts.trades(MINT);assert.equal(t.items[0].kind,'buy');
 await assert.rejects(charts.ohlcv(MINT,'1s'),e=>e.code==='BAD_TIMEFRAME');
});
test('wallet RPC aggregates Token and Token-2022 without claiming PnL',async()=>{
 const rpc=new Rpc({fetchImpl:mockFetch});const x=await rpc.wallet(WALLET);
 assert.equal(x.sol,'1.23');assert.equal(x.tokens[0].rawAmount,'2469000');assert.match(x.note,/Not a realized/);
});
test('anonymous watchlists and alerts persist, no wallet-signing identities',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'tail-test-'));
 try{const s=new Store(dir);await s.init();const token=await s.session();await s.watch(token,MINT,true);
  const a=await s.alert(token,{mint:MINT,direction:'above',priceUsd:3});await s.onPrice(MINT,4);
  assert.equal(s.get(token).events.length,1);assert.equal(s.get(token).alerts[0].triggered,true);
  await s.onPrice(MINT,8);assert.equal(s.get(token).events.length,1);
  const b=new Store(dir);await b.init();assert.deepEqual(b.get(token).watchlist,[MINT]);await b.deleteAlert(token,a.id);assert.equal(b.get(token).alerts.length,0);
  assert.throws(()=>b.get('invalidtoken'),/session/i);
 } finally{await rm(dir,{recursive:true,force:true})}
});
test('Fable only calls provider with key, returns real provider text',async()=>{
 const market=new Market({fetchImpl:mockFetch});const rpc=new Rpc({fetchImpl:mockFetch});
 const off=new Fable({market,rpc,fetchImpl:mockFetch});await assert.rejects(off.chat({message:'analyze Solana'},'ip'),e=>e.code==='AI_NOT_CONFIGURED');
 const on=new Fable({key:'test',model:'test-model',market,rpc,fetchImpl:mockFetch});const d=await on.chat({message:'analyze Solana'},'ip');assert.match(d.answer,/Available sources/);assert.equal(d.brand,'Fable 5.2');
});
test('HTTP: health, read-only market, anonymous watchlists, and no execution',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'tail-app-'));
 const app=await createApp({fetchImpl:mockFetch,storeDir:dir,cfg:{host:'127.0.0.1',port:0,origins:['http://localhost:5173'],rpc:new URL('https://api.mainnet-beta.solana.com'),rpcBackup:null,jupiterKey:'',openaiKey:'',openaiModel:'',maxStreamTokens:5,marketPollMs:10000}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 try{
  const health=await(await fetch(base+'/api/health')).json();assert.equal(health.tradeExecution,false);
  const r=await(await fetch(base+'/api/market/search?q=sol')).json();assert.equal(r.items.length,1);
  const candles=await(await fetch(base+'/api/market/pool/'+MINT+'/ohlcv?interval=1m')).json();assert.equal(candles.candles.length,2);
  const q=await(await fetch(base+'/api/trade/quote?inputMint='+MINT+'&outputMint='+USDC+'&amount=100000000')).json();assert.equal(q.executable,false);
  const session=await(await fetch(base+'/api/session',{method:'POST'})).json();assert.ok(session.token);
  const add=await fetch(base+'/api/watchlist',{method:'POST',headers:{authorization:'Bearer '+session.token,'content-type':'application/json'},body:JSON.stringify({mint:MINT})});assert.equal(add.status,200);
  const watched=await(await fetch(base+'/api/watchlist',{headers:{authorization:'Bearer '+session.token}})).json();assert.deepEqual(watched.items,[MINT]);
  assert.equal((await fetch(base+'/api/trade/execute',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404);
  assert.equal((await fetch(base+'/api/health',{headers:{origin:'https://evil.site'}})).status,403);
  assert.equal((await fetch(base+'/api/wallet/invalid')).status,400);
 }finally{await app.close();await rm(dir,{recursive:true,force:true})}
});
