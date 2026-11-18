/** TAIL 2D motion: original-art layered rig, continuous poses and velocity-preserving transitions. */
export const CLIPS = Object.freeze({
  idle:{label:'Calm breathing',duration:0,priority:0},
  idle_look:{label:'Look around',duration:3.4,priority:1},
  idle_stretch:{label:'Stretch',duration:3.0,priority:1},
  welcome:{label:'Welcome wave',duration:3.0,priority:10},
  thinking:{label:'Thinking',duration:0,priority:50},
  analyzing:{label:'Analyze charts',duration:0,priority:60},
  searching:{label:'Search tokens',duration:0,priority:45},
  typing:{label:'Working on laptop',duration:0,priority:30},
  success:{label:'Completed',duration:2.7,priority:65},
  warning:{label:'Attention',duration:2.9,priority:80},
  error:{label:'Request error',duration:2.7,priority:85},
  sleep:{label:'Sleeping',duration:0,priority:0},
  wake:{label:'Wake up',duration:2.5,priority:5},
  loading:{label:'Terminal loading',duration:0,priority:70},
  tap:{label:'Curious tap',duration:1.8,priority:12},
  tickle:{label:'Tickle',duration:2.6,priority:13},
  secret:{label:'Five-click surprise',duration:3.8,priority:14}
});
export const STATE_NAMES=Object.keys(CLIPS);
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const smooth=x=>{x=clamp(x,0,1);return x*x*x*(x*(x*6-15)+10)};
const gauss=(t,c,w)=>Math.exp(-(((t-c)/w)**2));
const TAU=Math.PI*2;
export function neutralPose(){return {x:0,y:0,bodyY:0,bodySX:1,bodySY:1,head:0,headX:0,headY:0,
 la:0,ra:0,lx:0,ly:0,rx:0,ry:0,lf:0,rf:0,lft:0,rft:0,feetY:0,
 gazeX:0,gazeY:0,eyeOpen:1,happy:0,wink:0,cloak:0,laptop:0,chart:0,scan:0,
 warn:0,error:0,orbit:0,sparkles:0,rays:0,thought:0,sleepy:0,terminal:0};}
