import { it, expect, vi } from "vitest";
import { recoverHistoryMarket } from "./historyRecovery";
import type { AxiomCoin } from "../../lib/axiom";
const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  a = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE",
  b = "So11111111111111111111111111111111111111112";
const current = {
  address: mint,
  pairAddress: a,
  chainId: "solana",
  liquidityUsd: 10,
} as AxiomCoin;
it("probes real alternative markets for the exact same case-sensitive mint, without substituting identities", async () => {
  const other = { ...current, pairAddress: b, liquidityUsd: 20 };
  const probe = vi.fn().mockResolvedValue({});
  expect(
    await recoverHistoryMarket(
      current,
      [current, { ...other, address: b }, other, other],
      probe,
    ),
  ).toBe(other);
  expect(probe).toHaveBeenCalledTimes(1);
  expect(probe).toHaveBeenCalledWith(other);
});
it("does not run an unbounded pool crawl or accept malformed/EVM candidates", async () => {
  const probe = vi.fn().mockRejectedValue(new Error("No history"));
  const pools = [
    "4QU2NpRaqmKMvPSwVKQDeW4V6JFEKJdkzbzdauumD9qN",
    "BZtgQEyS6eXUXicYPHecYQ7PybqodXQMvkjUbP4R8mUU",
    "4fuUiYxTQ6QCrdSq9ouBYcTM7bqSwYTSyLueGZLTy4T4",
    b,
  ].map((pairAddress) => ({ ...current, pairAddress }));
  expect(
    await recoverHistoryMarket(
      current,
      [
        { ...current, pairAddress: "0x123" },
        { ...pools[0], chainId: "ethereum" },
        ...pools,
      ],
      probe,
    ),
  ).toBeNull();
  expect(probe).toHaveBeenCalledTimes(3);
});
