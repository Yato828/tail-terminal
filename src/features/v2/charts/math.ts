import type { Candle } from '../../../lib/axiom';

export type Point = { t: number; value: number };
export type IndicatorId = 'sma' | 'ema' | 'vwap' | 'rsi' | 'macd' | 'bollinger' | 'volumeMA';
export type IndicatorSettings = {
  enabled: IndicatorId[];
  sma: number; ema: number; rsi: number; bollinger: number; deviations: number;
  volumeMA: number; macdFast: number; macdSlow: number; macdSignal: number;
};
export const DEFAULT_INDICATORS: IndicatorSettings = {
  enabled: [], sma: 20, ema: 20, rsi: 14, bollinger: 20, deviations: 2,
  volumeMA: 20, macdFast: 12, macdSlow: 26, macdSignal: 9,
};
export const INDICATOR_IDS: IndicatorId[] = ['sma', 'ema', 'vwap', 'rsi', 'macd', 'bollinger', 'volumeMA'];
const period = (n: number) => Number.isInteger(n) && n >= 1 && n <= 500;

// A missing/non-finite sample breaks the warm-up. Never turn unknown data into zero.
export function sma(points: Point[], length: number): Point[] {
  if (!period(length)) return [];
  const result: Point[] = [], window: number[] = [];
  let sum = 0;
  for (const point of points) {
    if (!Number.isFinite(point.value)) { window.length = 0; sum = 0; continue; }
    window.push(point.value); sum += point.value;
    if (window.length > length) sum -= window.shift()!;
    if (window.length === length) result.push({ t: point.t, value: sum / length });
  }
  return result;
}
// SMA-seeded EMA: first output requires a full period, then alpha=2/(n+1).
export function ema(points: Point[], length: number): Point[] {
  if (!period(length)) return [];
  const result: Point[] = [];
  let count = 0, sum = 0, previous: number | null = null;
  const alpha = 2 / (length + 1);
  for (const point of points) {
    if (!Number.isFinite(point.value)) { count = 0; sum = 0; previous = null; continue; }
    if (previous === null) {
      sum += point.value; count++;
      if (count < length) continue;
      previous = sum / length;
    } else previous += alpha * (point.value - previous);
    result.push({ t: point.t, value: previous });
  }
  return result;
}
export function rsi(bars: Candle[], length: number): Point[] {
  if (!period(length)) return [];
  const result: Point[] = [];
  let gains = 0, losses = 0, count = 0, previous: number | null = null;
  for (const bar of bars) {
    if (!Number.isFinite(bar.c)) { previous = null; gains = losses = count = 0; continue; }
    if (previous === null) { previous = bar.c; continue; }
    const delta = bar.c - previous; previous = bar.c;
    const gain = Math.max(delta, 0), loss = Math.max(-delta, 0);
    if (count < length) {
      gains += gain; losses += loss; count++;
      if (count < length) continue;
      gains /= length; losses /= length;
    } else {
      gains = (gains * (length - 1) + gain) / length;
      losses = (losses * (length - 1) + loss) / length;
    }
    result.push({ t: bar.t, value: losses === 0 ? gains === 0 ? 50 : 100 : 100 - 100 / (1 + gains / losses) });
  }
  return result;
}
export function macd(bars: Candle[], fast = 12, slow = 26, signalLength = 9) {
  if (!period(fast) || !period(slow) || !period(signalLength) || fast >= slow)
    return { line: [], signal: [], histogram: [] };
  const points = bars.map(b => ({ t: b.t, value: b.c }));
  const fastByTime = new Map(ema(points, fast).map(p => [p.t, p.value]));
  const slowByTime = new Map(ema(points, slow).map(p => [p.t, p.value]));
  const aligned = points.map(p => ({ t: p.t, value: fastByTime.has(p.t) && slowByTime.has(p.t) ? fastByTime.get(p.t)! - slowByTime.get(p.t)! : NaN }));
  const line = aligned.filter(p => Number.isFinite(p.value));
  const signal = ema(aligned, signalLength), signalByTime = new Map(signal.map(p => [p.t, p.value]));
  return { line, signal, histogram: line.flatMap(p => signalByTime.has(p.t) ? [{ t: p.t, value: p.value - signalByTime.get(p.t)! }] : []) };
}
export function bollinger(bars: Candle[], length = 20, deviations = 2) {
  const empty = { middle: [] as Point[], upper: [] as Point[], lower: [] as Point[] };
  if (!period(length) || !Number.isFinite(deviations) || deviations <= 0 || deviations > 10) return empty;
  const window: number[] = [];
  for (const b of bars) {
    if (!Number.isFinite(b.c)) { window.length = 0; continue; }
    window.push(b.c); if (window.length > length) window.shift();
    if (window.length < length) continue;
    const mean = window.reduce((s, v) => s + v, 0) / length;
    // Population standard deviation; centered sum avoids cancellation for tiny prices.
    const sigma = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / length);
    empty.middle.push({ t: b.t, value: mean });
    empty.upper.push({ t: b.t, value: mean + deviations * sigma });
    empty.lower.push({ t: b.t, value: mean - deviations * sigma });
  }
  return empty;
}
export function vwap(bars: Candle[], volumeUnit: 'usd' | 'token'): Point[] {
  // Dollar turnover is not base-token volume. UTC-session typical-price VWAP
  // needs token volume; a zero-volume bar contributes no trades or new weight.
  if (volumeUnit !== 'token') return [];
  const result: Point[] = [];
  let day = -1, weight = 0, weightedPrice = 0, validSession = true;
  for (const b of bars) {
    const nextDay = Math.floor(b.t / 86400000);
    if (nextDay !== day) { day = nextDay; weight = weightedPrice = 0; validSession = true; }
    if (!Number.isFinite(b.v) || b.v < 0 || ![b.h, b.l, b.c].every(Number.isFinite)) validSession = false;
    if (!validSession) continue;
    weightedPrice += ((b.h + b.l + b.c) / 3) * b.v;
    weight += b.v;
    if (weight > 0) result.push({ t: b.t, value: weightedPrice / weight });
  }
  return result;
}
export function heikinAshi(bars: Candle[]): Candle[] {
  let previous: Candle | null = null;
  return bars.map(b => {
    const c = (b.o + b.h + b.l + b.c) / 4;
    const o = previous ? (previous.o + previous.c) / 2 : (b.o + b.c) / 2;
    const result = { ...b, o, c, h: Math.max(b.h, o, c), l: Math.min(b.l, o, c) };
    previous = result;
    return result;
  });
}
export function calculateIndicators(bars: Candle[], settings: IndicatorSettings, unit: 'usd' | 'token') {
  const close = bars.map(b => ({ t: b.t, value: b.c }));
  const result: Record<string, Point[]> = {};
  for (const id of settings.enabled) {
    if (id === 'sma') result.sma = sma(close, settings.sma);
    if (id === 'ema') result.ema = ema(close, settings.ema);
    if (id === 'rsi') result.rsi = rsi(bars, settings.rsi);
    if (id === 'vwap') result.vwap = vwap(bars, unit);
    if (id === 'volumeMA') result.volumeMA = sma(bars.map(b => ({ t: b.t, value: b.v >= 0 ? b.v : NaN })), settings.volumeMA);
    if (id === 'macd') { const m = macd(bars, settings.macdFast, settings.macdSlow, settings.macdSignal); result.macd = m.line; result.macdSignal = m.signal; result.macdHistogram = m.histogram; }
    if (id === 'bollinger') { const b = bollinger(bars, settings.bollinger, settings.deviations); result.bbMiddle = b.middle; result.bbUpper = b.upper; result.bbLower = b.lower; }
  }
  return result;
}