export function samplePose(state,t,clock=t){
 const p=neutralPose();const b=Math.sin(clock*TAU/4.8), sway=Math.sin(clock*TAU/7.7);
 p.headY=-.9*b;p.bodySY=1+.004*b;p.head=.4*sway;p.cloak=.8*Math.sin(clock*TAU/3.7);
 const u=CLIPS[state]?.duration ? clamp(t/CLIPS[state].duration,0,1):0;
 const env=CLIPS[state]?.duration ? Math.sin(Math.PI*u)**2:1;
 switch(state){
 case 'idle_look':p.head+=4.2*Math.sin(TAU*u)*env;p.gazeX=4*Math.sin(TAU*u)*env;p.headX=1.8*Math.sin(TAU*u)*env;break;
 case 'idle_stretch':p.la=24*env;p.ra=-24*env;p.headY-=3*env;p.bodySY+=.018*env;break;
 case 'welcome':{let w=smooth(t/.5)*(1-smooth((t-2.2)/.55));p.ra=(-94+13*Math.sin(t*TAU*1.8))*w;p.rx=14*w;p.ry=-5*w;p.head=-4*w;p.rays=.85*w;p.happy=.2*w;break;}
 case 'thinking':p.ra=-148;p.rx=-14;p.ry=12;p.head=-5+1.3*Math.sin(t*1.4);p.gazeX=-2;p.gazeY=-1;p.thought=1;p.la=6;break;
 case 'analyzing':p.ra=-73+4*Math.sin(t*2.2);p.rx=13;p.ry=-3;p.head=-2+2*Math.sin(t*1.2);p.gazeX=2.8;p.chart=1;p.la=7+2*Math.sin(t*1.6);break;
 case 'searching':p.head=5*Math.sin(t*1.8);p.headX=2*Math.sin(t*1.8);p.gazeX=4*Math.sin(t*1.8);p.bodySY=1.006;p.scan=1;break;
 case 'typing':p.bodyY=10;p.bodySY=.93;p.headY=8+.6*Math.sin(t*2.2);p.head=3;p.gazeY=2.5;p.la=22;p.ra=-23;p.lx=24;p.rx=-15;p.ly=8+1.4*Math.sin(t*9);p.ry=9+1.4*Math.sin(t*9+Math.PI);p.lf=-9;p.rf=9;p.lft=-4;p.rft=4;p.feetY=0;p.laptop=1;break;
 case 'success':{let e=smooth(t/.35)*(1-smooth((t-1.9)/.55));p.la=44*e;p.ra=-53*e;p.lx=-5*e;p.rx=6*e;p.happy=e;p.rays=e;p.y=-10*gauss(t,.95,.27)-4*gauss(t,1.65,.25);p.bodySX=1-.015*e;p.bodySY=1+.015*e;break;}
 case 'warning':p.head=-4*env;p.ra=-63*env;p.rx=8*env;p.warn=env;p.gazeX=3*env;break;
 case 'error':p.head=-6*env;p.headY+=3*env;p.eyeOpen=1-.3*env;p.error=env;p.la=-4*env;p.ra=4*env;break;
 case 'sleep':p.bodyY=7;p.bodySY=.95;p.headY=6+.6*Math.sin(t*1.7);p.head=7;p.eyeOpen=.05;p.lf=-6;p.rf=6;p.lft=-2;p.rft=2;p.feetY=0;p.la=-3;p.ra=3;p.sleepy=1;break;
 case 'wake':{const k=1-smooth(t/1.25);p.bodyY=7*k;p.bodySY=1-.05*k;p.headY=6*k;p.head=7*k;p.eyeOpen=1-.95*k;p.lf=-6*k;p.rf=6*k;p.lft=-2*k;p.rft=2*k;p.feetY=0;const s=gauss(t,1.45,.37);p.la=25*s;p.ra=-25*s;p.headY-=3*s;break;}
 case 'loading':p.orbit=1;p.terminal=1;p.head=-2*Math.sin(t*1.2);p.gazeX=1.5*Math.sin(t*1.2);p.y=-2*(.5+.5*Math.sin(t*2));break;
 case 'tap':p.head=7*Math.sin(Math.PI*u)*env;p.gazeX=4*env;p.ra=-16*env;p.rx=2*env;p.rays=.35*env;break;
 case 'tickle':p.head=4.5*Math.sin(t*11)*env;p.y=-2.5*Math.abs(Math.sin(t*7))*env;p.bodySX+=.018*Math.sin(t*9)*env;p.la=28*env;p.ra=-32*env;p.happy=env;p.rays=.7*env;break;
 case 'secret':p.la=(45+9*Math.sin(t*7))*env;p.ra=(-64+12*Math.sin(t*8))*env;p.y=-11*Math.abs(Math.sin(t*3.4))*env;p.head=5*Math.sin(t*4)*env;p.happy=env;p.orbit=env;p.sparkles=env;p.wink=gauss(t,2.6,.16);break;
 }
 return p;
}
export class SpringRig {
 constructor(){this.pose=neutralPose();this.velocity=Object.fromEntries(Object.keys(this.pose).map(k=>[k,0]));}
 reset(p=neutralPose()){this.pose={...p};for(const k in this.velocity)this.velocity[k]=0;}
 advance(target,dt){
 dt=clamp(dt,0,1/15);
 for(const k in this.pose){const omega=['eyeOpen','wink'].includes(k)?29: k==='head'||k==='cloak'?17:19;
  const d=this.pose[k]-target[k],v=this.velocity[k],e=Math.exp(-omega*dt),j=v+omega*d;
  this.pose[k]=target[k]+(d+j*dt)*e;this.velocity[k]=(v-omega*j*dt)*e;
 }
 return this.pose;
 }
}
export class Director {
 constructor(){this.state='idle';this.elapsed=0;this.clock=0;this.rig=new SpringRig();this.requestId=null;this.lastChange=0;this.idleTime=0;this.variation=0;}
 setState(state,{force=false,requestId=null}={}){
 if(!CLIPS[state])throw new TypeError('Unknown TAIL animation: '+state);
 if(!force && CLIPS[state].priority<CLIPS[this.state].priority)return false;
 if(state===this.state && !force)return true;
 this.state=state;this.elapsed=0;this.lastChange=this.clock;this.idleTime=0;this.requestId=requestId;
 // Deliberately preserve both pose and velocity. No frame/element replacement.
 return true;
 }
 update(dt,{reducedMotion=false,autoIdle=false}={}){
 dt=clamp(dt,0,1/15);this.clock+=dt;this.elapsed+=dt;
 if(CLIPS[this.state].duration && this.elapsed>CLIPS[this.state].duration){this.setState('idle',{force:true});}
 if(autoIdle&&this.state==='idle'){
  this.idleTime+=dt;if(this.idleTime>13){this.variation++;this.setState(this.variation%3?'idle_look':'idle_stretch',{force:true});}
 }
 if(reducedMotion){const t=({welcome:1,success:1,warning:1.2,error:1.2,tap:.8,tickle:1.1,secret:1.6,sleep:1,typing:1,wake:1.8})[this.state]||0;const p=samplePose(this.state,t,0);p.y=0;p.orbit=0;p.sparkles=0;p.rays=0;this.rig.reset(p);return p;}
 return this.rig.advance(samplePose(this.state,this.elapsed,this.clock),dt);
 }
}
export class TapSequence {
 constructor(){this.times=[];this.lastSecret=-Infinity;}
 hit(now,busy=false){
 if(busy){this.times=[];return null;}
 this.times=this.times.filter(t=>now-t<1350);this.times.push(now);
 if(this.times.length>=5&&now-this.lastSecret>8000){this.times=[];this.lastSecret=now;return 'secret';}
 if(this.times.length>=2)return 'tickle';return 'tap';
 }
}
