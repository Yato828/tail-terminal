import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { LineSeries, HistogramSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '../../../lib/axiom';
import { calculateIndicators, type IndicatorSettings } from './math';

const COLORS: Record<string, string> = { sma: '#edb26b', ema: '#c798ec', vwap: '#7fc2d0', rsi: '#c798ec', macd: '#edb26b', macdSignal: '#7fc2d0', macdHistogram: '#c798ec', bbMiddle: '#b7a280', bbUpper: '#a1b7b0', bbLower: '#a1b7b0', volumeMA: '#edb26b' };
export function useIndicators(api: RefObject<IChartApi | null>, bars: Candle[], settings: IndicatorSettings, volumeUnit: 'usd' | 'token', multiplier: number, showVolume: boolean, ready: boolean) {
  const active = useRef<Map<string, ISeriesApi<'Line'> | ISeriesApi<'Histogram'>>>(new Map());
  const data = useMemo(() => calculateIndicators(bars, settings, volumeUnit), [bars, settings, volumeUnit]);
  const shape = Object.keys(data).join(':');
  useEffect(() => {
    const chart = api.current;
    if (!chart || !ready) return;
    const map = new Map<string, ISeriesApi<'Line'> | ISeriesApi<'Histogram'>>();
    let rsiPane = -1, macdPane = -1;
    for (const id of shape.split(':').filter(Boolean)) {
      let pane = 0;
      if (id === 'rsi') { if (rsiPane < 0) rsiPane = chart.panes().length; pane = rsiPane; }
      if (id.startsWith('macd')) { if (macdPane < 0) macdPane = chart.panes().length; pane = macdPane; }
      const options = { color: COLORS[id], title: id === 'volumeMA' ? 'Volume MA' : id.toUpperCase(), priceLineVisible: false, lastValueVisible: true,
        priceScaleId: id === 'volumeMA' ? 'volume' : 'right',
        priceFormat: id === 'rsi' ? { type: 'price' as const, precision: 2, minMove: 0.01 } : id === 'volumeMA' ? { type: 'volume' as const } : { type: 'price' as const, precision: 10, minMove: 0.0000000001 } };
      const series = id === 'macdHistogram' ? chart.addSeries(HistogramSeries, options, pane) : chart.addSeries(LineSeries, { ...options, lineWidth: 1, crosshairMarkerVisible: false }, pane);
      map.set(id, series);
      if (pane > 0) chart.panes()[pane]?.setHeight(105);
    }
    active.current = map;
    return () => { for (const series of map.values()) chart.removeSeries(series); active.current = new Map(); };
  }, [api, shape, ready]);
  useEffect(() => {
    for (const [id, series] of active.current) {
      series.applyOptions({ visible: id !== 'volumeMA' || showVolume });
      const scale = id === 'rsi' || id === 'volumeMA' ? 1 : multiplier;
      series.setData((data[id] ?? []).filter(p => Number.isFinite(p.value)).map(p => ({ time: Math.floor(p.t / 1000) as UTCTimestamp, value: p.value * scale })));
    }
  }, [data, shape, multiplier, showVolume, ready]);
  return data;
}
