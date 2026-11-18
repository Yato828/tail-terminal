/** Explicit execution/manual inputs only. Exact decimal quantities are tracked
 * with rationals; displayed USD numbers remain estimates, not balance-derived PnL. */
export type AccountingEntry = {
  id: string; at: number; mint: string; kind: 'buy' | 'sell' | 'transfer-in' | 'transfer-out';
  quantity: number; quantityExact?: string; usdTotal?: number | null; usdTotalExact?: string;
  tradeFeeUsd?: number | null; networkFeeSol?: number;
};
export type AccountingPosition = {
  mint: string; quantity: number; quantityExact: string; costBasisUsd: number | null;
  averageCostUsd: number | null; realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null; proceedsUsd: number | null; reasons: string[];
};
type Rational = { n: bigint; d: bigint };
const ZERO: Rational = { n: 0n, d: 1n };
const gcd = (a: bigint, b: bigint): bigint => { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; };
function fraction(n: bigint, d = 1n): Rational { const g = gcd(n, d); return { n: n / g, d: d / g }; }
function decimal(value: string | number): Rational | null {
  const s = String(value);
  if (s.length > 120 || !/^[+]?\d+(?:\.\d*)?(?:e[+-]?\d+)?$/i.test(s)) return null;
  const [mantissa, power = '0'] = s.toLowerCase().split('e');
  const [whole, tail = ''] = mantissa.replace(/^\+/, '').split('.');
  const scale = tail.length - Number(power);
  if (Math.abs(scale) > 100) return null;
  const n = BigInt(whole + tail);
  return scale >= 0 ? fraction(n, 10n ** BigInt(scale)) : fraction(n * 10n ** BigInt(-scale));
}
const add = (a: Rational, b: Rational) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Rational, b: Rational) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Rational, b: Rational) => fraction(a.n * b.n, a.d * b.d);
const div = (a: Rational, b: Rational) => fraction(a.n * b.d, a.d * b.n);
const number = (a: Rational | null): number | null => { if (a === null) return null; const value = Number(a.n) / Number(a.d); return Number.isFinite(value) ? value : null; };
function exactDecimal(a: Rational): string {
  const whole = a.n / a.d; let rem = a.n % a.d, digits = '';
  // Quantities only add/subtract finite decimal inputs, so this always terminates.
  for (let i = 0; rem && i < 100; i++) { rem *= 10n; digits += String(rem / a.d); rem %= a.d; }
  return String(whole) + (digits ? '.' + digits : '');
}
/** Exact product of the canonical stored decimal values (not prior input text). */
export function decimalProduct(a: number, b: number): string | null {
  const x = decimal(a), y = decimal(b);
  return x && y ? exactDecimal(mul(x, y)) : null;
}
type State = { quantity: Rational; cost: Rational | null; realized: Rational | null; proceeds: Rational | null; inventoryReliable: boolean; reasons: string[] };
export function weightedAverageAccounting(entries: AccountingEntry[], prices: Record<string, number | null> = {}, openingKnown = false) {
  const states = new Map<string, State>();
  let networkFees = ZERO;
  const entryIds = new Set<string>();
  for (const e of [...entries].sort((a, b) => a.at - b.at)) {
    if (entryIds.has(e.id) || !Number.isFinite(e.at) || !Number.isFinite(e.quantity) || e.quantity <= 0) continue;
    const quantity = decimal(e.quantityExact ?? e.quantity);
    if (!quantity || quantity.n <= 0n) continue;
    entryIds.add(e.id);
    const feeSol = e.networkFeeSol !== undefined && Number.isFinite(e.networkFeeSol) ? decimal(e.networkFeeSol) : null;
    if (feeSol) networkFees = add(networkFees, feeSol);
    const p = states.get(e.mint) ?? { quantity: ZERO, cost: openingKnown ? ZERO : null, realized: openingKnown ? ZERO : null, proceeds: ZERO, inventoryReliable: openingKnown, reasons: openingKnown ? [] : ['Opening history is incomplete'] };
    const consideration = e.usdTotal !== null && e.usdTotal !== undefined && Number.isFinite(e.usdTotal) ? decimal(e.usdTotalExact ?? e.usdTotal) : null;
    const fee = e.tradeFeeUsd === undefined ? ZERO : e.tradeFeeUsd !== null && Number.isFinite(e.tradeFeeUsd) ? decimal(e.tradeFeeUsd) : null;
    if (e.kind === 'buy' || e.kind === 'transfer-in') {
      if (e.kind === 'transfer-in' || !consideration || !fee) {
        p.cost = null;
        p.reasons.push(e.kind === 'transfer-in' ? 'Incoming transfer has unknown historical cost' : 'Historical execution price or fee is missing');
      } else if (p.cost !== null) p.cost = add(p.cost, add(consideration, fee));
      p.quantity = add(p.quantity, quantity);
    } else {
      const overdraw = quantity.n * p.quantity.d > p.quantity.n * quantity.d;
      const removedCost = !overdraw && p.quantity.n > 0n && p.cost !== null ? mul(p.cost, div(quantity, p.quantity)) : null;
      if (overdraw) { p.inventoryReliable = false; p.reasons.push('Disposal exceeds known acquired units'); }
      if (e.kind === 'sell') {
        if (consideration && fee && removedCost && p.realized !== null) p.realized = add(p.realized, sub(sub(consideration, fee), removedCost));
        else { p.realized = null; p.reasons.push('Realized PnL unavailable for an unpriced or incomplete disposal'); }
        p.proceeds = consideration && p.proceeds !== null ? add(p.proceeds, consideration) : null;
      }
      p.quantity = overdraw ? ZERO : sub(p.quantity, quantity);
      p.cost = removedCost && p.cost !== null ? sub(p.cost, removedCost) : null;
      // A locally empty sample never proves a flat boundary with unknown opening inventory.
      if (p.quantity.n === 0n && p.inventoryReliable) p.cost = ZERO;
    }
    p.reasons = [...new Set(p.reasons)]; states.set(e.mint, p);
  }
  const positions: AccountingPosition[] = [...states].map(([mint, p]) => {
    const price = prices[mint];
    const mark = price !== null && price !== undefined && Number.isFinite(price) ? decimal(price) : null;
    return { mint, quantity: number(p.quantity) ?? 0, quantityExact: exactDecimal(p.quantity), costBasisUsd: number(p.cost), averageCostUsd: p.quantity.n > 0n && p.cost !== null ? number(div(p.cost, p.quantity)) : null, realizedPnlUsd: number(p.realized), unrealizedPnlUsd: mark && p.cost !== null ? number(sub(mul(p.quantity, mark), p.cost)) : null, proceedsUsd: number(p.proceeds), reasons: p.reasons };
  });
  return { method: 'Weighted average cost; explicit USD inputs; exact decimal quantities; network fees separate', positions, networkFeesSol: number(networkFees) ?? 0, completeHistory: openingKnown };
}
export function csvExport(headers: string[], rows: unknown[][]) {
  const cell = (v: unknown) => { const s = v == null ? '' : String(v); return '"' + (/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'; };
  return [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
}
