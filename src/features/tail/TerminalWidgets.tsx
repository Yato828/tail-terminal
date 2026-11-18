import { marketVolume, marketChange } from "./marketRanking";
import { tailBackendEnabled } from "../../services/backend/config";
import {
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import { Chart } from "../../components/Chart";
import { WalletSwap } from "../../components/WalletSwap";
import { TokenIcon } from "../../components/TokenIcon";
import { useWallet } from "../../services/adapters/tail";
import { usePreferences } from "../preferences/preferences";
import { fmtUsd, fmtQty, shortAddr } from "../../lib/format";
import { EXPLORER } from "../../lib/const";
import type { AxiomCoin } from "../../lib/axiom";
import { Icon } from "./Icon";
import { FablePanel } from "./FablePanel";
import { percent, type PanelId } from "./presentation";
import type { WidgetId } from "./workspace";
import type { useTerminalData } from "./useTerminalData";
type Props = {
  id: WidgetId;
  data: ReturnType<typeof useTerminalData>;
  selectedWallet: string;
  maximized: WidgetId | null;
  setMaximized: Dispatch<SetStateAction<WidgetId | null>>;
  setPanel: (id: PanelId | null) => void;
  setNotice: (text: string) => void;
};
export function TerminalWidgetContent({
  id,
  data,
  selectedWallet,
  maximized,
  setMaximized,
  setPanel,
  setNotice,
}: Props) {
  const { preferences } = usePreferences();
  const wallet = useWallet();
  const [copied, setCopied] = useState(false);
  const {
    markets,
    coin,
    feedError,
    marketError,
    loading,
    setRetry,
    at,
    network,
    networkError,
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
    listMode,
    setListMode,
    timeframe,
    setTimeframe,
    tokenError,
    marketRecoveryNote,
    recoverMarket,
    select,
    input,
    rows,
    sol,
  } = data;
  const fieldChange = (c: AxiomCoin) => marketChange(c, timeframe);
  const renderers: Record<WidgetId, ReactNode> = {
    pulse: (
      <>
        <div className="market-heading">
          <span className="round-icon">
            <Icon name="pulse" />
          </span>
          <div>
            <h2>Market Pulse</h2>
            <p>Tracked Solana markets</p>
          </div>
          <button
            aria-label="View market list"
            onClick={() =>
              document
                .querySelector('[data-widget="trending"]')
                ?.scrollIntoView({ block: "center" })
            }
          >
            <Icon name="arrow" />
          </button>
        </div>
        <div className="pulse-metrics">
          <div>
            <span>Markets</span>
            <b>{markets.length || "—"}</b>
          </div>
          <div>
            <span>Tracked 24h Vol</span>
            <b>
              {markets.length
                ? fmtUsd(
                    markets.reduce((sum, c) => sum + (c.volume24h ?? 0), 0),
                  )
                : "—"}
            </b>
          </div>
          <div>
            <span>Network TPS</span>
            <b
              title={
                network
                  ? `RPC sample ${new Date(network.at).toISOString()}`
                  : networkError
              }
            >
              {networkError ? "—" : network ? fmtQty(network.tps) : "—"}
            </b>
          </div>
        </div>
        <small className="source-note">
          {marketError ? "Stale markets · " + marketError : "DEX Screener"} ·{" "}
          {at ? new Date(at).toLocaleTimeString() : "Loading source"}
        </small>
      </>
    ),
    smart: (
      <>
        <div className="market-heading">
          <span className="round-icon">
            <Icon name="eye" />
          </span>
          <div>
            <h2>Smart Money</h2>
            <p>Your watched public wallets</p>
          </div>
        </div>
        <p className="smart-copy">
          {selectedWallet
            ? `Selected: ${shortAddr(selectedWallet)}`
            : "Add wallets to inspect observed activity. No inferred PnL ranking."}
        </p>
        <button className="text-action" onClick={() => setPanel("smart")}>
          Inspect watched wallets <Icon name="arrow" />
        </button>
      </>
    ),
    trending: (
      <>
        <div className="trending-tabs">
          {["Trending", "New Pairs", "Gainers"].map((t) => (
            <button
              key={t}
              className={t === listMode ? "active" : ""}
              onClick={() => setListMode(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="trending-filters">
          <span>Solana mainnet</span>
          <select
            aria-label="Market change interval"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as typeof timeframe)}
          >
            <option>5m</option>
            <option>1h</option>
            <option>24h</option>
          </select>
        </div>
        {listMode === "New Pairs" && (
          <small className="list-source-note">
            Indexed new pools ·{" "}
            {rows[0]?.source === "DexPaprika"
              ? "newest hour excluded"
              : "launch coverage may lag"}
          </small>
        )}
        {feedError && (
          <p className="tail-error" role="alert">
            {rows.length ? "Stale data · " : ""}
            {feedError}{" "}
            <button onClick={() => setRetry((r) => r + 1)}>Retry</button>
          </p>
        )}
        {loading && !rows.length && (
          <p className="data-note" role="status">
            Loading markets…
          </p>
        )}
        {!loading && !rows.length && !feedError && (
          <p className="data-note">No markets returned by source.</p>
        )}
        <div className="token-list">
          {rows.map((c) => (
            <button
              key={c.pairAddress}
              onClick={() => select(c)}
              className={coin?.pairAddress === c.pairAddress ? "selected" : ""}
            >
              <TokenIcon coin={c} />
              <span>
                <b>{c.symbol}</b>
                <small>
                  {c.mcap ? fmtUsd(c.mcap) : "—"} · Vol{" "}
                  {marketVolume(c, timeframe) != null
                    ? fmtUsd(marketVolume(c, timeframe))
                    : "—"}{" "}
                  ({timeframe})
                </small>
              </span>
              <span>
                <b>{fmtUsd(c.priceUsd)}</b>
                <small
                  className={
                    fieldChange(c) == null
                      ? ""
                      : fieldChange(c)! >= 0
                        ? "up"
                        : "dn"
                  }
                >
                  {percent(fieldChange(c))}
                </small>
              </span>
            </button>
          ))}
        </div>
      </>
    ),
    chart: (
      <>
        {coin ? (
          <>
            <div className="token-heading">
              <div className="token-title">
                <TokenIcon coin={coin} />
                <div>
                  <h1>{coin.symbol}</h1>
                  <button
                    className="mint-copy"
                    title={`${coin.address} · ${coin.source ?? "DexScreener"} · Observed ${coin.observedAt ?? "time unavailable"}`}
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(coin.address)
                        .then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        })
                        .catch(() =>
                          setNotice(
                            "Clipboard unavailable. Mint: " + coin.address,
                          ),
                        );
                    }}
                  >
                    {copied ? "Copied" : shortAddr(coin.address)} ⧉
                  </button>
                </div>
              </div>
              <div className="token-price">
                <b>
                  {coin.priceUsd >= 1
                    ? `$${coin.priceUsd.toFixed(6)}`
                    : fmtUsd(coin.priceUsd)}
                </b>
                <span
                  className={
                    coin.change24h == null
                      ? ""
                      : coin.change24h >= 0
                        ? "up"
                        : "dn"
                  }
                >
                  {percent(coin.change24h)} (24h)
                </span>
              </div>
              <a
                title="View token on Solscan"
                href={`${EXPLORER}/token/${coin.address}`}
                target="_blank"
                rel="noreferrer"
              >
                ↗
              </a>
            </div>
            {preferences.showMetrics && (
              <div className="token-metrics">
                {[
                  ["MCap", coin.mcap],
                  ["FDV", coin.fdv],
                  ["24h Vol", coin.volume24h],
                  ["Liquidity", coin.liquidityUsd],
                  ["Holders", coin.holders],
                  [
                    "Txns (24h)",
                    coin.buys24h == null || coin.sells24h == null
                      ? undefined
                      : coin.buys24h + coin.sells24h,
                  ],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <span>{label}</span>
                    <b>
                      {value == null
                        ? "—"
                        : label === "Holders" || label === "Txns (24h)"
                          ? fmtQty(Number(value))
                          : fmtUsd(Number(value))}
                    </b>
                  </div>
                ))}
              </div>
            )}
            {tokenError && (
              <p className="tail-error" role="alert">
                {tokenError}
              </p>
            )}
            {marketRecoveryNote && (
              <p className="market-recovery-note" role="status">
                {marketRecoveryNote}
              </p>
            )}
            <Chart
              key={coin.pairAddress}
              pool={coin.pairAddress}
              token={coin.address}
              symbol={coin.symbol}
              priceUsd={coin.priceUsd}
              mcap={coin.mcap}
              createdAt={coin.createdAt}
              onHistoryUnavailable={recoverMarket}
            />
          </>
        ) : (
          <div className="chart-welcome">
            <Icon name="terminal" size={34} />
            <small>SOLANA MAINNET WORKSPACE</small>
            <h1>Find your next market.</h1>
            <p>
              Search a token, ticker or mint address to open its source chart.
            </p>
            <button
              className="primary-action"
              onClick={() => {
                setSearchOpen(true);
                input.current?.focus();
              }}
            >
              Search tokens <kbd>⌘ K</kbd>
            </button>
            {tokenError && <p className="tail-error">{tokenError}</p>}
          </div>
        )}
      </>
    ),
    trade: (
      <>
        <div className="trade-tabs">
          <button className="active">Buy</button>
          <button
            disabled
            title="Sell execution is not available; use the read-only Exit Simulator"
          >
            Sell
          </button>
        </div>
        <WalletSwap coin={coin} />
        <div className="trade-route">
          <span>Route</span>
          <b>{tailBackendEnabled() ? "Jupiter · quote only" : "Raydium"}</b>
        </div>
        <small className="source-note">
          {tailBackendEnabled()
            ? "Read-only estimate. Buy / sell execution is unavailable."
            : "Output is source-quoted. Network fees appear in wallet review."}
        </small>
      </>
    ),
    fable: (
      <FablePanel
        coin={coin}
        wallet={selectedWallet || wallet.account || ""}
        expanded={maximized === "fable"}
        onExpand={() => setMaximized((v) => (v === "fable" ? null : "fable"))}
      />
    ),
  };
  return renderers[id];
}
