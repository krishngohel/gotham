import { describe, it, expect } from 'vitest';
import { createSquadPlanner, flankScore, shouldSteal, RINGS } from '../../src/enemies/squad.js';

const enemy = (id, x, z, o = {}) => ({ id, x, z, targetKey: 'p0', ranged: false, holdsToken: false, nextInLine: false, alive: true, role: 'grunt', ...o });
const distTo = (e, p) => Math.hypot(e.slotX - p.x, e.slotZ - p.z);

describe('squad rings and slots', () => {
  const p = { key: 'p0', x: 0, z: 0, yaw: 0 };
  it('puts token holders on the inner ring, ranged on the ranged ring, the rest outside', () => {
    const planner = createSquadPlanner();
    const list = [enemy('a', 0, 5, { holdsToken: true }), enemy('b', 3, 3), enemy('g', -8, 8, { ranged: true })];
    planner.plan([p], list);
    expect(list[0].ring).toBe('inner');
    expect(distTo(list[0], p)).toBeGreaterThanOrEqual(RINGS.inner.min);
    expect(distTo(list[0], p)).toBeLessThanOrEqual(RINGS.inner.max);
    expect(list[1].ring).toBe('outer');
    expect(distTo(list[1], p)).toBeGreaterThanOrEqual(RINGS.outer.min);
    expect(list[2].ring).toBe('ranged');
    expect(distTo(list[2], p)).toBeGreaterThanOrEqual(RINGS.ranged.min);
  });
  it('never gives two enemies the same slot', () => {
    const planner = createSquadPlanner({ innerSlots: 6 });
    const list = Array.from({ length: 5 }, (_, i) => enemy('e' + i, 0.1 * i, 4, { holdsToken: true }));
    planner.plan([p], list);
    const seen = new Set(list.map((e) => e.slotIndex));
    expect(seen.size).toBe(5);
  });
  it('keeps a holder on its own side (small angle change)', () => {
    const planner = createSquadPlanner();
    const e = enemy('a', 5, 0, { holdsToken: true });
    planner.plan([p], [e]);
    expect(e.slotX).toBeGreaterThan(1);
  });
  it('sends the next in line round behind the player', () => {
    const planner = createSquadPlanner();
    const front = enemy('a', 0, 4, { holdsToken: true });
    const next = enemy('b', 0.5, 4, { nextInLine: true });
    planner.plan([{ ...p, yaw: 0 }], [front, next]);
    expect(next.slotZ).toBeLessThan(0);
  });
  it('plans each enemy around its own target player', () => {
    const planner = createSquadPlanner();
    const p1 = { key: 'p1', x: 50, z: 0, yaw: 0 };
    const a = enemy('a', 1, 3, { holdsToken: true }), b = enemy('b', 51, 3, { holdsToken: true, targetKey: 'p1' });
    planner.plan([p, p1], [a, b]);
    expect(distTo(a, p)).toBeLessThan(3);
    expect(distTo(b, p1)).toBeLessThan(3);
  });
  it('skips the dead and leaves them alone', () => {
    const planner = createSquadPlanner();
    const d = enemy('d', 1, 1, { alive: false });
    planner.plan([p], [d]);
    expect(d.ring).toBeUndefined();
  });
});

describe('flankScore and shouldSteal', () => {
  it('is 0 ahead and 1 behind', () => {
    expect(flankScore(0, 0)).toBeCloseTo(0);
    expect(flankScore(Math.PI, 0)).toBeCloseTo(1);
    expect(flankScore(Math.PI / 2, 0)).toBeCloseTo(0.5);
  });
  it('lets an inner-ring enemy take the token of a far holder only', () => {
    expect(shouldSteal({ holdsToken: true, dist: 6 }, { holdsToken: false, ring: 'inner', dist: 2.2 })).toBe(true);
    expect(shouldSteal({ holdsToken: true, dist: 3 }, { holdsToken: false, ring: 'inner', dist: 2.2 })).toBe(false);
    expect(shouldSteal({ holdsToken: true, dist: 6 }, { holdsToken: false, ring: 'outer', dist: 5 })).toBe(false);
    expect(shouldSteal({ holdsToken: false, dist: 6 }, { holdsToken: false, ring: 'inner', dist: 2 })).toBe(false);
  });
});
