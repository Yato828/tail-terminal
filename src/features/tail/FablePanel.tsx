import { useFableConnection, fableConnectionMessage, prepareFableMessages } from "../astra/useFableConnection";
import { usesLegacyFable } from "../astra/client";
import { useFableContext } from "../v2/fable/context";
import { FableTools } from "../v2/fable/FableTools";
import { ProposalReview, FableUsageView } from "../v2/fable/ProposalReview";
import type { WorkspaceAction } from "../v2/contracts";
import type { FableUsage } from "../v2/fable/contracts";
import { useEffect, useRef, useState } from "react";
import { askFable } from "../../services/adapters/tail";
import { TailMascot } from "../../mascot/TailMascot";
import { mascot } from "../../mascot/events";
import { readLocal, saveLocal } from "../../lib/validation";
import { fableErrorMessage } from "../../lib/assistantIdentity";
import type { AxiomCoin } from "../../lib/axiom";
import type { ChatMessage } from "../astra/types";
const parseMessages = (raw: unknown): ChatMessage[] =>
  Array.isArray(raw)
    ? raw
        .filter(
          (m) =>
            m &&
            ["user", "assistant"].includes(m.role) &&
            typeof m.content === "string" &&
            Number.isFinite(m.at),
        )
        .slice(-24)
        .map((m) => ({
          role: m.role,
          content: m.content.slice(0, 6000),
          at: m.at,
          model:
            typeof m.model === "string" ? m.model.slice(0, 100) : undefined,
        }))
    : [];
