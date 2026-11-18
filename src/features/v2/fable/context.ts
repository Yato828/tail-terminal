import { useEffect, useState } from 'react';
import type { WorkspaceContext } from '../contracts';
import { isSolanaAddress } from '../../../lib/validation';
import { FABLE_INTERVALS, FABLE_MODES, parseWorkspaceContext } from './contracts';
export const FABLE_WORKSPACE_EVENT = 'tail:workspace-context';
export type FableRange = { mint: string; pool: string; from: number; to: number; interval: typeof FABLE_INTERVALS[number]; source: string | null };
export function parseChartRange(value: unknown): FableRange | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const mint = r.mint, pool = r.pool ?? r.poolAddress, from = r.from ?? r.fromMs ?? r.startTime, to = r.to ?? r.toMs ?? r.endTime;
  if (!isSolanaAddress(mint) || !isSolanaAddress(pool) || typeof from !== 'number' || typeof to !== 'number' || !Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= from || to - from > 7 * 86400000 || !FABLE_INTERVALS.includes(r.interval as typeof FABLE_INTERVALS[number])) return null;
  return { mint, pool, from, to, interval: r.interval as FableRange['interval'], source: typeof r.source === 'string' ? r.source.slice(0, 120) : null };
}
export function useFableContext(mint: string | null, allowPortfolio = false) {
  const [context, setContext] = useState<WorkspaceContext>({ mint, interval: '1h', chartMode: 'candles', filters: null, widgets: [], allowPortfolio: false });
  const [range, setRange] = useState<FableRange | null>(null);
  useEffect(() => {
    const workspace = (event: Event) => { try { const parsed = parseWorkspaceContext((event as CustomEvent).detail); if (parsed) setContext(parsed); } catch { /* Untrusted context cannot change UI state. */ } };
    const chart = (event: Event) => { const value = (event as CustomEvent).detail; if (!value || typeof value !== 'object' || (mint && value.mint !== mint)) return; setContext(previous => ({ ...previous, ...(FABLE_INTERVALS.includes(value.interval) ? { interval: value.interval } : {}), ...(FABLE_MODES.includes(value.chartMode ?? value.mode) ? { chartMode: value.chartMode ?? value.mode } : {}) })); };
    const selected = (event: Event) => { const parsed = parseChartRange((event as CustomEvent).detail); if (parsed) setRange(parsed); };
    window.addEventListener(FABLE_WORKSPACE_EVENT, workspace); window.addEventListener('tail:chart-context', chart); window.addEventListener('tail:chart-range', selected);
    window.dispatchEvent(new CustomEvent('tail:request-workspace-context'));
    return () => { window.removeEventListener(FABLE_WORKSPACE_EVENT, workspace); window.removeEventListener('tail:chart-context', chart); window.removeEventListener('tail:chart-range', selected); };
  }, [mint]);
  return { context: { ...context, mint, allowPortfolio }, range: range?.mint === mint ? range : null };
}
