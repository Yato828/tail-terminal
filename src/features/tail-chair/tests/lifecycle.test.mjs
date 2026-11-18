import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TailChair} from '../src/tail-chair.mjs';

// Node boundary fixtures: these exercise lifecycle/event wiring, not browser
// image decoding, visual quality, native input or React's actual StrictMode.
const manifest=JSON.parse(await readFile(new URL('../../../../public/tail-chair/assets/manifest.json',import.meta.url),'utf8'));
const bundle={manifest,images:Object.fromEntries(Object.keys(manifest.layers).map(name=>[name,`fixture:${name}.png`]))};
class Target extends EventTarget{
  listeners=new Map();
  addEventListener(type,fn,options){super.addEventListener(type,fn,options);const set=this.listeners.get(type)??new Set();set.add(fn);this.listeners.set(type,set);}
  removeEventListener(type,fn,options){super.removeEventListener(type,fn,options);this.listeners.get(type)?.delete(fn);}
  count(type){return this.listeners.get(type)?.size??0;}
  get listenerCount(){return [...this.listeners.values()].reduce((sum,set)=>sum+set.size,0);}
}
function event(type,properties={}){return Object.assign(new Event(type),properties);}
function harness(t,{autoImages=true,reduced=false,fetchImpl}={}){
  const originals=new Map(),actors=[],images=[],resizers=[],intersections=[],frames=new Map();let nextFrame=0,fetches=0;
  const ctx=new Proxy({clears:0,clearRect(){this.clears++;}},{get:(target,key)=>target[key]??(()=>{})});
  class Canvas extends Target{
    width=900;height=780;attributes=new Map([['tabindex','3'],['role','img'],['aria-label','Original label']]);
    rect={left:0,top:0,width:900,height:780};
    getContext(){return ctx;}
    getAttribute(key){return this.attributes.get(key)??null;}
    setAttribute(key,value){this.attributes.set(key,String(value));}
    removeAttribute(key){this.attributes.delete(key);}
    set tabIndex(value){this.setAttribute('tabindex',value);}
    getBoundingClientRect(){return this.rect;}
    matches(){return false;}
  }
  const canvas=new Canvas(),win=Object.assign(new Target(),{devicePixelRatio:1}),doc=Object.assign(new Target(),{hidden:false}),mq=Object.assign(new Target(),{matches:reduced});
  class FakeImage{
    constructor(){images.push(this);}
    set src(value){this.source=value;if(autoImages)queueMicrotask(()=>this.onload?.());}
    removeAttribute(key){if(key==='src')this.cancelled=true;}
    succeed(){this.onload?.();}
    fail(){this.onerror?.();}
  }
  const observer=(list)=>class{
    constructor(callback){this.callback=callback;this.disconnected=false;list.push(this);}
    observe(){}
    disconnect(){this.disconnected=true;}
  };
  const values={window:win,document:doc,matchMedia:()=>mq,Image:FakeImage,
    ResizeObserver:observer(resizers),IntersectionObserver:observer(intersections),
    requestAnimationFrame:callback=>{frames.set(++nextFrame,callback);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id),
    fetch:(...args)=>{fetches++;if(!fetchImpl)throw new Error('Unexpected fixture network request');return fetchImpl(...args);}};
  for(const [key,value]of Object.entries(values)){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
  t.after(()=>{for(const actor of actors)actor.dispose();for(const [key,descriptor]of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  return {canvas,ctx,win,doc,mq,images,resizers,intersections,frames,get fetches(){return fetches;},
    create(options={}){const actor=new TailChair(canvas,{assets:bundle,...options});actors.push(actor);return actor;},
    frame(now){const next=frames.entries().next().value;if(!next)return false;frames.delete(next[0]);next[1](now);return true;},
    pointer(x=600,y=250){win.dispatchEvent(event('pointermove',{pointerType:'mouse',clientX:x,clientY:y}));}};
}

test('stationary cursor is rescanned after scroll, resize and viewport return',async t=>{
  const h=harness(t),actor=h.create();await actor.ready;h.pointer();assert.equal(actor.motion.pointer.inside,true);
  h.canvas.rect.top=-700;h.win.dispatchEvent(event('scroll'));
  assert.equal(actor.motion.pointer.inside,false);assert.equal(actor.motion.pointer.near,false);
  for(let i=0;i<240;i++)actor.advanceForTest(1/60);
  assert.equal(actor.motion.state,'working');assert.equal(actor.motion.waveStarted,-100);
  h.canvas.rect.top=0;h.resizers[0].callback();assert.equal(actor.motion.pointer.inside,true);
  h.intersections[0].callback([{isIntersecting:false}]);assert.equal(actor.motion.pointer.near,false);assert.equal(h.frames.size,0);
  h.canvas.rect.left=1500;h.intersections[0].callback([{isIntersecting:true}]);assert.equal(actor.motion.pointer.near,false);
  h.doc.dispatchEvent(event('pointerout',{relatedTarget:null}));h.canvas.rect.left=0;h.resizers[0].callback();
  assert.equal(actor.pointerPosition,null);assert.equal(actor.motion.pointer.near,false);
});

test('disposing a pending manifest aborts loading without binding or allocating images',async t=>{
  let signal;const h=harness(t,{fetchImpl:(_url,options)=>new Promise((_resolve,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});})});
  const actor=h.create({assets:undefined}),rejection=assert.rejects(actor.ready,{name:'AbortError'});
  actor.dispose();actor.dispose();await rejection;
  assert.equal(signal.aborted,true);assert.equal(h.fetches,1);assert.equal(h.images.length,0);assert.equal(h.frames.size,0);
  assert.equal(h.win.listenerCount+h.doc.listenerCount+h.canvas.listenerCount,0);
  assert.equal(h.canvas.getAttribute('tabindex'),'3');assert.equal(h.canvas.getAttribute('role'),'img');assert.equal(h.canvas.getAttribute('aria-label'),'Original label');
});

test('one failed layer cancels remaining image loads and disposes the actor',async t=>{
  const h=harness(t,{autoImages:false}),actor=h.create(),rejection=assert.rejects(actor.ready,/Cannot load TAIL layer/);
  assert.equal(h.images.length,6);h.images[0].fail();await rejection;
  assert.equal(actor.disposed,true);assert.deepEqual(actor.images,{});assert.equal(h.frames.size,0);
  for(const image of h.images.slice(1)){assert.equal(image.cancelled,true);assert.equal(image.onload,null);assert.equal(image.onerror,null);}
  assert.equal(h.win.listenerCount+h.doc.listenerCount+h.canvas.listenerCount,0);
});

test('setup-cleanup-setup on the same canvas leaves one live actor and no stale listeners',async t=>{
  const h=harness(t,{autoImages:false}),old=h.create(),oldImages=[...h.images],rejection=assert.rejects(old.ready,{name:'AbortError'});
  old.dispose();const current=h.create();for(const image of h.images.slice(oldImages.length))image.succeed();
  await Promise.all([rejection,current.ready]);
  assert.ok(oldImages.every(image=>image.cancelled));assert.equal(current.disposed,false);assert.equal(current.loaded,true);assert.equal(h.frames.size,1);
  assert.equal(h.win.count('pointermove'),1);assert.equal(h.win.count('scroll'),1);assert.equal(h.doc.count('visibilitychange'),1);assert.equal(h.canvas.count('click'),1);
  current.dispose();assert.equal(h.frames.size,0);assert.equal(h.win.listenerCount+h.doc.listenerCount+h.canvas.listenerCount,0);
  assert.ok([...h.resizers,...h.intersections].every(observer=>observer.disconnected));
});

test('reduced motion has no repeating frame loop and toggling it resets a moving pose',async t=>{
  const h=harness(t),actor=h.create({reducedMotion:true});await actor.ready;
  h.frame(1000);assert.equal(h.frames.size,0);h.pointer();h.canvas.dispatchEvent(event('click'));h.frame(2000);
  assert.equal(h.frames.size,0);assert.equal(actor.motion.pose.eyeOpen,1);
  for(const [key,value]of Object.entries(actor.motion.pose))if(key!=='eyeOpen')assert.equal(value,0);
  actor.setReducedMotion(false);h.frame(3000);h.frame(3050);assert.equal(h.frames.size,1);
  actor.setReducedMotion(true);h.frame(4000);assert.equal(h.frames.size,0);
  for(const [key,value]of Object.entries(actor.motion.pose))if(key!=='eyeOpen')assert.equal(value,0);
});

test('hidden and offscreen actors cancel frames and resume without accumulated time',async t=>{
  const h=harness(t),actor=h.create();await actor.ready;h.frame(1000);h.frame(1016);const time=actor.motion.time;
  h.doc.hidden=true;h.doc.dispatchEvent(event('visibilitychange'));assert.equal(h.frames.size,0);
  h.doc.hidden=false;h.doc.dispatchEvent(event('visibilitychange'));h.frame(60000);assert.equal(actor.motion.time,time);
  h.intersections[0].callback([{isIntersecting:false}]);assert.equal(h.frames.size,0);
  h.intersections[0].callback([{isIntersecting:true}]);h.frame(120000);assert.equal(actor.motion.time,time);
  actor.setEnabled(false);assert.equal(h.frames.size,0);actor.setEnabled(true);assert.equal(h.frames.size,1);
  actor.dispose();assert.equal(h.frames.size,0);assert.ok([...h.resizers,...h.intersections].every(observer=>observer.disconnected));
});
