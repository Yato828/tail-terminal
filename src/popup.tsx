import { createRoot } from "react-dom/client";
import TailApp from "./features/tail/TailApp";
import { lazy, Suspense } from 'react';
import { SidePanelLauncher } from './features/v2/extension/SidePanelLauncher';
import { isSolanaAddress } from './lib/validation';
import "./index.css";
import "./features/tail/extension.css";

const view = new URLSearchParams(window.location.search).get("view");
const SidePanel = lazy(() => import('./features/v2/extension/SidePanel'));
const wide = view === "desk" || view === "mascot";
const sidepanel = view === 'sidepanel';
document.documentElement.classList.toggle("ext", !wide && !sidepanel);
document.body.classList.toggle("ext", !wide && !sidepanel);
document.documentElement.classList.toggle('sidepanel', sidepanel);
document.documentElement.classList.toggle("extension-desk", wide);
if (wide || sidepanel)
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute("content", "width=device-width, initial-scale=1");
// Mirror token choices made by the retained terminal into companion context.
// This only observes this extension's own URL; no webpage content is read.
if (!sidepanel) {
  const current = new URL(location.href);
  if (!current.searchParams.has('mint')) {
    try { const saved = JSON.parse(localStorage.getItem('tail.extension.selected.v2') || 'null'); if (isSolanaAddress(saved)) { current.searchParams.set('mint', saved); history.replaceState(null, '', current); } } catch {}
  }
  const replace = history.replaceState.bind(history);
  history.replaceState = (state, unused, url) => {
    replace(state, unused, url);
    const mint = new URL(location.href).searchParams.get('mint');
    if (isSolanaAddress(mint)) { try { localStorage.setItem('tail.extension.selected.v2', JSON.stringify(mint)); } catch {} }
  };
}
createRoot(document.getElementById("root")!).render(sidepanel ? <Suspense fallback={<p>Loading TAIL companion…</p>}><SidePanel /></Suspense> : <><TailApp motionStudio={view === "mascot"} /><SidePanelLauncher /></>);
