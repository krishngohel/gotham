import { describe, it, expect } from 'vitest';
import { createJoinFlow, KBM } from '../../src/coop/joinFlow.js';
import { createDeviceWatch } from '../../src/coop/deviceWatch.js';
import { createMergedInput, createGamepadSource, createKeyboardMouseSource } from '../../src/core/input.js';

describe('join and drop (device assignment)', () => {
  it('alone, player 0 owns the keyboard and any pad', () => {
    const j = createJoinFlow();
    expect(j.assignment()).toEqual([{ kbm: true, pad: 'first' }]);
    expect(j.ownerOf(KBM)).toBe(0);
    expect(j.ownerOf(3)).toBe(0);
  });
  it('a second pad pressing Start joins; player 0 keeps the keyboard and its own pad', () => {
    const j = createJoinFlow();
    j.activity(0); // player 0 has been playing on pad 0
    expect(j.press(0, [0, 1])).toEqual({ type: 'ignore' }); // its own Start is a pause, not a join
    expect(j.press(1, [0, 1])).toEqual({ type: 'join', slot: 1, device: 1 });
    expect(j.commit(1, [0, 1])).toEqual([{ kbm: true, pad: 0 }, { kbm: false, pad: 1 }]);
    expect(j.count).toBe(2);
    expect(j.press(1, [0, 1]).type).toBe('ignore');
    expect(j.press(2, [0, 1, 2]).type).toBe('ignore'); // full
  });
  it('player 0 on the keyboard: the first pad to press Start joins with it', () => {
    const j = createJoinFlow();
    j.activity(KBM);
    expect(j.press(0, [0]).type).toBe('join');
    expect(j.commit(0, [0])).toEqual([{ kbm: true, pad: null }, { kbm: false, pad: 0 }]);
  });
  it('Enter joins with the keyboard only when player 0 is on a pad (at most one keyboard player)', () => {
    const j = createJoinFlow();
    j.activity(KBM);
    expect(j.press(KBM, []).type).toBe('ignore'); // player 0 is the keyboard
    const k = createJoinFlow();
    k.activity(2);
    expect(k.press(KBM, [2]).type).toBe('join');
    expect(k.commit(KBM, [2])).toEqual([{ kbm: false, pad: 2 }, { kbm: true, pad: null }]);
    const none = createJoinFlow();
    none.activity(0);
    expect(none.press(KBM, []).type).toBe('refused');
  });
  it('a lost pad puts its player in waiting; any free pad gets them back (indices are reused)', () => {
    const j = createJoinFlow();
    j.activity(KBM);
    j.commit(0, [0]);
    expect(j.disconnect(0)).toBe(1);
    expect(j.waiting).toBe(1);
    expect(j.slots[1].status).toBe('waiting');
    expect(j.press(KBM, []).type).toBe('ignore'); // the keyboard is player 0's
    expect(j.press(3, [3])).toEqual({ type: 'reassign', slot: 1, device: 3 });
    expect(j.waiting).toBe(-1);
    expect(j.assignment()[1]).toEqual({ kbm: false, pad: 3 });
  });
  it('player 0 losing its pad keeps playing when it also has the keyboard', () => {
    const j = createJoinFlow();
    j.activity(0);
    j.commit(1, [0, 1]);
    expect(j.disconnect(0)).toBe(-1);
    expect(j.assignment()[0]).toEqual({ kbm: true, pad: null });
  });
  it('dropping out gives player 0 everything again; player 0 never leaves', () => {
    const j = createJoinFlow();
    j.activity(0);
    j.commit(KBM, [0]);
    expect(j.leave(0)).toBe(false);
    expect(j.leave(1)).toBe(true);
    expect(j.assignment()).toEqual([{ kbm: true, pad: 'first' }]);
  });
});

describe('device watch', () => {
  const target = { listeners: {}, addEventListener(n, f) { this.listeners[n] = f; }, removeEventListener() {} };
  const pad = (index, pressed = [], axes = [0, 0, 0, 0]) => ({ index, connected: true, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })) });
  it('reports joins on the press edge, activity, connects and disconnects, and per-device navigation', () => {
    let pads = [pad(0), pad(1)];
    const w = createDeviceWatch({ target, getGamepads: () => pads });
    let ev = w.poll();
    expect(ev.connected).toEqual([0, 1]);
    pads = [pad(0), pad(1, [9])];
    ev = w.poll();
    expect(ev.joins).toEqual([1]);
    expect(w.nav(1).start).toBe(true);
    ev = w.poll();
    expect(ev.joins).toEqual([]); // held, not pressed again
    pads = [pad(0, [], [0.9, 0, 0, 0]), pad(1)];
    ev = w.poll();
    expect(w.nav(0).right).toBe(true);
    expect(ev.activity).toContain(0);
    pads = [pad(0)];
    ev = w.poll();
    expect(ev.disconnected).toEqual([1]);
    target.listeners.keydown({ code: 'Enter', target: null });
    ev = w.poll();
    expect(ev.joins).toEqual(['kbm']);
    expect(w.nav('kbm').ok).toBe(true);
    expect(w.connectedPads()).toEqual([0]);
  });
});

describe('input hand-off', () => {
  it('a merged input with the keyboard handed away ignores it; the other player reads it', () => {
    const t = { addEventListener() {}, removeEventListener() {} };
    globalThis.window ??= t; // the source listens for window blur
    const kbm = createKeyboardMouseSource({ target: t, bindings: { punch: ['KeyE'] } });
    const p0 = createMergedInput({ kbm, pad: createGamepadSource({ index: 0, getGamepads: () => [] }) });
    const p1 = createMergedInput({ kbm, pad: null });
    p0.setKbm(false);
    expect(p0.hasKbm).toBe(false);
    expect(p1.hasKbm).toBe(true);
    kbm.look.dx = 12;
    p0.update(0.016);
    expect(p0.look.dx).toBe(0);
    p1.update(0.016);
    expect(p1.look.dx).toBe(12);
    p0.setPad(3);
    expect(p0.padIndex).toBe(3);
  });
});
