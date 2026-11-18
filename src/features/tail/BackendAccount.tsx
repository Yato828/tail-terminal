import { useEffect, useState } from "react";
import { WalletChip } from "../../components/WalletSwap";
import { useWallet } from "../../lib/wallet";
import { tailApi, formatAtomic } from "../../services/backend/client";
import type {
  WalletActivity,
  WalletSnapshot,
  TxStatus,
} from "../../services/backend/contracts";
import { errorMessage, isSolanaAddress } from "../../lib/validation";
import { shortAddr } from "../../lib/format";
import { EXPLORER } from "../../lib/const";
import { isExtension } from "../../lib/env";
export function BackendAccount({
  chooseWallet,
}: {
  chooseWallet: (address: string) => void;
}) {
  const wallet = useWallet();
  const [address, setAddress] = useState(wallet.account),
    [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null),
    [activity, setActivity] = useState<WalletActivity | null>(null);
  const [signature, setSignature] = useState(""),
    [tx, setTx] = useState<TxStatus | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(wallet.account),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (wallet.account) {
      setAddress(wallet.account);
      setSelected(wallet.account);
    }
  }, [wallet.account]);
  useEffect(() => {
    if (!isSolanaAddress(selected)) return;
    let stopped = false;
    setBusy(true);
    setError("");
    setSnapshot(null);
    setActivity(null);
    Promise.allSettled([tailApi.wallet(selected), tailApi.activity(selected)])
      .then(([s, a]) => {
        if (stopped) return;
        if (s.status === "fulfilled" && s.value.address === selected)
          setSnapshot(s.value);
        if (a.status === "fulfilled" && a.value.address === selected)
          setActivity(a.value);
        const errs = [s, a]
          .filter((r) => r.status === "rejected")
          .map((r) => errorMessage((r as PromiseRejectedResult).reason));
        setError(errs.join(" · "));
      })
      .finally(() => {
        if (!stopped) setBusy(false);
      });
    return () => {
      stopped = true;
    };
  }, [selected, retry]);
  return (
    <section className="tail-settings">
      <h1>Solana wallet</h1>
      {!isExtension() && <WalletChip />}
      <p>
        Public SOL, SPL and Token-2022 balances. Read-only inspection does not
        require signing and is not a PnL ledger.
      </p>
      <form
        className="tool-form"
        onSubmit={(e) => {
          e.preventDefault();
          chooseWallet(address);
          setSelected(address);
          setRetry((v) => v + 1);
        }}
      >
        <label>
          Public wallet
          <input
            aria-label="Public wallet address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <button disabled={busy || !isSolanaAddress(address)}>
          Inspect wallet
        </button>
      </form>
      {busy && <p role="status">Loading wallet sources…</p>}
      {error && (
        <p role="alert" className="tail-error">
          {error}
        </p>
      )}
      {snapshot && (
        <>
          <h2>{formatAtomic(snapshot.lamports, 9)} SOL</h2>
          <small>
            {snapshot.source} · {snapshot.asOf}
          </small>
          <div className="activity-table">
            <table>
              <thead>
                <tr>
                  <th>Mint</th>
                  <th>Balance</th>
                  <th>Program</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.tokens.map((t) => (
                  <tr key={t.mint}>
                    <td>
                      <a
                        href={`${EXPLORER}/token/${t.mint}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddr(t.mint)}
                      </a>
                    </td>
                    <td>{formatAtomic(t.rawAmount, t.decimals)}</td>
                    <td title={t.program}>{shortAddr(t.program)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!snapshot.tokens.length && <p>No token accounts returned.</p>}
        </>
      )}
      {activity && (
        <>
          <h2>Recent signatures</h2>
          <p>RPC signatures are not classified as trades.</p>
          {activity.signatures.map((a) => (
            <div className="tool-actions" key={a.signature}>
              <a
                href={`${EXPLORER}/tx/${a.signature}`}
                target="_blank"
                rel="noreferrer"
              >
                {shortAddr(a.signature)}
              </a>
              <span>
                {a.err ? "Failed" : (a.confirmationStatus ?? "Unknown status")}
              </span>
              <button onClick={() => setSignature(a.signature)}>
                Inspect status
              </button>
            </div>
          ))}
        </>
      )}
      <form
        className="tool-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setTx(null);
          try {
            setTx(await tailApi.transaction(signature));
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      >
        <label>
          Transaction signature
          <input
            aria-label="Transaction signature"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
          />
        </label>
        <button disabled={!signature}>Check transaction status</button>
      </form>
      {tx && (
        <p role="status">
          {tx.status
            ? tx.status.err
              ? "Transaction failed"
              : (tx.status.confirmationStatus ?? "Unconfirmed")
            : "Not found / not observed"}{" "}
          · {tx.asOf}
        </p>
      )}
    </section>
  );
}
