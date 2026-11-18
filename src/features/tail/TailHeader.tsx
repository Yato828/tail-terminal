import { WalletChip } from "../../components/WalletSwap";
import { TokenIcon } from "../../components/TokenIcon";
import { fmtUsd, shortAddr } from "../../lib/format";
import type { AxiomCoin } from "../../lib/axiom";
import { TailLogo } from "./Logo";
import { Icon } from "./Icon";
import { isExtension } from "../../lib/env";
import { lazy, Suspense, useState } from "react";
const InfoDialog = lazy(() =>
  import("../site/ProductInfo").then((m) => ({ default: m.InfoDialog })),
);
import { percent, type PanelId } from "./presentation";
import type { useTerminalData } from "./useTerminalData";
export function TailHeader({
  data,
  setPanel,
  onHome,
}: {
  data: ReturnType<typeof useTerminalData>;
  setPanel: (id: PanelId | null) => void;
  onHome: () => void;
}) {
  const [info, setInfo] = useState(false);
  const {
    query,
    setQuery,
    hits,
    searching,
    searchOpen,
    setSearchOpen,
    searchError,
    history,
    hitIndex,
    setHitIndex,
    input,
    sol,
    network,
    networkError,
  } = data;
  const select = (coin: AxiomCoin) => {
    data.select(coin);
    setPanel(null);
  };
  return (
    <>
      <header className="tail-header">
        <TailLogo onClick={onHome} />
        <div className="search-wrap">
          <Icon name="search" />
          <input
            ref={input}
            aria-label="Search Solana tokens"
            placeholder="Search tokens, contracts, or paste a CA…"
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHitIndex((i) => Math.min(i + 1, hits.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHitIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter" && hits[hitIndex]) select(hits[hitIndex]);
            }}
          />
          <kbd>⌘ K</kbd>
          {searchOpen && (
            <>
              <button
                className="search-dismiss"
                aria-label="Close search"
                onClick={() => setSearchOpen(false)}
              >
                ×
              </button>
              <div
                className="search-results"
                role="region"
                aria-label="Token search results"
              >
                {query ? (
                  <>
                    {searching && <p role="status">Searching Solana…</p>}
                    {searchError && (
                      <p className="tail-error" role="alert">
                        {searchError}
                      </p>
                    )}
                    {!searching && !searchError && !hits.length && (
                      <p>No Solana markets found.</p>
                    )}
                    {hits.map((c, idx) => (
                      <button
                        key={c.pairAddress}
                        className={hitIndex === idx ? "selected" : ""}
                        onClick={() => select(c)}
                      >
                        <TokenIcon coin={c} />
                        <span>
                          <b>{c.symbol}</b>
                          <small>
                            {c.name} · {shortAddr(c.address)}
                          </small>
                        </span>
                        <b>{fmtUsd(c.priceUsd)}</b>
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    <small>RECENT SEARCHES</small>
                    {history.length ? (
                      history.map((q) => (
                        <button key={q} onClick={() => setQuery(q)}>
                          {q}
                        </button>
                      ))
                    ) : (
                      <p>Search by name, ticker or Solana mint.</p>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
        <div className="sol-ticker">
          <svg className="sol-symbol" viewBox="0 0 24 24" aria-hidden="true">
            <defs>
              <linearGradient id="sol-mark">
                <stop stopColor="#9d70ff" />
                <stop offset="1" stopColor="#16dfaa" />
              </linearGradient>
            </defs>
            <path
              fill="url(#sol-mark)"
              d="m6 3-4 4h17l4-4ZM2 10l4 4h17l-4-4Zm4 7-4 4h17l4-4Z"
            />
          </svg>
          <b>SOL</b>
          <span>{sol ? fmtUsd(sol.priceUsd) : "—"}</span>
          <strong
            className={
              sol?.change24h == null ? "" : sol.change24h >= 0 ? "up" : "dn"
            }
          >
            {percent(sol?.change24h)}
          </strong>
        </div>
        <span
          className={`network-dot${networkError ? " offline" : !network ? " pending" : ""}`}
          title={
            networkError ||
            (network
              ? Number.isFinite(network.slot)
                ? `Solana mainnet · slot ${network.slot}`
                : "Solana RPC sample available"
              : "Checking RPC")
          }
        />
        {isExtension() ? (
          <button className="wallet-chip" onClick={() => setPanel("account")}>
            Inspect wallet
          </button>
        ) : (
          <WalletChip />
        )}
        <button
          type="button"
          className="header-info"
          aria-haspopup="dialog"
          onClick={() => setInfo(true)}
        >
          Info
        </button>
        <button
          className="header-icon"
          aria-label="Notifications"
          onClick={() => setPanel("alerts")}
        >
          <Icon name="alerts" />
        </button>
        <button
          className="header-icon"
          aria-label="Account"
          onClick={() => setPanel("account")}
        >
          <Icon name="user" />
        </button>
      </header>
      {info && (
        <Suspense fallback={null}>
          <InfoDialog onClose={() => setInfo(false)} />
        </Suspense>
      )}
    </>
  );
}
