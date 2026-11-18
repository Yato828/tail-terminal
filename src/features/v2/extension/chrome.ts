type Store = { get: (key: string) => Promise<Record<string, unknown>>; set: (data: Record<string, unknown>) => Promise<void>; remove: (key: string) => Promise<void> };
export type ExtensionChrome = {
  runtime: { id: string; getURL: (path: string) => string; sendMessage: (message: unknown) => Promise<{ ok: boolean; error?: string }> };
  tabs: { query: (query: { active: boolean; currentWindow: boolean }) => Promise<Array<{ id?: number; windowId: number }>> };
  windows: { getCurrent: () => Promise<{ id?: number }> };
  sidePanel: { open: (options: { windowId: number }) => Promise<void> };
  storage: { session: Store; local: Store; onChanged: { addListener: (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => void; removeListener: (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => void } };
};
export const extensionChrome = () => (globalThis as unknown as { chrome?: ExtensionChrome }).chrome;
export const CONTEXT_KEY = 'tail.extension.context.v2';
export type SelectedContext = { version: 2; text: string; sourceUrl: string; at: number };
export function parseSelectedContext(raw: unknown, now = Date.now()): SelectedContext | null {
  const r = raw as SelectedContext;
  if (!r || r.version !== 2 || typeof r.text !== 'string' || r.text.length > 16000 || typeof r.sourceUrl !== 'string' || r.sourceUrl.length > 2048 || !Number.isFinite(r.at) || r.at > now + 5000 || now - r.at > 1800000) return null;
  return { ...r, text: r.text.slice(0, 16000) };
}
