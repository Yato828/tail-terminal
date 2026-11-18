# TAIL Solana mainnet workspace

TAIL supports **Solana mainnet**. Product UI is English with warm black/orange dark themes, an orange default accent and independent green/red candles. Old navy preferences migrate once to the current palette. The user's current Solana and customization requirements supersede the external master prompt's outdated chain and monochrome constraints.

## TAIL 2.0 local release

The approved terminal, orange star and original 2D mascot remain in place. Pulse → Advanced adds typed AND/OR filters, local signals and saved/imported presets. Multi-chart and Workspace Studio add indicators, independent or grouped token contexts and saved layouts. Wallet Intelligence contains groups/activity/overlap/Portfolio/security/Token Memory; Trade Journal includes an explicitly manual weighted-average accounting view. Alert Rules monitor observed sources in the foreground. Social Notes and the MV3 Side Panel process user-provided text without a global social feed.

Fable has strict factual tools without an AI request, optional real server streaming and confirmed local workspace proposals. Personal portfolio context is off by default. AI needs an owner-configured server key and persistent production limits; public market tools work without those. All transaction execution entry points, including legacy ones, are disabled pending complete DEX validation.

The current source/status/test boundaries are in [TAIL_IMPLEMENTATION_STATUS.md](../TAIL_IMPLEMENTATION_STATUS.md), [TAIL_TEST_RESULTS.md](../TAIL_TEST_RESULTS.md), and the V2 backend/market/intelligence/security/cost reports beside them. Earlier reports describe historical releases. No V2 production deployment is authorized by local build or CI commands.

## Website and ready-to-install extension

The default `npm run dev` starts the standalone site at http://localhost:4664/. `/` is the TAIL presentation and download page; `/terminal` opens the full terminal, and the interactive section starts the same terminal in a same-origin frame on request. Loading the presentation alone does not start market polling. Valid `?mint=` and `?terminal=1` deep links remain supported.

`npm run build` creates `dist/` in standalone mode. `npm run ext:zip` creates **`public/tail-extension.zip`** and `dist-ext/`; build the ZIP before the site so the current download is included. The extension connects to fixed public providers directly; users do not run Node, configure localhost, provide API keys, or create an account for market tools. The shared, validated read-only V1 market/chart/RPC/Jupiter adapters run in the browser. No provider credentials or server store files are packaged.

Watchlists and observed-price alerts use versioned browser-profile storage in standalone mode. They are separate from server-side sessions and do not prove wallet ownership. Alerts evaluate prices while a monitored view is open; no background delivery is claimed. Source-dependent holder/trade coverage and RPC restrictions remain visible. Fable 5.2 still requires a configured AI service; transaction signing, buy/sell execution and autotrading are disabled in this build.

The site's production host must preserve the fixed `/dex`, `/candle`, `/jupiter`, `/gecko`, `/paprika`, `/rpc`, `/rpc-backup` and `/ray` proxies. The checked-in Vercel config includes them and SPA routes. Framing is allowed only from the same origin for the embedded terminal. No production deployment is performed by build commands. See [the release report](../TAIL_EXTENSION_SITE_REPORT.md).

## Optional Backend V1 integration

The supplied backend is versioned under `backend/tail-v1`. Run `npm run backend:start` and `npm run dev:backend` in separate terminals, then open http://localhost:4664/. V1 mode is an explicit local opt-in through `/tail-api`; ordinary `npm run dev` uses standalone browser adapters. `npm run dev:legacy` retains the previous adapter mode for compatibility checks. `npm run backend:test` and `npm run backend:smoke` validate the standalone service. Provider secrets belong in `backend/tail-v1/.env`; Fable 5.2 needs `OPENAI_API_KEY`; `OPENAI_MODEL` defaults to `chat-latest`. No keys are copied into browser configuration.

The current repair and module statuses are in [TAIL_FRONTEND_FIX_REPORT.md](../TAIL_FRONTEND_FIX_REPORT.md) and [TAIL_FUNCTIONAL_AUDIT.md](../TAIL_FUNCTIONAL_AUDIT.md). Motion rig v4 and all manual transitions are available at `/mascot`; [TAIL_MASCOT_MOTION_REPORT.md](../TAIL_MASCOT_MOTION_REPORT.md) describes the runtime and event bindings.

