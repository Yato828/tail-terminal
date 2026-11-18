import { useEffect, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, createChart, type UTCTimestamp } from 'lightweight-charts';
import { loadCandleResult, type AxiomCoin } from '../../../lib/axiom';
import { errorMessage } from '../../../lib/validation';
import { usePreferences } from '../../preferences/preferences';
export function CompactChart({ coin }: { coin: AxiomCoin }) {
  const host = useRef<HTMLDivElement>(null), [status, setStatus] = useState('Loading source candles…'), [retry, setRetry] = useState(0);
  const { preferences: p } = usePreferences();
  useEffect(() => {
    let cancelled = false; setStatus('Loading source candles…');
    const chart = createChart(host.current!, { autoSize: true, height: 180, layout: { background: { type: ColorType.Solid, color: '#171311' }, textColor: '#baa696', attributionLogo: false }, grid: { vertLines: { visible: false }, horzLines: { color: '#30261f' } }, timeScale: { timeVisible: true } });
    const series = chart.addSeries(CandlestickSeries, { upColor: p.upColor, downColor: p.downColor, borderVisible: false, wickUpColor: p.upColor, wickDownColor: p.downColor });
    void loadCandleResult(coin.pairAddress, '5m', coin.address).then(result => {
      if (cancelled) return;
      series.setData(result.bars.map(c => ({ time: Math.floor(c.t / 1000) as UTCTimestamp, open: c.o, high: c.h, low: c.l, close: c.c })));
      chart.timeScale().fitContent(); setStatus(result.bars.length ? `${result.source} · 5m USD OHLC · fetched ${new Date(result.fetchedAt).toLocaleTimeString()}` : 'No source candles available.');
    }).catch(e => { if (!cancelled) setStatus(errorMessage(e)); });
    return () => { cancelled = true; chart.remove(); };
  }, [coin.address, coin.pairAddress, p.upColor, p.downColor, retry]);
  return <section aria-label="Compact source chart"><div ref={host} className="v2-compact-chart" /><small role="status">{status} · manual refresh, no inferred candles</small><button onClick={() => setRetry(v => v + 1)}>Refresh chart</button></section>;
}
