import {describe,it,expect} from 'vitest';
import {parseTokenAmount,minimumOutput,inspectUnsignedTrade} from './policy';
import {PublicKey,SystemProgram,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
const intent={wallet:'So11111111111111111111111111111111111111112',inputMint:'So11111111111111111111111111111111111111112',outputMint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',amount:'100000000',maxSlippageBps:100,quoteAt:Date.now(),maxNetworkFeeLamports:'100000'};
describe('trade intent policy',()=>{
 it('uses atomic integers without floating point rounding',()=>{expect(parseTokenAmount('1.000001',6)).toBe('1000001');expect(()=>parseTokenAmount('1.0000001',6)).toThrow();expect(()=>parseTokenAmount('0',9)).toThrow();expect(()=>parseTokenAmount('18446744073709551616',0)).toThrow();});
 it('computes a bounded hypothetical minimum output',()=>{expect(minimumOutput('1000001',100)).toBe('990000');expect(()=>minimumOutput('10',10001)).toThrow();});
 it('fails closed on malformed bytes, expired quotes, excess fees and unknown DEX adapters',()=>{const r=inspectUnsignedTrade(new Uint8Array([1,2]),{...intent,quoteAt:Date.now()-90000,maxNetworkFeeLamports:'20000000'});expect(r.allowed).toBe(false);expect(r.reasons.join(' ')).toMatch(/expired/);expect(r.reasons.join(' ')).toMatch(/fee/);expect(r.reasons.join(' ')).toMatch(/Execution disabled/);});
 it('decodes actual unsigned bytes and refuses a substituted recipient, payer or pre-signed payload',()=>{
  const wallet=new PublicKey(intent.wallet),recipient=new PublicKey(intent.outputMint);
  const message=new TransactionMessage({payerKey:wallet,recentBlockhash:intent.wallet,instructions:[SystemProgram.transfer({fromPubkey:wallet,toPubkey:recipient,lamports:100})]}).compileToV0Message();
  const tx=new VersionedTransaction(message),read=inspectUnsignedTrade(tx.serialize(),intent);
  expect(read.allowed).toBe(false);expect(read.requiredSigners).toEqual([intent.wallet]);expect(read.programs).toContain(SystemProgram.programId.toBase58());expect(read.reasons.join(' ')).toContain('recipient verification');
  expect(inspectUnsignedTrade(tx.serialize(),{...intent,wallet:intent.outputMint}).reasons.join(' ')).toContain('Unexpected fee payer');
  tx.signatures[0][0]=1;
  expect(inspectUnsignedTrade(tx.serialize(),intent).reasons.join(' ')).toContain('Pre-signed');
 });
});
