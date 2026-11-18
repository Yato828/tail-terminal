import { test, expect } from "@playwright/test";
import { fixtures, mint, pool, errors } from "./support";
test.afterEach(async ({ page }) => expect(errors.get(page) ?? []).toEqual([]));
test("mascot roles differ across the homepage, transitions and terminal", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/");
  await expect(page.locator(".ts-chair-scene .tail-chair-mascot")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator(".ts-chair-scene canvas")).toHaveAttribute('role','button');
  await expect(page.locator(".ts-hero-art .tail-mascot")).toHaveCount(0);
  await expect(page.locator(".ts-star-skiff")).toHaveCount(0);
  await expect(page.locator(".ts-planet")).toHaveCount(0);
  await expect(page.locator(".ts-live-start canvas")).toHaveCount(0);
  const poster = page.locator(".ts-pocket-companion");
  await expect(poster).toHaveAttribute("src", /posters\/sleep\.png$/);
  await poster.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      poster.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .locator(".ts-nav")
    .getByRole("link", { name: "Open terminal" })
    .click();
  await expect(page.locator(".tail-terminal-route:not([inert])")).toBeVisible();
  await expect(
    page.locator(".fable-heading [data-renderer=tail-2d]"),
  ).toHaveAttribute("data-state", "idle");
});
test("the headline has no trailing dot and the Home star flies along its orbit and returns", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/");
  await expect(page.locator(".ts-hero h1 em")).toHaveText("instinct");
  const logo = page.locator(".ts-nav .tail-logo"),
    star = logo.locator(".logo-star");
  const initial = (await star.boundingBox())!;
  await logo.hover();
  await expect
    .poll(async () => {
      const box = (await star.boundingBox())!;
      return Math.hypot(box.x - initial.x, box.y - initial.y);
    })
    .toBeGreaterThan(25);
  await page.mouse.move(900, 200);
  await expect
    .poll(async () => {
      const box = (await star.boundingBox())!;
      return Math.hypot(box.x - initial.x, box.y - initial.y);
    })
    .toBeLessThan(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await logo.hover();
  await page.waitForTimeout(250);
  const quiet = (await star.boundingBox())!;
  expect(Math.hypot(quiet.x - initial.x, quiet.y - initial.y)).toBeLessThan(1);
});
test("welcome waits for the actual terminal and the reverse transition survives a missing animation asset", async ({
  page,
}) => {
  await fixtures(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    /\/(?:src\/features\/tail\/TailApp\.tsx|assets\/TailApp-[^/]+\.js)(?:\?.*)?$/,
    async (route) => {
      await pending;
      await route.continue();
    },
  );
  await page.route("**/hero/signal/transition.gif", (route) => route.abort());
  try {
    await page.goto("/");
    await page
      .locator(".ts-nav")
      .getByRole("link", { name: "Open terminal" })
      .click();
    const welcome = page.getByRole("status", {
      name: "Opening terminal",
      exact: true,
    });
    await expect(welcome).toBeVisible();
    await expect(welcome).toHaveAttribute("data-phase", "hold");
    await expect(welcome.locator(".tail-mascot canvas")).toBeVisible();
    const scene = await welcome.locator(".tail-transition-scene").boundingBox();
    const mascot = await welcome.locator(".tail-mascot").boundingBox();
    expect(mascot!.width).toBeGreaterThan(scene!.width * 0.75);
    await expect(welcome.locator("img")).toHaveAttribute(
      "src",
      "/hero/signal/transition-poster.png",
    );
    await page.waitForTimeout(1450);
    await expect(welcome).toHaveAttribute("data-phase", "hold");
    await expect(page.locator(".tail-terminal-route")).toHaveAttribute(
      "inert",
      "",
    );
    await welcome.screenshot({ path: "artifacts/site-polish/welcome.png" });
    release();
    await expect(welcome).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: "Search Solana tokens" }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "TAIL terminal", exact: true })
      .click();
    const returning = page.getByRole("status", {
      name: "Returning home",
      exact: true,
    });
    await expect(returning).toBeVisible();
    await expect(returning).toContainText("Back home.");
    await expect(returning).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { name: /Follow your instinct/ }),
    ).toBeVisible();
  } finally {
    release();
  }
});

