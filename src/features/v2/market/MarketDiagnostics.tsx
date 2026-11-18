import { useEffect, useState } from 'react';
import { poolStreamDiagnostics } from '../../../lib/poolStream';
import { marketCacheDiagnostics } from './cache';
import { marketSubscriptionDiagnostics } from './snapshot';
export function MarketDiagnostics() {
  const [, refresh] = useState(0);
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) refresh(n => n + 1); }, 2000); return () => clearInterval(timer); }, []);
  const cache = marketCacheDiagnostics(), subscriptions = marketSubscriptionDiagnostics(), streams = poolStreamDiagnostics();
  return <details className="v2-market-diagnostics"><summary>Market diagnostics · {cache.entries} cached · {cache.pending} in flight</summary>
    <p>Observed adapter response times measure this browser's requests, including provider and transport time. Event age measures time since receipt; network event-to-chart latency is unavailable.</p>
    <p>TTLs: metadata {cache.ttl.metadata / 1000}s · price {cache.ttl.price / 1000}s · history {cache.ttl.history / 1000}s · profiles {cache.ttl.profiles / 1000}s · mint/holder evidence {cache.ttl.chain / 1000}s. Hidden tabs pause market polling. Requests deduplicate; cache is bounded to 240 entries.</p>
    <div className="activity-table"><table><thead><tr><th>Adapter</th><th>Requests / cache hits / shared</th><th>Last / mean response</th><th>Errors / rate limits</th><th>Last success age</th></tr></thead><tbody>{cache.providers.map(p => <tr key={p.provider}><td>{p.provider}</td><td>{p.requests} / {p.hits} / {p.deduplicated} · {p.cacheHitRatio === null ? 'Unavailable' : `${(p.cacheHitRatio * 100).toFixed(1)}% hits`}</td><td>{p.lastLatencyMs === null ? 'Unavailable' : `${Math.round(p.lastLatencyMs)} / ${Math.round(p.totalLatencyMs / Math.max(1, p.completed))} ms`}</td><td title={p.lastError ?? ''}>{p.errors} / {p.rateLimits} · {p.completed ? `${(p.errors / p.completed * 100).toFixed(1)}% errors` : 'Unavailable'}</td><td>{p.lastSuccessAt === null ? 'Unavailable' : `${Math.floor((Date.now() - p.lastSuccessAt) / 1000)}s`}</td></tr>)}</tbody></table></div>
    <p>{subscriptions.subscriptions.length} shared market channels · {subscriptions.subscriptions.reduce((n, c) => n + c.subscribers, 0)} subscribers · {streams.length} shared pool streams</p>
    {streams.length === 0 && <p>Pool WebSocket: no active chart stream. Market snapshots are HTTP polling, never labeled push.</p>}
    {streams.map((s, i) => <p key={i}>Pool WS {s.state} · {s.subscribers} subscribers · {s.provider ?? 'Provider unavailable'} · last received tick {s.eventAgeMs === null ? 'Unavailable' : `${s.eventAgeMs}ms ago`}</p>)}
    {subscriptions.streams.map(s => <p key={s.mint}>{s.mint} · {s.status.state} · event age {s.eventAgeMs === null ? 'Unavailable' : `${s.eventAgeMs}ms`} · browser bridge delivery {s.deliveryLatencyMs === null ? 'Unavailable' : `${s.deliveryLatencyMs}ms`}</p>)}
  </details>;
}
