// [polish] The city map on a pad: hold View (the detective button) to open it; a tap is still
// detective vision. The keyboard's M and N are untouched.
import { describe, it, expect } from 'vitest';
import { createGamepadSource, PAD_MAP_HOLD, padLayout } from '../../src/core/input.js';

const pad = (down = []) => ({ index: 0, connected: true, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i) })), axes: [0, 0, 0, 0] });
function run(src, frames, held, dt = 0.016) {
  const seen = [];
  for (let i = 0; i < frames; i++) {
    src.setPads(held);
    src.p.update(dt);
    if (src.p.pressed('detective')) seen.push('detective');
    if (src.p.pressed('map')) seen.push('map');
    src.p.endFrame();
  }
  return seen;
}
function make(layout) {
  let pads = [pad()];
  const p = createGamepadSource({ index: 0, getGamepads: () => pads, ...(layout ? { layout } : {}) });
  return { p, setPads: (held) => { pads = [pad(held)]; } };
}

describe('pad: hold View for the map', () => {
  it('a tap of View is detective vision, fired once on release, and no map', () => {
    const s = make();
    expect(run(s, 5, [8])).toEqual([]);
    expect(run(s, 1, [])).toEqual(['detective']);
    expect(run(s, 5, [])).toEqual([]);
  });
  it('holding View past PAD_MAP_HOLD opens the map once, and never toggles detective', () => {
    const s = make();
    const frames = Math.ceil(PAD_MAP_HOLD / 0.016) + 30;
    expect(run(s, frames, [8])).toEqual(['map']);
    expect(run(s, 3, [])).toEqual([]);
  });
  it('detective is never reported as held (only the tap counts)', () => {
    const s = make();
    s.setPads([8]); s.p.update(0.016);
    expect(s.p.down('detective')).toBe(false);
  });
  it('follows detective when a layout moves it (one-handed: X)', () => {
    const s = make(padLayout('oneHanded'));
    const frames = Math.ceil(PAD_MAP_HOLD / 0.016) + 2;
    expect(run(s, frames, [2])).toEqual(['map']);
    expect(run(s, 1, [])).toEqual([]);
    expect(run(s, 2, [2])).toEqual([]);
    expect(run(s, 1, [])).toEqual(['detective']);
  });
});
