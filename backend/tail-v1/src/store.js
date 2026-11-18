import { randomBytes, createHash } from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {HttpError,assert,solAddress} from './core.js';
function tokenHash(v){return createHash('sha256').update(v).digest('hex')}
export class Store {
 constructor(dir='./data'){this.dir=dir;this.path=path.join(dir,'anonymous-sessions.json');this.state={sessions:{}};this.serial=Promise.resolve()}
 async init(){await mkdir(this.dir,{recursive:true,mode:0o700});try{const x=JSON.parse(await readFile(this.path,'utf8'));if(x&&x.sessions&&typeof x.sessions==='object')this.state=x}catch(e){if(e.code!=='ENOENT')throw e}}
 async save(){this.serial=this.serial.catch(()=>{}).then(async()=>{const tmp=this.path+'.tmp';await writeFile(tmp,JSON.stringify(this.state),{mode:0o600});await rename(tmp,this.path)});return this.serial}
 async session(){assert(Object.keys(this.state.sessions).length<5000,429,'SESSION_CAP','Session capacity reached');const token=randomBytes(32).toString('base64url');this.state.sessions[tokenHash(token)]={watchlist:[],alerts:[],events:[],createdAt:Date.now()};await this.save();return token}
 get(token){assert(typeof token==='string'&&token.length>=25&&token.length<=128,401,'SESSION_REQUIRED','Use bearer token from POST /api/session');const s=this.state.sessions[tokenHash(token)];if(!s)throw new HttpError(401,'INVALID_SESSION','Unknown session');return s}
 async watch(token,mint,enabled){const s=this.get(token);mint=solAddress(mint);if(enabled){assert(s.watchlist.length<100||s.watchlist.includes(mint),422,'WATCHLIST_FULL','Maximum 100 watched tokens');if(!s.watchlist.includes(mint))s.watchlist.push(mint)}else s.watchlist=s.watchlist.filter(x=>x!==mint);await this.save();return s.watchlist}
 async alert(token,{mint,direction,priceUsd}){const s=this.get(token);mint=solAddress(mint);assert(['above','below'].includes(direction),400,'BAD_DIRECTION','Expected above or below');const n=Number(priceUsd);
  assert(Number.isFinite(n)&&n>0&&n<1e12,400,'BAD_PRICE','Invalid alert price');assert(s.alerts.length<30,422,'ALERT_LIMIT','Maximum 30 alerts');
  const v={id:randomBytes(8).toString('hex'),mint,direction,priceUsd:n,lastSide:null,triggered:false,createdAt:Date.now()};s.alerts.push(v);await this.save();return v}
 async deleteAlert(token,id){const s=this.get(token);const before=s.alerts.length;s.alerts=s.alerts.filter(a=>a.id!==id);if(before===s.alerts.length)throw new HttpError(404,'ALERT_NOT_FOUND','Alert does not exist');await this.save()}
 async onPrice(mint,price){const n=Number(price);if(!Number.isFinite(n)||n<=0)return;let changed=false;
  for(const s of Object.values(this.state.sessions))for(const a of s.alerts){if(a.mint!==mint||a.triggered)continue;
    const hit=a.direction==='above'?n>=a.priceUsd:n<=a.priceUsd;
    if(hit){a.triggered=true;s.events.unshift({id:randomBytes(8).toString('hex'),alertId:a.id,mint,priceUsd:n,direction:a.direction,createdAt:Date.now()});s.events=s.events.slice(0,100);changed=true}
  }if(changed)await this.save();
 }
}
