# TAIL frontend integration report

Обновление 16 ноября 2026: текущая реализация описана в [TAIL_FRONTEND_FIX_REPORT.md](TAIL_FRONTEND_FIX_REPORT.md) и [TAIL_MASCOT_MOTION_REPORT.md](TAIL_MASCOT_MOTION_REPORT.md). Этот документ сохраняет предыдущую спецификацию/проверку.

This report describes the frontend rebuild before Backend V1. For the subsequent backend integration and current API status, see [TAIL_BACKEND_INTEGRATION_REPORT.md](TAIL_BACKEND_INTEGRATION_REPORT.md).

Implemented on branch `feat/tail-frontend-rebuild`. TAIL is a Solana mainnet workspace. This is a frontend rebuild; server handlers, RPC clients, swap execution and API contracts were preserved.

## Open locally

- `npm install` then `npm run dev`; http://localhost:4664/ opens TAIL directly.
- http://localhost:4664/mascot opens the motion studio with every state and transition sequence.
- `/?mint=<case-preserved Solana mint>` opens a source-backed token chart.
- `/?legacy=1` retains the previous landing/terminal for compatibility. Extension packaging retains its existing compact terminal; website wallet handoffs open TAIL.

## Delivered

The new header, orbital logo, sidebar, Market Pulse, watched-wallet entry, Trending/New Pairs/Gainers, token metrics, chart, buy quote form, Fable 5.2 and additional activity views use the supplied warm dark reference. Tablet and mobile rearrange the chart, trading controls, assistant and discovery panels; mobile has fixed bottom navigation.

The workspace supports drag/drop and keyboard-accessible move controls, pinning, hiding/restoring, maximization, native vertical resizing, column width sliders, five presets and up to twelve named layouts. `tail.workspace.v1` validates and versions local data; malformed layouts recover to Default. Reset is reversible through presets and saved layouts. Layout synchronization is local, not server-based.

The supplied layered SVG is preserved in `src/mascot/assets/tail-mascot.svg`. One SVG tree persists across states. The provided continuous motion engine was extended with wake, interruption priorities, owner-scoped asynchronous activity, instance-specific IDs, reduced motion and offscreen/hidden-tab suspension. No PNG sequence or generated replacement character is used.

Fable 5.2 is a product label over the existing server Responses integration. It displays the served model, stores bounded chat history locally, renders model text as text, supports Stop, quick actions and explicit errors. No automatic paid analysis is triggered.

## API inventory and adapters

`src/services/adapters/tail.ts` is the frontend facade. UI components continue to reuse the existing wallet, chart and intelligence implementations.

| Capability | Existing implementation / contract | New frontend use |
| --- | --- | --- |
| Market discovery and token search | `src/lib/axiom.ts`, `/dex/*` | Pulse, Trending, search, exact-mint deep links |
| Token snapshot | `fetchAxiomLive` | Periodic selected-pool refresh; stale error on failure |
| Source candles | GeckoTerminal `/gecko/*`, validated DexPaprika `/paprika/*` | Existing Lightweight Charts engine; 1m/5m/15m/1h/4h/1d, history, price/MCap estimate, log, crosshair, volume |
| Line chart | Same normalized source candle closes | Separate visible LineSeries; no synthetic points |
| Live spot | Existing verified `poolStream` / `liveCandles` | Provisional current-candle overlay, processed/confirmed, reconnect; never inferred volume |
| Network | `fetchStats`, `fetchBlocks`, `/rpc` and `/rpc-backup` | Sample TPS, slots and read-only block view |
| Pool trades | Existing `fetchTrades` with source fallbacks | On-demand activity table; indicative USD explicitly distinguished from historical execution PnL |
| Wallet | Existing Wallet Standard discovery, connect/disconnect | Header/account and manual transaction review |
| Quotes and transaction status | `quoteSol`, `executeSwap`, Raydium `/ray/*` | Persisted buy inputs; signing and confirmation remain in existing execution logic |
| Assistant | `/api/astra/status`, POST `/api/astra/chat` | Fable connection, bounded history, Stop/Abort, served model disclosure |
| Optional scenario | `/api/astra/scenario` | Existing opt-in, explicitly hypothetical chart layer |
| Intelligence | Existing X-Ray, Wallet Watch, Smart Money, KOL review, Exit Simulator, holder map | Lazy dialogs with shared token and wallet selection |
| Creation | Existing SPL drafts, manual social concepts, sandboxed HTML export | Lazy dialogs; deployment disabled |

No files under `src/server`, `api`, or `src/lib` were changed. Server-side credentials remain server-side. No transaction was signed or submitted, no paid analysis was requested during validation, and no deployment or push was performed.

## Explicitly unavailable / incomplete integrations

- Sell execution: disabled. The existing Exit Simulator can request a read-only sell quote.
- Positions ledger and verified realized/unrealized PnL: unavailable; wallet balances/activity are not labeled profit.
- Background notifications, price alert delivery and Telegram/web push: unavailable. Existing Wallet Watch in-app alerts require its view to remain open.
- Assistant server credentials were not configured by this work. Real chat requires the existing server environment; deterministic browser tests cover success, errors and text safety.
- Intermediate AI tool progress is not exposed by the current JSON backend. Thinking covers the request lifetime; the controller exposes `AI_TOOL_CALL` without pretending it receives a streaming tool event.
- Social scraping, automatic social attribution and deployment are not connected; manual pasted-source analysis and sandbox export remain available.
- Chart drawing tools and technical-indicator editors are not implemented and are not shown as working controls.
- A second simultaneous chart, unconstrained canvas placement, and remote workspace sync are not implemented. The current grid moves one chart among six widget slots and persists local sizing/layouts.
- Public market providers can reject requests. See the test and visual reports for the actual 403 candle-source failure captured during this run.

## Acceptance limits

Visual comparison was performed at the supplied 1672×941 viewport. Main panel geometry is close to the reference, but pixel-perfect identity is not claimed. The logo is composed from the supplied vector mascot, italic typography and orbital SVG because the archive does not include a standalone editable approved wordmark. The supplied vector rig is visibly simpler than the raster mascot in the UI screenshot; its source geometry was retained rather than inventing a different character. The motion studio is available for subjective motion/design review.

See `TAIL_DESIGN_SYSTEM.md`, `TAIL_MASCOT_ANIMATION_SPEC.md`, `TAIL_MASCOT_EVENT_MAPPING.md`, `TAIL_VISUAL_COMPARISON.md`, and `TAIL_FRONTEND_TEST_REPORT.md` for implementation and verification evidence.

## Changed files

The final tracked and new file inventory is in `artifacts/tail/changed-files.txt`. Reference archive contents were extracted to ignored `.reference/tail` for inspection; they are not bundled into the application.
