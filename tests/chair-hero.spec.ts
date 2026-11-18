import {expect,test,type Page} from '@playwright/test';
import {fixtures,errors} from './support';
import {readFile} from 'node:fs/promises';

async function open(page:Page){await fixtures(page);await page.goto('/');await expect(page.locator('.ts-chair-scene .tail-chair-mascot')).toHaveAttribute('data-ready','true');}
async function probe(page:Page){
 await page.evaluate(async()=>{const module=await import(/* @vite-ignore */'/tests/fixtures/chair-harness.tsx');module.installProbe();});
 await page.mouse.move(5,5);await expect.poll(()=>page.evaluate(()=>(window as any).__chairProbe.actors.length)).toBeGreaterThan(0);
}
const snapshot=(page:Page)=>page.evaluate(()=>{const a=(window as any).__chairProbe.actors.find((actor:any)=>!actor.disposed&&actor.canvas.closest('.ts-chair-scene'));return{...a.getSnapshot(),pointer:{...a.motion.pointer},lastScroll:a.motion.lastScroll,waveStrength:a.motion.waveStrength,images:Object.keys(a.images).length};});
test.afterEach(async({page})=>expect(errors.get(page)??[]).toEqual([]));

test('hero uses original transparent layers, full eyes and the existing left content',async({page})=>{
 await open(page);await probe(page);const s=await snapshot(page),canvas=page.locator('.ts-chair-scene canvas');
 expect(s.pose.eyeOpen).toBe(1);expect(s.images).toBe(6);
 await expect(canvas).toHaveAttribute('role','button');await expect(canvas).toHaveAttribute('aria-label','Say hello to TAIL');
 expect(await canvas.evaluate((c:HTMLCanvasElement)=>c.getContext('2d')!.getImageData(0,0,1,1).data[3])).toBe(0);
 const box=await canvas.boundingBox();expect(box!.width/box!.height).toBeCloseTo(900/780,2);
 await expect(page.locator('.ts-hero-copy h1')).toHaveText('Follow yourinstinct');await expect(page.locator('.ts-lede')).toHaveText('Solana charts, public wallets and market tools.On the web, or a click away in your browser.');
 await expect(page.locator('.ts-actions').getByRole('button',{name:'Get the extension'})).toBeVisible();
 await expect(page.locator('.ts-hero-art .tail-mascot,.ts-hero-art video,.ts-hero-art .ts-star-skiff')).toHaveCount(0);
});

test('native proximity, hover cooldown and pointer exit retain continuous reactions',async({page})=>{
 await open(page);await probe(page);const canvas=page.locator('.ts-chair-scene canvas'),box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x-40,box.y+box.height*.4);await expect.poll(async()=>(await snapshot(page)).state).toBe('attentive');
 await expect.poll(async()=>(await snapshot(page)).pose.gazeX).toBeLessThan(-2);expect((await snapshot(page)).waveStarted).toBe(-100);
 await page.mouse.move(box.x+box.width*.65,box.y+box.height*.32);await expect.poll(async()=>(await snapshot(page)).state).toBe('waving');
 const wave=(await snapshot(page)).waveStarted;
 for(let i=0;i<10;i++)await page.mouse.move(box.x+box.width*(.58+i*.01),box.y+box.height*.33);
 expect((await snapshot(page)).waveStarted).toBe(wave);
 await expect.poll(async()=>(await snapshot(page)).state,{timeout:5000}).toBe('attentive');expect((await snapshot(page)).waveStarted).toBe(wave);
 await page.mouse.move(5,5);await expect.poll(async()=>(await snapshot(page)).state,{timeout:5000}).toBe('working');
});

test('native single/triple clicks and keyboard use the provided gestures',async({page})=>{
 await open(page);await probe(page);const canvas=page.locator('.ts-chair-scene canvas');
 await canvas.click();await expect.poll(async()=>(await snapshot(page)).state).toBe('waving');
 await canvas.click({clickCount:3});await expect.poll(async()=>(await snapshot(page)).state).toBe('delighted');
 expect((await snapshot(page)).waveStrength).toBe(1.35);
 const wave=(await snapshot(page)).waveStarted;await canvas.click();expect((await snapshot(page)).waveStarted).toBe(wave);
 await page.locator('.ts-actions a').focus();await page.keyboard.press('Tab');await expect(canvas).toBeFocused();
 await page.keyboard.press('Enter');await page.keyboard.press('Space');await expect.poll(async()=>['waving','delighted'].includes((await snapshot(page)).state)).toBe(true);
});

