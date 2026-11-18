import type { AxiomCoin } from "../../lib/axiom";
export type MarketTimeframe = "5m" | "1h" | "24h";
export const marketChange = (c: AxiomCoin, period: MarketTimeframe) =>
  period === "5m" ? c.change5m : period === "1h" ? c.change1h : c.change24h;
export const marketVolume = (c: AxiomCoin, period: MarketTimeframe) =>
  period === "5m" ? c.volume5m : period === "1h" ? c.volume1h : c.volume24h;
export function rankMarkets(
  coins: AxiomCoin[],
  mode: string,
  period: MarketTimeframe,
) {
  const rows =
    mode === "Gainers"
      ? coins.filter((c) => (marketChange(c, period) ?? -Infinity) > 0)
      : coins;
  return [...rows].sort((a, b) =>
    mode === "Gainers"
      ? (marketChange(b, period) ?? -Infinity) -
        (marketChange(a, period) ?? -Infinity)
      : mode === "New Pairs"
        ? (b.createdAt ?? 0) - (a.createdAt ?? 0)
        : (marketVolume(b, period) ?? -Infinity) -
          (marketVolume(a, period) ?? -Infinity),
  );
}
