import { describe, it, expect } from 'vitest';
import { deriveEvents, footPlants, poseDistance, speeds } from '../../scripts/anim-events.mjs';
import { CLIP_EVENTS } from '../../src/config/clipEvents.js';
import { MOCAP_DATA } from '../../src/config/mocapData.js';

const FPS = 30;
// A standing body; `over` patches joints per frame.
const stand = (over = {}) => ({
  pelvis: [0, 1, 0], Head: [0, 1.7, 0], hand_l: [0.2, 1.3, 0.2], hand_r: [-0.2, 1.3, 0.2],
  foot_l: [0.1, 0.08, 0], foot_r: [-0.1, 0.08, 0], ball_l: [0.1, 0.02, 0.1], ball_r: [-0.1, 0.02, 0.1], ...over,
});
const smooth = (k) => k * k * (3 - 2 * k);

describe('anim events: helpers', () => {
  it('speeds are central differences in m/s', () => {
    const v = speeds([[0, 0, 0], [0.1, 0, 0], [0.2, 0, 0]], 10);
    expect(v[1]).toBeCloseTo(1, 6);
    expect(v[0]).toBeCloseTo(1, 6);
  });
  it('pose distance is zero for the same pose and grows with displacement', () => {
    expect(poseDistance(stand(), stand())).toBe(0);
    expect(poseDistance(stand(), stand({ hand_r: [-0.2, 1.3, 0.8] }))).toBeCloseTo(0.6 / 6, 6);
  });
});

describe('anim events: strike', () => {
  // A jab: still for 0.3 s, the right hand shoots out to 0.8 m by 0.5 s, holds briefly, comes
  // back by 0.9 s, then rests until 1.3 s.
  const frames = [];
  for (let i = 0; i <= 39; i++) {
    const t = i / FPS;
    let z = 0.2;
    if (t > 0.3 && t <= 0.5) z = 0.2 + 0.6 * smooth((t - 0.3) / 0.2);
    else if (t > 0.5 && t <= 0.9) z = 0.8 - 0.6 * smooth((t - 0.5) / 0.4);
    frames.push(stand({ hand_r: [-0.2, 1.3, z] }));
  }
  const ev = deriveEvents({ kind: 'strike', fps: FPS, duration: 39 / FPS, contact: 0.5, limb: 'hand_r', frames });

  it('orders warpStart < contact < cancel <= recover <= end', () => {
    expect(ev.warpStart).toBeLessThan(ev.contact);
    expect(ev.contact).toBeLessThan(ev.cancel);
    expect(ev.cancel).toBeLessThanOrEqual(ev.recover);
    expect(ev.recover).toBeLessThanOrEqual(ev.end);
  });
  it('opens the warp where the limb starts to move and recovers when it is back', () => {
    expect(ev.warpStart).toBeGreaterThanOrEqual(0.25);
    expect(ev.warpStart).toBeLessThanOrEqual(0.36);
    expect(ev.contact).toBeCloseTo(0.5, 3);
    expect(ev.recover).toBeGreaterThan(0.7);
    expect(ev.recover).toBeLessThan(1.0);
    expect(ev.cancel).toBeGreaterThanOrEqual(0.5 + 2 / FPS - 1e-9);
  });
});

describe('anim events: knockdown and get-up', () => {
  it('finds the down frame and reports no get-up when the clip ends on the floor', () => {
    const frames = [];
    for (let i = 0; i <= 45; i++) {
      const t = i / FPS, h = t < 0.3 ? 1 : t < 0.8 ? 1 - 0.85 * smooth((t - 0.3) / 0.5) : 0.15;
      frames.push(stand({ pelvis: [0, h, 0], Head: [0, h + 0.6, 0] }));
    }
    const ev = deriveEvents({ kind: 'knockdown', fps: FPS, duration: 1.5, frames });
    expect(ev.down).toBeGreaterThan(0.6);
    expect(ev.down).toBeLessThanOrEqual(0.85);
    expect(ev.getUpStart).toBeNull();
    expect(ev.recover).toBe(1.5);
  });
  it('a knockdown that stands back up reports where the get-up starts', () => {
    const frames = [];
    for (let i = 0; i <= 90; i++) {
      const t = i / FPS;
      const h = t < 0.3 ? 1 : t < 0.8 ? 1 - 0.85 * smooth((t - 0.3) / 0.5) : t < 1.8 ? 0.15 : t < 2.5 ? 0.15 + 0.85 * smooth((t - 1.8) / 0.7) : 1;
      frames.push(stand({ pelvis: [0, h, 0], Head: [0, h + 0.6, 0] }));
    }
    const ev = deriveEvents({ kind: 'knockdown', fps: FPS, duration: 3, frames });
    expect(ev.getUpStart).toBeGreaterThanOrEqual(1.7);
    expect(ev.getUpStart).toBeLessThanOrEqual(1.9);
    expect(ev.recover).toBeGreaterThan(ev.getUpStart);
  });
  it('a get-up starts when the pelvis starts rising', () => {
    const frames = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / FPS, h = t < 0.5 ? 0.15 : t < 1.5 ? 0.15 + 0.85 * smooth((t - 0.5) / 1) : 1;
      frames.push(stand({ pelvis: [0, h, 0], Head: [0, h + 0.6, 0] }));
    }
    const ev = deriveEvents({ kind: 'getup', fps: FPS, duration: 2, frames });
    expect(ev.getUpStart).toBeGreaterThanOrEqual(0.45);
    expect(ev.getUpStart).toBeLessThanOrEqual(0.75);
    expect(ev.recover).toBeGreaterThanOrEqual(1.3);
  });
});