const actions = [
  "Analyze token",
  "Find active Solana markets",
  "Inspect selected wallet",
  "Explain chart",
];
export function FablePanel({
  coin,
  wallet,
  expanded,
  onExpand,
}: {
  coin: AxiomCoin | null;
  wallet: string;
  expanded: boolean;
  onExpand: () => void;
}) {
  const [allowPortfolio, setAllowPortfolio] = useState(false), [stream, setStream] = useState(false), [streamDraft, setStreamDraft] = useState("");
  const [proposals, setProposals] = useState<WorkspaceAction[]>([]), [usage, setUsage] = useState<FableUsage | undefined>();
  const { context: workspaceContext } = useFableContext(coin?.address ?? null, allowPortfolio);
  const { status, checking, connectionError, retryConnection } = useFableConnection();
  const [pendingQuestion, setPendingQuestion] = useState("");
  const mounted = useRef(true), ime = useRef(false);
  const [messages, setMessages] = useState(() =>
    readLocal("tail.fable.history.v1", parseMessages, []),
  );
  const [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const abort = useRef<AbortController | null>(null),
    transcript = useRef<HTMLDivElement>(null),
    request = useRef<string | null>(null),
    composition = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    const clear = () => {
      const current = abort.current; abort.current = null; current?.abort();
      mascot.end(request.current, 'cancel'); mascot.end(composition.current, 'cancel');
      request.current = null; composition.current = null;
      setMessages([]); setInput(''); setBusy(false); setPendingQuestion(''); setError(''); setProposals([]); setUsage(undefined); setStreamDraft(''); setAllowPortfolio(false);
    };
    window.addEventListener('part:clear-data', clear);
    return () => { mounted.current = false; const current = abort.current; abort.current = null; current?.abort(); mascot.end(request.current, 'cancel'); mascot.end(composition.current, 'cancel'); window.removeEventListener('part:clear-data', clear); };
  }, []);
  useEffect(() => {
    setStorageError(!saveLocal("tail.fable.history.v1", messages));
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [messages]);
  const stopComposing = () => {
    mascot.end(composition.current, "cancel");
    composition.current = null;
  };
  function stopRequest() {
    const current = abort.current; abort.current = null; current?.abort();
    mascot.end(request.current, 'cancel'); request.current = null;
    setBusy(false); setPendingQuestion(''); setError('Request stopped. Your draft is still here.');
  }
  async function send(text: string) {
    if (!text.trim() || busy || abort.current || ime.current) return;
    const submitted = text.trim().slice(0, 6000), next = prepareFableMessages(messages, submitted);
    const ac = new AbortController(); abort.current = ac;
    setInput(current => current.trim() ? current : submitted);
    setError(''); setBusy(true); setPendingQuestion(submitted);
    setStreamDraft(''); setProposals([]); setUsage(undefined); stopComposing();
    const requestId = mascot.begin('thinking', 'fable'); request.current = requestId;
    const current = () => mounted.current && abort.current === ac && !ac.signal.aborted;
    try {
      const result = await askFable(next, coin ? { chainId: 'solana', mint: coin.address, pool: coin.pairAddress, symbol: coin.symbol } : null, ac.signal, wallet || null,
        { workspaceContext, stream: stream && !usesLegacyFable(), onTextDelta: text => { if (current()) setStreamDraft(value => value + text); } });
      if (current()) {
        setStreamDraft(''); setProposals(result.proposals ?? []); setUsage(result.usage);
        if (result.incomplete) setError('Response reached its output limit; this answer may be incomplete.');
        setMessages([...next, { role: 'assistant', content: result.text, at: result.at, model: result.model }]);
        setInput(value => value.trim() === submitted ? '' : value);
        mascot.end(requestId, 'success'); void retryConnection();
      }
    } catch (error) {
      if (current()) { setError(`${fableErrorMessage(error)} Your draft is still here.`); mascot.end(requestId, 'error'); void retryConnection(); }
    } finally {
      if (mounted.current && abort.current === ac) { abort.current = null; setBusy(false); setPendingQuestion(''); }
      mascot.end(requestId, 'cancel'); if (request.current === requestId) request.current = null;
    }
  }
  return (
    <div className={`fable-panel${expanded ? " fable-expanded" : ""}`}>
      <header className="fable-heading">
        <TailMascot />
        <div>
          <h2>
            Ask Fable <small>5.2</small>
          </h2>
          <p>
            {busy
              ? "Thinking…"
              : checking
                ? "Connecting…"
                : status?.ready
                  ? "Ready"
                  : "Currently unavailable"}
          </p>
        </div>
        <button
          aria-label={expanded ? "Restore Fable 5.2" : "Expand Fable 5.2"}
          onClick={onExpand}
        >
          ↗
        </button>
      </header>
      <div className="fable-actions">
        {actions.map((action, i) => (
          <button
            key={action}
            disabled={
              busy ||
              (i === 0 && !coin) ||
              (i === 2 && !wallet) ||
              (usesLegacyFable() && i === 3)
            }
            title={
              usesLegacyFable() && i === 3
                  ? "Fable 5.2 does not expose this data tool. Use the chart or Pulse discovery directly."
                  : i === 2 && !wallet
                    ? "Select a watched wallet first"
                    : i === 0 && !coin
                      ? "Select a Solana token first"
                      : action
            }
            onClick={() =>
              void send(
                i === 2
                  ? `Inspect this watched wallet ${wallet}. Only report observed activity, no inferred PnL.`
                  : i === 1
                    ? "Search current Solana markets for SOL and JUP using the search tool. Report only observed liquidity and volume, with sources and observation times. This is not a profitability ranking."
                    : `${action}${coin ? `: ${coin.symbol} (${coin.address})` : " on Solana mainnet"}. Use source evidence; disclose unavailable data.`,
              )
            }
          >
            <span aria-hidden="true">{["✧", "▥", "▣", "↗"][i]}</span>{" "}
            {i === 0 && coin ? `Analyze ${coin.symbol}` : action}
          </button>
        ))}
      </div>
      <div
        className="fable-transcript"
        ref={transcript}
        role="log"
        aria-label="Fable 5.2 conversation"
      >
        <details><summary>Context and response options</summary><p>Selected token: {coin?.symbol ?? "None"} · interval: {workspaceContext.interval} · chart: {workspaceContext.chartMode} · widgets: {workspaceContext.widgets.join(", ") || "Unavailable"}</p><div className="fable-v2-options"><label><input type="checkbox" checked={allowPortfolio} onChange={e => setAllowPortfolio(e.target.checked)} />Allow personal portfolio context</label><label><input type="checkbox" checked={stream} onChange={e => setStream(e.target.checked)} disabled={usesLegacyFable()} />Stream actual provider text</label></div><p>Public selected wallet may be included. Personal balances and history are not attached by this panel.</p></details>
        <details><summary>Local data tools · no AI required</summary><FableTools coin={coin} wallet={wallet} /></details>
        {messages.length ? (
          messages.map((m, i) => (
            <article key={i}>
              <b>{m.role === "user" ? "You" : "Fable 5.2"}</b>
              <p>{m.content}</p>
            </article>
          ))
        ) : (
          <div className="fable-empty">
            <p>What would you like to know?</p>
            <span>
              {status?.ready
                ? "Ask Fable 5.2 about this token, its liquidity or recent activity."
                : fableConnectionMessage(status, checking, connectionError)}
            </span>
          </div>
        )}
        {busy && pendingQuestion && <article><b>You</b><p>{pendingQuestion}</p><small>Sending · not yet saved</small></article>}
        {streamDraft && <article className="fable-stream-draft"><b>{busy ? "Receiving live response…" : "Incomplete response · not saved"}</b><p>{streamDraft}</p></article>}
        {busy && !streamDraft && <p role="status">Analyzing your request…</p>}
        <ProposalReview proposals={proposals} />
        <FableUsageView usage={usage} />
      </div>
      {error && (
        <p className="tail-error" role="alert">
          {error}
        </p>
      )}
      {storageError && (
        <p role="alert">History could not be saved on this device.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!ime.current) void send(input);
        }}
      >
        <input
          aria-label="Ask Fable 5.2"
          placeholder="Ask Fable 5.2 about this market…"
          value={input}
          maxLength={usesLegacyFable() ? 1800 : 6000}
          disabled={busy}
          onCompositionStart={() => { ime.current = true; }}
          onCompositionEnd={() => { ime.current = false; }}
          onKeyDown={e => { if (e.key === 'Enter' && !ime.current && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229 && e.repeat) e.preventDefault(); }}
          onChange={(e) => {
            setInput(e.target.value);
            if (e.target.value.trim() && !composition.current)
              composition.current = mascot.begin("typing", "compose");
            else if (!e.target.value.trim()) stopComposing();
          }}
          onFocus={() => {
            if (input.trim() && !composition.current)
              composition.current = mascot.begin("typing", "compose");
          }}
          onBlur={stopComposing}
        />
        {busy ? (
          <button
            key="stop"
            type="button"
            onClick={event => { event.preventDefault(); stopRequest(); }}
          >
            Stop
          </button>
        ) : (
          <button
            key="send"
            disabled={!input.trim()}
            type="submit"
            aria-label="Send message"
          >
            ↑
          </button>
        )}
      </form>
      <footer>
        <span>Fable 5.2</span>
        <button type="button" disabled={checking} onClick={() => void retryConnection()}>Retry connection</button>
        <button
          disabled={busy || !messages.length}
          onClick={() => { setMessages([]); setProposals([]); setUsage(undefined); setStreamDraft(""); }}
        >
          Clear
        </button>
      </footer>
    </div>
  );
}
