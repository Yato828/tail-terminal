import { tailBackendEnabled } from "../../services/backend/config";
import { useEffect, useState } from "react";
import { CANDLE_IVS } from "../../lib/axiom";
import { getFableStatus } from "../../services/adapters/tail";
import { usePreferences, type Preferences } from "../preferences/preferences";
import type { AstraStatus } from "../astra/types";
import { errorMessage } from "../../lib/validation";
import { mascot } from "../../mascot/events";
import {clearBrowserModuleData} from '../v2/storage';
export function TailPreferences() {
  const { preferences: p, update, reset } = usePreferences();
  const [status, setStatus] = useState<AstraStatus | null>(null),
    [error, setError] = useState(""),[clearNotice,setClearNotice]=useState('');
  useEffect(() => {
    const ac = new AbortController();
    getFableStatus(ac.signal)
      .then(setStatus)
      .catch((e) => {
        if (!ac.signal.aborted) setError(errorMessage(e));
      });
    return () => ac.abort();
  }, []);
  const save = (patch: Partial<Preferences>) => {
    update(patch);
    mascot.notify("settings:saved");
  };
  const toggles: [keyof Preferences, string][] = [
    ["showVolume", "Volume"],
    ["showGrid", "Chart grid"],
    ["showCrosshair", "Crosshair"],
    ["hollowCandles", "Hollow candles"],
    ["liveUpdates", "Automatic source updates"],
    ["streamPrices", "Solana pool WebSocket"],
    ["followLatest", "Follow latest candle"],
    ["aiScenario", "Fable 5.2 scenarios · hypothetical, explicit request only"],
    ["reducedMotion", "Reduce motion"],
    ["tokenArtwork", "Token artwork"],
    ["tradeFeed", "Trade feed"],
    ["holderTools", "Holder tools"],
    ["creationTools", "SPL drafts and sandbox exports"],
  ];
  return (
    <section className="tail-settings tail-preferences">
      <h2>Appearance & market data</h2>
      <div className="preference-grid">
        <label>
          Dark theme
          <select
            aria-label="Dark theme"
            value={p.theme}
            onChange={(e) =>
              save({ theme: e.target.value as Preferences["theme"] })
            }
          >
            <option value="black">Warm black</option>
            <option value="graphite">Graphite</option>
            <option value="midnight">Midnight</option>
          </select>
        </label>
        <label>
          Interface accent
          <select
            aria-label="Interface accent"
            value={p.accent}
            onChange={(e) => save({ accent: e.target.value })}
          >
            <option value="#ff812e">TAIL orange</option>
            <option value="#ff963b">Amber orange</option>
            <option value="#ea6018">Burnt orange</option>
            {!["#ff812e", "#ff963b", "#ea6018"].includes(p.accent) && (
              <option value={p.accent}>Custom warm accent</option>
            )}
          </select>
        </label>
        <label>
          Market colors{" "}
          <span className="direction-swatches">
            <i style={{ background: p.upColor }} />
            Growth <i style={{ background: p.downColor }} />
            Decline
          </span>
        </label>
        <label>
          Default interval
          <select
            aria-label="Default interval"
            value={p.defaultInterval}
            onChange={(e) =>
              save({
                defaultInterval: e.target
                  .value as Preferences["defaultInterval"],
              })
            }
          >
            {CANDLE_IVS.map((iv) => (
              <option key={iv}>{iv}</option>
            ))}
          </select>
        </label>
        <label>
          Source refresh
          <select
            aria-label="Source refresh"
            value={p.refreshSeconds}
            onChange={(e) =>
              save({
                refreshSeconds: +e.target
                  .value as Preferences["refreshSeconds"],
              })
            }
          >
            {[5, 10, 15, 30].map((v) => (
              <option key={v} value={v}>
                {v}s
              </option>
            ))}
          </select>
        </label>
        <label>
          Spot commitment
          <select
            aria-label="Spot commitment"
            value={p.streamCommitment}
            onChange={(e) =>
              save({
                streamCommitment: e.target
                  .value as Preferences["streamCommitment"],
              })
            }
          >
            <option value="processed">Processed · provisional</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </label>
        <label>
          Visible candles
          <select
            value={p.visibleCandles}
            onChange={(e) =>
              save({
                visibleCandles: +e.target
                  .value as Preferences["visibleCandles"],
              })
            }
          >
            {[80, 120, 200].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="preference-checks">
        {toggles.map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={
                key === "aiScenario" && tailBackendEnabled()
                  ? false
                  : Boolean(p[key])
              }
              disabled={key === "aiScenario" && tailBackendEnabled()}
              title={
                key === "aiScenario" && tailBackendEnabled()
                  ? "TAIL Backend V1 does not implement scenarios."
                  : undefined
              }
              onChange={(e) => save({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      <label className="stream-setting">
        Optional public WSS endpoint
        <input
          aria-label="Public Solana WSS endpoint"
          placeholder="wss://… (public endpoint only)"
          value={p.streamEndpoint}
          onChange={(e) => update({ streamEndpoint: e.target.value })}
        />
      </label>
      <p>
        Orca Whirlpools, Raydium CLMM and Meteora DLMM have verified push
        decoders. Other pools use source candles. Processed spot updates are
        provisional; volume comes from the candle source.
      </p>
      <h2>Fable 5.2</h2>
      <p>
        {status?.ready
          ? "Connected"
          : (status?.reason ??
            (error ? "Fable 5.2 is currently unavailable." : "Connecting…"))}
      </p>
      <button
        onClick={() => {
          reset();
          mascot.notify("settings:saved");
        }}
      >
        Reset appearance & chart preferences
      </button>
      <h2>Local module data</h2>
      <p>Journal, notes, alerts, snapshots and saved tool settings stay in this browser profile. Clearing them keeps your appearance and main terminal layout. The website and extension have separate local storage.</p>
      <button onClick={async()=>{const result=await clearBrowserModuleData();setClearNotice(result.local&&result.idb?'Local module data cleared. Reload to reset any open source views.':`Cleared available stores. ${result.local?'':'LocalStorage is unavailable. '}${result.idb?'':'IndexedDB is unavailable.'}`);}}>Clear local module data</button>
      {clearNotice&&<p role="status">{clearNotice}</p>}
    </section>
  );
}
