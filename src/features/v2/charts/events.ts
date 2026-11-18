import { createSeriesMarkers, type ISeriesApi, type SeriesMarker, type SeriesType, type Time, type UTCTimestamp } from 'lightweight-charts';
import { IV_MS, type Candle, type Interval } from '../../../lib/axiom';
import { isSolanaAddress } from '../../../lib/validation';

export type ChartEventOptions = { alerts: boolean; manualJournal: boolean };
export const DEFAULT_CHART_EVENTS: ChartEventOptions = { alerts: false, manualJournal: false };
export const CHART_EVENT_LIMIT = 40;
export type LocalChartEvent = {
  id: string;
  kind: 'alert' | 'manual-journal';
  mint: string;
  at: number;
  sourceObservedAt: number | null;
  timeBasis: 'local-alert-observation' | 'manual-entry';
  title: string;
  source: string;
  detail: string;
  note: string;
};
export type MappedChartEvent = LocalChartEvent & { candleAt: number };
export type ChartEventModel = {
  events: MappedChartEvent[];
  markers: SeriesMarker<UTCTimestamp>[];
  totalInRange: number;
  omittedOutsideHistory: number;
  truncated: boolean;
  note: string;
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validTime = (value: unknown, now: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= now;
const text = (value: string, length: number) => value.slice(0, length).replace(/[\u0000-\u001f]/g, ' ');

/** Browser records are annotations, not independently verified executions. */
export function normalizeChartEvents(alerts: unknown, journal: unknown, now = Date.now()): LocalChartEvent[] {
  const output: LocalChartEvent[] = [], ids = new Set<string>();
  if (Array.isArray(alerts)) for (const row of alerts.slice(0, 500)) {
    if (!record(row) || typeof row.id !== 'string' || !/^[\w-]{1,80}$/.test(row.id) || typeof row.ruleId !== 'string' || !row.ruleId || typeof row.label !== 'string' || !isSolanaAddress(row.mint) || !validTime(row.at, now) || typeof row.source !== 'string' || !row.source.trim() || typeof row.detail !== 'string') continue;
    const id = `alert:${row.id}`;
    if (ids.has(id)) continue;
    ids.add(id);
    const sourceObservedAt = validTime(row.observedAt, now) ? row.observedAt : null;
    output.push({ id, kind: 'alert', mint: row.mint, at: row.at, sourceObservedAt,
      timeBasis: 'local-alert-observation', title: `Alert observed · ${text(row.label, 100)}`,
      source: text(row.source, 200), detail: text(row.detail, 1000),
      note: 'Placed by the local alert observation/fetch time, not a block timestamp. Source event time is shown separately when supplied. A stored alert is not proof of a purchase, migration or cause of price movement.' });
  }
  if (Array.isArray(journal)) for (const row of journal.slice(0, 500)) {
    if (!record(row) || typeof row.id !== 'string' || !/^[\w-]{1,80}$/.test(row.id) || !isSolanaAddress(row.mint) || !validTime(row.at, now) || !['buy', 'sell', 'transfer', 'note'].includes(String(row.side)) || !['manual', 'confirmed-execution'].includes(String(row.origin)) || typeof row.reason !== 'string' || typeof row.notes !== 'string' || !Array.isArray(row.tags) || !row.tags.every(t => typeof t === 'string')) continue;
    if (![row.quantity, row.priceUsd, row.feeUsd].every(value => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0)) continue;
    const id = `journal:${row.id}`;
    if (ids.has(id)) continue;
    ids.add(id);
    output.push({ id, kind: 'manual-journal', mint: row.mint, at: row.at, sourceObservedAt: null,
      timeBasis: 'manual-entry', title: `Manual journal · ${row.side}`, source: 'User-entered browser journal · unverified',
      detail: text([row.reason, row.notes].filter(Boolean).join(' · '), 1000),
      note: 'User-entered journal time and action; not an independently verified trade. A supplied signature does not establish execution or wallet ownership.' });
  }
  return output;
}

export function buildChartEventModel({ mint, bars, interval, alerts, journal, options = DEFAULT_CHART_EVENTS, now = Date.now(), limit = CHART_EVENT_LIMIT }: {
  mint: string; bars: readonly Pick<Candle, 't'>[]; interval: Interval;
  alerts: unknown; journal: unknown; options?: ChartEventOptions; now?: number; limit?: number;
}): ChartEventModel {
  const note = 'Markers use existing source candle buckets in UTC. Alert placement uses local observation time; manual journal entries are unverified. No nearest-candle clamping, inferred trades or causal claims.';
  const empty: ChartEventModel = { events: [], markers: [], totalInRange: 0, omittedOutsideHistory: 0, truncated: false, note };
  const step = IV_MS[interval];
  if (!isSolanaAddress(mint) || !step || !bars.length || (!options.alerts && !options.manualJournal)) return empty;
  // Only exact interval-aligned source buckets can anchor markers. A history gap,
  // partial unaligned bucket or absent current candle does not become evidence.
  const sourceTimes = new Set(bars.map(b => b.t).filter(t => Number.isSafeInteger(t) && t > 0 && t % step === 0));
  if (!sourceTimes.size) return empty;
  const matching = normalizeChartEvents(alerts, journal, now).filter(event => event.mint === mint && (event.kind === 'alert' ? options.alerts : options.manualJournal));
  const mapped: MappedChartEvent[] = [];
  let omittedOutsideHistory = 0;
  for (const event of matching) {
    const candleAt = Math.floor(event.at / step) * step;
    if (!sourceTimes.has(candleAt)) { omittedOutsideHistory++; continue; }
    mapped.push({ ...event, candleAt });
  }
  mapped.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const count = Number.isFinite(limit) ? Math.max(1, Math.min(CHART_EVENT_LIMIT, Math.floor(limit))) : CHART_EVENT_LIMIT;
  const events = mapped.slice(-count);
  return { events, totalInRange: mapped.length, omittedOutsideHistory, truncated: mapped.length > events.length, note,
    markers: events.map(event => ({ id: event.id, time: Math.floor(event.candleAt / 1000) as UTCTimestamp,
      position: event.kind === 'alert' ? 'aboveBar' : 'belowBar', shape: event.kind === 'alert' ? 'circle' : 'square',
      color: event.kind === 'alert' ? '#ff963b' : '#b7a280', size: 1,
      text: event.kind === 'alert' ? 'Alert observed' : 'Manual journal' })) };
}

/** Attach to the currently visible price series. Detach before chart removal. */
export function createChartEventOverlay(series: ISeriesApi<SeriesType, Time>) {
  const plugin = createSeriesMarkers(series, [], { autoScale: false });
  let detached = false;
  return {
    update(model: Pick<ChartEventModel, 'markers'>) { if (!detached) plugin.setMarkers(model.markers); },
    clear() { if (!detached) plugin.setMarkers([]); },
    detach() {
      if (detached) return;
      detached = true;
      // React's parent may already have removed the chart during unmount.
      try { plugin.detach(); } catch { /* A removed chart has no overlay left to clear. */ }
    },
  };
}
