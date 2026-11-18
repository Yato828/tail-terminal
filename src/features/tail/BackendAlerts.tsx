import { lazy,Suspense,useEffect, useRef, useState } from "react";
const AlertBuilder=lazy(()=>import('../v2/alerts/AlertBuilder'));
import { tailSession } from "../../services/backend/client";
import { tailStandalone } from "../../services/backend/config";
import { subscribeBackendSnapshot } from "../../services/backend/stream";
import type { AlertEvent, PriceAlert } from "../../services/backend/contracts";
import { errorMessage, isSolanaAddress } from "../../lib/validation";
import { fmtUsd, shortAddr } from "../../lib/format";
import { mascot } from "../../mascot/events";
export function BackendAlerts({
  mint = "",
  selectMint,
}: {
  mint?: string;
  selectMint: (mint: string) => void;
}) {
  const [advanced,setAdvanced]=useState(false);
  const [address, setAddress] = useState(mint),
    [price, setPrice] = useState(""),
    [direction, setDirection] = useState<"above" | "below">("above");
  const [watchlist, setWatchlist] = useState<string[]>([]),
    [alerts, setAlerts] = useState<PriceAlert[]>([]),
    [events, setEvents] = useState<AlertEvent[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [feedError, setFeedError] = useState(""),
    [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const seenEvents = useRef<Set<string> | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const [w, a, e] = await Promise.all([
          tailSession.watchlist(),
          tailSession.alerts(),
          tailSession.events(),
        ]);
        if (!stopped) {
          setWatchlist(w.items);
          setAlerts(a.items);
          setEvents(e.items);
          if (
            seenEvents.current &&
            e.items.some((event) => !seenEvents.current!.has(event.id))
          )
            mascot.notify("ui:warning");
          seenEvents.current = new Set(e.items.map((event) => event.id));
          setLoaded(true);
          setError("");
        }
      } catch (e) {
        if (!stopped) setError(errorMessage(e));
      } finally {
        if (!stopped) timer = setTimeout(run, 10000);
      }
    };
    void run();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [revision]);
  const monitored = [
    ...new Set(alerts.filter((a) => !a.triggered).map((a) => a.mint)),
  ]
    .slice(0, 10)
    .sort()
    .join(",");
  useEffect(() => {
    if (!monitored) return;
    let disposers: (() => void)[] = [];
    let stopped = false;
    const sync = () => {
      disposers.forEach((fn) => fn());
      disposers = [];
      if (!document.hidden)
        disposers = monitored.split(",").map((m) =>
          subscribeBackendSnapshot(m, {
            snapshot: () => {
              if (!stopped) setFeedError("");
            },
            error: (message) => {
              if (!stopped) setFeedError(message);
            },
          }),
        );
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      stopped = true;
      disposers.forEach((fn) => fn());
      document.removeEventListener("visibilitychange", sync);
    };
  }, [monitored]);
  const mutate = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setRevision((v) => v + 1);
      mascot.notify("settings:saved");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="tail-settings">
      <h1>Watchlist & price alerts</h1>
      <button onClick={()=>setAdvanced(v=>!v)}>{advanced?'Hide advanced alert rules':'Advanced alert rules'}</button>
      {advanced&&<Suspense fallback={<p>Loading alert rules…</p>}><AlertBuilder mint={mint}/></Suspense>}
      <p>
        {tailStandalone()
          ? "Saved in this browser profile. "
          : "Anonymous session for this browser tab. "}
        It does not prove wallet ownership. Alerts evaluate observed polling
        prices only while their token has an active stream listener; no 24/7
        delivery.
      </p>
      {!loaded && !error && <p role="status">Loading session…</p>}
      {error && (
        <p className="tail-error" role="alert">
          {error}
        </p>
      )}
      {feedError && (
        <p className="data-note" role="status">
          {feedError}
        </p>
      )}
      <form
        className="tool-form"
        onSubmit={(e) => {
          e.preventDefault();
          void mutate(() => tailSession.watch(address, true));
        }}
      >
        <label>
          Solana mint
          <input
            aria-label="Watched token mint"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <button disabled={busy || !isSolanaAddress(address)}>
          Add to watchlist
        </button>
      </form>
      <h2>Watched tokens</h2>
      {watchlist.length ? (
        watchlist.map((m) => (
          <div className="tool-actions" key={m}>
            <button title={m} onClick={() => selectMint(m)}>
              {shortAddr(m)}
            </button>
            <button
              disabled={busy}
              onClick={() => void mutate(() => tailSession.watch(m, false))}
            >
              Remove {shortAddr(m)}
            </button>
          </div>
        ))
      ) : (
        <p>No watched tokens.</p>
      )}
      <form
        className="tool-form"
        onSubmit={(e) => {
          e.preventDefault();
          void mutate(() =>
            tailSession.createAlert(address, direction, Number(price)),
          );
        }}
      >
        <h2>Price condition</h2>
        <label>
          Direction
          <select
            aria-label="Alert direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as typeof direction)}
          >
            <option value="above">At or above</option>
            <option value="below">At or below</option>
          </select>
        </label>
        <label>
          USD price
          <input
            aria-label="Alert price USD"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <button
          disabled={
            busy ||
            !isSolanaAddress(address) ||
            !Number.isFinite(Number(price)) ||
            Number(price) <= 0
          }
        >
          Create price alert
        </button>
      </form>
      <p>
        Monitored here: {monitored ? monitored.split(",").length : 0} distinct
        mints (maximum 10). Additional alerts require an active token stream.
        Pauses while this tab is hidden.
      </p>
      <h2>Alerts</h2>
      {alerts.length ? (
        alerts.map((a) => (
          <div className="tool-actions" key={a.id}>
            <span>
              {shortAddr(a.mint)} {a.direction === "above" ? "≥" : "≤"}{" "}
              {fmtUsd(a.priceUsd)} ·{" "}
              {a.triggered ? "Triggered" : "Waiting for source"}
            </span>
            <button
              disabled={busy}
              onClick={() => void mutate(() => tailSession.deleteAlert(a.id))}
            >
              Delete alert
            </button>
          </div>
        ))
      ) : (
        <p>No price alerts.</p>
      )}
      <h2>Observed events</h2>
      {events.length ? (
        events.map((e) => (
          <p key={e.id}>
            {shortAddr(e.mint)} · {fmtUsd(e.priceUsd)} ·{" "}
            {new Date(e.createdAt).toISOString()}
          </p>
        ))
      ) : (
        <p>No alert events.</p>
      )}
    </section>
  );
}
