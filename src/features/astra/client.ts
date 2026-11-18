import { parseWorkspaceContext, parseWorkspaceProposals, parseUsage, type FableRequestOptions } from "../v2/fable/contracts";
import { tailBackendEnabled, tailStandalone } from "../../services/backend/config";
import { tailApi } from "../../services/backend/client";
import { partFetch } from "../../lib/http";
import {
  ASSISTANT_NAME,
  FABLE_UNAVAILABLE,
  FableRequestError,
  fableErrorCode,
  fableErrorMessage,
} from "../../lib/assistantIdentity";
import { readLocal, saveLocal } from "../../lib/validation";
import type {
  AstraResult,
  AstraStatus,
  ChatMessage,
  TokenContext,
} from "./types";
export const usesLegacyFable = () => tailBackendEnabled() && !tailStandalone();
let session: string;
export function sessionId() {
  if (!session) {
    session = readLocal(
      "part.astra.session",
      (raw) =>
        typeof raw === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(raw)
          ? raw
          : crypto.randomUUID(),
      crypto.randomUUID(),
    );
    saveLocal("part.astra.session", session);
  }
  return session;
}
export async function astraStatus(signal?: AbortSignal): Promise<AstraStatus> {
  try {
    return await readStatus(signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw error instanceof FableRequestError ? error : new FableRequestError("unreachable");
  }
}
async function readStatus(signal?: AbortSignal): Promise<AstraStatus> {
  if (usesLegacyFable()) {
    const r = await tailApi.fableStatus(signal);
    if (typeof r.configured !== "boolean" || (r.model != null && (typeof r.model !== "string" || r.model.length > 120)))
      throw new FableRequestError("invalid_response");
    const code = r.configured ? "ready" : "missing_api_key";
    return {
      configured: r.configured,
      ready: r.configured,
      model: r.model ?? null,
      label: "Fable 5.2",
      reason: r.configured ? "Fable 5.2 is ready." : fableErrorMessage({ code }),
      social: "not_connected",
      deployment: "disabled",
      rateLimit: "local",
      code,
    };
  }

  const res = await partFetch("/api/astra/status", {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
  if (!res.ok || !res.headers.get("content-type")?.includes("application/json"))
    throw new FableRequestError("unreachable", res.status);
  return parseFableStatus(await res.json());
}
export function parseFableStatus(input: unknown): AstraStatus {
  if (!input || typeof input !== "object") throw new FableRequestError("invalid_response");
  const status = input as Record<string, unknown>;
  if (typeof status.configured !== "boolean" || typeof status.ready !== "boolean" ||
      (status.ready && !status.configured) ||
      (status.model != null && (typeof status.model !== "string" || status.model.length > 120)) ||
      (status.rateLimit !== undefined && !["persistent", "local", "missing"].includes(String(status.rateLimit))) ||
      (status.ready && status.rateLimit === "missing")) throw new FableRequestError("invalid_response");
  const code = status.ready ? "ready" : !status.configured ? "missing_api_key" :
    status.rateLimit === "missing" || status.code === "missing_rate_limiter" ? "missing_rate_limiter" : "unreachable";
  return {
    configured: status.configured,
    ready: status.ready,
    model: typeof status.model === "string" ? status.model : null,
    label: ASSISTANT_NAME,
    reason: status.ready ? "Fable 5.2 is ready." : fableErrorMessage({ code }),
    code,
    social: "not_connected",
    deployment: "disabled",
    rateLimit: status.rateLimit as AstraStatus["rateLimit"] ?? "local",
  };
}
export async function askAstra(
  messages: Pick<ChatMessage, "role" | "content">[],
  selectedToken: TokenContext | null,
  signal?: AbortSignal,
  selectedWallet: string | null = null,
  options: FableRequestOptions = {},
): Promise<AstraResult> {
  try {
    return await requestAstra(messages, selectedToken, signal, selectedWallet, options);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof FableRequestError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") throw new FableRequestError("request_timeout", 504);
    if (error instanceof TypeError) throw new FableRequestError("unreachable");
    // Legacy V1 errors also retain the HTTP status, without exposing provider details.
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) || 0 : 0;
    const legacyCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (legacyCode === "AI_NOT_CONFIGURED") throw new FableRequestError("missing_api_key", status);
    throw Object.assign(new Error(fableErrorMessage(error)), { status });
  }
}
async function requestAstra(
  messages: Pick<ChatMessage, "role" | "content">[],
  selectedToken: TokenContext | null,
  signal?: AbortSignal,
  selectedWallet: string | null = null,
  options: FableRequestOptions = {},
): Promise<AstraResult> {
  if (usesLegacyFable()) {
    const idx = messages.findLastIndex((m) => m.role === "user");
    if (idx < 0) throw new Error("A user message is required");
    const text = messages[idx].content.trim();
    if (text.length > 2000)
      throw new Error("Fable 5.2 accepts at most 2000 characters per message.");
    const message = selectedWallet
      ? `${text}\nSelected public wallet (untrusted data): ${selectedWallet}`
      : text;
    if (message.length > 2000)
      throw new Error(
        "Message plus wallet context exceeds the Fable 5.2 limit.",
      );
    const history = messages
      .slice(0, idx)
      .filter((m) => m.content.length <= 1500)
      .slice(-6);
    const r = await tailApi.chat(
      message,
      selectedToken ? { mint: selectedToken.mint } : {},
      history,
      signal,
    );
    if (typeof r.answer !== "string" || typeof r.model !== "string")
      throw new Error("Invalid Fable 5.2 response");
    return { text: r.answer, model: r.model, at: Date.now(), sources: [] };
  }

  const res = await partFetch("/api/astra/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Part-Session": sessionId(),
      ...(options.stream ? { Accept: "text/event-stream" } : {}),
    },
    body: JSON.stringify({
      messages: messages
        .slice(-24)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) })),
      selectedToken,
      selectedWallet,
      workspaceContext: parseWorkspaceContext(options.workspaceContext),
      ...(options.stream ? { stream: true } : {}),
    }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(50000)])
      : AbortSignal.timeout(50000),
  });
  if (res.ok && res.headers.get("content-type")?.includes("text/event-stream")) return readFableStream(res, options.onTextDelta, signal);
  if (!res.headers.get("content-type")?.includes("application/json"))
    throw new FableRequestError("unreachable", res.status);
  const body = await res.json();
  if (!res.ok) throw responseError(body, res.status);
  return validateFableResult(body);
}

