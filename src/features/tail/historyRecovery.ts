import type { AxiomCoin } from "../../lib/axiom";
import { isSolanaAddress } from "../../lib/validation";
/** A different source pool must become the selected market, never masquerade as the original pool. */
export async function recoverHistoryMarket(
  current: AxiomCoin,
  candidates: AxiomCoin[],
  probe: (candidate: AxiomCoin) => Promise<unknown>,
) {
  const seen = new Set([current.pairAddress]);
  const eligible = candidates
    .filter(
      (c) =>
        c.address === current.address &&
        c.chainId === "solana" &&
        isSolanaAddress(c.pairAddress),
    )
    .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
  let attempts = 0;
  for (const candidate of eligible) {
    if (seen.has(candidate.pairAddress)) continue;
    seen.add(candidate.pairAddress);
    if (attempts++ >= 3) break;
    try {
      await probe(candidate);
      return candidate;
    } catch {
      /* Try at most three actual markets for this exact mint. */
    }
  }
  return null;
}
