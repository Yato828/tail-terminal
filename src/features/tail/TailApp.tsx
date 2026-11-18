import { tailBackendEnabled } from "../../services/backend/config";
import { isExtension } from "../../lib/env";
import { useEffect, useState, type CSSProperties } from "react";
import {
  PreferencesProvider,
  usePreferences,
  featureEnabled,
} from "../preferences/preferences";
import { useTerminalData } from "./useTerminalData";
import { isSolanaAddress, readLocal, saveLocal } from "../../lib/validation";
import {isModule,type ModuleId} from "../workspace/store";
import { Icon } from "./Icon";
import { TerminalWidgetContent } from "./TerminalWidgets";
import { TailHeader } from "./TailHeader";
import { ToolDialog } from "./ToolDialog";
import { labels, type PanelId } from "./presentation";
import { Widget } from "./Widget";
import { useTailWorkspace, type WidgetId } from "./workspace";
import {WIDGETS} from './workspace';
import {WorkspaceBridge} from '../v2/WorkspaceBridge';
import {ForegroundAlerts} from '../v2/alerts/ForegroundAlerts';
import {CHART_COMMAND_EVENT} from '../v2/charts/state';
import {readFilterPresets,writeFilterPresets,validateFilter} from '../v2/market/filters';
import type {WorkspaceAction} from '../v2/contracts';
import '../v2/v2.css';
import { mascot } from "../../mascot/events";
import { TailBrand } from "../../design-system/brand";
import { MascotDemo } from "../../mascot/MascotDemo";
import "../../terminal.css";
import "../workspace/workspace.css";
import "./tail.css";
function TailDesk({ onHome }: { onHome?: () => void }) {
  const workspace = useTailWorkspace(),
    { preferences, storageError } = usePreferences();
  const [edit, setEdit] = useState(false),
    [maximized, setMaximized] = useState<WidgetId | null>(null),
    [panel, setPanel] = useState<PanelId | null>(null),
    [notice, setNotice] = useState("");
  const [compareMints,setCompareMints]=useState<string[]>([]);
  useEffect(()=>{const requested=new URLSearchParams(location.search).get('module');const module=requested==='wallet-tracker'?'intelligence2':requested;if(module&&isModule(module))setPanel(module);},[]);
  const [selectedWallet, setSelectedWallet] = useState(() =>
    readLocal(
      "tail.selectedWallet.v1",
      (v) => (isSolanaAddress(v) ? v : ""),
      "",
    ),
  );
  useEffect(()=>{const clear=()=>setSelectedWallet('');window.addEventListener('part:clear-data',clear);return()=>window.removeEventListener('part:clear-data',clear);},[]);
  const layout = workspace.layout;
  const data = useTerminalData(workspace.desk.active);
  const { coin, setQuery, setSearchOpen, setListMode, input, listMode } = data;
  useEffect(() => {
    const requestId = mascot.begin("loading", "terminal");
    // This effect runs after the actual terminal has committed, not after an animation timer.
    mascot.end(requestId, "idle");
    return () => {
      mascot.end(requestId, "cancel");
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        input.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setMaximized((v) => (v === "fable" ? null : "fable"));
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setPanel(null);
        setMaximized(null);
      }
      if (e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        document
          .querySelector('[data-widget="trending"]')
          ?.scrollIntoView({ block: "center" });
      }
      if (e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        setMaximized((v) => (v === "chart" ? null : "chart"));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const openModule = (id: ModuleId) => {
    if (!featureEnabled(id, preferences)) {
      setNotice("This module is disabled in Settings.");
      return;
    }
    if (id === "terminal") setPanel(null);
    else if (id === "astra") setMaximized("fable");
    else setPanel(id);
  };
  const selectMint = (mint: string) => {
    setQuery(mint);
    setSearchOpen(true);
    input.current?.focus();
  };
  const chooseWallet = (address: string) => {
    setSelectedWallet(address);
    saveLocal("tail.selectedWallet.v1", address);
  };
  const notify = (text: string, saved = true) => {
    setNotice(
      saved
        ? text
        : "Local storage unavailable. Changes are only kept for this session.",
    );
    if (saved) mascot.notify("settings:saved");
  };
  const applyAction=(action:WorkspaceAction)=>{
   if(action.type==='open_widget'){
    if(!featureEnabled(action.widget,preferences))throw Error('This tool is disabled in Settings.');
    if(WIDGETS.includes(action.widget as WidgetId)){workspace.update({hidden:layout.hidden.filter(id=>id!==action.widget)});setPanel(null);setMaximized(action.widget as WidgetId);}
    else if(isModule(action.widget))openModule(action.widget);
   }else if(action.type==='set_interval'){if(!coin)throw Error('Select a token before changing its chart interval.');window.dispatchEvent(new CustomEvent(CHART_COMMAND_EVENT,{detail:{chartId:'primary',interval:action.interval}}));}
   else if(action.type==='search_tokens'){setPanel(null);setMaximized(null);selectMint(action.query);}
   else if(action.type==='compare_tokens'){setCompareMints(action.mints);setPanel('compare');}
   else if(action.type==='save_filter'){
    const parsed=validateFilter(action.filter);if(!parsed.valid)throw Error('Invalid filter proposal.');
    writeFilterPresets([...readFilterPresets(),{version:1,id:crypto.randomUUID(),name:action.name,filter:parsed.filter!,sort:{field:'volume24h',direction:'desc'},signal:false}]);setPanel('pulse');
   }
   notify('Workspace action applied');
  };
  const widget = (id: WidgetId) => (
    <Widget
      key={id}
      id={id}
      title={labels[id]}
      edit={edit}
      pinned={layout.pinned.includes(id)}
      height={maximized === id ? undefined : layout.heights[id]}
      onHeight={(n) =>
        workspace.update({ heights: { ...layout.heights, [id]: n } })
      }
      onMove={(n) => workspace.move(id, n)}
      onHide={() => workspace.update({ hidden: [...layout.hidden, id] })}
      onPin={() =>
        workspace.update({
          pinned: layout.pinned.includes(id)
            ? layout.pinned.filter((w) => w !== id)
            : [...layout.pinned, id],
        })
      }
      onExpand={() => setMaximized(id)}
      onDrop={(from) => {
        if (layout.pinned.includes(from)) return;
        const order = [...layout.order];
        const a = order.indexOf(from),
          b = order.indexOf(id);
        [order[a], order[b]] = [order[b], order[a]];
        workspace.update({ order });
      }}
    >
      <TerminalWidgetContent
        id={id}
        data={data}
        selectedWallet={selectedWallet}
        maximized={maximized}
        setMaximized={setMaximized}
        setPanel={setPanel}
        setNotice={setNotice}
      />
    </Widget>
  );
  const visible = layout.order.filter((id) => !layout.hidden.includes(id));
  const nav = [
    { id: "pulse", label: "Pulse", icon: "pulse" },
    { id: "terminal", label: "Terminal", icon: "terminal" },
    { id: "xray", label: "Intelligence", icon: "intelligence" },
    { id: "watch", label: "Portfolio", icon: "portfolio" },
    { id: "alerts", label: "Alerts", icon: "alerts" },
    { id: "settings", label: "Settings", icon: "settings" },
  ] as const;
  return (
    <div
      className={`tail-app theme-${preferences.theme}${preferences.reducedMotion ? " reduce-motion" : ""}`}
      style={
        {
          "--accent": preferences.accent,
          "--up": preferences.upColor,
          "--down": preferences.downColor,
          "--market-width": `${layout.widths[0]}px`,
          "--trade-width": `${layout.widths[1]}px`,
        } as CSSProperties
      }
    >
      <ForegroundAlerts/>
      <WorkspaceBridge mint={coin?.address??null} widgets={[...visible,...(panel?[panel]:[])]} onApply={applyAction}/>
      {isExtension() && (
        <div className="tail-extension-bar">
          <b>
            TAIL <span> / SOLANA MAINNET</span>
          </b>
          {document.documentElement.classList.contains("ext") ? (
            <a
              href={`popup.html?view=desk${coin ? `&mint=${coin.address}` : ""}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open full terminal ↗
            </a>
          ) : (
            <span>Public sources · read-only</span>
          )}
        </div>
      )}
      <TailHeader
        data={data}
        setPanel={setPanel}
        onHome={() => {
          if (onHome) {
            onHome();
            return;
          }
          setPanel(null);
          setMaximized(null);
        }}
      />
      <aside className="tail-sidebar">
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              disabled={!featureEnabled(n.id, preferences)}
              className={
                ((panel==='portfolio'?'watch':panel) ?? (listMode === "New Pairs" ? "pulse" : "terminal")) ===
                n.id
                  ? "active"
                  : ""
              }
              onClick={() =>
                n.id === "terminal"
                  ? (setPanel(null), setListMode("Trending"))
                  : n.id === "pulse"
                    ? tailBackendEnabled()
                      ? setPanel("pulse")
                      : (setPanel(null), setListMode("New Pairs"))
                    : setPanel(n.id==='watch'?'portfolio':n.id)
              }
            >
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-orbits" />
        <small>
          <i /> v2.0.0 <span>MAINNET</span>
        </small>
      </aside>
      <main className="tail-main">
        <div className="workspace-bar">
          <span>
            <Icon name="grid" size={14} /> Workspace
          </span>
          <select
            aria-label="Current workspace"
            value={workspace.desk.active}
            onChange={(e) => workspace.select(e.target.value)}
          >
            {workspace.desk.layouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button onClick={() => setEdit((v) => !v)} aria-pressed={edit}>
            {edit ? "Done editing" : "Customize"}
          </button>
          <button
            aria-label="Workspace settings"
            onClick={() => setPanel("settings")}
          >
            <Icon name="settings" size={14} />
          </button>
          {(storageError || workspace.storageError) && (
            <span role="alert">Local settings could not be saved.</span>
          )}
        </div>
        {edit && (
          <div className="workspace-tools">
            <span>
              Drag a panel handle or use arrows. Resize its lower edge.
            </span>
            {layout.hidden.map((id) => (
              <button
                key={id}
                onClick={() =>
                  workspace.update({
                    hidden: layout.hidden.filter((w) => w !== id),
                  })
                }
              >
                Restore {labels[id]}
              </button>
            ))}
          </div>
        )}
        {maximized ? (
          <div className="widget-maximized">
            <button
              className="restore-widget"
              onClick={() => setMaximized(null)}
            >
              Restore workspace <Icon name="close" size={14} />
            </button>
            {widget(maximized)}
          </div>
        ) : (
          <div className="tail-grid">
            <div className="market-column">
              {visible.filter((id) => layout.order.indexOf(id) < 3).map(widget)}
            </div>
            <div className="chart-column">
              {visible
                .filter((id) => layout.order.indexOf(id) === 3)
                .map(widget)}
            </div>
            <div className="trade-column">
              {visible
                .filter((id) => layout.order.indexOf(id) >= 4)
                .map(widget)}
            </div>
          </div>
        )}
        <div className="workspace-extra">
          <button onClick={()=>setPanel('studio')}>Workspace Studio</button>
          <button onClick={()=>setPanel('charts')}>Multi-chart</button>
          <button onClick={()=>setPanel('intelligence2')}>Wallet intelligence</button>
          <button onClick={()=>setPanel('journal')}>Trade journal</button>
          <button onClick={()=>setPanel('signals')}>Alert rules</button>
          <button
            disabled={!coin || !preferences.tradeFeed}
            onClick={() => setPanel("flow")}
          >
            Recent pool trades
          </button>
          <button onClick={() => setPanel("network")}>Network blocks</button>
          <button onClick={()=>setPanel('portfolio')}>Portfolio holdings</button>
        </div>
      </main>
      {notice && (
        <div className="tail-toast" role="status">
          {notice}
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {panel && (
        <ToolDialog
          panel={panel}
          setPanel={setPanel}
          workspace={workspace}
          setListMode={setListMode}
          notify={notify}
          openModule={openModule}
          coin={coin}
          selectMint={selectMint}
          chooseWallet={chooseWallet}
          selectedWallet={selectedWallet}
          compareMints={compareMints}
        />
      )}
    </div>
  );
}
export default function TailApp({
  onHome,
  motionStudio = false,
}: { onHome?: () => void; motionStudio?: boolean } = {}) {
  return (
    <PreferencesProvider>
      <TailBrand>
        {motionStudio || location.pathname === "/mascot" ? (
          <MascotDemo />
        ) : (
          <TailDesk onHome={onHome} />
        )}
      </TailBrand>
    </PreferencesProvider>
  );
}
