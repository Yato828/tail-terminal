import { rpc } from '../../../lib/rpcFeed';
import { fetchSolCoinByAddress } from '../../../lib/axiom';
import { isSolanaAddress } from '../../../lib/validation';
import { WSOL } from '../../../lib/const';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export type TokenBalance = {accountIndex:number; mint:string; owner?:string; uiTokenAmount:{amount?:string;decimals?:number;uiAmountString:string}};
export type ParsedWalletTransaction = {blockTime:number|null;slot?:number;transaction:{message:{accountKeys:Array<string|{pubkey:string}>;instructions?:Array<{programId?:string}>}};meta:{err:unknown;fee?:number;preBalances:number[];postBalances:number[];preTokenBalances?:TokenBalance[];postTokenBalances?:TokenBalance[];innerInstructions?:Array<{instructions:Array<{programId?:string}>}>}|null};
export type ActivityRow = {id:string;hash:string;wallet:string;mint:string;at:number|null;fetchedAt:number;delta:number|null;rawDelta:string|null;decimals:number|null;kind:'received'|'sent'|'sol-delta'|'failed'|'unavailable'|'no-change';programs:string[];feeSol:number|null;source:string;note:string};
function amountRaw(b:TokenBalance):bigint|null {
  if (b.uiTokenAmount.amount && /^\d+$/.test(b.uiTokenAmount.amount)) return BigInt(b.uiTokenAmount.amount);
  const d=b.uiTokenAmount.decimals; const s=b.uiTokenAmount.uiAmountString;
  if (!Number.isInteger(d) || d!<0 || d!>30 || !/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole,fraction='']=s.split('.'); if(fraction.length>d!) return null;
  return BigInt(whole + fraction.padEnd(d!,'0'));
}
export function parseWalletTransaction(tx:ParsedWalletTransaction|null,wallet:string,hash:string,signatureTime:number|null=null):ActivityRow[] {
  const programs=[...new Set([...(tx?.transaction.message.instructions??[]),...(tx?.meta?.innerInstructions??[]).flatMap(x=>x.instructions)].map(x=>x.programId).filter((p):p is string=>isSolanaAddress(p)))];
  const keys=tx?.transaction.message.accountKeys.map(k=>typeof k==='string'?k:k.pubkey)??[];
  const index=keys.indexOf(wallet); const payer=keys[0]===wallet;
  const base={hash,wallet,at:tx?.blockTime!=null?tx.blockTime*1000:signatureTime!=null?signatureTime*1000:null,fetchedAt:Date.now(),programs,feeSol:payer&&tx?.meta?.fee!=null?tx.meta.fee/1e9:null,source:'Solana mainnet RPC · confirmed'};
  const event=(mint:string,kind:ActivityRow['kind'],delta:number|null,note:string,rawDelta:string|null=null,decimals:number|null=null):ActivityRow=>({...base,id:`${wallet}:${hash}:${mint}:${kind}`,mint,kind,delta,note,rawDelta,decimals});
  if(!tx?.meta) return [event('','unavailable',null,'Transaction details unavailable; no zero balance inferred')];
  if(tx.meta.err) return [event('','failed',null,'Failed transaction; no token execution inferred. Network fee may still apply.')];
  const pre=tx.meta.preTokenBalances??[],post=tx.meta.postTokenBalances??[];
  const accountOwners=new Map([...pre,...post].filter(b=>b.owner).map(b=>[`${b.accountIndex}:${b.mint}`,b.owner]));
  const deltas=new Map<string,{raw:bigint;decimals:number;valid:boolean}>();
  for(const [rows,sign] of [[pre,-1n],[post,1n]] as const) for(const b of rows){
    if((b.owner??accountOwners.get(`${b.accountIndex}:${b.mint}`))!==wallet || !isSolanaAddress(b.mint)) continue;
    const decimals=b.uiTokenAmount.decimals??Math.max(0,(b.uiTokenAmount.uiAmountString.split('.')[1]??'').length);
    const old=deltas.get(b.mint)??{raw:0n,decimals,valid:true}; const raw=amountRaw({...b,uiTokenAmount:{...b.uiTokenAmount,decimals}});
    old.valid &&=raw!==null && old.decimals===decimals;
    if(raw!==null) old.raw += sign*raw; deltas.set(b.mint,old);
  }
  const out:ActivityRow[]=[];
  for(const [mint,d] of deltas) {
    if(!d.valid) {out.push(event(mint,'unavailable',null,'Malformed token balance or decimals'));continue;}
    if(d.raw===0n) continue;
    const delta=Number(d.raw)/10**d.decimals;
    out.push(event(mint,d.raw>0n?'received':'sent',Number.isFinite(delta)?delta:null,'Net SPL balance delta; transfer or trade classification needs verified instruction decoding.',d.raw.toString(),d.decimals));
  }
  if(index>=0 && Number.isFinite(tx.meta.preBalances[index]) && Number.isFinite(tx.meta.postBalances[index])){
    const delta=(tx.meta.postBalances[index]-tx.meta.preBalances[index])/1e9;
    if(delta) out.push(event('SOL','sol-delta',delta,'Includes fees, rent deposits/refunds and transfers; this is not trade PnL.'));
  }
  return out.length?out:[event('','no-change',0,'No owned balance delta in available metadata')];
}
const cache=new Map<string,{at:number;value:unknown}>(),pending=new Map<string,Promise<unknown>>();
export function sharedRead<T>(key:string,ttl:number,job:()=>Promise<T>,force=false):Promise<T>{
  const hit=cache.get(key); if(!force&&hit&&Date.now()-hit.at<ttl) return Promise.resolve(hit.value as T);
  if(pending.has(key)) return pending.get(key)! as Promise<T>;
  const task=job().then(value=>{cache.set(key,{at:Date.now(),value});if(cache.size>100)cache.delete(cache.keys().next().value!);return value;}).finally(()=>pending.delete(key));pending.set(key,task);return task;
}
export async function fetchWalletActivityV2(wallet:string,before?:string,force=false){
  if(!isSolanaAddress(wallet)) throw new Error('Invalid case-sensitive Solana address');
  return sharedRead(`activity:${wallet}:${before??''}`,15000,async()=>{
    const signatures=await rpc<Array<{signature:string;blockTime:number|null;err:unknown}>>('getSignaturesForAddress',[wallet,{limit:12,commitment:'confirmed',...(before?{before}:{})}],force);
    const rows:ActivityRow[]=[];let partial=false;
    for(let i=0;i<signatures.length;i+=2){
      const group=await Promise.allSettled(signatures.slice(i,i+2).map(async s=>parseWalletTransaction(await rpc<ParsedWalletTransaction|null>('getTransaction',[s.signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:0}],force),wallet,s.signature,s.blockTime)));
      group.forEach((r,j)=>{if(r.status==='fulfilled'){rows.push(...r.value);partial ||= r.value.some(x=>x.kind==='unavailable');}else{partial=true; const s=signatures[i+j];rows.push(...parseWalletTransaction(null,wallet,s.signature,s.blockTime));}});
    }
    return {wallet,rows,partial,fetchedAt:Date.now(),before:signatures.length===12?signatures.at(-1)?.signature:undefined,scope:'Latest 12 signatures per page; not full wallet history'};
  },force);
}
export function walletOverlap(rows:ActivityRow[],wallets:string[]){
  const selected=new Set(wallets);const mints=new Map<string,{mint:string;wallets:Set<string>;events:number;lastAt:number|null}>();const seen=new Set<string>();
  for(const r of rows){if(!selected.has(r.wallet)||!isSolanaAddress(r.mint)||!['received','sent'].includes(r.kind)||seen.has(r.id))continue;seen.add(r.id);const group=mints.get(r.mint)??{mint:r.mint,wallets:new Set<string>(),events:0,lastAt:null};group.wallets.add(r.wallet);group.events++;if(r.at!=null)group.lastAt=Math.max(group.lastAt??0,r.at);mints.set(r.mint,group);}
  return [...mints.values()].filter(x=>x.wallets.size>1).map(x=>({...x,wallets:[...x.wallets]})).sort((a,b)=>b.wallets.length-a.wallets.length||b.events-a.events);
}
export type PortfolioHolding={mint:string;quantity:number;rawAmount:string;decimals:number;program:string;accounts:number;symbol:string;priceUsd:number|null;valueUsd:number|null;priceSource:string;priceFetchedAt:number|null};
type AccountResponse={value:Array<{pubkey:string;account:{owner:string;data:{parsed?:{info?:{owner?:string;mint?:string;tokenAmount?:{amount:string;decimals:number;uiAmountString:string}}}}}}>};
export async function fetchWalletPortfolio(wallet:string,force=false){
  if(!isSolanaAddress(wallet)) throw new Error('Invalid Solana wallet');
  return sharedRead(`portfolio:${wallet}`,30000,async()=>{
    const result=await Promise.allSettled([rpc<{value:number}>('getBalance',[wallet,{commitment:'confirmed'}],force),...([TOKEN_PROGRAM,TOKEN_2022_PROGRAM].map(program=>rpc<AccountResponse>('getTokenAccountsByOwner',[wallet,{programId:program},{encoding:'jsonParsed',commitment:'confirmed'}],force)))]);
    const balanceFetchedAt=Date.now();const holdings=new Map<string,PortfolioHolding>(); const errors:string[]=[];
    result.forEach((r,i)=>{if(r.status==='rejected'){errors.push(`${['SOL balance','SPL Token','Token-2022'][i]} unavailable: ${String(r.reason)}`);return;}
      if(i===0){const sol=(r.value as {value?:unknown}|null)?.value;if(typeof sol!=='number'||!Number.isSafeInteger(sol)||sol<0){errors.push('SOL balance unavailable: malformed RPC balance response');return;}holdings.set('SOL',{mint:'SOL',quantity:sol/1e9,rawAmount:String(sol),decimals:9,program:'native',accounts:1,symbol:'SOL',priceUsd:null,valueUsd:null,priceSource:'Unavailable',priceFetchedAt:null});return;}
      const accounts=(r.value as AccountResponse|null)?.value;
      if(!Array.isArray(accounts)){errors.push(`${['SOL balance','SPL Token','Token-2022'][i]} unavailable: malformed RPC account response`);return;}
      for(const row of accounts){const info=row?.account?.data?.parsed?.info;const a=info?.tokenAmount;if(info?.owner!==wallet||!isSolanaAddress(info?.mint)||!a||typeof a.amount!=='string'||!/^\d+$/.test(a.amount)||!Number.isInteger(a.decimals)||a.decimals<0||a.decimals>30||row.account.owner!==[TOKEN_PROGRAM,TOKEN_2022_PROGRAM][i-1]){errors.push('Malformed or mismatched token account omitted');continue;}
        const old=holdings.get(info.mint);if(old&&old.decimals!==a.decimals){errors.push('Inconsistent mint decimals omitted');continue;}
        const raw=BigInt(old?.rawAmount??'0')+BigInt(a.amount);if(raw===0n)continue;
        holdings.set(info.mint,{mint:info.mint,quantity:Number(raw)/10**a.decimals,rawAmount:raw.toString(),decimals:a.decimals,program:row.account.owner,accounts:(old?.accounts??0)+1,symbol:info.mint.slice(0,6),priceUsd:null,valueUsd:null,priceSource:'Unavailable',priceFetchedAt:null});
      }
    });
    // Bound quote lookups to 12 mints, two at a time. Unpriced positions remain visible.
    const priced=[...holdings.values()].slice(0,12);
    for(let i=0;i<priced.length;i+=2)await Promise.allSettled(priced.slice(i,i+2).map(async h=>{const priceSnapshot=await sharedRead(`price:${h.mint}`,30000,async()=>({coin:await fetchSolCoinByAddress(h.mint==='SOL'?WSOL:h.mint),fetchedAt:Date.now()}));const coin=priceSnapshot.coin;if(!coin||coin.address!==(h.mint==='SOL'?WSOL:h.mint)||coin.chainId!=='solana'||!Number.isFinite(coin.priceUsd)||coin.priceUsd<=0)return;h.priceUsd=coin.priceUsd;h.valueUsd=h.quantity*coin.priceUsd;h.symbol=h.mint==='SOL'?'SOL':coin.symbol;h.priceSource=coin.source??'DEX Screener current pool snapshot';h.priceFetchedAt=priceSnapshot.fetchedAt;}));
    const rows=[...holdings.values()];const knownValueUsd=rows.some(h=>h.valueUsd!==null)?rows.reduce((sum,h)=>sum+(h.valueUsd??0),0):errors.length===0&&rows.every(h=>h.quantity===0)?0:null;return {wallet,holdings:rows,knownValueUsd,unpriced:rows.filter(h=>h.valueUsd===null).length,fetchedAt:balanceFetchedAt,partial:errors.length>0,errors,costBasisUsd:null,realizedPnlUsd:null,unrealizedPnlUsd:null,note:'Current balance snapshots do not establish historical cost basis or returns. Account scans may be partial; current valuations use up to 12 available DEX prices.'};
  },force);
}
