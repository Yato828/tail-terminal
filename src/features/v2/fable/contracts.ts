import type { WorkspaceAction, WorkspaceContext } from '../contracts';
import { isSolanaAddress } from '../../../lib/validation';
import { validateFilter } from '../market/filters';
export const FABLE_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export const FABLE_MODES = ['candles', 'candlestick', 'line', 'area', 'heikin-ashi', 'heikin', 'price', 'market-cap', 'marketCap', 'log', 'linear', 'volume'] as const;
export const FABLE_WIDGETS = ['terminal', 'astra', 'xray', 'watch', 'smart', 'kol', 'exit', 'markets', 'pulse', 'trends', 'new', 'network', 'holders', 'flow', 'swap', 'launch', 'tweet', 'website', 'settings', 'charts', 'compare', 'intelligence2', 'journal', 'signals', 'data', 'fabletools', 'social', 'routes', 'portfolio', 'studio', 'trending', 'chart', 'trade', 'fable'] as const;
export type FableUsage = { requests: number; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; estimatedCostUsd: number | null; pricingSource: string | null };
export type FableRequestOptions = { workspaceContext?: WorkspaceContext | null; stream?: boolean; onTextDelta?: (text: string) => void };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
export function validateWorkspaceAction(value: unknown): WorkspaceAction {
  if (!object(value) || typeof value.type !== 'string') throw new Error('Invalid workspace proposal');
  switch (value.type) {
    case 'open_widget':
      if (keys(value, ['type', 'widget']) && typeof value.widget === 'string' && FABLE_WIDGETS.includes(value.widget as typeof FABLE_WIDGETS[number])) return { type: 'open_widget', widget: value.widget };
      break;
    case 'set_interval':
      if (keys(value, ['type', 'interval']) && FABLE_INTERVALS.includes(value.interval as typeof FABLE_INTERVALS[number])) return { type: 'set_interval', interval: value.interval as typeof FABLE_INTERVALS[number] };
      break;
    case 'search_tokens':
      if (keys(value, ['type', 'query']) && typeof value.query === 'string' && value.query.trim() && value.query.length <= 120) return { type: 'search_tokens', query: value.query.trim() };
      break;
    case 'compare_tokens':
      if (keys(value, ['type', 'mints']) && Array.isArray(value.mints) && value.mints.length >= 1 && value.mints.length <= 4 && value.mints.every(isSolanaAddress)) return { type: 'compare_tokens', mints: [...new Set(value.mints)] };
      break;
    case 'save_filter': {
      const filter = validateFilter(value.filter);
      if (keys(value, ['type', 'name', 'filter']) && typeof value.name === 'string' && value.name.trim() && value.name.length <= 80 && filter.valid) return { type: 'save_filter', name: value.name.trim(), filter: filter.filter! };
      break;
    }
  }
  throw new Error('Unsupported or invalid workspace proposal');
}
export function parseWorkspaceProposals(value: unknown): WorkspaceAction[] {
  if (!Array.isArray(value) || value.length > 6) throw new Error('Expected at most six workspace proposals');
  return value.map(validateWorkspaceAction);
}
export function parseWorkspaceContext(value: unknown): WorkspaceContext | null {
  if (value == null) return null;
  if (!object(value) || !keys(value, ['mint', 'interval', 'chartMode', 'filters', 'widgets', 'allowPortfolio']) || (value.mint !== null && !isSolanaAddress(value.mint)) || !FABLE_INTERVALS.includes(value.interval as typeof FABLE_INTERVALS[number]) || typeof value.chartMode !== 'string' || !FABLE_MODES.includes(value.chartMode as typeof FABLE_MODES[number]) || !Array.isArray(value.widgets) || value.widgets.length > 32 || value.widgets.some(w => typeof w !== 'string' || !FABLE_WIDGETS.includes(w as typeof FABLE_WIDGETS[number])) || typeof value.allowPortfolio !== 'boolean') throw new Error('Invalid workspace context');
  const filter = value.filters == null ? null : validateFilter(value.filters);
  if (filter && !filter.valid) throw new Error('Invalid workspace filter context');
  return { mint: value.mint as string | null, interval: value.interval as typeof FABLE_INTERVALS[number], chartMode: value.chartMode, filters: filter?.filter ?? null, widgets: [...new Set(value.widgets as string[])], allowPortfolio: value.allowPortfolio };
}
export function parseUsage(value: unknown): FableUsage | undefined {
  if (!object(value) || !Number.isSafeInteger(value.requests) || Number(value.requests) < 0 || Number(value.requests) > 3) return;
  const token = (n: unknown) => n === null || (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0);
  if (![value.inputTokens, value.outputTokens, value.totalTokens].every(token) || !(value.estimatedCostUsd === null || (typeof value.estimatedCostUsd === 'number' && Number.isFinite(value.estimatedCostUsd) && value.estimatedCostUsd >= 0)) || !(value.pricingSource === null || (typeof value.pricingSource === 'string' && value.pricingSource.length <= 160))) return;
  return value as FableUsage;
}
