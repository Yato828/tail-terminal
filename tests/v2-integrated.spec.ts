import {expect,test,type Page} from '@playwright/test';
import {fixtures,mint,errors} from './support';

async function setup(page:Page){
 await fixtures(page);
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
}
async function propose(page:Page,action:unknown){await page.evaluate(action=>window.dispatchEvent(new CustomEvent('tail:workspace-proposal',{detail:action})),action);}
const confirmation=(page:Page)=>page.getByRole('dialog',{name:'Review workspace action',exact:true});
test('one terminal bridge reviews, cancels and applies real workspace actions with actual chart context',async({page})=>{
 await setup(page);await page.goto(`/terminal?mint=${mint}`);
 await expect(page.locator('.tail-terminal-route:not([inert])')).toBeVisible();
 await expect(page.locator('.sol-chart[data-chart-id="primary"]')).toHaveAttribute('data-candle-count','40');
 await propose(page,{type:'open_widget',widget:'studio'});
 await expect(confirmation(page)).toHaveCount(1);
 await expect(page.getByRole('heading',{name:'Workspace Studio',exact:true})).toHaveCount(0);
 await confirmation(page).getByRole('button',{name:'Cancel workspace action'}).click();
 await expect(confirmation(page)).toHaveCount(0);
 await propose(page,{type:'set_interval',interval:'15m'});
 await confirmation(page).getByRole('button',{name:'Apply workspace action'}).click();
 await expect(page.locator('.sol-chart[data-chart-id="primary"]')).toHaveAttribute('data-interval','15m');
 await propose(page,{type:'open_widget',widget:'fabletools'});
 await confirmation(page).getByRole('button',{name:'Apply workspace action'}).click();
 const tools=page.getByRole('dialog',{name:'Local Data Tools',exact:true});
 await expect(tools.getByText(/Context: USDC · 15m · candles/)).toBeVisible();
 await tools.getByLabel('Local data tool',{exact:true}).selectOption('get_chart_data');
 await tools.getByRole('button',{name:'Use selected context',exact:true}).click();
 await expect(tools.getByLabel('Local tool arguments',{exact:true})).toHaveValue(/"interval": "15m"/);
 await propose(page,{type:'open_widget',widget:'compare'});
 await expect(confirmation(page)).toHaveCount(1);await page.keyboard.press('Escape');
 await expect(confirmation(page)).toHaveCount(0);await expect(tools).toBeVisible();
 await propose(page,{type:'send_transaction',mint});
 await expect(page.getByRole('alert').filter({hasText:'unsupported workspace proposal'})).toBeVisible();
 await tools.getByRole('button',{name:'Close panel',exact:true}).click();
 await page.getByRole('button',{name:'Workspace Studio',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Workspace Studio',exact:true})).toBeVisible();
 expect(errors.get(page)).toEqual([]);
});

test('journal, one foreground alert and browser persistence work through registered terminal panels',async({page})=>{
 await setup(page);let ai=0;page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/api/astra/'))ai++;});
 await page.addInitScript(()=>{if(!sessionStorage.getItem('v2-clear-fixture')){sessionStorage.setItem('v2-clear-fixture','1');localStorage.setItem('tail.fable.history.v1',JSON.stringify([{role:'user',content:'Private fixture transcript',at:Date.now()}]));}});
 await page.goto(`/terminal?mint=${mint}&module=journal`);
 await expect(page.locator('.tail-terminal-route:not([inert])')).toBeVisible();
 await expect(page.locator('.sol-chart[data-chart-id="primary"]')).toHaveAttribute('data-candle-count','40');
 let panel=page.getByRole('dialog',{name:'Trade Journal',exact:true});
 await panel.getByLabel('Journal token mint').fill(mint);
 await panel.getByLabel('Journal quantity').fill('10');await panel.getByLabel('Journal price USD').fill('2');
 await panel.getByLabel('Journal reason').fill('Manual research entry');
 await expect(panel.getByLabel('Journal quantity')).toHaveValue('10');
 await expect(panel.getByLabel('Journal reason')).toHaveValue('Manual research entry');
 await panel.getByRole('button',{name:'Add manual entry',exact:true}).click();
 await expect(panel.getByRole('cell',{name:'Manual research entry',exact:false})).toBeVisible();
 await panel.getByRole('button',{name:'Edit entry',exact:true}).click();
 await panel.getByLabel('Journal notes').fill('Updated note');await panel.getByRole('button',{name:'Save journal entry'}).click();
 await page.reload();await expect(page.locator('.tail-terminal-route:not([inert])')).toBeVisible();panel=page.getByRole('dialog',{name:'Trade Journal',exact:true});
 await expect(panel.getByRole('cell',{name:/Updated note/})).toBeVisible();
 await panel.getByRole('button',{name:'Alert Rules',exact:true}).click();
 panel=page.getByRole('dialog',{name:'Alert Rules',exact:true});
 await panel.getByLabel('Alert rule address').fill(mint);await panel.getByLabel('Alert rule threshold').fill('0.9');
 await panel.getByLabel('Alert rule name').fill('Single source threshold');
 await panel.getByRole('button',{name:'Create alert rule',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tail.v2.alert-events')??'[]').length)).toBe(1);
 await expect(panel.locator('article.v2-rule')).toHaveCount(1);
 await panel.getByRole('button',{name:'Edit rule',exact:true}).click();
 await panel.getByLabel('Alert rule name').fill('Edited threshold');await panel.getByRole('button',{name:'Save alert rule'}).click();
 await expect(panel.locator('.v2-rule').first()).toContainText('Edited threshold');
 await panel.getByRole('button',{name:'Pause rule',exact:true}).click();
 await expect(panel.getByRole('button',{name:'Resume rule',exact:true})).toBeVisible();
 await page.reload();await expect(page.locator('.tail-terminal-route:not([inert])')).toBeVisible();await page.getByRole('button',{name:'Close panel',exact:true}).click();
 await page.getByRole('button',{name:'Alert rules',exact:true}).click();
 panel=page.getByRole('dialog',{name:'Alert Rules',exact:true});
 await expect(panel.getByRole('button',{name:'Resume rule',exact:true})).toBeVisible();
 await expect(panel.locator('article.v2-rule')).toHaveCount(1);
 await panel.getByRole('button',{name:'Close panel',exact:true}).click();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Clear local module data',exact:true}).click();
 await expect(page.getByText('Local module data cleared. Reload to reset any open source views.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>['journal','alert-rules','alert-events'].map(key=>localStorage.getItem('tail.v2.'+key)))).toEqual([null,null,null]);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tail.fable.history.v1')??'[]').length)).toBe(0);
 await page.reload();await expect(page.locator('.tail-terminal-route:not([inert])')).toBeVisible();await page.getByRole('button',{name:'Close panel',exact:true}).click();
 await page.getByRole('button',{name:'Trade journal',exact:true}).click();
 await expect(page.getByText('No journal records.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Alert Rules',exact:true}).click();
 await expect(page.getByText('No advanced alert rules.',{exact:true})).toBeVisible();
 await expect(page.getByText('No observed alert events.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tail.fable.history.v1')??'[]').length)).toBe(0);
 expect(ai).toBe(0);expect(errors.get(page)).toEqual([]);
});

