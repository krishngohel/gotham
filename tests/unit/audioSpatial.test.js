import { describe, it, expect } from 'vitest';
import { attenuation, spatialize, makeListener, readListener, listenerFromObject, dopplerRatio, passByAt, SPATIAL_DEFAULTS } from '../../src/audio/spatial.js';
import { spaceFor, SPACES } from '../../src/audio/spaces.js';

const at = (x, y, z) => ({ x, y, z });
const listener = (x = 0, z = 0, yaw = 0, indoors = null) => readListener({ x, y: 0, z, yaw, indoors });

describe('attenuation', () => {
  it('is full inside ref, falls with distance and reaches zero at max', () => {
    expect(attenuation(0)).toBe(1);
    expect(attenuation(SPATIAL_DEFAULTS.ref)).toBe(1);
    let prev = 1;
    for (let d = 5; d < SPATIAL_DEFAULTS.max; d += 5) {
      const g = attenuation(d);
      expect(g).toBeLessThanOrEqual(prev);
      expect(g).toBeGreaterThanOrEqual(0);
      prev = g;
    }
    expect(attenuation(SPATIAL_DEFAULTS.max)).toBe(0);
    expect(attenuation(1e6)).toBe(0);
  });
  it('treats garbage as distance zero', () => {
    expect(attenuation(NaN)).toBe(1);
    expect(attenuation(-5)).toBe(1);
  });
});

describe('spatialize', () => {
  it('pans a sound on the right to the right and on the left to the left (yaw 0 looks down -Z)', () => {
    const ls = [listener()];
    expect(spatialize(ls, at(10, 0, 0)).pan).toBeGreaterThan(0.9);
    expect(spatialize(ls, at(-10, 0, 0)).pan).toBeLessThan(-0.9);
    expect(Math.abs(spatialize(ls, at(0, 0, -10)).pan)).toBeLessThan(1e-9);
  });
  it('follows the listener yaw', () => {
    // turned to face +X (yaw -90 deg): a sound at +X is straight ahead, one at -Z is on the left
    const ls = [listener(0, 0, -Math.PI / 2)];
    expect(Math.abs(spatialize(ls, at(10, 0, 0)).pan)).toBeLessThan(1e-6);
    expect(spatialize(ls, at(0, 0, -10)).pan).toBeLessThan(-0.9);
  });
  it('reports a sound behind the listener', () => {
    const r = spatialize([listener()], at(0, 0, 10));
    expect(r.behind).toBeCloseTo(1, 5);
    expect(r.lz).toBeGreaterThan(0); // +z is behind in listener space
  });
  it('collapses the pan for a sound right on top of the listener', () => {
    expect(Math.abs(spatialize([listener()], at(0.3, 0, 0)).pan)).toBeLessThan(0.3);
  });
  it('uses the nearest listener for gain in split screen and narrows the pan', () => {
    const ls = [listener(0, 0), listener(100, 0)];
    const r = spatialize(ls, at(95, 0, 0));
    expect(r.nearest).toBe(1);
    expect(r.gain).toBeCloseTo(attenuation(5), 6);
    expect(Math.abs(r.pan)).toBeLessThanOrEqual(SPATIAL_DEFAULTS.splitWidth + 1e-9);
  });
  it('muffles and quietens a source on the other side of an indoor/outdoor wall', () => {
    const inside = [listener(0, 0, 0, true)];
    const open = spatialize(inside, at(5, 0, 0), { ...SPATIAL_DEFAULTS, indoors: true });
    const walled = spatialize(inside, at(5, 0, 0), { ...SPATIAL_DEFAULTS, indoors: false });
    expect(open.muffle).toBe(0);
    expect(walled.muffle).toBe(1);
    expect(walled.gain).toBeLessThan(open.gain);
    // unknown indoors state never muffles
    expect(spatialize([listener()], at(5, 0, 0), { ...SPATIAL_DEFAULTS, indoors: true }).muffle).toBe(0);
  });
  it('plays unpositioned when there is no listener or no position', () => {
    expect(spatialize([], at(5, 0, 0)).gain).toBe(1);
    expect(spatialize([listener()], null).gain).toBe(1);
    expect(spatialize([listener()], { x: NaN }).pan).toBe(0);
  });
  it('allocates nothing when given an output object', () => {
    const out = { gain: 0, pan: 0 };
    expect(spatialize([listener()], at(1, 0, 0), SPATIAL_DEFAULTS, out)).toBe(out);
  });
});

describe('listeners', () => {
  it('reads a three.js-style matrixWorld (right = column 0, back = column 2, position = column 3)', () => {
    // identity rotation at (3, 4, 5)
    const e = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1];
    const l = listenerFromObject({ matrixWorld: { elements: e } });
    expect([l.x, l.y, l.z]).toEqual([3, 4, 5]);
    expect([l.rx, l.rz]).toEqual([1, 0]);
    expect(l.fx).toBeCloseTo(0, 9);
    expect(l.fz).toBe(-1);
  });
  it('accepts { camera }, { position, yaw } and keeps indoors', () => {
    const e = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1];
    expect(readListener({ camera: { matrixWorld: { elements: e } }, indoors: true }).indoors).toBe(true);
    const l = readListener({ position: { x: 7, y: 1, z: -2 }, yaw: Math.PI });
    expect([l.x, l.z]).toEqual([7, -2]);
    expect(l.fz).toBeCloseTo(1, 9);
    expect(makeListener().indoors).toBe(null);
  });
});

describe('doppler', () => {
  it('raises pitch approaching and lowers it receding, clamped', () => {
    expect(dopplerRatio(20)).toBeGreaterThan(1);
    expect(dopplerRatio(-20)).toBeLessThan(1);
    expect(dopplerRatio(1e9)).toBeLessThan(2);
    expect(dopplerRatio(NaN)).toBe(1);
  });
  it('a pass-by is higher before the closest point than after, loudest at it, and crosses sides', () => {
    const before = passByAt(-2, 20, 5, {});
    const mid = passByAt(0, 20, 5, {});
    const after = passByAt(2, 20, 5, {});
    expect(before.ratio).toBeGreaterThan(1);
    expect(after.ratio).toBeLessThan(1);
    expect(mid.gain).toBeGreaterThan(before.gain);
    expect(mid.gain).toBeGreaterThan(after.gain);
    expect(Math.sign(before.side)).toBe(-Math.sign(after.side));
  });
});

describe('spaces', () => {
  it('picks a reverb space from the environment', () => {
    expect(spaceFor({})).toBe('street');
    expect(spaceFor({ indoors: true })).toBe('interior');
    expect(spaceFor({ altitude: 40 })).toBe('rooftop');
    expect(spaceFor({ district: 'lowerGotham' })).toBe('underpass');
    expect(spaceFor({ district: 'narrows' })).toBe('alley');
    expect(spaceFor({ space: 'underpass', indoors: true })).toBe('underpass');
    expect(spaceFor(null)).toBe('street');
    for (const s of Object.values(SPACES)) expect(s.seconds).toBeGreaterThan(0);
  });
});
