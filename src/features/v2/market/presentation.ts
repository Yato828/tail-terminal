import { fmtUsd } from '../../../lib/format';
import type { MarketField, MarketSnapshot } from './types';
export function marketValueLabel(snapshot: MarketSnapshot, field: MarketField): string {
  const e = snapshot.fields[field];
  if (e.value === null) return 'Unavailable';
  const value = typeof e.value === 'number' ? field.includes('Usd') || ['marketCap', 'fdv', 'volume24h', 'volume1h', 'volume5m'].includes(field) ? fmtUsd(e.value) : e.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + (field.startsWith('change') ? '%' : field === 'ageMinutes' ? ' min' : '') : String(e.value);
  return `${value}${e.status === 'stale' ? ' · stale' : ''}`;
}
export function evidenceTitle(snapshot: MarketSnapshot, field: MarketField): string {
  const e = snapshot.fields[field]; return `${e.source} · fetched ${new Date(e.fetchedAt).toLocaleString()} · source event time ${e.observedAt ? new Date(e.observedAt).toLocaleString() : 'unavailable'} · ${e.status}. ${e.note ?? ''}`;
}
