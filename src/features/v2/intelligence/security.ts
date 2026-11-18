import type { AxiomCoin } from '../../../lib/axiom';
import { getMarketSnapshot } from '../market/snapshot';
import { rpc } from '../../../lib/rpcFeed';
import { fetchHolderSnapshot, type HolderSnapshot } from '../../../lib/holders';
import { isSolanaAddress } from '../../../lib/validation';
import type { Evidence } from '../contracts';
import { sharedRead, TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from './wallet';
export type SecurityCheck={key:string;title:string;evidence:Evidence<string|number>;confidence:'on-chain'|'provider snapshot'|'unknown'};
export type SecurityReport={mint:string;fetchedAt:number;checks:SecurityCheck[];holders:HolderSnapshot|null;timeline:Array<{at:number|null;event:string;source:string;note:string}>;developerDna:{status:'unavailable';reason:string}};
type MintAccount={context?:{slot:number};value:{owner:string;data:{parsed?:{type?:string;info?:{mintAuthority?:string|null;freezeAuthority?:string|null;supply?:string;decimals?:number;extensions?:Array<{extension?:string}>}}}}|null};
export async function fetchTokenSecurity(coin:AxiomCoin,force=false):Promise<SecurityReport>{
  if(!isSolanaAddress(coin.address))throw new Error('Invalid Solana mint');
  return sharedRead(`security:${coin.address}:${coin.pairAddress}`,30000,async()=>{
    const [account,holderResult,marketResult]=await Promise.allSettled([rpc<MintAccount>('getAccountInfo',[coin.address,{encoding:'jsonParsed',commitment:'confirmed'}],force),fetchHolderSnapshot(coin.address,force), getMarketSnapshot(coin.address,{force})]);
    const fetchedAt=Date.now();const checks:SecurityCheck[]=[];
    const market=marketResult.status==='fulfilled'&&marketResult.value?.mint===coin.address&&isSolanaAddress(marketResult.value?.poolAddress)?marketResult.value:null;
    const add=(key:string,title:string,value:string|number|null,source:string,note:string,confidence:SecurityCheck['confidence']='unknown',observedAt:number|null=null,sourceFetchedAt=fetchedAt)=>checks.push({key,title,evidence:{value,source,observedAt,fetchedAt:sourceFetchedAt,status:value===null?'unavailable':'ready',note},confidence});
    const value=account.status==='fulfilled'?account.value?.value:null;
    const mint=value?.data?.parsed;const info=mint?.info;
    const verified=!!value&&[TOKEN_PROGRAM,TOKEN_2022_PROGRAM].includes(value.owner)&&mint?.type==='mint';
    if(verified&&info){
      add('program','Token program',value!.owner,'Solana mainnet RPC','Confirmed mint account owner','on-chain',null);
      for(const [key,title] of [['mintAuthority','Mint authority'],['freezeAuthority','Freeze authority']] as const){const authority=info[key];add(key,title,authority===null?'Revoked':isSolanaAddress(authority)?authority:null,'Solana mainnet RPC',authority===null?'Authority is null in confirmed mint account':'Present authority is a capability, not proof of abuse','on-chain',null);}
      const decimals=info.decimals;const supply=info.supply&&/^\d+$/.test(info.supply)&&Number.isInteger(decimals)&&decimals!>=0&&decimals!<=30?Number(info.supply)/10**decimals!:null;
      add('supply','Supply',supply!==null&&Number.isFinite(supply)?supply:null,'Solana mainnet RPC','UI units calculated from raw supply and mint decimals','on-chain',null);
      const extensions=info.extensions;
      add('extensions','Token-2022 extensions',value!.owner===TOKEN_PROGRAM?'Standard Token program (not Token-2022)':Array.isArray(extensions)?extensions.map(e=>e.extension??'Unrecognized extension').join(', ')||'No extensions returned':null,'Solana mainnet RPC','Only extensions returned by the RPC parser are listed; unsupported extensions remain unknown.','on-chain',null);
    }else for(const [key,title] of [['program','Token program'],['mintAuthority','Mint authority'],['freezeAuthority','Freeze authority'],['supply','Supply'],['extensions','Token-2022 extensions']])add(key,title,null,'Solana mainnet RPC',account.status==='rejected'?String(account.reason):'Selected address was not a parsed SPL mint');
    const holders=holderResult.status==='fulfilled'?holderResult.value:null;
    const supply=checks.find(c=>c.key==='supply')?.evidence.value??holders?.supply;
    const sampled=holders?.holders.reduce((s,h)=>s+Number(h.value),0);
    add('concentration','Largest-account owner sample / supply',holders&&sampled!=null&&typeof supply==='number'&&supply>0?sampled/supply<=1?sampled/supply*100:null:null,holders?.source??'Unavailable',`Largest ${holders?.accountCount??20} token accounts aggregated by owner; excludes the rest of supply. Indexed balance time may be unknown.`,holders?'provider snapshot':'unknown',holders?.observedAt??null,holders?.fetchedAt??fetchedAt);
    const sourcePool=market?.poolAddress??null;
    const liquidity=market?.fields.liquidityUsd;
    const metadata=market?.metadata;
    add('pool','Indexed liquidity pool',sourcePool,liquidity?.source??'Unavailable','Raw market provider mapping; this may be the most liquid pool rather than the selected chart pool. Liquidity locking and beneficial ownership are unavailable.','provider snapshot',liquidity?.observedAt??null,liquidity?.fetchedAt??fetchedAt);
    const liquidityValue=liquidity&&['ready','stale'].includes(liquidity.status)&&typeof liquidity.value==='number'&&Number.isFinite(liquidity.value)&&liquidity.value>=0?liquidity.value:null;
    add('liquidity','Pool liquidity USD',liquidityValue,liquidity?.source??'Unavailable','Raw pool snapshot, not locked liquidity. Unknown fields are not normalized to zero.','provider snapshot',liquidity?.observedAt??null,liquidity?.fetchedAt??fetchedAt);
    if(liquidity)checks.at(-1)!.evidence.status=liquidityValue===null&&liquidity.status==='ready'?'unavailable':liquidity.status;
    add('metadata','Token metadata',metadata?.value?.name&&metadata.value.symbol?`${metadata.value.name} / ${metadata.value.symbol}`:null,metadata?.source??'Unavailable','Provider display metadata; not a verified creator identity','provider snapshot',metadata?.observedAt??null,metadata?.fetchedAt??fetchedAt);
    if(metadata?.value)checks.at(-1)!.evidence.status=metadata.status;
    add('creator','Creator / deployer',null,'Unavailable','Mint authority, metadata update authority and first observed trader do not prove creator identity.');
    const timeline:SecurityReport['timeline']=[];
    if(coin.createdAt&&Number.isFinite(coin.createdAt))timeline.push({at:coin.createdAt,event:'Pool creation reported',source:coin.source??'DEX Screener',note:'Pool timestamp, not token mint creation'});
    timeline.push({at:fetchedAt,event:'Security evidence fetched',source:'TAIL browser',note:'A local fetch event, not a blockchain launch event'});
    return {mint:coin.address,fetchedAt,checks,holders,timeline,developerDna:{status:'unavailable',reason:'No verified creator identity or historical creator index is available. Tokens are not linked by authority or timing alone.'}};
  },force);
}