test('chart annotations use loaded source buckets, show provenance and detach across mode changes and clear',async({page})=>{
 await setup(page);await page.goto(`/terminal?mint=${mint}`);await expect(page.locator('.tail-terminal-route:not([inert])')).toBeVisible();
 const chart=page.locator('.sol-chart[data-chart-id="primary"]');await expect(chart).toHaveAttribute('data-candle-count','40');
 await page.evaluate(async mint=>{
  const load=(path:string)=>import(/* @vite-ignore */path);const {persistBrowserData}=await load('/src/features/v2/storage.ts');
  const at=Number(document.querySelector('.sol-chart[data-chart-id="primary"]')?.getAttribute('data-last-candle'))+1000;
  await persistBrowserData('alert-events',[{id:'marker-alert',ruleId:'fixture-rule',label:'Source bucket fixture',mint,wallet:'',at,source:'Fixture provider snapshot',observedAt:null,detail:'Explicit browser fixture, no live threshold claim.'}]);
  await persistBrowserData('journal',[{id:'marker-journal',mint,side:'buy',quantity:1,priceUsd:1,feeUsd:null,at:at+1000,reason:'Manual source bucket fixture',notes:'',tags:[],origin:'manual',signature:null}]);
 },mint);
 await chart.getByText('Local event markers · 0 shown',{exact:true}).click();
 await chart.getByLabel('Local alert observations',{exact:true}).check();await chart.getByLabel('Manual journal annotations · unverified',{exact:true}).check();
 await expect(chart.getByText('Local event markers · 2 shown',{exact:true})).toBeVisible();
 await expect(chart.getByRole('list',{name:'Chart annotation sources'}).getByRole('listitem')).toHaveCount(2);
 await expect(chart.getByText(/Source event time: unavailable/)).toHaveCount(2);
 for(const mode of ['Line','Area','Heikin Ashi','Candles']){await chart.getByRole('button',{name:mode,exact:true}).click();await expect(chart.getByText('Local event markers · 2 shown',{exact:true})).toBeVisible();}
 await page.evaluate(async()=>{const {clearBrowserModuleData}=await import(/* @vite-ignore */'/src/features/v2/storage.ts');await clearBrowserModuleData();});
 await expect(chart.getByText('Local event markers · 0 shown',{exact:true})).toBeVisible();await expect(chart.getByRole('list',{name:'Chart annotation sources'})).toHaveCount(0);
 await page.getByRole('button',{name:'TAIL terminal',exact:true}).click();await expect(page.locator('.tail-terminal-route')).toHaveCount(0);
 expect(errors.get(page)).toEqual([]);
});

