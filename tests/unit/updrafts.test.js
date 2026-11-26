import { describe, it, expect } from 'vitest';
import { updraftAt, steamUpdrafts, createUpdraftField, LAKE_BAND } from '../../src/traversal/updrafts.js';

describe('updrafts', () => {
  const col = { kind: 'column', x: 0, z: 0, r: 8, y0: 0, top: 50, strength: 10 };
  it('a column lifts most at its centre, fading out to its rim and its top', () => {
    expect(updraftAt([col], 0, 10, 0)).toBeCloseTo(10);
    expect(updraftAt([col], 6, 10, 0)).toBeLessThan(6);
    expect(updraftAt([col], 9, 10, 0)).toBe(0);
    expect(updraftAt([col], 0, 45, 0)).toBeLessThan(5);
    expect(updraftAt([col], 0, 51, 0)).toBe(0);
  });
  it('the lakefront band lifts along the seawall', () => {
    expect(updraftAt([LAKE_BAND], LAKE_BAND.x0, 20, -400)).toBeGreaterThan(3);
    expect(updraftAt([LAKE_BAND], LAKE_BAND.x0 - 40, 20, -400)).toBe(0);
  });
  it('only real stacks become columns, and the field finds them', () => {
    const zones = steamUpdrafts([{ x: 100, y: 30, z: 100, s: 1.5 }, { x: 0, y: 0, z: 0, s: 0.4 }, { x: 50, y: 0, z: 50, s: 2, vent: true }]);
    expect(zones.length).toBe(1);
    const f = createUpdraftField(zones);
    expect(f.at(100, 40, 100)).toBeGreaterThan(5);
    expect(f.at(0, 5, 0)).toBe(0);
    f.add([col]);
    expect(f.at(0, 5, 0)).toBeGreaterThan(5);
  });
});
