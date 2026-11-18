# TAIL design system

TAIL is a Solana mainnet trading workspace. The approved first-screen image from `TAIL_ANIMATIONS-1.zip` is the visual reference.

## Tokens

`src/design-system/tokens/tail.css` centralizes the palette, semantic foundation colors, spacing scale and base geometry. `src/features/tail/tail.css` applies responsive layout and component rules.

| Token | Default |
| --- | --- |
| Canvas | `#141112` |
| Secondary | `#1b1718` |
| Card | `#211c1d` |
| Hover | `#2c2526` |
| Border | `#3b3232` |
| Subtle border | `#302929` |
| Primary text | `#f5f1ed` |
| Secondary text | `#aaa1a0` |
| Muted | `#777071` |
| Accent | `#ff812e` |
| Card/control radius | 15px / 9px |
| Main header/sidebar | 82px / 170px |
| Default market/trading columns | 256px / 360px |
| Core spacing | 4, 8, 12, 16, 24px |

Existing preferences remain compatible with `part.preferences.v1`. Warm black is the TAIL default presentation; Graphite and Midnight remain dark alternatives. Accents and candle up/down colors are independent. The old white default accent is presented as TAIL orange until the user selects an accent. Existing default candles remain green/red; no financial direction is inferred from interface accent.

Typography uses the existing Instrument Sans asset with system fallback. Numbers use tabular figures; chart OHLC uses a monospace stack. Controls have visible focus outlines. Professional inline SVG icons replace emoji. The logo uses the supplied mascot and a single drawn orbit; its star traverses that path once. Hover motion is short and does not loop indefinitely.

Solana is text `SOL` in the header. Token logos use the existing centralized TokenIcon/validated source pipeline; missing artwork falls back to token initials. No hand-drawn imitation Solana mark was introduced. The website favicon is the supplied vector mascot at `public/tail-mark.svg`.

## Components

- `TailHeader`: logo, global search/history, SOL snapshot, RPC status, wallet, notifications/account.
- `TerminalWidgets`: Pulse, Smart Money entry, token list, token header/chart, buy controls, Fable.
- `Widget` + `workspace`: editable slots, dimensions, pin/hide/maximize and persistent layouts.
- `ToolDialog`: keyboard containment, focus return, shared intelligence/creation/activity views.
- `TailPreferences`: dark themes, accents, candle colors, source refresh/stream options and truthful Fable connection state.
- `src/design-system/brand.tsx`: TAIL/Fable presentation context. Existing server endpoint names are intentionally unchanged; the retained compatibility terminal keeps its own branding context.

## Responsive behavior

Desktop uses sidebar + market/chart/trading columns. Below 1250px the sidebar becomes an icon rail. At tablet widths the market cards form an upper row and chart/trading form two columns. At 760px and below the chart comes first, trade/AI follow, market panels remain separate, and navigation moves to the bottom. Modals fit the viewport and scroll internally. These widths were exercised by browser tests, including 1672, 1024, 768 and 390px.

## States

Source failure, stale snapshots, missing wallet, no selected token, unavailable source candles, pending AI, failed AI, disabled sell and unsupported functions have explicit UI states. No candle chart is created until a token is selected. A live label remains controlled by the existing verified chart feed status, never by an HTTP bootstrap alone.
