import {expect,test,type Page} from '@playwright/test';

const wallet='So11111111111111111111111111111111111111112';
const secondMint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
async function mountIntelligence(page:Page,snapshots=false){
 await page.goto('/terminal');
 await page.evaluate(async({wallet,secondMint,snapshots})=>{
  const load=(url:string)=>import(/* @vite-ignore */ url);
  const reactModule=await load('/node_modules/.vite/deps/react.js'),React=reactModule.default??reactModule;
  const client=await load('/node_modules/.vite/deps/react-dom_client.js'),{createRoot}=client.default??client;
  const {V2Intelligence}=await load('/src/features/v2/intelligence/V2Intelligence.tsx');
  if(snapshots){
   const base={symbol:'Fixture',savedAt:Date.now(),source:'QA fixture only',observedAt:null,priceUsd:1,liquidityUsd:null,marketCap:null,volume24h:null,holderConcentrationPct:null};
   localStorage.setItem('tail.v2.token-memory',JSON.stringify([{...base,id:'sol-a',mint:wallet},{...base,id:'usdc-a',mint:secondMint},{...base,id:'sol-b',mint:wallet,priceUsd:2}]));
  }
  const original=document.getElementById('root');if(original)original.style.display='none';
  const el=document.createElement('div');el.id='v2-qa-fixture';document.body.append(el);
  createRoot(el).render(React.createElement(V2Intelligence,{coin:null,wallet,selectMint:()=>{}}));
 },{wallet,secondMint,snapshots});
 return page.locator('#v2-qa-fixture');
}

test('mixed-mint memory keeps the panel mounted and only compares matching mints',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const panel=await mountIntelligence(page,true);
 await panel.getByRole('button',{name:'Token Memory',exact:true}).click();
 await expect(panel.getByText('Compare two snapshots of the same Solana mint.',{exact:false})).toBeVisible();
 await panel.getByLabel('Compare snapshot sol-a',{exact:true}).check();
 await expect(panel.getByLabel('Compare snapshot usdc-a',{exact:true})).toBeDisabled();
 await panel.getByLabel('Compare snapshot sol-b',{exact:true}).check();
 await expect(panel.getByText('Snapshot comparison · selection order')).toBeVisible();
 await expect(panel.getByText('priceUsd: 1 → 2 · change 100.00%')).toBeVisible();
 await panel.getByLabel('Compare snapshot sol-a',{exact:true}).uncheck();
 await panel.getByLabel('Compare snapshot sol-b',{exact:true}).uncheck();
 await expect(panel.getByLabel('Compare snapshot usdc-a',{exact:true})).toBeEnabled();
 await panel.getByLabel('Compare snapshot usdc-a',{exact:true}).check();
 await expect(panel.getByLabel('Compare snapshot sol-a',{exact:true})).toBeDisabled();
 await expect(panel.getByRole('heading',{name:'Wallet & Token Intelligence'})).toBeVisible();
 expect(errors).toEqual([]);
});

test('null fixture RPC balance remains unavailable in the portfolio UI',async({page})=>{
 await page.route(/\/rpc(?:-backup)?$/,route=>{
  const body=route.request().postDataJSON();
  const response=(call:{id:number;method:string})=>({jsonrpc:'2.0',id:call.id,result:call.method==='getBalance'?{value:null}:{value:[]}});
  return route.fulfill({json:Array.isArray(body)?body.map(response):response(body)});
 });
 const panel=await mountIntelligence(page);
 await panel.getByRole('button',{name:'Portfolio',exact:true}).click();
 await panel.getByRole('button',{name:'Refresh evidence',exact:true}).click();
 await expect(panel.getByText('SOL balance unavailable: malformed RPC balance response')).toBeVisible();
 await expect(panel.locator('.metric-grid > div').filter({hasText:'Known priced subtotal'}).locator('strong')).toHaveText('Unavailable');
 await expect(panel.getByRole('cell',{name:'$0.00',exact:true})).toHaveCount(0);
});
