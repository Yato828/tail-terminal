import {useEffect,useRef,useState} from 'react';
import {CANDLE_IVS,isPoolAddr} from '../../lib/axiom';
import {isModule} from '../workspace/store';
import {WIDGETS} from '../tail/workspace';
import {validateFilter} from './market/filters';
import {getChartContexts,CHART_CONTEXT_EVENT,type ChartContext} from './charts/state';
import {V2_ACTION_EVENT,type WorkspaceAction,type WorkspaceContext} from './contracts';
export function validateWorkspaceAction(raw:unknown):WorkspaceAction|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const r=raw as Record<string,unknown>;
 const keys=(allowed:string[])=>Object.keys(r).every(k=>allowed.includes(k));
 if(r.type==='open_widget'&&keys(['type','widget'])&&typeof r.widget==='string'&&(isModule(r.widget)||WIDGETS.includes(r.widget as never)))return r as WorkspaceAction;
 if(r.type==='set_interval'&&keys(['type','interval'])&&CANDLE_IVS.includes(r.interval as never))return r as WorkspaceAction;
 if(r.type==='search_tokens'&&keys(['type','query'])&&typeof r.query==='string'&&r.query.trim().length>0&&r.query.length<=120)return{type:'search_tokens',query:r.query.trim()};
 if(r.type==='compare_tokens'&&keys(['type','mints'])&&Array.isArray(r.mints)&&r.mints.length>=1&&r.mints.length<=4&&r.mints.every(isPoolAddr))return{type:'compare_tokens',mints:[...new Set(r.mints as string[])]};
 if(r.type==='save_filter'&&keys(['type','name','filter'])&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=80&&validateFilter(r.filter).valid)return{type:'save_filter',name:r.name.trim(),filter:validateFilter(r.filter).filter};
 return null;
}
export function WorkspaceBridge({mint,widgets,onApply}:{mint:string|null;widgets:string[];onApply:(action:WorkspaceAction)=>void}){
 const [chart,setChart]=useState<ChartContext|undefined>(()=>getChartContexts().find(c=>c.chartId==='primary')),[filters,setFilters]=useState<unknown>(null),[proposal,setProposal]=useState<WorkspaceAction|null>(null),[error,setError]=useState('');
 const current=useRef<WorkspaceContext>({mint,interval:'5m',chartMode:'candles',filters:null,widgets:[],allowPortfolio:false}),modal=useRef<HTMLDialogElement>(null),previousFocus=useRef<HTMLElement|null>(null);
 const widgetKey=JSON.stringify(widgets);
 useEffect(()=>{
  current.current={mint,interval:chart?.interval??'5m',chartMode:chart?.chartMode??'candles',filters,widgets,allowPortfolio:false};
  window.dispatchEvent(new CustomEvent('tail:workspace-context',{detail:current.current}));
 },[mint,chart,filters,widgetKey]);
 useEffect(()=>{
  const changed=(event:Event)=>{const d=(event as CustomEvent<ChartContext>).detail;if(d?.chartId==='primary'&&CANDLE_IVS.includes(d.interval)&&isPoolAddr(d.mint))setChart(d);};
  const filtered=(event:Event)=>{const d=(event as CustomEvent).detail;setFilters(validateFilter(d).filter??null);};
  const request=()=>window.dispatchEvent(new CustomEvent('tail:workspace-context',{detail:current.current}));
  const proposed=(event:Event)=>{const action=validateWorkspaceAction((event as CustomEvent).detail);if(action){setError('');setProposal(action);}else setError('An unsupported workspace proposal was rejected.');};
  window.addEventListener(CHART_CONTEXT_EVENT,changed);window.addEventListener('tail:filter-context',filtered);window.addEventListener('tail:request-workspace-context',request);window.addEventListener(V2_ACTION_EVENT,proposed);
  return()=>{window.removeEventListener(CHART_CONTEXT_EVENT,changed);window.removeEventListener('tail:filter-context',filtered);window.removeEventListener('tail:request-workspace-context',request);window.removeEventListener(V2_ACTION_EVENT,proposed);};
 },[]);
 useEffect(()=>{if(proposal){previousFocus.current=document.activeElement as HTMLElement;modal.current?.showModal();}return()=>previousFocus.current?.focus();},[proposal]);
 return <>{error&&<p role="alert" className="tail-error">{error}<button onClick={()=>setError('')}>Dismiss</button></p>}{proposal&&<dialog ref={modal} className="v2-proposal" aria-label="Review workspace action" onCancel={()=>setProposal(null)} onKeyDown={event=>{if(event.key==='Escape')event.stopPropagation();}}><h2>Review workspace action</h2><p>This changes your local workspace. It cannot sign or submit a transaction.</p><pre>{JSON.stringify(proposal,null,2)}</pre><div className="tool-actions"><button onClick={()=>{try{onApply(proposal);setProposal(null);}catch(err){setError(err instanceof Error?err.message:'Action could not be applied.');setProposal(null);}}}>Apply workspace action</button><button onClick={()=>setProposal(null)}>Cancel workspace action</button></div></dialog>}</>;
}
