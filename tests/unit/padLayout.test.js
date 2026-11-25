// [prog] a11y (wave 3 L1 item 6): pad presets, rebinding maths, per-player look, hold/toggle.
import { describe, it, expect } from 'vitest';
import {
  padActions, padLayout, STANDARD_LAYOUT, PAD_BUTTONS, PAD_CHORDS, PAD_CHORD_HOLD, PAD_PRESET_DEFS, PAD_REBINDABLE,
  resolvePadButtons, rebindPad, createGamepadSource, createMergedInput, createHoldModes, padButtonName,
} from '../../src/core/input.js';
import { sanitizeSettings } from '../../src/core/settings.js';

// The fixed layout's algorithm before presets existed, copied verbatim as the reference.
function oldPadActions(isDown, latch) {
  const out = new Set();
  const entries = Object.entries(PAD_BUTTONS), chords = Object.entries(PAD_CHORDS);
  const chordButtons = chords.map(([, i]) => i);
  const sticky = chordButtons.filter((i) => i >= 12), immediate = new Set(chordButtons.filter((i) => i < 12));
  const chord = isDown(PAD_CHORD_HOLD);
  for (const i of sticky) { if (!isDown(i)) latch.delete(i); else if (chord) latch.add(i); }
  for (const [a, idx] of entries) if (idx.some((i) => isDown(i) && !latch.has(i) && !(chord && immediate.has(i)))) out.add(a);
  for (const [a, i] of chords) if (chord && isDown(i)) out.add(a);
  return out;
}

