import {rpc} from '../../../lib/rpcFeed';
import {fetchHolderSnapshot} from '../../../lib/holders';
import {isSolanaAddress} from '../../../lib/validation';
import {TOKEN_PROGRAM,TOKEN_2022_PROGRAM} from '../intelligence/wallet';
import type {MarketSnapshot} from './types';
import {publishMintEvidence} from './snapshot';
/** Explicit bounded enrichment, never a background scan of the token universe. */
export async function enrichMintEvidence(items:MarketSnapshot[]):Promise<MarketSnapshot[]>{
 const selected=items.slice(0,8);if(!selected.length)return items;
 const response=await rpc<{value:Array<{owner?:string;data?:{parsed?:{type?:string;info?:{mintAuthority?:string|null;freezeAuthority?:string|null;supply?:string;decimals?:number}}}}|null>}>('getMultipleAccounts',[selected.map(s=>s.mint),{encoding:'jsonParsed',commitment:'confirmed'}]);
 if(!Array.isArray(response.value)||response.value.length!==selected.length)throw Error('Mint evidence source returned an invalid batch.');
 const at=Date.now();
 const enriched=selected.map((s,i)=>{
  const account=response.value[i],parsed=account?.data?.parsed,info=parsed?.info;if(!account||![TOKEN_PROGRAM,TOKEN_2022_PROGRAM].includes(account.owner??'')||parsed?.type!=='mint'||!info)return s;
  const fields={...s.fields};for(const key of ['mintAuthority','freezeAuthority']as const){const raw=info[key],known=raw===null||isSolanaAddress(raw);fields[key]={value:known?raw!==null:null,source:'Solana mainnet RPC',observedAt:null,fetchedAt:at,status:known?'ready':'unavailable',note:'Confirmed mint authority capability; present is not proof of abuse. Source event time is not supplied.'};}
  fields.tokenProgram={value:account.owner!,source:'Solana mainnet RPC',observedAt:null,fetchedAt:at,status:'ready',note:'Validated parsed mint account program owner.'};return{...s,fields};
 });
 for(let i=0;i<Math.min(enriched.length,4);i+=2)await Promise.allSettled(enriched.slice(i,i+2).map(async(s,j)=>{
  const account=response.value[i+j];if(!account||![TOKEN_PROGRAM,TOKEN_2022_PROGRAM].includes(account.owner??'')||account.data?.parsed?.type!=='mint')return;
  const raw=response.value[i+j]?.data?.parsed?.info,supply=raw?.supply&&/^\d+$/.test(raw.supply)&&Number.isInteger(raw.decimals)&&raw.decimals!>=0&&raw.decimals!<=18?Number(raw.supply)/10**raw.decimals!:null;
  if(!(typeof supply==='number'&&Number.isFinite(supply)&&supply>0))return;
  const holders=await fetchHolderSnapshot(s.mint);if(!holders.holders.length||holders.accountCount<1)return;
  const sum=holders.holders.reduce((n,h)=>n+Number(h.value),0),ratio=sum/supply*100;
  if(!Number.isFinite(ratio)||ratio<0||ratio>100)return;
  s.fields.holderConcentration={value:ratio,source:holders.source,observedAt:holders.observedAt??null,fetchedAt:holders.fetchedAt,status:'ready',note:`Largest ${holders.accountCount} token-account owners as an approximate % of supply${holders.partial?' with unresolved sample owners':''}, not a complete holder distribution. Mint supply and balances may have different source times.`};
 }));
 enriched.forEach(publishMintEvidence);
 return[...enriched,...items.slice(selected.length)];
}
