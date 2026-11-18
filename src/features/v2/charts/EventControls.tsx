import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ISeriesApi } from 'lightweight-charts';
import type { Candle, Interval } from '../../../lib/axiom';
import { parseRuleEvents } from '../alerts/model';
import { parseJournal } from '../journal/model';
import { useBrowserData } from '../storage';
import { buildChartEventModel, createChartEventOverlay, DEFAULT_CHART_EVENTS, type ChartEventOptions } from './events';

type PriceSeries = ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'>;
/** Original historical bars only: do not pass provisional spot or scenario data. */
export function useChartEvents({ mint, bars, interval, series, ready = true }: {
  mint: string; bars: readonly Candle[]; interval: Interval;
  series: RefObject<PriceSeries | null>; ready?: boolean;
}) {
  const alerts = useBrowserData('alert-events', parseRuleEvents, []);
  const journal = useBrowserData('journal', parseJournal, []);
  const [options, setOptions] = useState<ChartEventOptions>(() => ({ ...DEFAULT_CHART_EVENTS }));
  const overlay = useRef<ReturnType<typeof createChartEventOverlay> | null>(null);
  const model = useMemo(() => buildChartEventModel({ mint, bars, interval, alerts: alerts.value, journal: journal.value, options }), [mint, bars, interval, alerts.value, journal.value, options]);
  const enabled = options.alerts || options.manualJournal;
  useEffect(() => {
    if (!enabled || !ready || !series.current) return;
    const attached = createChartEventOverlay(series.current);
    overlay.current = attached;
    return () => { attached.detach(); if (overlay.current === attached) overlay.current = null; };
  }, [enabled, ready, series]);
  useEffect(() => { overlay.current?.update(model); }, [model, enabled, ready, series]);
  return { model, options, setOptions, storageError: alerts.storageError || journal.storageError };
}
export type ChartEventsState = ReturnType<typeof useChartEvents>;
export function EventControls({ state }: { state: ChartEventsState }) {
  const { options, setOptions, model } = state;
  return <details className="chart-disclosure chart-event-controls"><summary>Local event markers · {model.events.length} shown</summary>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 8 }}>
      <label><input type="checkbox" checked={options.alerts} onChange={event => setOptions(previous => ({ ...previous, alerts: event.target.checked }))} /> Local alert observations</label>
      <label><input type="checkbox" checked={options.manualJournal} onChange={event => setOptions(previous => ({ ...previous, manualJournal: event.target.checked }))} /> Manual journal annotations · unverified</label>
    </div>
    <p className="chart-help">{model.note} Both sources are off by default. Wallet purchases, migration and liquidity-event markers remain unavailable without verified event evidence.</p>
    {model.truncated && <p role="status">Showing the latest {model.events.length} of {model.totalInRange} matching annotations in loaded candle buckets.</p>}
    {!!model.omittedOutsideHistory && <p role="status">{model.omittedOutsideHistory} matching annotations have no loaded source candle bucket and are omitted.</p>}
    {state.storageError && <p role="alert">{state.storageError}</p>}
    {!!model.events.length && <ol aria-label="Chart annotation sources" style={{ maxHeight: 240, overflow: 'auto', paddingRight: 8 }}>{model.events.map(event => <li key={event.id}>
      <b>{event.title}</b><p>{event.detail}</p><small>{event.source}<br />{event.timeBasis === 'local-alert-observation' ? 'Local observation' : 'Manual entry time'}: {new Date(event.at).toISOString()}<br />Source event time: {event.sourceObservedAt === null ? 'unavailable' : new Date(event.sourceObservedAt).toISOString()}<br />Displayed candle: {new Date(event.candleAt).toISOString()} UTC<br />{event.note}</small>
    </li>)}</ol>}
    {!model.events.length && (options.alerts || options.manualJournal) && <p role="status">No matching annotations in loaded original source candle buckets.</p>}
  </details>;
}
