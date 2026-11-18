# TAIL 2.0 wallet and token intelligence

This module adds read-only Solana mainnet intelligence to the existing terminal. It does not sign, simulate execution as a real trade, request paid AI, or deploy anything.

## Integration

```tsx
import V2Intelligence from './features/v2/intelligence/V2Intelligence';
<V2Intelligence coin={coin} wallet={publicAddress} selectMint={selectMint} selectWallet={selectWallet} />
```

The component supplies Wallets, Activity, Overlap, Portfolio, Security and Token Memory tabs. Registration in the workspace belongs to the lead. Scoped CSS preserves the existing terminal colors, typography and shell. No new runtime dependency is needed.

Reusable exports are available from `index.ts` (import implementation files directly for server/bundle-sensitive consumers):

- `parseWalletTransaction(tx, wallet, signature, signatureTime?)`: exact raw BigInt SPL balance differences, owned account creation/closure aggregation, native SOL net movement, payer fees, transaction programs, failed/unavailable events. It does not classify a balance change as a buy or sell.
- `fetchWalletActivityV2(wallet, before?, force?)`: latest 12 confirmed signatures, two detail requests concurrently; shared 15s snapshot and in-flight deduplication; optional single-wallet pagination.
- `walletOverlap(rows, wallets)`: exact-mint activity observed in more than one selected public wallet, deduplicated by wallet/transaction/asset event.
- `fetchWalletPortfolio(wallet, force?)`: SOL plus parsed SPL Token and Token-2022 accounts, program/owner/mint checks, raw balance strings, aggregated owners, current DEX valuation for at most 12 positions (two at a time), source and balance/price fetch timestamps. Partial and unpriced positions remain explicit.
- `fetchTokenSecurity(coin, force?)`: confirmed parsed mint program/authorities/supply/returned extensions, separately fetched selected pool/metadata, holder sample scope and optional concentration. Creator identity and Developer DNA remain unavailable without proof. Timeline contains provider-reported pool creation and explicitly local fetch events.
- `captureTokenSnapshot(coin, security?, marketFetchedAt?)`, `listTokenSnapshots(mint?)`, `compareTokenSnapshots(a,b)`, `deleteTokenSnapshot(id)`: up to 240 local browser snapshots with independent save, market observed/fetch and holder observed/fetch timestamps. Null means unavailable. They are not blockchain history. Snapshot comparison requires the same exact Solana mint.
- `weightedAverageAccounting(entries, currentPrices?, openingKnown=false)`: weighted-average USD cost basis for explicitly priced execution records. Incoming transfers and missing prices/fees propagate unknown basis; transfers out remove proportional basis without realization; partial sells allocate average cost; overselling known acquired units makes realization unknown. A verified flat boundary resets future position basis. Historical realized unknown results remain unknown. Opening history is incomplete unless explicitly supplied by the caller. Network fees are deduplicated by transaction entry ID and reported separately in SOL; trade fees can be supplied explicitly in USD. USD totals must represent execution consideration, never native balance deltas (which include rent).
- `csvExport(headers, rows)`: quoted CSV and spreadsheet formula protection.

Existing `walletChanges` retains legacy labels/amount conventions and delegates to the exact parser. Legacy watchlist parsing preserves optional color/group/favorite/tracking timestamps without changing old entries. Shared storage remains `part.wallets.v1`; local wallet history uses `tail.v2.wallet-history`; snapshots use `tail.v2.token-memory`.

## Existing Bubble Map

The existing canvas/simulation remains intact. Additions: bounded 10/20 owner count, fullscreen, shift-drag pan, explicit camera/layout save/reset in this browser, sampled-owner address/concentration list, hover address details, source fetch and unknown observation dates. Relationships stay disabled when verified transfer history is unavailable. Dragging a bubble pins its position. No inferred transfer links are generated. Holder RPC resolution now verifies each parsed token-account mint matches the selected mint.

## Evidence and limits

- Wallet activity is a bounded sample, not full execution history. No trade frequency, win rate, cost basis or PnL is inferred from balances.
- Complete cost-basis reconstruction, verified buy/sell decoding, creator DNA, mint creation, migrations, locked liquidity, external social events and transfer relationship indexing are unavailable in this implementation.
- The portfolio UI intentionally shows unknown cost basis/PnL. The accounting library consumes explicit execution inputs; it is not wired to invented transaction prices. A separate, explicitly manual journal may supply caller-labeled inputs during integration.
- SOL deltas include network fees, token-account rent and account closure refunds. Token-account rent reserves are excluded from token valuations.
- Public RPC and indexers may rate limit or reject scans. Prices use current available DEX snapshots; historical execution price is not substituted. A completely unpriced portfolio has unavailable priced subtotal, never an invented zero.
- Source observation dates remain unknown when the provider has no timestamp. Local fetch and save times do not establish source freshness. RPC transaction details may be served from the existing shared cache (up to 60 seconds).
- Holder scope is largest 20 token accounts aggregated by owner, not all token holders. Independent indexed snapshots are attributed to RugCheck, not an official Bubblemaps API. Supply comparisons can span different source snapshots and should not be interpreted as complete distribution.
- Local storage is browser specific and is not account-authenticated cross-device persistence.

## Verification performed

- `npm run typecheck`: passed.
- `npm test`: 165 passed / 4 skipped at handoff baseline, including all existing suites and 16 new intelligence tests. Exact-mint fixture correction includes a negative parsed-mint regression in `src/lib/api.unit.test.ts`.
- `npm run build`: passed.
- `PART_TEST_BASE=http://127.0.0.1:4672 npx playwright test tests/v2-intelligence.spec.ts --output=test-results/v2-intelligence --reporter=line`: 3 passed. This is an isolated, browser-mounted component fixture suite, not proof of workspace registration or production provider availability. It covers watch CRUD/color/group/favorite/reload/history, activity filters, portfolio valuation/CSV, mint authorities, memory save/compare, mobile rendering and the existing Bubble Map controls.
- Separate bounded live probes through Vite: public Solana RPC `getAccountInfo` for USDC returned HTTP 200 and a parsed SPL mint owned by Tokenkeg; DEX Screener exact Solana mint search returned HTTP 200, an exact Solana USDC pair and a price. No full live-wallet history or Token-2022 portfolio probe was performed.

No private keys, new services, production writes or transactions were used. Browser screenshots/traces remain in ignored `test-results/v2-intelligence/` and are not release source artifacts.
