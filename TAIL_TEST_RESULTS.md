# TAIL 2.0 — verification results

Проверки относятся к локальному исходному дереву TAIL 2.0 от 17 ноября 2026. Production не обновлялся. Результаты fixtures, реальные provider reads и ещё не выполненные проверки разделены ниже.

## Baseline and integration

До изменений: typecheck, build и unit suite — **148 passed / 4 live skipped**. Из-за большого незакоммиченного V1 дерева сохранён полный защищённый snapshot, а не только Git HEAD. Native agents сдавали независимые file lists и проверяли свои срезы; главный агент интегрировал их в основной терминал.

| Verification | Result | Scope |
|---|---|---|
| Final `npm run typecheck` | Passed | Основной web/extension source, Vite/API types |
| Final `npm test` | **280 passed / 4 live skipped** | 43 passed files / 1 live-only skipped file; включая event overlay |
| Final `PART_LIVE_TESTS=1 npx vitest run src/lib/live.rpc.test.ts` | **4 passed** | Read-only live contracts, отдельно от fixtures |
| `npm run backend:test` | **25 passed** | Сохранённый Backend V1 и negative-cache recovery |
| `npm run test:mascot` | **15 passed** | Original runtime motion, priorities, clicks, cancellation and cleanup |
| Original full browser attempt | 59 passed / 13 V1 skipped / 12 failed | Выявлены stale source/route assumptions и реальные дефекты; этот запуск не называется успешным |
| Independent QA affected browser suites | **33 passed / 33** | Исправленные сценарии в одном чистом запуске |
| Final isolated standalone CI browser profile | **83 passed / 13 explicit V1 skipped**, 6.2 min | Полный набор 96 cases, включая новые integrated/Studio/intelligence/journal/markers |
| Final isolated backend-v1 CI browser profile | **13 passed / 13**, 58.2 s | Все отдельные V1 API fixtures в правильном режиме |
| Final isolated legacy CI browser profile | **1 passed / 1**, 7.9 s | Полный сценарный generation/regenerate/clear/abort/error path |
| Workspace Studio fixtures | 5 passed | Реальные embedded modules, cap8, contexts, dedup, import/reload, mobile, no-auto-AI |
| Intelligence follow-up fixtures | 5 passed, затем 2 новых случая повторно passed | Raw missing Memory evidence, manual accounting and clear-data |
| Registered Trade Journal fixture | 1 passed | Create/edit/draft/reload/delete через настоящий modal, с ожиданием завершения inert transition |
| Integrated app fixtures | **4 passed** в финальном полном наборе | Единственный bridge/runner, Apply/Cancel, alert history, OR filter edit, transcript/store clear, actual marker plugin mode-switch/unmount |
| Final ChartWorkbench/browser slice | **5 passed / 5** | Включая реальные pointer crosshair events после готовности и scroll into view |
| CI server profiles and preview API contract | Passed | standalone/legacy/backend-v1 isolated readiness; GET200/PUT405/unknown404 |
| GitHub Actions remote execution | Not run | Workflow создан локально, не отправлялся на GitHub |
| Final `npm run ext:zip` and `npm run build` | **Passed** | Version 2.0.0, ZIP создан до website build |
| Installed MV3 Side Panel smoke | **Passed, errors []** | Worker/permissions/selection/session/denied access/theme/watchlist; provider fixtures |
| Installed popup + full desk smoke | **Passed, errors []** | Все 23 linked modules, settings/reload/history/quotes; provider fixtures |
| Installed extension with `TAIL_EXTENSION_LIVE=1` | **Passed, errors []** | Реальные public search/candles/intervals/paging/settings and non-executable quote |
| Final built website review | **Passed, 5 checks, errors []** | Actual public chart/RSI, Studio, journal/alerts/factual tools, reverse transition and downloaded ZIP hash |
| Dependency audit | 4 moderate / 0 high or critical | Existing Solana SDK dependency chain, без auto-upgrade |

В трёх финальных CI-профилях получено **97 успешных browser cases** (83 + 13 + 1). Часть fixture suites дополнительно запускалась отдельно; эти повторения не прибавлены к итогу. GitHub remote CI и production rollout не выполнялись.

Первый полный CI-профиль после интеграции дал 82 passed / 13 skipped / 1 failed: crosshair test двигал pointer к графику вне viewport. Исправлены ожидание готовности второго source chart и `scrollIntoViewIfNeeded`, без подмены pointer events или production data. Повторный полный профиль прошёл. Installed-popup helper также обновлён с прежнего имени кнопки Log на текущий переключатель Linear → Log. Ошибки и старые traces сохранены, не выданы за успешные результаты.

## What the fixtures verify

- Raw null/zero/chain/mint/pool/source-time validation; AND/OR/nesting/sort/import budgets; cache TTL/backoff/hidden-tab/reference cleanup.
- Real decoder layouts in offline bytes; one shared pool channel for multiple subscribers; no invented volume from spot.
- Indicator formula/warm-up/zero/invalid units, original source OHLC range, modes/presets/crosshair/history controls.
- SPL/Token-2022 owner/mint/BigInt deltas, closures/fees, malformed/null balance, unpriced portfolios; replay-safe exact decimal WAC, partial sells/transfers/unknown basis.
- Wallet CRUD/group/color/favorite/history, overlap, security authority evidence, Token Memory same-mint comparison, bubble controls/mobile.
- Journal manual provenance/import/CSV; alert thresholds/source changes/cooldown/edit/pause/history; confirmation before local workspace changes; no signing requests.
- Strict Fable tool args, no-provider mode, mocked genuine SSE frames, context/proposals/usage, bounded requests, no unsafe HTML, no automatic model POSTs.
- Social text/CA/URL validation, no scraping, installed MV3 worker/Side Panel, denied page access, captured text expiry/clear, theme/watchlist reload.