function lcg(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

describe('pad layouts', () => {
  it("'standard' with no overrides is the old fixed layout, frame for frame", () => {
    expect(padLayout('standard', {})).toBe(STANDARD_LAYOUT);
    expect(padLayout()).toBe(STANDARD_LAYOUT);
    const rnd = lcg(7);
    const latchA = new Set(), latchB = new Set(), out = new Set();
    for (let f = 0; f < 4000; f++) {
      const down = new Set();
      for (let i = 0; i < 17; i++) if (rnd() < 0.18) down.add(i);
      const isDown = (i) => down.has(i);
      const want = [...oldPadActions(isDown, latchA)].sort();
      expect([...padActions(isDown, out, latchB)].sort()).toEqual(want);
      expect([...padActions(isDown, new Set(), new Set(latchB), padLayout('standard', {}))].sort()).toEqual(want);
    }
  });
  it('no preset gives one button two jobs', () => {
    for (const [id, def] of Object.entries(PAD_PRESET_DEFS)) {
      const used = Object.values(resolvePadButtons(id, {})).flat();
      expect(new Set(used).size, id).toBe(used.length);
      for (const i of used) expect(i).toBeLessThan(17);
    }
  });
  it('legacy: B taps the cape stun (hold for the wheel), RB kicks', () => {
    const L = padLayout('legacy');
    expect(L.wheel).toBe(1);
    expect([...padActions((i) => i === 5, new Set(), new Set(), L)]).toEqual(['kick']);
    expect([...padActions((i) => i === 1, new Set(), new Set(), L)]).toEqual([]);
  });
  it('one-handed: chains are held on its block button (LB)', () => {
    const L = padLayout('oneHanded');
    expect(L.chordHold).toBe(4);
    expect([...padActions((i) => i === 4 || i === 14, new Set(), new Set(), L)].sort()).toEqual(['block', 'chain1']);
  });
  it('an override swaps: the action that had the button gets the old one', () => {
    const b = resolvePadButtons('standard', { punch: 0 }); // punch to A: jump moves to X
    expect(b.punch).toEqual([0]);
    expect(b.jump).toEqual([2]);
    const L = padLayout('standard', { punch: 0 });
    expect([...padActions((i) => i === 2, new Set(), new Set(), L)]).toEqual(['jump']);
    expect(L.chordHold).toBe(3);
    // Rebinding block moves the chain chord's hold with it.
    expect(padLayout('standard', { block: 6 }).chordHold).toBe(6);
  });
  it('rebinding the cape slot moves the tap/hold button', () => {
    const L = padLayout('standard', { cape: 1 });
    expect(L.wheel).toBe(1);
    expect([...padActions((i) => i === 5, new Set(), new Set(), L)]).toEqual(['kick']);
  });
  it('rebindPad puts the newest override last, replacing an older one for the same action', () => {
    const m = rebindPad(rebindPad(rebindPad({}, 'punch', 0), 'kick', 2), 'punch', 3);
    expect(Object.entries(m)).toEqual([['kick', 2], ['punch', 3]]);
    // Applying in order: kick takes X (punch moves to B), then punch takes Y (block gets B).
    const b = resolvePadButtons('standard', m);
    expect(b.kick).toEqual([2]);
    expect(b.punch).toEqual([3]);
    expect(b.block).toEqual([1]);
  });
  it('every rebindable action is a known action with a name for its button', () => {
    const b = resolvePadButtons('standard', {});
    for (const a of PAD_REBINDABLE) expect(padButtonName(b[a]?.[0])).not.toBe('Unbound');
  });
  it('settings keep a pad map that only names real actions and buttons', () => {
    const s = sanitizeSettings({ pads: [{ preset: 'southpaw', map: { punch: 0, nope: 1, kick: 99 } }, { preset: 'weird' }] });
    expect(s.pads[0]).toMatchObject({ preset: 'southpaw', map: { punch: 0 } });
    expect(s.pads[1].preset).toBe('standard');
  });
});

describe('gamepad source with a layout', () => {
  const fakePad = (pressed = [], axes = [0, 0, 0, 0]) => ({ index: 0, connected: true, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })) });
  it('southpaw swaps the sticks', () => {
    let pad = fakePad([], [0, 0, 0.9, 0]);
    const src = createGamepadSource({ index: 0, getGamepads: () => [pad], layout: padLayout('southpaw') });
    src.update(0.016);
    expect(src.stick.mx).toBeGreaterThan(0.5);
    expect(src.stick.lx).toBe(0);
    src.setLayout(STANDARD_LAYOUT);
    src.update(0.016);
    expect(src.stick.lx).toBeGreaterThan(0.5);
    pad = fakePad();
  });
  it('legacy: a tap on B is the cape stun', () => {
    let pad = fakePad([1]);
    const src = createGamepadSource({ index: 0, getGamepads: () => [pad], layout: padLayout('legacy') });
    src.update(0.05);
    pad = fakePad();
    src.update(0.05);
    expect(src.pressed('cape')).toBe(true);
    expect(src.pressed('kick')).toBe(false);
  });
  it('per-player pad look: sensitivity and inversion relative to the camera', () => {
    const pad = fakePad([], [0, 0, 1, 1]);
    const m = createMergedInput({ pad: createGamepadSource({ index: 0, getGamepads: () => [pad] }) });
    m.update(0.1);
    const base = { dx: m.look.dx, dy: m.look.dy };
    m.endFrame();
    m.setLookTuning({ base: { sensitivity: 1, invertY: false }, pad: { sensitivity: 2, invertX: true, invertY: true } });
    m.update(0.1);
    expect(m.look.dx).toBeCloseTo(-2 * base.dx);
    expect(m.look.dy).toBeCloseTo(-2 * base.dy);
    m.endFrame();
    // The camera already inverts Y for the mouse player: a pad that also wants it inverted is unchanged.
    m.setLookTuning({ base: { sensitivity: 2, invertY: true }, pad: { sensitivity: 2, invertY: true } });
    m.update(0.1);
    expect(m.look.dy).toBeCloseTo(base.dy);
  });
});

