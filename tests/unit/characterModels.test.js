import { describe, it, expect } from 'vitest';
import { SUITS, SUIT_IDS, isSuitId, suitById, suitsFor, suitUnlocked } from '../../src/heroes/models/suits.js';
import { civilianSpec, CIVILIAN_TYPES, rng } from '../../src/actors/civilians/generator.js';
import { cutKey } from '../../src/actors/civilians/wardrobe.js';
import { COSTUMES } from '../../src/heroes/models/costumes.js';
import { ribbonGlyph } from '../../src/heroes/models/superman.js';
import { ENEMY_ROLES, GANGS } from '../../src/heroes/models/enemies.js';

const lm = {
  fwd: 1, neckY: 1.5, headCenter: { x: 0, y: 1.66, z: 0.02 }, headRadius: 0.1, headTop: 1.8, eyeY: 1.68, eyeSpread: 0.032,
  shoulderX: 0.2, elbowX: 0.5, kneeY: 0.5, ankleY: 0.1, beltY: 1.0, hipHalfWidth: 0.22, chestY: 1.35, chestFrontZ: 0.12,
};
const bones = { hand_l: { x: 0.7, y: 1.45, z: 0 }, lowerarm_l: { x: 0.46, y: 1.45, z: 0 }, thigh_l: { x: 0.1, y: 0.95, z: 0 } };
const B = (n) => bones[n] ?? { x: 0, y: 1, z: 0 };

describe('suit table', () => {
  it('keeps the three original save ids and adds at least six Batman alternates', () => {
    for (const id of ['m', 'f', 'gold']) expect(isSuitId(id)).toBe(true);
    expect(suitsFor('batman').length).toBeGreaterThanOrEqual(9);
    expect(suitsFor('nightwing').length).toBe(3);
    expect(suitsFor('robin').length).toBe(3);
    expect(new Set(SUIT_IDS).size).toBe(SUIT_IDS.length);
  });
  it('falls back to the grey suit for unknown, empty or non-string ids', () => {
    for (const bad of ['z', '', null, undefined, 42, {}, 'M']) {
      expect(isSuitId(bad)).toBe(false);
      expect(suitById(bad).id).toBe('m');
    }
  });
  it('every Batman suit but Batwoman has a full palette, and unlock tests read progress safely', () => {
    for (const s of suitsFor('batman').filter((x) => x.id !== 'f')) {
      for (const k of ['suit', 'dark', 'accent', 'emblem', 'line', 'cape', 'lens', 'skin']) expect(typeof s.look.palette[k], `${s.id}.${k}`).toBe('number');
    }
    for (const s of SUITS) {
      expect(typeof suitUnlocked(s, {})).toBe('boolean');
      expect(typeof suitUnlocked(s, null)).toBe('boolean');
      if (s.unlock) expect(s.unlock.text.length).toBeGreaterThan(5);
    }
    expect(suitUnlocked(suitById('gold'), { goldUnlocked: true })).toBe(true);
    expect(suitUnlocked(suitById('gold'), { goldUnlocked: false })).toBe(false);
    expect(suitUnlocked(suitById('armoured'), { finished: true })).toBe(true);
  });
});

describe('civilian generator', () => {
  it('gives the same person for the same seed', () => {
    const a = civilianSpec(1234), b = civilianSpec(1234);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(cutKey(a.body, a.build, a.cut)).toBe(cutKey(b.body, b.build, b.cut));
  });
  it('varies across seeds and covers every type and both bodies', () => {
    const types = new Set(), bodies = new Set(), keys = new Set();
    for (let s = 0; s < 400; s++) { const c = civilianSpec(s); types.add(c.type); bodies.add(c.body); keys.add(cutKey(c.body, c.build, c.cut)); }
    expect(types.size).toBe(Object.keys(CIVILIAN_TYPES).length);
    expect(bodies.size).toBe(2);
    expect(keys.size).toBeGreaterThan(40);
  });
  it('fills every region a cut can paint', () => {
    for (const type of Object.keys(CIVILIAN_TYPES)) {
      const c = civilianSpec(7, { type });
      for (const k of ['skin', 'hair', 'top', 'bottom', 'shoes', 'eyeWhite', 'iris']) expect(c.palette[k], `${type}.${k}`).toBeTypeOf('number');
      expect(c.height).toBeGreaterThan(0.8);
      expect(c.height).toBeLessThan(1.15);
    }
  });
  it('rng is deterministic and in [0, 1)', () => {
    const r1 = rng(9), r2 = rng(9);
    for (let i = 0; i < 50; i++) { const v = r1.next(); expect(v).toBe(r2.next()); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('costume region maps', () => {
  it('only name regions that have a colour', () => {
    const pts = [];
    for (let y = 0.02; y < 1.85; y += 0.06) for (let x = -0.75; x <= 0.75; x += 0.05) for (const z of [-0.1, 0.12]) pts.push({ x, y, z });
    for (const [id, cos] of Object.entries(COSTUMES)) {
      for (const p of pts) for (const n of [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }]) {
        const r = cos.region(p, n, lm, B);
        expect(cos.colors[r], `${id}: ${r}`).toBeTypeOf('number');
      }
    }
  });
  it('the chest glyph is a closed band polygon', () => {
    const g = ribbonGlyph();
    expect(g.length).toBe(16);
    for (const [x, y] of g) { expect(Math.abs(x)).toBeLessThan(0.07); expect(Math.abs(y)).toBeLessThan(0.07); }
  });
});

describe('enemy roles', () => {
  it('covers the research roles and gives every gang a head piece', () => {
    expect(ENEMY_ROLES).toEqual(['shield', 'baton', 'heavy', 'gunner', 'sniper', 'ninja', 'medic', 'lieutenant']);
    for (const g of Object.values(GANGS)) { expect(g.head).toBeTypeOf('string'); expect(g.outer).toBeTypeOf('number'); }
  });
});
