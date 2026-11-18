import {chromium,expect} from "@playwright/test";
import {readdir,readFile,writeFile} from "node:fs/promises";
const browser=await chromium.launch({channel:"chrome"});
try {
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  const base="http://127.0.0.1:4668";
  const files=(await readdir("public/tail-mascot/assets/rig")).filter(n=>n.endsWith(".png"));
  for(const file of files){
    const r=await page.request.get(`${base}/tail-mascot/assets/rig/${file}`);
    expect(r.status()).toBe(200);
    expect(await r.body()).toEqual(await readFile(`public/tail-mascot/assets/rig/${file}`));
  }
  await page.goto(base);
  await expect(page.locator(".ts-hero-mascot")).toHaveAttribute("data-ready","true");
  await page.locator(".ts-nav").getByRole("link",{name:"Open terminal"}).click();
  await expect(page.locator(".tail-terminal-route:not([inert])")).toBeVisible();
  await expect(page.locator(".fable-heading [data-renderer=tail-2d]")).toHaveAttribute("data-ready","true");
  await page.getByRole("button",{name:"TAIL terminal",exact:true}).click();
  await expect(page.getByRole("heading",{name:/Follow your instinct/})).toBeVisible();
  const download=await page.request.get(`${base}/tail-extension.zip`);
  expect(await download.body()).toEqual(await readFile("public/tail-extension.zip"));
  await page.goto("http://localhost:4664/artifacts/tail-2d/TAIL_2D_TERMINAL.webm");
  await expect.poll(()=>page.locator("video").evaluate(v=>v.readyState)).toBeGreaterThan(0);
  const duration=await page.locator("video").evaluate(v=>v.duration);
  expect(duration).toBeGreaterThan(20);
  await page.locator("video").evaluate(v=>new Promise(resolve=>{v.pause();v.addEventListener("seeked",resolve,{once:true});v.currentTime=16;}));
  await page.screenshot({path:"artifacts/tail-2d/video-frame.png"});
  expect(errors).toEqual([]);
  const result={PNG:files.length,PNGStatus:200,artworkMatches:true,builtRuntimeReady:true,roundTrip:true,zipMatches:true,videoDurationSeconds:duration,videoDecodes:true,errors};
  await writeFile("artifacts/tail-2d/preview.json",JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {await browser.close();}