// A keyboard-like source for the merged input, driven by hand.
function fakeKbm() {
  const held = new Set(); let pressed = new Set(), released = new Set();
  return {
    kind: 'kbm', move: { x: 0, y: 0 }, look: { dx: 0, dy: 0 },
    hold(a) { if (!held.has(a)) pressed.add(a); held.add(a); },
    let(a) { if (held.delete(a)) released.add(a); },
    down: (a) => held.has(a), pressed: (a) => pressed.has(a), released: (a) => released.has(a),
    update() {}, endFrame() { pressed = new Set(); released = new Set(); }, releaseAll() { held.clear(); },
    codePressed: () => false, swallow() {}, setBindings() {}, captureNext() {}, cancelCapture() {}, capturing: false, setEnabled() {}, dispose() {},
  };
}
const frame = (m, fn) => { fn?.(); m.update(0.016); const r = { sprint: m.down('sprint'), block: m.down('block'), jump: m.down('jump'), crouchP: m.pressed('crouch'), blockP: m.pressed('block') }; m.endFrame(); return r; };

describe('hold / toggle', () => {
  it('the defaults change nothing (crouch already toggles in the hero)', () => {
    const k = fakeKbm(); const m = createMergedInput({ kbm: k });
    m.setHoldModes(sanitizeSettings({}).access);
    expect(frame(m, () => k.hold('sprint')).sprint).toBe(true);
    expect(frame(m, () => k.let('sprint')).sprint).toBe(false);
    expect(frame(m, () => k.hold('crouch')).crouchP).toBe(true);
    expect(frame(m, () => k.let('crouch')).crouchP).toBe(false);
  });
  it('sprint toggle: a press latches it until pressed again or the player stops', () => {
    const k = fakeKbm(); const m = createMergedInput({ kbm: k });
    m.setHoldModes({ sprint: 'toggle' });
    k.move.y = 1;
    expect(frame(m, () => { k.hold('sprint'); }).sprint).toBe(true);
    expect(frame(m, () => k.let('sprint')).sprint).toBe(true);
    expect(frame(m).sprint).toBe(true);
    expect(frame(m, () => k.hold('sprint')).sprint).toBe(false);
    k.let('sprint');
    frame(m, () => k.hold('sprint'));
    k.let('sprint');
    k.move.y = 0;
    expect(frame(m).sprint).toBe(false);
  });
  it('block toggle: the press still counters, and block stays up until pressed again', () => {
    const k = fakeKbm(); const m = createMergedInput({ kbm: k });
    m.setHoldModes({ block: 'toggle' });
    const f1 = frame(m, () => k.hold('block'));
    expect(f1.blockP).toBe(true);
    expect(f1.block).toBe(true);
    expect(frame(m, () => k.let('block')).block).toBe(true);
    expect(frame(m, () => k.hold('block')).block).toBe(false);
  });
  it('crouch hold: letting go sends the second press', () => {
    const k = fakeKbm(); const m = createMergedInput({ kbm: k });
    m.setHoldModes({ crouch: 'hold' });
    expect(frame(m, () => k.hold('crouch')).crouchP).toBe(true);
    expect(frame(m).crouchP).toBe(false);
    expect(frame(m, () => k.let('crouch')).crouchP).toBe(true);
  });
  it('glide toggle: a jump press in the air latches jump until pressed again or landing', () => {
    const k = fakeKbm(); const m = createMergedInput({ kbm: k });
    let air = false;
    m.setHoldModes({ glide: 'toggle' }, { airborne: () => air });
    expect(frame(m, () => k.hold('jump')).jump).toBe(true); // a ground jump
    air = true;
    expect(frame(m, () => k.let('jump')).jump).toBe(false); // released: no glide yet
    frame(m, () => k.hold('jump'));
    expect(frame(m, () => k.let('jump')).jump).toBe(true); // latched glide
    expect(frame(m).jump).toBe(true);
    air = false;
    expect(frame(m).jump).toBe(false); // landed
  });
  it('the pure state machine resets', () => {
    const h = createHoldModes();
    h.set({ block: 'toggle' });
    h.step({ pressed: (a) => a === 'block', released: () => false }, false, false);
    expect(h.down('block', false)).toBe(true);
    h.reset();
    expect(h.down('block', false)).toBe(false);
  });
});
