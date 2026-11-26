import { describe, it, expect } from 'vitest';
import { composeWave, waveCost, ROLE_COST, ACT_ROLES, BASE_ROLES, RANGED, rolesForAct } from '../../src/enemies/compose.js';
import { ENEMY } from '../../src/combat/rules.js';
import { createRng } from '../../src/core/rng.js';

const many = (o, n = 60) => Array.from({ length: n }, (_, i) => composeWave({ rng: createRng(100 + i), ...o }));
const minCost = Math.min(...Object.values(ROLE_COST));

describe('composeWave', () => {
  it('is deterministic for a seed', () => {
    const a = composeWave({ budget: 10, act: 4, rng: createRng(9) });
    const b = composeWave({ budget: 10, act: 4, rng: createRng(9) });
    expect(a).toEqual(b);
  });
  it('respects the budget', () => {
    for (const w of many({ budget: 9, act: 5, difficulty: 'hard' })) expect(waveCost(w.list)).toBeLessThanOrEqual(9 + minCost);
  });
  it('act 1 uses only the story types', () => {
    for (const w of many({ budget: 12, act: 1, difficulty: 'knightmare' })) for (const e of w.list) expect(BASE_ROLES).toContain(e.type);
  });
  it('uses at most one role new to its act, and nothing from later acts', () => {
    for (const act of [2, 3, 4, 5]) {
      const allowed = new Set(rolesForAct(act));
      for (const w of many({ budget: 14, act, difficulty: 'knightmare' })) {
        const fresh = new Set(w.list.map((e) => e.type).filter((t) => ACT_ROLES[act].includes(t)));
        expect(fresh.size).toBeLessThanOrEqual(1);
        for (const e of w.list) expect(allowed.has(e.type)).toBe(true);
      }
    }
  });
  it('caps ranged at 2, one lieutenant with 4+ others, a medic only with 3+ others', () => {
    for (const w of many({ budget: 16, act: 5, difficulty: 'knightmare' }, 120)) {
      const types = w.list.map((e) => e.type);
      expect(types.filter((t) => RANGED.has(t)).length).toBeLessThanOrEqual(2);
      const lts = types.filter((t) => t === 'lieutenant').length;
      expect(lts).toBeLessThanOrEqual(1);
      if (lts) expect(types.length - 1).toBeGreaterThanOrEqual(4);
      if (types.includes('medic')) expect(types.length - 1).toBeGreaterThanOrEqual(3);
    }
    for (const w of many({ budget: 4, act: 5, difficulty: 'knightmare' })) {
      expect(w.list.some((e) => e.type === 'lieutenant')).toBe(false);
    }
  });
  it('co-op grows the squad, not its health', () => {
    const one = many({ budget: 8, act: 3 }).reduce((s, w) => s + w.list.length, 0);
    const two = many({ budget: 8, act: 3, players: 2 }).reduce((s, w) => s + w.list.length, 0);
    expect(two).toBeGreaterThan(one * 1.3);
    for (const w of many({ budget: 8, act: 3, players: 2 })) expect(waveCost(w.list)).toBeLessThanOrEqual(12 + minCost);
  });
  it('harder difficulty leans toward specials', () => {
    const share = (difficulty) => {
      const ws = many({ budget: 10, act: 4, difficulty }, 100);
      const all = ws.flatMap((w) => w.list);
      return all.filter((e) => e.type !== 'grunt').length / all.length;
    };
    expect(share('hard')).toBeGreaterThan(share('story'));
  });
  it('every type it returns is a real enemy definition', () => {
    for (const w of many({ budget: 14, act: 5, difficulty: 'hard' })) for (const e of w.list) expect(ENEMY[e.type]).toBeTruthy();
  });
  it('picks the district gang, or the one asked for', () => {
    expect(composeWave({ budget: 3, rng: createRng(1) }).gang).toBe('joker');
    expect(composeWave({ budget: 3, district: 'narrows', rng: createRng(1) }).gang).toBe('scarecrow');
    expect(composeWave({ budget: 3, district: 'narrows', gang: 'penguin', rng: createRng(1) }).gang).toBe('penguin');
    expect(composeWave({ budget: 3, district: 'nowhere', rng: createRng(1) }).gang).toBe('joker');
  });
  it('an empty budget is an empty wave', () => {
    expect(composeWave({ budget: 0, rng: createRng(1) }).list).toEqual([]);
  });
});
