import {isSolanaAddress} from '../../../lib/validation';
import {evaluateFilter,validateFilter} from '../market/filters';
import type {FilterNode,MarketSnapshot} from '../market/types';
export const ALERT_KINDS=['price_above','price_below','price_change','volume_increase','liquidity_change','wallet_activity','token_migration','new_match','holder_change'] as const;
export type AlertKind=typeof ALERT_KINDS[number];
export type AlertRule={id:string;label:string;kind:AlertKind;mint:string;wallet:string;threshold:number|null;enabled:boolean;notify:boolean;filter?:FilterNode;createdAt:number;updatedAt:number;lastTriggeredAt:number|null;};
export type RuleEvent={id:string;ruleId:string;label:string;mint:string;wallet:string;at:number;source:string;observedAt:number|null;detail:string;};
export function parseRules(raw:unknown):AlertRule[]{
 if(!Array.isArray(raw))return[];const seen=new Set<string>();
 return raw.slice(0,100).filter((r):r is AlertRule=>{
  if(!r||typeof r.id!=='string'||!/^[\w-]{1,80}$/.test(r.id)||seen.has(r.id)||!ALERT_KINDS.includes(r.kind)||typeof r.label!=='string'||typeof r.enabled!=='boolean'||typeof r.notify!=='boolean'||!Number.isFinite(r.createdAt)||!Number.isFinite(r.updatedAt))return false;
  if(r.kind==='wallet_activity'?!isSolanaAddress(r.wallet):!isSolanaAddress(r.mint))return false;
  if(!['wallet_activity','token_migration','new_match'].includes(r.kind)&&(!Number.isFinite(r.threshold)||r.threshold<=0))return false;
  if(r.kind==='new_match'&&!validateFilter(r.filter).valid)return false;
  if(r.lastTriggeredAt!==null&&(!Number.isFinite(r.lastTriggeredAt)||r.lastTriggeredAt>Date.now()+60000))return false;
  seen.add(r.id);return true;
 }).map(r=>({...r,label:r.label.slice(0,100),wallet:typeof r.wallet==='string'?r.wallet:'',mint:typeof r.mint==='string'?r.mint:''}));
}
export function parseRuleEvents(raw:unknown):RuleEvent[]{return Array.isArray(raw)?raw.slice(0,500).filter(r=>r&&typeof r.id==='string'&&typeof r.ruleId==='string'&&typeof r.label==='string'&&typeof r.source==='string'&&Number.isFinite(r.at)&&typeof r.detail==='string').map(r=>({...r,detail:r.detail.slice(0,1000)})):[];}
export function canDeliverRule(rule:AlertRule|undefined,now=Date.now()){return !!rule?.enabled&&(!rule.lastTriggeredAt||now-rule.lastTriggeredAt>=60000);}
export function evaluateMarketRule(rule:AlertRule,current:MarketSnapshot,previous?:MarketSnapshot):{fired:boolean;detail:string;source?:string;observedAt?:number|null}{
 const no=(detail:string)=>({fired:false,detail});
 if(!rule.enabled||rule.mint!==current.mint)return no('Waiting for a fresh matching source.');
 if(rule.lastTriggeredAt&&Date.now()-rule.lastTriggeredAt<60000)return no('Cooldown.');
 const field=({price_above:'priceUsd',price_below:'priceUsd',price_change:'priceUsd',volume_increase:'volume24h',liquidity_change:'liquidityUsd',holder_change:'holderConcentration',token_migration:'migrationAt'} as const)[rule.kind as Exclude<AlertKind,'wallet_activity'|'new_match'>];
 if(rule.kind==='new_match'){
  if(!rule.filter)return no('Filter unavailable.');
  const result=evaluateFilter(current,rule.filter),prior=previous?evaluateFilter(previous,rule.filter):'no-match';
  return {fired:result==='match'&&prior!=='match'&&(!rule.lastTriggeredAt||!!previous),detail:result==='unknown'?'A filter field is unavailable.':'New match in the explicitly observed token set.',source:'Local filter over '+[...new Set(Object.values(current.fields).filter(v=>v.status==='ready').map(v=>v.source))].join(', '),observedAt:null};
 }
 if(!field)return no('This rule requires an observed wallet event.');
 const reading=current.fields[field];if(reading.status!=='ready'||typeof reading.value!=='number'||!Number.isFinite(reading.value)||Date.now()-reading.fetchedAt>120000||reading.fetchedAt>Date.now()+60000)return no('Required fresh source value unavailable.');
 const value=reading.value,prior=previous?.fields[field];
 const same=previous&&prior&&Date.now()-prior.fetchedAt<120000&&prior.status==='ready'&&prior.source===reading.source&&typeof prior.value==='number';
 if(rule.kind==='token_migration'){
  const stage=current.fields.launchStage;
  return{fired:value>0&&stage.status==='ready'&&stage.value==='migrated'&&(!prior||prior.value!==value)&&(!rule.lastTriggeredAt||!!previous),detail:'Verified migration timestamp from '+reading.source,source:reading.source,observedAt:reading.observedAt};
 }
 if(rule.kind==='price_above'||rule.kind==='price_below'){
  const hit=rule.kind==='price_above'?value>=rule.threshold!:value<=rule.threshold!;
  const wasHit=same&&(rule.kind==='price_above'?Number(prior!.value)>=rule.threshold!:Number(prior!.value)<=rule.threshold!);
  return{fired:hit&&!wasHit&&(!rule.lastTriggeredAt||!!previous),detail:`Observed price ${value} USD (${reading.source}).`,source:reading.source,observedAt:reading.observedAt};
 }
 if(!same||Number(prior!.value)<=0)return no('Two fresh comparable snapshots from the same source are required.');
 const change=(value/Number(prior!.value)-1)*100,hit=rule.kind==='volume_increase'?change>=rule.threshold!:Math.abs(change)>=rule.threshold!;
 return{fired:hit,detail:`${field} changed ${change.toFixed(3)}% between consecutive observed snapshots. This is not an all-time measurement.`,source:reading.source,observedAt:reading.observedAt};
}
