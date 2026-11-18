import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {TailChair} from '../../src/features/tail-chair/src/tail-chair.mjs';
import {TailChairMascot} from '../../src/features/tail-chair/react/TailChairMascot';

// Browser-only inspection: real drawing, input handlers and native RAF remain intact.
export function installProbe(){
 const state=window as any;if(state.__chairProbe)return;
 state.__chairProbe={actors:[] as TailChair[],errors:[] as string[]};
 const register=(actor:TailChair)=>{if(!state.__chairProbe.actors.includes(actor))state.__chairProbe.actors.push(actor);};
 const proto=TailChair.prototype as any,render=proto.render,load=proto._load;
 proto.render=function(...args:unknown[]){register(this);return render.apply(this,args);};
 proto._load=function(...args:unknown[]){register(this);return load.apply(this,args);};
}
export function mountHarness(strict=true,assetBaseUrl='/tail-chair/assets/'){
 installProbe();const state=window as any;
 document.getElementById('root')!.style.display='none';
 const host=document.createElement('div');host.id='chair-harness';host.style.cssText='position:relative;width:560px;max-width:90vw;margin:80px auto';document.body.appendChild(host);
 const root=createRoot(host);state.__chairHarnessRoot=root;
 const chair=<TailChairMascot assetBaseUrl={assetBaseUrl} onError={error=>state.__chairProbe.errors.push(error.message)}/>;
 root.render(strict?<StrictMode>{chair}</StrictMode>:chair);
}
