import { test, expect, type Page } from '@playwright/test';
import { fixtures, enter, choose, mint, pool, errors } from './support';
import { poolAccount } from './poolFixture';
import { WSOL } from '../src/lib/const';

test.afterEach(async ({ page }) => expect(errors.get(page) ?? []).toEqual([]));

test('source OHLC survives derived modes, indicators, interval persistence and range context', async ({ page }) => {
  await fixtures(page); await enter(page); await choose(page);
  const chart = page.locator('.sol-chart');
  await expect(chart).toHaveAttribute('data-candle-count', '40');
  const original = await chart.getAttribute('data-last-close');
  await page.locator('.chart-native').evaluate(el => el.setAttribute('data-stable-canvas', 'yes'));
  await chart.getByRole('button', { name: 'Area', exact: true }).click();
  await expect(chart).toHaveAttribute('data-chart-mode', 'area');
  await chart.getByRole('button', { name: 'Heikin Ashi', exact: true }).click();
  await expect(chart).toContainText('Heikin Ashi · derived view');
  await expect(chart).toHaveAttribute('data-last-close', original!);
  await chart.locator('.chart-indicators summary').click();
  await chart.getByLabel('SMA', { exact: true }).check();
  await chart.getByLabel('SMA period', { exact: true }).fill('5');
  await chart.getByLabel('RSI', { exact: true }).check();
  await chart.getByLabel('MACD', { exact: true }).check();
  await chart.getByLabel('Bollinger Bands', { exact: true }).check();
  await chart.getByLabel('Volume MA', { exact: true }).check();
  await chart.getByLabel('VWAP', { exact: true }).check();
  await expect(chart).toHaveAttribute('data-indicator-series', /sma:36/);
  await expect(chart).toHaveAttribute('data-indicator-series', /rsi:26/);
  await expect(chart).toHaveAttribute('data-indicator-series', /macdSignal:7/);
  await expect(chart).toHaveAttribute('data-indicator-series', /vwap:40/);
  await chart.getByRole('button', { name: '5m', exact: true }).click();
  await expect(chart).toHaveAttribute('data-candle-count', '40');
  await expect(page.locator('.chart-native')).toHaveAttribute('data-stable-canvas', 'yes');
  await chart.locator('.chart-range-tools summary').click();
  await chart.getByRole('button', { name: 'Use latest 100 source candles' }).click();
  await page.evaluate(() => { (window as any).__range = null; window.addEventListener('tail:chart-range', e => { (window as any).__range = (e as CustomEvent).detail; }, { once: true }); });
  await chart.getByRole('button', { name: 'Explain selected move' }).click();
  const range = await page.evaluate(() => (window as any).__range);
  expect(range.mint).toBe(mint); expect(range.interval).toBe('5m'); expect(range.chartMode).toBe('heikin');
  expect(range.bars).toHaveLength(40); expect(range.volumeUnit).toBe('token'); expect(range.note).toContain('Original source OHLCV only');
  expect(range.bars[0]).toMatchObject({ o: 1, h: 1.02, l: 0.98, c: 1.001, v: 1000 });
  await page.reload(); await enter(page); await choose(page);
  await expect(chart).toHaveAttribute('data-chart-mode', 'heikin');
  await expect(chart.locator('.chart-intervals .selected')).toHaveText('5m');
  await expect(chart).toHaveAttribute('data-indicator-series', /sma:36/);
});

