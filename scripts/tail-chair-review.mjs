// Actual built hero and a separate prefixed-base/CSP check. No market/model calls.
import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
const out='artifacts/tail-chair',base=process.env.TAIL_CHAIR_REVIEW_BASE||'http://127.0.0.1:4681/';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}});
const page=await context.newPage(),video=page.video(),errors=[],assets=[],evidence={};
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/tail-chair/'))assets.push({path:new URL(r.url()).pathname,status:r.status()});});
await page.addInitScript(()=>{
 const raf=window.requestAnimationFrame.bind(window);window.__chairFrames=0;
 window.requestAnimationFrame=callback=>{
  const chair=String(callback).includes('._tick(');
  return raf(time=>{if(chair)window.__chairFrames++;callback(time);});
 };
});
let server;
try{
 await page.goto(base);const actor=page.locator('.ts-chair-scene .tail-chair-mascot'),canvas=actor.locator('canvas');
 await expect(actor).toHaveAttribute('data-ready','true');await page.evaluate(()=>document.fonts.ready);
 const before=JSON.parse(await readFile(`${out}/before.json`,'utf8'));
 const copy=await page.locator('.ts-hero-copy').evaluate(el=>({html:el.innerHTML,box:el.getBoundingClientRect().toJSON()}));
 expect(copy.html).toBe(before.copy.html);for(const key of ['x','y','width','height'])expect(copy.box[key]).toBeCloseTo(before.copy.box[key],1);
 evidence.leftCopy={identicalHTML:true,before:before.copy.box,after:copy.box};
 const initial=await page.evaluate(()=>({frames:window.__chairFrames,at:performance.now()}));await page.waitForTimeout(2000);
 const last=await page.evaluate(()=>({frames:window.__chairFrames,at:performance.now()}));
 evidence.idleFrameSample={frames:last.frames-initial.frames,elapsedMs:last.at-initial.at,fps:(last.frames-initial.frames)/((last.at-initial.at)/1000),devicePixelRatio:await page.evaluate(()=>devicePixelRatio),note:'One observed headless Chrome sample; no universal FPS guarantee.'};
 await page.screenshot({path:`${out}/hero-desktop.png`});
 const rect=await canvas.boundingBox();await page.mouse.move(rect.x-40,rect.y+rect.height*.4);await expect(actor).toHaveAttribute('data-state','attentive');await page.waitForTimeout(450);
 await page.mouse.move(rect.x+rect.width*.65,rect.y+rect.height*.32);await expect(actor).toHaveAttribute('data-state','waving');await page.waitForTimeout(700);await page.screenshot({path:`${out}/hero-wave.png`});
 await canvas.click({clickCount:3});await expect(actor).toHaveAttribute('data-state','delighted');await page.waitForTimeout(800);await page.screenshot({path:`${out}/hero-delight.png`});
 await page.mouse.move(5,5);await expect(actor).toHaveAttribute('data-state','working',{timeout:7000});
 await page.mouse.wheel(0,90);await expect(actor).toHaveAttribute('data-state','attentive');await page.waitForTimeout(500);await page.mouse.wheel(0,-90);
 evidence.nativeInteractions=['proximity','hover wave','triple-click delight','return to laptop','visible scroll glance'];
 const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),phone=await mobile.newPage();
 try{await phone.goto(base);const p=phone.locator('.ts-chair-scene .tail-chair-mascot');await expect(p).toHaveAttribute('data-ready','true');await p.scrollIntoViewIfNeeded();expect(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await phone.screenshot({path:`${out}/hero-mobile.png`,fullPage:true});evidence.mobile={width:390,noOverflow:true};}finally{await mobile.close();}
 // Serve the actual --base=/chair-base/ output under the existing deployment CSP.
 const root=resolve(`${out}/base-build`),config=JSON.parse(await readFile('vercel.json','utf8'));
 const headers=Object.fromEntries(config.headers.find(r=>r.source==='/(.*)').headers.map(h=>[h.key,h.value]));
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
 server=createServer(async(req,res)=>{
  try{let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path.startsWith('/chair-base/'))path=path.slice('/chair-base'.length);if(path.endsWith('/'))path+='index.html';const file=resolve(root,'.'+path);if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}const body=await readFile(file);res.writeHead(200,{...headers,'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address(),custom=await context.newPage(),cspErrors=[],baseAssets=[];
 custom.on('pageerror',e=>errors.push(e.message));custom.on('console',m=>{if(m.type()==='error'&&/Content.Security.Policy|violates|Refused to/.test(m.text()))cspErrors.push(m.text());});
 custom.on('response',r=>{if(new URL(r.url()).pathname.includes('/tail-chair/assets/'))baseAssets.push({path:new URL(r.url()).pathname,status:r.status()});});
 try{await custom.goto(`http://127.0.0.1:${address.port}/chair-base/`);const a=custom.locator('.ts-chair-scene .tail-chair-mascot');await expect(a).toHaveAttribute('data-ready','true');await a.locator('canvas').click({clickCount:3});await expect(a).toHaveAttribute('data-state','delighted');expect(baseAssets.length).toBeGreaterThanOrEqual(7);expect(baseAssets.every(r=>r.path.startsWith('/chair-base/tail-chair/assets/')&&r.status===200)).toBe(true);expect(cspErrors).toEqual([]);evidence.prefixedBase={path:'/chair-base/',assets:baseAssets,csp:'unchanged vercel.json headers',errors:cspErrors};}finally{await custom.close();}
 expect(errors).toEqual([]);expect(assets.every(a=>a.status===200)).toBe(true);
}catch(e){errors.push(e.message);process.exitCode=1;}finally{
 await context.close();await rename(await video.path(),`${out}/hero-interactions.webm`);await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
 await writeFile(`${out}/built-review.json`,JSON.stringify({at:new Date().toISOString(),base,evidence,assets,errors},null,2));console.log(JSON.stringify({evidence,assets,errors},null,2));
}
