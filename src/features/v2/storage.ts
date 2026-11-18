import { useEffect, useState } from 'react';

const CHANNEL='tail:v2-local-data';
const DB='tail-workspace-v2';
const memory=new Map<string,unknown>();
let generation=0;
let opening:Promise<IDBDatabase>|undefined;
function database(){
 if(!opening)opening=new Promise<IDBDatabase>((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB unavailable'));return;}
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{request.result.createObjectStore('collections');};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error??new Error('Local database unavailable'));
 });
 return opening;
}
async function dbRead(key:string){
 const db=await database();return new Promise<unknown>((resolve,reject)=>{
  const r=db.transaction('collections').objectStore('collections').get(key);
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });
}
async function dbWrite(key:string,value:unknown){
 const db=await database();return new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('collections','readwrite');tx.objectStore('collections').put(value,key);
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
export function readBrowserData<T>(key:string,parse:(v:unknown)=>T,fallback:T):T{
 try{const raw=localStorage.getItem('tail.v2.'+key);if(raw!==null)return parse(JSON.parse(raw));}catch{/* private storage can be unavailable */}
 return memory.has(key)?parse(memory.get(key)):fallback;
}
/** Browser-origin data is not an authenticated account or evidence of wallet ownership. */
export async function persistBrowserData<T>(key:string,value:T){
 const started=generation;
 let saved=false;try{localStorage.setItem('tail.v2.'+key,JSON.stringify(value));saved=true;}catch{}
 memory.set(key,value);try{await dbWrite(key,value);saved=true;}catch{}
 if(typeof window!=='undefined'&&started===generation&&memory.get(key)===value)window.dispatchEvent(new CustomEvent(CHANNEL,{detail:{key,value}}));
 return saved;
}
/** Deletes anonymous records on this origin; preferences and the approved desk
 * layout are retained. An extension and a website are separate browser origins. */
export async function clearBrowserModuleData(){
 generation++;memory.clear();let local=false,idb=false;
 try{
  const explicit=new Set(['part.astra.threads.v1','part.astra.session','part.wallets.v1','part.wallet.selected','part.tokenDraft.v1','part.marketWatch.v1','tail.selectedWallet.v1','tail.browser-data.v1','tail.fable.history.v1','tail.search.v1']);
  for(const key of Object.keys(localStorage))if(explicit.has(key)||key.startsWith('tail.v2.')||key.startsWith('tail:v2:'))localStorage.removeItem(key);
  local=true;
 }catch{}
 try{const db=await database();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('collections','readwrite');tx.objectStore('collections').clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});idb=true;}catch{}
 if(typeof window!=='undefined'){window.dispatchEvent(new CustomEvent(CHANNEL,{detail:{clear:true}}));window.dispatchEvent(new Event('part:clear-data'));}
 return{local,idb};
}
export function useBrowserData<T>(key:string,parse:(v:unknown)=>T,fallback:T){
 const [value,setValue]=useState<T>(()=>readBrowserData(key,parse,fallback)),[storageError,setError]=useState('');
 useEffect(()=>{
  let active=true;
  // LocalStorage is the synchronous mirror; IDB restores larger collections when
  // that mirror is unavailable. A late restore never replaces a new user write.
  let changed=false;
  const sync=(event:Event)=>{
   if(event instanceof StorageEvent){if(event.key!=='tail.v2.'+key)return;changed=true;if(event.newValue===null){memory.delete(key);setValue(fallback);}else setValue(readBrowserData(key,parse,fallback));}
   else{const d=(event as CustomEvent).detail;if(d?.clear){changed=true;setValue(fallback);return;}if(d?.key!==key)return;changed=true;setValue(parse(d.value));}
  };
  window.addEventListener(CHANNEL,sync);window.addEventListener('storage',sync);
  void dbRead(key).then(raw=>{let mirrored=false;try{mirrored=localStorage.getItem('tail.v2.'+key)!==null;}catch{}if(active&&!changed&&raw!==undefined&&!mirrored)setValue(parse(raw));}).catch(()=>{});
  return()=>{active=false;window.removeEventListener(CHANNEL,sync);window.removeEventListener('storage',sync);};
 },[key,parse]);
 const update=async(next:T)=>{const valid=parse(next);setValue(valid);const saved=await persistBrowserData(key,valid);setError(saved?'':'Local storage unavailable. Changes remain in this session.');return saved;};
 return{value,update,storageError};
}
export function csvCell(value:unknown){
 let s=value==null?'':String(value);
 if(typeof value==='string'&&/^[\s]*[=+@-]/.test(s))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
}
export function downloadFile(name:string,text:string,type='application/json'){
 const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
