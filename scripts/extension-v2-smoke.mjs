// Installed MV3 companion, with explicit public-source fixtures (no paid/live AI).
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const out = process.env.TAIL_EXTENSION_OUT || 'artifacts/v2-extension';
await mkdir(out, { recursive: true });
const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const wallet = 'So11111111111111111111111111111111111111112';
const pool = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const extension = resolve('dist-ext'), results = [], errors = [];
const ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`], viewport: { width: 390, height: 900 } });
ctx.on('page', page => page.on('pageerror', e => errors.push(e.message)));
await ctx.routeWebSocket(/wss:\/\//, () => {});
let socialFetches = 0;
await ctx.route(/^https?:\/\//, route => {
  const u = new URL(route.request().url());
  if (['x.com', 't.me'].includes(u.hostname)) { socialFetches++; return route.abort(); }
  if (u.hostname === 'api.dexscreener.com' && u.pathname === '/tail-page-fixture') return route.fulfill({ contentType: 'text/html', body: `<title>Permitted page fixture</title><p>Public selected post CA: ${mint}</p>` });
  if (u.hostname === 'example.com') return route.fulfill({ contentType: 'text/html', body: `<title>Ungranted page fixture</title><p>Do not read without grant ${mint}</p>` });
  if (u.hostname === 'api.dexscreener.com') {
    const pair = { chainId: 'solana', dexId: 'raydium', pairAddress: pool, baseToken: { address: mint, symbol: 'USDC', name: 'Extension source fixture USDC' }, quoteToken: { address: wallet, symbol: 'SOL' }, priceUsd: '1', liquidity: { usd: 200000 }, volume: { h24: 100000 } };
    return route.fulfill({ json: u.pathname.includes('/latest/dex/') ? { pairs: [pair] } : [pair] });
  }
  if (u.hostname === 'api.candle.tv') { const end = Math.floor(Date.now() / 300000) * 300; return route.fulfill({ json: { success: true, chain: 'solana', mint, interval: '5m', source: 'birdeye', volumeUnit: 'token', candles: Array.from({ length: 24 }, (_, i) => ({ time: end - (24 - i) * 300, open: 1, high: 1.02, low: .98, close: 1.001, volume: 100 })) } }); }
  if (u.hostname === 'api.geckoterminal.com') return route.fulfill({ json: { data: { attributes: { ohlcv_list: [] } } } });
  if (['api.mainnet-beta.solana.com', 'solana-rpc.publicnode.com'].includes(u.hostname)) { const body = route.request().postDataJSON(); const response = call => ({ jsonrpc: '2.0', id: call.id, result: call.method === 'getSignaturesForAddress' ? [] : { value: null } }); return route.fulfill({ json: Array.isArray(body) ? body.map(response) : response(body) }); }
  return route.continue();
});
const page = await ctx.newPage();
try {
  const worker = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
  expect(manifest.permissions.sort()).toEqual(['activeTab', 'contextMenus', 'scripting', 'sidePanel', 'storage'].sort());
  expect(manifest.content_scripts).toBeUndefined();
  expect(manifest.host_permissions).not.toContain('<all_urls>');
  expect(await worker.evaluate(() => chrome.sidePanel.getOptions({}))).toMatchObject({ path: 'popup.html?view=sidepanel', enabled: true });
  results.push('Real installed MV3 worker and side-panel path; no blanket page host permission or automatic content script.');
  await page.goto(`chrome-extension://${id}/popup.html?view=sidepanel`);
  await expect(page.getByRole('heading', { name: 'Token quick look' })).toBeVisible();
  await expect(page.locator('.v2-compact-chart')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Quick search Solana tokens' }).fill(mint);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('.v2-token-hit').click();
  await expect(page.locator('.v2-compact-chart canvas').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Compact source chart' })).toContainText('Candle');
  await expect(page.locator('code').first()).toHaveText(mint);
  await expect(page.getByRole('link', { name: 'Open in TAIL ↗', exact: true })).toHaveAttribute('href', `https://tail-solana-workspace.vercel.app/terminal?mint=${mint}`);
  await page.getByRole('button', { name: 'Add to watchlist', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove from watchlist', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Companion dark theme' }).selectOption('graphite');
  await page.reload();
  await expect(page.locator('.v2-companion')).toHaveClass(/theme-graphite/);
  await expect(page.getByRole('button', { name: 'Remove from watchlist', exact: true })).toBeVisible();
  const popup = await ctx.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
  await expect(popup.locator('.tail-app')).toHaveClass(/theme-graphite/);
  await expect(popup.locator('.token-title')).toContainText('USDC');
  await popup.getByRole('button', { name: 'Open companion side panel' }).click();
  await expect(popup.locator('.v2-panel-launcher [role=alert]')).toHaveCount(0);
  await popup.close();
  results.push('Search, exact selected mint, source candles, public hosted link, watchlist and settings persist; retained popup restores shared settings/context and opens native side panel from a user click.');
  await worker.evaluate(text => saveContext(text, 'https://x.com/public/status/1'), `User-provided selected text ${mint}`);
  await expect(page.getByRole('textbox', { name: 'Public social text' })).toHaveValue(`User-provided selected text ${mint}`);
  await page.getByRole('button', { name: 'Analyze pasted text' }).click();
  await expect(page.getByText(/Source-confirmed Solana market/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Public social text' }).fill(wallet);
  await page.getByRole('button', { name: 'Analyze pasted text' }).click();
  await expect(page.getByText(/Address candidate · No indexed Solana pool/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Social link URL' }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Save USDC note' }).click();
  await expect(page.getByText('Use a public HTTPS URL without credentials.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Social link URL' }).fill('https://x.com/public/status/1');
  await page.getByRole('textbox', { name: 'Social note', exact: true }).fill('Manual note <script> is inert text.');
  await page.getByRole('button', { name: 'Save USDC note' }).click();
  await expect(page.getByText('Manual note <script> is inert text.')).toBeVisible();
  await page.reload(); await expect(page.getByText('Manual note <script> is inert text.')).toBeVisible();
  expect(socialFetches).toBe(0);
  results.push('Session-storage selection handoff (simulated worker event, not OS context-menu click), exact source match versus unconfirmed address, invalid URL rejection, inert saved notes, persistence and zero social-page fetches.');
  const ungranted = await ctx.newPage(); await ungranted.goto('https://example.com/');
  const denied = await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); try { await scan(tab.id); return null; } catch (e) { return e.message; } });
  expect(denied).toBeTruthy();
  await ungranted.goto('chrome://version/');
  const unsupported = await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); try { await scan(tab.id); return null; } catch (e) { return e.message; } });
  expect(unsupported).toContain('unsupported'); await ungranted.close();
  // A fixed existing API host is permitted by manifest; scanning is invoked explicitly.
  const allowed = await ctx.newPage(); await allowed.goto('https://api.dexscreener.com/tail-page-fixture');
  const scanned = await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return scan(tab.id); });
  expect(scanned.text).toContain(mint); await allowed.close();
  await expect(page.getByRole('textbox', { name: 'Public social text' })).toHaveValue(`Public selected post CA: ${mint}`);
  results.push('Actual scripting injection only on an explicitly scanned permitted fixed host; ungranted site access and browser-page scans are denied by Chrome/worker checks.');
  await page.getByRole('textbox', { name: 'Tracked wallet address' }).fill('0xdeadbeef');
  await page.getByRole('button', { name: 'Inspect wallet' }).click();
  await expect(page.getByText('Enter a valid Solana wallet address.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Tracked wallet address' }).fill(wallet);
  await page.getByRole('button', { name: 'Inspect wallet' }).click();
  await expect(page.getByText(/No activity rows returned in this bounded window/)).toBeVisible();
  await page.screenshot({ path: `${out}/companion-fixture.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Denied storage must remain a visible error; browser does not silently claim success.
  await page.evaluate(() => { chrome.storage.session.get = () => Promise.reject(new Error('fixture storage denied')); });
  await page.reload(); // Chrome API objects reset on reload, so use init script on a separate view.
  const blocked = await ctx.newPage(); await blocked.addInitScript(() => { chrome.storage.session.get = () => Promise.reject(new Error('fixture storage denied')); });
  await blocked.goto(`chrome-extension://${id}/popup.html?view=sidepanel`);
  await expect(blocked.getByText('Extension session storage unavailable. Paste text manually.')).toBeVisible();
  await blocked.close();
  results.push('Narrow companion layout, invalid wallet rejection and visible extension session-storage failure.');
} catch (e) { errors.push(String(e)); process.exitCode = 1; await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {}); }
finally { await writeFile(`${out}/results.json`, JSON.stringify({ mode: 'fixture', results, errors }, null, 2)); console.log(JSON.stringify({ mode: 'fixture', results, errors }, null, 2)); await ctx.close(); }
