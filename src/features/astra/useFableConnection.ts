import { useCallback, useEffect, useRef, useState } from 'react';
import { astraStatus } from './client';
import type { AstraStatus, ChatMessage } from './types';
import { fableErrorMessage } from '../../lib/assistantIdentity';

/** Status checks are read-only; they never submit a model request. */
export function useFableConnection() {
  const [status, setStatus] = useState<AstraStatus | null>(null);
  const [checking, setChecking] = useState(false), [connectionError, setConnectionError] = useState('');
  const mounted = useRef(false), serial = useRef(0), lastCheck = useRef(0);
  const active = useRef<{ controller: AbortController; timer: ReturnType<typeof setTimeout> } | null>(null);
  const retryConnection = useCallback(async () => {
    const id = ++serial.current;
    active.current?.controller.abort();
    if (active.current) clearTimeout(active.current.timer);
    const controller = new AbortController();
    lastCheck.current = Date.now();
    if (mounted.current) { setChecking(true); setConnectionError(''); }
    let timedOut = false;
    const timeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error('Connection check timed out. Retry the connection; your draft is safe.')); }, 8000);
      active.current = { controller, timer };
    });
    try {
      const result = await Promise.race([astraStatus(controller.signal), timeout]);
      if (mounted.current && serial.current === id) setStatus(result);
    } catch (error) {
      if (mounted.current && serial.current === id) {
        setStatus(null);
        setConnectionError(timedOut ? 'Connection check timed out. Retry the connection; your draft is safe.' : fableErrorMessage(error));
      }
    } finally {
      if (serial.current === id) {
        if (active.current) clearTimeout(active.current.timer);
        active.current = null;
        if (mounted.current) setChecking(false);
      }
    }
  }, []);
  useEffect(() => {
    mounted.current = true; void retryConnection();
    const refresh = () => { if (!document.hidden && !active.current && Date.now() - lastCheck.current >= 30000) void retryConnection(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { mounted.current = false; serial.current++; active.current?.controller.abort(); if (active.current) clearTimeout(active.current.timer); active.current = null; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [retryConnection]);
  return { status, checking, connectionError, retryConnection };
}

/** Public explanations never expose server keys or arbitrary backend diagnostics. */
export function fableConnectionMessage(status: AstraStatus | null, checking: boolean, connectionError: string): string {
  if (checking) return 'Checking Fable 5.2 connection…';
  if (status?.ready) return 'Ready to send · read-only tools';
  const code = (status as (AstraStatus & { code?: unknown }) | null)?.code;
  if (code === 'missing_api_key') return 'Fable 5.2 needs its server connection configured. You can still write and keep your question.';
  if (code === 'missing_rate_limiter') return 'Fable 5.2 is awaiting its service configuration. Your draft stays here; retry the connection when it is ready.';
  return connectionError || 'Fable 5.2 is currently unavailable. You can write a question, try sending, or retry the connection.';
}

/** Failed requests are never inserted here; retrying commits one user turn only. */
export function prepareFableMessages(base: ChatMessage[], text: string): ChatMessage[] {
  const content = text.trim().slice(0, 6000), previous = [...base];
  if (previous.at(-1)?.role === 'user' && previous.at(-1)?.content.trim() === content) previous.pop();
  const next = [...previous, { role: 'user' as const, content, at: Date.now() }].slice(-23);
  while (next.length > 1 && (next.reduce((n, message) => n + message.content.length, 0) > 22000 || new TextEncoder().encode(JSON.stringify(next)).length > 28000)) next.shift();
  return next;
}
