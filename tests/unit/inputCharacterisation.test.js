// Characterisation of createInput (keyboard + mouse merged with the first connected pad), written
// against the pre-refactor single-source input.js. Splitting input into device sources
// (workstream B) must keep every one of these behaviours for player 0.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInput, resetPadChordLatch } from '../../src/core/input.js';
import { DEFAULT_BINDINGS } from '../../src/core/bindings.js';

function fakeTarget() {
  const ls = new Map();
  return {
    addEventListener(t, f) { if (!ls.has(t)) ls.set(t, new Set()); ls.get(t).add(f); },
    removeEventListener(t, f) { ls.get(t)?.delete(f); },
    fire(t, e = {}) { for (const f of ls.get(t) ?? []) f({ preventDefault() {}, stopImmediatePropagation() {}, target: null, ...e }); },
  };
}
const button = (pressed) => ({ pressed });
function fakePad(index, down = [], axes = [0, 0, 0, 0]) {
  return { index, connected: true, buttons: Array.from({ length: 17 }, (_, i) => button(down.includes(i))), axes };
}

let win, pads, saved;
beforeEach(() => {
  saved = { window: globalThis.window, navigator: globalThis.navigator, document: globalThis.document };
  win = fakeTarget();
  pads = [];
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => pads }, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'document', { value: { pointerLockElement: null }, configurable: true, writable: true });
  resetPadChordLatch();
});
afterEach(() => {
  for (const k of ['window', 'navigator', 'document']) Object.defineProperty(globalThis, k, { value: saved[k], configurable: true, writable: true });
});

const frame = (input, dt = 1 / 60) => { input.update(dt); };

describe('characterisation: createInput merges keyboard+mouse and the first pad', () => {
  it('a key press is pressed for one frame, held until released, released for one frame', () => {
    const input = createInput({ target: win, bindings: DEFAULT_BINDINGS });
    win.fire('keydown', { code: 'KeyW' });
    frame(input);
    expect(input.pressed('forward')).toBe(true);
    expect(input.down('forward')).toBe(true);
    expect(input.move.y).toBe(1);
    expect(input.device).toBe('kbm');
    input.endFrame();
    frame(input);
    expect(input.pressed('forward')).toBe(false);
    expect(input.down('forward')).toBe(true);
    input.endFrame();
    win.fire('keyup', { code: 'KeyW' });
    frame(input);
    expect(input.released('forward')).toBe(true);
    expect(input.down('forward')).toBe(false);
    expect(input.move.y).toBe(0);
  });
  it('mouse buttons are action codes; diagonal keys normalise', () => {
    const input = createInput({ target: win, bindings: DEFAULT_BINDINGS });
    win.fire('mousedown', { button: 0 });
    win.fire('keydown', { code: 'KeyW' });
    win.fire('keydown', { code: 'KeyD' });
    frame(input);
    expect(input.pressed('punch')).toBe(true);
    expect(input.move.x).toBeCloseTo(Math.SQRT1_2);
    expect(input.move.y).toBeCloseTo(Math.SQRT1_2);
  });
  it('the first connected pad drives the same actions, whatever its index', () => {
    const input = createInput({ target: win, bindings: DEFAULT_BINDINGS });
    pads = [null, fakePad(1, [2], [0.5, -1, 0, 0])];
    frame(input);
    expect(input.pressed('punch')).toBe(true);
    expect(input.down('punch')).toBe(true);
    expect(input.device).toBe('pad');
    // Past the dead zone and normalised to length 1.
    expect(Math.hypot(input.move.x, input.move.y)).toBeCloseTo(1);
    expect(input.move.y).toBeGreaterThan(0.9);
    expect(input.move.x).toBeGreaterThan(0.3);
    expect(input.padButton(2)).toBe(true);
    expect(input.padButtonHeld(2)).toBe(true);
    expect(input.padPressed('punch')).toBe(true);
    input.endFrame();
    pads = [null, fakePad(1, [], [0, 0, 0, 0])];
    frame(input);
    expect(input.released('punch')).toBe(true);
    expect(input.padButton(2)).toBe(false);
  });
  it('keyboard and pad merge: either holds the action', () => {
    const input = createInput({ target: win, bindings: DEFAULT_BINDINGS });
    pads = [fakePad(0, [0])];
    win.fire('keydown', { code: 'KeyE' });
    frame(input);
    expect(input.down('jump')).toBe(true);
    expect(input.down('kick')).toBe(true);
  });
  it('RB: a tap is the cape on release, a hold is the gadget wheel', () => {
    const input = createInput({ target: win, bindings: DEFAULT_BINDINGS });
    pads = [fakePad(0, [5])];
    frame(input, 0.016);
    input.endFrame();
    pads = [fakePad(0, [])];
    frame(input, 0.016);
    expect(input.pressed('cape')).toBe(true);
    input.endFrame();
    pads = [fakePad(0, [5])];
    for (let i = 0; i < 20; i++) { frame(input, 0.016); input.endFrame(); }
    frame(input, 0.016);
    expect(input.down('gadgetWheel')).toBe(true);
  });
  it('right stick and the locked mouse both feed look; endFrame clears it', () => {
    const input = createInput({ target: win, bindings: DEFAULT_BINDINGS });
    globalThis.document.pointerLockElement = {};
    win.fire('mousemove', { movementX: 10, movementY: -4 });
    pads = [fakePad(0, [], [0, 0, 1, 0])];
    frame(input, 0.01);
    expect(input.look.dx).toBeCloseTo(10 + 9);
    expect(input.look.dy).toBeCloseTo(-4);
    input.endFrame();
    expect(input.look.dx).toBe(0);
  });
  it('disabled input ignores keys, blur releases everything held', () => {
    const input = createInput({ target: win, bindings: DEFAULT_BINDINGS });
    input.setEnabled(false);
    win.fire('keydown', { code: 'KeyW' });
    frame(input);
    expect(input.down('forward')).toBe(false);
    input.setEnabled(true);
    win.fire('keydown', { code: 'KeyW' });
    frame(input);
    expect(input.down('forward')).toBe(true);
    win.fire('blur');
    input.endFrame();
    frame(input);
    expect(input.down('forward')).toBe(false);
  });
  it('rebinding, swallowing a code and capturing the next key', () => {
    const input = createInput({ target: win, bindings: DEFAULT_BINDINGS });
    input.setBindings({ ...DEFAULT_BINDINGS, punch: ['KeyK'] });
    win.fire('keydown', { code: 'KeyK' });
    win.fire('keydown', { code: 'Digit1' });
    input.swallow('Digit1');
    frame(input);
    expect(input.pressed('punch')).toBe(true);
    expect(input.codePressed('KeyK')).toBe(true);
    expect(input.pressed('chain1')).toBe(false);
    let got = 'none';
    input.captureNext((c) => { got = c; });
    expect(input.capturing).toBe(true);
    win.fire('keydown', { code: 'KeyJ' });
    expect(got).toBe('KeyJ');
    expect(input.capturing).toBe(false);
  });
});