describe('anim events: footsteps', () => {
  // A walk at 1.2 m/s, one stride per second: each foot is planted (still in the world, so
  // sliding backwards in root space) for half the cycle and swings for the other half.
  const walk = () => {
    const frames = [], root = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / FPS;
      root.push(0, 1.2 * t);
      const foot = (phase) => {
        const c = ((t + phase) % 1 + 1) % 1; // 0..0.5 planted, 0.5..1 swing
        const worldZ = c < 0.5 ? 1.2 * (t - c) : 1.2 * (t - c) + 1.2 * smooth((c - 0.5) / 0.5);
        const y = c < 0.5 ? 0.08 : 0.08 + 0.15 * Math.sin(Math.PI * (c - 0.5) / 0.5);
        return [0, y, worldZ - 1.2 * t];
      };
      frames.push(stand({ foot_l: foot(0), foot_r: foot(0.5) }));
    }
    return { frames, root };
  };
  it('marks one plant per foot per stride, half a stride apart', () => {
    const { frames, root } = walk();
    const l = footPlants(frames, root, FPS, { foot: 'foot_l', loop: true });
    const r = footPlants(frames, root, FPS, { foot: 'foot_r', loop: true });
    expect(l.length).toBeGreaterThanOrEqual(2);
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs((l[1] - l[0]) - 1)).toBeLessThan(0.1);
    expect(Math.abs(Math.abs(r[0] - l[0]) - 0.5)).toBeLessThan(0.1);
  });
  it('a foot that never lifts has no steps; loops get only end + feet', () => {
    const frames = Array.from({ length: 20 }, () => stand());
    expect(footPlants(frames, null, FPS)).toEqual([]);
    const ev = deriveEvents({ kind: 'loco', fps: FPS, duration: 19 / FPS, frames });
    expect(Object.keys(ev).sort()).toEqual(['end', 'footL', 'footR']);
    expect(Object.keys(deriveEvents({ kind: 'loop', fps: FPS, duration: 1, frames }))).toEqual(['end']);
  });
});

describe('clipEvents.js (existing anims_mocap clips, additive)', () => {
  it('covers exactly the clips of mocapData.js with ordered, in-range events', () => {
    expect(Object.keys(CLIP_EVENTS).sort()).toEqual(Object.keys(MOCAP_DATA).sort());
    for (const [name, ev] of Object.entries(CLIP_EVENTS)) {
      const d = MOCAP_DATA[name];
      expect(ev.end).toBeCloseTo(d.duration, 3);
      for (const k of ['warpStart', 'contact', 'cancel', 'recover', 'down', 'getUpStart']) {
        if (ev[k] == null) continue;
        expect(ev[k], `${name}.${k}`).toBeGreaterThanOrEqual(0);
        expect(ev[k], `${name}.${k}`).toBeLessThanOrEqual(d.duration + 1e-6);
      }
      if (ev.kind === 'strike') {
        expect(Math.abs(ev.contact - d.contact)).toBeLessThan(1 / d.fps);
        expect(ev.warpStart).toBeLessThan(ev.contact);
        expect(ev.cancel).toBeGreaterThan(ev.contact);
        expect(ev.recover).toBeGreaterThanOrEqual(ev.cancel);
      }
    }
  });
});

describe('anim events: multi-hit strikes', async () => {
  const { strikePeaks } = await import('../../scripts/anim-events.mjs');
  it('finds each punch of a one-two and ignores a single jab', () => {
    const frames = [];
    for (let i = 0; i <= 45; i++) {
      const t = i / FPS;
      const out = (c) => 0.2 + 0.6 * Math.max(0, 1 - Math.abs(t - c) / 0.12);
      frames.push(stand({ hand_l: [0.2, 1.3, out(0.4)], hand_r: [-0.2, 1.3, out(0.9)] }));
    }
    const hits = strikePeaks(frames, FPS, 'hand_l');
    expect(hits.map(([, j]) => j)).toEqual(['hand_l', 'hand_r']);
    expect(hits[0][0]).toBeCloseTo(0.4, 1);
    expect(hits[1][0]).toBeCloseTo(0.9, 1);
    const ev = deriveEvents({ kind: 'strike', fps: FPS, duration: 1.5, contact: 0.4, limb: 'hand_l', frames });
    expect(ev.hits).toHaveLength(2);
  });
});