test('scroll rechecks a stationary cursor; offscreen and visibility changes pause native frames',async({page})=>{
 await open(page);await probe(page);const canvas=page.locator('.ts-chair-scene canvas'),box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+box.width*.55,box.y+box.height*.82);
 await page.evaluate(()=>scrollTo({top:380,behavior:'instant'}));
 await expect.poll(async()=>(await snapshot(page)).pointer.near).toBe(false);
 await expect.poll(async()=>(await snapshot(page)).state,{timeout:6000}).toBe('working');
 await page.locator('#extension').scrollIntoViewIfNeeded();await expect.poll(async()=>(await snapshot(page)).inView).toBe(false);
 const paused=(await snapshot(page)).stats.frames;await page.waitForTimeout(200);expect((await snapshot(page)).stats.frames).toBe(paused);
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await expect.poll(async()=>(await snapshot(page)).stats.frames).toBeGreaterThan(paused);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
 const hidden=(await snapshot(page)).stats.frames;await page.waitForTimeout(200);expect((await snapshot(page)).stats.frames).toBe(hidden);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
 await expect.poll(async()=>(await snapshot(page)).stats.frames).toBeGreaterThan(hidden);
});

test('reduced motion keeps open eyes and no recurring RAF after input or preference changes',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await open(page);await probe(page);
 await expect(page.locator('.ts-chair-scene .tail-chair-mascot')).toHaveAttribute('data-state','reduced');
 const canvas=page.locator('.ts-chair-scene canvas');await canvas.click({clickCount:3});
 await expect.poll(async()=>(await snapshot(page)).pose.eyeOpen).toBe(1);
 await page.waitForTimeout(100);const quiet=await snapshot(page);await page.waitForTimeout(250);const after=await snapshot(page);
 expect(after.stats.frames).toBe(quiet.stats.frames);expect(after.pose).toEqual(quiet.pose);
 await page.emulateMedia({reducedMotion:'no-preference'});await expect.poll(async()=>(await snapshot(page)).stats.frames).toBeGreaterThan(after.stats.frames);
 await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(async()=>(await snapshot(page)).state).toBe('reduced');
});

test('Home and Terminal preserve one chair instance and the separate terminal mascot',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await open(page);await probe(page);
 const canvas=page.locator('.ts-chair-scene canvas');await canvas.evaluate(el=>el.setAttribute('data-same-chair','yes'));
 await page.locator('.ts-nav').getByRole('link',{name:'Open terminal',exact:true}).click();
 await expect(page.locator('.tail-terminal-route:not([inert])')).toBeVisible();await expect(page.locator('.fable-heading [data-renderer="tail-2d"]')).toHaveAttribute('data-ready','true');
 const stopped=(await snapshot(page)).stats.frames;await page.waitForTimeout(150);expect((await snapshot(page)).stats.frames).toBe(stopped);
 await page.getByRole('button',{name:'TAIL terminal',exact:true}).click();await expect(page.locator('.tail-terminal-route')).toHaveCount(0);
 await expect(canvas).toHaveAttribute('data-same-chair','yes');await expect(page.locator('.ts-chair-scene canvas')).toHaveCount(1);
});