Charts initially show an age-based overview: markets younger than six hours use 1m candles; older markets use progressively wider intervals. **All** loads available older history in batches of up to eight pages; **Latest** returns to the recent trading window without dropping loaded bars. **Older history** continues paging. Coverage can begin after token launch, and empty source windows are preserved.

For an explicit Solana mint, V1 first uses the documented public [Candle price-history API](https://docs.candle.tv/developers/market-state/). This is token-wide USD OHLC, labelled `Candle / Birdeye` or `Candle`, rather than selected-pool history. Its volume denomination is preserved: token units are never labelled USD. Selected-pool WebSocket spot remains separate from token-wide candles. Live candle refresh is indexed polling, not a push feed. When unavailable, existing GeckoTerminal pool candles and validated DexPaprika hourly history remain fallbacks; the latter still has a visible last-24h limit. Sources and volume units are never merged.

New-pool discovery retains its separate DexPaprika fallback with an explicit newest-hour delay. When a selected pool lacks fallback coverage, a bounded check of up to three other markets for the exact same mint may switch the selected market; the actual pool is shown and persisted in the URL. Indexed trades still require an available trade source. See [the chart repair report](../TAIL_CHART_HISTORY_FIX_REPORT.md) and [functional audit](../TAIL_FUNCTIONAL_AUDIT.md) for real results and remaining limitations.

V1 deliberately disables buy/sell execution, signing and autotrading. Existing verified pool WebSocket decoders are retained; its SSE snapshots are labeled polling. See [the integration report](../TAIL_BACKEND_INTEGRATION_REPORT.md) for connected endpoints, actual upstream availability, anonymous session behavior and missing functionality, and [the test report](../TAIL_BACKEND_TEST_REPORT.md) for evidence. No production switch is performed by these local commands.

## Local development

Use Node 22.15+ (the extension ZIP script uses `node:zlib.crc32`; validation used Node 26.8.1).

```sh
npm install
npm run dev
```

Open http://localhost:4664/ for the TAIL presentation, download and interactive workspace; `/terminal` opens the full terminal. The mascot motion studio is at `/mascot`; the previous PART landing and terminal remain at `/?legacy=1` for compatibility. See `TAIL_FRONTEND_REPORT.md` for the new layout, branding, adapters and verification limits. Vite serves `/api/astra/chat`, `/api/astra/scenario`, `/api/astra/status` and `/api/health` using the same handler as the Vercel routes; a separate backend process is unnecessary. Restart dev after changing server environment variables. An existing `.env.local` should be edited, not overwritten with the example.

Fable 5.2 uses the OpenAI Responses API with `OPENAI_MODEL=chat-latest` by default, the [official alias for the Instant model used in ChatGPT](https://developers.openai.com/api/docs/models/chat-latest). The product name is always **Fable 5.2**, independent of the served model ID. `ASTRA_MODEL` remains an explicit legacy override; model access is checked by real provider calls. An OpenAI API key is still required on the server; no ChatGPT account session is attached. Provider/model diagnostics remain separate from the assistant name.

For optional AI, create or edit `.env.local` using `.env.example` as a reference, preserving existing values; server credentials must never use a `VITE_` prefix. Set `OPENAI_API_KEY` to the owner's API key and restart the dev server. The browser and extension never receive that key. The default website API reads the root `.env.local`; `backend/tail-v1/.env` is used only by the explicit V1 backend process.

The Fable composer stays editable while the connection is being checked or unavailable. **Send** always makes an explicit attempt; an unavailable service shows a safe error and retains the draft. Failed and cancelled attempts do not duplicate saved conversation history. **Retry connection** checks status without a model request, and returning to the tab refreshes stale status. Status means the service is configured, not that model access or billing has been verified. Authentication, model access, budget, rate-limit and timeout failures remain distinguishable without exposing provider diagnostics.

Market tools, factual Fable tools, journal and workspace remain usable without AI credentials. Chat retains the JSON contract with Stop/Abort and a 45-second deadline; explicit streaming uses actual provider SSE deltas, not a typing animation. Cost estimates require owner-configured rates matching the returned model; otherwise cost is unknown.

## Previous homepage (legacy compatibility route)

The homepage uses the supplied halftone eye and hands under `public/hero/signal/`. It introduces the Solana mainnet workspace, Fable 5.2 and the existing extension archive. The workspace illustration is a labeled interactive preview; it makes no market or AI requests. Enter Terminal opens the existing lazy-loaded terminal. House returns to the homepage. Both transitions display the supplied particle-sphere GIF with a fade, and entry waits for the terminal to finish rendering. Reduced motion uses a still frame and skips the decorative delay. The website favicon and extension icons use the halftone eye.

The background uses the user's supplied particle-wave GIF, preserved under `assets/background/particle-wave.gif`. Local MP4/WebM versions retain its original motion and timing, cover the homepage and pause in hidden tabs or while the terminal is open. A matching still appears for reduced motion, unavailable media or blocked autoplay. The background loads no external runtime and has no watermark. A dark overlay preserves text contrast.

The "Human instinct. Machine perspective." section uses the supplied rotating number-sphere GIF in place of its decorative asterisk. Its source is preserved under `assets/connection-orb/source.gif`; local video versions retain the original 6.6-second loop and pause offscreen. Reduced motion uses a matching still.

The large eye uses the four supplied pose images under `assets/eye-blink/`. `scripts/build-eye-loop.py` encodes a 30 fps loop with motion interpolation: eight seconds open, then a two-second close/reopen sequence. Its matching first/last poses keep the ten-second loop seamless. WebM and MP4 versions plus a still fallback live under `public/hero/signal/`; no video processing dependency ships to the browser or server. The media pauses offscreen and in hidden tabs. Reduced motion, unavailable codecs or blocked autoplay retain the open-eye still. To regenerate, install Pillow and FFmpeg with minterpolate/libvpx-vp9/libx264, then run `python3 scripts/build-eye-loop.py --ffmpeg /path/to/ffmpeg`.

The background, ambient particles, eye, scroll reveals and hands parallax respect the system's reduced-motion setting. The native documentation/extension dialogs trap focus, close on Escape and restore focus to their opener. The server, market sources, wallet and swap behavior are unchanged by the homepage redesign.

## Interface preferences and live charts

Open **Settings** in the header or module launcher. The website and extension start with the warm Black theme and TAIL orange accent; compatible saved preferences are retained. Appearance offers Midnight, Graphite and Black themes, warm accents, spacing, text size, navigation labels, artwork and reduced motion. Chart settings include independent rising/falling colors, volume, grid, crosshair and hollow candles. Preferences apply immediately and persist in `part.preferences.v1`.

Indexed historical candles/volume reconcile every **5 seconds** by default (5/10/15/30 seconds). Independently, **WebSocket pool prices** streams on-chain spot changes for Orca Whirlpools, Raydium CLMM and Meteora DLMM. Updates are batched into browser animation frames, preserving all observed high/low extremes. The current bar is explicitly provisional pool spot, not executed-trade OHLC; its time is browser receipt time. Processed state may roll back; confirmed mode waits for network confirmation. USDC is treated as approximately USD, and SOL-quoted tokens need a fresh streamed SOL/USDC reference. No volume or missing historical candles are fabricated. Other pool layouts retain explicit source-only mode.

The chart shows receipt age in milliseconds, slot, commitment and node hostname. Receipt age is not end-to-end network latency. Public nodes may delay/drop updates or restrict methods; one-millisecond delivery and first trade priority are not promised. **Settings → Connections → Dedicated Solana WebSocket** accepts an optional mainnet `wss://` endpoint. It is stored locally and visible to the browser user: use a provider credential scoped for browser use, never a server OpenAI secret. Empty selects public nodes with bounded reconnect/failover.

Pause stops both channels; manual Refresh still reads the historical source. Hidden charts disconnect and reconnect when visible. Provider failures preserve explicit stale states. Follow-latest preserves manual history navigation; Latest returns to the recent window and Fit shows loaded history. RPC and indexed holder fallbacks are shared by X-Ray/Bubble Map. RugCheck does not supply a holder balance timestamp; the UI distinguishes that from report fetch time.

To enable the optional drawing, choose **Settings → Features & Fable 5.2 → Enable Fable 5.2 chart scenarios**, then open a selected token chart and press **Generate scenario**. Enabling the switch alone makes no paid request. The server verifies the exact Solana pool and fetches recent source candles itself; client-supplied prices/prompts are ignored. Fable 5.2 returns 6 or 12 hypothetical future points as a separate dashed line, with source/time/model and assumptions. This unvalidated illustration has no established predictive accuracy. It never replaces actual candles or signs transactions. Stop, Clear and Regenerate are available; switching token/timeframe cancels and clears it. It uses the same server key, request limits and production limiter as chat.

Restore defaults resets interface/chart/feature preferences. Reset layout closes panels but retains preferences. Clear local module data removes module drafts, chat threads and watchlists. It does not remove preferences.

Connection endpoints are retained by Restore defaults. Extension Fable 5.2 can use **Settings → Connections → Fable 5.2 backend → Local development** at `http://localhost:4664`, or the hosted API. Local mode requires the dev server and an exact `chrome-extension://<installed-id>` entry in `.env.local`'s `ASTRA_ALLOWED_ORIGINS`. This session registered the unpacked build's local origin without changing existing credentials. A different installed ID must be registered separately. Local API preflight is handled by the same exact-origin API handler; Vite's default CORS middleware is disabled so it cannot intercept that preflight. Production origin checks remain unchanged. No OpenAI key is copied into the extension.

## Deployment on Vercel

Link/import this existing repository in Vercel with framework **Vite**, build command `npm run build`, output `dist`. Keep the `api/` directory: its edge functions are deployed separately from the static bundle. Existing DEX/RPC/Raydium rewrites do not match `/api/**`.

Configure these **server environment variables** for each deployed environment:

- `OPENAI_API_KEY` from the owner's billed OpenAI project.
- `OPENAI_MODEL=chat-latest` (default; or an explicitly chosen accessible GPT model).
- `ASTRA_MAX_OUTPUT_TOKENS=1200`, `ASTRA_REQUESTS_PER_MINUTE=10`, `ASTRA_DAILY_REQUEST_LIMIT=100`.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from an Upstash Redis instance. Production fails closed without persistent limits. Atomic Redis counters enforce per-IP, per-session and global daily request budgets across instances. Local development uses bounded in-memory counters.
- `ASTRA_ALLOWED_ORIGINS`: exact permitted origins separated by commas. Include the actual deployed site; for extension chat include its exact `chrome-extension://<installed-id>`. Unlisted extension origins are rejected. A request's own origin is always permitted.

The daily request cap and bounded input/output/tool rounds limit usage; they are not a USD-denominated billing guarantee. Configure and monitor the OpenAI project's billing controls independently. A ChatGPT subscription does not provide this server key or API billing.

The standalone release is published at **https://tail-solana-workspace.vercel.app/** in the owner's free Hobby project `tail-solana-workspace`. It was built from an allowlisted source copy without local environment files or server credentials, then promoted after local checks. See `TAIL_PRODUCTION_RELEASE_REPORT.md` for the exact deployment and live verification. Production Fable is currently unconfigured; health reports configuration, not provider availability. No paid AI calls, wallet signatures or transactions were made during verification.

For later releases, build the extension ZIP before the web build. Use `vercel deploy --prod --skip-domain` for a staged production build and `vercel promote <deployment-url>` for the tested build, explicitly selecting the correct owner/project. Keep temporary deployment protection enabled; test the public production alias without bypass headers. Future publication still requires an explicit user request.

## Extension

```sh
npm run ext:dev     # compact preview at http://localhost:4666/
npm run ext:zip     # dist-ext/ and public/tail-extension.zip
npm run test:extension
```

TAIL **2.0.0** uses Manifest V3 with the approved TAIL mascot and local icons. The popup retains the existing terminal; a native Side Panel adds quick search, compact source candles, watchlist, public wallet activity and explicit selected-text/CA analysis. **Open full terminal** opens an extension tab with the exact selected mint; settings and browser-owned watchlists are shared across extension views. Closing the popup does not close the full tab. Context menu / activeTab reads require an explicit user action, with no automatic content scripts or blanket page permissions. Public wallet inspection takes an address; it does not request signing.

To install the ZIP, extract it, open `chrome://extensions` (or your Chromium browser's Extensions page), enable Developer mode, choose **Load unpacked** and select the folder containing `manifest.json`. Keep that folder, then pin TAIL to the toolbar. These steps follow [Chrome's official installation instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked). This is a direct ZIP release; no Chrome Web Store listing was created. `public/part-ext.zip` remains a compatible alias for older download links.

`TAIL_EXTENSION_LIVE=1 TAIL_EXTENSION_OUT=artifacts/extension-live node scripts/extension-terminal-smoke.mjs` checks the installed package with real public data. The default deterministic run verifies the packaged extension origin, CSP, popup and full tab, source units, settings, watchlists and quote-only policy. Both assert that no HTTP request goes to localhost. No AI calls, signatures or real transactions are sent.

## Validation

With the dev server running:

```sh
npm run typecheck
npm test
npm run test:live
npm run test:browser
npm run build
npm run ext:zip
npm run test:extension
```

Browser tests use Playwright with installed Google Chrome locally. In CI run `npx playwright install --with-deps chromium`; set `CI=1` to use Playwright Chromium. `PART_TEST_BASE` overrides the browser base URL. Live tests depend on public APIs and may fail when providers rate limit.

The extension integration check installs the built extension in Playwright Chromium, then checks native charts, controls, all workspace modules, persistence, compact layout and wallet/desk handoffs against deterministic provider fixtures. It does not bill AI or sign transactions. The latest release results are in `docs/FINAL_VALIDATION.md`.

`npm run test:smoke` performs an unmocked browser walkthrough and writes screenshots/report under `/tmp/part-browser-review`. `node scripts/creation-smoke.mjs` exercises live creative generation. These live walkthroughs use the configured billed OpenAI key; they never send wallet transactions. The deterministic browser suite uses clearly identified API fixtures and does not bill OpenAI.

## Capability boundaries

- DEX search/discovery, source candles, block stats, observed trades, sampled holders and wallet activity use real public Solana sources. Errors and stale snapshots remain visible. Never replace missing historical candles with current-price-anchored estimates.
- Token X-Ray covers largest token-account owners, not full supply distribution or inferred transfer clusters. Smart Money labels net balance changes; it does not reconstruct audited PnL or identify every swap.
- Exit Simulator requests a read-only Raydium SPL→SOL quote. Buy/Swap preserves explicit wallet review, quote validation, simulation and confirmation handling.
- Launchpad is an SPL **draft/review/export** flow. No deployment adapter, rent estimate, transaction or live mint creation is claimed. Deploy stays disabled until a verified metadata/deployment/wallet flow is implemented.
- X ingestion, social history, KOL performance, Telegram/web push, AI image generation and website hosting are not connected. Pasted public text can be analyzed through Fable 5.2. Template previews are text layouts, not generated bitmap artwork.
- Website AI generates editable project copy into a trusted template. Preview/export rebuild HTML from an allowlist; scripts, arbitrary CSS, embeds, forms and external resource loads are removed. The iframe is sandboxed without script/origin privileges.
- Local storage is versioned and bounded: one pinned secondary panel, 20 wallets, 100 market-watch mints, 10 chat threads and 24 messages per thread. Chat context/history sent upstream is bounded. Browsers with blocked storage show an explicit persistence error.
- Labs trading games, autonomous trading and additional chains are absent.

Responses/tool integration follows the [official OpenAI function-calling guide](https://developers.openai.com/api/docs/guides/function-calling) and [Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create). The chart uses the [Lightweight Charts API](https://tradingview.github.io/lightweight-charts/docs/api/interfaces/IChartApi).
