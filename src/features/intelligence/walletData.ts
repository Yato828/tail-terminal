import { rpc } from "../../lib/rpcFeed";
import { parseWalletTransaction } from "../v2/intelligence/wallet";
import { isSolanaAddress } from "../../lib/validation";
export type WatchedWallet = { address: string; label: string; pinned: boolean; color?: string; group?: string; favorite?: boolean; addedAt?: number; updatedAt?: number };
export function parseWatchlist(raw: unknown): WatchedWallet[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .filter(
      (w) =>
        w &&
        isSolanaAddress(w.address) &&
        !seen.has(w.address) &&
        seen.add(w.address),
    )
    .slice(0, 20)
    .map((w) => ({
      address: w.address,
      label: typeof w.label === "string" ? w.label.slice(0, 48) : "Wallet",
      pinned: w.pinned === true,
      ...(typeof w.color === "string" && /^#[0-9a-fA-F]{6}$/.test(w.color) ? { color: w.color } : {}),
      ...(typeof w.group === "string" ? { group: w.group.slice(0, 40) } : {}),
      ...(w.favorite === true ? { favorite: true } : {}),
      ...(Number.isFinite(w.addedAt) ? { addedAt: w.addedAt } : {}),
      ...(Number.isFinite(w.updatedAt) ? { updatedAt: w.updatedAt } : {}),
    }));
}
type ParsedTx = {
  blockTime: number | null;
  transaction: { message: { accountKeys: Array<{ pubkey: string } | string> } };
  meta: {
    err: unknown;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: Balance[];
    postTokenBalances?: Balance[];
  } | null;
};
type Balance = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { uiAmountString: string };
};
export type WalletEvent = {
  hash: string;
  wallet: string;
  label: string;
  timestamp: string | null;
  mint: string;
  action: string;
  amount: number;
  source: string;
  failed: boolean;
};
export function walletChanges(
  tx: ParsedTx,
  wallet: WatchedWallet,
  hash: string,
): WalletEvent[] {
  return parseWalletTransaction(tx, wallet.address, hash).map((row) => ({
    hash, wallet: wallet.address, label: wallet.label,
    timestamp: row.at !== null ? new Date(row.at).toISOString() : null,
    mint: row.mint,
    action: row.kind === "received" ? "Token net received"
      : row.kind === "sent" ? "Token net sent"
      : row.kind === "sol-delta" ? "SOL net delta (incl. fees)"
      : row.kind === "failed" ? "Failed transaction"
      : row.kind === "unavailable" ? "Transaction details unavailable"
      : "Transaction · no wallet balance change",
    amount: row.kind === "sol-delta" ? (row.delta ?? 0) : Math.abs(row.delta ?? 0),
    source: "Solana mainnet RPC", failed: row.kind === "failed",
  }));
}

export async function walletActivity(wallet: WatchedWallet, before?: string) {
  if (!isSolanaAddress(wallet.address))
    throw new Error("Invalid Solana wallet");
  const signatures = await rpc<
    Array<{ signature: string; blockTime: number | null; err: unknown }>
  >("getSignaturesForAddress", [
    wallet.address,
    { limit: 8, commitment: "confirmed", ...(before ? { before } : {}) },
  ]);
  const fetchDetail = async (s: (typeof signatures)[number]) => {
    const tx = await rpc<ParsedTx | null>("getTransaction", [
      s.signature,
      {
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      },
    ]);
    if (!tx)
      return [
        {
          hash: s.signature,
          wallet: wallet.address,
          label: wallet.label,
          timestamp: s.blockTime
            ? new Date(s.blockTime * 1000).toISOString()
            : null,
          mint: "",
          action: "Transaction details unavailable",
          amount: 0,
          source: "Solana mainnet RPC",
          failed: !!s.err,
        },
      ];
    return walletChanges(tx, wallet, s.signature);
  };
  const results: PromiseSettledResult<WalletEvent[]>[] = [];
  for (let i = 0; i < signatures.length; i += 2)
    results.push(
      ...(await Promise.allSettled(
        signatures.slice(i, i + 2).map(fetchDetail),
      )),
    );
  const rows = results.flatMap((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : [
          {
            hash: signatures[i].signature,
            wallet: wallet.address,
            label: wallet.label,
            timestamp: signatures[i].blockTime
              ? new Date(signatures[i].blockTime! * 1000).toISOString()
              : null,
            mint: "",
            action: "Transaction details unavailable",
            amount: 0,
            source: "Solana mainnet RPC",
            failed: !!signatures[i].err,
          },
        ],
  );
  return {
    rows,
    before: signatures.length === 8 ? signatures.at(-1)?.signature : undefined,
    partial: results.some((r) => r.status === "rejected"),
  };
}
