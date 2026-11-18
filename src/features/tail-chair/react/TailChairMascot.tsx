import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {TailChair,type ChairReaction,type ChairState} from '../src/tail-chair.mjs';
import './tail-chair.css';
export interface TailChairHandle{react:(action:ChairReaction)=>void;setEnabled:(value:boolean)=>void}
export interface TailChairMascotProps{assetBaseUrl?:string;className?:string;reducedMotion?:boolean|'auto';onStateChange?:(state:ChairState)=>void;onError?:(error:Error)=>void}
/** Only the right-side illustration. No headline, buttons, backend or network API. */
export const TailChairMascot=forwardRef<TailChairHandle,TailChairMascotProps>(function TailChairMascot(
 {assetBaseUrl='/tail-chair/assets/',className='',reducedMotion='auto',onStateChange,onError},ref
){
 const canvasRef=useRef<HTMLCanvasElement>(null),controller=useRef<TailChair|null>(null);
 const callbacks=useRef({onStateChange,onError});callbacks.current={onStateChange,onError};
 const [ready,setReady]=useState(false),[failed,setFailed]=useState(false),[state,setState]=useState<ChairState>('rest');
 useImperativeHandle(ref,()=>({react:action=>{controller.current?.react(action);},setEnabled:value=>{controller.current?.setEnabled(value);}}),[]);
 useEffect(()=>{
  const canvas=canvasRef.current;if(!canvas)return;let active=true;setReady(false);setFailed(false);
  let actor:TailChair;
  try{actor=new TailChair(canvas,{assetBaseUrl,reducedMotion,onStateChange:state=>{if(active){setState(state);callbacks.current.onStateChange?.(state);}}});}
  catch(e){setFailed(true);callbacks.current.onError?.(e instanceof Error?e:new Error(String(e)));return;}
  controller.current=actor;
  actor.ready.then(()=>{if(active)setReady(true);}).catch(e=>{if(active){actor.dispose();if(controller.current===actor)controller.current=null;setFailed(true);callbacks.current.onError?.(e instanceof Error?e:new Error(String(e)));}});
  return()=>{active=false;actor.dispose();if(controller.current===actor)controller.current=null;};
 },[assetBaseUrl,reducedMotion]);
 const base=assetBaseUrl.endsWith('/')?assetBaseUrl:assetBaseUrl+'/';
 return <div className={`tail-chair-mascot ${className}`} data-ready={ready} data-state={state} data-error={failed||undefined} aria-busy={!ready&&!failed}>
  {!ready&&<img className="tail-chair-mascot__poster" src={`${base}poster.png`} alt="TAIL sitting in a chair with a laptop"/>}
  <canvas ref={canvasRef} className="tail-chair-mascot__canvas" width={900} height={780} aria-label="Say hello to TAIL" aria-hidden={!ready} style={{opacity:ready?1:0,visibility:ready?'visible':'hidden'}}/>
 </div>;
});
