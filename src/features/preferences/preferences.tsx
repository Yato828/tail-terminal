import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { CANDLE_IVS, type Interval } from "../../lib/axiom";
import { readLocal, saveLocal } from "../../lib/validation";
import { validStreamUrl } from "../../lib/poolStream";
export type Preferences = {
  version: 1;
  paletteRevision: 3;
  theme: "midnight" | "graphite" | "black";
  accent: string;
  density: "comfortable" | "compact";
  textSize: "normal" | "large";
  upColor: string;
  downColor: string;
  showVolume: boolean;
  showGrid: boolean;
  showCrosshair: boolean;
  hollowCandles: boolean;
  liveUpdates: boolean;
  streamPrices: boolean;
  streamCommitment: "processed" | "confirmed";
  streamEndpoint: string;
  astraBackend: "hosted" | "local";
  refreshSeconds: 5 | 10 | 15 | 30;
  defaultInterval: Interval;
  visibleCandles: 80 | 120 | 200;
  followLatest: boolean;
  showMetrics: boolean;
  reducedMotion: boolean;
  tokenArtwork: boolean;
  aiScenario: boolean;
  scenarioSteps: 6 | 12;
  tradeFeed: boolean;
  holderTools: boolean;
  creationTools: boolean;
};
export const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  paletteRevision: 3,
  theme: "black",
  accent: "#ff812e",
  density: "comfortable",
  textSize: "normal",
  upColor: "#22c55e",
  downColor: "#ef4444",
  showVolume: true,
  showGrid: true,
  showCrosshair: true,
  hollowCandles: false,
  liveUpdates: true,
  streamPrices: true,
  streamCommitment: "processed",
  streamEndpoint: "",
  astraBackend: "hosted",
  refreshSeconds: 5,
  defaultInterval: "1h",
  visibleCandles: 120,
  followLatest: true,
  showMetrics: true,
  reducedMotion: false,
  tokenArtwork: true,
  aiScenario: false,
  scenarioSteps: 6,
  tradeFeed: true,
  holderTools: true,
  creationTools: true,
};
export const isColor = (raw: unknown): raw is string =>
  typeof raw === "string" && /^#[\da-f]{6}$/i.test(raw);
export function isWarmAccent(hex: string) {
  if (!isColor(hex)) return false;
  const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  return r >= 180 && g >= 65 && g <= r * 0.85 && b < g * 0.8;
}
export function isDirectionalColor(hex: string, direction: "up" | "down") {
  if (!isColor(hex)) return false;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return direction === "up" ? g > r * 1.15 && g > b : r > g * 2 && r > b * 1.2;
}
export function parsePreferences(raw: unknown): Preferences {
  if (!raw || typeof raw !== "object" || (raw as Preferences).version !== 1)
    return { ...DEFAULT_PREFERENCES };
  const r = raw as Preferences,
    next = { ...DEFAULT_PREFERENCES };
  for (const key of Object.keys(next) as Array<keyof Preferences>) {
    const v = r[key];
    if (typeof next[key] === "boolean" && typeof v === "boolean")
      (next as Record<string, unknown>)[key] = v;
  }
  if (["midnight", "graphite", "black"].includes(r.theme)) next.theme = r.theme;
  if (["comfortable", "compact"].includes(r.density)) next.density = r.density;
  if (["normal", "large"].includes(r.textSize)) next.textSize = r.textSize;
  if (["processed", "confirmed"].includes(r.streamCommitment))
    next.streamCommitment = r.streamCommitment;
  next.streamEndpoint = validStreamUrl(r.streamEndpoint);
  if (["hosted", "local"].includes(r.astraBackend))
    next.astraBackend = r.astraBackend;
  for (const key of ["accent", "upColor", "downColor"] as const)
    if (isColor(r[key])) next[key] = r[key];
  if ([5, 10, 15, 30].includes(r.refreshSeconds))
    next.refreshSeconds = r.refreshSeconds;
  if (CANDLE_IVS.includes(r.defaultInterval))
    next.defaultInterval = r.defaultInterval;
  if ([80, 120, 200].includes(r.visibleCandles))
    next.visibleCandles = r.visibleCandles;
  if ([6, 12].includes(r.scenarioSteps)) next.scenarioSteps = r.scenarioSteps;
  // Upgrade saved PART palettes once; retain independent trading colors and controls.
  if (r.paletteRevision !== 3) {
    next.theme = "black";
    next.accent = DEFAULT_PREFERENCES.accent;
    if (["1m", "5m", "15m"].includes(next.defaultInterval))
      next.defaultInterval = "1h";
  }
  // TAIL brand accents stay warm; market direction keeps its green/red meaning.
  if (!isWarmAccent(next.accent)) next.accent = DEFAULT_PREFERENCES.accent;
  if (!isDirectionalColor(next.upColor, "up"))
    next.upColor = DEFAULT_PREFERENCES.upColor;
  if (!isDirectionalColor(next.downColor, "down"))
    next.downColor = DEFAULT_PREFERENCES.downColor;
  return next;
}
const Context = createContext<{
  preferences: Preferences;
  update: (patch: Partial<Preferences>) => void;
  reset: () => void;
  storageError: boolean;
} | null>(null);
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(() =>
    readLocal("part.preferences.v1", parsePreferences, {
      ...DEFAULT_PREFERENCES,
    }),
  );
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    setStorageError(!saveLocal("part.preferences.v1", preferences));
  }, [preferences]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== "part.preferences.v1") return;
      try {
        setPreferences(parsePreferences(JSON.parse(event.newValue ?? "null")));
      } catch {
        /* Ignore malformed cross-tab updates. */
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return (
    <Context.Provider
      value={{
        preferences,
        update: (patch) =>
          setPreferences((p) => parsePreferences({ ...p, ...patch })),
        reset: () =>
          setPreferences((p) => ({
            ...DEFAULT_PREFERENCES,
            streamEndpoint: p.streamEndpoint,
            astraBackend: p.astraBackend,
          })),
        storageError,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("Preferences provider is missing");
  return value;
}
export function featureEnabled(id: string, p: Preferences) {
  return !(
    (id === "flow" && !p.tradeFeed) ||
    (["holders", "xray"].includes(id) && !p.holderTools) ||
    (["launch", "tweet", "website"].includes(id) && !p.creationTools)
  );
}
export const THEME = {
  midnight: {
    background: "#100d0c",
    panel: "#181310",
    raised: "#241c17",
    edge: "#3b3028",
    text: "#f5f1ed",
    muted: "#aaa19a",
  },
  graphite: {
    background: "#1b1918",
    panel: "#24211f",
    raised: "#2a2623",
    edge: "#3b3530",
    text: "#f5f1ed",
    muted: "#aaa19a",
  },
  black: {
    background: "#141112",
    panel: "#1b1718",
    raised: "#211c1d",
    edge: "#302929",
    text: "#f5f1ed",
    muted: "#aaa1a0",
  },
} as const;

export function accentInk(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const n = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return (luminance + 0.05) / 0.055 > 1.05 / (luminance + 0.05)
    ? "#160e09"
    : "#ffffff";
}
