import { useEffect, useState } from "react";
import { isSolanaAddress, readLocal, saveLocal } from "../../lib/validation";

export const MODULES = [
  { id: 'studio', title: 'Workspace Studio', group: 'Workspace', detail: 'Multiple widget instances, independent or grouped token contexts and saved layouts' },
  { id: 'charts', title: 'Multi-chart', group: 'Terminal', detail: 'Independent Solana charts, local indicators and linked crosshairs' },
  { id: 'compare', title: 'Token Compare', group: 'Discover', detail: 'Compare up to four covered Solana mints with source evidence' },
  { id: 'intelligence2', title: 'Wallet Intelligence', group: 'Intelligence', detail: 'Wallet groups, overlap, portfolio, security and Token Memory' },
  { id: 'journal', title: 'Trade Journal', group: 'Workspace', detail: 'Private browser journal with clearly manual records and CSV export' },
  { id: 'signals', title: 'Alert Rules', group: 'Workspace', detail: 'Foreground conditions over observed prices, volumes, liquidity and wallet activity' },
  { id: 'data', title: 'Source Diagnostics', group: 'Workspace', detail: 'Measured provider latency, cache, errors and live stream state' },
  { id: 'routes', title: 'Trading Routes', group: 'Terminal', detail: 'Buy/sell quotes and transaction status; execution disabled' },
  { id: 'social', title: 'Social Notes', group: 'Intelligence', detail: 'Analyze provided text and save source links without scraping' },
  { id: 'fabletools', title: 'Local Data Tools', group: 'Intelligence', detail: 'Strict factual tools without a paid AI request' },
  { id: 'portfolio', title: 'Portfolio', group: 'Intelligence', detail: 'Observed SOL/SPL holdings, covered valuations and CSV' },
  {
    id: "terminal",
    title: "Terminal",
    group: "Terminal",
    detail: "Search a Solana mint and open its chart",
  },
  {
    id: "astra",
    title: "Fable 5.2",
    group: "Intelligence",
    detail: "Contextual AI chat · server connection required",
  },
  {
    id: "xray",
    title: "Token X-Ray",
    group: "Intelligence",
    detail: "Liquidity, largest-account owners and observed trades",
  },
  {
    id: "watch",
    title: "Wallet Watch",
    group: "Intelligence",
    detail: "Save public Solana wallets and inspect their activity",
  },
  {
    id: "smart",
    title: "Smart Money",
    group: "Intelligence",
    detail: "Observed activity from your watched wallets · no PnL ranking",
  },
  {
    id: "kol",
    title: "KOL Analyzer",
    group: "Intelligence",
    detail: "Analyze pasted public calls with source attribution",
  },
  {
    id: "exit",
    title: "Exit Simulator",
    group: "Intelligence",
    detail: "Hypothetical SPL → SOL Raydium quote",
  },
  {
    id: "markets",
    title: "Markets",
    group: "Discover",
    detail: "Solana DEX markets with filters, sorting and watchlist",
  },
  {
    id: "pulse",
    title: "Pulse",
    group: "Discover",
    detail: "Recently profiled Solana markets",
  },
  {
    id: "trends",
    title: "Trend Radar",
    group: "Discover",
    detail: "On-chain activity and social source availability",
  },
  {
    id: "new",
    title: "New Tokens",
    group: "Discover",
    detail: "Recently observed profiles · pool age where available",
  },
  {
    id: "network",
    title: "Blocks",
    group: "Discover",
    detail: "Confirmed Solana slots and network performance",
  },
  {
    id: "holders",
    title: "Bubble Map",
    group: "Discover",
    detail: "Largest-account owners · no inferred transfer edges",
  },
  {
    id: "flow",
    title: "Flow",
    group: "Discover",
    detail: "Selected pool's observed transactions",
  },
  {
    id: "swap",
    title: "Buy / Swap",
    group: "Terminal",
    detail: "SOL → SPL · explicit wallet review and signature",
  },
  {
    id: "launch",
    title: "Launchpad",
    group: "Create",
    detail: "Prepare a Solana SPL token draft · deployment disabled",
  },
  {
    id: "tweet",
    title: "Tweet to Token",
    group: "Create",
    detail: "Editable concept from pasted text",
  },
  {
    id: "website",
    title: "Website Builder",
    group: "Create",
    detail: "Sandboxed preview and HTML export · no hosting",
  },
  {
    id: "settings",
    title: "Settings",
    group: "Workspace",
    detail: "Data sources, API connection and local layout",
  },
] as const;
export type ModuleId = (typeof MODULES)[number]["id"];
export const isModule = (v: unknown): v is ModuleId =>
  MODULES.some((m) => m.id === v);
export type Workspace = {
  version: 1;
  open: ModuleId[];
  active: ModuleId;
  pinned: ModuleId[];
  maximized: boolean;
  collapsed: boolean;
  theme: "mono";
  selectedMint: string;
  selectedPool: string;
  selectedWallet: string;
};
export const DEFAULT_WORKSPACE: Workspace = {
  version: 1,
  open: ["terminal"],
  active: "terminal",
  pinned: [],
  maximized: false,
  collapsed: false,
  theme: "mono",
  selectedMint: "",
  selectedPool: "",
  selectedWallet: "",
};
export function parseWorkspace(raw: unknown): Workspace {
  if (!raw || typeof raw !== "object" || (raw as Workspace).version !== 1)
    return { ...DEFAULT_WORKSPACE };
  const r = raw as Workspace;
  const open = [
    ...new Set<ModuleId>([
      "terminal",
      ...(Array.isArray(r.open) ? r.open.filter(isModule) : []),
    ]),
  ];
  return {
    ...DEFAULT_WORKSPACE,
    open,
    active:
      isModule(r.active) && open.includes(r.active) ? r.active : "terminal",
    pinned: Array.isArray(r.pinned)
      ? r.pinned
          .filter(isModule)
          .filter((id) => id !== "terminal" && open.includes(id))
          .slice(0, 1)
      : [],
    maximized: r.maximized === true,
    collapsed: r.collapsed === true,
    selectedMint: isSolanaAddress(r.selectedMint) ? r.selectedMint : "",
    selectedPool: isSolanaAddress(r.selectedPool) ? r.selectedPool : "",
    selectedWallet: isSolanaAddress(r.selectedWallet) ? r.selectedWallet : "",
  };
}
export function useWorkspace() {
  const [state, setState] = useState(() =>
    readLocal("part.workspace.v1", parseWorkspace, { ...DEFAULT_WORKSPACE }),
  );
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    setStorageError(!saveLocal("part.workspace.v1", state));
  }, [state]);
  const open = (id: ModuleId) =>
    setState((s) => ({
      ...s,
      active: id,
      open: s.open.includes(id) ? s.open : [...s.open, id],
    }));
  const close = (id: ModuleId) => {
    if (id === "terminal") return;
    setState((s) => ({
      ...s,
      open: s.open.filter((i) => i !== id),
      pinned: s.pinned.filter((i) => i !== id),
      active: s.active === id ? "terminal" : s.active,
      maximized: s.active === id ? false : s.maximized,
    }));
  };
  const pin = (id: ModuleId) =>
    setState((s) => ({
      ...s,
      pinned: s.pinned.includes(id) || id === "terminal" ? [] : [id],
    }));
  return {
    state,
    setState,
    storageError,
    open,
    close,
    pin,
    reset: () => setState({ ...DEFAULT_WORKSPACE }),
  };
}
