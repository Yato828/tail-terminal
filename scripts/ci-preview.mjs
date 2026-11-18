import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const profiles = {
  // Current fixture suite, including retained desk routes. Explicit V1 specs self-skip.
  standalone: [],
  // Exercise the real scenario fixture branch that standalone intentionally gates.
  legacy: ['tests/customization.spec.ts', '--grep', 'scenario'],
  'backend-v1': ['tests/backend-v1.spec.ts'],
};
const [profile = 'standalone', option] = process.argv.slice(2);
if (!Object.hasOwn(profiles, profile) || (option !== undefined && option !== '--check-server')) {
  throw new Error('Usage: node scripts/ci-preview.mjs standalone|legacy|backend-v1 [--check-server]');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.CI_PREVIEW_PORT || 4664);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('CI_PREVIEW_PORT must be 1024–65535');
const base = `http://127.0.0.1:${port}`, output = resolve(root, 'artifacts/ci', profile);
mkdirSync(output, { recursive: true });
const log = createWriteStream(resolve(output, 'vite.log'));
const env = { ...process.env };
// Sanitize only this child process. Never edit .env files or log inherited values.
for (const name of Object.keys(env)) if (name.startsWith('OPENAI_') || name.startsWith('ASTRA_') || name.startsWith('UPSTASH_')) delete env[name];
Object.assign(env, {
  OPENAI_API_KEY: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '',
  PART_LIVE_TESTS: '0', VITE_PART_SHELL: 'web',
  VITE_TAIL_STANDALONE: profile === 'standalone' ? '1' : '0',
  VITE_TAIL_API_URL: profile === 'backend-v1' ? '/tail-api' : '',
  TAIL_V1_TESTS: profile === 'backend-v1' ? '1' : '0',
  PART_TEST_BASE: base, TAIL_V1_BASE: base,
  PLAYWRIGHT_HTML_OUTPUT_DIR: resolve(output, 'report'),
});
// Readiness-only checks isolate dependency caches from another active local Vite
// server. Full CI uses Vite's default paths, which fixture module imports expect.
const readinessServer = `
  import { createServer } from 'vite';
  const profile = process.argv[1], port = Number(process.argv[2]);
  const app = await createServer({ mode: 'ci-' + profile, cacheDir: '.tmp/ci-readiness/' + profile, server: { host: '127.0.0.1', port, strictPort: true } });
  await app.listen();
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { void app.close().finally(() => process.exit(0)); });
`;
const serverArgs = option === '--check-server'
  ? ['--input-type=module', '-e', readinessServer, profile, String(port)]
  : ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--mode', `ci-${profile}`];
const server = spawn(process.execPath, serverArgs, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.pipe(log, { end: false }); server.stderr.pipe(log, { end: false });
let runner, stopped = false;
const done = child => new Promise((resolveExit, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => resolveExit({ code, signal }));
});
let serverError;
const serverDone = done(server).catch(error => { serverError = error; return { code: 1, signal: null }; });
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  let timer;
  await Promise.race([done(child).catch(() => {}), new Promise(resolveWait => { timer = setTimeout(() => { child.kill('SIGKILL'); resolveWait(); }, 3000); })]);
  clearTimeout(timer);
}
async function cleanup() { if (stopped) return; stopped = true; await stop(runner); await stop(server); log.end(); }
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().then(() => { process.exitCode = 1; }); });
async function ready() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (stopped) throw new Error('Fixture verification cancelled');
    if (serverError) throw new Error('Could not start fixture server');
    if (server.exitCode !== null || server.signalCode !== null) throw new Error(`Fixture server exited. Inspect ${resolve(output, 'vite.log')}`);
    try {
      const response = await fetch(`${base}/api/v2/capabilities`, { signal: AbortSignal.timeout(1000) });
      if (response.ok && response.headers.get('x-tail-ci-profile') === profile && response.headers.get('content-type')?.includes('application/json')) {
        const body = await response.json();
        if (body.chain === 'solana-mainnet' && body.execution?.enabled === false) {
          const status = await fetch(`${base}/api/astra/status`, { signal: AbortSignal.timeout(1000) }).then(r => r.json());
          if (status.configured !== false || status.ready !== false) throw new Error('CI fixture server unexpectedly has AI enabled');
          return;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('AI enabled')) throw error;
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 200));
  }
  throw new Error(`Fixture server readiness timed out. Inspect ${resolve(output, 'vite.log')}`);
}
try {
  await ready();
  console.log(`Fixture profile ${profile} ready at ${base}; AI disabled; upstream proxies disabled.`);
  if (option !== '--check-server') {
    runner = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...profiles[profile], '--workers=1', '--reporter=list', `--output=${resolve(output, 'results')}`], { cwd: root, env, stdio: 'inherit' });
    const result = await Promise.race([done(runner), serverDone.then(() => { throw new Error('Fixture server stopped during browser tests'); })]);
    process.exitCode = result.code ?? 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Fixture verification failed'); process.exitCode = 1;
} finally { await cleanup(); }
