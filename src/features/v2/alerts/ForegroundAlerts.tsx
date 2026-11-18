import {useEffect,useRef} from 'react';
import {subscribeMarketSnapshot} from '../market/snapshot';
import type {MarketSnapshot} from '../market/types';
import {rpc} from '../../../lib/rpcFeed';
import {useBrowserData} from '../storage';
import {evaluateMarketRule,canDeliverRule,parseRules,parseRuleEvents,type RuleEvent,type AlertRule} from './model';
export function ForegroundAlerts(){
 const rules=useBrowserData('alert-rules',parseRules,[]),events=useBrowserData('alert-events',parseRuleEvents,[]),latest=useRef({rules,events});latest.current={rules,events};
 const previous=useRef(new Map<string,MarketSnapshot>()),walletSeen=useRef(new Map<string,Set<string>>());
 const keys=JSON.stringify(rules.value.filter(r=>r.enabled).map(r=>[r.id,r.mint,r.wallet,r.updatedAt]));
 useEffect(()=>{
  let disposed=false;const onEvent=(rule:AlertRule,detail:string,source:string,observedAt:number|null)=>{
   if(disposed)return;const now=Date.now(),state=latest.current,currentRule=state.rules.value.find(r=>r.id===rule.id);if(!canDeliverRule(currentRule,now))return;
   const event:RuleEvent={id:crypto.randomUUID(),ruleId:rule.id,label:rule.label,mint:rule.mint,wallet:rule.wallet,at:now,source,observedAt,detail};
   const nextRules=state.rules.value.map(r=>r.id===rule.id?{...r,lastTriggeredAt:now}:r),nextEvents=[event,...state.events.value].slice(0,500);
   // Update the live ref before asynchronous persistence so simultaneous sources
   // cannot overwrite another event from this same foreground runner.
   latest.current={rules:{...state.rules,value:nextRules},events:{...state.events,value:nextEvents}};
   void state.rules.update(nextRules);void state.events.update(nextEvents);
   if(rule.notify&&typeof Notification!=='undefined'&&Notification.permission==='granted')try{new Notification('TAIL · '+rule.label,{body:detail.slice(0,240),tag:rule.id});}catch{}
  };
  const active=latest.current.rules.value.filter(r=>r.enabled),mints=[...new Set(active.map(r=>r.mint).filter(Boolean))].slice(0,8),wallets=[...new Set(active.map(r=>r.wallet).filter(Boolean))].slice(0,4);
  const stops=mints.map(mint=>subscribeMarketSnapshot(mint,(current)=>{
   if(disposed||document.hidden)return;const prior=previous.current.get(mint);
   for(const rule of latest.current.rules.value.filter(r=>r.enabled&&r.mint===mint)){const result=evaluateMarketRule(rule,current,prior);if(result.fired)onEvent(rule,result.detail,result.source??'Unavailable',result.observedAt??null);}
   previous.current.set(mint,current);
  }));
  let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   if(!document.hidden)await Promise.allSettled(wallets.map(async wallet=>{
    const rows=await rpc<Array<{signature:string;err:unknown;blockTime:number|null}>>('getSignaturesForAddress',[wallet,{limit:10,commitment:'confirmed'}]);if(disposed)return;
    const seen=walletSeen.current.get(wallet),valid=rows.filter(r=>!r.err&&/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(r.signature));
    if(seen)for(const row of valid.filter(r=>!seen.has(r.signature)))for(const rule of latest.current.rules.value.filter(r=>r.enabled&&r.wallet===wallet))onEvent(rule,`New confirmed signature observed: ${row.signature}. Transaction action and size are not inferred.`,'Solana RPC',row.blockTime==null?null:row.blockTime*1000);
    walletSeen.current.set(wallet,new Set([...(seen??[]),...valid.map(r=>r.signature)].slice(-200)));
   }));
   if(!disposed)timer=setTimeout(poll,30000);
  };if(wallets.length)void poll();
  return()=>{disposed=true;clearTimeout(timer);stops.forEach(s=>s());};
 },[keys]);
 return null;
}
