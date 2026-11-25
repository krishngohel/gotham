import { describe, it, expect } from 'vitest';
import { pickTarget, nearestPlayer, isDowned } from '../../src/players/targeting.js';

const P = (id, x, z, o = {}) => ({ id, hero: { pos: { x, y: 0, z }, dead: false, ...o } });
const E = (x, z, o = {}) => ({ pos: { x, y: 0, z }, aggro: null, lastHitBy: null, ...o });

describe('nearestPlayer', () => {
  it('picks the closest standing player', () => {
    const a = P(0, 0, 0), b = P(1, 10, 0);
    expect(nearestPlayer({ x: 8, z: 0 }, [a, b])).toBe(b);
    expect(nearestPlayer({ x: 1, z: 0 }, [a, b])).toBe(a);
  });
  it('skips downed players, unless nobody is standing', () => {
    const a = P(0, 0, 0, { dead: true }), b = P(1, 10, 0);
    expect(nearestPlayer({ x: 1, z: 0 }, [a, b])).toBe(b);
    b.hero.dead = true;
    expect(nearestPlayer({ x: 1, z: 0 }, [a, b])).toBe(a);
    expect(nearestPlayer({ x: 1, z: 0 }, [])).toBe(null);
  });
});

describe('pickTarget', () => {
  it('one player: always that player, downed or not (single-player is unchanged)', () => {
    const a = P(0, 0, 0, { dead: true });
    expect(pickTarget(E(5, 5), [a])).toBe(a);
  });
  it('distance decides between two fresh heroes', () => {
    const a = P(0, 0, 0), b = P(1, 10, 0);
    expect(pickTarget(E(2, 0), [a, b])).toBe(a);
    expect(pickTarget(E(8, 0), [a, b])).toBe(b);
  });
  it('turns on whoever hit it last, even a little farther away', () => {
    const a = P(0, 0, 0), b = P(1, 6, 0);
    expect(pickTarget(E(2.5, 0), [a, b])).toBe(a);
    expect(pickTarget(E(2.5, 0, { lastHitBy: b }), [a, b])).toBe(b);
  });
  it('sticks to its current target unless another is clearly better', () => {
    const a = P(0, 0, 0), b = P(1, 6, 0);
    expect(pickTarget(E(3.4, 0, { aggro: a }), [a, b])).toBe(a);
    expect(pickTarget(E(5, 0, { aggro: a }), [a, b])).toBe(b);
  });
  it('spreads attackers: a crowded player loses the tie to a free one', () => {
    const a = P(0, 0, 0), b = P(1, 4, 0);
    const counts = new Map([[a, 3], [b, 0]]);
    const load = (p) => counts.get(p);
    // Nearer to a, but a already has three on him.
    expect(pickTarget(E(1.5, 0), [a, b])).toBe(a);
    expect(pickTarget(E(1.5, 0), [a, b], { load })).toBe(b);
  });
  it('spreading a squad: assigning one by one splits them across both heroes', () => {
    const a = P(0, 0, 0), b = P(1, 3, 0);
    const counts = new Map([[a, 0], [b, 0]]);
    const load = (p) => counts.get(p);
    const squad = [E(1, 1), E(1, -1), E(0.5, 2), E(1.2, 0.5)];
    for (const e of squad) { const t = pickTarget(e, [a, b], { load }); e.aggro = t; counts.set(t, counts.get(t) + 1); }
    expect(counts.get(a)).toBeGreaterThan(0);
    expect(counts.get(b)).toBeGreaterThan(0);
  });
  it('ignores downed and away players; if all are down it keeps who it had', () => {
    const a = P(0, 0, 0, { dead: true }), b = P(1, 20, 0);
    expect(pickTarget(E(1, 0, { aggro: a }), [a, b])).toBe(b);
    const c = { ...P(2, 0, 0), away: true };
    expect(isDowned(c)).toBe(true);
    expect(pickTarget(E(1, 0), [c, b])).toBe(b);
    b.hero.dead = true;
    expect(pickTarget(E(1, 0, { aggro: b }), [a, b])).toBe(b);
    expect(pickTarget(E(1, 0), [a, b])).toBe(a);
  });
});
