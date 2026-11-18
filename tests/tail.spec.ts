import { test, expect, type Page } from "@playwright/test";
import { fixtures, mint, errors } from "./support";
async function readOnlyQuoteFixture(page: Page) {
  const observed = { calls: 0 };
  await page.route("**/jupiter/**", route => {
    observed.calls++;
    const url = new URL(route.request().url());
    return route.fulfill({ json: { inputMint: url.searchParams.get("inputMint"), outputMint: url.searchParams.get("outputMint"), inAmount: url.searchParams.get("amount"), outAmount: "1000000", router: "fixture", feeBps: 0, priceImpactPct: 0.1 } });
  });
  return observed;
}
async function expectReadOnlyQuote(page: Page) {
  await expect(page.locator(".quote-details")).toContainText("Jupiter");
  await expect(page.getByRole("status").filter({ hasText: "Quote only · transaction signing and execution are disabled." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect wallet to swap", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review & swap", exact: true })).toHaveCount(0);
}
test.afterEach(async ({ page }) => {
  expect(errors.get(page) ?? []).toEqual([]);
});
test("TAIL search → source chart adapter → read-only quote, Fable response and workspace persistence", async ({
  page,
}) => {
  await fixtures(page);
  await readOnlyQuoteFixture(page);
  await page.route("**/api/astra/status", (r) =>
    r.fulfill({
      json: {
        configured: true,
        ready: true,
        model: "fixture-model",
        rateLimit: "local",
      },
    }),
  );
  await page.goto("/terminal");
  await expect(page.locator(".tail-terminal-route:not([inert])")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Find your next market." }),
  ).toBeVisible();
  await expect(page.locator(".chart-native")).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "Search Solana tokens" }).fill(mint);
  await page
    .getByRole("region", { name: "Token search results" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.locator(".chart-native canvas").first()).toBeVisible();
  await expect(page.locator(".chart-bottom")).toContainText("Candle / Birdeye");
  await expect(page.locator(".sol-chart")).toHaveAttribute("data-history-scope", "token");
  await expect(page.locator(".sol-chart")).toHaveAttribute("data-volume-unit", "token");
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await expectReadOnlyQuote(page);
  await page.route("**/api/astra/chat", (r) =>
    r.fulfill({
      json: {
        text: "Source-backed response <script>never executed</script>",
        model: "fixture-model",
        at: Date.now(),
        sources: [],
      },
    }),
  );
  await page
    .getByRole("textbox", { name: "Ask Fable 5.2", exact: true })
    .fill("Explain this token");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("log")).toContainText(
    "Source-backed response <script>never executed</script>",
  );
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page
    .getByRole("button", { name: "Hide Smart Money", exact: true })
    .click();
  await expect(page.locator("[data-widget=smart]")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-widget=smart]")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Layout name", exact: true })
    .fill("My desk");
  await page.getByRole("button", { name: "Save as new workspace" }).click();
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Current workspace" }),
  ).toHaveValue(/.+/);
  await page.screenshot({
    path: "artifacts/tail/terminal-1440.png",
    fullPage: true,
  });
});
test("source failures stay explicit and empty", async ({ page }) => {
  await fixtures(page);
  await page.route("**/dex/**", (r) =>
    r.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/terminal");
  await expect(page.locator(".widget-trending [role=alert]")).toBeVisible({
    timeout: 25000,
  });
  await expect(page.locator(".chart-native")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Select a token", exact: true }),
  ).toBeDisabled();
});
test("responsive terminal has no horizontal overflow", async ({ page }) => {
  await fixtures(page);
  for (const width of [1672, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width === 1672 ? 941 : 900 });
    await page.goto("/terminal");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("heading", { name: "Find your next market." }),
    ).toBeVisible();
    await page.screenshot({
      path: `artifacts/tail/empty-${width}.png`,
      fullPage: true,
    });
  }
});

test("new terminal deep links, line mode, layout movement, pinning, resizing and appearance persist", async ({
  page,
}) => {
  await fixtures(page);
  await page.route("**/gecko/**/trades", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            attributes: {
              tx_hash: "4".repeat(88),
              tx_from_address: "So11111111111111111111111111111111111111112",
              kind: "buy",
              volume_in_usd: "10",
              from_token_amount: "0.1",
              to_token_amount: "10",
              price_from_in_usd: "100",
              price_to_in_usd: "1",
              block_timestamp: new Date().toISOString(),
              from_token_address: "So11111111111111111111111111111111111111112",
              to_token_address: mint,
            },
          },
        ],
      },
    }),
  );
  await page.goto(`/?mint=${mint}`);
  await expect(page.locator(".chart-native canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Line", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Candles", exact: true }).click();
  await page
    .getByRole("button", { name: "Recent pool trades", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: /observed pool trades/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").locator("tbody tr").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page
    .getByRole("button", { name: "Move Chart down", exact: true })
    .click();
  await expect(page.locator(".trade-column [data-widget=chart]")).toBeVisible();
  await page
    .getByRole("button", { name: "Move Chart up", exact: true })
    .click();
  await page.getByRole("button", { name: "Pin Chart", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Hide Chart", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Move Chart up", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Pin Chart", exact: true }).click();
  // Native vertical resize is observed and persisted, rather than a decorative handle.
  await page
    .locator("[data-widget=smart]")
    .evaluate((el) => ((el as HTMLElement).style.height = "240px"));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("tail.workspace.v1")!).layouts[0]
            .heights.smart,
      ),
    )
    .toBe(240);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Dark theme" })
    .selectOption("midnight");
  await dialog
    .getByLabel("Interface accent", { exact: true })
    .selectOption("#ff963b");
  await dialog
    .getByRole("button", { name: "Close panel", exact: true })
    .click();
  await expect(page.locator(".tail-app")).toHaveClass(/theme-midnight/);
  await page.reload();
  await expect(page.locator(".tail-app")).toHaveClass(/theme-midnight/);
  await expect
    .poll(() =>
      page
        .locator("[data-widget=smart]")
        .evaluate((el) => Math.round(el.getBoundingClientRect().height)),
    )
    .toBe(240);
  await expect(page.locator(".tail-app")).toHaveCSS("--accent", "#ff963b");
});

test("expired source quotes can refresh without enabling wallet execution", async ({
  page,
}) => {
  await fixtures(page);
  const quotes = await readOnlyQuoteFixture(page);
  await page.clock.install();
  await page.goto(`/?mint=${mint}`);
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await expectReadOnlyQuote(page);
  await page.clock.fastForward(46000);
  await expect(page.locator(".quote-details")).toContainText("Stale quote · refresh");
  const refresh = page.getByRole("button", { name: "Get quote", exact: true });
  await expect(refresh).toBeEnabled();
  await refresh.click();
  await expect.poll(() => quotes.calls).toBe(2);
  await expectReadOnlyQuote(page);
  await expect(page.locator(".quote-details")).not.toContainText("Stale quote");
});

test("logo stays transparent on hover while keyboard focus remains visible", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/terminal");
  await expect(page.locator(".tail-terminal-route:not([inert])")).toBeVisible();
  const logo = page.getByRole("button", { name: "TAIL terminal", exact: true });
  await expect(logo).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await logo.hover();
  await expect(logo).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(logo).toHaveCSS("box-shadow", "none");
  await page.keyboard.press("Tab");
  await expect(logo).toBeFocused();
  await expect(logo).toHaveCSS("outline-style", "solid");
});
