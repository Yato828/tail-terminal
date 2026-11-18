# TAIL frontend test report

Обновление 16 ноября 2026: текущая реализация описана в [TAIL_FRONTEND_FIX_REPORT.md](TAIL_FRONTEND_FIX_REPORT.md) и [TAIL_MASCOT_MOTION_REPORT.md](TAIL_MASCOT_MOTION_REPORT.md). Этот документ сохраняет предыдущую спецификацию/проверку.

Validation date: 2026-11-15, Europe/Minsk. Final source is on `feat/tail-frontend-rebuild`.

## Commands and evidence

- `npm install`: completed. No dependency or server API changes were required for the rebuild.
- `npm run dev`: Vite started at http://localhost:4664/.
- `npm run typecheck`: passed after implementation fixes.
- `npm test`: 114 passed, 4 live tests skipped; 22 test files passed and one live file skipped. Includes new layout validation and mascot arbitration regression tests.
- `npm run build`: passed.
- `npm run ext:zip`: passed; rebuilt `public/part-ext.zip` using the preserved extension frontend.
- `npm run test:browser`: final full run **32 passed (2.7m)**, including all six TAIL scenarios and all 26 compatibility/extension scenarios.
- Live source tests: 117 passed / 1 failed in `npm run test:live` after network access was enabled. Mainnet slot, observed trades and longer candle intervals passed. The short-candle test failed with `No market information for this period yet.` The real browser capture separately records provider HTTP 403 responses. Live integration is therefore not reported as fully green.

## Browser coverage

The new TAIL suite has six scenarios: search → chart → quote → safe Fable response → saved workspace; explicit source failure/empty chart; every mascot state and reduced motion; responsive no-overflow layouts; exact-mint deep link, source Line/Candles mode, activity table, move/pin/resize/theme persistence; persistent SVG identity with hidden-tab pause/resume.

The previous 26 browser scenarios continue to exercise the retained `?legacy=1` terminal and extension: chart intervals, history, live pool push, scenarios, holder fallback, settings, wallet watch, discovery, creation/export, safe AI history, missing-key errors, cancellation, landing transitions and responsive layouts. Their entry URLs were updated to the explicit compatibility route, rather than dropping assertions about existing behavior. New TAIL behavior has its own assertions and is not inferred from legacy tests.

## Defects found and fixed during validation

1. Sleep was blocked by idle priority; idle now explicitly permits sleep.
2. A Fable message literal widened its role type; corrected the typed message boundary.
3. The legacy homepage eagerly loaded new-terminal data modules; separate lazy application branches restored deferred loading.
4. React reconciliation discarded the SVG's namespaced/animated DOM during state changes; the trusted source is now inserted once into an engine-owned subtree. A regression test proves stable SVG identity.
5. Supplied rig part IDs collided across instances; IDs are namespaced and parts use stable semantic data attributes.
6. Inherited swap spacing, grid intrinsic-height expansion and chart overlay stacking caused visual mismatches; scoped TAIL rules corrected them.
7. The new activity-table assertion initially had no valid trade fixture. A deterministic GeckoTerminal trade response was added to that test; the source adapter and production data remain unchanged.

## Boundaries not exercised as real external actions

No wallet signatures, mainnet transactions, production deployment, remote layout synchronization, paid AI generation, or background notifications were performed. Fable success/error behavior is validated with deterministic API responses; actual responses require the existing server credentials. No claim is made about upstream availability or universal device frame rate.

Screenshots and geometry are in `artifacts/tail`; the integration inventory and unavailable functions are in `TAIL_FRONTEND_REPORT.md`.
