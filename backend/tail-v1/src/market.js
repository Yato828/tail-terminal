import {Cache,fetchJSON,finiteNumber,solAddress,safeQuery,assert,boundedInt,now,HttpError} from './core.js';
const DS='https://api.dexscreener.com';
export function normalizePair(p){
  const b=p?.baseToken||{},q=p?.quoteToken||{};
  if(p?.chainId!=='solana'||!b.address||!p.pairAddress)return null;
  return {mint:b.address,symbol:b.symbol||'',name:b.name||'',pairAddress:p.pairAddress,dex:p.dexId||'unknown',
    quoteMint:q.address||null,quoteSymbol:q.symbol||null,priceUsd:p.priceUsd?finiteNumber(p.priceUsd):null,
    priceNative:p.priceNative?finiteNumber(p.priceNative):null,marketCap:p.marketCap??null,fdv:p.fdv??null,
    liquidityUsd:finiteNumber(p.liquidity?.usd),volume24h:finiteNumber(p.volume?.h24),volume1h:finiteNumber(p.volume?.h1),
    volume5m:finiteNumber(p.volume?.m5),priceChange5m:p.priceChange?.m5??null,priceChange1h:p.priceChange?.h1??null,
    priceChange24h:p.priceChange?.h24??null,buys5m:p.txns?.m5?.buys??null,sells5m:p.txns?.m5?.sells??null,
    buys24h:Number.isSafeInteger(p.txns?.h24?.buys)&&p.txns.h24.buys>=0?p.txns.h24.buys:null,
    sells24h:Number.isSafeInteger(p.txns?.h24?.sells)&&p.txns.h24.sells>=0?p.txns.h24.sells:null,
    pairCreatedAt:p.pairCreatedAt??null,url:p.url||null,icon:p.info?.imageUrl||null,
    websites:(p.info?.websites||[]).filter(x=>x?.url).slice(0,4),socials:(p.info?.socials||[]).filter(x=>x?.url).slice(0,4)};
}
export function uniqueTokens(pairs){const byMint=new Map();for(const p of pairs){const n=normalizePair(p);if(!n)continue;const old=byMint.get(n.mint);if(!old||n.liquidityUsd>old.liquidityUsd)byMint.set(n.mint,n)}return [...byMint.values()]}
export function filterTokens(items,f){return items.filter(x=>{
 const num=(k)=>typeof x[k]==='number'&&Number.isFinite(x[k])?x[k]:null;
 const cmp=(field,min,max)=>{const v=num(field);return v!==null&&(min===null||v>=min)&&(max===null||v<=max)};
 if(f.minLiquidity!==null&&!cmp('liquidityUsd',f.minLiquidity,null))return false;
 if(f.maxMarketCap!==null&&!cmp('marketCap',null,f.maxMarketCap))return false;
 if(f.minVolume24h!==null&&!cmp('volume24h',f.minVolume24h,null))return false;
 if(f.minBuys5m!==null&&!cmp('buys5m',f.minBuys5m,null))return false;
 if(f.maxAgeMinutes!==null){if(!x.pairCreatedAt)return false;if((Date.now()-x.pairCreatedAt)/60_000>f.maxAgeMinutes)return false}
 if(f.dex&&x.dex.toLowerCase()!==f.dex.toLowerCase())return false;
 return true;
 })}
function numberOrNull(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);assert(Number.isFinite(n)&&n>=0&&n<=1e15,400,'BAD_FILTER','Numeric filter must be nonnegative');return n}
export function parseFilters(params){return {minLiquidity:numberOrNull(params.get('minLiquidity')),maxMarketCap:numberOrNull(params.get('maxMarketCap')),
 minVolume24h:numberOrNull(params.get('minVolume24h')),minBuys5m:numberOrNull(params.get('minBuys5m')),
 maxAgeMinutes:numberOrNull(params.get('maxAgeMinutes')),dex:params.get('dex')?safeQuery(params.get('dex'),30):null}}
export class Market {
 constructor({fetchImpl=fetch}={}){this.fetchImpl=fetchImpl;this.cache=new Cache()}
 async get(path,ttl=5000){const url=new URL(path,DS);return this.cache.get(url.toString(),ttl,async()=>({data:await fetchJSON(url,{fetchImpl:this.fetchImpl}),source:'DexScreener',asOf:now()}))}
 async search(q,limit=20){q=safeQuery(q);const r=await this.get('/latest/dex/search?q='+encodeURIComponent(q),8000);return {...r,items:uniqueTokens(r.data?.pairs||[]).slice(0,boundedInt(limit,20,1,100)),data:undefined}}
 async token(mint){mint=solAddress(mint);const path='/token-pairs/v1/solana/'+mint;const r=await this.get(path,4500);const list=Array.isArray(r.data)?r.data:[];const items=uniqueTokens(list.filter(p=>p.baseToken?.address===mint));
  // An absent index entry can recover while a linked-token screen is open.
  // Keep in-flight deduplication but let an explicit retry observe that recovery.
  if(!items.length)this.cache.values.delete(new URL(path,DS).toString());
  return {...r,token:items[0]||null,markets:list.map(normalizePair).filter(Boolean),data:undefined}}
 async profiles(limit=30){const r=await this.get('/token-profiles/latest/v1',25000);const items=(Array.isArray(r.data)?r.data:[]).filter(x=>x.chainId==='solana').slice(0,boundedInt(limit,30,1,100));return {...r,items,data:undefined,warning:'Recent indexed profiles, not an exhaustive real-time launch stream'}}
 async trending(limit=20){const r=await this.get('/token-boosts/top/v1',30000);const items=(Array.isArray(r.data)?r.data:[]).filter(x=>x.chainId==='solana').slice(0,boundedInt(limit,20,1,100));return {...r,items,data:undefined,warning:'Paid boosts, not organic trending or smart-money rankings'}}
 async filter(query,filters,limit=20){const r=await this.search(query,100);return {...r,items:filterTokens(r.items,filters).slice(0,boundedInt(limit,20,1,100)),filtersApplied:filters}}
}
