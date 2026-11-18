# TAIL — session context

TAIL 2.0 is a Solana mainnet workspace. The current source includes the standalone site, supplied interactive chair mascot, browser extension and optional server-side Fable 5.2 assistant. The user requested committing and pushing the current source to `Yato828/tail-terminal`; this does not authorize a production deployment.

User reaffirmed: all product copy, documentation, assistant prompts and future modules must use Solana mainnet. Robinhood Chain (4663), EVM/ERC-20 and stock requirements in `PART_CODEX_MASTER_PROMPT.md` are outdated and superseded by this instruction.

Local: `npm run dev`, http://localhost:4664/.
The current warm black/orange landing uses the supplied chair runtime and original PNG layers, with separate 2D terminal mascot reactions. Keep the approved terminal, branded stars, entry/exit transitions and backend behavior. The previous halftone eye/hands and particle-sphere presentation remains on the legacy compatibility route. WebAudio remains intact. Secondary tools open as lazy workspace tabs.
Keep landing copy minimal: the user removed decorative numbered captions, repeated micro-slogans and labels around the artwork.
Search: DEX Screener, strictly Solana. Mint and pool strings remain case-sensitive.
Candles: Lightweight Charts, GeckoTerminal USD OHLCV for the selected mint; validated DexPaprika fallback. No synthetic ticks. Price/MCap (current-supply estimate), volume, log, history, crosshair, pan/zoom, latest and expanded mode.
Wallets: public Solana inspection and read-only quotes. Wallet signing, transaction execution and autotrading are disabled in this version, including legacy entry points. Never imply that a quote executes a trade.
Holders: largest token-account owners through RPC, not full supply distribution; transfer edges unavailable without an indexer.
Workspace: Ctrl/Cmd+K launcher, open/close/pin/maximize/reorder tabs, local versioned persistence. Markets, Pulse, New Tokens, Trends, Blocks, Bubble Map and Flow remain discoverable.
Fable 5.2: server-side OpenAI Responses API, default `OPENAI_MODEL=chat-latest`, bounded local threads and read-only Solana tools. Internal `astra` paths remain compatible. Both composers accept drafts without a ready status, preserve failed/cancelled drafts and support read-only connection retries. No automatic model call on token changes. Production fails closed without persistent rate limits. At the 2026-11-18 repair check, neither local server nor the existing TAIL Vercel project had an API key; actual model answers remain unverified until the owner supplies one. See `TAIL_FABLE_REPAIR_REPORT.md`. Local heuristics are labeled separately.
Creation: shared local SPL draft, manual or real Astra concept generation, isolated website preview/export. Live deployment, social ingestion, push/Telegram and hosting are not connected.
Setup and capability boundaries: `docs/SETUP.md`. Validation and live browser findings: `docs/IMPLEMENTATION_REPORT.md`.
Public API failures remain visible. No paid model calls, wallet signatures, live swaps or new production deployment were performed during Fable repair verification.
Do not publish personal remotes, author names or handles in the UI.

Latest user update: customizable dark interface, readable navigation, green/red candles (user-selectable), source-backed automatic candle updates without page reload, optional explicitly hypothetical Astra path overlays. These supersede the monochrome-only styling constraint.

Latest realtime update: current candles can include an explicitly provisional observed pool-spot overlay from Solana account PubSub, independently of the 5–30s indexed OHLCV refresh. Supported state decoders: Orca Whirlpools, Raydium CLMM, Meteora DLMM. USDC≈USD assumption is labeled; SOL quotes use a fresh streamed SOL/USDC reference. Other pools stay source-only. No fabricated volume, executed trade price or guaranteed millisecond delivery/trade priority. Fast processed state may roll back. Settings offers confirmed mode and a browser-visible dedicated WSS endpoint. Pause/hidden views disconnect; reconnect clears provisional state.
X-Ray and Bubble Map share RPC/RugCheck holder fallback. Index balance time is unknown, fetch time is separate, mint and owners are validated. Unavailable providers remain explicit; retries retain existing evidence. Extension 2.0.0 includes WSS, `popup.html?view=desk`, shared local preferences and an explicit-user-action MV3 Side Panel. Current setup and limitations: `docs/SETUP.md`; earlier realtime evidence: `docs/REALTIME_REPORT.md`.
