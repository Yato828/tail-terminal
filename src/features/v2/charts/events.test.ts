import { describe, expect, it, vi } from 'vitest';
import type { ISeriesApi, SeriesType } from 'lightweight-charts';
const mocks = vi.hoisted(() => ({ setMarkers: vi.fn(), detach: vi.fn(), attach: vi.fn() }));
vi.mock('lightweight-charts', () => ({ createSeriesMarkers: (...args: unknown[]) => { mocks.attach(...args); return { setMarkers: mocks.setMarkers, detach: mocks.detach }; } }));
import { buildChartEventModel, createChartEventOverlay, DEFAULT_CHART_EVENTS, normalizeChartEvents } from './events';
const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const other = 'So11111111111111111111111111111111111111112';
const start = 1800000000000; // UTC minute boundary.
const now = start + 60 * 60000;
const alert = (id = 'alert-1', at = start + 1000) => ({ id, ruleId: 'rule', label: 'User rule', mint, wallet: '', at, source: 'DexScreener snapshot', observedAt: null, detail: 'Observed threshold crossed.' });
const journal = (id = 'journal-1', at = start + 2000) => ({ id, mint, side: 'buy', quantity: 1, priceUsd: 1, feeUsd: null, at, reason: 'User note', tags: [], notes: '', signature: null, origin: 'manual' });
const bars = [{ t: start }, { t: start + 60000 }, { t: start + 180000 }];
const enabled = { alerts: true, manualJournal: true };
const model = (alerts: unknown, entries: unknown = [], options = enabled) => buildChartEventModel({ mint, bars, interval: '1m', alerts, journal: entries, options, now });
describe('honest local chart annotation provenance', () => {
  it('defaults both sources off and uses exact case-sensitive mint identity', () => {
    expect(DEFAULT_CHART_EVENTS).toEqual({ alerts: false, manualJournal: false });
    expect(buildChartEventModel({ mint, bars, interval: '1m', alerts: [alert()], journal: [journal()], now }).markers).toEqual([]);
    expect(model([{ ...alert(), mint: other }, { ...alert('case'), mint: mint.toLowerCase() }]).markers).toEqual([]);
  });
  it('anchors alert observations at local fetch time and discloses source time separately', () => {
    const sourceAt = start - 600000;
    const result = model([{ ...alert(), observedAt: sourceAt }]);
    expect(result.events[0]).toMatchObject({ at: start + 1000, candleAt: start, sourceObservedAt: sourceAt, timeBasis: 'local-alert-observation' });
    expect(result.markers[0]).toMatchObject({ time: start / 1000, text: 'Alert observed', shape: 'circle' });
    expect(result.events[0].note).toContain('not a block timestamp');
    expect(model([alert()]).events[0].sourceObservedAt).toBeNull();
    expect(model([{ ...alert(), observedAt: now + 1000 }]).events[0].sourceObservedAt).toBeNull();
  });
  it('labels user journal and supplied execution claims as manual, never verified buys', () => {
    const claimed = { ...journal(), origin: 'confirmed-execution', signature: '4'.repeat(88) };
    const result = model([], [claimed]);
    expect(result.events[0]).toMatchObject({ kind: 'manual-journal', title: 'Manual journal · buy', sourceObservedAt: null, timeBasis: 'manual-entry' });
    expect(result.markers[0]).toMatchObject({ shape: 'square', text: 'Manual journal' });
    expect(result.events[0].note).toContain('not an independently verified trade');
    expect(model([], [claimed], { alerts: true, manualJournal: false }).events).toEqual([]);
  });
  it('never clamps old, future, unknown-time or history-gap events into nearby candles', () => {
    const result = model([alert('old', start - 1), alert('gap', start + 120001), alert('after', start + 240000), alert('last', start + 239999), alert('unknown', NaN), alert('future', now + 1)]);
    expect(result.events.map(e => e.id)).toEqual(['alert:last']);
    expect(result.events[0].candleAt).toBe(start + 180000);
    expect(result.omittedOutsideHistory).toBe(3);
    expect(model([{ ...alert(), at: null }]).markers).toEqual([]);
    expect(buildChartEventModel({ mint, bars: [{ t: start + 1000 }], interval: '1m', alerts: [alert()], journal: [], options: enabled, now }).markers).toEqual([]);
  });
  it('uses actual UTC source buckets for every supported interval and refuses empty source history', () => {
    for (const [interval, step] of [['1m', 60000], ['5m', 300000], ['15m', 900000], ['1h', 3600000], ['4h', 14400000], ['1d', 86400000]] as const) {
      const t = Math.floor(start / step) * step;
      const result = buildChartEventModel({ mint, bars: [{ t }], interval, alerts: [alert('utc', t + 10)], journal: [], options: enabled, now });
      expect(result.events[0].candleAt).toBe(t);
    }
    expect(buildChartEventModel({ mint, bars: [], interval: '1m', alerts: [alert()], journal: [], options: enabled, now }).events).toEqual([]);
  });
  it('deduplicates each source, retains cross-source identities and caps latest records at forty', () => {
    expect(model([alert('same'), alert('same')], [journal('same'), journal('same')]).events).toHaveLength(2);
    const result = model(Array.from({ length: 80 }, (_, i) => alert('id-' + i, start + i)));
    expect(result.events).toHaveLength(40); expect(result.totalInRange).toBe(80); expect(result.truncated).toBe(true);
    expect(result.events[0].at).toBe(start + 40); expect(result.events.at(-1)!.at).toBe(start + 79);
    const oversized = buildChartEventModel({ mint, bars, interval: '1m', alerts: Array.from({ length: 80 }, (_, i) => alert('id-' + i, start + i)), journal: [], options: enabled, now, limit: 10000 });
    expect(oversized.markers).toHaveLength(40);
  });
  it('clearing records and toggling off yields no stale overlay markers', () => {
    const result = model([alert()], [journal()]);
    const controller = createChartEventOverlay({} as ISeriesApi<SeriesType>);
    controller.update(result); expect(mocks.setMarkers).toHaveBeenLastCalledWith(result.markers);
    controller.update(model([], [])); expect(mocks.setMarkers).toHaveBeenLastCalledWith([]);
    controller.update(model([alert()], [journal()], DEFAULT_CHART_EVENTS)); expect(mocks.setMarkers).toHaveBeenLastCalledWith([]);
    controller.clear(); expect(mocks.setMarkers).toHaveBeenLastCalledWith([]);
    controller.detach(); controller.detach(); expect(mocks.detach).toHaveBeenCalledTimes(1);
    const calls = mocks.setMarkers.mock.calls.length; controller.update(result); expect(mocks.setMarkers).toHaveBeenCalledTimes(calls);
  });
  it('skips malformed records and bounds arbitrary labels/details', () => {
    expect(normalizeChartEvents([{ ...alert(), ruleId: '' }, { ...alert(), source: '' }, { ...alert(), mint: '0x123' }], [], now)).toEqual([]);
    const result = normalizeChartEvents([{ ...alert(), label: 'x'.repeat(10000), detail: 'd'.repeat(10000) }], [], now)[0];
    expect(result.title.length).toBeLessThanOrEqual(120); expect(result.detail).toHaveLength(1000);
  });
});
