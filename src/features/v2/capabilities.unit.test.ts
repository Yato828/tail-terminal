import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import capabilities, { config } from '../../../api/v2/capabilities';
import viteConfig, { handleLocalApi, loadServerEnv } from '../../../vite.config';
const url = 'http://localhost:4664/api/v2/capabilities';
beforeEach(() => { vi.stubEnv('OPENAI_API_KEY', ''); vi.stubEnv('UPSTASH_REDIS_REST_URL', ''); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('public read-only V2 capabilities', () => {
  it('discloses actual disabled execution and optional AI without calling a provider or echoing private input', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const request = new Request(`${url}?secret=private-query-fixture`, { headers: { Cookie: 'private-cookie-fixture', Authorization: 'Bearer private-auth-fixture' } });
    const response = capabilities(request), body = await response.json();
    expect(config.runtime).toBe('edge'); expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(body).toMatchObject({ version: '2.0.0', chain: 'solana-mainnet', execution: { enabled: false, signing: false, automaticTrading: false }, ai: { brand: 'Fable 5.2', optional: true }, alerts: 'foreground only' });
    expect(JSON.stringify(body)).not.toContain('private-'); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])('rejects %s with the GET-only contract', async method => {
    const response = capabilities(new Request(url, { method }));
    expect(response.status).toBe(405); expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.json()).toEqual({ error: 'GET only' });
  });
  it('uses the same capabilities handler locally and retains Astra status/unknown-route behavior', async () => {
    expect(await (await handleLocalApi(new Request(url))).json()).toEqual(await capabilities(new Request(url)).json());
    const rejected = await handleLocalApi(new Request(url, { method: 'POST', body: '{}' })); expect(rejected.status).toBe(405);
    const status = await handleLocalApi(new Request('http://localhost:4664/api/astra/status'));
    expect(status.status).toBe(200); expect(await status.json()).toMatchObject({ configured: false, ready: false, chain: 'solana' });
    expect((await handleLocalApi(new Request(`${url}/unexpected`))).status).toBe(404);
    expect((await handleLocalApi(new Request('http://localhost:4664/api/not-found'))).status).toBe(404);
  });
  it('does not load owner credentials from .env in fixture-only CI modes', () => {
    loadServerEnv('ci-standalone'); loadServerEnv('ci-legacy'); loadServerEnv('ci-backend-v1');
    expect(process.env.OPENAI_API_KEY).toBe(''); expect(process.env.UPSTASH_REDIS_REST_TOKEN).toBe('');
  });
});

it('isolates CI upstream proxies and watches while keeping normal development adapters', async () => {
  if (typeof viteConfig !== 'function') throw new Error('Expected the repository Vite config factory');
  const ci = await viteConfig({ command: 'serve', mode: 'ci-standalone' });
  expect(ci.server?.proxy).toEqual({}); expect(ci.preview?.proxy).toEqual({});
  expect(ci.server?.watch?.ignored).toEqual(expect.arrayContaining(['**/.tail-v2-worktrees/**', '**/artifacts/**', '**/dist/**', '**/dist-ext/**']));
  const development = await viteConfig({ command: 'serve', mode: 'development' });
  expect(Object.keys(development.server?.proxy ?? {})).toEqual(expect.arrayContaining(['/dex', '/gecko', '/paprika', '/rpc', '/ray', '/tail-api']));
});
