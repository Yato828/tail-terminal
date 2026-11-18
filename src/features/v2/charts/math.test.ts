import { describe, expect, it } from 'vitest';
import type { Candle } from '../../../lib/axiom';
import { bollinger, calculateIndicators, DEFAULT_INDICATORS, ema, heikinAshi, macd, rsi, sma, vwap } from './math';
const candles = (values: number[], volumes = values.map(() => 1)): Candle[] => values.map((c, i) => ({ t: i * 60000, o: c, h: c, l: c, c, v: volumes[i] }));
const points = (values: number[]) => values.map((value, t) => ({ t, value }));
describe('source indicator math', () => {
  it('SMA warms up, EMA uses SMA seed, unknown input restarts warm-up', () => {
    expect(sma(points([1, 2, 3, 4]), 3)).toEqual([{ t: 2, value: 2 }, { t: 3, value: 3 }]);
    expect(ema(points([1, 2, 3, 7]), 3)).toEqual([{ t: 2, value: 2 }, { t: 3, value: 4.5 }]);
    expect(sma(points([1, NaN, 3, 5]), 2)).toEqual([{ t: 3, value: 4 }]);
    expect(ema(points([1, NaN, 3, 5]), 2)).toEqual([{ t: 3, value: 4 }]);
    expect(ema(points([1, 2]), 3)).toEqual([]);
    for (const length of [0, -1, 1.5, NaN, 501]) expect(sma(points([1, 2]), length)).toEqual([]);
  });
  it('Wilder RSI handles flat, upward and downward markets without division by zero', () => {
    expect(rsi(candles([4, 4, 4, 4]), 3)).toEqual([{ t: 180000, value: 50 }]);
    expect(rsi(candles([1, 2, 3, 4]), 3)[0].value).toBe(100);
    expect(rsi(candles([4, 3, 2, 1]), 3)[0].value).toBe(0);
    const result = rsi(candles([1, 2, 1, 2, 1]), 2);
    expect(result.map(p => p.value)).toEqual([50, 75, 37.5]);
    expect(rsi(candles([1, 2]), 2)).toEqual([]);
  });
  it('MACD aligns slow/fast EMA by timestamp and warms the signal independently', () => {
    const result = macd(candles([1, 2, 3, 4, 5, 6]), 2, 3, 2);
    expect(result.line[0]).toEqual({ t: 120000, value: 0.5 });
    expect(result.signal[0]).toEqual({ t: 180000, value: 0.5 });
    expect(result.histogram.map(p => p.value)).toEqual([0, 0, 0]);
    expect(macd(candles([1, 2, 3]), 3, 2, 2).line).toEqual([]);
    const withGap = macd(candles([1, 2, 3, 4, NaN, 6, 7, 8]), 2, 3, 2);
    expect(withGap.signal.map(p => p.t)).toEqual([180000]);
  });
  it('Bollinger uses population variance and remains precise at small prices', () => {
    const b = bollinger(candles([1, 2, 3]), 3, 2);
    expect(b.middle[0].value).toBe(2);
    expect(b.upper[0].value).toBeCloseTo(2 + 2 * Math.sqrt(2 / 3), 10);
    expect(b.lower[0].value).toBeCloseTo(2 - 2 * Math.sqrt(2 / 3), 10);
    const tiny = bollinger(candles([1e-12, 2e-12, 3e-12]), 3);
    expect(tiny.upper[0].value).toBeGreaterThan(tiny.middle[0].value);
    expect(bollinger(candles([1, 2]), 3).middle).toEqual([]);
  });
  it('VWAP needs base-token volume; zero volume adds no weight, UTC resets and unknown invalidates session', () => {
    const bars = candles([1, 3, 10], [1, 3, 0]);
    expect(vwap(bars, 'usd')).toEqual([]);
    expect(vwap(bars, 'token').map(p => p.value)).toEqual([1, 2.5, 2.5]);
    expect(vwap(candles([1], [0]), 'token')).toEqual([]);
    const unknown = candles([1, 2, 3, 7], [1, NaN, 1, 2]); unknown[3].t = 86400000;
    expect(vwap(unknown, 'token')).toEqual([{ t: 0, value: 1 }, { t: 86400000, value: 7 }]);
    const differing = [{ t: 0, o: 1, h: 6, l: 1, c: 2, v: 2 }];
    expect(vwap(differing, 'token')[0].value).toBe(3);
  });
  it('Heikin Ashi derives recursive candles without mutating source OHLC or volume', () => {
    const source = [{ t: 0, o: 10, h: 14, l: 8, c: 12, v: 1 }, { t: 1, o: 20, h: 24, l: 18, c: 22, v: 2 }];
    const before = structuredClone(source), derived = heikinAshi(source);
    expect(derived[0]).toEqual({ t: 0, o: 11, h: 14, l: 8, c: 11, v: 1 });
    expect(derived[1]).toEqual({ t: 1, o: 11, h: 24, l: 11, c: 21, v: 2 });
    expect(source).toEqual(before);
  });
  it('volume MA retains zero and stops across unknown volume', () => {
    const data = calculateIndicators(candles([1, 2, 3, 4], [0, 2, NaN, 4]), { ...DEFAULT_INDICATORS, enabled: ['volumeMA'], volumeMA: 2 }, 'usd');
    expect(data.volumeMA).toEqual([{ t: 60000, value: 1 }]);
  });
});
