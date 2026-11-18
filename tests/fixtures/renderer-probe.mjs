import {TailRenderer,LAYERS} from '../../src/mascot/runtime/renderer.mjs';
import {neutralPose} from '../../src/mascot/runtime/motion-core.mjs';
export function probe(){
 const textures=Object.fromEntries(LAYERS.map(name=>{const image=document.createElement('canvas');image.width=image.height=320;return [name,image];}));
 for(const [name,x,y,w,h] of [['body',96,182,128,98],['eye-0',134,119,28,38],['eye-1',183,119,26,38]]){const ctx=textures[name].getContext('2d');ctx.fillStyle='rgba(245,234,220,.75)';ctx.fillRect(x,y,w,h);}
 return [1,1.25,2,3].flatMap(dpr=>[128,384].map(side=>{
  const canvas=document.createElement('canvas'),renderer=new TailRenderer(canvas,textures),pose=neutralPose();pose.bodySY=1.013;pose.bodySX=1.003;pose.head=.37;
  renderer.resize(side,side,dpr);renderer.render(pose,.7);
  const ctx=canvas.getContext('2d'),k=canvas.width/320,sample=(x,y)=>ctx.getImageData(Math.round(x*k),Math.round(y*k),1,1).data[3];
  const body=Array.from({length:50},(_,i)=>sample(180,212+i)),eyes=Array.from({length:13},(_,i)=>sample(142+i,140));
  renderer.destroy();return {side,dpr,body:Math.max(...body)-Math.min(...body),eyes:Math.max(...eyes)-Math.min(...eyes),released:renderer.surfaces.length===0};
 }));
}
