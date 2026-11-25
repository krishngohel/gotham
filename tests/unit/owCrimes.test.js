import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/core/rng.js';
import { CRIME_TYPES, CRIME_TYPE_IDS, LEGACY_KINDS, TWISTS, TIERS, composeCrime, pickTwists, typeFits, tierOfHeat, rewardsFor, crimeType } from '../../src/openworld/crimeTypes.js';
import { createObjective, LEAF_KINDS } from '../../src/openworld/objectives.js';
import { ENEMY } from '../../src/combat/rules.js';
import { GANGS as LOOKS } from '../../src/heroes/models/enemies.js';
import { GANGS, DISTRICT_GANGS, lookOf, startingControl } from '../../src/openworld/gangs.js';
import { DISTRICT_IDS, REGION_CRIME_SPOTS } from '../../src/world/regions/data.js';
import { CRIME_ALERTS } from '../../src/audio/barks/lines.js';
import { CRIME_KINDS, CRIME_SPOTS } from '../../src/game/crimes.js';

// A stand-in for the runtime's world queries: straight streets and a row of roofs.
export const stubGeo = {
  streetPath: (from, len) => [{ x: from.x, y: from.y ?? 0, z: from.z }, { x: from.x + len * 0.6, y: from.y ?? 0, z: from.z }, { x: from.x + len * 0.6, y: from.y ?? 0, z: from.z + len * 0.4 }],
  roofPath: (from, hops) => Array.from({ length: hops + 1 }, (_, i) => ({ x: from.x + i * 14, y: 12, z: from.z, hop: i > 0 && i % 2 === 0 })),
  roofsNear: (at, n) => Array.from({ length: n }, (_, i) => ({ x: at.x + 20 * Math.cos(i), y: 18, z: at.z + 20 * Math.sin(i) })),
  train: () => 'loopOuter0',
  bridge: (at) => ({ id: 'b1', house: { x: at.x, y: 0, z: at.z }, car: { x: at.x + 8, y: 0, z: at.z } }),
};
const spot = { id: 'test', district: 'loop', x: 10, y: 0, z: -400, yaw: 0 };
const leavesOf = (spec) => (spec.parts ? spec.parts.flatMap(leavesOf) : [spec]);

describe('crime types (data)', () => {
  it('has at least 20 distinct types, unique ids, every one composable', () => {
    expect(CRIME_TYPES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(CRIME_TYPE_IDS).size).toBe(CRIME_TYPE_IDS.length);
  });
  it('keeps the old kinds as v2 types (saves, tests and the dev hook)', () => {
    for (const k of CRIME_KINDS) expect(LEGACY_KINDS).toContain(k);
  });
  it('every type names real districts, a dispatch alert, allowed twists, a heat band, a depth and a co-op split', () => {
    for (const t of CRIME_TYPES) {
      if (t.districts) for (const d of t.districts) expect(DISTRICT_IDS, `${t.id} ${d}`).toContain(d);
      expect(CRIME_ALERTS[t.alert] ?? CRIME_ALERTS.generic).toBeTruthy();
      expect(Object.keys(CRIME_ALERTS).concat('generic')).toContain(t.alert);
      for (const tw of t.twists) expect(TWISTS[tw], `${t.id} ${tw}`).toBeTruthy();
      expect(t.heat[0]).toBeLessThanOrEqual(t.heat[1]);
      expect(['deep', 'medium', 'thin']).toContain(t.depth);
      expect(t.coop.length).toBeGreaterThan(10);
    }
  });
  it('every type composes, at every tier, into objectives built only from known leaves', () => {
    for (const t of CRIME_TYPES) {
      const district = t.districts?.[0] ?? 'loop';
      for (let tier = 0; tier < 4; tier++) {
        const plan = composeCrime(t.id, { spot: { ...spot, district }, rng: createRng(tier + 3), geo: stubGeo, tier, players: 1, act: 3, control: startingControl(district) });
        expect(plan, t.id).toBeTruthy();
        for (const l of leavesOf(plan.objective)) expect(LEAF_KINDS, `${t.id} ${l.kind}`).toContain(l.kind);
        expect(() => createObjective(plan.objective, createRng(1))).not.toThrow();
        for (const w of plan.squad) for (const e of w) {
          expect(ENEMY[e.type], `${t.id} ${e.type}`).toBeTruthy();
          expect(LOOKS[e.look], `${t.id} ${e.look}`).toBeTruthy();
        }
        expect(plan.reward.xp).toBeGreaterThan(0);
      }
    }
  });
  it('the 20+ types use at least 12 different objective modules between them', () => {
    const used = new Set();
    for (const t of CRIME_TYPES) {
      const plan = composeCrime(t.id, { spot: { ...spot, district: t.districts?.[0] ?? 'loop' }, rng: createRng(5), geo: stubGeo, tier: 1 });
      for (const l of leavesOf(plan.objective)) used.add(l.kind);
      if (plan.escalate) for (const l of leavesOf(plan.escalate)) used.add(l.kind);
    }
    expect(used.size).toBeGreaterThanOrEqual(12);
  });
  it('gang data: every district has owners, every gang has a goon look', () => {
    for (const d of DISTRICT_IDS) expect(DISTRICT_GANGS[d]?.length, d).toBeGreaterThan(0);
    for (const g of Object.keys(GANGS)) expect(LOOKS[lookOf(g)], g).toBeTruthy();
    for (const d of DISTRICT_IDS) { const c = startingControl(d); expect(Object.values(c).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5); }
  });
  it('every crime spot sits in a district the types can use', () => {
    const spots = [...CRIME_SPOTS, ...REGION_CRIME_SPOTS];
    for (const s of spots) {
      const any = CRIME_TYPES.some((t) => typeFits(t, { district: s.district, heat: 1, hour: 23 }));
      expect(any, s.id).toBe(true);
    }
  });
});

