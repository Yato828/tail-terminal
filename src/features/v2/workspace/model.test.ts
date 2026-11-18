import { describe, expect, it } from 'vitest';
import { addStudioCard, BUILTIN_PRESETS, cardMint, defaultStudioState, exportStudio, importStudio, moveStudioCard, parseStudioState, removeStudioCard, studioPreset, updateStudioCard, validateStudioState } from './model';
const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const OTHER = 'So11111111111111111111111111111111111111112';
describe('optional Workspace Studio state', () => {
  it('keeps the initial Studio small and round-trips without rewriting Solana case', () => {
    const state = defaultStudioState();
    state.layout.groups.A = MINT;
    state.layout.cards[0] = { ...state.layout.cards[0], scope: 'independent', mint: MINT, wallet: OTHER };
    expect(importStudio(exportStudio(state))).toEqual(state);
    expect(state.layout.cards.map(c => c.kind)).toEqual(['chart', 'stats']);
    expect(importStudio(exportStudio(state)).layout.groups.A).toBe(MINT);
  });
  it('rejects oversized, invalid, duplicate, EVM, unknown widget and unsupported version imports', () => {
    expect(() => importStudio(' '.repeat(131073))).toThrow('128 KB');
    expect(() => importStudio('bad json')).toThrow('valid JSON');
    const invalid = [
      { ...defaultStudioState(), version: 2 },
      { ...defaultStudioState(), presets: Array.from({ length: 13 }, () => studioPreset('Default')) },
    ];
    for (const input of invalid) expect(validateStudioState(input)).toBeNull();
    for (const patch of [{ id: '__proto__' }, { kind: 'sign_transaction' }, { scope: 'all-wallets' }, { mint: '0x' + 'a'.repeat(40) }, { wallet: 'bad' }, { height: Infinity }, { height: 310 }, { height: 1201 }, { span: 3 }, { pinned: true, hidden: true }]) {
      const state = defaultStudioState(); Object.assign(state.layout.cards[0], patch);
      expect(validateStudioState(state)).toBeNull(); expect(() => importStudio(JSON.stringify(state))).toThrow();
    }
    const duplicate = defaultStudioState(); duplicate.layout.cards[1].id = duplicate.layout.cards[0].id;
    expect(validateStudioState(duplicate)).toBeNull();
    expect(parseStudioState(null)).toEqual(defaultStudioState());
  });
  it('limits real widget instances and refuses removing the last or pinned card', () => {
    let layout = studioPreset('Default');
    for (let i = 0; i < 10; i++) layout = addStudioCard(layout, 'chart', 'test-' + i);
    expect(layout.cards).toHaveLength(8);
    const pinned = updateStudioCard(layout, layout.cards[0].id, { pinned: true });
    expect(removeStudioCard(pinned, pinned.cards[0].id)).toBe(pinned);
    const single = { ...layout, cards: [layout.cards[0]] };
    expect(removeStudioCard(single, single.cards[0].id)).toBe(single);
  });
  it('moves only unlocked slots, retains locked positions, and locks pinned size/visibility', () => {
    let layout = studioPreset('Scalping');
    const lockedId = layout.cards[1].id;
    layout = updateStudioCard(layout, lockedId, { pinned: true });
    const first = layout.cards[0].id, last = layout.cards.at(-1)!.id;
    const moved = moveStudioCard(layout, first, last);
    expect(moved.cards[1].id).toBe(lockedId); expect(moved.cards.at(-1)!.id).toBe(first);
    expect(moveStudioCard(layout, lockedId, first)).toBe(layout);
    expect(updateStudioCard(layout, lockedId, { height: 900 })).toBe(layout);
    expect(updateStudioCard(layout, lockedId, { hidden: true })).toBe(layout);
    const unpinned = updateStudioCard(layout, lockedId, { pinned: false });
    expect(updateStudioCard(unpinned, lockedId, { height: 900 }).cards[1].height).toBe(900);
  });
  it('resolves independent/main/shared groups without falling back to another token', () => {
    const layout = studioPreset('Default'), card = layout.cards[0]; layout.groups.A = MINT; layout.groups.B = OTHER;
    expect(cardMint(card, layout, null)).toBeNull(); expect(cardMint(card, layout, MINT)).toBe(MINT);
    expect(cardMint({ ...card, scope: 'A' }, layout, OTHER)).toBe(MINT);
    expect(cardMint({ ...card, scope: 'B' }, layout, MINT)).toBe(OTHER);
    expect(cardMint({ ...card, scope: 'independent', mint: null }, layout, MINT)).toBeNull();
  });
  it('every built-in layout uses bounded real widgets and validates', () => {
    for (const name of BUILTIN_PRESETS) {
      const layout = studioPreset(name);
      expect(validateStudioState({ version: 1, layout, presets: [] })).not.toBeNull();
      expect(layout.cards.length).toBeLessThanOrEqual(8);
    }
  });
});