test('imported OR filters keep their logic when edited and alert rules retain their saved predicate',async({page})=>{
 await setup(page);await page.goto(`/terminal?mint=${mint}`);
 await expect(page.locator('.tail-terminal-route:not([inert])')).toBeVisible();
 await page.getByRole('button',{name:'Pulse',exact:true}).click();await page.getByRole('button',{name:'Advanced',exact:true}).click();
 await page.getByText('Nested rules / import presets',{exact:true}).click();
 const filter={logic:'or',rules:[{field:'priceUsd',op:'gt',value:2},{field:'volume24h',op:'gte',value:100000}]};
 await page.getByLabel('Filter JSON',{exact:true}).fill(JSON.stringify(filter));await page.getByRole('button',{name:'Apply filter JSON'}).click();
 await expect(page.getByLabel('Filter logic',{exact:true})).toHaveValue('or');
 await page.getByLabel('Filter field',{exact:true}).selectOption('marketCap');await page.getByLabel('Filter operator',{exact:true}).selectOption('gt');await page.getByLabel('Filter value',{exact:true}).fill('2000000');
 await page.getByRole('button',{name:'Add rule',exact:true}).click();await page.getByRole('button',{name:'Copy current filter to editor'}).click();
 const parsed=JSON.parse(await page.getByLabel('Filter JSON',{exact:true}).inputValue());expect(parsed.logic).toBe('or');expect(parsed.rules).toHaveLength(3);
 await page.getByLabel('Filter preset name').fill('OR saved predicate');await page.getByRole('button',{name:'Save filter preset',exact:true}).click();
 await page.getByRole('button',{name:'Alert Rules',exact:true}).click();
 const panel=page.getByRole('dialog',{name:'Alert Rules',exact:true});
 await panel.getByLabel('Alert rule kind').selectOption('new_match');await panel.getByLabel('Alert rule address').fill(mint);
 await panel.getByLabel('Alert filter preset').selectOption({label:'OR saved predicate'});await panel.getByRole('button',{name:'Create alert rule'}).click();
 await panel.getByRole('button',{name:'Edit rule',exact:true}).click();await expect(panel.getByLabel('Alert filter preset')).toHaveValue('__current__');await panel.getByRole('button',{name:'Save alert rule'}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tail.v2.alert-rules')??'[]')[0].filter.logic)).toBe('or');
 expect(errors.get(page)).toEqual([]);
});