describe('composition: objective x twist x place x escalation', () => {
  it('escalation tiers raise the budget, shorten the clocks and bring an elite at tier 3', () => {
    const low = composeCrime('robbery', { spot, rng: createRng(4), geo: stubGeo, tier: 0, twists: [] });
    const high = composeCrime('robbery', { spot, rng: createRng(4), geo: stubGeo, tier: 3 });
    const n = (p) => p.squad.flat().length;
    expect(n(high)).toBeGreaterThan(n(low));
    expect(high.twists).toContain('elite');
    expect(high.squad.flat().some((e) => e.elite)).toBe(true);
    expect(high.objective.parts?.[1]?.delay ?? high.objective.parts?.[0]?.parts?.[1]?.delay).toBeLessThan(low.objective.parts[1].delay);
    expect(TIERS.map((t) => t.tier)).toEqual([0, 1, 2, 3]);
    expect([0, 1.3, 2.6, 4].map(tierOfHeat)).toEqual([0, 1, 2, 3]);
  });
  it('twists change the plan: ambush and second wave add waves, a booby trap adds a defuse, police add an officer to cover', () => {
    const base = composeCrime('robbery', { spot, rng: createRng(1), geo: stubGeo, tier: 1, twists: [] });
    const amb = composeCrime('robbery', { spot, rng: createRng(1), geo: stubGeo, tier: 1, twists: ['ambush', 'secondWave'] });
    expect(amb.squad.length).toBe(base.squad.length + 2);
    expect(amb.squad.at(-1).every((e) => e.ambush)).toBe(true);
    const trap = composeCrime('robbery', { spot, rng: createRng(1), geo: stubGeo, tier: 1, twists: ['boobyTrap'] });
    expect(leavesOf(trap.objective).some((l) => l.kind === 'defuse')).toBe(true);
    const cops = composeCrime('robbery', { spot, rng: createRng(1), geo: stubGeo, tier: 1, twists: ['police'] });
    expect(leavesOf(cops.objective).some((l) => l.kind === 'protect' && l.officer && l.optional)).toBe(true);
  });
  it('a split twist gives each of two players a runner; co-op bombs come in pairs', () => {
    const one = composeCrime('footChase', { spot, rng: createRng(2), geo: stubGeo, tier: 0, twists: [] });
    const two = composeCrime('footChase', { spot, rng: createRng(2), geo: stubGeo, tier: 0, twists: ['split'] });
    expect(one.objective.runners.length).toBe(1);
    expect(two.objective.runners.length).toBe(2);
    const bombs1 = composeCrime('bomb', { spot, rng: createRng(2), geo: stubGeo, tier: 2, twists: [], players: 1 });
    const bombs2 = composeCrime('bomb', { spot, rng: createRng(2), geo: stubGeo, tier: 2, twists: [], players: 2 });
    const defuse = (p) => leavesOf(p.objective).find((l) => l.kind === 'defuse');
    expect(defuse(bombs1).bombs.length).toBe(1);
    expect(defuse(bombs2).bombs.length).toBe(2);
  });
  it('co-op adds goons (composeWave x1.5), never health', () => {
    const a = composeCrime('gangWar', { spot, rng: createRng(9), geo: stubGeo, tier: 2, twists: [], players: 1 });
    const b = composeCrime('gangWar', { spot, rng: createRng(9), geo: stubGeo, tier: 2, twists: [], players: 2 });
    expect(b.squad.flat().length).toBeGreaterThan(a.squad.flat().length);
  });
  it('a gang war fields two gangs on opposite sides of the street', () => {
    const p = composeCrime('gangWar', { spot, rng: createRng(3), geo: stubGeo, tier: 2, twists: [], control: { triad: 0.6, odessaMob: 0.4 } });
    expect(p.gangs).toEqual(['triad', 'odessaMob']);
    const gs = new Set(p.squad[0].map((e) => e.gang));
    expect(gs.size).toBe(2);
    expect(p.objective.gangs).toEqual(['triad', 'odessaMob']);
  });
  it('cocky gangs (high heat, low fear) roll ambushes far more often', () => {
    const t = crimeType('robbery');
    let calm = 0, cocky = 0;
    for (let s = 1; s <= 300; s++) {
      if (pickTwists(t, { tier: 1, rng: createRng(s), cocky: 0 }).includes('ambush')) calm++;
      if (pickTwists(t, { tier: 1, rng: createRng(s), cocky: 1 }).includes('ambush')) cocky++;
    }
    expect(cocky).toBeGreaterThan(calm * 1.8);
  });
  it('weather and time gate types and twists', () => {
    expect(typeFits(crimeType('rooftopChase'), { district: 'narrows', heat: 2, hour: 12 })).toBe(false);
    expect(typeFits(crimeType('rooftopChase'), { district: 'narrows', heat: 2, hour: 23, weather: 'storm' })).toBe(false);
    expect(typeFits(crimeType('rooftopChase'), { district: 'narrows', heat: 2, hour: 23 })).toBe(true);
    expect(typeFits(crimeType('bomb'), { district: 'loop', heat: 1, hour: 23 })).toBe(false);
    const t = crimeType('van');
    for (let s = 1; s < 50; s++) expect(pickTwists(t, { tier: 3, rng: createRng(s), weather: 'clear' })).not.toContain('storm');
  });
  it('places: the El hijack rides a train, a bridge standoff needs a bridge, prison break is at Blackgate', () => {
    expect(composeCrime('elHijack', { spot, rng: createRng(1), geo: stubGeo, tier: 1 }).train).toBe('loopOuter0');
    expect(composeCrime('bridgeStandoff', { spot, rng: createRng(1), geo: { ...stubGeo, bridge: () => null }, tier: 1 })).toBe(null);
    expect(crimeType('prisonBreak').districts).toEqual(['blackgate']);
    expect(crimeType('asylumRiot').districts).toEqual(['arkham']);
  });
});

describe('rewards by performance', () => {
  const plan = { reward: { xp: 100 } };
  it('saves, arrests, silence and speed raise it; hurt and collateral lower it', () => {
    const clean = rewardsFor(plan, { saved: 2, silent: 1, caught: 1 }, { arrests: 3, time: 40 });
    const messy = rewardsFor(plan, { hurt: 2, collateral: 2, silent: 0 }, { arrests: 0, time: 300 });
    expect(clean.xp).toBeGreaterThan(messy.xp);
    expect(clean.grade < messy.grade).toBe(true);
    expect(messy.xp).toBeGreaterThan(0);
  });
});
