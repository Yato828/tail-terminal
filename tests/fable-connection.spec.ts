import { expect, test, type Page } from '@playwright/test';
import { fixtures, enter, launch, errors } from './support';

// All model/status responses in this file are fixtures, never live AI verification.
const status = (ready = false) => ({ configured: ready, ready, code: ready ? 'ready' : 'missing_api_key', model: ready ? 'fixture-openai-model' : null, reason: '', rateLimit: 'local' });
const answer = (text: string) => ({ text, model: 'fixture-openai-model', at: Date.now(), sources: [], proposals: [] });
async function tail(page: Page) {
  await page.goto('/terminal');
  await expect(page.locator('.tail-terminal-route:not([inert])')).toBeVisible();
  return page.locator('.fable-panel');
}
async function legacy(page: Page) {
  await enter(page); await launch(page, 'Fable 5.2');
  await expect(page.locator('.astra-chat')).toBeVisible();
  return page.locator('.astra-chat');
}

test('TAIL composer accepts unavailable status, preserves failed drafts and never duplicates retry turns', async ({ page }) => {
  await fixtures(page); const requests: any[] = [];
  await page.route('**/api/astra/status', r => r.fulfill({ json: status() }));
  await page.route('**/api/astra/chat', r => { requests.push(r.request().postDataJSON()); return r.fulfill({ status: 503, json: { code: 'missing_api_key', error: 'OPENAI_API_KEY=fixture-secret must never appear in the composer' } }); });
  const panel = await tail(page), input = panel.getByRole('textbox', { name: 'Ask Fable 5.2', exact: true });
  await expect(input).toBeEnabled(); await input.fill('Keep this exact unavailable question');
  for (let n = 1; n <= 2; n++) {
    await panel.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('Your draft is still here');
    await expect(input).toBeEnabled(); await expect(input).toHaveValue('Keep this exact unavailable question');
    expect(requests).toHaveLength(n); expect(requests[n - 1].messages).toHaveLength(1);
    expect(requests[n - 1].messages[0]).toEqual({ role: 'user', content: 'Keep this exact unavailable question' });
  }
  await expect(panel.getByRole('alert')).not.toContainText('fixture-secret'); await expect(panel.getByRole('alert')).not.toContainText('OPENAI_API_KEY');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tail.fable.history.v1') ?? '[]'))).toEqual([]);
  await expect(panel.locator('.fable-transcript > article')).toHaveCount(0);
  expect(errors.get(page)).toEqual([]);
});

test('explicit connection retry is free, retains the draft and recovers to one completed conversation', async ({ page }) => {
  await fixtures(page); let ready = false, statusCalls = 0, modelCalls = 0;
  await page.route('**/api/astra/status', r => { statusCalls++; return r.fulfill({ json: status(ready) }); });
  await page.route('**/api/astra/chat', r => { modelCalls++; return r.fulfill({ json: answer('Fixture response after a recovered connection.') }); });
  const panel = await tail(page), input = panel.getByRole('textbox', { name: 'Ask Fable 5.2', exact: true });
  await input.fill('A question drafted before connection setup'); ready = true;
  await panel.getByRole('button', { name: 'Retry connection', exact: true }).click();
  await expect(panel.locator('.fable-heading p')).toHaveText('Ready');
  await expect(input).toHaveValue('A question drafted before connection setup'); expect(modelCalls).toBe(0); expect(statusCalls).toBeGreaterThanOrEqual(2);
  await input.press('Enter');
  await expect(panel.getByText('Fixture response after a recovered connection.', { exact: true })).toBeVisible();
  await expect(input).toHaveValue(''); expect(modelCalls).toBe(1);
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('tail.fable.history.v1') ?? '[]'));
  expect(history.map((message: any) => message.role)).toEqual(['user', 'assistant']);
});

