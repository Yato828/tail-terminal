import { useState } from 'react';
import type { WorkspaceAction } from '../contracts';
import { V2_ACTION_EVENT } from '../contracts';
import { validateWorkspaceAction, type FableUsage } from './contracts';
export function ProposalReview({ proposals = [] }: { proposals?: WorkspaceAction[] }) {
  const [notice, setNotice] = useState('');
  if (!proposals.length) return null;
  return <section className="fable-proposals" aria-label="Fable workspace proposals"><h3>Proposed workspace changes</h3><p>These changes have not been applied. Review opens the terminal's Apply/Cancel confirmation.</p>{proposals.map((action, i) => <article key={`${i}:${JSON.stringify(action)}`}><pre>{JSON.stringify(action, null, 2)}</pre><button onClick={() => { try { window.dispatchEvent(new CustomEvent(V2_ACTION_EVENT, { detail: validateWorkspaceAction(action) })); setNotice('Proposal sent for review. Apply or cancel it in the terminal confirmation.'); } catch { setNotice('This proposal failed validation. No change was performed.'); } }}>Review proposal {i + 1}</button></article>)}{notice && <p role="status">{notice}</p>}</section>;
}
export function FableUsageView({ usage }: { usage?: FableUsage }) {
  if (!usage) return null;
  return <p className="fable-usage">Provider requests: {usage.requests} · input tokens: {usage.inputTokens ?? 'Unavailable'} · output tokens: {usage.outputTokens ?? 'Unavailable'} · total tokens: {usage.totalTokens ?? 'Unavailable'} · estimated API cost: {usage.estimatedCostUsd === null ? 'Unavailable (pricing or provider usage not supplied)' : `$${usage.estimatedCostUsd.toFixed(6)} · ${usage.pricingSource ?? 'No provider requests'}`}</p>;
}
