import { test, expect, type Page } from '@playwright/test';
import { fixtures, mint, pool, wallet, errors } from './support';
const sample = (address: string, missing = false) => ({
  chainId: 'solana', dexId: 'orca', pairAddress: pool,
  baseToken: { address, symbol: address === mint ? 'USDC' : 'SOL', name: 'Market fixture' },
  priceUsd: address === mint ? '1' : '100',
  ...(missing ? {} : { marketCap: 1000000, liquidity: { usd: 200000 } }),
  volume: { h24: address === mint ? 0 : 100000, h1: address === mint ? 0 : 1000 },
  priceChange: { h24: address === mint ? -1 : 2 },
  txns: { h24: { buys: 12, sells: 0 } }, pairCreatedAt: Date.now() - 60000,
});
async function marketFixtures(page: Page) {
  await fixtures(page);
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**/dex/**', async route => {
    const url = route.request().url();
    if (url.includes('/token-profiles/')) return route.fulfill({ json: [{ chainId: 'solana', tokenAddress: mint }, { chainId: 'solana', tokenAddress: wallet }] });
    if (url.includes('/token-pairs/v1/solana/')) { const address = new URL(url).pathname.split('/').at(-1)!; return route.fulfill({ json: [sample(address, address === wallet)] }); }
    const rows = [sample(mint), sample(wallet, true)];
    return route.fulfill({ json: url.includes('/latest/dex/') ? { pairs: rows } : rows });
  });
}
async function advanced(page: Page) {
  await page.getByRole('button', { name: 'Pulse', exact: true }).click();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Advanced token discovery' })).toBeVisible();
  await expect(page.getByText('2 matches · 0 Unknown', { exact: false })).toBeVisible();
}
test('advanced discovery preserves unknowns, validates filters and persists local signals', async ({ page }) => {
  await marketFixtures(page); await page.goto('/terminal'); await advanced(page);
  await page.getByLabel('Filter field', { exact: true }).selectOption('marketCap');
  await page.getByLabel('Filter operator', { exact: true }).selectOption('gte');
  await page.getByLabel('Filter value', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Add rule', exact: true }).click();
  await expect(page.locator('[aria-label="Advanced token discovery"] > p[aria-live]')).toContainText('1 matches · 1 Unknown');
  await page.getByLabel('Filter preset name').fill('Covered cap');
  await page.getByLabel('Save as custom signal').check();
  await page.getByRole('button', { name: 'Save filter preset', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Covered cap · signal', exact: true })).toBeVisible();
  await page.reload(); await advanced(page);
  await page.getByRole('button', { name: 'Covered cap · signal', exact: true }).click();
  await expect(page.locator('[aria-label="Advanced token discovery"] > p[aria-live]')).toContainText('1 matches · 1 Unknown');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByRole('button', { name: 'Recently Migrated', exact: true }).click();
  await expect(page.getByText('Recently Migrated is unavailable:', { exact: false })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Trending', exact: true }).click();
  await page.getByText('Nested rules / import presets', { exact: true }).click();
  await page.getByLabel('Filter JSON', { exact: true }).fill(JSON.stringify({ field: 'priceUsd', op: 'gt', value: '' }));
  await page.getByRole('button', { name: 'Apply filter JSON', exact: true }).click();
  await expect(page.getByText('priceUsd requires a finite number value', { exact: false })).toBeVisible();
  expect(errors.get(page)).toEqual([]);
});
test('market comparison uses exact mints, per-value evidence, shared subscriptions and four-token cap', async ({ page }) => {
  await marketFixtures(page); await page.goto('/terminal');
  // Isolated fixture mount of the exported widget; full application registration belongs to the lead integration.
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<any>;
    const [React, ReactDom, market] = await Promise.all([dynamicImport('/node_modules/.vite/deps/react.js'), dynamicImport('/node_modules/.vite/deps/react-dom_client.js'), dynamicImport('/src/features/v2/market/TokenCompare.tsx')]);
    const root = document.createElement('main'); root.id = 'market-compare-fixture'; document.body.replaceChildren(root);
    (ReactDom.createRoot ?? ReactDom.default.createRoot)(root).render((React.createElement ?? React.default.createElement)(market.TokenCompare, { initialMints: ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'], selectMint: () => {} }));
  });
  await expect(page.getByRole('heading', { name: 'Token Compare', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'USDC', exact: true })).toBeVisible();
  await page.getByLabel('Compare token mint').fill(wallet); await page.getByRole('button', { name: 'Add comparison token' }).click();
  await expect(page.getByRole('heading', { name: 'SOL', exact: true })).toBeVisible();
  await expect(page.locator('.v2-compare-token').nth(1).locator('.market-evidence-value').filter({ hasText: /^Unavailable$/ })).not.toHaveCount(0);
  await page.getByLabel('Compare token mint').fill(wallet); await page.getByRole('button', { name: 'Add comparison token' }).click();
  await expect(page.getByRole('alert')).toContainText('already in the comparison');
  for (const address of ['JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263']) { await page.getByLabel('Compare token mint').fill(address); await page.getByRole('button', { name: 'Add comparison token' }).click(); }
  await expect(page.locator('.v2-compare-token')).toHaveCount(4); await expect(page.getByRole('button', { name: 'Add comparison token' })).toBeDisabled();
  await page.locator('.v2-compare-token').first().getByRole('button', { name: /^Remove / }).click();
  await expect(page.locator('.v2-compare-token')).toHaveCount(3);
});
test('advanced source failures, empty results and mobile evidence stay explicit', async ({ page }) => {
  await marketFixtures(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/terminal'); await advanced(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Advanced token search').fill('empty-fixture');
  await page.route('**/dex/latest/dex/search?**', route => route.fulfill({ json: { pairs: [] } }));
  await page.getByRole('button', { name: 'Search / refresh sample', exact: true }).click();
  await expect(page.getByText('No matching covered tokens.', { exact: false })).toBeVisible();
  await page.route('**/dex/latest/dex/search?**', route => route.fulfill({ status: 429, json: { error: 'rate limited fixture' } }));
  await page.getByLabel('Advanced token search').fill('rate-limit-fixture'); await page.getByRole('button', { name: 'Search / refresh sample', exact: true }).click();
  await expect(page.locator('[aria-label="Advanced token discovery"]').getByRole('alert')).toContainText('429');
  await page.screenshot({ path: 'artifacts/v2-market/mobile-source-error.png', fullPage: true });
  expect(errors.get(page)).toEqual([]);
});