test("direct terminal entry preserves the mint and pool and keeps provider setup details out of Fable", async ({
  page,
}) => {
  await fixtures(page);
  const link = `/terminal?mint=${mint}&pool=${pool}`;
  await page.goto(link);
  await expect(
    page.getByRole("status", { name: "Opening terminal", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Opening terminal", exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${mint}&pool=${pool}$`));
  await expect(page.locator(".chart-native canvas").first()).toBeVisible();
  await expect(page.locator(".fable-panel")).toContainText(
    "Fable 5.2 needs its server connection configured.",
  );
  await expect(page.getByRole("textbox", { name: "Ask Fable 5.2", exact: true })).toBeEditable();
  await expect(page.locator(".fable-panel")).not.toContainText(
    /OpenAI|ChatGPT|API_KEY|product name/i,
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Workspace settings" });
  await expect(settings).toContainText("Fable 5.2 is not connected yet. The workspace owner needs to finish setup.");
  await expect(settings).not.toContainText(
    /OpenAI|ChatGPT|API_KEY|product name/i,
  );
});

test("browser Forward during the return animation restores the terminal without getting stuck", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/");
  await page
    .locator(".ts-nav")
    .getByRole("link", { name: "Open terminal" })
    .click();
  await expect(page.locator(".tail-terminal-route:not([inert])")).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.goBack();
  await expect(
    page.getByRole("status", { name: "Returning home", exact: true }),
  ).toHaveAttribute("data-phase", "cover");
  await page.goForward();
  await expect(
    page.getByRole("status", { name: "Opening terminal", exact: true }),
  ).toBeVisible();
  await page.clock.resume();
  await expect(page.locator(".tail-terminal-route:not([inert])")).toBeVisible();
  await expect(page).toHaveURL(/\/terminal$/);
  await page.getByRole("textbox", { name: "Search Solana tokens" }).fill(mint);
  await expect(page.locator(".search-results button").first()).toBeVisible();
});
test("TAIL landing downloads a real ZIP and makes no market requests until the terminal opens", async ({
  page,
}) => {
  await fixtures(page);
  const calls: string[] = [];
  page.on("request", (r) => {
    if (/\/(tail-api|dex|rpc|candle|jupiter)\b/.test(new URL(r.url()).pathname))
      calls.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Follow your instinct/ }),
  ).toBeVisible();
  await expect(page.locator(".chart-native")).toHaveCount(0);
  expect(calls).toEqual([]);
  const button = page.getByRole("button", {
    name: "Get the extension",
    exact: true,
  });
  await button.click();
  const dialog = page.getByRole("dialog", { name: "Take TAIL with you." });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close installation" }),
  ).toBeFocused();
  const download = page.waitForEvent("download");
  await dialog.getByRole("link", { name: /Download extension ZIP/ }).click();
  expect((await download).suggestedFilename()).toBe("tail-extension.zip");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
});
test("the website embeds the real searchable terminal and stops it when the preview closes", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Start exploring" }).click();
  const frame = page.frameLocator('iframe[title="Interactive TAIL terminal"]');
  await expect(
    frame.getByRole("textbox", { name: "Search Solana tokens" }),
  ).toBeVisible();
  await expect(frame.locator(".chart-native")).toHaveCount(0);
  await frame.getByRole("textbox", { name: "Search Solana tokens" }).fill(mint);
  await frame
    .locator(".search-results button")
    .filter({ hasText: "USDC" })
    .first()
    .click();
  await expect(frame.locator(".chart-native canvas").first()).toBeVisible();
  await expect(frame.locator(".sol-chart")).toHaveAttribute(
    "data-candle-count",
    "40",
  );
  await frame.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(frame.getByRole("dialog")).toBeVisible();
  await frame.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: "Close preview ×" }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
});
test("full terminal routes, browser back and the TAIL sphere round trip preserve a usable home", async ({
  page,
}) => {
  await fixtures(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .locator(".ts-nav")
    .getByRole("link", { name: "Open terminal" })
    .click();
  await expect(page).toHaveURL(/\/terminal$/);
  await expect(
    page.getByRole("textbox", { name: "Search Solana tokens" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Opening terminal", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "TAIL terminal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Follow your instinct/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Returning home", exact: true }),
  ).toHaveCount(0);
  await page.goBack();
  await expect(
    page.getByRole("textbox", { name: "Search Solana tokens" }),
  ).toBeVisible();
});
test("the presentation stays within mobile screens and its navigation and installation are usable", async ({
  page,
}) => {
  await fixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Site navigation" })
    .getByRole("link", { name: "Extension", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Site navigation" }),
  ).toBeHidden();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Download TAIL", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

test("Info explains the product, setup and installation with keyboard tabs and restored focus", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/");
  const info = page.getByRole("button", { name: "Info", exact: true });
  for (const name of ["Telegram", "Pump.fun", "X / Twitter"])
    await expect(
      page.getByRole("button", { name: `${name} · coming soon`, exact: true }),
    ).toBeDisabled();
  await info.click();
  const guide = page.getByRole("dialog", { name: "Meet your workspace." });
  await expect(guide).toBeVisible();
  await expect(
    guide.getByRole("button", { name: "Close Info", exact: true }),
  ).toBeFocused();
  await expect(guide.getByRole("tabpanel")).toContainText("Solana mainnet");
  await guide.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    guide.getByRole("tab", { name: "Setup", exact: true }),
  ).toBeFocused();
  await expect(guide.getByRole("tabpanel")).toContainText("Customize");
  await page.keyboard.press("End");
  await expect(
    guide.getByRole("tab", { name: "Install", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    guide.getByRole("link", { name: "Download extension ZIP", exact: true }),
  ).toHaveAttribute("href", "/tail-extension.zip");
  await expect(guide.getByRole("tabpanel")).toContainText(
    "chrome://extensions",
  );
  await page.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);
  await expect(info).toBeFocused();
});

test("Info remains usable in the mobile menu and terminal header without closing a background panel", async ({
  page,
}) => {
  await fixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Telegram · coming soon", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Info", exact: true }).click();
  await page.getByRole("tab", { name: "Install", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "Meet your workspace." });
  const box = await guide.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Close Info", exact: true }).click();
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Workspace settings" });
  await expect(settings).toBeVisible();
  await page.getByRole("button", { name: "Info", exact: true }).click();
  await expect(guide).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);
  await expect(settings).toBeVisible();
});
