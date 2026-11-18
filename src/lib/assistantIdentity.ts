/** Product identity is independent of the provider's served model ID. */
export const ASSISTANT_NAME = "Fable 5.2";
export const DEFAULT_OPENAI_MODEL = "chat-latest";
export const FABLE_UNAVAILABLE =
  "Fable 5.2 is currently unavailable. Please try again later.";
const FABLE_ERRORS = {
  missing_api_key: "Fable 5.2 is not connected yet. The workspace owner needs to finish setup.",
  missing_rate_limiter: "Fable 5.2 setup is incomplete. The workspace owner needs to enable request limits.",
  unreachable: "Cannot reach Fable 5.2. Check the connection and retry.",
  authentication_failed: "Fable 5.2 cannot connect. The workspace owner needs to check the service credentials.",
  model_unavailable: "The Fable 5.2 model is unavailable. The workspace owner needs to check model access.",
  quota_exceeded: "Fable 5.2 has reached its service budget. The workspace owner needs to check the account limits.",
  rate_limited: "Fable 5.2 is busy. Please try again shortly.",
  request_timeout: "Fable 5.2 took too long to respond. Your draft is saved; try again.",
  invalid_response: FABLE_UNAVAILABLE,
  request_failed: FABLE_UNAVAILABLE,
} as const;
export type FableErrorCode = keyof typeof FABLE_ERRORS;
export function fableErrorCode(value: unknown): FableErrorCode | undefined {
  return typeof value === "string" && Object.hasOwn(FABLE_ERRORS, value)
    ? value as FableErrorCode
    : undefined;
}
/** Public errors carry only an allowlisted code, HTTP status and safe message. */
export class FableRequestError extends Error {
  constructor(public code: FableErrorCode, public status = 0, message = FABLE_ERRORS[code] as string) {
    super(message);
    this.name = "FableRequestError";
  }
}
export function fableErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error
    ? fableErrorCode(error.code) : undefined;
  if (code) return FABLE_ERRORS[code];
  const detail = error instanceof Error ? error.message : "";
  const status =
    error && typeof error === "object" && "status" in error
      ? Number(error.status)
      : 0;
  if (status === 429 || /rate limit|billing limit|quota/i.test(detail))
    return "Fable 5.2 is busy. Please try again shortly.";
  if (
    [
      "Source snapshot unavailable.",
      "Pool verification source is unavailable. Try again later.",
      "Source candles are unavailable. A scenario cannot be generated without real candles.",
      "A recent snapshot with at least 20 source candles is required.",
      "Selected pool could not be verified for this Solana mint.",
      "Fable 5.2 returned an invalid scenario. No path was drawn.",
      "Analysis tool limit reached. Ask a narrower question.",
    ].includes(detail)
  )
    return detail;
  if (
    /^(Message|Input|Fable 5\.2 accepts|A user message)/i.test(detail) &&
    !/api[_ ]?key|provider|openai|chatgpt|gpt-|chat-latest|https?:|backend|server/i.test(
      detail,
    )
  )
    return detail;
  return FABLE_UNAVAILABLE;
}
