import * as axiom from '../../../lib/axiom';
import * as api from '../../../lib/api';
import { serializeFableToolOutput } from './serialization';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FABLE_V2_TOOLS } from './toolSchemas';
import { parseWorkspaceContext, parseWorkspaceProposals } from './contracts';
import { clearFableToolCache, runFableDataTool, validateFableToolArgs } from './tools';
import { addProviderUsage, emptyFableUsage } from './usage';
import { readResponsesStream } from './stream';
import { parseChartRange } from './context';
import { resetMarketCache } from '../market/cache';
import { rpc } from '../../../lib/rpcFeed';
import { fetchHolderSnapshot } from '../../../lib/holders';
import { walletActivity } from '../../intelligence/walletData';
vi.mock('../../../lib/rpcFeed', () => ({ rpc: vi.fn() }));
vi.mock('../../../lib/holders', () => ({ fetchHolderSnapshot: vi.fn() }));
vi.mock('../../intelligence/walletData', () => ({ walletActivity: vi.fn() }));
const mint = 'So11111111111111111111111111111111111111112', other = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', pool = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
beforeEach(() => { clearFableToolCache(); resetMarketCache(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('strict read-only local/server tool boundaries', () => {
  it('publishes strict schemas and rejects URLs, extra args, overscans and unsupported tools before any fetch', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(FABLE_V2_TOOLS).toHaveLength(12);
    for (const tool of FABLE_V2_TOOLS) { expect(tool.strict).toBe(true); expect(tool.parameters.additionalProperties).toBe(false); expect(tool.parameters.required).toEqual(Object.keys(tool.parameters.properties)); }
    for (const [name, args] of [
      ['get_market_data', { mint: 'http://169.254.169.254/latest/meta-data' }],
      ['get_security_flags', { mint, url: 'https://attacker.example' }],
      ['get_chart_data', { mint, interval: '1s', limit: 500 }],
      ['get_chart_data', { mint, interval: '1h', limit: 501 }],
      ['compare_tokens', { mints: [mint, mint] }],
      ['get_wallet_comparison', { addresses: [mint, other, pool] }],
      ['search_tokens', { query: '' }],
      ['sendTransaction', { mint }],
      ['configure_workspace', { actions: [{ type: 'sign_transaction', transaction: 'abc' }] }],
      ['explain_this_move', { mint, interval: '1h', from: 1, to: Date.now() }],
    ] as const) expect(() => validateFableToolArgs(name, args)).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses actual source fields and preserves unavailable market cap separately from real zero volume', async () => {
    const fetch = vi.fn(async (_input: unknown) => Response.json([{ chainId: 'solana', pairAddress: pool, baseToken: { address: mint, name: 'SOL', symbol: 'SOL' }, priceUsd: '100', volume: { h24: 0 } }])); vi.stubGlobal('fetch', fetch);
    const result = await runFableDataTool('get_market_data', { mint });
    expect(result).toMatchObject({ source: expect.stringContaining('DexScreener'), data: { mint, fields: { marketCap: { value: null, status: 'unavailable' }, volume24h: { value: 0, status: 'ready' } } } });
    expect(String(fetch.mock.calls[0]?.[0])).toContain(`/token-pairs/v1/solana/${mint}`);
  });
  it('resolves revoked vs absent authorities only from a verified SPL mint account', async () => {
    vi.mocked(rpc).mockResolvedValueOnce({ value: { owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', data: { parsed: { type: 'mint', info: { mintAuthority: null, supply: '100000000000000000000', decimals: 9 } } } } });
    const result = await runFableDataTool('get_security_flags', { mint });
    expect(result.data).toMatchObject({ mintAuthority: { status: 'ready', value: null, meaning: 'Authority revoked' }, freezeAuthority: { status: 'unavailable', value: null }, supplyRaw: '100000000000000000000', lpLock: null });
    vi.mocked(rpc).mockResolvedValueOnce({ value: { owner: mint, data: { parsed: { type: 'mint', info: { mintAuthority: null } } } } });
    expect(await runFableDataTool('get_security_flags', { mint: other })).toHaveProperty('unavailable');
  });
  it('keeps holder source coverage and unavailable wallet overlap honest', async () => {
    vi.mocked(fetchHolderSnapshot).mockResolvedValueOnce({ source: 'RugCheck', fetchedAt: 1234, holders: [], partial: true, accountCount: 0 });
    expect(await runFableDataTool('get_token_holders', { mint })).toMatchObject({ source: 'RugCheck', fetchedAt: 1234, observedAt: null });
    vi.mocked(walletActivity).mockResolvedValueOnce({ rows: [], before: undefined, partial: false }).mockRejectedValueOnce(new Error('RPC 429'));
    expect(await runFableDataTool('get_wallet_comparison', { addresses: [mint, other] })).toMatchObject({ data: { overlappingMints: null, partial: true } });
  });
  it('builds useful filters and returns proposals without storage writes or workspace side effects', async () => {
    const storage = { setItem: vi.fn() }; vi.stubGlobal('localStorage', storage); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const filter = { logic: 'and', rules: [{ field: 'liquidityUsd', op: 'gte', value: 10000 }] };
    const result = await runFableDataTool('build_token_filter', { name: 'Liquid', filterJson: JSON.stringify(filter), sortField: 'volume24h', sortDirection: 'desc', proposeSave: true });
    expect(result.proposals).toEqual([{ type: 'save_filter', name: 'Liquid', filter }]);
    const workspace = await runFableDataTool('configure_workspace', { actions: [{ type: 'open_widget', widget: 'compare' }, { type: 'set_interval', interval: '5m' }] });
    expect(workspace.data).toEqual({ requiresConfirmation: true }); expect(storage.setItem).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(await runFableDataTool('explain_chart_indicator', { indicator: 'RSI' })).toMatchObject({ data: { formula: expect.stringContaining('100') } });
  });
});
describe('bounded UI context, proposals and usage', () => {
  it('accepts only known safe workspace proposals and typed filters', () => {
    expect(parseWorkspaceProposals([{ type: 'open_widget', widget: 'fabletools' }])).toHaveLength(1);
    expect(() => parseWorkspaceProposals([{ type: 'open_widget', widget: 'javascript:alert(1)' }])).toThrow();
    expect(() => parseWorkspaceProposals([{ type: 'set_interval', interval: '1m', execute: true }])).toThrow();
    expect(() => parseWorkspaceProposals(Array(7).fill({ type: 'open_widget', widget: 'data' }))).toThrow();
    expect(() => parseWorkspaceContext({ mint, interval: '1h', chartMode: 'heikin', filters: { field: 'marketCap', op: 'gt', value: '' }, widgets: [], allowPortfolio: false })).toThrow();
    expect(parseWorkspaceContext({ mint, interval: '1h', chartMode: 'heikin', filters: null, widgets: ['chart', 'compare'], allowPortfolio: false })?.mint).toBe(mint);
    expect(parseChartRange({ mint, pool, interval: '1h', from: Date.now() - 3600000, to: Date.now(), source: 'GeckoTerminal' })).not.toBeNull();
    expect(parseChartRange({ mint, pool, interval: '1h', from: 1, to: Date.now() })).toBeNull();
  });
  it('tracks actual provider token counts and optional exact-model pricing, leaving missing values unavailable', () => {
    const total = emptyFableUsage(); total.requests++;
    addProviderUsage(total, { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 }, 'fixture-model', { ASTRA_PRICE_MODEL: 'fixture-model', ASTRA_INPUT_USD_PER_MILLION: '1', ASTRA_OUTPUT_USD_PER_MILLION: '2' });
    expect(total).toMatchObject({ inputTokens: 1000, outputTokens: 100, totalTokens: 1100, estimatedCostUsd: 0.0012 });
    total.requests++; addProviderUsage(total, undefined, 'fixture-model', {});
    expect(total).toMatchObject({ inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null });
    const wrongModel = emptyFableUsage(); addProviderUsage(wrongModel, { input_tokens: 0, output_tokens: 0, total_tokens: 0 }, 'actual-model', { ASTRA_PRICE_MODEL: 'different-model', ASTRA_INPUT_USD_PER_MILLION: '0', ASTRA_OUTPUT_USD_PER_MILLION: '0' });
    expect(wrongModel.estimatedCostUsd).toBeNull();
  });
  it('relays only genuine stream deltas, handles chunk boundaries and requires authoritative completion', async () => {
    const delta = vi.fn(), encoder = new TextEncoder();
    const final = { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Real deltas' }] }], model: 'fixture', usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 } };
    const payload = `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Real ' })}\r\n\r\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'deltas' })}\r\n\r\ndata: ${JSON.stringify({ type: 'response.completed', response: final })}\r\n\r\n`;
    const stream = new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < payload.length; i += 7) c.enqueue(encoder.encode(payload.slice(i, i + 7))); c.close(); } });
    expect(await readResponsesStream(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }), delta, new AbortController().signal)).toEqual(final);
    expect(delta.mock.calls.map(c => c[0]).join('')).toBe('Real deltas');
    await expect(readResponsesStream(new Response('data: {"type":"response.output_text.delta","delta":"partial"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }), vi.fn(), new AbortController().signal)).rejects.toThrow('completion');
  });
});

it('bounds tool evidence as valid JSON with explicit truncation instead of cutting a JSON string', () => {
  const source = { source: 'Source fixture', fetchedAt: 1234, data: { volumeUnit: 'token', bars: Array.from({ length: 500 }, (_, i) => ({ t: i, o: 100, h: 101, l: 99, c: 100, v: 10000 })) } };
  const result = JSON.parse(serializeFableToolOutput(source));
  expect(result.data.truncatedForModelBudget).toBe(true); expect(result.data.bars).toHaveLength(60); expect(result.data.volumeUnit).toBe('token'); expect(result.data.originalReturnedBars).toBe(500);
});

it('searches and compares only real requested Solana mints and exposes nullable liquidity evidence', async () => {
  const pair = (address: string) => ({ chainId: 'solana', pairAddress: pool, baseToken: { address, name: 'Fixture source token', symbol: 'FIX' }, priceUsd: '2', liquidity: { usd: 0 } });
  const fetch = vi.fn(async (input: unknown) => Response.json(String(input).includes('/latest/dex/search') ? { pairs: [pair(mint), { ...pair(other), chainId: 'ethereum' }] } : [pair(mint), pair(other)])); vi.stubGlobal('fetch', fetch);
  const search = await runFableDataTool('search_tokens', { query: 'source fixture' });
  expect(search.data).toMatchObject([{ mint }]); expect(search.data).toHaveLength(1);
  const comparison = await runFableDataTool('compare_tokens', { mints: [mint, other] });
  expect(comparison.data).toMatchObject([{ mint, fields: { liquidityUsd: { value: 0 }, marketCap: { value: null } } }, { mint: other }]);
  const liquidity = await runFableDataTool('get_liquidity_data', { mint });
  expect(liquidity.data).toMatchObject({ liquidityUsd: { value: 0, status: 'ready' }, lpLock: null, lpOwner: null });
});
it('retains actual history scope and token volume units and describes range evidence without inventing a cause', async () => {
  const start = Date.now() - 3600000;
  const history = { source: 'Candle' as const, fetchedAt: Date.now(), scope: 'token' as const, volumeUnit: 'token' as const, bars: [{ t: start, o: 2, h: 3, l: 1, c: 2.5, v: 40 }, { t: start + 60000, o: 2.5, h: 4, l: 2, c: 3, v: 60 }] };
  vi.spyOn(axiom, 'loadCandleResult').mockResolvedValue(history);
  vi.spyOn(api, 'fetchTrades').mockResolvedValue([{ hash: 'fixture-hash', wallet: other, side: 'buy', usd: 20, amount: 10, price: 2, timestamp: new Date(start + 30000).toISOString() }]);
  vi.stubGlobal('fetch', vi.fn(async (_input: unknown) => Response.json([{ chainId: 'solana', pairAddress: pool, baseToken: { address: mint }, priceUsd: '2' }])));
  expect(await runFableDataTool('get_chart_data', { mint, interval: '1m', limit: 20 })).toMatchObject({ source: 'Candle', data: { scope: 'token', volumeUnit: 'token', bars: history.bars } });
  const move = await runFableDataTool('explain_this_move', { mint, interval: '1m', from: start, to: start + 120000 });
  expect(move.data).toMatchObject({ volumeUnit: 'token', summedSourceVolume: 100, observedPriceChangePct: 50, explanation: expect.stringContaining('no causal explanation') });
  expect((move.data as { recentTrades: unknown[] }).recentTrades).toHaveLength(1);
});
