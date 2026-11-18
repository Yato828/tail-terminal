import { useEffect, useState } from "react";
import { getTrades, getBlocks, getNetwork } from "../../services/adapters/tail";
import type { AxiomCoin } from "../../lib/axiom";
import type { Trade, ChainBlock, ChainStats } from "../../lib/api";
import { EXPLORER } from "../../lib/const";
import { fmtQty, fmtUsd, shortAddr } from "../../lib/format";
import { errorMessage } from "../../lib/validation";
export function ActivityPanel({
  coin,
  kind,
}: {
  coin: AxiomCoin | null;
  kind: "flow" | "network";
}) {
  const [trades, setTrades] = useState<Trade[]>([]),
    [blocks, setBlocks] = useState<ChainBlock[]>([]),
    [stats, setStats] = useState<ChainStats | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [at, setAt] = useState(0),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function run() {
      if (kind === "flow" && !coin) {
        setBusy(false);
        return;
      }
      try {
        if (kind === "flow" && coin) {
          const rows = await getTrades(
            coin.pairAddress,
            coin.address,
            coin.priceUsd,
          );
          if (!stopped) setTrades(rows);
        } else {
          const [blocks, stats] = await Promise.all([
            getBlocks(),
            getNetwork(),
          ]);
          if (!stopped) {
            setBlocks(blocks);
            setStats(stats);
          }
        }
        if (!stopped) {
          setError("");
          setAt(Date.now());
        }
      } catch (e) {
        if (!stopped) setError(errorMessage(e));
      } finally {
        if (!stopped) {
          setBusy(false);
          timer = setTimeout(run, 30000);
        }
      }
    }
    setBusy(true);
    void run();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [kind, coin?.address, coin?.pairAddress, retry]);
  return (
    <section className="tail-settings activity-panel">
      <h1>
        {kind === "flow"
          ? `${coin?.symbol ?? "Token"} · observed pool trades`
          : "Solana mainnet · network blocks"}
      </h1>
      <p>
        {kind === "flow"
          ? "GeckoTerminal / validated fallback sources. Indicative USD may use the current token snapshot; it is not historical execution PnL."
          : `RPC performance sample: ${fmtQty(stats?.tps)} TPS · slot ${fmtQty(stats?.slot)}`}
      </p>
      <small>
        Fetched: {at ? new Date(at).toISOString() : "No data yet"} · refreshes
        every 30s while this view is open
      </small>
      {busy && <p role="status">Loading source…</p>}
      {error && (
        <p role="alert" className="tail-error">
          {at ? "Stale data · " : ""}
          {error}
        </p>
      )}
      {kind === "flow" && !coin && <p>Select a Solana token first.</p>}
      <div className="activity-table">
        <table>
          <thead>
            <tr>
              {(kind === "flow"
                ? [
                    "Time",
                    "Side",
                    "Amount",
                    "Indicative USD",
                    "Wallet",
                    "Transaction",
                  ]
                : ["Slot", "Time", "Transactions", "Block"]
              ).map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kind === "flow"
              ? trades.map((t) => (
                  <tr key={t.hash}>
                    <td>{new Date(t.timestamp).toLocaleTimeString()}</td>
                    <td className={t.side === "buy" ? "up" : "dn"}>{t.side}</td>
                    <td>{fmtQty(t.amount)}</td>
                    <td>{fmtUsd(t.usd)}</td>
                    <td>{shortAddr(t.wallet)}</td>
                    <td>
                      <a
                        href={`${EXPLORER}/tx/${t.hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddr(t.hash)} ↗
                      </a>
                    </td>
                  </tr>
                ))
              : blocks.map((b) => (
                  <tr key={b.hash}>
                    <td>{fmtQty(b.height)}</td>
                    <td>{new Date(b.timestamp).toLocaleTimeString()}</td>
                    <td>{fmtQty(b.transactions_count)}</td>
                    <td>
                      <a
                        href={`${EXPLORER}/block/${b.height}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View block ↗
                      </a>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!busy &&
        !error &&
        !(kind === "flow" ? trades.length : blocks.length) && (
          <p>No rows returned by the source.</p>
        )}
      <button onClick={() => setRetry((r) => r + 1)}>Refresh activity</button>
    </section>
  );
}
