import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, getChartContexts, getChartData, publishChartContext, removeChartContext, validateChartSettings, type ChartContext } from './state';
const context: ChartContext = { chartId: 'test', mint: 'MintCase', pool: 'PoolCase', symbol: 'T', interval: '1m', chartMode: 'heikin', priceMode: 'price', indicators: ['sma'], source: 'test-source', fetchedAt: 2, lastCandleAt: 1, stale: false, scope: 'pool', volumeUnit: 'token', candleCount: 600 };
afterEach(() => { removeChartContext('test'); vi.unstubAllGlobals(); });
describe('bounded source chart context', () => {
  it('clamps exports, preserves provenance, copies OHLC and filters actual range', () => {
    vi.stubGlobal('window', { dispatchEvent: vi.fn() }); vi.stubGlobal('CustomEvent', class { constructor(public name: string, public init: unknown) {} });
    const bars = Array.from({ length: 600 }, (_, t) => ({ t, o: 1, h: 2, l: 0.5, c: 1, v: 10 }));
    publishChartContext(context, bars);
    const result = getChartData('test', { maxBars: 2000 })!;
    expect(result.bars).toHaveLength(500); expect(result.totalInRange).toBe(600); expect(result.truncated).toBe(true);
    expect(result.mint).toBe('MintCase'); expect(result.source).toBe('test-source'); expect(result.chartMode).toBe('heikin');
    expect(result.note).toContain('Original source OHLCV only');
    result.bars[0].c = 999; expect(bars[100].c).toBe(1);
    expect(getChartData('test', { from: 25, to: 29 })!.bars.map(b => b.t)).toEqual([25, 26, 27, 28, 29]);
    expect(getChartData('test', { from: 8, to: 7 })).toBeNull();
    expect(getChartData('missing')).toBeNull();
    expect(getChartContexts()).toHaveLength(1);
  });
  it('rejects wrong versions/modes and sanitizes imported settings', () => {
    expect(validateChartSettings({ version: 2, chartMode: 'candles' })).toBeNull();
    expect(validateChartSettings({ version: 1, chartMode: 'fake' })).toBeNull();
    const parsed = validateChartSettings({ ...defaultSettings(), interval: '9h', indicators: { sma: -1, ema: 9000, enabled: ['ema', 'evil', 'ema'] } })!;
    expect(parsed.interval).toBeUndefined(); expect(parsed.indicators.sma).toBe(20); expect(parsed.indicators.ema).toBe(20); expect(parsed.indicators.enabled).toEqual(['ema']);
  });
});
