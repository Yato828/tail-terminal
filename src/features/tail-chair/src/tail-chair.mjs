/** TAIL chair interaction 1.0.0. Continuous original-art 2D animation. No GIF player. */
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const smootherstep=x=>{const t=clamp(x);return t*t*t*(t*(t*6-15)+10);};
/** Analytic critically damped spring. A new target preserves current velocity. */
export function springStep(s,target,dt,omega=15){
  if(!Number.isFinite(dt)||dt<=0)return s;
  const offset=s.x-target,c=s.v+omega*offset,e=Math.exp(-omega*dt);
  s.x=target+(offset+c*dt)*e;s.v=(s.v-omega*c*dt)*e;return s;
}
const FIELDS=['headX','headY','headAngle','gazeX','gazeY','armX','armY','armAngle','raise','delight','accent'];
export class TailChairMotion{
  constructor({reducedMotion=false,seed=42}={}){
    this.time=0;this.reducedMotion=reducedMotion;this.seed=seed>>>0;
    this.pointer={x:0,y:0,near:false,inside:false};this.hadInside=false;this.hoverStarted=-1;this.hoverGreeted=false;
    this.lastWave=-100;this.waveStarted=-100;this.waveStrength=1;this.attentionUntil=0;this.nodStarted=-100;this.lastScroll=-100;this.clicks=[];
    this.focused=false;this.nextBlink=3.8;this.blinkStarted=-100;this.state='rest';
    this.springs=Object.fromEntries(FIELDS.map(k=>[k,{x:0,v:0}]));this.pose=Object.fromEntries(FIELDS.map(k=>[k,0]));this.pose.eyeOpen=1;
  }
  random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;}
  setPointer(x,y,{near=false,inside=false}={}){
    this.pointer={x:clamp(Number(x)||0,-1,1),y:clamp(Number(y)||0,-1,1),near,inside};
    if(inside&&!this.hadInside){this.hoverStarted=this.time;this.hoverGreeted=false;}
    if(!inside){this.hoverStarted=-1;this.hoverGreeted=false;}
    if(near)this.attentionUntil=Math.max(this.attentionUntil,this.time+1);
    this.hadInside=inside;
  }
  look(){this.attentionUntil=Math.max(this.attentionUntil,this.time+2.8);}
  focus(value=true){this.focused=value;if(value)this.look();}
  scroll(){if(this.time-this.lastScroll<1.6)return false;this.lastScroll=this.time;this.nodStarted=this.time;this.attentionUntil=this.time+2.2;return true;}
  wave(strength=1,{force=false}={}){
    if(!force&&this.time-this.lastWave<7.5)return false;
    this.waveStarted=this.time;this.lastWave=this.time;this.waveStrength=clamp(strength,1,1.35);this.attentionUntil=Math.max(this.attentionUntil,this.time+3.6);return true;
  }
  click(){
    this.clicks=this.clicks.filter(t=>this.time-t<1.1);this.clicks.push(this.time);
    if(this.clicks.length>=3){this.clicks=[];this.wave(1.35,{force:true});return 'delighted';}
    if(this.time-this.waveStarted>2.7)this.wave(1,{force:true});this.look();return 'wave';
  }
  react(action){
    if(action==='wave')return this.wave(1,{force:true});
    if(action==='delight'||action==='success')return this.wave(1.35,{force:true});
    if(action==='look'){this.look();return true;}
    if(action==='scroll')return this.scroll();
    if(action==='rest'){this.pointer.near=false;this.pointer.inside=false;this.focused=false;this.attentionUntil=0;this.waveStarted=-100;return true;}return false;
  }
  setReducedMotion(value){this.reducedMotion=!!value;if(value){this.waveStarted=-100;this.blinkStarted=-100;}}
  step(dt){
    dt=clamp(Number(dt)||0,0,.05);this.time+=dt;const t=this.time;
    if(this.pointer.inside&&!this.hoverGreeted&&this.hoverStarted>=0&&t-this.hoverStarted>.28){this.hoverGreeted=true;this.wave();}
    const wt=t-this.waveStarted,waving=wt>=0&&wt<2.65;
    const attention=this.pointer.near||this.focused||t<this.attentionUntil||waving;
    let lift=0,wiggle=0;
    if(waving){lift=wt<.62?smootherstep(wt/.62):wt<1.84?1:1-smootherstep((wt-1.84)/.81);const phase=clamp((wt-.62)/1.22);wiggle=Math.sin(phase*Math.PI*4)*Math.sin(phase*Math.PI);}
    const delighted=waving&&this.waveStrength>1.1;
    this.state=this.reducedMotion?'reduced':waving?(delighted?'delighted':'waving'):attention?'attentive':'working';
    const target=Object.fromEntries(FIELDS.map(k=>[k,0]));
    if(!this.reducedMotion){
      const p=this.pointer,initial=t<.9,nt=t-this.nodStarted,nod=nt>=0&&nt<1.1?Math.sin(nt/1.1*Math.PI*2)*Math.sin(nt/1.1*Math.PI):0;
      target.headX=p.near?p.x*2.5:0;target.headY=(attention?-7:0)+Math.sin(t*1.3)*.85+nod*1.1;
      target.headAngle=(p.near?p.x*2.5:attention?-1.6:1)+Math.sin(t*.8)*.25;
      target.gazeX=p.near?p.x*5:attention||initial?0:-2.5;target.gazeY=p.near?p.y*3.8:attention?-1:initial?0:4;
      target.raise=lift;target.armX=-38*lift;target.armY=-131*lift;target.armAngle=(-55+wiggle*12*this.waveStrength)*lift;
      const typing=!attention&&(t%7.8)<2.1&&t>1.4;if(typing){target.armY+=Math.sin(t*9)*.6;target.armAngle+=Math.sin(t*8)*.45;}
      target.delight=delighted?lift:0;target.accent=waving?lift:0;
      if(t>=this.nextBlink&&!waving){this.blinkStarted=t;this.nextBlink=t+3.8+this.random()*2.6;}
      const bt=(t-this.blinkStarted)/.19;this.pose.eyeOpen=bt>=0&&bt<=1?Math.max(.065,1-Math.pow(Math.sin(bt*Math.PI),2)*.935):1;
    }else this.pose.eyeOpen=1;
    for(const k of FIELDS){springStep(this.springs[k],target[k],dt,k.startsWith('gaze')?19:k.startsWith('arm')||k==='raise'?20:13);this.pose[k]=this.springs[k].x;}
    return this.pose;
  }
  snapshot(){return {time:this.time,state:this.state,reducedMotion:this.reducedMotion,pose:{...this.pose},waveStarted:this.waveStarted};}
}
function loadImage(src,signal){return new Promise((resolve,reject)=>{
  const i=new Image(),cleanup=()=>{i.onload=null;i.onerror=null;signal.removeEventListener('abort',abort);};
  const abort=()=>{cleanup();i.removeAttribute('src');reject(new DOMException('TAIL artwork loading cancelled','AbortError'));};
  if(signal.aborted){abort();return;}
  i.onload=()=>{cleanup();resolve(i);};i.onerror=()=>{cleanup();reject(new Error('Cannot load TAIL layer: '+src.slice(0,120)));};
  signal.addEventListener('abort',abort,{once:true});i.src=src;
});}
export class TailChair{
  constructor(canvas,options={}){
    if(!canvas||typeof canvas.getContext!=='function')throw new TypeError('TailChair expects a canvas');
    this.canvas=canvas;this.options=options;this.ctx=canvas.getContext('2d',{alpha:true});if(!this.ctx)throw new Error('Canvas 2D unavailable');
    this.disposed=false;this.loaded=false;this.enabled=true;this.inView=true;this.cleanup=[];this.raf=0;this.lastTime=0;this.paused=!!options.paused;this.abort=new AbortController();this.pointerPosition=null;
    this.assetBaseUrl=options.assetBaseUrl||'/tail-chair/assets/';this.mq=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
    this.motion=new TailChairMotion({reducedMotion:options.reducedMotion==='auto'||options.reducedMotion==null?!!this.mq?.matches:!!options.reducedMotion});
    this._previousState='';this._stats={frames:0,maxFrameMs:0};
    this.originalAttributes=Object.fromEntries(['tabindex','role','aria-label'].map(k=>[k,canvas.getAttribute(k)]));
    if(options.interactive!==false){canvas.tabIndex=0;canvas.setAttribute('role','button');canvas.setAttribute('aria-label',options.label||'Say hello to TAIL');}
    this.ready=this._load(options.assets).then(()=>{if(this.disposed){this.images={};return this;}this.loaded=true;this.resize();this._bind();this.render();this._schedule();return this;}).catch(error=>{this.dispose();throw error;});
  }
  async _load(bundle){
    this.images={};
    const signal=this.abort.signal,load=async(k,src)=>{const image=await loadImage(src,signal);if(!this.disposed)this.images[k]=image;};
    if(bundle){this.manifest=bundle.manifest;await Promise.all(Object.entries(bundle.images).map(([k,src])=>load(k,src)));}
    else{const base=this.assetBaseUrl.endsWith('/')?this.assetBaseUrl:this.assetBaseUrl+'/';const r=await fetch(base+'manifest.json',{signal});if(!r.ok)throw new Error('TAIL manifest HTTP '+r.status);this.manifest=await r.json();signal.throwIfAborted();await Promise.all(Object.entries(this.manifest.layers).map(([k,a])=>load(k,base+a.file)));}
    if(this.manifest.version!=='1.0.0')throw new Error('Unsupported TAIL artwork version');
  }
  _on(target,type,fn,opts){if(!target)return;target.addEventListener(type,fn,opts);this.cleanup.push(()=>target.removeEventListener(type,fn,opts));}
  _bind(){
    const c=this.canvas;
    if(this.options.interactive!==false){
      this._on(this.options.pointerRoot||window,'pointermove',e=>{if(e.pointerType!=='touch'){this.pointerPosition={x:e.clientX,y:e.clientY};if(this.inView&&this.enabled)this._pointer(e.clientX,e.clientY);}},{passive:true});
      this._on(document,'pointerout',e=>{if(!e.relatedTarget){this.pointerPosition=null;this.motion.setPointer(0,0);}},{passive:true});
      this._on(c,'click',()=>{this.motion.click();this._schedule();});
      this._on(c,'focus',()=>{this.motion.focus(c.matches(':focus-visible'));this._schedule();});this._on(c,'blur',()=>this.motion.focus(false));
      this._on(c,'keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.motion.click();this._schedule();}});
      this._on(window,'scroll',()=>{if(this.inView&&this.enabled){this._refreshPointer();this.motion.scroll();this._schedule();}},{passive:true});
    }
    this._on(document,'visibilitychange',()=>{this.lastTime=0;this._refreshPointer();if(document.hidden)this._stop();else this._schedule();});
    this._on(window,'resize',()=>this.resize(),{passive:true});
    if(typeof ResizeObserver!=='undefined'){const ro=new ResizeObserver(()=>this.resize());ro.observe(c);this.cleanup.push(()=>ro.disconnect());}
    if(typeof IntersectionObserver!=='undefined'){const io=new IntersectionObserver(e=>{this.inView=e[0].isIntersecting;this.lastTime=0;this._refreshPointer();if(this.inView)this._schedule();else this._stop();},{threshold:.04});io.observe(c);this.cleanup.push(()=>io.disconnect());}
    if(this.mq&&(this.options.reducedMotion==='auto'||this.options.reducedMotion==null))this._on(this.mq,'change',e=>this.setReducedMotion(e.matches));
  }
  _pointer(x,y){
    this.pointerPosition={x,y};const r=this.canvas.getBoundingClientRect();if(r.width<1||r.height<1){this.motion.setPointer(0,0);return;}
    const left=r.left+r.width*.13,right=r.left+r.width*.9,top=r.top+r.height*.095,bottom=r.top+r.height*.87;
    const dx=Math.max(left-x,0,x-right),dy=Math.max(top-y,0,y-bottom),near=Math.hypot(dx,dy)<(this.options.proximityPx??190),inside=x>=left&&x<=right&&y>=top&&y<=bottom;
    this.motion.setPointer((x-r.left-r.width*.61)/(r.width*.48),(y-r.top-r.height*.37)/(r.height*.40),{near,inside});this._schedule();
  }
  _refreshPointer(){if(this.pointerPosition&&this.enabled&&this.inView&&!document.hidden)this._pointer(this.pointerPosition.x,this.pointerPosition.y);else this.motion.setPointer(0,0);}
  resize(){if(!this.loaded||this.disposed)return;const r=this.canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,this.options.maxDpr||2),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.render();}this._refreshPointer();}
  _schedule(){if(!this.raf&&this.loaded&&!this.disposed&&this.enabled&&!this.paused&&this.inView&&!document.hidden)this.raf=requestAnimationFrame(t=>this._tick(t));}
  _stop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;this.lastTime=0;}
  _tick(now){this.raf=0;if(this.disposed||!this.enabled||this.paused||!this.inView||document.hidden){this.lastTime=0;return;}const dt=this.lastTime?(now-this.lastTime)/1000:0;this.lastTime=now;this._stats.maxFrameMs=Math.max(this._stats.maxFrameMs,dt*1000);this.motion.step(dt);this.render();this._stats.frames++;if(this.motion.state!==this._previousState){this._previousState=this.motion.state;this.options.onStateChange?.(this.motion.state);}if(!this.motion.reducedMotion)this._schedule();}
  _layer(n){const a=this.manifest.layers[n];this.ctx.drawImage(this.images[n],a.x,a.y,a.width,a.height);}
  render(){
    if(!this.loaded||this.disposed)return;const c=this.ctx,m=this.manifest,p=this.motion.pose,w=this.canvas.width,h=this.canvas.height;
    c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,w,h);const s=Math.min(w/900,h/780);c.translate((w-900*s)/2,(h-780*s)/2);c.scale(s,s);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.translate(m.sourceOffset.x,m.sourceOffset.y);
    c.save();c.globalAlpha=.17;c.fillStyle='#000';c.beginPath();c.ellipse(430,626,333,16,0,0,Math.PI*2);c.fill();c.restore();this._layer('base');
    if(p.raise>.006){
      const wx=282+p.armX,wy=415+p.armY;
      c.save();c.globalAlpha=clamp(p.raise/.12);c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(366,347);c.bezierCurveTo(329,368,wx+17,wy+38,wx+2,wy);c.strokeStyle='#141212';c.lineWidth=53;c.stroke();c.strokeStyle='#242120';c.lineWidth=45;c.stroke();c.restore();
    }
    const hp=m.headPivot;c.save();c.translate(hp[0]+p.headX,hp[1]+p.headY);c.rotate(p.headAngle*Math.PI/180);c.translate(-hp[0],-hp[1]);this._layer('head');
    for(const eye of m.eyes){c.save();c.translate(eye.center[0]+p.gazeX,eye.center[1]+p.gazeY);c.scale(1,Math.max(.065,p.eyeOpen));c.translate(-eye.center[0],-eye.center[1]);this._layer(eye.name);c.restore();}c.restore();
    const pivot=m.handPivot;c.save();c.translate(282+p.armX,415+p.armY);c.rotate(p.armAngle*Math.PI/180);c.scale(-1,1);c.translate(-pivot[0],-pivot[1]);this._layer('hand');c.restore();this._layer('laptop');
    if(p.accent>.04){c.save();c.globalAlpha=clamp(p.accent*.78);c.strokeStyle='#ff872f';c.lineWidth=4.5;c.lineCap='round';for(let i=0;i<3;i++){const a=(-80+i*36)*Math.PI/180;c.beginPath();c.moveTo(219+Math.cos(a)*19,202+Math.sin(a)*19);c.lineTo(219+Math.cos(a)*31,202+Math.sin(a)*31);c.stroke();}if(p.delight>.05){c.globalAlpha=clamp(p.delight*.85);this._star(281,169,8);this._star(709,168,10);}c.restore();}
  }
  _star(x,y,r){const c=this.ctx;c.fillStyle='#ff872f';c.beginPath();c.moveTo(x,y-r);c.quadraticCurveTo(x+2,y-2,x+r,y);c.quadraticCurveTo(x+2,y+2,x,y+r);c.quadraticCurveTo(x-2,y+2,x-r,y);c.quadraticCurveTo(x-2,y-2,x,y-r);c.fill();}
  react(action){const ok=this.motion.react(action);this._schedule();if(this.motion.reducedMotion)this.render();return ok;}
  setReducedMotion(value){this.motion.setReducedMotion(value);this.lastTime=0;this.motion.step(0);if(value){for(const s of Object.values(this.motion.springs)){s.x=0;s.v=0;}for(const k of FIELDS)this.motion.pose[k]=0;this._stop();}this.render();this._schedule();}
  setEnabled(value){this.enabled=!!value;this.lastTime=0;if(value)this._schedule();else this._stop();}
  setPaused(value){this.paused=!!value;this.lastTime=0;if(value)this._stop();else this._schedule();}
  advanceForTest(dt){this.motion.step(dt);this.render();return this.getSnapshot();}
  getSnapshot(){return {...this.motion.snapshot(),loaded:this.loaded,disposed:this.disposed,inView:this.inView,enabled:this.enabled,canvas:[this.canvas.width,this.canvas.height],stats:{...this._stats}};}
  dispose(){if(this.disposed)return;this.disposed=true;this._stop();this.abort.abort();for(const fn of this.cleanup.splice(0))fn();for(const [k,v] of Object.entries(this.originalAttributes))if(v===null)this.canvas.removeAttribute(k);else this.canvas.setAttribute(k,v);this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.images={};}
}
