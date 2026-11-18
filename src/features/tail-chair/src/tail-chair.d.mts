export type ChairState='rest'|'working'|'attentive'|'waving'|'delighted'|'reduced';
export type ChairReaction='wave'|'look'|'delight'|'success'|'scroll'|'rest';
export interface ChairOptions{assetBaseUrl?:string;assets?:{manifest:unknown;images:Record<string,string>};pointerRoot?:Window|HTMLElement;proximityPx?:number;maxDpr?:number;interactive?:boolean;reducedMotion?:boolean|'auto';paused?:boolean;label?:string;onStateChange?:(state:ChairState)=>void}
export class TailChair{constructor(canvas:HTMLCanvasElement,options?:ChairOptions);ready:Promise<this>;react(action:ChairReaction):boolean;setEnabled(value:boolean):void;setPaused(value:boolean):void;setReducedMotion(value:boolean):void;dispose():void;getSnapshot():Record<string,unknown>}
export class TailChairMotion{constructor(options?:{reducedMotion?:boolean;seed?:number});time:number;state:ChairState;pose:Record<string,number>;step(dt:number):Record<string,number>;setPointer(x:number,y:number,options?:{near?:boolean;inside?:boolean}):void;click():string;scroll():boolean;react(action:ChairReaction):boolean;setReducedMotion(value:boolean):void;snapshot():unknown}
export function springStep(s:{x:number;v:number},target:number,dt:number,omega?:number):{x:number;v:number};
export function clamp(x:number,a?:number,b?:number):number;
export function smootherstep(x:number):number;
