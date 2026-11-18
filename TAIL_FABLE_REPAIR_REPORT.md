# Fable 5.2 connection and composer repair

Date: 2026-11-18. Scope: make Fable questions editable and sendable, retain the ChatGPT-backed server integration under the Fable 5.2 product name, verify failures/recovery, and publish the current TAIL source to the requested GitHub repository. No production deployment is included.

## Findings and changes

- The registered terminal disabled its composer whenever a one-time status check was unavailable. The retained legacy chat showed an active Send button but silently returned without sending in the same state. Both now accept questions and explicitly attempt sending.
- Initial, manual and stale-tab connection checks are read-only, abortable and bounded to eight seconds. A stale or late result cannot replace a newer connection state. Status reports configuration; model access and billing are checked on actual requests.
- Failed and cancelled requests preserve the draft without persisting duplicate user turns. Successful requests commit the user/assistant pair. Stop prevents the browser's implicit form resubmission, aborts the active request and ignores late results. IME input and repeated Enter are covered.
- The real OpenAI Responses API remains server-side with `chat-latest` as the default model and Fable 5.2 as the product identity. Existing factual tools, streaming, usage accounting, workspace proposal confirmation and portfolio consent remain intact.
- JSON and SSE failures retain allowlisted configuration, authentication, model-access, budget, throttling and timeout codes. Provider diagnostics are read within a 16 KiB limit; raw diagnostics and credentials are never relayed into public error text. Production still requires persistent request limits.
- Generated `artifacts/` is ignored by Git. The source publication excludes local environment files, private backups, server stores and generated browser traces. The existing project remote is preserved; the requested new repository is a separate destination.

## Actual service configuration

Local standalone `/api/astra/status` reports `configured=false`, `ready=false`, `code=missing_api_key`. A real local send returns HTTP 503 with the same code, zero provider requests and no generated answer. The explicit V1 backend also has no configured API key.

The existing Vercel project `tail-solana-workspace` was inspected read-only: it has no environment variables and no Git repository link. Its production configuration was not changed. The target GitHub repository was empty before publication; a native Git push dry-run confirmed write access.

Real model responses are **not verified or available yet**. The workspace owner must supply an OpenAI API key in the root `.env.local` for ordinary local development, then restart the server. Production additionally needs the persistent limiter variables listed in [setup](docs/SETUP.md). No ChatGPT account session or private Codex credential is reused. A successful test fixture does not prove access to the real model.

## Verification

- TypeScript: passed.
- Vitest: 307 passed, four opt-in live tests skipped.
- Backend Node tests: 25 passed.
- Mascot Node tests: 15 passed.
- Dedicated Fable browser fixtures: seven passed; independent QA regression fixtures: four standalone and two legacy passed.
- Extension ZIP and standalone website builds: passed. Installed Chromium extension smoke: passed with no browser errors; all 23 linked modules rendered and quote-only behavior retained.
- Standalone browser coverage: 102 distinct scenarios passed; 13 explicit V1 scenarios skipped in this profile. The full run passed 101, with one old status-text assertion corrected and passed in a focused rerun. The application source was unchanged by that test correction.
- Explicit V1 browser coverage: 13 distinct scenarios passed. The full run passed 12; the new composer test was synchronized with the opening transition and passed in a focused rerun. Typing before the transition removes `inert` is intentionally prevented by the browser; no runtime workaround was added.
- Source and reachable Git-history credential-pattern scans: no matches. No candidate file exceeds GitHub's 100 MiB limit.

All successful chat/model responses in automated verification were explicit fixtures. No paid model requests, wallet signatures or transactions were sent. Bundle-size/import warnings remain build warnings; they do not prevent either build.

Current extension download: `public/tail-extension.zip`, with the byte-identical legacy alias `public/part-ext.zip`. SHA-256: `c27c63a1f855e7ff29d7ae1315d0a677ebf88f33b0a32984820d72d1bff62da4`. The website build includes the same ZIP.
