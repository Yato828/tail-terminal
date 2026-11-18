import {describe,it,expect} from 'vitest';
import {importDesk,exportDesk,parseDesk} from '../tail/workspace';
import {validateWorkspaceAction} from './WorkspaceBridge';
describe('workspace imports and proposals',()=>{
 it('round-trips the approved Default without altering order',()=>{const desk=parseDesk(null);expect(importDesk(exportDesk(desk))).toEqual(desk);});
 it('rejects unbounded/unknown widget imports and signing proposals',()=>{expect(()=>importDesk('x'.repeat(140000))).toThrow();expect(()=>importDesk(JSON.stringify({version:1,layouts:[{id:'bad',name:'bad',order:['sign_transaction']}]}))).toThrow();expect(validateWorkspaceAction({type:'sign_transaction',wallet:'anything'})).toBeNull();});
 it('allows bounded reviewable local actions and rejects extra payloads',()=>{expect(validateWorkspaceAction({type:'open_widget',widget:'charts'})).toEqual({type:'open_widget',widget:'charts'});expect(validateWorkspaceAction({type:'set_interval',interval:'1m',execute:true})).toBeNull();expect(validateWorkspaceAction({type:'compare_tokens',mints:['0x123']})).toBeNull();});
});
