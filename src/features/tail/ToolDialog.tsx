import { tailBackendEnabled } from "../../services/backend/config";
import { isExtension } from "../../lib/env";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { WalletChip } from "../../components/WalletSwap";
import { useWallet } from "../../services/adapters/tail";
import { usePreferences, featureEnabled } from "../preferences/preferences";
import { MODULES, type ModuleId } from "../workspace/store";
import type { AxiomCoin } from "../../lib/axiom";
import { Icon } from "./Icon";
import { labels, type PanelId } from "./presentation";
import { PRESETS, WIDGETS, type useTailWorkspace } from "./workspace";
import { downloadFile } from '../v2/storage';
const MultiChart=lazy(()=>import('../v2/charts/ChartWorkbench').then(m=>({default:m.ChartWorkbench})));
const TokenCompare=lazy(()=>import('../v2/market/TokenCompare').then(m=>({default:m.TokenCompare})));
const V2Intelligence=lazy(()=>import('../v2/intelligence/V2Intelligence'));
const TradeJournal=lazy(()=>import('../v2/journal/TradeJournal'));
const AlertBuilder=lazy(()=>import('../v2/alerts/AlertBuilder'));
const MarketDiagnostics=lazy(()=>import('../v2/market/MarketDiagnostics').then(m=>({default:m.MarketDiagnostics})));
const TradingDesk=lazy(()=>import('../v2/trading/TradingDesk'));
const SocialAnalysis=lazy(()=>import('../v2/social/SocialAnalysis'));
const FableTools=lazy(()=>import('../v2/fable/FableTools'));
const WorkspaceStudio=lazy(()=>import('../v2/workspace'));
const BackendAlerts = lazy(() =>
  import("./BackendAlerts").then((m) => ({ default: m.BackendAlerts })),
);
const BackendAccount = lazy(() =>
  import("./BackendAccount").then((m) => ({ default: m.BackendAccount })),
);
const BackendDiscovery = lazy(() =>
  import("./BackendDiscovery").then((m) => ({ default: m.BackendDiscovery })),
);
const BackendConnection = lazy(() =>
  import("./BackendConnection").then((m) => ({ default: m.BackendConnection })),
);
const ActivityPanel = lazy(() =>
  import("./ActivityPanel").then((m) => ({ default: m.ActivityPanel })),
);
const Intelligence = lazy(() => import("../intelligence/Intelligence"));
const Creation = lazy(() => import("../create/Creation"));
const TailPreferences = lazy(() =>
  import("./TailPreferences").then((m) => ({ default: m.TailPreferences })),
);
const BubbleMap = lazy(() =>
  import("../../components/BubbleMap").then((m) => ({ default: m.BubbleMap })),
);
type Props = {
  panel: PanelId;
  setPanel: (id: PanelId | null) => void;
  workspace: ReturnType<typeof useTailWorkspace>;
  setListMode: (value: string) => void;
  notify: (text: string, saved?: boolean) => void;
  openModule: (id: ModuleId) => void;
  coin: AxiomCoin | null;
  selectMint: (mint: string) => void;
  chooseWallet: (address: string) => void;
  selectedWallet?:string;
  compareMints?:string[];
};
export function ToolDialog({
  panel,
  setPanel,
  workspace,
  setListMode,
  notify,
  openModule,
  coin,
  selectMint,
  chooseWallet,
  selectedWallet='',
  compareMints,
}: Props) {
  const { preferences } = usePreferences();
  const wallet = useWallet();
  const layout = workspace.layout;
  const [layoutName, setLayoutName] = useState("");
  const modal = useRef<HTMLDivElement>(null),
    modalPreviousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!panel) return;
    modalPreviousFocus.current = document.activeElement as HTMLElement;
    modal.current?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !modal.current) return;
      const nodes = [
        ...modal.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select, a[href], textarea:not(:disabled), [tabindex="0"]',
        ),
      ].filter((el) => el.getClientRects().length);
      const first = nodes[0],
        last = nodes.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === modal.current)
      ) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      modalPreviousFocus.current?.focus();
    };
  }, [panel]);
  return (
    <div
      className="tail-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) setPanel(null);
      }}
    >
      <div
        ref={modal}
        tabIndex={-1}
        className="tail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={
          panel === "settings"
            ? "Workspace settings"
            : panel === "account"
              ? "Account"
              : panel === "alerts"
                ? "Alerts"
                : MODULES.find((m) => m.id === panel)?.title
        }
      >
        <header className="modal-header">
          <b>
            {panel === "settings"
              ? "Workspace settings"
              : panel === "account"
                ? "Account"
                : panel === "alerts"
                  ? "Alerts"
                  : MODULES.find((m) => m.id === panel)?.title}
          </b>
          <button aria-label="Close panel" onClick={() => setPanel(null)}>
            <Icon name="close" />
          </button>
        </header>
        <div className="module-links">
          {(
            [
              "xray",
              "smart",
              "watch",
              "kol",
              "exit",
              "holders",
              "flow",
              "network",
              "launch",
              "tweet",
              "website",
              'studio','charts','compare','intelligence2','portfolio','journal','signals','data','routes','social','fabletools',
            ] as ModuleId[]
          ).map((id) => (
            <button
              key={id}
              disabled={!featureEnabled(id, preferences)}
              onClick={() => openModule(id)}
              className={panel === id ? "active" : ""}
            >
              {MODULES.find((m) => m.id === id)?.title}
            </button>
          ))}
          {tailBackendEnabled() && (
            <button onClick={() => setPanel("account")}>Wallet balances</button>
          )}
        </div>
        <Suspense fallback={<p className="data-note">Loading module…</p>}>
          {panel === "settings" ? (
            <>
              <section className="tail-settings">
                <h1>Your workspace. Your way.</h1>
                <p>Local versioned layouts · changes are reversible.</p>
                <div className="preset-buttons">
                  {PRESETS.map((name) => (
                    <button
                      key={name}
                      onClick={() => {
                        const saved = workspace.applyPreset(name);
                        if (name === "New Launches") setListMode("New Pairs");
                        else setListMode("Trending");
                        notify(`${name} layout applied`, saved);
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (workspace.saveAs(layoutName)) {
                      setLayoutName("");
                      notify("Workspace saved");
                    } else notify("", false);
                  }}
                >
                  <input
                    aria-label="Layout name"
                    placeholder="Name your workspace"
                    value={layoutName}
                    maxLength={40}
                    onChange={(e) => setLayoutName(e.target.value)}
                  />
                  <button
                    disabled={
                      !layoutName.trim() || workspace.desk.layouts.length >= 12
                    }
                  >
                    Save as new workspace
                  </button>
                </form>
                <div className="column-settings">
                  {["Market column", "Trading column"].map((label, i) => (
                    <label key={label}>
                      {label}{" "}
                      <input
                        type="range"
                        min="200"
                        max="500"
                        value={layout.widths[i]}
                        onChange={(e) => {
                          const widths = [...layout.widths];
                          widths[i] = +e.target.value;
                          workspace.update({ widths });
                        }}
                      />{" "}
                      {layout.widths[i]}px
                    </label>
                  ))}
                </div>
                <div className="widget-toggles">
                  {WIDGETS.map((id) => (
                    <label key={id}>
                      <input
                        type="checkbox"
                        checked={!layout.hidden.includes(id)}
                        disabled={layout.pinned.includes(id)}
                        onChange={() =>
                          workspace.update({
                            hidden: layout.hidden.includes(id)
                              ? layout.hidden.filter((w) => w !== id)
                              : [...layout.hidden, id],
                          })
                        }
                      />
                      {labels[id]}
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => {
                    notify(
                      "Default layout restored",
                      workspace.applyPreset("Default"),
                    );
                  }}
                >
                  Reset layout
                </button>
                <div className="tool-actions"><button onClick={()=>downloadFile('tail-workspace.json',workspace.exportText())}>Export workspace</button><label>Import workspace<input aria-label="Import workspace JSON" type="file" accept="application/json" onChange={async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>131072)throw Error('Workspace import exceeds 128 KB.');notify('Workspace imported',workspace.importText(await file.text()));}catch(err){notify(err instanceof Error?err.message:'Invalid workspace import');}}}/></label></div>
                <a
                  href={isExtension() ? "popup.html?view=mascot" : "/mascot"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open mascot motion studio ↗
                </a>
              </section>
              <TailPreferences />
              {tailBackendEnabled() && <BackendConnection />}
            </>
          ) : panel==='studio'?<WorkspaceStudio coin={coin} wallet={selectedWallet} selectMint={selectMint} selectWallet={chooseWallet}/>:panel === 'charts' ? <MultiChart coin={coin} selectMint={selectMint}/> : panel==='compare'?<TokenCompare initialMints={compareMints?.length?compareMints:coin?[coin.address]:[]} selectMint={selectMint}/> : panel==='intelligence2'||panel==='portfolio'?<V2Intelligence coin={coin} wallet={selectedWallet} initialView={panel==='portfolio'?'Portfolio':'Wallets'} selectMint={selectMint} selectWallet={chooseWallet}/>:panel==='journal'?<TradeJournal mint={coin?.address}/>:panel==='signals'?<AlertBuilder mint={coin?.address}/>:panel==='data'?<MarketDiagnostics/>:panel==='routes'?<TradingDesk coin={coin} wallet={selectedWallet||wallet.account}/>:panel==='social'?<SocialAnalysis coin={coin} selectMint={selectMint}/>:panel==='fabletools'?<FableTools coin={coin} wallet={selectedWallet}/> : panel === "pulse" && tailBackendEnabled() ? (
            <BackendDiscovery selectMint={selectMint} />
          ) : panel === "alerts" && tailBackendEnabled() ? (
            <BackendAlerts mint={coin?.address} selectMint={selectMint} />
          ) : panel === "account" && tailBackendEnabled() ? (
            <BackendAccount chooseWallet={chooseWallet} />
          ) : panel === "account" ? (
            <section className="tail-settings">
              <h1>Solana wallet</h1>
              <p>
                {wallet.account
                  ? wallet.account
                  : "Connect a compatible Solana wallet to review and approve swaps."}
              </p>
              <WalletChip />
              <p>
                Balance:{" "}
                {wallet.bal == null
                  ? "Unavailable"
                  : `${wallet.bal.toFixed(4)} SOL`}
              </p>
            </section>
          ) : panel === "alerts" ? (
            <section className="tail-settings">
              <h1>Alerts</h1>
              <p>
                Wallet Watch supports in-app observed-activity alerts while its
                view is open. Background notifications and price alerts are not
                connected.
              </p>
              <button onClick={() => setPanel("watch")}>
                Open Wallet Watch
              </button>
              <button disabled>Background alerts · unavailable</button>
            </section>
          ) : panel === "flow" || panel === "network" ? (
            <ActivityPanel coin={coin} kind={panel} />
          ) : panel === "holders" ? (
            coin ? (
              <BubbleMap
                token={coin.address}
                pool={coin.pairAddress}
                symbol={coin.symbol}
              />
            ) : (
              <p className="data-note">
                Select a token to inspect holder coverage.
              </p>
            )
          ) : ["launch", "tweet", "website"].includes(panel) ? (
            <Creation
              key={panel}
              kind={panel as "launch" | "tweet" | "website"}
              open={openModule}
            />
          ) : (
            <>
              {panel === "watch" && (
                <p className="data-note">
                  Portfolio · public wallet balances and observed history.
                  Positions, cost basis and PnL are not implemented.
                </p>
              )}
              <Intelligence
                key={panel}
                id={panel as ModuleId}
                coin={coin}
                open={openModule}
                selectMint={selectMint}
                selectWallet={chooseWallet}
              />
            </>
          )}
        </Suspense>
      </div>
    </div>
  );
}
