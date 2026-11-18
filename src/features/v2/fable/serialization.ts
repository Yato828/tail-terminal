/** Keep tool outputs valid JSON; truncation must never masquerade as full coverage. */
export function serializeFableToolOutput(input: unknown, limit = 20000): string {
  const serialized = JSON.stringify(input);
  if (serialized.length <= limit) return serialized;
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const value = input as Record<string, unknown>, data = value.data;
    if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as Record<string, unknown>).bars)) {
      const record = data as Record<string, unknown>, bars = record.bars as unknown[];
      const shortened = JSON.stringify({ ...value, data: { ...record, bars: bars.slice(-60), returnedBars: Math.min(60, bars.length), originalReturnedBars: bars.length, truncatedForModelBudget: true } });
      if (shortened.length <= limit) return shortened;
    }
    if (Array.isArray(data)) {
      const shortened = JSON.stringify({ ...value, data: data.slice(0, 6), originalReturnedRows: data.length, returnedRows: Math.min(6, data.length), truncatedForModelBudget: true });
      if (shortened.length <= limit) return shortened;
    }
    return JSON.stringify({ source: typeof value.source === 'string' ? value.source.slice(0, 160) : 'Connected read-only source', fetchedAt: value.fetchedAt ?? null, observedAt: value.observedAt ?? null, truncatedForModelBudget: true, unavailable: 'Detailed source result exceeds the response budget. Ask for a narrower sample. No complete result is represented.' });
  }
  return JSON.stringify({ unavailable: 'Tool output exceeds the response budget.', truncatedForModelBudget: true });
}
