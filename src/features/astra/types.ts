import type { WorkspaceAction } from "../v2/contracts";
import type { FableUsage } from "../v2/fable/contracts";
import { ASSISTANT_NAME } from "../../lib/assistantIdentity";
// Keep the old export/API names compatible; the visible identity is always Fable 5.2.
export const ASTRA_NAME = ASSISTANT_NAME;
export const assistantLabel = (_servedModel?: string) => ASSISTANT_NAME;
export type TokenContext = {
  chainId: "solana";
  mint: string;
  pool: string;
  symbol: string;
};
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  at: number;
  model?: string;
};
export type AstraStatus = {
  configured: boolean;
  ready: boolean;
  model: string | null;
  label: string;
  reason: string;
  social: "not_connected";
  deployment: "disabled";
  rateLimit: "persistent" | "local" | "missing";
  code?: "ready" | "missing_api_key" | "missing_rate_limiter" | "unreachable";
};
export type AstraResult = {
  text: string;
  model: string;
  at: number;
  sources: Array<{ name: string; at: string; ok: boolean }>;
  proposals?: WorkspaceAction[];
  usage?: FableUsage;
  incomplete?: boolean;
};
