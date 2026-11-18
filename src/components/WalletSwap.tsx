import { tailBackendEnabled } from "../services/backend/config";
import { tailApi, formatAtomic } from "../services/backend/client";
import type { JupiterQuote } from "../services/backend/contracts";
import { useEffect, useRef, useState } from "react";
import {
  connectWallet,
  disconnectWallet,
  refreshAccount,
  useWallet,
} from "../lib/wallet";
import { executeSwap, parseSolIn, quoteSol, type QuoteHit } from "../lib/swap";
import { EXPLORER, WSOL } from "../lib/const";
import type { AxiomCoin } from "../lib/axiom";
import { isExtension } from "../lib/env";
import { fmtQty, shortAddr } from "../lib/format";
import { usePreferences } from "../features/preferences/preferences";
import { readLocal, saveLocal } from "../lib/validation";
import { mascot } from "../mascot/events";
import { walletWebsiteHref } from "../lib/siteLink";
import { useProductBrand } from "../design-system/brand";
import {EXECUTION_POLICY} from '../features/v2/trading/policy';

export function WalletChip() {
  const w = useWallet();
  const [error, setError] = useState("");
  return (
    <div className="wallet-chip-wrap">
      <button
        className="wallet-chip"
        onClick={() => {
          setError("");
          void (w.account ? disconnectWallet() : connectWallet()).catch((e) =>
            setError(String(e.message)),
          );
        }}
      >
        {w.account ? `${shortAddr(w.account)} · Disconnect` : "Connect wallet"}
      </button>
      {error && (
        <div className="wallet-error" role="alert" onClick={() => setError("")}>
          {error}
        </div>
      )}
    </div>
  );
}
export function WalletSwap({ coin }: { coin: AxiomCoin | null }) {
  const brand = useProductBrand();
  const v1 = tailBackendEnabled();
  const w = useWallet();
  const { preferences } = usePreferences();
  const [amount, setAmount] = useState(() =>
    readLocal(
      "tail.swap.amount.v1",
      (v) =>
        typeof v === "string" && /^\d{1,8}(\.\d{0,9})?$/.test(v) ? v : "0.1",
      "0.1",
    ),
  );
  const [slippage, setSlippage] = useState(() =>
    readLocal(
      "tail.swap.slippage.v1",
      (v) => ([50, 100, 200, 500].includes(Number(v)) ? Number(v) : 100),
      100,
    ),
  );
  const [quote, setQuote] = useState<QuoteHit | null>(null);
  const [readQuote, setReadQuote] = useState<JupiterQuote | null>(null);
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    generation.current++;
    setBusy(false);
    setReadQuote(null);
    setQuote(null);
    setMessage("");
    setSignature("");
  }, [coin?.address, amount, slippage, w.account]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    saveLocal("tail.swap.amount.v1", amount);
    saveLocal("tail.swap.slippage.v1", slippage);
  }, [amount, slippage]);
  const expired = !!quote && now - quote.createdAt > 45000;
  const getQuote = async () => {
    if (!coin) return;
    const version = ++generation.current;
    setBusy(true);
    setReadQuote(null);
    setQuote(null);
    setMessage("Finding route…");
    try {
      if (v1) {
        const capabilities = await tailApi.capabilities();
        if (!capabilities.quote)
          throw new Error("Backend quotes are unavailable.");
        const result = await tailApi.quote(
          WSOL,
          coin.address,
          parseSolIn(amount).toString(),
        );
        if (version === generation.current) {
          setReadQuote(result);
          setMessage(
            "Quote only · transaction signing and execution are disabled.",
          );
        }
      } else {
        const result = await quoteSol(coin.address, amount, slippage);
        if (version === generation.current) {
          setQuote(result);
          setMessage("");
        }
      }
    } catch (e) {
      if (version === generation.current)
        setMessage(e instanceof Error ? e.message : "Quote unavailable");
    } finally {
      if (version === generation.current) setBusy(false);
    }
  };
  const swap = async () => {
    if (!quote || v1 || !EXECUTION_POLICY.executionEnabled) return;
    setBusy(true);
    setMessage("Review the transaction in your wallet");
    try {
      await executeSwap(quote, (sig) => {
        setSignature(sig);
        setMessage("Submitted · waiting for confirmation…");
      });
      setMessage("Swap confirmed");
      mascot.notify("transaction:confirmed");
      setQuote(null);
      void refreshAccount();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Swap rejected");
      mascot.error();
    } finally {
      setBusy(false);
    }
  };
  let insufficient = false;
  try {
    insufficient =
      w.bal !== null && Number(parseSolIn(amount)) / 1e9 + 0.005 > w.bal;
  } catch {}
  return (
    <div className="sol-swap">
      <div className="section-caption">
        <b>Swap</b>
        <span>SOL → {coin?.symbol ?? "token"}</span>
      </div>
      {isExtension() && !v1 && (
        <p className="data-note">
          Quotes are available here. Connect your wallet and approve swaps on{" "}
          <a
            href={walletWebsiteHref(coin?.address, preferences.astraBackend)}
            target="_blank"
            rel="noopener noreferrer"
            className="extension-wallet-handoff"
          >
            the {brand.product} website ↗
          </a>
          .
        </p>
      )}
      {!w.account && !isExtension() && (
        <div className="wallet-choices">
          {w.wallets.map((wallet) => (
            <button
              key={wallet.rdns}
              disabled={busy}
              onClick={() => {
                setMessage("");
                void connectWallet(wallet.rdns).catch((e) =>
                  setMessage(e.message),
                );
              }}
            >
              {wallet.name}
            </button>
          ))}
          {!w.wallets.length && (
            <p className="data-note">
              No compatible wallet found. Install a Solana Wallet Standard
              wallet such as Phantom or Solflare, then refresh.
            </p>
          )}
        </div>
      )}
      <label className="swap-amount">
        <span>
          You pay{" "}
          <small>
            {w.account
              ? `Balance ${w.bal === null ? "unavailable" : w.bal.toFixed(4) + " SOL"}`
              : "Solana mainnet"}
          </small>
        </span>
        <div>
          <input
            aria-label="Amount in SOL"
            inputMode="decimal"
            value={amount}
            disabled={busy}
            onChange={(e) => setAmount(e.target.value)}
          />
          <b>SOL</b>
        </div>
      </label>
      <div className="swap-presets">
        {["0.1", "0.5", "1", "2", "5"].map((v) => (
          <button key={v} disabled={busy} onClick={() => setAmount(v)}>
            {v}
          </button>
        ))}
      </div>
      {!quote && !readQuote && (
        <div className="quote-placeholder">
          <span>You receive (quote)</span>
          <b>Request a route</b>
        </div>
      )}
      <label className="swap-slippage">
        Slippage
        <select
          value={v1 ? "unavailable" : slippage}
          disabled={busy || v1}
          title={
            v1
              ? "V1 quotes are non-executable and do not accept a custom slippage setting."
              : undefined
          }
          onChange={(e) => setSlippage(Number(e.target.value))}
        >
          {v1 ? (
            <option value="unavailable">Not applied · quote only</option>
          ) : (
            <>
              <option value={50}>0.5%</option>
              <option value={100}>1%</option>
              <option value={200}>2%</option>
              <option value={500}>5%</option>
            </>
          )}
        </select>
      </label>
      {readQuote && (
        <div className="quote-details">
          <span>
            Quoted output{" "}
            <b>
              {formatAtomic(readQuote.outAmount!, readQuote.outputDecimals)}{" "}
              {readQuote.outputDecimals === null ? "" : coin?.symbol}
            </b>
          </span>
          <span>
            Route <b>{readQuote.router ?? "Unknown"} · Jupiter</b>
          </span>
          <span>
            Provider fee{" "}
            <b>
              {readQuote.feeBps == null
                ? "Unavailable"
                : `${readQuote.feeBps} bps`}
            </b>
          </span>
          <small>
            {Date.now() - readQuote.createdAt > 45000
              ? "Stale quote · refresh"
              : `Observed ${readQuote.asOf}`}{" "}
            · Not executable
          </small>
        </div>
      )}
      {quote && (
        <div className="quote-details">
          <span>
            You receive{" "}
            <b>
              {fmtQty(
                Number(quote.response.data.outputAmount) / 10 ** quote.decimals,
              )}{" "}
              {coin?.symbol}
            </b>
          </span>
          <span>
            Minimum{" "}
            <b>
              {fmtQty(
                Number(quote.response.data.otherAmountThreshold) /
                  10 ** quote.decimals,
              )}
            </b>
          </span>
          <span>
            Price impact <b>{quote.response.data.priceImpactPct}%</b>
          </span>
          <small>
            {expired
              ? "Quote expired"
              : `Quote valid for ${Math.min(45, Math.max(0, 45 - Math.floor((now - quote.createdAt) / 1000)))}s`}{" "}
            · Raydium
          </small>
        </div>
      )}
      <button
        className="primary-action"
        disabled={busy || !coin || coin.address === WSOL}
        onClick={() => void getQuote()}
      >
        {busy
          ? "Working…"
          : !coin
            ? "Select a token"
            : coin.address === WSOL
              ? "Choose a token to buy"
              : "Get quote"}
      </button>
      {quote && isExtension() ? (
        <a
          className="primary-action extension-wallet-handoff"
          href={walletWebsiteHref(coin?.address, preferences.astraBackend)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open on TAIL ↗
        </a>
      ) : quote ? (
        <button
          className="primary-action"
          disabled={busy || (!expired && (!EXECUTION_POLICY.executionEnabled || !w.account || insufficient))}
          onClick={() => void (expired ? getQuote() : swap())}
        >
          {expired
            ? "Refresh quote"
            : !EXECUTION_POLICY.executionEnabled
              ? 'Execution disabled'
            : !w.account
              ? "Connect wallet to swap"
              : insufficient
                ? "Insufficient SOL + fee reserve"
                : "Review & swap"}
        </button>
      ) : null}
      {message && (
        <p className="data-note" role="status">
          {message}
        </p>
      )}
      {signature && (
        <a
          href={`${EXPLORER}/tx/${signature}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction ↗
        </a>
      )}
      {coin && coin.address !== WSOL && (
        <a
          className="external-route"
          href={`https://jup.ag/swap/${WSOL}-${coin.address}`}
          target="_blank"
          rel="noreferrer"
        >
          Open {coin.symbol} on Jupiter ↗
        </a>
      )}
    </div>
  );
}
