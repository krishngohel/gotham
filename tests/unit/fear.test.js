import { describe, it, expect } from 'vitest';
import { createFear, createReputation, FEAR_STATES } from '../../src/enemies/fear.js';
import { createRng } from '../../src/core/rng.js';

const squadOf = (n, rng = createRng(1), o = {}) => {
  const f = createFear({ rng, ...o });
  for (let i = 0; i < n; i++) f.join('g' + i, { base: 0.5 });
  return f;
};

describe('fear', () => {
  it('starts calm and steady', () => {
    const f = squadOf(4);
    expect(f.squad).toBeLessThan(0.1);
    expect(f.decide('g0')).toBe('steady');
  });
  it('silent takedowns and KOs witnessed raise the witnesses most', () => {
    const f = squadOf(4);
    f.note('silentTakedown', { witnesses: ['g1'] });
    expect(f.fearOf('g1')).toBeGreaterThan(f.fearOf('g2'));
    expect(f.squad).toBeGreaterThan(0);
  });
  it('a long combo scares the squad; a short one does not', () => {
    const a = squadOf(3), b = squadOf(3);
    a.note('combo', { n: 4 });
    b.note('combo', { n: 25 });
    expect(a.squad).toBe(0);
    expect(b.squad).toBeGreaterThan(0.2);
  });
  it('the last man standing, after a rout, surrenders or flees', () => {
    const f = squadOf(5, createRng(3));
    for (let i = 1; i < 5; i++) { f.note('ko', { witnesses: ['g0'] }); f.leave('g' + i); }
    f.note('lastStanding', { id: 'g0' });
    const s = f.decide('g0', { alone: true, armed: true });
    expect(['surrender', 'flee']).toContain(s);
  });
  it('hurting the hero, a revive and reinforcements steady the squad', () => {
    const f = squadOf(3);
    f.note('gadgetFromDark', {});
    const before = f.squad;
    f.note('reinforcements');
    f.note('heroHurt');
    expect(f.squad).toBeLessThan(before);
  });
  it('a lieutenant nearby keeps a wavering goon in the fight', () => {
    const states = (lt) => {
      const f = squadOf(3, createRng(7));
      for (let i = 0; i < 3; i++) f.note('silentTakedown', { witnesses: ['g0'] });
      return Array.from({ length: 20 }, () => f.decide('g0', { lieutenant: lt }));
    };
    const calm = (arr) => arr.filter((s) => s === 'steady' || s === 'hesitant').length;
    expect(calm(states(true))).toBeGreaterThanOrEqual(calm(states(false)));
  });
  it('decays toward a floor set by how the fight has gone', () => {
    const f = squadOf(4);
    f.note('gadgetFromDark', {});
    f.note('gadgetFromDark', {});
    const peak = f.squad;
    for (let i = 0; i < 600; i++) f.tick(1 / 60);
    expect(f.squad).toBeLessThan(peak);
    const g = squadOf(4);
    for (let i = 1; i < 4; i++) g.leave('g' + i);
    for (let i = 0; i < 3000; i++) g.tick(1 / 60);
    expect(g.squad).toBeGreaterThan(0.2);
  });
  it('is deterministic given the rng', () => {
    const run = () => {
      const f = squadOf(3, createRng(11));
      f.note('silentTakedown', { witnesses: ['g0', 'g1'] });
      f.note('lastStanding', { id: 'g0' });
      return [f.decide('g0', { alone: true }), f.decide('g1'), f.decide('g2')];
    };
    expect(run()).toEqual(run());
  });
  it('gives effect numbers for every state', () => {
    const f = squadOf(1);
    for (const s of FEAR_STATES) expect(f.effects(s)).toHaveProperty('windupDelay');
    expect(f.effects('surrender').attack).toBe(false);
    expect(f.effects('nonsense')).toBe(f.effects('steady'));
  });
  it('a feared Bat starts new squads more scared', () => {
    const f = squadOf(2, createRng(1), { bias: 0.8 });
    expect(f.fearOf('g0')).toBeGreaterThan(0.3);
  });
});

describe('reputation', () => {
  it('starts at 50 with no bias and moves with deeds', () => {
    const r = createReputation();
    expect(r.value).toBe(50);
    expect(r.fearBias()).toBe(0);
    r.add('silentTakedown', 10);
    r.add('fightWon', 5);
    expect(r.value).toBeGreaterThan(55);
    expect(r.fearBias()).toBeGreaterThan(0);
  });
  it('tracks gangs separately and faster', () => {
    const r = createReputation();
    r.add('fightWon', 3, 'penguin');
    expect(r.gangs.penguin - 50).toBeGreaterThan(r.value - 50);
    expect(r.fearBias('penguin')).toBeGreaterThan(r.fearBias());
  });
  it('clamps and round-trips through JSON', () => {
    const r = createReputation({ value: 99 });
    r.add('points', 50);
    expect(r.value).toBe(100);
    r.add('heroDown', 1, 'joker');
    const back = createReputation(JSON.parse(JSON.stringify(r)));
    expect(back.value).toBe(r.value);
    expect(back.gangs).toEqual(r.gangs);
    expect(createReputation({ value: 'junk' }).value).toBe(50);
  });
});
