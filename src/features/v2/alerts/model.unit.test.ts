import {describe,it,expect} from 'vitest';
import {snapshotFromPair} from '../market/snapshot';
import {evaluateMarketRule,parseRules,canDeliverRule,type AlertRule} from './model';
const mint='So11111111111111111111111111111111111111112',pool='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const snapshot=(price:number)=>snapshotFromPair(mint,{chainId:'solana',pairAddress:pool,baseToken:{address:mint},priceUsd:price,liquidity:{usd:100},volume:{h24:100}});
const rule:AlertRule={id:'rule',label:'Above',kind:'price_above',mint,wallet:'',threshold:2,enabled:true,notify:false,createdAt:Date.now(),updatedAt:Date.now(),lastTriggeredAt:null};
describe('foreground alert evidence',()=>{
 it('fires on a threshold crossing and does not repeat while above it',()=>{expect(evaluateMarketRule(rule,snapshot(3),snapshot(1)).fired).toBe(true);expect(evaluateMarketRule(rule,snapshot(3),snapshot(2.5)).fired).toBe(false);});
 it('retains per-field live provenance independent of old metadata timestamps',()=>{const s=snapshot(3);s.fetchedAt=Date.now()-300000;s.fields.priceUsd={...s.fields.priceUsd,source:'Fixture PubSub',observedAt:12345,fetchedAt:Date.now()};const r=evaluateMarketRule(rule,s);expect(r.fired).toBe(true);expect(r.source).toBe('Fixture PubSub');expect(r.observedAt).toBe(12345);});
 it('unknown and stale fields do not become numeric zero',()=>{const s=snapshot(3);s.fields.priceUsd.value=null;expect(evaluateMarketRule({...rule,kind:'price_below'},s).fired).toBe(false);s.fields.priceUsd.value=1;s.fields.priceUsd.status='stale';expect(evaluateMarketRule({...rule,kind:'price_below'},s).fired).toBe(false);});
 it('does not compare percentage changes across different providers',()=>{const old=snapshot(1),now=snapshot(3);now.fields.priceUsd.source='Another source';expect(evaluateMarketRule({...rule,kind:'price_change',threshold:1},now,old).fired).toBe(false);});
 it('uses current persisted cooldown and validates rule imports',()=>{expect(canDeliverRule(rule)).toBe(true);expect(canDeliverRule({...rule,lastTriggeredAt:Date.now()})).toBe(false);expect(parseRules([{...rule,mint:'0x123'}])).toEqual([]);expect(parseRules([rule,rule])).toHaveLength(1);});
});
