import { isSolanaAddress } from '../../../lib/validation';
import { validateChartSettings, type ChartSettings } from '../charts/state';

export const STUDIO_WIDGETS = ['chart', 'stats', 'discovery', 'intelligence', 'routes', 'fable'] as const;
export type StudioWidget = typeof STUDIO_WIDGETS[number];
export type TokenScope = 'main' | 'A' | 'B' | 'independent';
export type StudioCard = {
  id: string; kind: StudioWidget; scope: TokenScope; mint: string | null;
  wallet: string | null; span: 1 | 2; height: number; pinned: boolean; hidden: boolean;
  chartSettings?: ChartSettings;
};
export type StudioLayout = { id: string; name: string; groups: { A: string | null; B: string | null }; cards: StudioCard[] };
export type StudioState = { version: 1; layout: StudioLayout; presets: StudioLayout[] };
export const STUDIO_STORAGE_KEY = 'tail.v2.workspace-studio';
export const MAX_STUDIO_CARDS = 8;
export const MAX_STUDIO_IMPORT_BYTES = 131072;
export const WIDGET_LABELS: Record<StudioWidget, string> = { chart: 'Chart', stats: 'Market evidence', discovery: 'Discovery', intelligence: 'Wallet Intelligence', routes: 'Quote routes', fable: 'Fable' };
export const BUILTIN_PRESETS = ['Default', 'Scalping', 'Research', 'New Tokens', 'Wallet Tracking', 'Smart Money'] as const;
export type BuiltinPreset = typeof BUILTIN_PRESETS[number];
const presetWidgets: Record<BuiltinPreset, StudioWidget[]> = {
  Default: ['chart', 'stats'], Scalping: ['chart', 'chart', 'routes', 'stats'],
  Research: ['chart', 'stats', 'intelligence', 'fable'], 'New Tokens': ['discovery', 'chart', 'stats'],
  'Wallet Tracking': ['intelligence', 'stats', 'chart'], 'Smart Money': ['intelligence', 'chart', 'discovery'],
};
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const idValid = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9-]{1,70}$/.test(v);
const nullableAddress = (v: unknown): v is string | null => v === null || isSolanaAddress(v);
function parseCard(raw: unknown): StudioCard | null {
  if (!record(raw) || !idValid(raw.id) || !STUDIO_WIDGETS.includes(raw.kind as StudioWidget) || !['main', 'A', 'B', 'independent'].includes(String(raw.scope))) return null;
  if (!nullableAddress(raw.mint) || !nullableAddress(raw.wallet)) return null;
  if (raw.span !== 1 && raw.span !== 2) return null;
  if (typeof raw.height !== 'number' || !Number.isFinite(raw.height) || raw.height < 320 || raw.height > 1200) return null;
  if (typeof raw.pinned !== 'boolean' || typeof raw.hidden !== 'boolean' || (raw.pinned && raw.hidden)) return null;
  const chartSettings = raw.chartSettings === undefined ? undefined : validateChartSettings(raw.chartSettings);
  if (chartSettings === null) return null;
  return { id: raw.id, kind: raw.kind as StudioWidget, scope: raw.scope as TokenScope, mint: raw.mint, wallet: raw.wallet,
    span: raw.span, height: Math.round(raw.height), pinned: raw.pinned, hidden: raw.hidden, ...(chartSettings ? { chartSettings } : {}) };
}
export function parseStudioLayout(raw: unknown): StudioLayout | null {
  if (!record(raw) || !idValid(raw.id) || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 70 || !record(raw.groups)) return null;
  if (!nullableAddress(raw.groups.A) || !nullableAddress(raw.groups.B) || !Array.isArray(raw.cards) || !raw.cards.length || raw.cards.length > MAX_STUDIO_CARDS) return null;
  const cards = raw.cards.map(parseCard);
  if (cards.some(c => c === null) || new Set(cards.map(c => c!.id)).size !== cards.length) return null;
  return { id: raw.id, name: raw.name.trim(), groups: { A: raw.groups.A, B: raw.groups.B }, cards: cards as StudioCard[] };
}
export function validateStudioState(raw: unknown): StudioState | null {
  if (!record(raw) || raw.version !== 1 || !Array.isArray(raw.presets) || raw.presets.length > 12) return null;
  const layout = parseStudioLayout(raw.layout), presets = raw.presets.map(parseStudioLayout);
  if (!layout || presets.some(p => p === null) || new Set(presets.map(p => p!.id)).size !== presets.length) return null;
  return { version: 1, layout, presets: presets as StudioLayout[] };
}
export function makeStudioCard(kind: StudioWidget, id: string): StudioCard {
  return { id, kind, scope: 'main', mint: null, wallet: null, span: kind === 'discovery' || kind === 'intelligence' ? 2 : 1, height: kind === 'chart' ? 720 : 520, pinned: false, hidden: false };
}
export function studioPreset(name: BuiltinPreset): StudioLayout {
  const key = name.toLowerCase().replaceAll(' ', '-');
  return { id: `builtin-${key}`, name, groups: { A: null, B: null }, cards: presetWidgets[name].map((kind, i) => ({ ...makeStudioCard(kind, `${key}-${i + 1}`), ...(name === 'Scalping' && i === 1 ? { scope: 'A' as const } : {}) })) };
}
export function defaultStudioState(): StudioState { return { version: 1, layout: studioPreset('Default'), presets: [] }; }
export function parseStudioState(raw: unknown): StudioState { return validateStudioState(raw) ?? defaultStudioState(); }
export function importStudio(text: string): StudioState {
  if (new TextEncoder().encode(text).length > MAX_STUDIO_IMPORT_BYTES) throw new Error('Workspace import must be at most 128 KB.');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('Workspace import is not valid JSON.'); }
  const parsed = validateStudioState(raw);
  if (!parsed) throw new Error('Workspace import must use version 1 with 1–8 valid widget instances, Solana contexts and at most 12 presets.');
  return parsed;
}
export function exportStudio(state: StudioState) { return JSON.stringify(state, null, 2); }
export function cardMint(card: StudioCard, layout: StudioLayout, mainMint: string | null): string | null {
  return card.scope === 'main' ? mainMint : card.scope === 'independent' ? card.mint : layout.groups[card.scope];
}
export function updateStudioCard(layout: StudioLayout, id: string, patch: Partial<Pick<StudioCard, 'scope' | 'mint' | 'wallet' | 'span' | 'height' | 'pinned' | 'hidden'>>): StudioLayout {
  const current = layout.cards.find(c => c.id === id);
  if (current?.pinned && (patch.span !== undefined || patch.height !== undefined || patch.hidden !== undefined)) return layout;
  const next = { ...layout, cards: layout.cards.map(card => card.id !== id ? card : { ...card, ...patch }) };
  return parseStudioLayout(next) ?? layout;
}
/** Locked instances keep their absolute position while movable slots reorder. */
export function moveStudioCard(layout: StudioLayout, sourceId: string, targetId: string): StudioLayout {
  const source = layout.cards.find(c => c.id === sourceId), target = layout.cards.find(c => c.id === targetId);
  if (!source || !target || source.pinned || target.pinned || sourceId === targetId) return layout;
  const movable = layout.cards.filter(c => !c.pinned);
  const from = movable.findIndex(c => c.id === sourceId), to = movable.findIndex(c => c.id === targetId);
  const [moved] = movable.splice(from, 1); movable.splice(to, 0, moved);
  let index = 0;
  return { ...layout, cards: layout.cards.map(card => card.pinned ? card : movable[index++]) };
}
export function addStudioCard(layout: StudioLayout, kind: StudioWidget, id: string): StudioLayout {
  if (layout.cards.length >= MAX_STUDIO_CARDS || layout.cards.some(c => c.id === id) || !idValid(id) || !STUDIO_WIDGETS.includes(kind)) return layout;
  return { ...layout, cards: [...layout.cards, makeStudioCard(kind, id)] };
}
export function removeStudioCard(layout: StudioLayout, id: string): StudioLayout {
  if (layout.cards.length <= 1 || layout.cards.find(c => c.id === id)?.pinned) return layout;
  return { ...layout, cards: layout.cards.filter(c => c.id !== id) };
}
