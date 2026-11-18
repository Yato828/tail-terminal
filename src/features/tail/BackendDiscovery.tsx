import { AdvancedDiscovery } from "../v2/market";
import { useEffect, useState } from "react";
import { tailApi } from "../../services/backend/client";
import { hydrateMints, coinFromPair } from "../../services/backend/market";
import type { AxiomCoin } from "../../lib/axiom";
import type { PoolList } from "../../services/backend/contracts";
import { errorMessage, isSolanaAddress } from "../../lib/validation";
import { fmtUsd, shortAddr } from "../../lib/format";
import { EXPLORER } from "../../lib/const";
export function BackendDiscovery({
  selectMint,
}: {
  selectMint: (mint: string) => void;
}) {
  const [mode, setMode] = useState("Profiles"),
    [query, setQuery] = useState(""),
    [minLiquidity, setMinLiquidity] = useState(""),
    [maxMarketCap, setMaxMarketCap] = useState(""),
    [volume, setVolume] = useState(""),
    [buys, setBuys] = useState(""),
    [age, setAge] = useState(""),
    [dex, setDex] = useState("");
  const [rows, setRows] = useState<AxiomCoin[]>([]),
    [pools, setPools] = useState<PoolList | null>(null),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (mode === "Advanced" || (mode === "Filter" && !query.trim())) return;
    let stopped = false;
    setBusy(true);
    setError("");
    setRows([]);
    setPools(null);
    const run = async () => {
      try {
        if (mode === "New pools") {
          const r = await tailApi.newPools();
          if (!stopped) {
            setPools(r);
            setNote(`${r.source} · ${r.asOf} · ${r.warning}`);
          }
          return;
        }
        if (mode === "Filter") {
          const r = await tailApi.filter({
            q: query,
            minLiquidity: minLiquidity || undefined,
            maxMarketCap: maxMarketCap || undefined,
            minVolume24h: volume || undefined,
            minBuys5m: buys || undefined,
            maxAgeMinutes: age || undefined,
            dex: dex || undefined,
          });
          if (!stopped) {
            setRows(
              r.items
                .map((p) => coinFromPair(p, r))
                .filter((c): c is AxiomCoin => !!c),
            );
            setNote(
              `${r.source} · ${r.asOf} · filter over text-search results, not all Solana tokens`,
            );
          }
          return;
        }
        const r =
          mode === "Paid boosts"
            ? await tailApi.trending(12)
            : await tailApi.profiles(12);
        const coins = await hydrateMints(r.items.map((p) => p.tokenAddress));
        if (!stopped) {
          setRows(coins);
          setNote(`${r.source} · ${r.asOf} · ${r.warning}`);
        }
      } catch (e) {
        if (!stopped) setError(errorMessage(e));
      } finally {
        if (!stopped) setBusy(false);
      }
    };
    void run();
    return () => {
      stopped = true;
    };
    // Filter fields are submitted explicitly rather than requesting on each keystroke.
  }, [mode, revision]);
  return (
    <section className="tail-settings">
      <h1>Solana discovery</h1>
      <div className="tool-actions">
        {["Profiles", "Paid boosts", "New pools", "Filter", "Advanced"].map((m) => (
          <button key={m} aria-pressed={m === mode} onClick={() => setMode(m)}>
            {m}
          </button>
        ))}
      </div>
      {mode === "Advanced" ? <AdvancedDiscovery selectMint={selectMint} /> : <>
      <p>
        Paid boosts are advertisements, not organic trending or smart-money
        rankings. Profiles and new pools are indexer observations and may lag
        launches.
      </p>
      {mode === "Filter" && (
        <form
          className="tool-form"
          onSubmit={(e) => {
            e.preventDefault();
            setRevision((v) => v + 1);
          }}
        >
          {[
            ["Search", query, setQuery],
            ["Minimum liquidity USD", minLiquidity, setMinLiquidity],
            ["Maximum market cap USD", maxMarketCap, setMaxMarketCap],
            ["Minimum 24h volume USD", volume, setVolume],
            ["Minimum buys 5m", buys, setBuys],
            ["Maximum age minutes", age, setAge],
            ["DEX", dex, setDex],
          ].map(([label, value, set]) => (
            <label key={label as string}>
              {label as string}
              <input
                aria-label={label as string}
                value={value as string}
                onChange={(e) => (set as (v: string) => void)(e.target.value)}
              />
            </label>
          ))}
          <button disabled={busy || !query.trim()}>Apply server filter</button>
        </form>
      )}
      {busy && <p role="status">Loading discovery sources…</p>}
      {error && (
        <p className="tail-error" role="alert">
          {error}
        </p>
      )}
      {note && <small>{note}</small>}
      <div className="activity-table">
        <table>
          <thead>
            <tr>
              <th>Token / pool</th>
              <th>Price / liquidity</th>
              <th>Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.address}>
                <td>
                  {c.symbol} · {shortAddr(c.address)}
                </td>
                <td>
                  {fmtUsd(c.priceUsd)} · {fmtUsd(c.liquidityUsd)}
                </td>
                <td>
                  <button onClick={() => selectMint(c.address)}>
                    Open {c.symbol}
                  </button>
                </td>
              </tr>
            ))}
            {pools?.items.map((p) => (
              <tr key={p.poolAddress ?? p.name}>
                <td>{p.name ?? "Unnamed pool"}</td>
                <td>{fmtUsd(p.reserveUsd)}</td>
                <td>
                  {isSolanaAddress(p.poolAddress) && (
                    <a
                      href={`${EXPLORER}/account/${p.poolAddress}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Pool ↗
                    </a>
                  )}{" "}
                  <button
                    disabled={!isSolanaAddress(p.baseMint)}
                    onClick={() => p.baseMint && selectMint(p.baseMint)}
                  >
                    Open base token
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!busy && !error && !rows.length && !pools?.items.length && (
        <p>No matching source rows.</p>
      )}
      <button disabled={busy} onClick={() => setRevision((v) => v + 1)}>
        Refresh discovery
      </button>
      </>}
    </section>
  );
}
