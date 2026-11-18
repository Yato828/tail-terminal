import { useEffect, useState } from 'react';
import { searchAxioms, type AxiomCoin } from '../../../lib/axiom';
import { isSolanaAddress } from '../../../lib/validation';
const cache = new Map<string, { at: number; coin: AxiomCoin }>();
const pending = new Map<string, Promise<AxiomCoin | null>>();
export async function resolveStudioToken(mint: string): Promise<AxiomCoin | null> {
  if (!isSolanaAddress(mint)) throw new Error('Enter a valid Solana mint.');
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < 15000) return hit.coin;
  const request = pending.get(mint);
  if (request) return request;
  const next = searchAxioms(mint).then(rows => {
    const coin = rows.find(c => c.chainId === 'solana' && c.address === mint) ?? null;
    if (coin) { cache.set(mint, { at: Date.now(), coin }); while (cache.size > 32) cache.delete(cache.keys().next().value!); }
    return coin;
  }).finally(() => pending.delete(mint));
  pending.set(mint, next);
  return next;
}
export function useStudioToken(mint: string | null, main: AxiomCoin | null) {
  const [revision, setRevision] = useState(0);
  const retry = () => setRevision(v => v + 1);
  const [result, setResult] = useState<{ mint: string | null; coin: AxiomCoin | null; error: string }>({ mint: null, coin: null, error: '' });
  useEffect(() => {
    let stopped = false;
    if (!mint || main?.address === mint) return;
    setResult({ mint, coin: null, error: '' });
    resolveStudioToken(mint).then(coin => { if (!stopped) setResult({ mint, coin, error: coin ? '' : 'No indexed Solana pool found for this token. Choose another token or retry.' }); })
      .catch(() => { if (!stopped) setResult({ mint, coin: null, error: 'Token source unavailable. Reapply this token to retry.' }); });
    return () => { stopped = true; };
  }, [mint, main?.address, revision]);
  if (!mint) return { coin: null, error: '', loading: false, retry };
  if (main?.address === mint && main.chainId === 'solana') return { coin: main, error: '', loading: false, retry };
  return { coin: result.mint === mint ? result.coin : null, error: result.mint === mint ? result.error : '', loading: result.mint !== mint || (!result.coin && !result.error), retry };
}
