// [light] The readability floor (src/env/look.js applyReadability, docs/design/lighting.md): what is
// added on top of the time-of-day look so no scene renders too dark to read. The key frames
// themselves stay as they were (tests/unit/envClockWeather.test.js holds the night ones).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lookAtHour, applyWeather, applyReadability, darkness, makeLook, READABILITY, NIGHT, KEYFRAMES } from '../../src/env/look.js';
import { daylight } from '../../src/env/clock.js';
import { getQuality, TIERS } from '../../src/render/quality.js';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const STORM = { cloud: 1, fog: 0.1, rain: 1, snow: 0 };
const CLEAR = { cloud: 0, fog: 0.05, rain: 0, snow: 0 };
const FOG = { cloud: 1, fog: 1, rain: 0, snow: 0 };
const SNOW = { cloud: 1, fog: 0.3, rain: 0, snow: 1 };
const raw = (h, w = STORM) => applyWeather(lookAtHour(h, makeLook()), w, daylight(h), 0);
const at = (h, { indoor = 0, cover = 0, shadowed = false, w = STORM } = {}) => applyReadability(raw(h, w), indoor, cover, shadowed);

describe('readability floor', () => {
  it('darkness comes from the frame: 1 at the night fill, 0 through the working day', () => {
    expect(darkness(NIGHT.hemiI)).toBe(1);
    expect(darkness(1.5)).toBe(0);
    expect(darkness(1.7)).toBe(0);
    expect(at(2).dark).toBe(1);
    expect(at(12).dark).toBe(0);
    // Dusk and dawn count as dark too (their key light is weaker than the moon's).
    expect(at(19).dark).toBeGreaterThan(0.8);
    expect(at(5.5).dark).toBeGreaterThan(0.8);
  });

  it('lifts the night fill and turns its ground colour from near-black to navy', () => {
    const n = at(2);
    expect(n.hemiI).toBeCloseTo(NIGHT.hemiI * READABILITY.fill, 5);
    expect(luma(n.hemiGround)).toBeGreaterThan(luma(NIGHT.hemiGround) * 1.8);
    // Still a night: blue, and under the day's bounce.
    expect(n.hemiGround[2]).toBeGreaterThan(n.hemiGround[0]);
    expect(luma(n.hemiGround)).toBeLessThan(luma(at(12).hemiGround));
  });

  it('tiers with shadow maps get more fill (their streets are cut off from the moon)', () => {
    expect(at(2, { shadowed: true }).hemiI).toBeCloseTo(NIGHT.hemiI * READABILITY.fill * READABILITY.shadowFill, 5);
    expect(at(12, { shadowed: true }).hemiI).toBeCloseTo(at(12).hemiI, 6);
  });

  it('leaves the day alone and changes without a jump across the whole clock', () => {
    const day = at(12), base = raw(12);
    expect(day.hemiI).toBeCloseTo(base.hemiI, 6);
    expect(day.hemiGround).toEqual(base.hemiGround);
    expect(day.keyI).toBe(base.keyI);
    expect(day.wetDark).toBe(1);
    for (const shadowed of [false, true]) {
      let last = at(0, { shadowed });
      for (let h = 0.05; h <= 24; h += 0.05) {
        const v = at(h, { shadowed });
        expect(Math.abs(v.hemiI - last.hemiI)).toBeLessThan(0.08);
        expect(Math.abs(v.keyI - last.keyI)).toBeLessThan(0.12);
        last = v;
      }
    }
  });

  it('the darkest hours were dusk and dawn in a storm: the key light has a floor there', () => {
    // As authored: 19:00 has the weakest key of the cycle, and rain dims it further.
    const weakest = KEYFRAMES.reduce((a, b) => (a[1].keyI < b[1].keyI ? a : b));
    expect(weakest[0]).toBe(19);
    expect(raw(19).keyI).toBeLessThan(1.1);
    for (const h of [19, 19.5, 5, 5.5]) {
      expect(at(h).keyI).toBeGreaterThanOrEqual(READABILITY.keyFloor * at(h).dark - 1e-9);
      expect(at(h).keyI).toBeGreaterThan(1.3);
    }
    // The moon and the sun themselves are not touched.
    expect(at(2).keyI).toBe(raw(2).keyI);
    expect(at(12).keyI).toBe(raw(12).keyI);
  });

  it('never ends up darker than the frame it started from, at any hour in any weather', () => {
    for (const w of [STORM, CLEAR, FOG, SNOW]) {
      for (let h = 0; h < 24; h += 0.25) {
        const a = raw(h, w), b = at(h, { w });
        expect(b.hemiI).toBeGreaterThanOrEqual(a.hemiI - 1e-9);
        expect(b.keyI).toBeGreaterThanOrEqual(a.keyI - 1e-9);
        expect(luma(b.hemiGround)).toBeGreaterThanOrEqual(luma(a.hemiGround) - 1e-9);
      }
    }
  });

  it('weather never stacks darkening on the night: wet streets keep their tone after dark', () => {
    expect(at(2).wetDark).toBeCloseTo(READABILITY.wetDark, 6);
    expect(at(2).wetDark).toBeLessThan(0.5);
    expect(at(19).wetDark).toBeLessThan(0.5);
    // No weather makes the night fill dimmer than a clear night's.
    const clear = at(2, { w: CLEAR }).hemiI;
    for (const w of [STORM, FOG, SNOW, { cloud: 0.8, fog: 0.2, rain: 0.4, snow: 0 }]) expect(at(2, { w }).hemiI).toBeGreaterThanOrEqual(clear - 1e-9);
  });

  it('the rim light, the fog and the sky are not touched', () => {
    const a = raw(2), b = at(2);
    for (const k of ['rimI', 'fogMul', 'lamps', 'windows']) expect(b[k]).toBe(a[k]);
    for (const k of ['key', 'rim', 'fog', 'skyTop', 'skyHorizon', 'water']) expect(b[k]).toEqual(a[k]);
  });

  it('indoors the fill is stronger and warm-neutral at any hour; under a deck likewise, cooler', () => {
    const out = at(2), room = at(2, { indoor: 1 }), deck = at(2, { cover: 1 });
    expect(room.hemiI).toBeCloseTo(out.hemiI * READABILITY.indoorFill, 5);
    expect(luma(room.hemiGround)).toBeGreaterThan(luma(out.hemiGround));
    expect(deck.hemiI).toBeCloseTo(out.hemiI * READABILITY.coverFill, 5);
    expect(luma(deck.hemiGround)).toBeGreaterThan(luma(out.hemiGround));
    expect(at(12, { indoor: 1 }).hemiI).toBeGreaterThan(at(12).hemiI);
    expect(at(12, { cover: 1 }).hemiI).toBeGreaterThan(at(12).hemiI);
    // Clamped, and a room under a deck is a room.
    expect(at(2, { indoor: 5 }).hemiI).toBeCloseTo(room.hemiI, 6);
    expect(at(2, { indoor: 1, cover: 1 }).hemiI).toBeCloseTo(room.hemiI, 6);
  });

  it('costs nothing per pixel: no tier gains a light, and the system only writes existing properties', () => {
    // The pool sizes the perf budget was recorded with.
    expect(TIERS.map((t) => getQuality(t).lights)).toEqual([0, 2, 4, 6, 8]);
    const env = read('src/env/envSystem.js');
    expect(env).toMatch(/applyReadability\(look, indoor, cover, !!quality\.shadows\)/);
    expect(env).not.toMatch(/new THREE\.(PointLight|SpotLight|DirectionalLight|AmbientLight|HemisphereLight)/);
    const world = read('src/game/world.js');
    expect(world.match(/new THREE\.(DirectionalLight|HemisphereLight)/g)).toHaveLength(3); // hemi, moon, rim: as before
    expect(world).not.toMatch(/new THREE\.(PointLight|SpotLight|AmbientLight)/);
  });

  it('the fear and heat screen grades do not use contrast() (it crushes a night frame)', () => {
    const fx = read('src/story/viewFx.js');
    const filters = fx.slice(fx.indexOf('const FILTERS'), fx.indexOf('export function createViewFx'));
    expect(filters.replace(/\/\/.*$/gm, '')).not.toMatch(/contrast\(/);
  });
});
