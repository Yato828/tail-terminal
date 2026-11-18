export const config = { runtime: 'edge' };
const responseHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
/** Public capability disclosure contains no credentials, private state or billable calls. */
export default function capabilities(request: Request): Response {
  if (request.method !== 'GET') return Response.json({ error: 'GET only' }, { status: 405, headers: { ...responseHeaders, Allow: 'GET' } });
  return Response.json({
    version: '2.0.0', chain: 'solana-mainnet', storage: 'browser-profile',
    authentication: 'no shared private account API',
    market: 'public providers; source-dependent coverage',
    execution: { enabled: false, signing: false, automaticTrading: false, reason: 'No vetted quote-to-instruction DEX execution adapter.' },
    ai: { brand: 'Fable 5.2', optional: true, provider: 'Owner-configured OpenAI API; no browser key' },
    alerts: 'foreground only', social: 'user-provided content; no global feed',
  }, { headers: responseHeaders });
}