for (const screen of ['TAIL', 'legacy'] as const) test(`${screen} Stop preserves the draft and never implicitly submits again`, async ({ page }) => {
  await fixtures(page); await page.route('**/api/astra/status', r => r.fulfill({ json: status(true) }));
  let first!: () => void, second!: () => void, calls = 0;
  const firstGate = new Promise<void>(resolve => { first = resolve; }), secondGate = new Promise<void>(resolve => { second = resolve; });
  await page.route('**/api/astra/chat', async r => {
    const call = ++calls; await (call === 1 ? firstGate : secondGate);
    await r.fulfill({ json: answer(call === 1 ? 'Obsolete fixture answer must be ignored.' : 'Current fixture answer.') }).catch(() => {});
  });
  const panel = screen === 'TAIL' ? await tail(page) : await legacy(page), input = panel.getByRole('textbox', { name: screen === 'TAIL' ? 'Ask Fable 5.2' : 'Message Fable 5.2', exact: true });
  await input.fill('First draft'); await input.press('Enter'); await expect.poll(() => calls).toBe(1);
  await panel.getByRole('button', { name: screen === 'TAIL' ? 'Stop' : 'Stop generating', exact: true }).click();
  await expect(input).toBeEnabled(); await expect(input).toHaveValue('First draft'); expect(calls).toBe(1);
  await input.fill('Second draft'); await input.press('Enter'); await expect.poll(() => calls).toBe(2);
  first(); await expect(input).toBeDisabled(); await expect(panel.getByRole('button', { name: screen === 'TAIL' ? 'Stop' : 'Stop generating', exact: true })).toBeVisible();
  second(); await expect(panel.getByText('Current fixture answer.', { exact: true })).toBeVisible();
  await expect(panel.getByText('Obsolete fixture answer must be ignored.', { exact: true })).toHaveCount(0);
  const history = await page.evaluate(screen => screen === 'TAIL' ? JSON.parse(localStorage.getItem('tail.fable.history.v1') ?? '[]') : JSON.parse(localStorage.getItem('part.astra.threads.v1') ?? '[]')[0].messages, screen);
  expect(history.map((message: any) => message.content)).toEqual(['Second draft', 'Current fixture answer.']);
});

for (const screen of ['TAIL', 'legacy'] as const) test(`${screen} respects IME Enter and sends unavailable questions explicitly`, async ({ page }) => {
  await fixtures(page); let calls = 0;
  await page.route('**/api/astra/status', r => r.fulfill({ json: status() }));
  await page.route('**/api/astra/chat', r => { calls++; return r.fulfill({ status: 503, json: { code: 'missing_api_key', error: 'Fixture service is not configured.' } }); });
  const panel = screen === 'TAIL' ? await tail(page) : await legacy(page);
  const input = panel.getByRole('textbox', { name: screen === 'TAIL' ? 'Ask Fable 5.2' : 'Message Fable 5.2', exact: true });
  await input.fill('Draft composed through an IME');
  await input.dispatchEvent('compositionstart');
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true });
  expect(calls).toBe(0);
  await input.dispatchEvent('compositionend');
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true });
  expect(calls).toBe(0);
  if (screen === 'legacy') { await input.press('Shift+Enter'); expect(calls).toBe(0); }
  await input.press('Enter'); await expect.poll(() => calls).toBe(1);
  await expect(panel.getByRole('alert')).toContainText('Your draft is still here'); await expect(input).toBeEnabled();
  await expect(input).toHaveValue(screen === 'legacy' ? 'Draft composed through an IME\n' : 'Draft composed through an IME');
  if (screen === 'legacy') await expect(panel.locator('.chat-message')).toHaveCount(0);
  expect(errors.get(page)).toEqual([]);
});

test('status timeout unlocks retry and a late status cannot overwrite a recovered connection', async ({ page }) => {
  await fixtures(page); await page.clock.install();
  let calls = 0, release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/astra/status', async r => { const call = ++calls; if (call === 1) await waiting; await r.fulfill({ json: status(call > 1) }).catch(() => {}); });
  await page.goto('/terminal?embedded=1');
  const panel = page.locator('.fable-panel'), retry = panel.getByRole('button', { name: 'Retry connection', exact: true });
  await expect.poll(() => calls).toBe(1); await page.clock.fastForward(8100);
  await expect(retry).toBeEnabled(); await expect(panel).toContainText('timed out');
  await panel.getByRole('textbox', { name: 'Ask Fable 5.2', exact: true }).fill('Draft survives a connection timeout');
  await retry.click(); await expect(panel.locator('.fable-heading p')).toHaveText('Ready'); release();
  await expect(panel.locator('.fable-heading p')).toHaveText('Ready');
  await expect(panel.getByRole('textbox', { name: 'Ask Fable 5.2', exact: true })).toHaveValue('Draft survives a connection timeout');
});
