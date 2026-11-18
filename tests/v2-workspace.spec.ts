import { test, expect, type Page } from '@playwright/test';
import { fixtures, mint, wallet, errors } from './support';

async function studio(page: Page, selected = false) {
  await fixtures(page);
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.goto('/terminal');
  await page.evaluate(async ({ selected, mint }) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const [r, d, module, preferences, resolver] = await Promise.all([load('/node_modules/.vite/deps/react.js'), load('/node_modules/.vite/deps/react-dom_client.js'), load('/src/features/v2/workspace/WorkspaceStudio.tsx'), load('/src/features/preferences/preferences.tsx'), load('/src/features/v2/workspace/tokenContext.ts')]);
    const React = r.default ?? r, dom = d.default ?? d;
    const initial = selected ? await resolver.resolveStudioToken(mint) : null;
    function Harness() {
      const [coin, setCoin] = React.useState(initial);
      (window as any).__studioSelect = async (next: string) => setCoin(await resolver.resolveStudioToken(next));
      return React.createElement(preferences.PreferencesProvider, null, React.createElement(module.WorkspaceStudio, { coin, selectMint: (next: string) => { (window as any).__selectedStudioMint = next; void (window as any).__studioSelect(next); }, wallet: '' }));
    }
    const el = document.createElement('div'); el.id = 'workspace-studio-fixture'; document.body.appendChild(el);
    dom.createRoot(el).render(React.createElement(Harness));
  }, { selected, mint });
  return page.locator('#workspace-studio-fixture');
}
test.afterEach(async ({ page }) => expect(errors.get(page) ?? []).toEqual([]));

test('Studio stays opt-in and empty, supports eight real instances and preserves pin/hide/size/move state', async ({ page }) => {
  const ui = await studio(page);
  await expect(ui.locator('.studio-instance')).toHaveCount(2);
  await expect(ui.locator('.chart-native')).toHaveCount(0);
  await expect(ui).toContainText('No candles are generated');
  const first = ui.locator('.studio-instance').first();
  const firstId = await first.getAttribute('data-instance-id');
  await first.locator('summary').first().click();
  await first.getByRole('slider', { name: 'Widget height 1' }).fill('800');
  await expect(first).toHaveCSS('height', '800px');
  await first.getByRole('combobox', { name: 'Widget width 1' }).selectOption('2');
  await first.getByRole('button', { name: 'Pin', exact: true }).click();
  await expect(first.getByRole('button', { name: 'Hide', exact: true })).toBeDisabled();
  await expect(first.getByRole('combobox', { name: 'Widget width 1' })).toBeDisabled();
  await first.getByRole('button', { name: 'Unpin', exact: true }).click();
  await first.focus(); await page.keyboard.press('Alt+ArrowDown');
  await expect(ui.locator('.studio-instance').nth(1)).toHaveAttribute('data-instance-id', firstId!);
  const moved = ui.locator(`[data-instance-id="${firstId}"]`);
  await moved.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(ui.locator('.studio-instance')).toHaveCount(1);
  await ui.getByRole('navigation', { name: 'Hidden Studio widgets' }).getByRole('button').click();
  await expect(ui.locator('.studio-instance')).toHaveCount(2);
  await expect(ui.locator(`[data-instance-id="${firstId}"]`)).toHaveCSS('height', '800px');
  for (let i = 0; i < 6; i++) await ui.getByRole('button', { name: 'Add widget instance', exact: true }).click();
  await expect(ui.getByRole('button', { name: 'Add widget instance', exact: true })).toBeDisabled();
  await expect(ui.locator('.studio-instance')).toHaveCount(8);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tail.v2.workspace-studio')!).layout.cards.length)).toBe(8);
  await studio(page);
  await expect(page.locator('#workspace-studio-fixture .studio-instance')).toHaveCount(8);
});

