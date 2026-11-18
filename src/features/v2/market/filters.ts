import { MARKET_FIELDS, type FilterNode, type FilterPreset, type FilterResult, type MarketField, type MarketSnapshot, type MarketValue } from './types';
const OPS = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'exists', 'missing'];
export function validateFilter(input: unknown): { valid: boolean; errors: string[]; filter?: FilterNode } {
  const errors: string[] = []; let count = 0;
  function walk(value: unknown, depth: number, path: string): boolean {
    if (++count > 100 || depth > 6) { errors.push(`${path}: filter exceeds 100 nodes or 6 nesting levels`); return false; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${path}: expected rule or group`); return false; }
    const v = value as Record<string, unknown>;
    const allowed = 'logic' in v ? ['logic', 'rules'] : ['field', 'op', 'value'];
    if (Object.keys(v).some(key => !allowed.includes(key))) { errors.push(`${path}: unexpected filter property`); return false; }
    if ('logic' in v) {
      if (!['and', 'or'].includes(String(v.logic)) || !Array.isArray(v.rules) || v.rules.length > 40) { errors.push(`${path}: group needs and/or and at most 40 rules`); return false; }
      if (v.logic === 'or' && !v.rules.length) { errors.push(`${path}: OR group needs at least one rule`); return false; }
      return v.rules.map((r, i) => walk(r, depth + 1, `${path}.${i + 1}`)).every(Boolean);
    }
    if (typeof v.field !== 'string' || !Object.hasOwn(MARKET_FIELDS, v.field) || typeof v.op !== 'string' || !OPS.includes(v.op)) { errors.push(`${path}: unsupported field or operator`); return false; }
    if (v.op === 'exists' || v.op === 'missing') return true;
    const type = MARKET_FIELDS[v.field as MarketField];
    if (typeof v.value !== type || (typeof v.value === 'number' && !Number.isFinite(v.value)) || (typeof v.value === 'string' && v.value.length > 120)) { errors.push(`${path}: ${v.field} requires a finite ${type} value`); return false; }
    if (['gt', 'gte', 'lt', 'lte'].includes(v.op) && type !== 'number') { errors.push(`${path}: ordering operators require numeric fields`); return false; }
    return true;
  }
  const valid = walk(input, 0, 'Filter');
  return valid ? { valid, errors, filter: structuredClone(input) as FilterNode } : { valid, errors };
}
/** Kleene three-valued evaluation: unavailable and stale evidence never becomes zero or false. */
export function evaluateFilter(snapshot: MarketSnapshot, filter: FilterNode): FilterResult {
  if ('logic' in filter) {
    const results = filter.rules.map(rule => evaluateFilter(snapshot, rule));
    if (filter.logic === 'and') return results.includes('no-match') ? 'no-match' : results.includes('unknown') ? 'unknown' : 'match';
    return results.includes('match') ? 'match' : results.includes('unknown') ? 'unknown' : 'no-match';
  }
  const evidence = snapshot.fields[filter.field], value = evidence?.value;
  if (filter.op === 'missing') return value === null || value === undefined ? 'match' : 'no-match';
  if (filter.op === 'exists') return value === null || value === undefined ? 'no-match' : evidence.status === 'ready' ? 'match' : 'unknown';
  if (value === null || value === undefined || evidence.status !== 'ready') return 'unknown';
  const expected = filter.value;
  if (typeof expected !== typeof value) return 'unknown';
  let result = false;
  switch (filter.op) {
    case 'eq': result = value === expected; break;
    case 'neq': result = value !== expected; break;
    case 'gt': result = typeof value === 'number' && typeof expected === 'number' && value > expected; break;
    case 'gte': result = typeof value === 'number' && typeof expected === 'number' && value >= expected; break;
    case 'lt': result = typeof value === 'number' && typeof expected === 'number' && value < expected; break;
    case 'lte': result = typeof value === 'number' && typeof expected === 'number' && value <= expected; break;
  }
  return result ? 'match' : 'no-match';
}
export function sortMarketSnapshots(items: MarketSnapshot[], field: MarketField, direction: 'asc' | 'desc') {
  return [...items].sort((a, b) => {
    const av = a.fields[field], bv = b.fields[field];
    const x = av.status === 'ready' ? av.value : null, y = bv.status === 'ready' ? bv.value : null;
    if (x === null) return y === null ? a.mint.localeCompare(b.mint) : 1;
    if (y === null) return -1;
    const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return cmp * (direction === 'asc' ? 1 : -1) || a.mint.localeCompare(b.mint);
  });
}
export function filterMarketSnapshots(items: MarketSnapshot[], filter: FilterNode) {
  const results = items.map(snapshot => ({ snapshot, result: evaluateFilter(snapshot, filter) }));
  return { matches: results.filter(r => r.result === 'match').map(r => r.snapshot), unknown: results.filter(r => r.result === 'unknown').map(r => r.snapshot) };
}
const PRESETS_KEY = 'tail.v2.market-presets.v1';
export function parseFilterPresets(input: unknown): FilterPreset[] {
  if (!Array.isArray(input) || input.length > 50) throw new Error('Expected at most 50 filter presets');
  const ids = new Set<string>();
  return input.map((value, index) => {
    if (!value || typeof value !== 'object') throw new Error(`Preset ${index + 1}: invalid object`);
    const v = value as FilterPreset, validation = validateFilter(v.filter);
    if (v.version !== 1 || typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v.id) || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 80 || !validation.valid || !v.sort || !Object.hasOwn(MARKET_FIELDS, v.sort.field) || !['asc', 'desc'].includes(v.sort.direction) || typeof v.signal !== 'boolean') throw new Error(`Preset ${index + 1}: invalid name, sort or filter. ${validation.errors.join('; ')}`);
    if (ids.has(v.id)) throw new Error(`Preset ${index + 1}: duplicate identifier`);
    ids.add(v.id);
    return { version: 1, id: v.id, name: v.name.trim(), filter: validation.filter!, sort: { field: v.sort.field, direction: v.sort.direction }, signal: v.signal };
  });
}
export function importFilterPresets(text: string): FilterPreset[] { if (text.length > 131072) throw new Error('Preset import exceeds 128 KiB'); return parseFilterPresets(JSON.parse(text)); }
export function readFilterPresets(): FilterPreset[] { try { return importFilterPresets(localStorage.getItem(PRESETS_KEY) ?? '[]'); } catch { return []; } }
export function writeFilterPresets(presets: FilterPreset[]) { localStorage.setItem(PRESETS_KEY, JSON.stringify(parseFilterPresets(presets))); }
export function exportFilterPresets(presets: FilterPreset[]) { return JSON.stringify(parseFilterPresets(presets), null, 2); }
export const EMPTY_FILTER: FilterNode = { logic: 'and', rules: [] };
export function filterValue(field: MarketField, value: string): MarketValue {
  return MARKET_FIELDS[field] === 'number' ? (value.trim() === '' ? NaN : Number(value)) : MARKET_FIELDS[field] === 'boolean' ? value === 'true' : value;
}
