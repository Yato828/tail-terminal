# TAIL

Solana mainnet workspace with source charts, market discovery, public wallet intelligence, an interactive mascot and a Manifest V3 browser extension.

```sh
npm install
npm run dev
```

Open http://localhost:4664/. The homepage and terminal share the same application. Market tools work without an account; upstream coverage and rate limits remain visible.

## Fable 5.2

Fable 5.2 is the assistant's product identity. It uses the server-side OpenAI Responses API; `OPENAI_MODEL` defaults to `chat-latest`. Add the owner's `OPENAI_API_KEY` to a root `.env.local`, using `.env.example` as a reference, then restart the dev server. Keep credentials on the server and out of all `VITE_` variables. A ChatGPT subscription does not supply API credentials or API billing.

The composer accepts questions even if configuration is incomplete. Failed requests keep the draft; **Retry connection** checks status without generating a response. Real answers require an accessible model and API budget. Production also requires the persistent request limiter documented in [setup](docs/SETUP.md). No model answers are simulated when configuration is missing.

## Checks and packaging

```sh
npm run typecheck
npm test
npm run backend:test
npm run test:mascot
npm run test:browser
npm run ext:zip
npm run build
```

Browser checks need the dev server and Playwright Chromium or installed Chrome. They use explicit API fixtures; live-source checks are separate. Build the extension ZIP before the website so the download is current. Install `public/tail-extension.zip` by extracting it and selecting **Load unpacked** in your Chromium browser's extension manager.

Wallet signing, transaction execution and autotrading are disabled in this version. Workspace proposals require user confirmation. Builds and CI do not deploy to production.

See [setup and capability boundaries](docs/SETUP.md), [implementation status](TAIL_IMPLEMENTATION_STATUS.md), and [Fable repair verification](TAIL_FABLE_REPAIR_REPORT.md).
