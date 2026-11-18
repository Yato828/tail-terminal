import { expect, test, type Page } from '@playwright/test';
const wallet='DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const second='11111111111111111111111111111111';
const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const tokenProgram='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const coin={chainId:'solana',address:mint,pairAddress:wallet,symbol:'FIX',name:'Fixture Token',dex:'fixture',priceUsd:2,liquidityUsd:100,mcap:1000,volume24h:200,createdAt:1700000000000};
async function fixtures(page:Page){
 await page.route('**/dex/**',async route=>{const url=new URL(route.request().url());const q=url.searchParams.get('q')??(url.pathname.includes('/pairs/solana/')?mint:url.pathname.split('/').at(-1))??mint;const pairs=[{chainId:'solana',dexId:'fixture',pairAddress:wallet,baseToken:{address:q,name:'Fixture',symbol:q.startsWith('So111')?'SOL':'FIX'},priceUsd:'2',liquidity:{usd:100},volume:{h24:200}}];await route.fulfill({json:url.pathname.includes('token-pairs')?pairs:{pairs}});});
 await page.route('**/rugcheck/**',route=>route.fulfill({json:{mint,topHolders:[{owner:wallet,uiAmountString:'10'}],token:{supply:100000000,decimals:6,mintAuthority:null,freezeAuthority:null}}}));
 await page.route(/\/rpc(?:-backup)?$/,async route=>{const body=route.request().postDataJSON();const response=(call:{id:number;method:string;params:unknown[]})=>{let result:unknown=null;
 switch(call.method){
 case 'getBalance':result={value:2e9};break;
 case 'getTokenAccountsByOwner':{const program=(call.params[1] as {programId:string}).programId;result={value:program===tokenProgram?[{pubkey:second,account:{owner:program,data:{parsed:{info:{owner:call.params[0],mint,tokenAmount:{amount:'2500000',decimals:6,uiAmountString:'2.5'}}}}}}]:[]};break;}
 case 'getSignaturesForAddress':result=[{signature:'fixture-signature',blockTime:1700000000,err:null}];break;
 case 'getTransaction':result={blockTime:1700000000,transaction:{message:{accountKeys:[wallet],instructions:[{programId:tokenProgram}]}},meta:{err:null,fee:5000,preBalances:[2e9],postBalances:[1.9e9],preTokenBalances:[],postTokenBalances:[{accountIndex:1,mint,owner:wallet,uiTokenAmount:{amount:'1500000',decimals:6,uiAmountString:'1.5'}}]}};break;
 case 'getAccountInfo':result={context:{slot:1},value:{owner:tokenProgram,data:{parsed:{type:'mint',info:{mintAuthority:null,freezeAuthority:null,supply:'100000000',decimals:6}}}}};break;
 case 'getTokenLargestAccounts':result={value:[{address:second,amount:'10000000',decimals:6}]};break;
 case 'getMultipleAccounts':result={value:[{data:{parsed:{info:{owner:wallet,mint}}}}]};break;
 case 'getTokenSupply':result={value:{uiAmountString:'100'}};break;
 default:result=[];
 }return {jsonrpc:'2.0',id:call.id,result};};await route.fulfill({json:Array.isArray(body)?body.map(response):response(body)});});
}
async function mount(page:Page,bubble=false,journal=false){
 await page.goto('/terminal');
 await page.evaluate(async({coin,wallet,bubble,journal})=>{
  const reactPath='/node_modules/.vite/deps/react.js',clientPath='/node_modules/.vite/deps/react-dom_client.js';
  const reactModule=await import(/* @vite-ignore */ reactPath);const React=reactModule.default??reactModule;const clientModule=await import(/* @vite-ignore */ clientPath);const {createRoot}=clientModule.default??clientModule;
  const source=journal?'/src/features/v2/journal/JournalAccounting.tsx':bubble?'/src/components/BubbleMap.tsx':'/src/features/v2/intelligence/V2Intelligence.tsx';const loaded=await import(/* @vite-ignore */ source);
  const existing=document.getElementById('v2-intel-fixture');if(existing)existing.remove();const original=document.getElementById('root');if(original)original.style.display='none';
  const el=document.createElement('div');el.id='v2-intel-fixture';document.body.append(el);
  const props=journal?{coin,mint:coin.address}:bubble?{token:coin.address,pool:coin.pairAddress,symbol:coin.symbol}:{coin,wallet,selectMint:(mint:string)=>{document.body.dataset.selectedMint=mint;}};
  createRoot(el).render(React.createElement(journal?loaded.JournalAccounting:bubble?loaded.BubbleMap:loaded.V2Intelligence,props));
 },{coin,wallet,bubble,journal});
}
test.beforeEach(async({page})=>{await fixtures(page);});
test('wallet CRUD, color/group/favorite and tracking history persist locally',async({page})=>{
 await mount(page);const panel=page.locator('#v2-intel-fixture');
 await panel.getByLabel('Track public wallet address').fill(wallet);await panel.getByLabel('New wallet label').fill('Research wallet');await panel.getByRole('button',{name:'Track wallet',exact:true}).click();
 await panel.getByLabel(`Wallet group ${wallet}`).fill('Researchers');await panel.getByLabel(`Wallet group ${wallet}`).blur();await panel.getByLabel(`Favorite ${wallet}`).click();
 await expect(panel.getByLabel(`Favorite ${wallet}`)).toHaveAttribute('aria-pressed','true');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('part.wallets.v1')??'[]')[0]?.group)).toBe('Researchers');
 await page.reload();await mount(page);await expect(panel.getByLabel(`Wallet name ${wallet}`)).toHaveValue('Research wallet');await expect(panel.getByLabel(`Wallet group ${wallet}`)).toHaveValue('Researchers');
 await panel.getByLabel(`Delete wallet ${wallet}`).click();await expect(panel.getByText('No tracked wallets.')).toBeVisible();await panel.getByText('Local tracking history').click();await expect(panel.getByText(/Stopped tracking/)).toBeVisible();
});
test('fixture RPC feeds honest activity, portfolio valuations, authority evidence and memory',async({page})=>{
 await mount(page);const panel=page.locator('#v2-intel-fixture');
 await panel.getByRole('button',{name:'Activity',exact:true}).click();await panel.getByRole('button',{name:'Refresh evidence'}).click();await expect(panel.getByRole('cell',{name:'received 1.5'})).toBeVisible();await expect(panel.getByRole('cell',{name:'0.000005',exact:true}).first()).toBeVisible();
 await panel.getByLabel('Activity action filter').selectOption('sent');await expect(panel.getByRole('cell',{name:'received 1.5'})).toHaveCount(0);await panel.getByLabel('Activity action filter').selectOption('');
 await panel.getByRole('button',{name:'Portfolio',exact:true}).click();await panel.getByRole('button',{name:'Refresh evidence'}).click();await expect(panel.getByText('Known priced subtotal')).toBeVisible();await expect(panel.getByText('$9.00',{exact:true})).toBeVisible();await expect(panel.getByText('Cost basis / realized / unrealized PnL')).toBeVisible();
 const csv=page.waitForEvent('download');await panel.getByRole('button',{name:'Export holdings CSV'}).click();expect((await csv).suggestedFilename()).toBe('tail-portfolio.csv');
 await panel.getByRole('button',{name:'Security',exact:true}).click();await panel.getByRole('button',{name:'Refresh evidence'}).click();await expect(panel.getByRole('cell',{name:/^Revoked/})).toHaveCount(2);await expect(panel.getByText('Developer DNA · unavailable')).toBeVisible();
 await panel.getByRole('button',{name:'Token Memory',exact:true}).click();await panel.getByRole('button',{name:'Save current token snapshot'}).click();await panel.getByRole('button',{name:'Save current token snapshot'}).click();const checks=panel.getByRole('checkbox');await checks.nth(0).check();await checks.nth(1).check();await expect(panel.getByText('Snapshot comparison · selection order')).toBeVisible();await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tail.v2.token-memory')??'[]').length)).toBe(2);
 await page.setViewportSize({width:390,height:844});await expect(panel.getByRole('button',{name:'Save current token snapshot'})).toBeVisible();await page.screenshot({path:'test-results/v2-intelligence/intelligence-mobile.png',fullPage:true});
});
test('existing BubbleMap exposes bounded owners, saved camera and honest relationship availability',async({page})=>{
 await mount(page,true);const panel=page.locator('#v2-intel-fixture');await expect(panel.locator('[data-state="ready"]')).toBeVisible();await panel.getByLabel('Displayed wallet count').selectOption('10');await panel.getByRole('button',{name:'Save map'}).click();await expect(panel.getByText('Camera and layout saved in this browser.')).toBeVisible();await expect(panel.getByRole('button',{name:'Relationships unavailable'})).toBeDisabled();await expect(panel.getByText(/Source balance\/activity time Unknown/)).toBeVisible();await panel.getByText(/Displayed owner addresses/).click();await expect(panel.getByRole('link').last()).toHaveAttribute('href',`https://solscan.io/account/${wallet}`);
});

