import { it, expect } from "vitest";
import { rankMarkets, marketVolume } from "./marketRanking";
import type { AxiomCoin } from "../../lib/axiom";
const a = {
  address: "a",
  volume5m: 10,
  volume1h: 400,
  volume24h: 1000,
  change5m: -2,
  change1h: 10,
  change24h: 3,
} as AxiomCoin;
const b = {
  address: "b",
  volume5m: 20,
  volume1h: 300,
  volume24h: 500,
  change5m: 1,
  change1h: -1,
  change24h: 8,
} as AxiomCoin;
it("uses the chosen timeframe for actual volume ranking and returns positive known gainers only", () => {
  expect(rankMarkets([a, b], "Trending", "5m")[0]).toBe(b);
  expect(rankMarkets([a, b], "Trending", "1h")[0]).toBe(a);
  expect(marketVolume(a, "1h")).toBe(400);
  expect(
    rankMarkets([a, b, { address: "unknown" } as AxiomCoin], "Gainers", "5m"),
  ).toEqual([b]);
  expect(rankMarkets([a, b], "Gainers", "1h")).toEqual([a]);
});
