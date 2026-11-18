import type { AxiomCoin } from "../../lib/axiom";
import { isSolanaAddress } from "../../lib/validation";
import { tailApi } from "./client";
import type { BackendPair, Observation } from "./contracts";
const positive = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) && n > 0;
const numeric = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) ? n : undefined;
export function coinFromPair(
  p: BackendPair,
  observation?: Observation,
): AxiomCoin | null {
  if (
    !p ||
    !isSolanaAddress(p.mint) ||
    !isSolanaAddress(p.pairAddress) ||
    !positive(p.priceUsd)
  )
    return null;
  return {
    address: p.mint,
    pairAddress: p.pairAddress,
    chainId: "solana",
    symbol: String(p.symbol ?? "").slice(0, 40),
    name: String(p.name ?? "").slice(0, 120),
    dex: p.dex,
    priceUsd: p.priceUsd!,
    logo: p.icon ?? undefined,
    quoteAddress: isSolanaAddress(p.quoteMint) ? p.quoteMint : undefined,
    mcap: numeric(p.marketCap),
    fdv: numeric(p.fdv),
    liquidityUsd: numeric(p.liquidityUsd),
    volume24h: numeric(p.volume24h),
    volume1h: numeric(p.volume1h),
    volume5m: numeric(p.volume5m),
    change24h: numeric(p.priceChange24h),
    change1h: numeric(p.priceChange1h),
    change5m: numeric(p.priceChange5m),
    buys24h: numeric(p.buys24h),
    sells24h: numeric(p.sells24h),
    createdAt: numeric(p.pairCreatedAt),
    website: p.websites?.[0]?.url,
    twitter: p.socials?.find((s) => s.type === "twitter")?.url,
    source: observation?.source,
    observedAt: observation?.asOf,
  };
}
export async function backendSearch(q: string) {
  const r = isSolanaAddress(q.trim())
    ? await tailApi.token(q.trim()).then((r) => ({ ...r, items: r.markets }))
    : await tailApi.search(q);
  return r.items
    .filter((p) => !isSolanaAddress(q.trim()) || p.mint === q.trim())
    .map((p) => coinFromPair(p, r))
    .filter((c): c is AxiomCoin => !!c);
}
export async function backendPool(mint: string, pool: string) {
  const r = await tailApi.token(mint);
  const p = r.markets.find((p) => p.mint === mint && p.pairAddress === pool);
  return p ? coinFromPair(p, r) : null;
}
export async function hydrateMints(mints: string[]) {
  const unique = [...new Set(mints.filter(isSolanaAddress))].slice(0, 12);
  const results = await Promise.allSettled(unique.map((m) => tailApi.token(m)));
  const coins = results.flatMap((r, i) =>
    r.status === "fulfilled" && r.value.token?.mint === unique[i]
      ? [coinFromPair(r.value.token, r.value)].filter(
          (c): c is AxiomCoin => !!c,
        )
      : [],
  );
  if (!coins.length && results.some((r) => r.status === "rejected"))
    throw results.find((r) => r.status === "rejected")!.reason;
  return coins;
}
export async function backendMarkets() {
  const profiles = await tailApi.profiles(6);
  return hydrateMints([
    "So11111111111111111111111111111111111111112",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    ...profiles.items.map((p) => p.tokenAddress),
  ]);
}
export async function backendNewPairs() {
  const pools = await tailApi.newPools(12);
  const results = await Promise.allSettled(
    pools.items
      .filter(
        (p) => isSolanaAddress(p.baseMint) && isSolanaAddress(p.poolAddress),
      )
      .slice(0, 8)
      .map(async (p) => {
        const r = await tailApi.token(p.baseMint!);
        const pair = r.markets.find(
          (m) => m.mint === p.baseMint && m.pairAddress === p.poolAddress,
        );
        return pair ? coinFromPair(pair, pools) : null;
      }),
  );
  if (results.length && results.every((r) => r.status === "rejected"))
    throw (results[0] as PromiseRejectedResult).reason;
  return results.flatMap((r) =>
    r.status === "fulfilled" && r.value ? [r.value] : [],
  );
}
