import {clamp} from './motion-core.mjs';
const R=Math.PI/180, S=320;
export const LAYERS=['head','head-blank','body','arm-left','arm-right','foot-left','foot-right','eye-0','eye-1','clasp','poster'];
export async function loadRig(base,signal){
 const images={};
 try {
  for(const name of LAYERS){
   if(signal?.aborted)throw new DOMException('Aborted','AbortError');
   let blob;
   const embedded=globalThis.__TAIL_EMBEDDED__?.[name];
   if(embedded){const bytes=Uint8Array.from(atob(embedded.split(',')[1]),c=>c.charCodeAt(0));blob=new Blob([bytes],{type:'image/png'});}
   else{const response=await fetch(new URL(`assets/rig/${name}.png`,base),{signal});if(!response.ok)throw Error(`Cannot load TAIL layer ${name}: ${response.status}`);blob=await response.blob();}
   images[name]=await createImageBitmap(blob);
  }
  return images;
 }catch(e){for(const im of Object.values(images))im.close?.();throw e;}
}
export class TailRenderer {
 constructor(canvas,images){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:true});if(!this.ctx)throw Error('Canvas 2D unavailable');this.images=images;this.progress=null;this.dpr=1;this.surfaces=[];this.surfaceScale=0;}
 resize(w=320,h=w,dpr=globalThis.devicePixelRatio||1){this.dpr=Math.min(dpr,3);this.canvas.width=Math.round(w*this.dpr);this.canvas.height=Math.round(h*this.dpr);this.ctx.imageSmoothingEnabled=true;this.ctx.imageSmoothingQuality='high';this.prepareSurfaces();}
 prepareSurfaces(){const k=Math.max(1,Math.min(4,Math.ceil(Math.min(this.canvas.width,this.canvas.height)/S)));if(k===this.surfaceScale)return;this.surfaceScale=k;const sizes=[[S,S],[28,64],[26,64]];for(let i=0;i<sizes.length;i++){const surface=this.surfaces[i]??document.createElement('canvas');surface.width=sizes[i][0]*k;surface.height=sizes[i][1]*k;const ctx=surface.getContext('2d',{alpha:true});if(!ctx)throw Error('Canvas 2D unavailable');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';this.surfaces[i]=surface;}}
 destroy(){for(const i of Object.values(this.images))i.close?.();for(const surface of this.surfaces){surface.width=0;surface.height=0;}this.surfaces.length=0;}
 part(name,px,py,angle=0,dx=0,dy=0,sx=1,sy=1){const c=this.ctx;c.save();c.translate(px+dx,py+dy);c.rotate(angle*R);c.scale(sx,sy);c.translate(-px,-py);c.drawImage(this.images[name],0,0,S,S);c.restore();}
 rounded(x,y,w,h,r,fill,stroke){const c=this.ctx;c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
 star(x,y,size=7){const c=this.ctx;c.beginPath();for(let i=0;i<8;i++){const a=-Math.PI/2+i*Math.PI/4;const rr=i%2?size*.35:size;const xx=x+Math.cos(a)*rr,yy=y+Math.sin(a)*rr;i?c.lineTo(xx,yy):c.moveTo(xx,yy);}c.closePath();c.fill();}
 orbit(p,t,front){if(p.orbit<.005)return;const c=this.ctx;c.save();c.globalAlpha=p.orbit*.8;c.strokeStyle='#ff903f';c.lineWidth=1.55;c.beginPath();c.ellipse(166,239,121,31,-.11,front?0:Math.PI,front?Math.PI:Math.PI*2);c.stroke();
 const a=t*2.7;const isFront=Math.sin(a)>0;if(isFront===front){c.fillStyle='#ffae66';this.star(166+121*Math.cos(a),239+31*Math.sin(a)-12*Math.cos(a),4.4);}
 c.restore();}
 render(p,t,{reducedMotion=false,progress=null,presentation='default'}={}){
 // A fixed landing-page arrangement of the original layers. Motion still comes
 // from the supplied rig; terminal poses and task priorities are untouched.
 const floating=presentation==='floating';
 if(floating)p={...p,head:p.head-7,headX:p.headX+1,la:p.la+28,lx:p.lx-4,ly:p.ly+5,ra:p.ra-70,rx:p.rx+9,ry:p.ry-8,lf:p.lf+34,rf:p.rf-23,lft:p.lft-5,rft:p.rft+7,feetY:p.feetY-4,gazeX:p.gazeX+3,gazeY:p.gazeY-1};
 const c=this.ctx,W=this.canvas.width,H=this.canvas.height;this.prepareSurfaces();c.clearRect(0,0,W,H);const scale=Math.min(W,H)/S;c.save();c.translate((W-S*scale)/2,(H-S*scale)/2);c.scale(scale,scale);
 // Separate floor/contact shadow, never part of a cropped background rectangle.
 if(!floating){c.save();c.globalAlpha=.13*(1-clamp(-p.y/80,0,.6));c.fillStyle='#100d0c';c.beginPath();c.ellipse(164,298,72,6,0,0,Math.PI*2);c.fill();c.restore();}
 c.translate(p.x,p.y);this.orbit(p,t,false);
 this.part('foot-left',140,274,p.lf,p.lft,p.feetY);this.part('foot-right',184,274,p.rf,p.rft,p.feetY);
 // Assemble the supplied deformation on an integer pixel grid, then transform once.
 // Independent fractional strips on the final canvas produce visible sampling seams.
 c.save();c.translate(164,184+p.bodyY);c.scale(p.bodySX,p.bodySY);c.translate(-164,-184);
 const texture=this.images.body,k=this.surfaceScale,body=this.surfaces[0],bc=body.getContext('2d');bc.clearRect(0,0,body.width,body.height);
 for(let y=182;y<280;y++){const influence=Math.pow(clamp((y-202)/75,0,1),2);const shift=Math.sin(t*2.25+(y-190)*.055)*p.cloak*influence;
  bc.drawImage(texture,0,y,S,1,shift*k,y*k,S*k,k);
 }
 c.drawImage(body,0,0,S,S);
 c.restore();
 c.save();c.translate(168+p.headX,184+p.headY+p.bodyY*.18);c.rotate(p.head*R);c.translate(-168,-184);c.drawImage(this.images['head-blank'],0,0,S,S);
 const blinkPhase=t%4.7;const blink=!reducedMotion&&blinkPhase>3.52&&blinkPhase<3.70?Math.sin((blinkPhase-3.52)/.18*Math.PI)**2:0;
 const open=clamp(p.eyeOpen*(1-blink),.035,1);const happy=clamp(p.happy,0,1);const sleepLids=clamp((.24-p.eyeOpen)/.18,0,1);
 const centers=[[148.43,139.73],[196.54,138.57]];
 centers.forEach(([x,y],i)=>{
  // Continuous deformation of the original eye texture into a smile/sleep arc.
  // No ghosted oval + separate smile overlay.
  const eye=this.images['eye-'+i];const width=i===0?28:26;const height=38;
  const sx0=Math.floor(x-width/2),sy0=Math.floor(y-height/2);
  const openness=clamp(open*(i===1?1-.9*p.wink:1),.035,1);
  const sy=Math.max(.065,openness*(1-.89*happy));
  const bend=-6.2*happy+5.1*sleepLids;
  const surface=this.surfaces[i+1],ec=surface.getContext('2d'),padding=13;ec.clearRect(0,0,surface.width,surface.height);
  for(let col=0;col<width;col++){
   const u=(col+.5-width/2)/(width/2);const offset=bend*Math.max(0,1-u*u);
   ec.drawImage(eye,sx0+col,sy0,1,height,col*k,(padding+height*(1-sy)/2+offset)*k,k,height*sy*k);
  }
  c.drawImage(surface,sx0+p.gazeX,y-height/2-padding+p.gazeY,width,64);
 });c.restore();
 // Gloves always remain the approved original pixels, not newly drawn hands.
 this.part('arm-left',130,202,p.la,p.lx,p.ly+p.bodyY*.55);this.part('arm-right',206,202,p.ra,p.rx,p.ry+p.bodyY*.55);
 this.part('clasp',169,194,p.head*.12,p.headX*.2,p.headY+p.bodyY*.18);
 this.props(p,t,progress);this.orbit(p,t,true);c.restore();
 }
 props(p,t,progress){const c=this.ctx;
 if(p.laptop>.005){c.save();c.globalAlpha=p.laptop;const lift=12*(1-p.laptop);c.translate(0,lift);c.lineWidth=2;
  c.fillStyle='#171615';c.strokeStyle='#625345';c.beginPath();c.moveTo(167,216);c.lineTo(248,216);c.quadraticCurveTo(253,217,251,223);c.lineTo(239,268);c.lineTo(153,268);c.closePath();c.fill();c.stroke();c.fillStyle='#ff8a3d';this.star(205,241,9);
  this.rounded(127,268,113,7,3,'#242220','#403830');c.restore();}
 if(p.chart>.005){c.save();c.globalAlpha=p.chart*.9;c.translate(14*(1-p.chart),0);c.lineWidth=1.3;this.rounded(224,151,81,65,6,'rgba(42,29,22,.82)','#e58b4f');
  c.strokeStyle='rgba(255,176,112,.18)';for(let j=0;j<3;j++){c.beginPath();c.moveTo(232,166+j*16);c.lineTo(297,166+j*16);c.stroke();}
  const vals=[19,27,22,34,30,41,38];vals.forEach((v,i)=>{const x=233+i*9;const dy=Math.sin(t*1.3+i)*1.5;c.strokeStyle='#ffab6b';c.lineWidth=1;c.beginPath();c.moveTo(x,202-v+dy-5);c.lineTo(x,202-v+dy+11);c.stroke();c.fillStyle='#ff9a54';c.fillRect(x-2,202-v+dy,4,7);});c.restore();}
 if(p.scan>.005){c.save();c.globalAlpha=p.scan*.75;c.strokeStyle='#f79750';c.lineWidth=1.5;const x=252,y=166;for(const [dx,dy,sx,sy] of [[-24,-23,1,1],[24,-23,-1,1],[-24,23,1,-1],[24,23,-1,-1]]){c.beginPath();c.moveTo(x+dx+sx*7,y+dy);c.lineTo(x+dx,y+dy);c.lineTo(x+dx,y+dy+sy*7);c.stroke();}c.globalAlpha*=.7;c.beginPath();const sy=y+Math.sin(t*2)*18;c.moveTo(x-20,sy);c.lineTo(x+20,sy);c.stroke();c.restore();}
 if(p.thought>.005){c.save();c.globalAlpha=p.thought;c.lineWidth=1.6;this.rounded(234,98,47,29,12,'#fff2e5','#282320');c.fillStyle='#282320';for(let i=0;i<3;i++){c.globalAlpha=p.thought*(.35+.65*(.5+.5*Math.sin(t*3-i*.8)));c.beginPath();c.arc(246+i*11,112,2.3,0,Math.PI*2);c.fill();}c.restore();}
 if(p.rays>.005){c.save();c.globalAlpha=p.rays;c.strokeStyle='#ff9647';c.lineWidth=3.7;c.lineCap='round';for(let i=0;i<3;i++){const a=-1.35+i*.46;c.beginPath();c.moveTo(250+12*Math.cos(a),132+12*Math.sin(a));c.lineTo(250+21*Math.cos(a),132+21*Math.sin(a));c.stroke();}c.restore();}
 if(p.warn>.005||p.error>.005){const err=p.error>p.warn;c.save();c.globalAlpha=Math.max(p.warn,p.error);c.strokeStyle=err?'#ed7865':'#ff984e';c.fillStyle='#241c19';c.lineWidth=2;this.rounded(247,140,30,29,7,'#241c19',c.strokeStyle);c.beginPath();if(err){c.moveTo(256,148);c.lineTo(268,161);c.moveTo(268,148);c.lineTo(256,161);}else{c.moveTo(262,147);c.lineTo(262,156);c.moveTo(262,160);c.lineTo(262,161);}c.stroke();c.restore();}
 if(p.sleepy>.005){c.save();c.globalAlpha=p.sleepy*.7;c.fillStyle='#ffa05b';c.font='600 14px system-ui';c.fillText('z',244,167+Math.sin(t)*2);c.font='600 19px system-ui';c.fillText('z',260,151+Math.sin(t+1)*2);c.restore();}
 if(p.terminal>.005){c.save();c.globalAlpha=p.terminal;c.lineWidth=1.2;this.rounded(235,121,63,39,5,'#211a16','#e78e4f');c.fillStyle='#fff0db';c.font='11px monospace';c.fillText('>_',243,136);this.rounded(242,145,49,6,2,'#3b2a1f');c.fillStyle='#ff9849';if(Number.isFinite(progress)){c.fillRect(243,146,47*clamp(progress,0,1),4);}else{const x=243+(Math.sin(t*2)+1)*.5*32;c.fillRect(x,146,15,4);}c.restore();}
 if(p.sparkles>.005){c.save();c.globalAlpha=p.sparkles;for(let i=0;i<6;i++){const a=t*1.2+i*Math.PI/3;const rad=107+11*Math.sin(t*2+i);c.fillStyle=i%2?'#fff0dc':'#ff9a50';this.star(166+Math.cos(a)*rad,176+Math.sin(a)*91,3.5+1.2*Math.sin(t*4+i));}c.restore();}
 }
}
