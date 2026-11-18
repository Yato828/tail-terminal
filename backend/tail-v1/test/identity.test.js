import test from 'node:test';
import assert from 'node:assert/strict';
import { Fable } from '../src/fable.js';
import { ASSISTANT_NAME, DEFAULT_OPENAI_MODEL } from '../src/identity.js';

test('ChatGPT API default keeps the display identity Fable 5.2 and preserves the served model', async () => {
 let request;
 const fable=new Fable({key:'unit-test-only',fetchImpl:async(url,init)=>{
  assert.equal(String(url),'https://api.openai.com/v1/responses');request=JSON.parse(init.body);
  return Response.json({model:'provider-chat-snapshot',output:[{type:'message',content:[{type:'output_text',text:'I am Fable 5.2.'}]}]});
 }});
 const result=await fable.chat({message:'Who are you?'},'identity-test');
 assert.equal(request.model,DEFAULT_OPENAI_MODEL);assert.equal(request.model,'chat-latest');assert.match(request.instructions,/Always use Fable 5.2/);assert.equal(result.brand,ASSISTANT_NAME);assert.equal(result.model,'provider-chat-snapshot');assert.equal(result.answer,'I am Fable 5.2.');
 assert.equal(request.store,false);assert.ok(request.tools.every(t=>!/(sign|execute|trade)/i.test(t.name)));
});
test('a missing API key never produces fake ChatGPT answers even with a default model', async () => {
 let called=false;const fable=new Fable({fetchImpl:async()=>{called=true;throw new Error('Provider must not be called');}});
 assert.equal(fable.status().model,'chat-latest');assert.equal(fable.status().brand,'Fable 5.2');assert.equal(fable.status().configured,false);
 await assert.rejects(fable.chat({message:'Hello'}),e=>e.code==='AI_NOT_CONFIGURED');assert.equal(called,false);
});
