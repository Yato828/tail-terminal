import { expect, it, vi } from "vitest";
import {
  overviewInterval,
  allHistoryRange,
  collectOlderHistory,
} from "./chartHistory";
import type { CandleResult } from "./axiom";
const result = (
  times: number[],
  extra: Partial<CandleResult> = {},
): CandleResult => ({
  source: "Candle / Birdeye",
  scope: "token",
  volumeUnit: "token",
  paging: true,
  fetchedAt: 1,
  bars: times.map((t) => ({ t, o: 1, h: 2, l: 0.5, c: 1.2, v: 5 })),
  ...extra,
});
it("uses minute candles for young markets and a coarse overview for long history", () => {
  const now = 1800000000000;
  expect(overviewInterval(now - 60000, "1h", now)).toBe("1m");
  expect(overviewInterval(now - 365 * 86400000, "1h", now)).toBe("1d");
  expect(overviewInterval(undefined, "5m", now)).toBe("5m");
  expect(
    allHistoryRange(1).to - allHistoryRange(1).from,
  ).toBeGreaterThanOrEqual(40);
});
it("pages backward, deduplicates boundary bars and preserves gaps", async () => {
  const load = vi
    .fn()
    .mockResolvedValueOnce(result([1000, 2000, 3000]))
    .mockResolvedValueOnce(result([]));
  const r = await collectOlderHistory(result([3000, 4000]), load);
  expect(load).toHaveBeenNthCalledWith(1, 2999);
  expect(load).toHaveBeenNthCalledWith(2, 999);
  expect(r.bars.map((b) => b.t)).toEqual([1000, 2000, 3000, 4000]);
  expect(r.stopped).toBe("empty");
});
it("stops on source/unit changes, cancellation and request budget", async () => {
  await expect(
    collectOlderHistory(result([4000]), async () =>
      result([1000], { volumeUnit: "usd" }),
    ),
  ).rejects.toThrow("volume units changed");
  const cancelled = await collectOlderHistory(
    result([3000]),
    async () => result([1000]),
    { cancelled: () => true },
  );
  expect(cancelled.pages).toBe(0);
  const load = vi.fn(async (before: number) => result([before - 1000]));
  const r = await collectOlderHistory(result([9000]), load, { maxPages: 2 });
  expect(r.stopped).toBe("limit");
  expect(load).toHaveBeenCalledTimes(2);
});
