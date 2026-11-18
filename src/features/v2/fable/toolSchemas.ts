import { FABLE_INTERVALS, FABLE_WIDGETS } from './contracts';
import { MARKET_FIELDS } from '../market/types';
const string = { type: 'string' };
const mint = { type: 'string', description: 'Exact base58 Solana mainnet mint; preserve case.' };
const args = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const actionSchema = { anyOf: [
  args({ type: { const: 'open_widget', type: 'string' }, widget: { type: 'string', enum: FABLE_WIDGETS } }),
  args({ type: { const: 'set_interval', type: 'string' }, interval: { type: 'string', enum: FABLE_INTERVALS } }),
  args({ type: { const: 'search_tokens', type: 'string' }, query: string }),
  args({ type: { const: 'compare_tokens', type: 'string' }, mints: { type: 'array', items: mint, minItems: 1, maxItems: 4 } }),
] };
export const FABLE_TOOL_DEFINITIONS = [
  ['get_token_holders', 'Largest-account owners with source coverage; never a full holder distribution.', args({ mint })],
  ['get_market_data', 'Current raw source market evidence per value; null means unavailable.', args({ mint })],
  ['get_chart_data', 'Verified historical source OHLCV, explicit scope and volume units; no fabricated candles.', args({ mint, interval: { type: 'string', enum: FABLE_INTERVALS }, limit: { type: 'integer', minimum: 20, maximum: 500 } })],
  ['get_wallet_comparison', 'Compare observed token balance-change activity of two public wallets, scanning at most eight recent transactions per wallet. Not PnL or wallet identity.', args({ addresses: { type: 'array', items: string, minItems: 2, maxItems: 2 } })],
  ['get_security_flags', 'Read verified Solana mint program and mint/freeze authorities. Missing checks remain unavailable; no safety score.', args({ mint })],
  ['get_liquidity_data', 'Indexed pool liquidity and source provenance; liquidity lock and LP ownership unavailable.', args({ mint })],
  ['compare_tokens', 'Compare up to four exact Solana mints, with available market evidence and explicit unknown security fields.', args({ mints: { type: 'array', items: mint, minItems: 1, maxItems: 4 } })],
  ['search_tokens', 'Bounded Solana DexScreener search sample, never a global token or profitability ranking.', args({ query: string })],
  ['build_token_filter', 'Validate a typed AND/OR filter JSON string. Optionally RETURN a save proposal; never save or apply it automatically.', args({ name: string, filterJson: string, sortField: { type: 'string', enum: Object.keys(MARKET_FIELDS) }, sortDirection: { type: 'string', enum: ['asc', 'desc'] }, proposeSave: { type: 'boolean' } })],
  ['configure_workspace', 'RETURN validated workspace proposals for visible user confirmation. Does not perform changes, signing, trades or deployment.', args({ actions: { type: 'array', items: actionSchema, minItems: 1, maxItems: 6 } })],
  ['explain_chart_indicator', 'Factual indicator formula, required source inputs and limitations, computed locally without AI.', args({ indicator: { type: 'string', enum: ['SMA', 'EMA', 'RSI', 'MACD', 'VWAP', 'Bollinger Bands'] } })],
  ['explain_this_move', 'Collect real source candles/trades for a bounded selected time range and describe observed changes; correlation is never proof of cause.', args({ mint, from: { type: 'number' }, to: { type: 'number' }, interval: { type: 'string', enum: FABLE_INTERVALS } })],
] as const;
export type FableToolName = typeof FABLE_TOOL_DEFINITIONS[number][0];
export const FABLE_V2_TOOLS = FABLE_TOOL_DEFINITIONS.map(([name, description, parameters]) => ({ type: 'function', name, description, strict: true, parameters }));
