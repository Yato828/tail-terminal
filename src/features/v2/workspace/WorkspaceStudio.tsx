import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { AxiomCoin } from '../../../lib/axiom';
import { isSolanaAddress } from '../../../lib/validation';
import { downloadFile, useBrowserData } from '../storage';
import { loadChartSettings, saveChartSettings } from '../charts/state';
import { addStudioCard, BUILTIN_PRESETS, cardMint, defaultStudioState, exportStudio, importStudio, MAX_STUDIO_CARDS, MAX_STUDIO_IMPORT_BYTES, moveStudioCard, parseStudioState, removeStudioCard, STUDIO_WIDGETS, studioPreset, updateStudioCard, WIDGET_LABELS, type StudioCard, type StudioLayout, type StudioState, type StudioWidget as StudioWidgetKind, type TokenScope } from './model';
import { TokenPicker } from './TokenPicker';
import { useStudioToken } from './tokenContext';
import { StudioWidget } from './StudioWidget';
import './workspace.css';

type Context = { coin: AxiomCoin | null; wallet?: string; selectMint: (mint: string) => void; selectWallet?: (address: string) => void };
function captureSettings(state: StudioState): StudioState {
  return { ...state, layout: { ...state.layout, cards: state.layout.cards.map(c => c.kind === 'chart' ? { ...c, chartSettings: loadChartSettings(`studio-${c.id}`) } : c) } };
}
function restoreSettings(layout: StudioLayout) {
  for (const card of layout.cards) if (card.kind === 'chart' && card.chartSettings) saveChartSettings(`studio-${card.id}`, card.chartSettings);
}
function StudioInstance({ card, index, layout, main, wallet, namespace, maximized, onMaximize, onPatch, onMove, onRemove, onChoose, onSelectMint, onSelectWallet, onDrop, onDrag }: {
  card: StudioCard; index: number; layout: StudioLayout; main: AxiomCoin | null; wallet: string; namespace: string; maximized: boolean;
  onMaximize: () => void; onPatch: (patch: Partial<StudioCard>) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void;
  onChoose: (mint: string) => void; onSelectMint: (mint: string) => void; onSelectWallet?: (wallet: string) => void;
  onDrop: () => void; onDrag: (id: string | null) => void;
}) {
  const mint = cardMint(card, layout, main?.chainId === 'solana' && isSolanaAddress(main.address) ? main.address : null), token = useStudioToken(mint, main);
  const [walletInput, setWalletInput] = useState(card.wallet ?? ''), [walletError, setWalletError] = useState('');
  useEffect(() => setWalletInput(card.wallet ?? ''), [card.wallet]);
  const element = useRef<HTMLElement>(null);
  useEffect(() => { if (maximized) element.current?.focus(); }, [maximized]);
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patchRef = useRef(onPatch); patchRef.current = onPatch;
  useEffect(() => {
    if (!element.current || card.pinned || maximized || typeof ResizeObserver === 'undefined') return;
    const target = element.current;
    const observer = new ResizeObserver(() => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      resizeTimer.current = setTimeout(() => { const height = Math.max(320, Math.min(1200, Math.round(target.getBoundingClientRect().height))); if (Math.abs(height - card.height) > 2) patchRef.current({ height }); }, 180);
    });
    observer.observe(target);
    return () => { observer.disconnect(); if (resizeTimer.current) clearTimeout(resizeTimer.current); };
  }, [card.height, card.pinned, maximized]);
  const key = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement).matches('input,textarea,select,[contenteditable=true]')) return;
    if (event.key === 'Escape' && maximized) { event.preventDefault(); onMaximize(); return; }
    if (!event.altKey) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); onMove(-1); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); onMove(1); }
    if (event.key.toLowerCase() === 'p') { event.preventDefault(); onPatch({ pinned: !card.pinned }); }
    if (event.key.toLowerCase() === 'h' && !card.pinned) { event.preventDefault(); onPatch({ hidden: true }); }
    if (event.key.toLowerCase() === 'm') { event.preventDefault(); onMaximize(); }
  };
  const cardWallet = card.wallet ?? wallet;
  return <section ref={element} className={`studio-instance${maximized ? ' studio-maximized' : ''}${card.pinned ? ' studio-pinned' : ''}`} style={{ gridColumn: `span ${card.span}`, height: card.height, resize: card.pinned || maximized ? 'none' : 'vertical' }} data-instance-id={card.id} data-widget-kind={card.kind} data-token-scope={card.scope} data-token-mint={mint ?? ''} data-pinned={card.pinned} tabIndex={0} aria-label={`${WIDGET_LABELS[card.kind]} instance ${index + 1}`} onKeyDown={key} onDragOver={e => { if (!card.pinned) e.preventDefault(); }} onDrop={e => { e.preventDefault(); onDrop(); }}>
    <header className="studio-instance-header">
      <button className="studio-drag" draggable={!card.pinned} disabled={card.pinned} onDragStart={e => { e.dataTransfer.setData('application/x-tail-studio-card', card.id); e.dataTransfer.effectAllowed = 'move'; onDrag(card.id); }} onDragEnd={() => onDrag(null)} aria-label={`Drag ${WIDGET_LABELS[card.kind]} instance ${index + 1}`} title="Drag to another unpinned card; Alt+arrows also moves cards">⠿</button>
      <h2>{WIDGET_LABELS[card.kind]} <small>{index + 1} · {card.scope === 'main' ? 'Main' : card.scope === 'independent' ? 'Independent' : `Group ${card.scope}`}{token.coin ? ` · ${token.coin.symbol}` : ''}</small></h2>
      <button onClick={() => onPatch({ pinned: !card.pinned })} aria-pressed={card.pinned}>{card.pinned ? 'Unpin' : 'Pin'}</button>
      <button onClick={onMaximize}>{maximized ? 'Restore' : 'Maximize'}</button>
      <button disabled={card.pinned} onClick={() => onPatch({ hidden: true })}>Hide</button>
      <button disabled={card.pinned || layout.cards.length <= 1} onClick={onRemove}>Remove</button>
    </header>
    <div className="studio-instance-body">
      <details className="studio-instance-settings"><summary>Context & layout</summary>
        <div className="studio-controls"><label>Token context<select aria-label={`Token context ${index + 1}`} value={card.scope} onChange={e => onPatch({ scope: e.target.value as TokenScope })}><option value="main">Main selected token</option><option value="A">Shared group A</option><option value="B">Shared group B</option><option value="independent">Independent token</option></select></label>
          <label>Width<select aria-label={`Widget width ${index + 1}`} value={card.span} disabled={card.pinned} onChange={e => onPatch({ span: Number(e.target.value) as 1 | 2 })}><option value={1}>One column</option><option value={2}>Full width</option></select></label>
          <label>Height<input aria-label={`Widget height ${index + 1}`} type="range" min={320} max={1200} step={20} value={card.height} disabled={card.pinned} onChange={e => onPatch({ height: Number(e.target.value) })} />{card.height}px</label>
          <button disabled={card.pinned} onClick={() => onMove(-1)}>Move earlier</button><button disabled={card.pinned} onClick={() => onMove(1)}>Move later</button>
          {mint && <button onClick={() => onSelectMint(mint)}>Use token in terminal</button>}
        </div>
        {card.scope === 'independent' && <TokenPicker label={`Independent token ${index + 1}`} mint={card.mint} onChoose={value => onPatch({ mint: value })} />}
        {(card.kind === 'intelligence' || card.kind === 'routes' || card.kind === 'fable') && <form className="studio-controls" onSubmit={e => { e.preventDefault(); if (walletInput && !isSolanaAddress(walletInput)) { setWalletError('Use a valid Solana public wallet.'); return; } setWalletError(''); onPatch({ wallet: walletInput || null }); }}><label>Public wallet override<input aria-label={`Widget wallet ${index + 1}`} value={walletInput} maxLength={44} placeholder="Blank follows selected public wallet" onChange={e => setWalletInput(e.target.value)} /></label><button>Apply public wallet</button>{cardWallet && onSelectWallet && <button type="button" onClick={() => onSelectWallet(cardWallet)}>Use wallet in terminal</button>}</form>}
        {walletError && <p role="alert">{walletError}</p>}
        <p>Pin locks position, size and visibility. Alt+arrows moves this card; Alt+P pins, Alt+H hides, Alt+M maximizes; Escape restores. Shared groups follow their selected mint. Independent widgets retain their own mint.</p>
      </details>
      {token.loading && <p role="status">Resolving selected Solana market…</p>}{token.error && <p role="alert">{token.error} <button onClick={token.retry}>Retry token source</button></p>}
      <StudioWidget key={`${card.kind}:${mint ?? 'empty'}`} card={card} coin={token.coin} wallet={cardWallet} namespace={namespace} selectMint={onChoose} selectWallet={address => onPatch({ wallet: address })} maximize={onMaximize} maximized={maximized} />
    </div>
  </section>;
}
export function WorkspaceStudio({ coin, wallet = '', selectMint, selectWallet }: Context) {
  const data = useBrowserData('workspace-studio', parseStudioState, defaultStudioState());
  const [kind, setKind] = useState<StudioWidgetKind>('chart'), [name, setName] = useState('My studio'), [notice, setNotice] = useState(''), [maximized, setMaximized] = useState<string | null>(null), [epoch, setEpoch] = useState(0);
  const namespace = useId();
  const [dragging, setDragging] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const { layout } = data.value;
  const changeLayout = (next: StudioLayout) => { void data.update({ ...data.value, layout: next }); };
  const patch = (id: string, value: Partial<StudioCard>) => changeLayout(updateStudioCard(layout, id, value));
  const move = (id: string, direction: -1 | 1) => { const movable = layout.cards.filter(c => !c.pinned && !c.hidden), index = movable.findIndex(c => c.id === id), target = movable[index + direction]; if (target) { changeLayout(moveStudioCard(layout, id, target.id)); setNotice('Widget order updated.'); } };
  const choose = (card: StudioCard, mint: string | null) => {
    if (card.scope === 'main') { if (mint) selectMint(mint); }
    else if (card.scope === 'independent') patch(card.id, { mint });
    else changeLayout({ ...layout, groups: { ...layout.groups, [card.scope]: mint } });
  };
  const applyLayout = (next: StudioLayout) => { restoreSettings(next); changeLayout(next); setMaximized(null); setEpoch(v => v + 1); setNotice(`${next.name} Studio layout loaded. Main terminal layout is unchanged.`); };
  useEffect(() => { if (maximized && !layout.cards.some(c => c.id === maximized && !c.hidden)) setMaximized(null); }, [layout, maximized]);
  return <section className="workspace-studio" aria-label="Workspace Studio" onKeyDownCapture={e => { if (e.key === 'Escape' && maximized) { e.preventDefault(); e.stopPropagation(); setMaximized(null); } }}>
    <header><h1>Workspace Studio</h1><p>An optional Solana mainnet desk with up to eight functional widget instances. Layouts are saved in this browser. The approved Default terminal stays unchanged.</p></header>
    <div className="studio-controls"><label>Widget type<select aria-label="Studio widget type" value={kind} onChange={e => setKind(e.target.value as StudioWidgetKind)}>{STUDIO_WIDGETS.map(id => <option key={id} value={id}>{WIDGET_LABELS[id]}</option>)}</select></label><button disabled={layout.cards.length >= MAX_STUDIO_CARDS} onClick={() => { changeLayout(addStudioCard(layout, kind, `widget-${crypto.randomUUID()}`)); setNotice(`${WIDGET_LABELS[kind]} instance added.`); }}>Add widget instance</button><b>{layout.cards.length}/8 instances · {layout.name}</b><button onClick={() => applyLayout(studioPreset('Default'))}>Reset Studio</button></div>
    <details className="studio-presets"><summary>Presets, import & export</summary><div className="studio-controls">{BUILTIN_PRESETS.map(preset => <button key={preset} onClick={() => applyLayout(studioPreset(preset))}>{preset}</button>)}</div><p>Smart Money opens public wallet and source tools; it does not imply verified profitable wallets. Layout presets do not place trades or call AI.</p>
      <div className="studio-controls"><label>Studio preset name<input aria-label="Studio preset name" value={name} maxLength={70} onChange={e => setName(e.target.value)} /></label><button disabled={!name.trim()} onClick={() => { const captured = captureSettings(data.value), saved = { ...captured.layout, id: `preset-${crypto.randomUUID()}`, name: name.trim() }; const presets = [saved, ...captured.presets.filter(p => p.name !== saved.name)].slice(0, 12); void data.update({ ...captured, presets }); setNotice('Studio preset saved locally.'); }}>Save Studio preset</button><button onClick={() => downloadFile('tail-workspace-studio.json', exportStudio(captureSettings(data.value)))}>Export Studio</button><button onClick={() => file.current?.click()}>Import Studio</button></div>
      <input ref={file} hidden type="file" accept=".json,application/json" aria-label="Import Studio file" onChange={async e => { const selected = e.target.files?.[0]; if (!selected) return; try { if (selected.size > MAX_STUDIO_IMPORT_BYTES) throw new Error('Workspace import must be at most 128 KB.'); const parsed = importStudio(await selected.text()); restoreSettings(parsed.layout); await data.update(parsed); setMaximized(null); setEpoch(v => v + 1); setNotice('Validated Studio imported. Saved mints are resolved from current sources.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'Invalid workspace import.'); } e.target.value = ''; }} />
      {!!data.value.presets.length && <div className="studio-controls">{data.value.presets.map(p => <span key={p.id}><button onClick={() => applyLayout(p)}>{p.name}</button><button aria-label={`Delete Studio preset ${p.name}`} onClick={() => { void data.update({ ...data.value, presets: data.value.presets.filter(saved => saved.id !== p.id) }); }}>×</button></span>)}</div>}
    </details>
    <details className="studio-groups"><summary>Shared token groups A / B</summary><p>Main follows the terminal selection. Each named group uses one saved Solana mint; changing it updates all cards in that group. Charts in a shared group synchronize matching UTC crosshair times.</p>{(['A', 'B'] as const).map(group => <TokenPicker key={group} label={`Group ${group} token`} mint={layout.groups[group]} onChoose={mint => changeLayout({ ...layout, groups: { ...layout.groups, [group]: mint } })} />)}</details>
    {notice && <p className="studio-notice" role="status">{notice}</p>}{data.storageError && <p role="alert">{data.storageError}</p>}
    {!!layout.cards.filter(c => c.hidden).length && <nav className="studio-controls" aria-label="Hidden Studio widgets">{layout.cards.filter(c => c.hidden).map(c => <button key={c.id} onClick={() => patch(c.id, { hidden: false })}>Show {WIDGET_LABELS[c.kind]} · {c.id.slice(-6)}</button>)}</nav>}
    <div className="studio-grid">{layout.cards.map((card, index) => card.hidden ? null : <StudioInstance key={`${epoch}:${card.id}`} card={card} index={index} layout={layout} main={coin} wallet={wallet} namespace={namespace} maximized={maximized === card.id} onMaximize={() => setMaximized(current => current === card.id ? null : card.id)} onPatch={value => patch(card.id, value)} onMove={direction => move(card.id, direction)} onRemove={() => changeLayout(removeStudioCard(layout, card.id))} onChoose={mint => choose(card, mint)} onSelectMint={selectMint} onSelectWallet={selectWallet} onDrag={setDragging} onDrop={() => { if (dragging) { changeLayout(moveStudioCard(layout, dragging, card.id)); setDragging(null); setNotice('Widget order updated.'); } }} />)}</div>
  </section>;
}
export default WorkspaceStudio;
