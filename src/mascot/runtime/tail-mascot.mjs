import {Director,CLIPS,TapSequence,clamp} from './motion-core.mjs';
import {TailRenderer,loadRig} from './renderer.mjs';
/** Use createTailMascot(host, { assetBase: '/tail-mascot/' }). Asset URLs are configurable. */
export async function createTailMascot(host, options={}){
 if(!(host instanceof HTMLElement))throw new TypeError('TAIL needs an HTMLElement mount point.');
 const actor=new TailMascot(host,options);
 try{await actor.init();return actor;}catch(e){actor.destroy();throw e;}
}
export class TailMascot {
 constructor(host,options={}){
  this.host=host;this.options={interactive:true,autoIdle:true,autoSleepMs:90000,...options};
  this.base=new URL(options.assetBase||'../',globalThis.__TAIL_EMBEDDED_BASE__||import.meta.url);this.director=new Director();this.taps=new TapSequence();
  this.progress=null;this.subscribers=new Set();this.dead=false;this.hidden=false;this.inView=true;this.last=0;this.raf=0;this.frameCount=0;this.listeners=[];this.pointer={x:0,y:0};this.pointerSmooth={x:0,y:0};this.lastActivity=performance.now();this.abort=new AbortController();
  this.canvas=document.createElement('canvas');this.canvas.className='tail-mascot-canvas';this.canvas.style.cssText='display:block;width:100%;height:100%;object-fit:contain;touch-action:manipulation';
  this.canvas.setAttribute('aria-label',options.label||'TAIL assistant. Click to interact.');
  if(this.options.interactive){this.canvas.tabIndex=0;this.canvas.setAttribute('role','button');this.canvas.style.cursor='pointer';}
  else{this.canvas.setAttribute('role','img');}
  host.append(this.canvas);if(options.signal){this.listen(options.signal,'abort',()=>this.destroy(),{once:true});if(options.signal.aborted)this.destroy();}this.media=matchMedia('(prefers-reduced-motion: reduce)');this.reduced=options.reducedMotion??this.media.matches;
 }
 listen(target,event,fn,opts){target.addEventListener(event,fn,opts);this.listeners.push(()=>target.removeEventListener(event,fn,opts));}
 async init(){
  if(this.dead)throw new DOMException('Aborted','AbortError');
  const images=await loadRig(this.base,this.abort.signal);
  if(this.dead){for(const im of Object.values(images))im.close?.();return;}
  try{this.renderer=new TailRenderer(this.canvas,images);}catch(error){for(const image of Object.values(images))image.close?.();throw error;}
  const resize=()=>{const r=this.host.getBoundingClientRect();this.renderer.resize(Math.max(1,r.width||220),Math.max(1,r.height||r.width||220));this.draw();};
  this.resizeObserver=new ResizeObserver(resize);this.resizeObserver.observe(this.host);resize();
  this.observe=new IntersectionObserver(entries=>{this.inView=entries[0]?.isIntersecting??true;this.resume();});this.observe.observe(this.host);
  this.listen(document,'visibilitychange',()=>{this.hidden=document.hidden;this.resume();});
  this.listen(this.media,'change',e=>{if(this.options.reducedMotion===undefined){this.reduced=e.matches;this.resume();}});
  const activity=()=>{this.lastActivity=performance.now();if(this.director.state==='sleep')this.setState('wake',{force:true});};
  this.listen(document,'pointerdown',activity,{passive:true});this.listen(document,'keydown',activity);
  this.listen(this.canvas,'pointermove',e=>{const r=this.canvas.getBoundingClientRect();this.pointer.x=clamp(((e.clientX-r.left)/r.width-.5)*6,-3,3);this.pointer.y=clamp(((e.clientY-r.top)/r.height-.5)*4,-2,2);});
  this.listen(this.canvas,'pointerleave',()=>{this.pointer={x:0,y:0};});
  if(this.options.interactive){
   const hit=()=>{activity();const next=this.taps.hit(performance.now(),CLIPS[this.director.state].priority>=30);if(next){this.setState(next,{force:true});this.options.onInteraction?.(next);}};
   this.listen(this.canvas,'click',hit);this.listen(this.canvas,'keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();hit();}});
  }
  this.hidden=document.hidden;this.resume();return this;
 }
 setState(state,options={}){
  if(this.dead)return false;const changed=this.director.setState(state,options);if(changed){this.notify(state);this.resume();}return changed;
 }
 subscribe(listener){this.subscribers.add(listener);return ()=>this.subscribers.delete(listener);}
 notify(state){this.options.onStateChange?.(state);for(const listener of this.subscribers)listener(state);}
 setProgress(value){if(value!==null&&(!Number.isFinite(value)||value<0||value>1))throw new RangeError('Progress must be null or between 0 and 1.');this.progress=value;this.draw();}
 setReducedMotion(value){this.options.reducedMotion=value;this.reduced=value??this.media.matches;this.resume();}
 resume(){if(this.dead)return;cancelAnimationFrame(this.raf);this.raf=0;this.last=0;if(this.hidden||!this.inView)return;
  if(this.reduced){this.director.update(0,{reducedMotion:true});this.draw();return;}
  this.raf=requestAnimationFrame(t=>this.frame(t));
 }
 frame(now){
  if(this.dead||this.hidden||!this.inView)return;const dt=this.last?Math.min((now-this.last)/1000,.066):1/60;this.last=now;
  const before=this.director.state;this.director.update(dt,{autoIdle:this.options.autoIdle});
  if(before!==this.director.state)this.notify(this.director.state);
  if(this.options.autoSleepMs&&now-this.lastActivity>this.options.autoSleepMs&&this.director.state==='idle'){this.director.setState('sleep',{force:true});this.notify('sleep');}
  this.pointerSmooth.x+=(this.pointer.x-this.pointerSmooth.x)*(1-Math.exp(-dt*9));this.pointerSmooth.y+=(this.pointer.y-this.pointerSmooth.y)*(1-Math.exp(-dt*9));
  this.draw();this.frameCount++;this.raf=requestAnimationFrame(t=>this.frame(t));
 }
 draw(){if(!this.renderer||this.dead)return;const p={...this.director.rig.pose};if(this.director.state==='idle'){p.gazeX+=this.pointerSmooth.x;p.gazeY+=this.pointerSmooth.y;}this.renderer.render(p,this.director.clock,{reducedMotion:this.reduced,progress:this.progress,presentation:this.options.presentation});}
 /** Deterministic preview/testing. Call on a paused/export-only actor, never in the app loop. */
 sample(state,seconds){this.director=new Director();this.director.setState(state,{force:true});for(let t=0;t<seconds;t+=1/120)this.director.update(1/120);this.draw();}
 pause(){cancelAnimationFrame(this.raf);this.raf=0;this.last=0;}
 get state(){return this.director.state;}
 destroy(){if(this.dead)return;this.dead=true;this.abort.abort();this.pause();this.resizeObserver?.disconnect();this.observe?.disconnect();this.listeners.splice(0).forEach(fn=>fn());this.renderer?.destroy();this.subscribers.clear();this.canvas.remove();}
}
export class TailEventBridge {
 constructor(actor,{eventTarget=null,onDiagnostic=()=>{}}={}){this.actor=actor;this.tasks=new Map();this.onDiagnostic=onDiagnostic;this.cleanups=[];this.unsubscribe=actor.subscribe?.(state=>{if(state==='idle'&&this.tasks.size)this.sync();});if(eventTarget)this.attach(eventTarget);}
 begin(id,state){if(!id||!CLIPS[state])throw new TypeError('Task requires a unique id and a known state.');if(state==='loading')this.actor.setProgress(null);this.tasks.set(id,{state,priority:CLIPS[state].priority,order:performance.now()});this.sync();}
 stage(id,state){if(!this.tasks.has(id)){this.onDiagnostic('Ignored stale task stage: '+id);return false;}this.begin(id,state);return true;}
 end(id,outcome='success'){
  if(!this.tasks.delete(id)){this.onDiagnostic('Ignored duplicate/stale task completion: '+id);return false;}
  if(this.tasks.size)this.sync();else this.actor.setState(outcome==='cancel'?'idle':outcome,{force:true});return true;
 }
 sync(){const top=[...this.tasks.entries()].sort((a,b)=>b[1].priority-a[1].priority||b[1].order-a[1].order)[0];if(top&&!(this.actor.director?.requestId===top[0]&&this.actor.state===top[1].state))this.actor.setState(top[1].state,{force:true,requestId:top[0]});}
 async run(id,state,work){this.begin(id,state);try{const result=await work();this.end(id,'success');return result;}catch(e){this.end(id,e?.name==='AbortError'?'cancel':'error');throw e;}}
 attach(target){
  const rules={
   'terminal:loading':d=>this.begin(d.requestId||'terminal:boot','loading'),
   'terminal:ready':d=>this.end(d.requestId||'terminal:boot','welcome'),
   'terminal:failed':d=>this.end(d.requestId||'terminal:boot','error'),
   'token:search:start':d=>this.begin(d.requestId,'searching'),
   'token:search:done':d=>this.end(d.requestId,'idle'),
   'token:search:error':d=>this.end(d.requestId,'error'),
   'fable:request:start':d=>this.begin(d.requestId,'thinking'),
   'fable:tool:start':d=>this.stage(d.requestId,'analyzing'),
   'fable:response:done':d=>this.end(d.requestId,'success'),
   'fable:request:error':d=>this.end(d.requestId,'error'),
   'task:cancel':d=>this.end(d.requestId,'cancel'),
   'ui:warning':()=>this.actor.setState('warning',{force:true}),
   'settings:saved':()=>this.actor.setState('success'),
   'transaction:confirmed':()=>this.actor.setState('success'),
   'terminal:progress':d=>this.actor.setProgress(d.value??null)
  };
  for(const [name,run] of Object.entries(rules)){const fn=e=>{try{run(e.detail||{});}catch(err){this.onDiagnostic(err.message);}};target.addEventListener(name,fn);this.cleanups.push(()=>target.removeEventListener(name,fn));}
 }
 destroy(){this.unsubscribe?.();this.cleanups.splice(0).forEach(fn=>fn());this.tasks.clear();}
}