test('chart command validates modes, volume toggle and linear/log keep the native chart', async ({ page }) => {
  await fixtures(page); await enter(page); await choose(page);
  const chart = page.locator('.sol-chart');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('tail:chart-command', { detail: { interval: '15m', chartMode: 'area' } })));
  await expect(chart).toHaveAttribute('data-chart-mode', 'area');
  await expect(chart.locator('.chart-intervals .selected')).toHaveText('15m');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('tail:chart-command', { detail: { interval: 'invalid', chartMode: 'fake' } })));
  await expect(chart).toHaveAttribute('data-chart-mode', 'area');
  await chart.getByRole('button', { name: 'Linear', exact: true }).click();
  await expect(chart.getByRole('button', { name: 'Log', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await chart.getByRole('button', { name: 'Volume', exact: true }).click();
  await expect(chart.getByRole('button', { name: 'Volume', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await chart.getByRole('button', { name: 'Latest', exact: true }).click();
  await expect(chart).toHaveAttribute('data-history-view', 'recent');
  await chart.getByRole('button', { name: 'All', exact: true }).click();
  await expect(chart).toHaveAttribute('data-history-view', 'all');
  await expect(chart).toHaveAttribute('data-candle-count', '40');
  await chart.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.locator('.sol-chart:fullscreen, .sol-chart.expanded')).toBeVisible();
  await page.keyboard.press('Escape');
});

async function mountWorkbench(page: Page) {
  await page.goto('/terminal');
  await page.evaluate(async () => {
    const load = (url: string) => import(/* @vite-ignore */ url);
    const [React, ReactDOM, features, preferences] = await Promise.all([load('/node_modules/.vite/deps/react.js'), load('/node_modules/.vite/deps/react-dom_client.js'), load('/src/features/v2/charts/ChartWorkbench.tsx'), load('/src/features/preferences/preferences.tsx')]);
    const el = document.createElement('div'); el.id = 'chart-workbench-fixture'; document.body.appendChild(el);
    const react = React.default ?? React, dom = ReactDOM.default ?? ReactDOM;
    dom.createRoot(el).render(react.createElement(preferences.PreferencesProvider, null, react.createElement(features.ChartWorkbench, { coin: null, selectMint: () => {} })));
  });
}

test('independent charts are empty initially, cap at four and preserve separate modes/preset', async ({ page }) => {
  await fixtures(page); await mountWorkbench(page);
  const workbench = page.locator('#chart-workbench-fixture');
  await expect(workbench.locator('.chart-native')).toHaveCount(0);
  await workbench.getByRole('textbox', { name: 'Search chart 1 token' }).fill(mint);
  await workbench.getByRole('list', { name: 'Chart 1 token results' }).getByRole('button').first().click();
  await expect(workbench.locator('.sol-chart')).toHaveAttribute('data-candle-count', '40');
  await workbench.getByRole('button', { name: 'Add independent chart' }).click();
  await workbench.getByRole('textbox', { name: 'Search chart 2 token' }).fill(mint);
  await workbench.getByRole('list', { name: 'Chart 2 token results' }).getByRole('button').first().click();
  await expect(workbench.locator('.sol-chart')).toHaveCount(2);
  await expect(workbench.locator('.sol-chart').nth(1)).toHaveAttribute('data-candle-count','40');
  await workbench.getByRole('region', { name: 'Independent chart 2', exact: true }).getByRole('button', { name: 'Area', exact: true }).click();
  await expect(workbench.locator('.sol-chart').nth(0)).toHaveAttribute('data-chart-mode', 'candles');
  await expect(workbench.locator('.sol-chart').nth(1)).toHaveAttribute('data-chart-mode', 'area');
  await workbench.getByLabel('Sync crosshair', { exact: true }).nth(0).check();
  await workbench.getByLabel('Sync crosshair', { exact: true }).nth(1).check();
  const surface = workbench.locator('.chart-native').first();
  await surface.scrollIntoViewIfNeeded();
  const bounds = await surface.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width * 0.5, bounds!.y + 80);
  await expect(workbench.locator('.sol-chart').first()).not.toHaveAttribute('data-crosshair-time', '');
  await expect(workbench.locator('.sol-chart').nth(1)).toHaveAttribute('data-crosshair-time', (await workbench.locator('.sol-chart').first().getAttribute('data-crosshair-time'))!);
  await workbench.getByRole('button', { name: 'Add independent chart' }).click();
  await workbench.getByRole('button', { name: 'Add independent chart' }).click();
  await expect(workbench.getByRole('button', { name: 'Add independent chart' })).toBeDisabled();
  await workbench.getByRole('button', { name: 'Save chart preset', exact: true }).click();
  await expect(workbench).toContainText('Chart preset saved locally.');
  await workbench.getByRole('button', { name: 'Reset chart layout' }).click();
  await expect(workbench.getByRole('region', { name: /Independent chart/ })).toHaveCount(1);
  await workbench.getByRole('button', { name: 'Research charts', exact: true }).click();
  await expect(workbench.getByRole('region', { name: /Independent chart/ })).toHaveCount(4);
  await expect(workbench.locator('.sol-chart').nth(1)).toHaveAttribute('data-chart-mode', 'area');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(workbench.locator('.v2-chart-grid')).toHaveCSS('grid-template-columns', /\d/);
  expect(await workbench.evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
  await workbench.screenshot({ path: 'artifacts/v2-charts/workbench-mobile.png' });
});


test('USD-volume source explicitly withholds VWAP and empty source has no fabricated bars', async ({ page }) => {
  await fixtures(page);
  await page.route('**/candle/**', route => route.fulfill({ status: 503, json: { error: 'Fixture token volume unavailable' } }));
  await enter(page); await choose(page);
  const chart = page.locator('.sol-chart');
  await expect(chart).toHaveAttribute('data-volume-unit', 'usd');
  await chart.locator('.chart-indicators summary').click();
  await chart.getByLabel('VWAP', { exact: false }).check();
  await expect(chart).toContainText('VWAP · unavailable: USD turnover');
  await expect(chart).toHaveAttribute('data-indicator-series', 'vwap:0');
  await chart.getByLabel('VWAP', { exact: false }).uncheck();
  await expect(chart).toHaveAttribute('data-indicator-series', '');
  await page.route('**/gecko/**', route => route.fulfill({ status: 429, json: { error: 'Fixture rate limited' } }));
  await chart.getByRole('button', { name: '5m', exact: true }).click();
  await expect(chart).toHaveAttribute('data-candle-count', '0');
  await expect(chart.locator('.chart-state')).toContainText('Candle data unavailable');
});


test('pool spot remains provisional, original source indicators and exported OHLC stay intact', async ({ page }) => {
  await fixtures(page, { liveSocket: true });
  await page.route('**/gecko/**/ohlcv/**', route => new URL(route.request().url()).searchParams.has('before_timestamp') ? route.fulfill({ json: { data: { attributes: { ohlcv_list: [] } } } }) : route.fallback());
  await page.route('**/candle/**', route => route.fulfill({ status: 503, json: { error: 'Fixture pool source only' } }));
  await page.route('**/dex/**', r => r.fulfill({ json: r.request().url().includes('/latest/dex/') ? { pairs: [] } : [{ chainId: 'solana', dexId: 'orca', pairAddress: pool, baseToken: { address: WSOL, name: 'Solana', symbol: 'SOL' }, priceUsd: '100', liquidity: { usd: 100000 } }] }));
  let socket: import('@playwright/test').WebSocketRoute | undefined;
  await page.routeWebSocket(/wss:\/\//, s => { socket = s; s.onMessage(raw => { const m = JSON.parse(String(raw)); if (m.method === 'accountSubscribe') s.send(JSON.stringify({ id: m.id, result: 77 })); }); });
  await enter(page);
  await page.getByRole('combobox', { name: 'Search Solana tokens' }).fill(WSOL);
  await page.getByRole('listbox').getByRole('option').first().click();
  const chart = page.locator('.sol-chart');
  await expect(chart).toHaveAttribute('data-history-scope', 'pool');
  await expect(chart).toHaveAttribute('data-candle-count', '40');
  await chart.locator('.chart-indicators summary').click();
  await chart.getByLabel('SMA', { exact: true }).check();
  const indicatorCount = await chart.getAttribute('data-indicator-series');
  const close = await chart.getAttribute('data-last-close');
  await expect.poll(() => !!socket).toBe(true);
  socket!.send(JSON.stringify({ method: 'accountNotification', params: { subscription: 77, result: { context: { slot: 100 }, value: poolAccount(102) } } }));
  await expect.poll(async () => Number(await chart.getAttribute('data-rendered-close'))).toBeCloseTo(102, 8);
  await expect(chart).toHaveAttribute('data-last-close', close!);
  await expect(chart).toHaveAttribute('data-indicator-series', indicatorCount!);
  await chart.locator('.chart-range-tools summary').click();
  await chart.getByRole('button', { name: 'Use latest 100 source candles' }).click();
  await page.evaluate(() => window.addEventListener('tail:chart-range', e => { (window as any).__sourceRange = (e as CustomEvent).detail; }, { once: true }));
  await chart.getByRole('button', { name: 'Explain selected move' }).click();
  const data = await page.evaluate(() => (window as any).__sourceRange);
  expect(data.bars).toHaveLength(40); expect(data.bars.at(-1).c).toBe(Number(close));
  await chart.locator('.live-indicator').click();
  await expect(chart.locator('.spot-feed')).toContainText('Feed paused');
});
