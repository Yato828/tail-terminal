import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { astraStatus, askAstra, parseFableStatus } from "./client";
import {
  FABLE_UNAVAILABLE,
  fableErrorMessage,
  FableRequestError,
} from "../../lib/assistantIdentity";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("VITE_TAIL_API_URL", "/tail-api");
  vi.stubEnv("VITE_TAIL_STANDALONE", "0");
  vi.stubEnv("VITE_PART_SHELL", "web");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([
  "Configure OPENAI_API_KEY for ChatGPT on the backend.",
  "Message failed: OpenAI authentication failed.",
  "Input failed at https://api.openai.com/v1/responses",
  "Provider returned chat-latest.",
  "Network request failed.",
])("keeps operational details out of public errors: %s", (message) => {
  expect(fableErrorMessage(new Error(message))).toBe(FABLE_UNAVAILABLE);
});

it("keeps useful validation and gives a branded retry message for limits", () => {
  const message = "Fable 5.2 accepts at most 2000 characters per message.";
  expect(fableErrorMessage(new Error(message))).toBe(message);
  expect(fableErrorMessage({ status: 429 })).toContain("Fable 5.2 is busy");
  expect(fableErrorMessage(new Error("Source snapshot unavailable."))).toBe(
    "Source snapshot unavailable.",
  );
});

it.each([false, true])(
  "uses the Fable status label without altering served model metadata (ready=%s)",
  async (ready) => {
    fetchMock.mockResolvedValue(
      Response.json({
        configured: ready,
        model: "actual-provider-model",
        reason: "OPENAI_API_KEY required",
        provider: "OpenAI Responses API",
      }),
    );
    const status = await astraStatus();
    expect(status.label).toBe("Fable 5.2");
    expect(status.ready).toBe(ready);
    expect(status.model).toBe("actual-provider-model");
    expect(status.reason).toBe(
      ready ? "Fable 5.2 is ready." : fableErrorMessage({ code: "missing_api_key" }),
    );
  },
);

it("maps legacy status and chat failures before they reach the interface", async () => {
  vi.stubEnv("VITE_TAIL_API_URL", "");
  fetchMock.mockResolvedValueOnce(
    Response.json({
      configured: false,
      ready: false,
      model: null,
      reason: "Add OPENAI_API_KEY on the server.",
    }),
  );
  expect((await astraStatus()).reason).toBe(fableErrorMessage({ code: "missing_api_key" }));
  fetchMock.mockResolvedValueOnce(
    Response.json(
      {
        error: "OpenAI ChatGPT authorization failed.",
      },
      { status: 503 },
    ),
  );
  await expect(
    askAstra([{ role: "user", content: "Analyze SOL" }], null),
  ).rejects.toThrow(FABLE_UNAVAILABLE);
});

it("keeps explicit V1 missing-key failures actionable and preserves the HTTP status", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "AI_NOT_CONFIGURED", message: "PRIVATE OPENAI_API_KEY detail" } }, { status: 503 }));
  await expect(askAstra([{ role: "user", content: "Hello" }], null)).rejects.toMatchObject({
    code: "missing_api_key", status: 503, message: fableErrorMessage({ code: "missing_api_key" }),
  });
});

it.each([
  { configured: true, ready: "false" },
  { configured: "true", ready: true },
  { configured: false, ready: true },
  { configured: true, ready: true, rateLimit: "missing" },
  { configured: true, ready: true, model: { name: "untrusted" } },
  { configured: true, ready: true, rateLimit: "unbounded" },
])("rejects malformed or inconsistent readiness rather than showing Ready: %j", (input) => {
  expect(() => parseFableStatus(input)).toThrow(FableRequestError);
});

it("returns only validated status fields and a safe actionable configuration reason", () => {
  const value = parseFableStatus({ configured: true, ready: false, rateLimit: "missing", model: "served-model", reason: "SECRET upstream diagnostic", secret: "must not be copied" });
  expect(value).toMatchObject({ code: "missing_rate_limiter", ready: false });
  expect(value.reason).toContain("request limits");
  expect(JSON.stringify(value)).not.toMatch(/SECRET|must not be copied/);
});

it.each(["missing_api_key", "authentication_failed", "model_unavailable", "quota_exceeded", "rate_limited", "request_timeout"] as const)(
  "preserves the safe public failure code and HTTP status for JSON and SSE: %s", async (code) => {
    vi.stubEnv("VITE_TAIL_API_URL", "");
    vi.stubEnv("VITE_TAIL_STANDALONE", "1");
    const status = code === "request_timeout" ? 504 : code === "quota_exceeded" || code === "rate_limited" ? 429 : 503;
    const error = { code, error: "SECRET https://api.openai.com/ credential detail" };
    fetchMock.mockResolvedValueOnce(Response.json(error, { status }));
    fetchMock.mockResolvedValueOnce(new Response(`data: ${JSON.stringify({ type: "error", status, ...error })}\n\n`, { headers: { "Content-Type": "text/event-stream" } }));
    for (const stream of [false, true]) {
      const result = await askAstra([{ role: "user", content: "Hello" }], null, undefined, null, { stream }).catch(error => error);
      expect(result).toBeInstanceOf(FableRequestError);
      expect(result).toMatchObject({ code, status });
      expect(result.message).toBe(fableErrorMessage({ code }));
      expect(result.message).not.toMatch(/SECRET|openai|credential detail/i);
    }
  },
);

