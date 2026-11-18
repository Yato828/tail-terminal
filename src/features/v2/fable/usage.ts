import type { FableUsage } from './contracts';
export type ProviderUsage = { input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown };
export function emptyFableUsage(): FableUsage { return { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, pricingSource: null }; }
const token = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
export function addProviderUsage(total: FableUsage, usage: ProviderUsage | undefined, model: string, env: Record<string, string | undefined>) {
  const input = token(usage?.input_tokens), output = token(usage?.output_tokens), all = token(usage?.total_tokens);
  total.inputTokens = total.inputTokens === null || input === null ? null : total.inputTokens + input;
  total.outputTokens = total.outputTokens === null || output === null ? null : total.outputTokens + output;
  total.totalTokens = total.totalTokens === null || all === null ? null : total.totalTokens + all;
  const readPrice = (value: string | undefined) => value?.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const inPrice = readPrice(env.ASTRA_INPUT_USD_PER_MILLION), outPrice = readPrice(env.ASTRA_OUTPUT_USD_PER_MILLION);
  if (env.ASTRA_PRICE_MODEL?.trim() !== model || inPrice === null || outPrice === null || input === null || output === null) { total.estimatedCostUsd = null; total.pricingSource = null; }
  else if (total.estimatedCostUsd !== null) { total.estimatedCostUsd += (input * inPrice + output * outPrice) / 1000000; total.pricingSource = `Owner-configured USD rates for ${model}`; }
}