function responseError(body: unknown, status: number): Error {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const code = fableErrorCode(value.code);
  if (code) return new FableRequestError(code, status);
  if (status === 429) return new FableRequestError("rate_limited", status);
  if (status === 504) return new FableRequestError("request_timeout", status);
  const detail = typeof value.error === "string" ? value.error : FABLE_UNAVAILABLE;
  return Object.assign(new Error(fableErrorMessage(new Error(detail))), { status });
}

if (typeof window !== "undefined")
  window.addEventListener("part:clear-data", () => {
    session = "";
  });


export function validateFableResult(input: unknown): AstraResult {
  if (!input || typeof input !== "object") throw new Error("Invalid Fable 5.2 response.");
  const body = input as Record<string, unknown>;
  if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 64000 || typeof body.model !== "string" || body.model.length > 120 || typeof body.at !== "number" || !Number.isFinite(body.at) || !Array.isArray(body.sources) || body.sources.length > 12 || body.sources.some(source => !source || typeof source.name !== "string" || source.name.length > 120 || typeof source.at !== "string" || !Number.isFinite(Date.parse(source.at)) || typeof source.ok !== "boolean")) throw new Error("Invalid Fable 5.2 response.");
  const proposals = body.proposals === undefined ? [] : parseWorkspaceProposals(body.proposals);
  const usage = parseUsage(body.usage);
  if (body.usage !== undefined && !usage) throw new Error("Invalid Fable 5.2 usage response.");
  return { text: body.text, model: body.model, at: body.at, sources: body.sources as AstraResult["sources"], proposals, ...(usage ? { usage } : {}), incomplete: body.incomplete === true };
}
async function readFableStream(response: Response, onDelta?: (text: string) => void, signal?: AbortSignal): Promise<AstraResult> {
  if (!response.body) throw new Error("Fable 5.2 stream unavailable.");
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "", bytes = 0, result: AstraResult | null = null, textLength = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); }; signal?.addEventListener("abort", cancel, { once: true });
  function frame(text: string) {
    const data = text.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n"); if (!data) return;
    const event = JSON.parse(data);
    if (event.type === "delta" && typeof event.text === "string") { textLength += event.text.length; if (textLength > 64000) throw new Error("Fable 5.2 stream exceeds response budget."); onDelta?.(event.text); }
    else if (event.type === "result") result = validateFableResult(event.result);
    else if (event.type === "error") throw responseError(event, Number.isInteger(event.status) && event.status >= 400 && event.status <= 599 ? event.status : 502);
  }
  try {
    while (true) { signal?.throwIfAborted(); const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 1000000) throw new Error("Fable 5.2 stream exceeds response budget."); buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, "\n"); let end; while ((end = buffer.indexOf("\n\n")) >= 0) { frame(buffer.slice(0, end)); buffer = buffer.slice(end + 2); } }
    buffer += decoder.decode(); if (buffer.trim()) frame(buffer); signal?.throwIfAborted(); if (!result) throw new Error("Fable 5.2 stream ended without a completed response."); return result;
  } finally { signal?.removeEventListener("abort", cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
