import { useFableConnection, fableConnectionMessage, prepareFableMessages } from "./useFableConnection";
import { fableErrorMessage } from "../../lib/assistantIdentity";
import { useFableContext } from "../v2/fable/context";
import { FableTools } from "../v2/fable/FableTools";
import { ProposalReview, FableUsageView } from "../v2/fable/ProposalReview";
import type { WorkspaceAction } from "../v2/contracts";
import type { FableUsage } from "../v2/fable/contracts";
import { useEffect, useRef, useState } from "react";
import { askAstra } from "./client";
import {
  assistantLabel,
  type ChatMessage,
  type TokenContext,
} from "./types";
import { errorMessage, readLocal, saveLocal } from "../../lib/validation";
type Thread = { id: string; name: string; messages: ChatMessage[] };
const fresh = (): Thread => ({
  id: crypto.randomUUID(),
  name: "New conversation",
  messages: [],
});
export function parseThreads(raw: unknown): Thread[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 10)
    .filter(
      (t) =>
        t &&
        typeof t.id === "string" &&
        typeof t.name === "string" &&
        Array.isArray(t.messages),
    )
    .map((t) => ({
      id: t.id.slice(0, 80),
      name: t.name.slice(0, 80),
      messages: t.messages
        .filter(
          (m: ChatMessage) =>
            m &&
            ["user", "assistant"].includes(m.role) &&
            typeof m.content === "string" &&
            Number.isFinite(m.at),
        )
        .slice(-24)
        .map((m: ChatMessage) => ({
          ...m,
          content: m.content.slice(0, 6000),
          model: typeof m.model === "string" ? m.model.slice(0, 80) : undefined,
        })),
    }));
}
const chips = [
  "Analyze this token",
  "Explain recent transfers",
  "Who holds this asset?",
  "Summarize liquidity risks",
  "Explain this chart",
];
export default function AstraChat({
  context,
  wallet,
  onSettings,
}: {
  context: TokenContext | null;
  wallet: string | null;
  onSettings: () => void;
}) {
  const [allowPortfolio, setAllowPortfolio] = useState(false), [stream, setStream] = useState(false), [streamDraft, setStreamDraft] = useState("");
  const [proposals, setProposals] = useState<WorkspaceAction[]>([]), [usage, setUsage] = useState<FableUsage | undefined>();
  const { context: workspaceContext } = useFableContext(context?.mint ?? null, allowPortfolio);
  const [threads, setThreads] = useState<Thread[]>(() => {
    const saved = readLocal("part.astra.threads.v1", parseThreads, []);
    return saved.length ? saved : [fresh()];
  });
  const [id, setId] = useState(threads[0].id);
  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<TokenContext | null>(context);
  const [attachedWallet, setAttachedWallet] = useState(wallet);
  const { status, checking, connectionError, retryConnection } = useFableConnection();
  const [pendingQuestion, setPendingQuestion] = useState("");
  const mounted = useRef(true), ime = useRef(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [copied, setCopied] = useState(-1);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    const clear = () => { const current = abort.current; abort.current = null; current?.abort(); const next = fresh(); setThreads([next]); setId(next.id); setInput(''); setBusy(false); setPendingQuestion(''); setError(''); setProposals([]); setUsage(undefined); setStreamDraft(''); setAllowPortfolio(false); setAttachedWallet(null); };
    window.addEventListener('part:clear-data', clear);
    return () => { mounted.current = false; const current = abort.current; abort.current = null; current?.abort(); window.removeEventListener('part:clear-data', clear); };
  }, []);
  const thread = threads.find((t) => t.id === id) ?? threads[0];
  const messages = thread.messages;
  useEffect(() => {
    setAttachedWallet(wallet);
  }, [wallet]);
  useEffect(() => {
    setAttached(context);
  }, [context?.mint, context?.pool]);
  useEffect(() => {
    setStorageError(!saveLocal("part.astra.threads.v1", threads));
  }, [threads]);
  function stopRequest() {
    const current = abort.current; abort.current = null; current?.abort();
    setBusy(false); setPendingQuestion(''); setError('Request stopped. Your draft is still here.');
  }
  const send = async (text: string, base = messages) => {
    if (!text.trim() || busy || abort.current || ime.current) return;
    const submitted = text.trim().slice(0, 6000), next = prepareFableMessages(base, submitted), threadId = thread.id;
    const ac = new AbortController(); abort.current = ac;
    setInput(value => value.trim() ? value : submitted);
    setError(''); setBusy(true); setPendingQuestion(submitted); setStreamDraft(''); setProposals([]); setUsage(undefined);
    const current = () => mounted.current && abort.current === ac && !ac.signal.aborted;
    try {
      const result = await askAstra(next, attached, ac.signal, attachedWallet, { workspaceContext: { ...workspaceContext, mint: attached?.mint ?? null }, stream, onTextDelta: text => { if (current()) setStreamDraft(value => value + text); } });
      if (current()) {
        setStreamDraft(''); setProposals(result.proposals ?? []); setUsage(result.usage);
        if (result.incomplete) setError('Response reached its output limit; this answer may be incomplete.');
        setThreads(ts => ts.map(t => t.id === threadId ? { ...t, messages: [...next, { role: 'assistant' as const, content: result.text, at: result.at, model: result.model }].slice(-24) } : t));
        setInput(value => value.trim() === submitted ? '' : value); void retryConnection();
      }
    } catch (error) {
      if (current()) { setError(`${fableErrorMessage(error)} Your draft is still here.`); void retryConnection(); }
    } finally {
      if (mounted.current && abort.current === ac) { abort.current = null; setBusy(false); setPendingQuestion(''); }
    }
  };
  const regenerate = () => {
    const lastUser = messages.findLastIndex((m) => m.role === "user");
    if (lastUser >= 0)
      void send(messages[lastUser].content, messages.slice(0, lastUser));
  };
  return (
    <section className="tool-page astra-chat">
      <header className="tool-heading">
        <div>
          <h1>
            {assistantLabel(
              messages.findLast((m) => m.role === "assistant")?.model,
            )}
          </h1>
          <p>{fableConnectionMessage(status, checking, connectionError)}</p>
        </div>
        <div className="tool-actions"><button type="button" disabled={checking} onClick={() => void retryConnection()}>Retry connection</button><button onClick={onSettings}>Settings ↗</button></div>
      </header>
      <div className="tool-actions">
        <select
          aria-label="Conversation"
          value={thread.id}
          disabled={busy}
          onChange={(e) => setId(e.target.value)}
        >
          {threads.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          disabled={busy || threads.length >= 10}
          onClick={() => {
            const t = fresh();
            setThreads((ts) => [t, ...ts].slice(0, 10));
            setId(t.id);
          }}
        >
          New thread
        </button>
        <input
          aria-label="Thread name"
          maxLength={80}
          value={thread.name}
          disabled={busy}
          onChange={(e) =>
            setThreads((ts) =>
              ts.map((t) =>
                t.id === thread.id ? { ...t, name: e.target.value } : t,
              ),
            )
          }
        />
        <button
          disabled={busy}
          onClick={() => {
            setThreads((ts) =>
              ts.map((t) => (t.id === thread.id ? { ...t, messages: [] } : t)),
            );
            setError("");
          }}
        >
          Clear history
        </button>
      </div>
      <div className="context-chip">
        {attached ? (
          <>
            <span>
              Solana · {attached.symbol} · {attached.mint}
            </span>
            <button
              aria-label="Remove token context"
              onClick={() => setAttached(null)}
            >
              Remove
            </button>
          </>
        ) : (
          <span>No asset attached</span>
        )}
        {context && !attached && (
          <button onClick={() => setAttached(context)}>
            Attach selected token
          </button>
        )}
      </div>
      {wallet && (
        <div className="context-chip">
          <span>
            {attachedWallet
              ? `Solana wallet · ${attachedWallet}`
              : "No wallet attached"}
          </span>
          <button
            aria-label={
              attachedWallet
                ? "Remove wallet context"
                : "Attach selected wallet"
            }
            onClick={() => setAttachedWallet(attachedWallet ? null : wallet)}
          >
            {attachedWallet ? "Remove" : "Attach selected wallet"}
          </button>
        </div>
      )}
      <details><summary>Local data tools · no AI required</summary><FableTools coin={null} wallet={wallet ?? undefined} tokenContext={attached} /></details>
      <div className="fable-v2-options"><label><input type="checkbox" checked={allowPortfolio} onChange={e => setAllowPortfolio(e.target.checked)} />Allow personal portfolio context</label><label><input type="checkbox" checked={stream} onChange={e => setStream(e.target.checked)} />Stream actual provider text</label></div>
      <p>Chart context: {workspaceContext.interval} · {workspaceContext.chartMode}. No personal balances or history are attached.</p>
      {storageError && (
        <p role="alert">
          Local storage unavailable. This conversation will not survive reload.
        </p>
      )}
      <div className="chat-messages" aria-live="polite">
        {!messages.length && (
          <div className="tool-empty">
            <span className="astra-empty-mark" aria-hidden="true">
              ✳
            </span>
            <h2>A clearer view of your market.</h2>
            <p>
              Ask about a selected Solana asset. Current facts come from
              connected sources; unavailable data stays unavailable.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <article key={`${m.at}-${i}`} className={`chat-message ${m.role}`}>
            <div>
              <b>{m.role === "user" ? "You" : assistantLabel(m.model)}</b>
              <time>
                {new Date(m.at).toISOString().replace("T", " ").slice(0, 19)}{" "}
                UTC
              </time>
              <button
                onClick={() => {
                  void navigator.clipboard
                    .writeText(m.content)
                    .then(() => setCopied(i))
                    .catch(() => setError("Clipboard unavailable."));
                }}
              >
                {copied === i ? "Copied" : "Copy"}
              </button>
            </div>
            <p>{m.content}</p>
          </article>
        ))}
        {busy && pendingQuestion && <article className="chat-message user"><b>You</b><p>{pendingQuestion}</p><small>Sending · not yet saved</small></article>}
        {streamDraft && <article className="chat-message assistant"><b>{busy ? "Receiving live response…" : "Incomplete response · not saved"}</b><p>{streamDraft}</p></article>}
        <ProposalReview proposals={proposals} /><FableUsageView usage={usage} />
      </div>
      <div className="prompt-chips">
        {chips.map((text) => (
          <button key={text} disabled={busy} onClick={() => setInput(text)}>
            {text}
          </button>
        ))}
      </div>
      {error && (
        <p className="tool-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ime.current) void send(input);
        }}
      >
        <textarea
          aria-label="Message Fable 5.2"
          maxLength={6000}
          value={input}
          disabled={busy}
          onCompositionStart={() => { ime.current = true; }}
          onCompositionEnd={() => { ime.current = false; }}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Fable 5.2 about this market…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !ime.current && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
              e.preventDefault();
              if (!e.repeat) void send(input);
            }
          }}
        />
        <div>
          {busy ? (
            <button
              key="stop"
              type="button"
              className="primary-action"
              onClick={event => { event.preventDefault(); stopRequest(); }}
            >
              Stop generating
            </button>
          ) : (
            <button key="send" type="submit" className="primary-action" disabled={!input.trim()}>
              Send
            </button>
          )}
          <button
            type="button"
            disabled={busy || !messages.some((m) => m.role === "user")}
            onClick={regenerate}
          >
            Regenerate
          </button>
        </div>
      </form>
      <small className="tool-disclaimer">
        Verify market data before trading. Messages and attached context are
        sent to Fable 5.2 when you press Send. History is saved in this browser.
      </small>
    </section>
  );
}
