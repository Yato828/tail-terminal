import { test, expect, type Page } from "@playwright/test";
import { fixtures, mint } from "./support";
const actor = (page: Page) =>
  page.locator(".fable-heading [data-renderer=tail-2d]");
test("the floating homepage pose leaves source poses and terminal pixels unchanged", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { probe } = await import("/tests/fixtures/pose-isolation.mjs");
    return probe();
  });
  expect(result.changedPose).toBe(false);
  expect(result.shadowAlpha).toBe(0);
  expect(result.terminalIdentical).toBe(true);
});
test("fractional scaling keeps continuous alpha across cloak rows and eye columns", async ({
  page,
}) => {
  await page.goto("/");
  const samples = await page.evaluate(async () => {
    const { probe } = await import("/tests/fixtures/renderer-probe.mjs");
    return probe();
  });
  for (const sample of samples) {
    expect(sample.body).toBeLessThan(3);
    expect(sample.eyes).toBeLessThan(3);
    expect(sample.released).toBe(true);
  }
});
async function terminal(page: Page) {
  await fixtures(page);
  await page.route("**/api/astra/status", (r) =>
    r.fulfill({
      json: {
        configured: true,
        ready: true,
        model: "test-fixture",
        rateLimit: "local",
      },
    }),
  );
  await page.goto("/terminal");
  await expect(page.locator(".tail-terminal-route:not([inert])")).toBeVisible();
  await expect(actor(page)).toHaveAttribute("data-ready", "true");
}
test("terminal uses the supplied PNG runtime at 128px and real request lifecycles survive cancellation and errors", async ({
  page,
}) => {
  await terminal(page);
  const mascot = actor(page),
    canvas = mascot.locator("canvas");
  await expect(mascot).toHaveCSS("width", "128px");
  await expect(mascot).toHaveCSS("height", "128px");
  await canvas.evaluate((el) => el.setAttribute("data-same-canvas", "yes"));
  const search = page.getByRole("textbox", { name: "Search Solana tokens" });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/dex/latest/dex/search**", async (r) => {
    await gate;
    await r.fallback();
  });
  await search.fill("SOL");
  await expect(mascot).toHaveAttribute("data-state", "searching");
  await search.fill("");
  await expect(mascot).not.toHaveAttribute("data-state", "searching");
  release();
  await search.fill(mint);
  await page.locator(".search-results button").first().click();
  await expect(page.locator(".chart-native canvas").first()).toBeVisible();
  let finish!: () => void;
  const response = new Promise<void>((resolve) => (finish = resolve));
  await page.route("**/api/astra/chat", async (r) => {
    await response;
    await r.fulfill({
      json: {
        text: "Local test fixture. No AI provider was called.",
        model: "test-fixture",
        at: Date.now(),
        sources: [],
      },
    });
  });
  const input = page.getByRole("textbox", {
    name: "Ask Fable 5.2",
    exact: true,
  });
  await input.fill("Check the current token");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(mascot).toHaveAttribute("data-state", "thinking");
  await canvas.click({ clickCount: 5, delay: 60 });
  await expect(mascot).toHaveAttribute("data-state", "thinking");
  finish();
  await expect(mascot).toHaveAttribute("data-state", "success");
  await expect(mascot).toHaveAttribute("data-state", "idle", { timeout: 6000 });
  await page.route("**/api/astra/chat", (r) =>
    r.fulfill({ status: 503, json: { error: "Provider key unavailable" } }),
  );
  await input.fill("Test an unavailable request");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(mascot).toHaveAttribute("data-state", "error");
  await expect(page.getByRole("alert")).toContainText(
    "Fable 5.2 is currently unavailable",
  );
  await expect(canvas).toHaveAttribute("data-same-canvas", "yes");
});
test("the runtime owns tap, tickle and five-click secret reactions", async ({
  page,
}) => {
  await terminal(page);
  const mascot = actor(page),
    canvas = mascot.locator("canvas");
  await expect(mascot).toHaveAttribute("data-state", "idle", { timeout: 6000 });
  await canvas.click();
  await expect(mascot).toHaveAttribute("data-state", "tap");
  await canvas.click();
  await expect(mascot).toHaveAttribute("data-state", "tickle");
  await canvas.click({ clickCount: 3, delay: 70 });
  await expect(mascot).toHaveAttribute("data-state", "secret");
  await canvas.click({ clickCount: 5, delay: 60 });
  await expect(mascot).not.toHaveAttribute("data-state", "secret");
  await expect(mascot).toHaveAttribute("data-state", "idle", { timeout: 6000 });
});
async function harness(page: Page) {
  await page.route("**/__tail-mascot-qa", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<html><div id="qa-root"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type;
        window.__vite_plugin_react_preamble_installed__=true;
      </script><script type="module" src="/tests/fixtures/mascot-harness.tsx"></script></html>`,
    }),
  );
  await page.goto("/__tail-mascot-qa");
}
test("StrictMode preserves one canvas through rapid state/reduced-motion changes and frees every ImageBitmap", async ({
  page,
}) => {
  await harness(page);
  const mascot = page.locator("[data-renderer=tail-2d]");
  await expect(mascot).toHaveAttribute("data-ready", "true");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page
    .locator("canvas")
    .evaluate((el) => el.setAttribute("data-identity", "original"));
  for (const state of [
    "thinking",
    "analyzing",
    "success",
    "idle",
    "warning",
    "error",
    "sleep",
    "wake",
    "loading",
    "secret",
    "idle",
  ]) {
    await page.evaluate((state) => (window as any).mascotQA.pose(state), state);
    await expect(mascot).toHaveAttribute("data-state", state);
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-identity",
      "original",
    );
  }
  await page.evaluate(() => (window as any).mascotQA.reduce(true));
  await expect
    .poll(() => page.evaluate(() => (window as any).mascotQA.pending.size))
    .toBe(0);
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-identity",
    "original",
  );
  await page.evaluate(() => (window as any).mascotQA.reduce(false));
  await expect
    .poll(() => page.evaluate(() => (window as any).mascotQA.actor.frameCount))
    .toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => page.evaluate(() => (window as any).mascotQA.pending.size))
    .toBe(0);
  await page.evaluate(() => (window as any).mascotQA.mount(false));
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const q = (window as any).mascotQA;
        return q.created - q.closed;
      }),
    )
    .toBe(0);
  expect(await page.evaluate(() => (window as any).mascotQA.pending.size)).toBe(
    0,
  );
  expect(
    await page.evaluate(
      () => (window as any).mascotQA.actor.renderer.surfaces.length,
    ),
  ).toBe(0);
  expect(await page.evaluate(() => (window as any).mascotQA.errors)).toEqual(
    [],
  );
});
test("hidden tabs and offscreen actors stop RAF, then resume and wake on real activity", async ({
  page,
}) => {
  await harness(page);
  await expect(page.locator("[data-renderer=tail-2d]")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).mascotQA.pending.size))
    .toBe(0);
  const before = await page.evaluate(
    () => (window as any).mascotQA.actor.frameCount,
  );
  await page.waitForTimeout(120);
  expect(
    await page.evaluate(() => (window as any).mascotQA.actor.frameCount),
  ).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).mascotQA.actor.frameCount))
    .toBeGreaterThan(before);
  await page.evaluate(() => {
    document.getElementById("host")!.style.marginTop = "2000px";
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).mascotQA.pending.size))
    .toBe(0);
  await page.evaluate(() => {
    document.getElementById("host")!.style.marginTop = "0";
    (window as any).mascotQA.actor.options.autoSleepMs = 1;
  });
  await expect(page.locator("[data-renderer=tail-2d]")).toHaveAttribute(
    "data-state",
    "sleep",
  );
  await page.keyboard.press("a");
  await expect(page.locator("[data-renderer=tail-2d]")).toHaveAttribute(
    "data-state",
    "wake",
  );
});
test("unmounting during a pending PNG request aborts loading and closes partial ImageBitmaps", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/tail-mascot/assets/rig/body.png", async (route) => {
    await held;
    await route.continue().catch(() => {});
  });
  try {
    await harness(page);
    await expect
      .poll(() => page.evaluate(() => (window as any).mascotQA?.created ?? 0))
      .toBeGreaterThan(1);
    await page.evaluate(() => (window as any).mascotQA.mount(false));
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const q = (window as any).mascotQA;
          return q.created - q.closed;
        }),
      )
      .toBe(0);
    expect(
      await page.evaluate(() => (window as any).mascotQA.pending.size),
    ).toBe(0);
    expect(await page.evaluate(() => (window as any).mascotQA.errors)).toEqual(
      [],
    );
  } finally {
    release();
  }
});

for (const failure of ["missing-layer", "no-context"]) {
  test(`layer failure (${failure}) preserves the poster, reports an error and releases decoded images`, async ({
    page,
  }) => {
    if (failure === "missing-layer")
      await page.route("**/tail-mascot/assets/rig/body.png", (r) =>
        r.fulfill({ status: 404, body: "Missing test layer" }),
      );
    else
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (
          kind: any,
          ...args: any[]
        ) {
          return this.classList.contains("tail-mascot-canvas")
            ? null
            : (original as any).call(this, kind, ...args);
        } as any;
      });
    await harness(page);
    await expect(page.getByRole("status")).toHaveText("Animation unavailable");
    await expect(
      page.getByRole("img", { name: "TAIL assistant", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const q = (window as any).mascotQA;
          return q.created - q.closed;
        }),
      )
      .toBe(0);
    expect(
      await page.evaluate(() => (window as any).mascotQA.pending.size),
    ).toBe(0);
  });
}
