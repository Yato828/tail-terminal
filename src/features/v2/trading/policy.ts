import {VersionedTransaction,PublicKey,SystemProgram,ComputeBudgetProgram} from '@solana/web3.js';
import {isSolanaAddress} from '../../../lib/validation';

export type TradeIntent={wallet:string;inputMint:string;outputMint:string;amount:string;maxSlippageBps:number;quoteAt:number;maxNetworkFeeLamports:string;};
export type PolicyResult={allowed:false;reasons:string[];programs:string[];requiredSigners:string[];};
export const EXECUTION_POLICY={version:1,executionEnabled:false,automaticSigning:false,vettedDexAdapters:[] as string[],maxTransactionBytes:1232,quoteTtlMs:45000};
export function parseTokenAmount(text:string,decimals:number):string{
 if(!Number.isInteger(decimals)||decimals<0||decimals>18||!/^\d{1,20}(?:\.\d{0,18})?$/.test(text))throw Error('Invalid token amount or decimals.');
 const [whole,fraction='']=text.split('.');if(fraction.length>decimals)throw Error('Too many decimal places for this token.');
 const raw=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0');
 if(raw<=0n||raw>18446744073709551615n)throw Error('Amount is outside the supported token range.');return raw.toString();
}
export function minimumOutput(raw:string,slippageBps:number){
 if(!/^\d{1,20}$/.test(raw)||!Number.isInteger(slippageBps)||slippageBps<0||slippageBps>5000)throw Error('Invalid slippage or output.');
 return (BigInt(raw)*BigInt(10000-slippageBps)/10000n).toString();
}
/** This inspection is intentionally insufficient for signing: unknown router
 * instructions and lookup tables are rejected until a vetted adapter exists. */
export function inspectUnsignedTrade(bytes:Uint8Array,intent:TradeIntent,now=Date.now()):PolicyResult{
 const reasons:string[]=[],programs:string[]=[],requiredSigners:string[]=[];
 if(![intent.wallet,intent.inputMint,intent.outputMint].every(isSolanaAddress)||intent.inputMint===intent.outputMint)reasons.push('Invalid or identical Solana mints/wallet.');
 if(!/^[1-9]\d{0,19}$/.test(intent.amount)||BigInt(intent.amount)>18446744073709551615n)reasons.push('Invalid input amount.');
 if(!Number.isInteger(intent.maxSlippageBps)||intent.maxSlippageBps<0||intent.maxSlippageBps>5000)reasons.push('Slippage exceeds the policy.');
 if(!/^\d{1,20}$/.test(intent.maxNetworkFeeLamports)||BigInt(intent.maxNetworkFeeLamports)>10000000n)reasons.push('Invalid aggregate network-fee limit.');
 if(!Number.isFinite(intent.quoteAt)||now-intent.quoteAt>EXECUTION_POLICY.quoteTtlMs||intent.quoteAt>now+1000)reasons.push('Quote expired or timestamp is invalid.');
 if(bytes.length>EXECUTION_POLICY.maxTransactionBytes||!bytes.length)reasons.push('Invalid transaction size.');
 else try{
  const tx=VersionedTransaction.deserialize(bytes),message=tx.message,keys=message.staticAccountKeys;
  requiredSigners.push(...keys.slice(0,message.header.numRequiredSignatures).map(k=>k.toBase58()));
  if(keys[0]?.toBase58()!==intent.wallet||requiredSigners.length!==1||requiredSigners[0]!==intent.wallet)reasons.push('Unexpected fee payer or additional required signer.');
  if(tx.signatures.some(sig=>sig.some(b=>b!==0)))reasons.push('Pre-signed transactions are not accepted.');
  if(message.addressTableLookups.length)reasons.push('Address lookup tables require independently resolved account validation.');
  for(const instruction of message.compiledInstructions){
   const program=keys[instruction.programIdIndex]?.toBase58();if(!program){reasons.push('Unresolved program account.');continue;}programs.push(program);
   if(program===SystemProgram.programId.toBase58())reasons.push('System transfers and account changes require explicit decoded spend/recipient verification.');
   else if(program===ComputeBudgetProgram.programId.toBase58()){
    const data=instruction.data;
    if(data[0]===3&&data.length===9){let fee=0n;for(let i=8;i>=1;i--)fee=fee*256n+BigInt(data[i]);if(fee>1000000n)reasons.push('Compute-unit priority price exceeds the policy.');}
    else if(data[0]!==2||data.length!==5)reasons.push('Unsupported compute-budget instruction.');
   }else reasons.push('No vetted instruction decoder for program '+program+'.');
  }
  if(!message.compiledInstructions.length)reasons.push('Empty transaction.');
 }catch{reasons.push('Transaction could not be decoded.');}
 reasons.push('Execution disabled: quote-to-instruction amounts, recipients, approvals, account ownership, fees and simulation must all be verified by a supported DEX adapter.');
 return{allowed:false,reasons:[...new Set(reasons)],programs:[...new Set(programs)],requiredSigners};
}
export type ExecutionRecord={id:string;at:number;inputMint:string;outputMint:string;amount:string;state:'quoted'|'expired'|'blocked'|'submitted'|'confirmed'|'failed';signature:string|null;source:'manual-observation'|'wallet-execution';};
export function parseExecutionRecords(raw:unknown):ExecutionRecord[]{return Array.isArray(raw)?raw.slice(0,300).filter(r=>r&&typeof r.id==='string'&&Number.isFinite(r.at)&&isSolanaAddress(r.inputMint)&&isSolanaAddress(r.outputMint)&&/^\d+$/.test(r.amount)&&['quoted','expired','blocked','submitted','confirmed','failed'].includes(r.state)).map(r=>({...r,source:'manual-observation',signature:typeof r.signature==='string'&&/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(r.signature)?r.signature:null})):[];}
