import { useEffect, useState } from "react";
import { readLocal, saveLocal } from "../../lib/validation";
export const WIDGETS = [
  "pulse",
  "smart",
  "trending",
  "chart",
  "trade",
  "fable",
] as const;
export type WidgetId = (typeof WIDGETS)[number];
export const PRESETS = [
  "Default",
  "Scalping",
  "Research",
  "New Launches",
  "New Tokens",
  "Wallet Tracking",
  "Smart Money",
] as const;
export type Preset = (typeof PRESETS)[number];
export type Layout = {
  id: string;
  name: string;
  order: WidgetId[];
  hidden: WidgetId[];
  pinned: WidgetId[];
  widths: number[];
  heights: Partial<Record<WidgetId, number>>;
};
export type Desk = { version: 1; active: string; layouts: Layout[] };
export function preset(name: Preset = "Default"): Layout {
  return {
    id: name,
    name,
    order:
      name === "Smart Money"
        ? ["smart", "pulse", "trending", "chart", "fable", "trade"]
        : name === "Research"
          ? ["pulse", "smart", "trending", "chart", "fable", "trade"]
          : [...WIDGETS],
    hidden: name === "Scalping" ? ["smart", "pulse"] : name==='Wallet Tracking'?['trade','pulse']:[],
    pinned: [],
    widths:
      name === "Research"
        ? [250, 440]
        : name === "Scalping"
          ? [210, 320]
          : [256, 364],
    heights: {},
  };
}
export function parseDesk(raw: unknown): Desk {
  const fallback: Desk = { version: 1, active: "Default", layouts: [preset()] };
  if (
    !raw ||
    typeof raw !== "object" ||
    (raw as Desk).version !== 1 ||
    !Array.isArray((raw as Desk).layouts)
  )
    return fallback;
  const layouts = (raw as Desk).layouts
    .slice(0, 12)
    .filter((l) => l && typeof l.id === "string" && typeof l.name === "string")
    .map((l) => ({
      id: l.id.slice(0, 80),
      name: l.name.slice(0, 40),
      order: [
        ...new Set([
          ...(Array.isArray(l.order)
            ? l.order.filter((i) => WIDGETS.includes(i))
            : []),
          ...WIDGETS,
        ]),
      ],
      hidden: Array.isArray(l.hidden)
        ? l.hidden.filter((i) => WIDGETS.includes(i))
        : [],
      pinned: Array.isArray(l.pinned)
        ? l.pinned.filter((i) => WIDGETS.includes(i))
        : [],
      widths: [0, 1].map((i) =>
        Number.isFinite(l.widths?.[i])
          ? Math.min(500, Math.max(200, l.widths[i]))
          : [256, 360][i],
      ),
      heights: Object.fromEntries(
        Object.entries(l.heights ?? {}).filter(
          ([k, v]) =>
            WIDGETS.includes(k as WidgetId) &&
            Number.isFinite(v) &&
            Number(v) >= 140 &&
            Number(v) <= 1200,
        ),
      ),
    }));
  if (!layouts.length) return fallback;
  return {
    version: 1,
    active: layouts.some((l) => l.id === (raw as Desk).active)
      ? (raw as Desk).active
      : layouts[0].id,
    layouts,
  };
}
export function exportDesk(desk:Desk){return JSON.stringify(parseDesk(desk),null,2);}
export function importDesk(text:string):Desk{
 if(text.length>131072)throw new Error('Workspace import exceeds 128 KB.');
 const raw=JSON.parse(text);
 if(!raw||raw.version!==1||!Array.isArray(raw.layouts)||!raw.layouts.length||raw.layouts.length>12)throw new Error('Invalid workspace format.');
 const ids=new Set<string>();
 for(const layout of raw.layouts){
  if(!layout||typeof layout.id!=='string'||!layout.id||ids.has(layout.id)||typeof layout.name!=='string'||!Array.isArray(layout.order)||layout.order.some((id:unknown)=>!WIDGETS.includes(id as WidgetId)))throw new Error('Workspace contains invalid or duplicate layouts/widgets.');
  ids.add(layout.id);
 }
 return parseDesk(raw);
}
export function useTailWorkspace() {
  const [desk, setDesk] = useState(() =>
    readLocal("tail.workspace.v1", parseDesk, parseDesk(null)),
  );
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    setStorageError(!saveLocal("tail.workspace.v1", desk));
  }, [desk]);
  const layout = desk.layouts.find((l) => l.id === desk.active)!;
  const commit = (next: Desk) => {
    const valid = parseDesk(next);
    const saved = saveLocal("tail.workspace.v1", valid);
    setStorageError(!saved);
    setDesk(valid);
    return saved;
  };
  const update = (patch: Partial<Layout>) =>
    commit({
      ...desk,
      layouts: desk.layouts.map((l) =>
        l.id === desk.active ? { ...l, ...patch } : l,
      ),
    });
  const applyPreset = (name: Preset) =>
    commit({
      ...desk,
      active: name,
      layouts: [...desk.layouts.filter((l) => l.id !== name), preset(name)],
    });
  const saveAs = (name: string) => {
    if (!name.trim() || desk.layouts.length >= 12) return false;
    const id = crypto.randomUUID();
    return commit({
      ...desk,
      active: id,
      layouts: [
        ...desk.layouts,
        { ...layout, id, name: name.trim().slice(0, 40) },
      ],
    });
  };
  const move = (id: WidgetId, direction: number) => {
    if (layout.pinned.includes(id)) return;
    const order = [...layout.order],
      idx = order.indexOf(id),
      to = idx + direction;
    if (to < 0 || to >= order.length || layout.pinned.includes(order[to]))
      return;
    [order[idx], order[to]] = [order[to], order[idx]];
    update({ order });
  };
  return {
    desk,
    layout,
    update,
    applyPreset,
    saveAs,
    move,
    storageError,
    importText:(text:string)=>commit(importDesk(text)),
    exportText:()=>exportDesk(desk),
    select: (id: string) => commit({ ...desk, active: id }),
  };
}
