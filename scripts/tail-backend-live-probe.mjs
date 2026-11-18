import { writeFile, mkdir } from "node:fs/promises";
const base = process.env.TAIL_API_URL || "http://127.0.0.1:8787";
const mint = "So11111111111111111111111111111111111111112",
  usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  pool = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE";
const endpoints = [
  "/api/health",
  "/api/trade/capabilities",
  "/api/fable/status",
  "/api/market/search?q=SOL&limit=2",
  `/api/market/token/${mint}`,
  "/api/market/profiles?limit=2",
  "/api/market/trending?limit=2",
  "/api/market/new-pools?limit=2",
  "/api/market/filter?q=SOL&minLiquidity=1000&limit=2",
  `/api/market/pool/${pool}/ohlcv?interval=1h&limit=500&token=${mint}`,
  `/api/market/pool/${pool}/ohlcv?interval=4h&limit=500&token=${mint}`,
  `/api/market/pool/${pool}/ohlcv?interval=1d&limit=500&token=${mint}`,
  `/api/market/pool/${pool}/ohlcv?interval=5m&limit=5&token=${mint}`,
  `/api/market/pool/${pool}/trades?limit=2`,
  `/api/wallet/${mint}`,
  `/api/wallet/${mint}/activity?limit=2`,
  `/api/trade/quote?inputMint=${mint}&outputMint=${usdc}&amount=10000000`,
  "/api/watchlist",
  "/api/alerts",
  "/api/alerts/events",
];
const results = [];
let observedSignature;
async function probe(endpoint) {
  const start = Date.now();
  try {
    const res = await fetch(base + endpoint, {
        signal: AbortSignal.timeout(30000),
      }),
      data = await res.json();
    if (endpoint.includes("/activity") && Array.isArray(data.signatures))
      observedSignature = data.signatures[0]?.signature;
    const row = {
      endpoint,
      status: res.status,
      elapsedMs: Date.now() - start,
      source: data.source ?? null,
      asOf: data.asOf ?? null,
      items: Array.isArray(data.items) ? data.items.length : undefined,
      candles: data.candles?.length,
      configured: data.configured,
      execution: data.tradeExecution ?? data.executable,
      code: data.error?.code,
      error: data.error?.message,
    };
    results.push(row);
    console.log(JSON.stringify(row));
    return data;
  } catch (e) {
    const row = { endpoint, error: e.message, elapsedMs: Date.now() - start };
    results.push(row);
    console.log(JSON.stringify(row));
  }
}
for (let i = 0; i < endpoints.length; i += 2)
  await Promise.all(endpoints.slice(i, i + 2).map(probe));
if (
  observedSignature &&
  /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(observedSignature)
)
  await probe("/api/transaction/" + observedSignature);
// No key, identity, paid AI request, session mutation or transaction submission is performed.
const ctrl = new AbortController();
const timeout = setTimeout(() => ctrl.abort(), 15000);
try {
  const res = await fetch(`${base}/api/market/stream/${mint}`, {
    signal: ctrl.signal,
  });
  const reader = res.body.getReader();
  let body = "";
  while (!/event: (?:snapshot|error)\r?\ndata: [^\n]+\r?\n\r?\n/.test(body)) {
    const r = await reader.read();
    if (r.done) break;
    body += new TextDecoder().decode(r.value);
  }
  const match = body.match(
    /event: (?:snapshot|error)\r?\ndata: ([^\n]+)\r?\n\r?\n/,
  );
  const data = match ? JSON.parse(match[1]) : {};
  results.push({
    endpoint: "/api/market/stream/:mint",
    status: res.status,
    delivery: data.delivery ?? null,
    source: data.source ?? null,
    code: data.code ?? null,
    asOf: data.asOf ?? null,
  });
  await reader.cancel();
} catch (e) {
  results.push({ endpoint: "/api/market/stream/:mint", error: e.message });
} finally {
  clearTimeout(timeout);
  ctrl.abort();
}
await mkdir("artifacts/functional-audit", { recursive: true });
await writeFile(
  "artifacts/functional-audit/live-probe.json",
  JSON.stringify(
    { observedAt: new Date().toISOString(), readOnly: true, results },
    null,
    2,
  ),
);
