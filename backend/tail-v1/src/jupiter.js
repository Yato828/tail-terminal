import {fetchJSON,solAddress,rawAmount,assert,now,HttpError,Cache} from './core.js';
const JUP='https://api.jup.ag/swap/v2/order';
export class Jupiter {
 constructor({key='',fetchImpl=fetch}={}){this.key=key;this.fetchImpl=fetchImpl;this.cache=new Cache();this.last=0}
 async quote(inputMint,outputMint,amount){inputMint=solAddress(inputMint);outputMint=solAddress(outputMint);amount=rawAmount(amount);
  assert(inputMint!==outputMint,400,'SAME_MINT','Cannot swap token for itself');
  const cacheKey=`${inputMint}/${outputMint}/${amount}`;
  return this.cache.get(cacheKey,2500,async()=>{
   // The shared backend must not burst requests above keyless Jupiter quotas.
   if(Date.now()-this.last<(this.key?1100:2100))throw new HttpError(429,'JUPITER_THROTTLE','Wait before next Jupiter quote');
   this.last=Date.now();const url=new URL(JUP);url.searchParams.set('inputMint',inputMint);url.searchParams.set('outputMint',outputMint);url.searchParams.set('amount',amount);
   const r=await fetchJSON(url,{headers:this.key?{'x-api-key':this.key}:{},fetchImpl:this.fetchImpl});
   if(r?.errorCode)throw new HttpError(422,'NO_ROUTE',String(r.errorMessage||r.errorCode));
   assert((r.inputMint==null||r.inputMint===inputMint)&&(r.outputMint==null||r.outputMint===outputMint)&&(r.inAmount==null||String(r.inAmount)===amount),502,'QUOTE_MISMATCH','Provider quote does not match the requested pair and amount');
   assert(typeof r.outAmount==='string'&&/^[0-9]+$/.test(r.outAmount)&&BigInt(r.outAmount)>0n&&BigInt(r.outAmount)<=18446744073709551615n,422,'NO_ROUTE','Provider returned no valid output amount');
   // Deliberately DROP transaction, requestId, address lookup tables, and arbitrary provider fields.
   return {source:'Jupiter Swap API V2',asOf:now(),inputMint,outputMint,inAmount:String(r.inAmount??amount),outAmount:r.outAmount!=null?String(r.outAmount):null,
    feeBps:r.feeBps??null,feeMint:r.feeMint??null,router:r.router??null,priceImpactPct:r.priceImpactPct??null,
    routeAvailable:!!r.outAmount,executable:false,
    warning:'Quote only. TAIL deliberately disables swap transaction signing/submission until independent instruction-policy validation and end-to-end testing are completed.'}
  });
 }
}