it("distinguishes a transport timeout from an aborted user request", async () => {
  vi.stubEnv("VITE_TAIL_API_URL", "");
  vi.stubEnv("VITE_TAIL_STANDALONE", "1");
  fetchMock.mockRejectedValue(new DOMException("upstream details", "TimeoutError"));
  await expect(askAstra([{ role: "user", content: "Hello" }], null)).rejects.toMatchObject({ code: "request_timeout", status: 504 });
});

it("keeps cancellation separate from an unavailable service", async () => {
  const ac = new AbortController();
  ac.abort();
  const aborted = new DOMException("Aborted", "AbortError");
  fetchMock.mockRejectedValue(aborted);
  await expect(astraStatus(ac.signal)).rejects.toBe(aborted);
  await expect(
    askAstra([{ role: "user", content: "Analyze SOL" }], null, ac.signal),
  ).rejects.toBe(aborted);
});

it('routes the standalone website to the real existing Astra API instead of portable unavailable status', async () => {
  vi.stubEnv('VITE_TAIL_API_URL', ''); vi.stubEnv('VITE_TAIL_STANDALONE', '1');
  fetchMock.mockResolvedValueOnce(Response.json({ configured: true, ready: true, model: 'actual-model', sources: [], at: Date.now() }));
  expect((await astraStatus()).ready).toBe(true);
  expect(String(fetchMock.mock.calls[0][0])).toBe('/api/astra/status');
  fetchMock.mockResolvedValueOnce(Response.json({ text: 'Observed source answer', model: 'actual-model', at: Date.now(), sources: [], proposals: [{ type: 'open_widget', widget: 'compare' }], usage: { requests: 1, inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: null, pricingSource: null } }));
  const context = { mint: null, interval: '1h' as const, chartMode: 'line', filters: null, widgets: ['compare'], allowPortfolio: false };
  const result = await askAstra([{ role: 'user', content: 'Compare tokens' }], null, undefined, null, { workspaceContext: context });
  expect(String(fetchMock.mock.calls[1][0])).toBe('/api/astra/chat');
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).workspaceContext).toEqual(context);
  expect(result.proposals).toEqual([{ type: 'open_widget', widget: 'compare' }]);
  expect(result.usage?.estimatedCostUsd).toBeNull();
});
it('uses the exact hosted HTTPS Astra API for an extension without explicit V1 backend', async () => {
  vi.stubEnv('VITE_TAIL_API_URL', ''); vi.stubEnv('VITE_TAIL_STANDALONE', '1'); vi.stubEnv('VITE_PART_SHELL', 'ext'); vi.stubEnv('DEV', false);
  fetchMock.mockResolvedValueOnce(Response.json({ configured: false, ready: false, model: null }));
  await astraStatus();
  expect(String(fetchMock.mock.calls[0][0])).toBe('https://tail-solana-workspace.vercel.app/api/astra/status');
  expect(fetchMock.mock.calls[0][1].credentials).toBe('omit');
});
it('rejects malformed response proposals and consumes genuine opt-in text deltas', async () => {
  vi.stubEnv('VITE_TAIL_API_URL', ''); vi.stubEnv('VITE_TAIL_STANDALONE', '1');
  fetchMock.mockResolvedValueOnce(Response.json({ text: 'Unsafe proposal fixture', model: 'fixture', at: Date.now(), sources: [], proposals: [{ type: 'send_transaction', mint: 'bad' }] }));
  await expect(askAstra([{ role: 'user', content: 'Test' }], null)).rejects.toThrow(FABLE_UNAVAILABLE);
  const result = { text: 'Real streamed answer', model: 'fixture', at: Date.now(), sources: [], proposals: [] }, delta = vi.fn();
  const text = `data: ${JSON.stringify({ type: 'delta', text: 'Real streamed ' })}\n\ndata: ${JSON.stringify({ type: 'delta', text: 'answer' })}\n\ndata: ${JSON.stringify({ type: 'result', result })}\n\n`;
  fetchMock.mockResolvedValueOnce(new Response(text, { headers: { 'Content-Type': 'text/event-stream' } }));
  expect((await askAstra([{ role: 'user', content: 'Test' }], null, undefined, null, { stream: true, onTextDelta: delta })).text).toBe(result.text);
  expect(delta.mock.calls.map(call => call[0]).join('')).toBe(result.text);
  expect(fetchMock.mock.calls[1][1].headers.get('Accept')).toBe('text/event-stream');
});
