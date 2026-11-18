import { CANDLE_IVS, type Candle, type Interval } from '../../../lib/axiom';
import { DEFAULT_INDICATORS, INDICATOR_IDS, type IndicatorSettings } from './math';
export type ChartMode = 'candles' | 'line' | 'area' | 'heikin';
export type ChartSettings = { version: 1; chartMode: ChartMode; priceMode?: 'price' | 'mcap'; interval?: Interval; log: boolean; showVolume?: boolean; indicators: IndicatorSettings };
export const CHART_MODES: ChartMode[] = ['candles', 'line', 'area', 'heikin'];
export const CHART_CONTEXT_EVENT = 'tail:chart-context';
export const CHART_RANGE_EVENT = 'tail:chart-range';
export const CHART_COMMAND_EVENT = 'tail:chart-command';
export const CHART_CROSSHAIR_EVENT = 'tail:chart-crosshair';
export type ChartContext = {
  chartId: string; mint: string; pool: string; symbol: string; interval: Interval;
  chartMode: ChartMode; priceMode: 'price' | 'mcap'; indicators: string[]; source: string;
  fetchedAt: number | null; lastCandleAt: number | null; stale: boolean;
  scope: 'pool' | 'token'; volumeUnit: 'usd' | 'token'; candleCount: number;
};
export type ChartRangeEvidence = ChartContext & {
  from: number; to: number; bars: Candle[]; truncated: boolean; totalInRange: number;
  note: string;
};
export type ChartCommand = { chartId?: string; interval?: Interval; chartMode?: ChartMode };
const contexts = new Map<string, { context: ChartContext; bars: Candle[] }>();
export function publishChartContext(context: ChartContext, bars: Candle[]) {
  contexts.set(context.chartId, { context, bars });
  window.dispatchEvent(new CustomEvent(CHART_CONTEXT_EVENT, { detail: context }));
}
export function removeChartContext(id: string) { contexts.delete(id); }
export function getChartContexts(): ChartContext[] { return [...contexts.values()].map(c => ({ ...c.context, indicators: [...c.context.indicators] })); }
export function getChartData(chartId = 'primary', range: { from?: number; to?: number; maxBars?: number } = {}): ChartRangeEvidence | null {
  const record = contexts.get(chartId);
  if (!record?.bars.length) return null;
  const from = Number.isFinite(range.from) ? range.from! : record.bars[0].t;
  const to = Number.isFinite(range.to) ? range.to! : record.bars.at(-1)!.t;
  if (from > to) return null;
  const selected = record.bars.filter(b => b.t >= from && b.t <= to);
  const limit = Math.max(1, Math.min(500, Number.isFinite(range.maxBars) ? Math.floor(range.maxBars!) : 200));
  return { ...record.context, indicators: [...record.context.indicators], from, to,
    bars: selected.slice(-limit).map(b => ({ ...b })), totalInRange: selected.length, truncated: selected.length > limit,
    note: 'Original source OHLCV only; excludes provisional spot, Heikin Ashi and hypothetical scenarios. Timestamps are UTC candle bucket starts. No transaction or causal event evidence is inferred.' };
}
export function validateChartSettings(input: unknown): ChartSettings | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<ChartSettings>;
  if (raw.version !== 1 || !CHART_MODES.includes(raw.chartMode!)) return null;
  const supplied = raw.indicators;
  const indicators = { ...DEFAULT_INDICATORS, enabled: [] } as IndicatorSettings;
  if (supplied && typeof supplied === 'object') {
    indicators.enabled = [...new Set(Array.isArray(supplied.enabled) ? supplied.enabled.filter(id => INDICATOR_IDS.includes(id)) : [])];
    for (const key of ['sma', 'ema', 'rsi', 'bollinger', 'volumeMA', 'macdFast', 'macdSlow', 'macdSignal'] as const) {
      const value = supplied[key];
      if (Number.isInteger(value) && value >= 1 && value <= 500) indicators[key] = value;
    }
    if (Number.isFinite(supplied.deviations) && supplied.deviations > 0 && supplied.deviations <= 10) indicators.deviations = supplied.deviations;
  }
  return { version: 1, chartMode: raw.chartMode!, log: raw.log === true,
    interval: CANDLE_IVS.includes(raw.interval!) ? raw.interval : undefined,
    priceMode: raw.priceMode === 'mcap' ? 'mcap' : 'price',
    showVolume: typeof raw.showVolume === 'boolean' ? raw.showVolume : undefined, indicators };
}
export function loadChartSettings(key: string): ChartSettings {
  try { return validateChartSettings(JSON.parse(localStorage.getItem(`tail:v2:chart:${key}`) ?? 'null')) ?? defaultSettings(); }
  catch { return defaultSettings(); }
}
export function defaultSettings(): ChartSettings { return { version: 1, chartMode: 'candles', log: false, indicators: { ...DEFAULT_INDICATORS, enabled: [] } }; }
export function saveChartSettings(key: string, value: ChartSettings) { try { localStorage.setItem(`tail:v2:chart:${key}`, JSON.stringify(value)); } catch { /* chart remains usable without storage */ } }
export function downloadChartJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
