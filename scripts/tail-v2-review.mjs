// Review the actual local production build; no model calls or transaction actions.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile,rename,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.TAIL_V2_REVIEW_BASE||'http://127.0.0.1:4681',out='artifacts/v2-review';
const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}}),page=await context.newPage();
const errors=[],checks=[];let aiPosts=0;
page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST'&&/\/api\/astra\/(chat|scenario)/.test(request.url()))aiPosts++;});
const video=page.video();
try{
 const capabilities=await page.request.get(`${base}/api/v2/capabilities`);expect(capabilities.status()).toBe(200);expect((await capabilities.json()).execution.enabled).toBe(false);
 const zip=await page.request.get(`${base}/tail-extension.zip`);expect(zip.status()).toBe(200);const bytes=await zip.body(),local=await readFile('public/tail-extension.zip');expect(bytes.equals(local)).toBe(true);
 checks.push({check:'built download and API',zipBytes:bytes.length,zipSha256:createHash('sha256').update(bytes).digest('hex'),execution:false});
 await page.goto(`${base}/terminal?mint=${mint}`);await expect(page.locator('.tail-terminal-route:not([inert])')).toBeVisible();
 const chart=page.locator('.sol-chart[data-chart-id="primary"]');await expect.poll(async()=>Number(await chart.getAttribute('data-candle-count')),{timeout:60000}).toBeGreaterThan(0);
 checks.push({check:'built live chart',mint,bars:Number(await chart.getAttribute('data-candle-count')),scope:await chart.getAttribute('data-history-scope')});
 await chart.getByRole('button',{name:'Area',exact:true}).click();await expect(chart).toHaveAttribute('data-chart-mode','area');
 await chart.locator('.chart-indicators summary').click();await chart.getByLabel('RSI',{exact:true}).check();
 await expect(chart).toHaveAttribute('data-indicator-series',/rsi:[1-9]/);await page.screenshot({path:`${out}/chart.png`});
 await page.getByRole('button',{name:'Workspace Studio',exact:true}).click();
 const studio=page.getByRole('dialog',{name:'Workspace Studio',exact:true});await expect(studio.getByRole('heading',{name:'Workspace Studio',exact:true})).toBeVisible();
 const instances=await studio.locator('.studio-instance').count();await studio.getByRole('button',{name:'Add widget instance',exact:true}).click();await expect(studio.locator('.studio-instance')).toHaveCount(instances+1);
 await page.screenshot({path:`${out}/studio.png`});checks.push({check:'built Studio',instances:instances+1});
 await studio.getByRole('button',{name:'Trade Journal',exact:true}).click();const journal=page.getByRole('dialog',{name:'Trade Journal',exact:true});
 await expect(journal.getByRole('heading',{name:'Manual journal accounting',exact:true})).toBeVisible();
 await journal.getByRole('button',{name:'Alert Rules',exact:true}).click();const alerts=page.getByRole('dialog',{name:'Alert Rules',exact:true});await expect(alerts.getByLabel('Alert rule kind')).toBeVisible();
 await alerts.getByRole('button',{name:'Local Data Tools',exact:true}).click();const tools=page.getByRole('dialog',{name:'Local Data Tools',exact:true});
 await tools.getByLabel('Local data tool',{exact:true}).selectOption('get_market_data');await tools.getByRole('button',{name:'Run local data tool',exact:true}).click();
 await expect(tools.getByText('Factual tool output · no AI response',{exact:true})).toBeVisible({timeout:20000});
 await expect(tools.locator('[aria-label="Factual local tool result"] pre')).toContainText(mint);
 checks.push({check:'built Journal/Alerts/real factual Fable tools',modelCalls:aiPosts});
 await tools.getByRole('button',{name:'Close panel',exact:true}).click();await page.getByRole('button',{name:'TAIL terminal',exact:true}).click();
 await expect(page.locator('.tail-terminal-route')).toHaveCount(0);await expect(page.getByRole('heading',{name:/Follow your instinct/})).toBeVisible();
 expect(errors).toEqual([]);expect(aiPosts).toBe(0);checks.push({check:'approved reverse transition and cleanup',consoleErrors:0});
}catch(error){errors.push(error.message);process.exitCode=1;}finally{
 await context.close();const source=await video.path();await rename(source,`${out}/tail-v2.webm`);await browser.close();
 await writeFile(`${out}/result.json`,JSON.stringify({at:new Date().toISOString(),base,mode:'built website and actual public sources',checks,aiPosts,errors},null,2));
 console.log(JSON.stringify({checks,aiPosts,errors},null,2));
}
