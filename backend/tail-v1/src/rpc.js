import {fetchJSON,solAddress,signature,now,HttpError,assert} from './core.js';
const TOKEN_PROGRAM='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export class Rpc {
 constructor({url=new URL('https://api.mainnet-beta.solana.com'),backup=null,fetchImpl=fetch}={}){this.url=url;this.backup=backup;this.fetchImpl=fetchImpl;this.id=0}
 async call(method,params){const payload={jsonrpc:'2.0',id:++this.id,method,params};let last;
  for(const url of [this.url,this.backup].filter(Boolean)){
   try {const res=await fetchJSON(url,{method:'POST',body:payload,timeoutMs:9000,fetchImpl:this.fetchImpl,maxBytes:3_000_000});if(res.error)throw new HttpError(502,'RPC_ERROR',String(res.error.message||'RPC error'));return res.result}
   catch(e){last=e;if(e?.status===400)break}
  }throw last||new HttpError(502,'RPC_UNAVAILABLE','RPC unavailable')
 }
 async wallet(address){address=solAddress(address);const [lamports,a,b]=await Promise.all([
  this.call('getBalance',[address,{commitment:'confirmed'}]),
  this.call('getTokenAccountsByOwner',[address,{programId:TOKEN_PROGRAM},{encoding:'jsonParsed',commitment:'confirmed'}]),
  this.call('getTokenAccountsByOwner',[address,{programId:TOKEN_2022},{encoding:'jsonParsed',commitment:'confirmed'}])
 ]);
 const byMint=new Map();for(const row of [...(a?.value||[]),...(b?.value||[])]){
 const info=row?.account?.data?.parsed?.info; if(!info?.mint||!info?.tokenAmount?.amount)continue;
 const item=byMint.get(info.mint)||{mint:info.mint,rawAmount:'0',decimals:info.tokenAmount.decimals,program:row.account.owner};
 item.rawAmount=(BigInt(item.rawAmount)+BigInt(info.tokenAmount.amount)).toString();byMint.set(info.mint,item)
 }
 return {address,lamports:String(lamports?.value??'0'),sol:(Number(lamports?.value||0)/1e9).toString(),tokens:[...byMint.values()],asOf:now(),source:'Solana RPC',note:'Balances only. Not a realized/unrealized PnL ledger.'}
 }
 async activity(address,limit=15){address=solAddress(address);const signatures=await this.call('getSignaturesForAddress',[address,{limit:Math.max(1,Math.min(50,Number(limit)||15))}]);return {address,signatures,asOf:now(),source:'Solana RPC',note:'Signatures are not classified as trades.'}}
 async txStatus(sig){sig=signature(sig);const result=await this.call('getSignatureStatuses',[[sig],{searchTransactionHistory:true}]);return {signature:sig,status:result?.value?.[0]||null,asOf:now()}}
}
