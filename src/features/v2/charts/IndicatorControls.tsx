import { INDICATOR_IDS, type IndicatorSettings } from './math';
const labels = { sma: 'SMA', ema: 'EMA', vwap: 'VWAP', rsi: 'RSI', macd: 'MACD', bollinger: 'Bollinger Bands', volumeMA: 'Volume MA' };
export function IndicatorControls({ value, onChange, volumeUnit, counts }: { value: IndicatorSettings; onChange: (value: IndicatorSettings) => void; volumeUnit: 'usd' | 'token'; counts: Record<string, { length: number }> }) {
  const number = (key: keyof Omit<IndicatorSettings, 'enabled'>, label: string, max = 500) => <label key={key}>{label} <input type="number" aria-label={label} min="1" max={max} step={key === 'deviations' ? '0.1' : '1'} value={value[key]} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 1 && n <= max && (key === 'deviations' || Number.isInteger(n))) onChange({ ...value, [key]: n }); }} style={{ width: 66 }} /></label>;
  return <details className="chart-disclosure chart-indicators"><summary>Indicators · {value.enabled.length} enabled</summary>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 8 }}>
      {INDICATOR_IDS.map(id => <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><input type="checkbox" checked={value.enabled.includes(id)} onChange={e => onChange({ ...value, enabled: e.target.checked ? [...value.enabled, id] : value.enabled.filter(v => v !== id) })} />{labels[id]}{id === 'vwap' && volumeUnit !== 'token' ? ' · unavailable: USD turnover' : value.enabled.includes(id) && !(counts[id === 'bollinger' ? 'bbMiddle' : id]?.length) ? ' · warming up' : ''}</label>)}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 8 }}>
      {number('sma', 'SMA period')}{number('ema', 'EMA period')}{number('rsi', 'RSI period')}{number('bollinger', 'Bollinger period')}{number('deviations', 'Band deviations', 10)}{number('volumeMA', 'Volume MA period')}{number('macdFast', 'MACD fast')}{number('macdSlow', 'MACD slow')}{number('macdSignal', 'MACD signal')}
    </div>
    {value.macdFast >= value.macdSlow && <p role="alert">MACD fast period must be below slow period; MACD is hidden until corrected.</p>}
    <p className="chart-help">Local math on original source closes; provisional spot and scenarios are excluded. Full-period warm-up; EMA is SMA-seeded, RSI uses Wilder smoothing, bands use population deviation. VWAP uses typical price × base-token volume and resets at 00:00 UTC; the first loaded session may be partial. Volume MA retains the source volume unit.</p>
  </details>;
}