test('React StrictMode setup/cleanup keeps one active actor and disposes resources on unmount',async({page})=>{
 await open(page);await probe(page);
 await page.evaluate(async()=>{const m=await import(/* @vite-ignore */'/tests/fixtures/chair-harness.tsx');m.mountHarness();});
 await expect(page.locator('#chair-harness .tail-chair-mascot')).toHaveAttribute('data-ready','true');
 const actors=()=>page.evaluate(()=>(window as any).__chairProbe.actors.filter((a:any)=>a.canvas.closest('#chair-harness')).map((a:any)=>({disposed:a.disposed,frames:a._stats.frames,raf:a.raf,listeners:a.cleanup.length,images:Object.keys(a.images).length})));
 await expect.poll(async()=>(await actors()).filter((a:any)=>!a.disposed).length).toBe(1);expect((await actors()).filter((a:any)=>a.disposed).length).toBeGreaterThan(0);
 await page.evaluate(()=>(window as any).__chairHarnessRoot.unmount());
 await expect.poll(async()=>page.evaluate(()=>(window as any).__chairProbe.actors.filter((a:any)=>a.canvas.parentElement?.id==='chair-harness'&&!a.disposed).length)).toBe(0);
 expect(await page.evaluate(()=>(window as any).__chairProbe.actors.filter((a:any)=>a.canvas!==document.querySelector('.ts-chair-scene canvas')).every((a:any)=>a.disposed&&a.raf===0&&a.cleanup.length===0&&Object.keys(a.images).length===0))).toBe(true);
 expect(await page.evaluate(()=>(window as any).__chairProbe.errors)).toEqual([]);
});

test('unmount during PNG loading cancels the actor without a late bind or error',async({page})=>{
 await open(page);await probe(page);let requested=false,release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
 await page.route('**/__chair-pending/assets/*',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1)!;
  if(name==='head.png'){requested=true;await pending;}
  await route.fulfill({body:await readFile(`public/tail-chair/assets/${name}`),contentType:name.endsWith('.json')?'application/json':'image/png'}).catch(()=>{});
 });
 try{
  await page.evaluate(async()=>{const m=await import(/* @vite-ignore */'/tests/fixtures/chair-harness.tsx');m.mountHarness(false,'/__chair-pending/assets/');});
  await expect(page.locator('#chair-harness .tail-chair-mascot__poster')).toBeVisible();
  await expect.poll(()=>requested).toBe(true);
  await page.evaluate(()=>(window as any).__chairHarnessRoot.unmount());release();
  await expect.poll(()=>page.evaluate(()=>(window as any).__chairProbe.actors.filter((a:any)=>a.canvas!==document.querySelector('.ts-chair-scene canvas')).every((a:any)=>a.disposed&&a.cleanup.length===0&&Object.keys(a.images).length===0))).toBe(true);
  expect(await page.evaluate(()=>(window as any).__chairProbe.errors)).toEqual([]);
 }finally{release();}
});

for(const failure of ['manifest','layer','context'])test(`unavailable ${failure} retains the complete poster without crashing the homepage`,async({page})=>{
 await fixtures(page);
 if(failure==='context')await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(...args:any[]){if(this.classList.contains('tail-chair-mascot__canvas'))return null;return (get as any).apply(this,args); } as any;});
 else await page.route(`**/tail-chair/assets/${failure==='manifest'?'manifest.json':'head.png'}`,route=>route.fulfill({status:503,body:'Unavailable fixture'}));
 await page.goto('/');const actor=page.locator('.ts-chair-scene .tail-chair-mascot');await expect(actor).toHaveAttribute('data-error','true');
 const poster=actor.locator('img');await expect(poster).toBeVisible();await expect.poll(()=>poster.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth===900)).toBe(true);
 await expect(page.locator('.ts-hero-copy h1')).toBeVisible();await expect(actor.getByRole('button')).toHaveCount(0);
});

test.describe('mobile chair',()=>{
 test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 test('touch gestures and vertical scroll keep the original proportions without page overflow',async({page})=>{
  await open(page);await probe(page);const canvas=page.locator('.ts-chair-scene canvas');await canvas.scrollIntoViewIfNeeded();
  const b=(await canvas.boundingBox())!;expect(b.width/b.height).toBeCloseTo(900/780,2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(canvas).toHaveCSS('touch-action','pan-y');await page.touchscreen.tap(b.x+b.width*.6,b.y+b.height*.4);await expect.poll(async()=>(await snapshot(page)).state).toBe('waving');
  for(let i=0;i<3;i++)await page.touchscreen.tap(b.x+b.width*.6,b.y+b.height*.4);await expect.poll(async()=>(await snapshot(page)).state).toBe('delighted');
  await page.screenshot({path:'artifacts/tail-chair/mobile.png',fullPage:true});
 });
});