test('independent tokens and shared groups load real source charts/evidence without replacing main selection', async ({ page }) => {
  const ui = await studio(page, true);
  await expect(ui.locator('.sol-chart')).toHaveAttribute('data-candle-count', '40');
  await expect(ui.getByRole('region', { name: 'Market source evidence' })).toContainText('DexScreener');
  await expect(ui.getByRole('region', { name: 'Market source evidence' })).toContainText('Volume 24h');
  const chart = ui.locator('.studio-instance').first();
  await chart.locator('summary').first().click();
  await chart.getByRole('combobox', { name: 'Token context 1' }).selectOption('A');
  await expect(chart.locator('.chart-native')).toHaveCount(0);
  await ui.locator('.studio-groups summary').click();
  await ui.getByRole('textbox', { name: 'Group A token', exact: true }).fill(mint);
  await ui.locator('.studio-groups .studio-token-picker').first().getByRole('button', { name: 'Search tokens', exact: true }).click();
  await ui.getByRole('list', { name: 'Group A token results' }).getByRole('button').first().click();
  await expect(chart.locator('.sol-chart')).toHaveAttribute('data-candle-count', '40');
  await expect(chart).toHaveAttribute('data-token-scope', 'A');
  await chart.getByRole('combobox', { name: 'Token context 1' }).selectOption('independent');
  await expect(chart.locator('.chart-native')).toHaveCount(0);
  await chart.getByRole('textbox', { name: 'Independent token 1' }).fill(mint);
  await chart.locator('.studio-token-picker').getByRole('button', { name: 'Search tokens', exact: true }).click();
  await chart.getByRole('list', { name: 'Independent token 1 results' }).getByRole('button').first().click();
  await expect(chart.locator('.sol-chart')).toHaveAttribute('data-candle-count', '40');
  expect(await page.evaluate(() => (window as any).__selectedStudioMint)).toBeUndefined();
  await chart.getByRole('button', { name: 'Use token in terminal', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__selectedStudioMint)).toBe(mint);
  await chart.getByRole('button', { name: 'Maximize', exact: true }).click();
  await expect(chart).toHaveClass(/studio-maximized/); await page.keyboard.press('Escape');
  await expect(chart).not.toHaveClass(/studio-maximized/);
});

