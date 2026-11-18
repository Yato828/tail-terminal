import {now,HttpError} from './core.js';
export class Streams {
 constructor({market,store,periodMs=10000,maxTokens=12}={}){this.market=market;this.store=store;this.periodMs=periodMs;this.maxTokens=maxTokens;this.channels=new Map()}
 async subscribe(mint,res){let ch=this.channels.get(mint);if(!ch){if(this.channels.size>=this.maxTokens)throw new HttpError(429,'STREAM_CAP','Too many distinct streamed tokens');ch={subs:new Set(),last:null,timer:null,running:false};this.channels.set(mint,ch)}
  if(ch.subs.size>=30)throw new HttpError(429,'STREAM_CLIENT_CAP','Too many stream listeners');
  res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache, no-transform',connection:'keep-alive','x-accel-buffering':'no'});
  ch.subs.add(res);res.write('retry: 5000\n\n');if(ch.last)this.send(res,'snapshot',ch.last);
  const remove=()=>{ch.subs.delete(res);if(!ch.subs.size){clearInterval(ch.timer);this.channels.delete(mint)}};
  res.once('close',remove);if(!ch.timer&&!ch.starting){ch.starting=true;await this.tick(mint,ch);ch.starting=false;if(ch.subs.size&&this.channels.get(mint)===ch){ch.timer=setInterval(()=>{void this.tick(mint,ch)},this.periodMs);ch.timer.unref?.()}}
 }
 send(res,event,data){if(!res.destroyed){res.write('event: '+event+'\n');res.write('data: '+JSON.stringify(data)+'\n\n')}}
 async tick(mint,ch){if(ch.running||!this.channels.has(mint))return;ch.running=true;
  try{const r=await this.market.token(mint);if(!this.channels.has(mint))return;const data={token:r.token,source:r.source,asOf:r.asOf,delivery:'polling',pollIntervalMs:this.periodMs};ch.last=data;
    for(const x of ch.subs)this.send(x,'snapshot',data);if(r.token?.priceUsd)await this.store.onPrice(mint,r.token.priceUsd)
  }catch(e){for(const x of ch.subs)this.send(x,'error',{code:e.code||'FEED_UNAVAILABLE',asOf:now()})}finally{ch.running=false}
 }
 close(){for(const ch of this.channels.values()){clearInterval(ch.timer);for(const res of ch.subs)res.end()}this.channels.clear()}
}