Initial Journal integration fills were attempted while the entry transition kept the terminal `inert`. Those generated no input events. Tests now wait for `.tail-terminal-route:not([inert])`; production form did not require a fake delay or redesign.

## Live evidence boundary

Public Solana `getSlot` passed independently in QA. Existing Backend V1 live integration returned source-bound history; exact outcomes are recorded in local command logs. Agent probes separately obtained exact Solana DexScreener snapshots and confirmed parsed USDC mint data. These reads used public APIs and no transaction signatures/model requests.

Финальный `node scripts/tail-v2-live-check.mjs` проверил UI → actual local proxy → actual public provider → UI/adapter без route fixtures. [JSON evidence](artifacts/v2-live/result.json) и [screenshot](artifacts/v2-live/terminal.png):

| Actual read | Observed result |
|---|---|
| USDC chart | 500 actual source candles; source scope token, volume token |
| USDC 1m / 5m / 15m / 1h / 4h / 1d | По 500 проверенных OHLCV bars на каждом интервале, Candle / Birdeye, independent fetchedAt |
| Exact Solana market snapshot | DexScreener, positive price, correct mint/pool, source event time unknown |
| Shared market channel | 2 subscribers, 0 remaining channels after both unsubscribe |
| Confirmed USDC mint | SPL Token program и присутствующие mint/freeze authority capabilities из RPC |
| USDC holder sample | **Unavailable**, не принят за 0 holders или 0% concentration |
| Jupiter quote | HTTP 200, exact SOL→USDC atomic intent, `executable:false` |
| Local capabilities / AI | Version 2.0.0, execution false; AI configured false / ready false |
| Console / paid AI POSTs | 0 / 0 |

Native extension live evidence: [result JSON](artifacts/v2-extension-live/results.json). Side Panel fixtures: [result JSON](artifacts/v2-extension/results.json). Эти проверки не доказывают 24/7 uptime, полный holder index или live social feed.

No live AI generation was performed: current local server has no AI credentials and persistent production limiter. Streaming/tool-call provider success paths use explicitly mocked provider responses. Complete live wallet execution history, arbitrary holder scans, official social APIs, creator DNA and full Pump.fun lifecycle were not verified or claimed.

## Commands and reproducibility

Use `npm install && npm run dev`; the requested default is `http://localhost:4664/`. If that port belongs to an existing server, use a separate explicit port without stopping the user's process. `PART_TEST_BASE` must match the server/profile being tested.

`node scripts/ci-preview.mjs standalone`, `legacy`, `backend-v1` start isolated fixture-only Vite modes and clean their own servers. CI modes disable `.env` credentials and upstream proxies. `npm run test:live` is separate and intentionally excluded from CI. `PART_LIVE_TESTS` enables live tests only when equal to `1`.

After source freeze run typecheck/unit/mascot/backend tests, `npm run ext:zip` **before** `npm run build`, then the installed-extension scripts. ZIP, website and extension versions must all match 2.0.0. No deployment command is part of these checks.

## Release artifacts

- `public/tail-extension.zip`: 1,727,771 bytes, 56 files, version 2.0.0. SHA-256 `153f6e091a96bb7869f7d393e6e948630d830b662c360e09ecaf886e87591c67`.
- Public ZIP, `dist/tail-extension.zip`, compatible `part-ext.zip` and installed manifest were compared. No `.env`, `.git`, `.codex`, node_modules or source maps inside the ZIP.
- Web build passed. Extension entry chunk is approximately 814 KB minified / 265 KB gzip and emits the existing >500 KB chunk-size warning; this remains a performance limitation, not a claim of an optimized initial bundle.
- 29 actual brand/mascot files (excluding macOS AppleDouble metadata) match their protected pre-V2 archive hashes. Original 2D runtime and character layers were not redesigned.
- [Final feature matrix](TAIL_IMPLEMENTATION_STATUS.md), [backend](TAIL_BACKEND_V2_REPORT.md), [market](TAIL_MARKET_DATA_REPORT.md), [intelligence](TAIL_INTELLIGENCE_REPORT.md), [security](TAIL_SECURITY_REPORT.md), [cost](TAIL_COST_REPORT.md).
- [Built-site walkthrough video](artifacts/v2-review/tail-v2.webm), [built-site evidence JSON](artifacts/v2-review/result.json). Видео записано внутри настоящего терминала на реальных публичных данных, без model POSTs и подписей.
- [Release manifest](artifacts/v2-release/manifest.json) и сохранённые финальные command logs в `artifacts/v2-release/checks/`. Локальный preview оставлен на `http://localhost:4681/terminal`, основной dev — на 4666; вспомогательный сервер проверки 4677 остановлен.