test('raw unknown Memory fields stay null despite normalized selected coin and clear removes retained UI state',async({page})=>{
 await page.route('**/dex/token-pairs/v1/solana/**',route=>route.fulfill({json:[{chainId:'solana',dexId:'fixture',pairAddress:wallet,baseToken:{address:mint,name:'Unknown raw fields',symbol:'RAW'}}]}));
 await mount(page);const panel=page.locator('#v2-intel-fixture');await panel.getByRole('button',{name:'Token Memory',exact:true}).click();await panel.getByRole('button',{name:'Save current token snapshot'}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tail.v2.token-memory')??'[]').length)).toBe(1);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('tail.v2.token-memory')??'[]')[0]);
 expect([saved.priceUsd,saved.liquidityUsd,saved.marketCap,saved.volume24h]).toEqual([null,null,null,null]);expect(saved.marketEvidence.liquidityUsd.status).toBe('unavailable');expect(saved.marketFetchedAt).toBeGreaterThan(0);
 await expect(panel.getByRole('cell',{name:'Unknown',exact:true})).toHaveCount(5);
 await page.evaluate(()=>{localStorage.removeItem('tail.v2.token-memory');window.dispatchEvent(new Event('part:clear-data'));});await expect(panel.getByText('No snapshots saved for the selected token.')).toBeVisible();
});
test('manual journal accounting requires opt-in, complete history and explicit mark provenance',async({page})=>{
 await page.addInitScript(({mint})=>{localStorage.setItem('tail.v2.journal',JSON.stringify([{id:'a',mint,side:'buy',quantity:10,priceUsd:10,feeUsd:0,at:1700000000000,reason:'Manual fixture',tags:[],notes:'',signature:null,origin:'manual'},{id:'b',mint,side:'sell',quantity:4,priceUsd:15,feeUsd:0,at:1700000001000,reason:'Manual fixture',tags:[],notes:'',signature:null,origin:'manual'}]));},{mint});
 await mount(page,false,true);const panel=page.locator('#v2-intel-fixture');await expect(panel.getByRole('table')).toHaveCount(0);await panel.getByLabel('Calculate from manual journal records').check();await expect(panel.getByRole('cell',{name:'Unavailable',exact:true})).toHaveCount(4);
 await panel.getByLabel('Complete manual opening history').check();await expect(panel.getByRole('cell',{name:'$60.00',exact:true})).toBeVisible();await expect(panel.getByRole('cell',{name:'$20.00',exact:true})).toBeVisible();await expect(panel.getByRole('cell',{name:'Unavailable',exact:true})).toHaveCount(1);
 await panel.getByLabel('Use a manual USD mark').check();await panel.getByLabel('Manual accounting mark USD').fill('20');await expect(panel.getByText('Manual user input · not a fetched quote',{exact:false})).toBeVisible();await expect(panel.getByRole('cell',{name:'$60.00',exact:true})).toHaveCount(2);
 const file=page.waitForEvent('download');await panel.getByRole('button',{name:'Export manual accounting CSV'}).click();expect((await file).suggestedFilename()).toBe('tail-manual-accounting.csv');
 await page.evaluate(()=>window.dispatchEvent(new Event('part:clear-data')));await expect(panel.getByLabel('Calculate from manual journal records')).not.toBeChecked();await expect(panel.getByRole('table')).toHaveCount(0);
});
