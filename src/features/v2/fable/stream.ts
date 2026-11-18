export type ResponseOutput = { type: string; call_id?: string; name?: string; arguments?: string; content?: Array<{ type: string; text?: string }> };
export type ResponsesBody = { output?: ResponseOutput[]; model?: string; status?: string; usage?: { input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown } };
/** Relays genuine provider text deltas; completed metadata remains authoritative. */
export async function readResponsesStream(response: Response, onDelta: (text: string) => void, signal: AbortSignal): Promise<ResponsesBody> {
  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new Error('Invalid provider streaming response');
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', bytes = 0, textLength = 0, complete: ResponsesBody | null = null;
  const abort = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener('abort', abort, { once: true });
  function event(frame: string) {
    const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    const item = JSON.parse(data) as { type?: string; delta?: unknown; response?: ResponsesBody };
    if (item.type === 'response.output_text.delta' && typeof item.delta === 'string') { textLength += item.delta.length; if (textLength > 64000) throw new Error('Provider text exceeds response budget'); onDelta(item.delta); }
    if ((item.type === 'response.completed' || item.type === 'response.incomplete') && item.response) complete = item.response;
    if (item.type === 'error' || item.type === 'response.failed') throw new Error('Provider streaming request failed');
  }
  try {
    while (true) {
      signal.throwIfAborted(); const part = await reader.read(); if (part.done) break;
      bytes += part.value.length; if (bytes > 2_000_000) throw new Error('Provider stream exceeds response budget');
      buffer = (buffer + decoder.decode(part.value, { stream: true })).replace(/\r\n/g, '\n');
      let end; while ((end = buffer.indexOf('\n\n')) >= 0) { event(buffer.slice(0, end)); buffer = buffer.slice(end + 2); }
    }
    buffer += decoder.decode(); if (buffer.trim()) event(buffer);
    signal.throwIfAborted(); if (!complete) throw new Error('Provider stream ended without completion metadata'); return complete;
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
