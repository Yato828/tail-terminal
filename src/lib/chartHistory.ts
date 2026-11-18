import type { Candle, Interval, CandleResult } from "./axiom";
const MINUTE = 60000,
  HOUR = 60 * MINUTE,
  DAY = 24 * HOUR;
export function overviewInterval(
  createdAt?: number,
  fallback: Interval = "1h",
  now = Date.now(),
): Interval {
  if (!createdAt || !Number.isFinite(createdAt) || createdAt > now)
    return fallback;
  const age = Math.max(0, now - createdAt);
  return age < 6 * HOUR
    ? "1m"
    : age < 2 * DAY
      ? "5m"
      : age < 7 * DAY
        ? "15m"
        : age < 20 * DAY
          ? "1h"
          : age < 100 * DAY
            ? "4h"
            : "1d";
}
export const historyIdentity = (
  r: Pick<CandleResult, "source" | "scope" | "volumeUnit">,
) => `${r.source}:${r.scope ?? "pool"}:${r.volumeUnit ?? "usd"}`;
/** Gives a small number of real candles sensible width without creating filler bars. */
export function allHistoryRange(length: number) {
  return { from: -2, to: Math.max(38, length + 2) };
}
export type LoadedHistory = {
  bars: Candle[];
  pages: number;
  stopped: "empty" | "limit" | "cancelled" | "source-limit";
};
export async function collectOlderHistory(
  initial: CandleResult,
  load: (before: number) => Promise<CandleResult>,
  options: {
    maxPages?: number;
    cancelled?: () => boolean;
    onPage?: (bars: Candle[], pages: number) => void;
  } = {},
): Promise<LoadedHistory> {
  let bars = initial.bars,
    pages = 0;
  const identity = historyIdentity(initial);
  for (; pages < (options.maxPages ?? 8); ) {
    if (options.cancelled?.()) return { bars, pages, stopped: "cancelled" };
    if (initial.historyLimited) return { bars, pages, stopped: "source-limit" };
    if (!bars.length) return { bars, pages, stopped: "empty" };
    const first = bars[0].t,
      result = await load(first - 1);
    if (options.cancelled?.()) return { bars, pages, stopped: "cancelled" };
    if (historyIdentity(result) !== identity)
      throw new Error(
        "Historical source or volume units changed. Reload history to keep sources separate.",
      );
    const older = result.bars.filter((b) => b.t < first);
    pages++;
    if (!older.length) return { bars, pages, stopped: "empty" };
    const map = new Map([...older, ...bars].map((b) => [b.t, b]));
    bars = [...map.values()].sort((a, b) => a.t - b.t);
    options.onPage?.(bars, pages);
  }
  return { bars, pages, stopped: "limit" };
}
