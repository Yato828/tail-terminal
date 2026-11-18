import { describe, expect, it } from 'vitest';
import { fableConnectionMessage, prepareFableMessages } from './useFableConnection';
import type { AstraStatus, ChatMessage } from './types';
const unavailable: AstraStatus = { configured: false, ready: false, model: null, label: 'Fable 5.2', reason: 'OPENAI_API_KEY=private-fixture never belongs in market UI', social: 'not_connected', deployment: 'disabled', rateLimit: 'local' };
describe('safe Fable connection and retry history', () => {
  it('uses public setup messages instead of raw backend status diagnostics', () => {
    const message = fableConnectionMessage({ ...unavailable, code: 'missing_api_key' } as AstraStatus, false, '');
    expect(message).toContain('write and keep your question'); expect(message).not.toContain('OPENAI_API_KEY'); expect(message).not.toContain('private-fixture');
    expect(fableConnectionMessage(unavailable, true, '')).toContain('Checking');
    expect(fableConnectionMessage({ ...unavailable, ready: true }, false, '')).toContain('Ready to send');
  });
  it('deduplicates an existing unfinished identical user turn and retains prior completed messages', () => {
    const base: ChatMessage[] = [{ role: 'user', content: 'Earlier question', at: 1 }, { role: 'assistant', content: 'Earlier actual response', at: 2 }, { role: 'user', content: 'Retry this question', at: 3 }];
    const messages = prepareFableMessages(base, ' Retry this question ');
    expect(messages.map(m => m.content)).toEqual(['Earlier question', 'Earlier actual response', 'Retry this question']);
    expect(base).toHaveLength(3);
  });
  it('bounds multibyte history by bytes while preserving the newly submitted question', () => {
    const text = '字'.repeat(6000), base: ChatMessage[] = [{ role: 'assistant', content: text, at: 1 }];
    const messages = prepareFableMessages(base, text);
    expect(messages).toHaveLength(1); expect(messages[0].content).toBe(text);
    expect(new TextEncoder().encode(JSON.stringify(messages)).length).toBeLessThanOrEqual(28000);
  });
});
