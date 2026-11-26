import { describe, it, expect } from 'vitest';
import { createGamepadSource, createMergedInput, createScriptedInput, createRemoteInput } from '../../src/core/input.js';
import { assignDevices, assignmentProblem } from '../../src/players/devices.js';

const pad = (index, down = [], axes = [0, 0, 0, 0]) => ({ index, connected: true, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i) })), axes });

describe('gamepad source by index', () => {
  it('reads only the pad with its own index', () => {
    let pads = [pad(0, [2]), pad(1, [0])];
    const p0 = createGamepadSource({ index: 0, getGamepads: () => pads });
    const p1 = createGamepadSource({ index: 1, getGamepads: () => pads });
    p0.update(0.016); p1.update(0.016);
    expect(p0.down('punch')).toBe(true);
    expect(p0.down('jump')).toBe(false);
    expect(p1.down('jump')).toBe(true);
    expect(p1.down('punch')).toBe(false);
    // Pad 0 unplugged: its slot in the array is null, pad 1 keeps index 1.
    pads = [null, pad(1, [0])];
    p0.update(0.016); p1.update(0.016);
    expect(p0.connected).toBe(false);
    expect(p0.down('punch')).toBe(false);
    expect(p1.down('jump')).toBe(true);
  });
  it("'first' takes the first connected pad, whatever its index", () => {
    const pads = [null, pad(1, [1])];
    const p = createGamepadSource({ index: 'first', getGamepads: () => pads });
    expect(p.update(0.016)).toBe(true);
    expect(p.down('kick')).toBe(true);
  });
  it('two pads keep separate D-pad chord latches', () => {
    let pads = [pad(0, [3, 15]), pad(1, [15])];
    const p0 = createGamepadSource({ index: 0, getGamepads: () => pads });
    const p1 = createGamepadSource({ index: 1, getGamepads: () => pads });
    p0.update(0.016); p1.update(0.016);
    expect(p0.down('chain3')).toBe(true);
    expect(p1.down('throw')).toBe(true);
    pads = [pad(0, [15]), pad(1, [15])];
    p0.update(0.016); p1.update(0.016);
    expect(p0.down('throw')).toBe(false); // latched until released
    expect(p1.down('throw')).toBe(true);
  });
});

describe('merged input without a keyboard', () => {
  it('a pad-only player moves with the stick and has no key codes', () => {
    const pads = [pad(0), pad(1, [2], [0, -1, 0.5, 0])];
    const input = createMergedInput({ pad: createGamepadSource({ index: 1, getGamepads: () => pads }) });
    input.update(0.016);
    expect(input.pressed('punch')).toBe(true);
    expect(input.move.y).toBeCloseTo(1);
    expect(input.look.dx).toBeGreaterThan(0);
    expect(input.codePressed('KeyW')).toBe(false);
    expect(input.device).toBe('pad');
    input.endFrame();
    expect(input.look.dx).toBe(0);
  });
});

describe('scripted input', () => {
  it('press holds until release; tap is one frame; same action API', () => {
    const s = createScriptedInput();
    s.press('block');
    s.tap('punch');
    s.setMove(0, 2);
    s.update();
    expect(s.pressed('block')).toBe(true);
    expect(s.pressed('punch')).toBe(true);
    expect(s.down('block')).toBe(true);
    expect(s.down('punch')).toBe(false);
    expect(s.move.y).toBe(1);
    s.endFrame();
    s.update();
    expect(s.pressed('punch')).toBe(false);
    expect(s.down('block')).toBe(true);
    s.release('block');
    s.endFrame();
    s.update();
    expect(s.released('block')).toBe(true);
    expect(s.down('block')).toBe(false);
  });
  it('the remote stub applies a held-state message', () => {
    const r = createRemoteInput();
    r.apply({ held: ['sprint', 'forward'], move: { x: 0, y: 1 } });
    r.update();
    expect(r.down('sprint')).toBe(true);
    expect(r.pressed('forward')).toBe(true);
    expect(r.device).toBe('remote');
    r.endFrame();
    r.apply({ held: ['forward'] });
    r.update();
    expect(r.released('sprint')).toBe(true);
    expect(r.down('forward')).toBe(true);
  });
});

describe('device assignment', () => {
  it('one player: keyboard and the first pad merge, as today', () => {
    expect(assignDevices(1)).toEqual([{ kbm: true, pad: 'first' }]);
  });
  it('two players: keyboard + pad 0 for player 0, pad 1 for player 1', () => {
    expect(assignDevices(2)).toEqual([{ kbm: true, pad: 0 }, { kbm: false, pad: 1 }]);
  });
  it('join claims bind pads by index; a pad is never shared; at most one keyboard', () => {
    expect(assignDevices(2, { claims: [3, 0] })).toEqual([{ kbm: true, pad: 3 }, { kbm: false, pad: 0 }]);
    expect(assignDevices(2, { claims: [1, 1] })).toEqual([{ kbm: true, pad: 1 }, { kbm: false, pad: null }]);
    expect(assignDevices(2, { kbmPlayer: 1, claims: [0, null] })).toEqual([{ kbm: false, pad: 0 }, { kbm: true, pad: null }]);
    expect(assignmentProblem([{ kbm: true, pad: 0 }, { kbm: true, pad: 1 }])).toMatch(/keyboard/);
    expect(assignmentProblem([{ kbm: true, pad: 0 }, { kbm: false, pad: 0 }])).toMatch(/twice/);
    expect(assignmentProblem(assignDevices(2))).toBe(null);
  });
});
