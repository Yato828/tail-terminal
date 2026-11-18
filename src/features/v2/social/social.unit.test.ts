import { describe, expect, it } from 'vitest';
import { extractSolanaCandidates, importSocialNotes, parseSocialNotes, publicSocialUrl } from './analysis';
import { parseSelectedContext } from '../extension/chrome';
const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
describe('manual social evidence boundaries', () => {
  it('preserves case, validates bytes and rejects embedded substrings', () => {
    expect(extractSolanaCandidates(`CA: ${mint}, duplicate ${mint}. 0x1234 ${'z'.repeat(44)} prefix${mint}suffix`)).toEqual([mint]);
    expect(extractSolanaCandidates('1'.repeat(33))).toEqual([]);
  });
  it('bounds address extraction and preserves unavailable as unconfirmed', () => {
    expect(extractSolanaCandidates('x'.repeat(16000) + mint)).toEqual([]);
    expect(extractSolanaCandidates(`Wallet or mint: ${mint}`)).toEqual([mint]);
  });
  it('rejects executable, credentialed and local social URLs', () => {
    for (const url of ['javascript:alert(1)', 'http://x.com/a', 'https://user:pass@x.com', 'https://localhost/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'invalid']) expect(publicSocialUrl(url)).toBeUndefined();
    expect(publicSocialUrl('https://x.com/user/status/123')).toBe('https://x.com/user/status/123');
  });
  it('rejects malformed imports without partially accepting them', () => {
    const note = { id: 'n', mint, url: 'https://t.me/public/1', note: 'User provided note', at: 1000 };
    expect(importSocialNotes(JSON.stringify({ version: 1, notes: [note] }))).toEqual([note]);
    expect(() => importSocialNotes(JSON.stringify({ version: 1, notes: [note, { ...note, id: 'x', mint: '0x123' }] }))).toThrow();
    expect(() => importSocialNotes(JSON.stringify({ version: 1, notes: [note, note] }))).toThrow('Duplicate');
    expect(parseSocialNotes([{ ...note, url: 'javascript:alert(1)' }])).toEqual([]);
  });
  it('expires text independently of service worker memory and bounds storage values', () => {
    const value = { version: 2, text: mint, sourceUrl: 'https://x.com', at: 10000000 };
    expect(parseSelectedContext(value, 10000001)?.text).toBe(mint);
    expect(parseSelectedContext(value, 10000000 + 1800001)).toBeNull();
    expect(parseSelectedContext({ ...value, text: 'x'.repeat(16001) }, 10000001)).toBeNull();
    expect(parseSelectedContext({ ...value, at: Infinity })).toBeNull();
  });
});
