import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RPC } from "./const";
import { fetchTrades } from "./api";
import { loadCandleResult } from "./axiom";
import { TailApiError } from "../services/backend/client";

describe.skipIf(process.env.PART_LIVE_TESTS !== '1')("Solana mainnet RPC", () => {
  it("returns a confirmed slot", async () => {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
        params: [{ commitment: "confirmed" }],
      }),
    });
    const body = await res.json();
    expect(body.error).toBeUndefined();
    expect(body.result).toBeGreaterThan(0);
  });
});

describe.skipIf(process.env.PART_LIVE_TESTS !== '1')(
  "live Backend V1 terminal data",
  () => {
    const nativeFetch = globalThis.fetch;
    const pool = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE";
    const mint = "So11111111111111111111111111111111111111112";
    beforeAll(() => {
      const base = process.env.PART_LIVE_BASE || "http://localhost:4664";
      vi.stubEnv("VITE_TAIL_API_URL", "/tail-api");
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
        nativeFetch(
          typeof input === "string" && input.startsWith("/")
            ? base + input
            : input,
          init,
        )) as typeof fetch;
    });
    afterAll(() => {
      globalThis.fetch = nativeFetch;
      vi.unstubAllEnvs();
    });
    it("returns actual indexed trades or the explicit unavailable-source code", async () => {
      try {
        const rows = await fetchTrades(pool, mint);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0].hash.length).toBeGreaterThan(60);
        expect(rows[0].amount).toBeGreaterThan(0);
      } catch (error) {
        expect(error).toBeInstanceOf(TailApiError);
        expect((error as TailApiError).code).toBe("TRADES_SOURCE_REQUIRED");
        console.info(
          "Live trades unavailable: GeckoTerminal restricted; paid indexer not configured.",
        );
      }
    });
    it("never substitutes hourly records for unavailable 5m history", async () => {
      try {
        const result = await loadCandleResult(pool, "5m", mint);
        expect(["GeckoTerminal", "Candle / Birdeye", "Candle"]).toContain(
          result.source,
        );
        expect(result.bars.length).toBeGreaterThan(0);
        expect(result.bars.every((b) => b.h >= b.l && b.c > 0)).toBe(true);
      } catch (error) {
        expect(error).toBeInstanceOf(TailApiError);
        expect((error as TailApiError).code).toBe("HISTORY_PLAN_REQUIRED");
        console.info(
          "Live 5m history unavailable: keyless provider supports 1h and longer.",
        );
      }
    });
    it("loads real 1h, 4h and 1d candles with source, mint binding and observation time", async () => {
      for (const interval of ["1h", "4h", "1d"]) {
        const result = await loadCandleResult(pool, interval, mint);
        expect([
          "GeckoTerminal",
          "DexPaprika",
          "Candle / Birdeye",
          "Candle",
        ]).toContain(result.source);
        expect(result.bars.length).toBeGreaterThan(0);
        expect(
          result.bars.every(
            (b) =>
              b.h >= Math.max(b.o, b.c) &&
              b.l <= Math.min(b.o, b.c) &&
              b.l > 0 &&
              b.v >= 0,
          ),
        ).toBe(true);
        expect(result.fetchedAt).toBeGreaterThan(Date.now() - 120000);
        if (result.source === "DexPaprika")
          expect(result.historyLimited).toBe(true);
      }
    });
  },
);
