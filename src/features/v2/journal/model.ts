import {isSolanaAddress} from '../../../lib/validation';
import {csvCell} from '../storage';
export type JournalEntry={id:string;mint:string;side:'buy'|'sell'|'transfer'|'note';quantity:number|null;priceUsd:number|null;feeUsd:number|null;at:number;reason:string;tags:string[];notes:string;signature:string|null;origin:'manual'|'confirmed-execution';};
export function parseJournal(raw:unknown):JournalEntry[]{
 if(!Array.isArray(raw))return[];
 const ids=new Set<string>();
 return raw.slice(0,500).filter((r):r is JournalEntry=>{
  if(!r||typeof r!=='object'||typeof r.id!=='string'||!/^[\w-]{1,80}$/.test(r.id)||ids.has(r.id)||!isSolanaAddress(r.mint)||!['buy','sell','transfer','note'].includes(r.side)||!Number.isFinite(r.at)||r.at<=0||r.at>Date.now()+60000||!['manual','confirmed-execution'].includes(r.origin))return false;
  if(![r.quantity,r.priceUsd,r.feeUsd].every(n=>n===null||Number.isFinite(n)&&n>=0)||typeof r.reason!=='string'||typeof r.notes!=='string'||!Array.isArray(r.tags)||!r.tags.every((t:unknown)=>typeof t==='string'))return false;
  // User-imported signatures and records never become verified executions.
  ids.add(r.id);return true;
 }).map(r=>({...r,reason:r.reason.slice(0,500),notes:r.notes.slice(0,4000),tags:r.tags.slice(0,12).map(t=>t.slice(0,40)),signature:typeof r.signature==='string'&&/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(r.signature)?r.signature:null,origin:'manual'}));
}
export function journalCsv(rows:JournalEntry[]){
 return ['timestamp,mint,action,quantity,price_usd,fee_usd,origin,signature,reason,tags,notes',...rows.map(r=>[new Date(r.at).toISOString(),r.mint,r.side,r.quantity,r.priceUsd,r.feeUsd,r.origin,r.signature,r.reason,r.tags.join(';'),r.notes].map(csvCell).join(','))].join('\r\n');
}
