import { isSolanaAddress, safeUrl } from '../../../lib/validation';

export const MAX_SOCIAL_TEXT = 16000;
export type SocialNote = { id: string; mint: string | null; url: string; note: string; at: number };
/** Extraction validates a 32-byte key, never a mint account or an endorsement. */
export function extractSolanaCandidates(text: string): string[] {
  return [...new Set((text.slice(0, MAX_SOCIAL_TEXT).match(/[A-Za-z0-9]+/g) ?? []).filter(isSolanaAddress))].slice(0, 12);
}
export function publicSocialUrl(raw: unknown): string | undefined {
  const safe = safeUrl(raw);
  if (!safe) return;
  const host = new URL(safe).hostname;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':') || !host.includes('.')) return;
  return safe;
}
export function parseSocialNotes(value: unknown): SocialNote[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is SocialNote => !!x && typeof x === 'object' && typeof x.id === 'string' && x.id.length <= 100 && (x.mint === null || isSolanaAddress(x.mint)) && typeof x.url === 'string' && (!x.url || !!publicSocialUrl(x.url)) && typeof x.note === 'string' && x.note.length <= 4000 && Number.isFinite(x.at) && x.at > 0).slice(0, 100);
}
export function importSocialNotes(text: string): SocialNote[] {
  if (text.length > 600000) throw new Error('Import exceeds 600 KB.');
  const body = JSON.parse(text);
  if (body?.version !== 1 || !Array.isArray(body.notes) || body.notes.length > 100 || parseSocialNotes(body.notes).length !== body.notes.length) throw new Error('Invalid social notes export. Check addresses, HTTPS links and note lengths.');
  if (new Set(body.notes.map((x: SocialNote) => x.id)).size !== body.notes.length) throw new Error('Duplicate note identifiers.');
  return parseSocialNotes(body.notes);
}
