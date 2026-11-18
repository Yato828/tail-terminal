import { mkdir, writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:8787/api",
  mint = "So11111111111111111111111111111111111111112";
const results = [];
const sessionRes = await fetch(base + "/session", { method: "POST" }),
  session = await sessionRes.json();
if (!sessionRes.ok) throw Error("Local session unavailable");
const headers = {
  authorization: `Bearer ${session.token}`,
  "content-type": "application/json",
};
async function request(path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const value = await r.json();
  results.push({
    path,
    method,
    status: r.status,
    items: value.items?.length,
    error: value.error?.code,
  });
  if (!r.ok) throw Error(`${path}: ${value.error?.code}`);
  return value;
}
let alertId;
try {
  await request("/watchlist", "POST", { mint, enabled: true });
  const watched = await request("/watchlist");
  if (!watched.items.includes(mint)) throw Error("Watchlist did not persist");
  const created = await request("/alerts", "POST", {
    mint,
    direction: "above",
    priceUsd: 0.000001,
  });
  alertId = created.alert.id;
  const ac = new AbortController(),
    timer = setTimeout(() => ac.abort(), 15000);
  try {
    const response = await fetch(`${base}/market/stream/${mint}`, {
        signal: ac.signal,
      }),
      reader = response.body.getReader();
    let frame = "";
    while (!/event: snapshot\ndata: [^\n]+\n\n/.test(frame)) {
      const r = await reader.read();
      if (r.done) break;
      frame += new TextDecoder().decode(r.value);
    }
    await reader.cancel();
    results.push({
      path: "/market/stream/:mint",
      status: response.status,
      snapshot: /event: snapshot/.test(frame),
    });
  } finally {
    clearTimeout(timer);
    ac.abort();
  }
  let events;
  for (let i = 0; i < 10; i++) {
    events = await request("/alerts/events");
    if (events.items.some((e) => e.alertId === alertId)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const fired = events.items.find((e) => e.alertId === alertId);
  if (!fired) throw Error("No alert event after real observed price");
  results.push({
    check: "alert fired on real observed price",
    mint,
    observedPrice: fired.priceUsd ?? fired.observedPrice ?? null,
    passed: true,
  });
  const alerts = await request("/alerts");
  if (!alerts.items.some((a) => a.id === alertId && a.triggered))
    throw Error("Alert trigger not persisted");
} finally {
  if (alertId) await request("/alerts/" + alertId, "DELETE");
  await request("/watchlist", "POST", { mint, enabled: false });
  const remaining = await request("/watchlist");
  if (remaining.items.length) throw Error("Audit watchlist cleanup failed");
  const alerts = await request("/alerts");
  if (alerts.items.length) throw Error("Audit alert cleanup failed");
  await mkdir("artifacts/functional-audit", { recursive: true });
  await writeFile(
    "artifacts/functional-audit/session-live.json",
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        scope:
          "local anonymous audit session only; created watch entry and alert removed",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
}