test('Studio presets/import/export, drag reorder, quote-only routes and mobile controls work', async ({ page }) => {
  const ui = await studio(page, true);
  await ui.locator('.studio-presets summary').click();
  await ui.getByRole('button', { name: 'Scalping', exact: true }).click();
  await expect(ui.locator('.studio-instance')).toHaveCount(4);
  await expect(ui).toContainText('Get read-only route');
  await expect(ui).toContainText('Execution remains disabled');
  const before = await ui.locator('.studio-instance').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-instance-id')));
  await ui.locator('.studio-instance').first().getByRole('button', { name: /Drag Chart instance/ }).dragTo(ui.locator('.studio-instance').nth(1).locator('.studio-instance-header'));
  const after = await ui.locator('.studio-instance').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-instance-id')));
  expect(after).not.toEqual(before);
  await ui.getByRole('textbox', { name: 'Studio preset name' }).fill('Source research');
  await ui.getByRole('button', { name: 'Save Studio preset', exact: true }).click();
  await expect(ui).toContainText('Studio preset saved locally.');
  const download = page.waitForEvent('download'); await ui.getByRole('button', { name: 'Export Studio', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('tail-workspace-studio.json');
  await ui.getByRole('button', { name: 'Reset Studio', exact: true }).click();
  await expect(ui.locator('.studio-instance')).toHaveCount(2);
  await ui.getByRole('button', { name: 'Source research', exact: true }).click();
  await expect(ui.locator('.studio-instance')).toHaveCount(4);
  await ui.getByLabel('Import Studio file', { exact: true }).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"layout":{"cards":[{"kind":"sign_transaction"}]},"presets":[]}') });
  await expect(ui).toContainText('Workspace import must use version 1');
  const saved = await page.evaluate(() => localStorage.getItem('tail.v2.workspace-studio')!);
  await ui.getByRole('button', { name: 'Reset Studio', exact: true }).click();
  await ui.getByLabel('Import Studio file', { exact: true }).setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
  await expect(ui.locator('.studio-instance')).toHaveCount(4);
  await expect(ui).toContainText('Validated Studio imported.');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await ui.evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
  await ui.screenshot({ path: '/private/tmp/tail-v2-workspace-mobile.png' });
});

test('Studio embeds Discovery, Wallet Intelligence and existing Fable without automatic AI calls', async ({ page }) => {
  let paidCalls = 0;
  page.on('request', request => { if (request.method() === 'POST' && /\/(astra|ai)\/(chat|scenario|stream)(?:[/?]|$)/.test(request.url())) paidCalls++; });
  const ui = await studio(page, true);
  await ui.getByRole('combobox', { name: 'Studio widget type' }).selectOption('discovery');
  await ui.getByRole('button', { name: 'Add widget instance' }).click();
  const discovery = ui.locator('[data-widget-kind=discovery]');
  await expect(discovery.getByRole('region', { name: 'Advanced token discovery' })).toBeVisible();
  await expect(discovery).toContainText('Trending');
  await ui.getByRole('combobox', { name: 'Studio widget type' }).selectOption('intelligence');
  await ui.getByRole('button', { name: 'Add widget instance' }).click();
  const intelligence = ui.locator('[data-widget-kind=intelligence]');
  await expect(intelligence.getByRole('region', { name: 'TAIL Wallet and Token Intelligence' })).toBeVisible();
  await intelligence.getByRole('textbox', { name: 'Track public wallet address' }).fill(wallet);
  await intelligence.getByRole('textbox', { name: 'New wallet label' }).fill('Studio public wallet');
  await intelligence.getByRole('button', { name: 'Track wallet', exact: true }).click();
  await expect(intelligence.getByRole('textbox', { name: `Wallet name ${wallet}` })).toHaveValue('Studio public wallet');
  await intelligence.getByRole('navigation', { name: 'Intelligence views' }).getByRole('button', { name: 'Portfolio', exact: true }).click();
  await intelligence.getByRole('button', { name: 'Refresh evidence', exact: true }).click();
  await expect(intelligence).toContainText('Known priced subtotal');
  await expect(intelligence).toContainText('Cost basis / realized / unrealized PnL');
  await ui.getByRole('combobox', { name: 'Studio widget type' }).selectOption('fable');
  await ui.getByRole('button', { name: 'Add widget instance' }).click();
  const fable = ui.locator('[data-widget-kind=fable]');
  await expect(fable.getByRole('textbox', { name: 'Ask Fable 5.2', exact: true })).toBeVisible();
  await expect(fable.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  expect(paidCalls).toBe(0);
  await ui.getByRole('combobox', { name: 'Studio widget type' }).selectOption('chart');
  await ui.getByRole('button', { name: 'Add widget instance' }).click();
  await expect(ui.locator('.sol-chart')).toHaveCount(2);
  const streams = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    return (await load('/src/lib/poolStream.ts')).poolStreamDiagnostics();
  });
  expect(streams).toHaveLength(1);
  expect(streams[0].subscribers).toBe(2);
});

test('missing market fields stay unavailable and failed refresh keeps source timestamps', async ({ page }) => {
  const ui = await studio(page, true);
  const evidence = ui.getByRole('region', { name: 'Market source evidence' });
  await expect(evidence).toContainText('DexScreener');
  await expect(evidence.getByText('Volume 5m', { exact: true }).locator('..')).toContainText('Unavailable');
  const time = await evidence.locator('p').filter({ hasText: /^Fetched / }).textContent();
  await page.route('**/dex/token-pairs/v1/solana/**', route => route.fulfill({ status: 429, json: { error: 'Fixture source rate limit' } }));
  await evidence.getByRole('button', { name: 'Refresh market evidence' }).click();
  await expect(evidence).toContainText('Market source unavailable.');
  await expect(evidence).toContainText('stale');
  expect(await evidence.locator('p').filter({ hasText: /^Fetched / }).textContent()).toBe(time);
});
