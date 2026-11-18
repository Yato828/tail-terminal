// Real, bounded public-source reads. No fixtures, model POSTs, wallet signing or deployment.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.TAIL_V2_LIVE_BASE||'http://127.0.0.1:4666';
const out=process.env.TAIL_V2_LIVE_OUT||'artifacts/v2-live';
const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const sol='So11111111111111111111111111111111111111112';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:1672,height:1000}});
const errors=[],checks=[],requests=[];let modelPosts=0;
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(request.method()==='POST'&&/\/api\/(astra\/(chat|scenario)|fable)/.test(request.url()))modelPosts++;});
page.on('response',response=>{if(/\/(dex|candle|rpc|rugcheck|gecko|jupiter)(\/|\?|$)/.test(new URL(response.url()).pathname))requests.push({path:new URL(response.url()).pathname,status:response.status()});});
async function check(name,fn){try{const result=await fn();checks.push({name,status:'available',...result});console.log(name,JSON.stringify(result));}catch(error){checks.push({name,status:'unavailable',error:error.message.slice(0,800)});console.log(name,'UNAVAILABLE',error.message.slice(0,220));}}
try{
 await page.goto(`${base}/terminal?embedded=1&mint=${mint}`);
 await expect(page.locator('.tail-terminal-route:not([inert])')).toBeVisible();
 await check('actual-terminal-source-chart',async()=>{
  const chart=page.locator('.sol-chart[data-chart-id="primary"]');
  await expect.poll(async()=>Number(await chart.getAttribute('data-candle-count')),{timeout:60000}).toBeGreaterThan(0);
  return{mint,bars:Number(await chart.getAttribute('data-candle-count')),interval:await chart.getAttribute('data-interval'),scope:await chart.getAttribute('data-history-scope'),volumeUnit:await chart.getAttribute('data-volume-unit'),lastCandle:Number(await chart.getAttribute('data-last-candle'))};
 });
 await check('raw-market-and-shared-channel',()=>page.evaluate(async mint=>{
  const load=path=>import(/* @vite-ignore */path),market=await load('/src/features/v2/market/snapshot.ts');
  const result=await market.getMarketSnapshot(mint,{force:true});
  if(result.mint!==mint||!(result.fields.priceUsd.value>0))throw Error('No exact positive Solana market snapshot');
  const a=market.subscribeMarketSnapshot(mint,()=>{}),b=market.subscribeMarketSnapshot(mint,()=>{});
  await new Promise(resolve=>setTimeout(resolve,30));
  const shared=market.marketSubscriptionDiagnostics().subscriptions.find(s=>s.mint===mint);a();b();
  return{mint:result.mint,pool:result.poolAddress,price:result.fields.priceUsd,sharedSubscribers:shared?.subscribers,remainingChannels:market.marketSubscriptionDiagnostics().subscriptions.length};
 },mint));
 for(const interval of ['1m','5m','15m','1h','4h','1d'])await check(`actual-history-${interval}`,()=>page.evaluate(async({mint,interval})=>{
  const load=path=>import(/* @vite-ignore */path),market=await load('/src/features/v2/market/snapshot.ts');
  const snapshot=await market.getMarketSnapshot(mint);if(!snapshot.poolAddress)throw Error('No exact source pool');
  const result=await market.loadMarketHistory(mint,snapshot.poolAddress,interval);
  if(!result.bars.length||!result.bars.every(b=>b.o>0&&b.h>=Math.max(b.o,b.c)&&b.l<=Math.min(b.o,b.c)&&b.l>0&&b.v>=0))throw Error('Empty or invalid source OHLCV');
  return{mint,interval,source:result.source,scope:result.scope,volumeUnit:result.volumeUnit,bars:result.bars.length,first:result.bars[0].t,last:result.bars.at(-1).t,fetchedAt:result.fetchedAt};
 },{mint,interval}));
 await check('parsed-mint-and-holder-evidence',()=>page.evaluate(async mint=>{
  const load=path=>import(/* @vite-ignore */path),market=await load('/src/features/v2/market/snapshot.ts'),{enrichMintEvidence}=await load('/src/features/v2/market/enrich.ts');
  const [snapshot]=await enrichMintEvidence([await market.getMarketSnapshot(mint)]);
  if(snapshot.fields.tokenProgram.status!=='ready')throw Error('Confirmed mint program unavailable');
  return{mint,tokenProgram:snapshot.fields.tokenProgram,mintAuthority:snapshot.fields.mintAuthority,freezeAuthority:snapshot.fields.freezeAuthority,holderSample:snapshot.fields.holderConcentration};
 },mint));
 await check('read-only-jupiter-quote',()=>page.evaluate(async({sol,mint})=>{
  const {tailApi}=await import(/* @vite-ignore */'/src/services/backend/client.ts');const quote=await tailApi.quote(sol,mint,'1000000');
  if(quote.executable!==false||quote.inputMint!==sol||quote.outputMint!==mint)throw Error('Unexpected quote intent/execution capability');
  return{source:quote.source,inputMint:quote.inputMint,outputMint:quote.outputMint,inAmount:quote.inAmount,outAmount:quote.outAmount,executable:quote.executable,asOf:quote.asOf};
 },{sol,mint}));
 await check('local-capabilities-and-ai-readiness',async()=>{
  const capabilities=await page.request.get(`${base}/api/v2/capabilities`).then(r=>r.json()),ai=await page.request.get(`${base}/api/astra/status`).then(r=>r.json());
  expect(capabilities.execution.enabled).toBe(false);
  return{version:capabilities.version,executionEnabled:capabilities.execution.enabled,aiConfigured:ai.configured,aiReady:ai.ready};
 });
 await page.screenshot({path:`${out}/terminal.png`,fullPage:true});
 expect(modelPosts).toBe(0);expect(errors).toEqual([]);
}finally{
 await writeFile(`${out}/result.json`,JSON.stringify({at:new Date().toISOString(),base,mode:'actual public sources; no route fixtures',checks,requests,modelPosts,errors},null,2));
 await browser.close();
}
