import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const out = "artifacts/render-quality";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({
    viewport: { width: 1360, height: 760 },
    deviceScaleFactor: 2,
  });
  await page.route("**/__render-quality", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<html><body style="margin:20px;background:#151212;color:#f6eee6;font:18px Arial;display:flex;gap:20px"><div>Before<canvas id="before" style="display:block;width:640px;height:640px"></canvas></div><div>After<canvas id="after" style="display:block;width:640px;height:640px"></canvas></div></body></html>',
    }),
  );
  await page.goto("http://localhost:4665/__render-quality");
  const result = await page.evaluate(async () => {
    const {
      TailRenderer: After,
      loadRig,
      LAYERS,
    } = await import("/src/mascot/runtime/renderer.mjs");
    const { TailRenderer: Before } = await import(
      "/artifacts/render-quality/before/renderer.mjs"
    );
    const { neutralPose, samplePose } = await import(
      "/src/mascot/runtime/motion-core.mjs"
    );
    const images = await loadRig(new URL("/tail-mascot/", location.href));
    const before = new Before(document.getElementById("before"), images),
      after = new After(document.getElementById("after"), images);
    before.resize(640, 640, 2);
    after.resize(640, 640, 2);
    const pose = samplePose("idle", 0.4);
    before.render(pose, 0.4);
    after.render(pose, 0.4);
    const textures = Object.fromEntries(
      LAYERS.map((name) => {
        const c = document.createElement("canvas");
        c.width = c.height = 320;
        return [name, c];
      }),
    );
    for (const [name, x, y, w, h] of [
      ["body", 96, 182, 128, 98],
      ["eye-0", 134, 119, 28, 38],
      ["eye-1", 183, 119, 26, 38],
    ]) {
      const ctx = textures[name].getContext("2d");
      ctx.fillStyle = "rgba(245,234,220,.75)";
      ctx.fillRect(x, y, w, h);
    }
    function measure(Renderer, side, dpr) {
      const canvas = document.createElement("canvas"),
        renderer = new Renderer(canvas, textures),
        p = neutralPose();
      p.bodySY = 1.013;
      p.bodySX = 1.003;
      p.head = 0.37;
      renderer.resize(side, side, dpr);
      renderer.render(p, 0.7);
      const ctx = canvas.getContext("2d"),
        k = canvas.width / 320;
      const sample = (x, y) =>
        ctx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data[3];
      const body = Array.from({ length: 50 }, (_, i) => sample(180, 212 + i));
      const eyes = Array.from({ length: 13 }, (_, i) => sample(142 + i, 140));
      const result = {
        side,
        dpr,
        bodyStripeContrast: Math.max(...body) - Math.min(...body),
        eyeStripeContrast: Math.max(...eyes) - Math.min(...eyes),
      };
      renderer.destroy();
      return result;
    }
    return {
      before: [1, 1.25, 2, 3].flatMap((dpr) =>
        [128, 384].map((side) => measure(Before, side, dpr)),
      ),
      after: [1, 1.25, 2, 3].flatMap((dpr) =>
        [128, 384].map((side) => measure(After, side, dpr)),
      ),
    };
  });
  await page.screenshot({ path: `${out}/before-after.png` });
  await page
    .locator("#after")
    .screenshot({ path: `${out}/mascot-large-clean.png` });
  await writeFile(`${out}/sampling.json`, JSON.stringify(result, null, 2));
  for (const sample of result.after) {
    expect(sample.bodyStripeContrast).toBeLessThan(3);
    expect(sample.eyeStripeContrast).toBeLessThan(3);
  }
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
