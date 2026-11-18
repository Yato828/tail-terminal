import { describe, expect, it } from 'vitest';
import { accountManualJournal } from './JournalAccounting';
import type { JournalEntry } from './model';
import { weightedAverageAccounting } from '../intelligence/accounting';
const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
function row(id:string,side:JournalEntry['side'],quantity:number|null,priceUsd:number|null,feeUsd:number|null=0,at=1700000000000):JournalEntry {
  return {id,mint,side,quantity,priceUsd,feeUsd,at,reason:'Manual',tags:[],notes:'',signature:null,origin:'manual'};
}
describe('opt-in manual journal weighted average accounting',()=>{
  it('keeps default opening inventory and PnL unknown despite complete-looking manual records',()=>{
    const report=accountManualJournal([row('buy','buy',10,10),row('sell','sell',4,15,0,1700000001000)],{marks:{[mint]:20}});
    expect(report.manual).toBe(true);expect(report.completeHistory).toBe(false);
    expect(report.positions[0]).toMatchObject({quantityExact:'6',costBasisUsd:null,realizedPnlUsd:null,unrealizedPnlUsd:null});
  });
  it('accounts explicit manual prices, fees and partial sells only after opening completeness opt-in',()=>{
    const entries=[row('a','buy',10,10,2),row('b','buy',10,20,0,1700000001000),row('c','sell',5,20,1,1700000002000)];
    const r=accountManualJournal(entries,{openingKnown:true,marks:{[mint]:20}});
    expect(r.positions[0]).toMatchObject({quantityExact:'15',costBasisUsd:226.5,averageCostUsd:15.1,realizedPnlUsd:23.5,unrealizedPnlUsd:73.5});
  });
  it('does not turn a locally flat sample into known opening inventory',()=>{
    const r=accountManualJournal([row('a','buy',1,10),row('b','sell',1,20,0,1700000001000),row('c','buy',1,30,0,1700000002000)]);
    expect(r.positions[0]).toMatchObject({quantityExact:'1',costBasisUsd:null,realizedPnlUsd:null});
  });
  it('requires an explicit transfer direction and preserves conservative incoming basis',()=>{
    const records=[row('a','buy',10,10),row('transfer','transfer',2,null,0,1700000001000)];
    const unresolved=accountManualJournal(records,{openingKnown:true});expect(unresolved.completeHistory).toBe(false);expect(unresolved.issues[0].reason).toContain('direction');
    const incoming=accountManualJournal(records,{openingKnown:true,transferDirections:{transfer:'in'},marks:{[mint]:20}});
    expect(incoming.positions[0]).toMatchObject({quantityExact:'12',costBasisUsd:null,unrealizedPnlUsd:null});
    const outgoing=accountManualJournal(records,{openingKnown:true,transferDirections:{transfer:'out'}});
    expect(outgoing.positions[0]).toMatchObject({quantityExact:'8',costBasisUsd:80,realizedPnlUsd:0});
  });
  it('propagates missing historical prices/fees and a missing mark rather than manufacturing returns',()=>{
    const priced=accountManualJournal([row('a','buy',2,5)],{openingKnown:true});expect(priced.positions[0].costBasisUsd).toBe(10);expect(priced.positions[0].unrealizedPnlUsd).toBeNull();
    for(const records of [[row('a','buy',2,null)],[row('a','buy',2,5,null)]]) {
      const r=accountManualJournal(records,{openingKnown:true,marks:{[mint]:10}});expect(r.positions[0].costBasisUsd).toBeNull();expect(r.positions[0].unrealizedPnlUsd).toBeNull();expect(r.issues.length).toBeGreaterThan(0);
    }
    expect(accountManualJournal([row('a','buy',null,10),row('b','buy',1,10)],{openingKnown:true}).completeHistory).toBe(false);
  });
  it('does not double-count replayed records or trust a user-supplied execution origin',()=>{
    const a=row('a','buy',10,2);const r=accountManualJournal([a,a,{...row('b','sell',2,3,0,1700000001000),origin:'confirmed-execution'}],{openingKnown:true});
    expect(r.positions[0].quantityExact).toBe('8');expect(r.mappedCount).toBe(2);expect(r.manual).toBe(true);expect(r.completeHistory).toBe(false);
  });
  it('preserves exact decimal units and does not allow epsilon overselling tiny positions',()=>{
    const r=accountManualJournal([row('a','buy',.3,.2),row('b','sell',.1,.3,0,1700000001000),row('c','sell',.2,.3,0,1700000002000)],{openingKnown:true});
    expect(r.positions[0]).toMatchObject({quantityExact:'0',costBasisUsd:0,realizedPnlUsd:.03});
    const tiny=weightedAverageAccounting([{id:'a',at:1,mint,kind:'buy',quantity:1e-13,usdTotal:1},{id:'b',at:2,mint,kind:'sell',quantity:2e-13,usdTotal:2}],{},true);
    expect(tiny.positions[0].realizedPnlUsd).toBeNull();expect(tiny.positions[0].reasons).toContain('Disposal exceeds known acquired units');
  });
  it('reports transfer fees separately without pretending they are trade execution costs',()=>{
    const r=accountManualJournal([row('a','buy',10,10),row('t','transfer',2,null,3,1700000001000)],{openingKnown:true,transferDirections:{t:'out'}});
    expect(r.transferFeesUsd).toBe(3);expect(r.positions[0]).toMatchObject({costBasisUsd:80,realizedPnlUsd:0});
  });
});
