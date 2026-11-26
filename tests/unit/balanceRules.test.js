import { describe, it, expect } from 'vitest';
import { windupHolds, DIFFICULTY, ENEMY, resolveHit } from '../../src/combat/rules.js';
import { attachable } from '../../src/combat/targeting.js';

// [balance] The rules the balance pass changed (docs/design/balance.md 3).
const goon = (over = {}) => ({ type: 'grunt', def: ENEMY.grunt, health: 4, state: 'windup', t: 0.3, windupDur: 0.6, ...over });

describe('windup armour: a committed attack is not stopped by a plain strike', () => {
  it('story keeps the old rule: any blow interrupts', () => {
    expect(DIFFICULTY.story.windupArmor).toBeUndefined();
    expect(windupHolds('punch', goon(), 'story')).toBe(false);
  });
  it('normal: a punch mid wind-up is shrugged off, a kick still interrupts', () => {
    expect(windupHolds('punch', goon(), 'normal')).toBe(true);
    expect(windupHolds('travel', goon(), 'normal')).toBe(true);
    expect(windupHolds('kick', goon(), 'normal')).toBe(false);
  });
  it('normal: the first instant of a wind-up is still a fair trade', () => {
    expect(windupHolds('punch', goon({ t: 0.05 }), 'normal')).toBe(false);
  });
  it('hard and knightmare: kicks are shrugged off too', () => {
    for (const d of ['hard', 'knightmare']) {
      expect(windupHolds('kick', goon({ t: 0 }), d)).toBe(true);
      expect(windupHolds('punch', goon({ state: 'attack' }), d)).toBe(true);
    }
  });
  it('only a committed attack holds; the answers still stop it', () => {
    for (const s of ['engage', 'approach', 'hit', 'stunned']) expect(windupHolds('punch', goon({ state: s }), 'hard')).toBe(false);
    for (const m of ['counter', 'cape', 'batarang', 'jumpKick', 'aerial', 'spinKick', 'diveBomb']) expect(windupHolds(m, goon(), 'knightmare')).toBe(false);
    expect(windupHolds('punch', goon({ stunned: true }), 'hard')).toBe(false);
  });
  it('bosses keep their own rules', () => {
    expect(windupHolds('punch', goon({ type: 'joker', def: ENEMY.joker }), 'hard')).toBe(false);
  });
  it('the damage still lands (no health sponge, no free immunity)', () => {
    const e = goon();
    const r = resolveHit('punch', e);
    expect(r.outcome).toBe('hit');
    expect(e.health).toBe(3);
  });
});

describe('thralls are never auto-attached', () => {
  const thrall = { thrall: true };
  it('strikes, kicks, throws and specials skip a dazed civilian', () => {
    for (const a of ['punch', 'kick', 'throw', 'special']) expect(attachable(thrall, a)).toBe(false);
  });
  it('the cape, the batarang and a counter still reach him (they free him)', () => {
    for (const a of ['cape', 'batarang', 'block']) expect(attachable(thrall, a)).toBe(true);
  });
  it('ordinary goons are untouched', () => {
    for (const a of ['punch', 'kick', 'throw']) expect(attachable({ type: 'grunt' }, a)).toBe(true);
  });
});

import { rushDowned } from '../../src/enemies/squad.js';
describe('goons rush a downed co-op player', () => {
  const squad = () => [
    { id: 1, alive: true, x: 3, z: 0 }, { id: 2, alive: true, x: 10, z: 0 }, { id: 3, alive: true, x: 1, z: 1, holdsToken: true },
    { id: 4, alive: true, x: 2, z: 2, ranged: true }, { id: 5, alive: true, x: 40, z: 0 },
  ];
  it('the nearest melee goons without a token take slots round the body', () => {
    const s = squad();
    expect(rushDowned({ x: 0, z: 0 }, s, 2)).toBe(2);
    const rushers = s.filter((e) => e.rushing).map((e) => e.id);
    expect(rushers).toEqual([1, 2]);
    for (const e of s.filter((x) => x.rushing)) expect(Math.hypot(e.slotX, e.slotZ)).toBeCloseTo(1.6);
  });
  it('nobody from across the map, never a gunman or a goon mid-attack', () => {
    const s = squad();
    expect(rushDowned({ x: 0, z: 0 }, s, 5)).toBe(2);
    expect(s.find((e) => e.id === 3).rushing).toBeUndefined();
    expect(s.find((e) => e.id === 4).rushing).toBeUndefined();
  });
});

import { pickDeflection, avoidSteer, createAvoidState, STUCK_REROUTE } from '../../src/nav/avoid.js';
describe('local avoidance round corners and the stuck detector', () => {
  it('goes straight when the way ahead is clear, else the first clear fan direction', () => {
    expect(pickDeflection(true, [false, false, false, false])).toBe(0);
    expect(pickDeflection(false, [true, true, false, false], 1)).toBeCloseTo(0.6);
    expect(pickDeflection(false, [false, true, false, false], 1)).toBeCloseTo(-0.6);
    expect(pickDeflection(false, [false, false, false, true], 1)).toBeCloseTo(-1.2);
    expect(Math.abs(pickDeflection(false, [false, false, false, false], 1))).toBeCloseTo(1.57);
  });
  it('a wall dead ahead (x > 1) turns him off the straight line', () => {
    const wall = { raycast: (o, d, max) => (o.x + d.x * max > 1 && Math.abs(d.z) < 0.5 ? { t: 0.5 } : null) };
    const st = createAvoidState();
    st.t = 0;
    avoidSteer(st, wall, 0, 0, 0, 1, 0, 1 / 60);
    expect(Math.abs(st.dz)).toBeGreaterThan(0.5);
  });
  it('walking on the spot counts as stuck after a couple of seconds; moving does not', () => {
    const open = { raycast: () => null };
    const st = createAvoidState();
    for (let i = 0; i < 180; i++) avoidSteer(st, open, 0, 0, 0, 1, 0, 1 / 60);
    expect(st.stuck).toBeGreaterThanOrEqual(STUCK_REROUTE);
    const mv = createAvoidState();
    for (let i = 0; i < 180; i++) avoidSteer(mv, open, i * 0.05, 0, 0, 1, 0, 1 / 60);
    expect(mv.stuck).toBe(0);
  });
});

import { jokerDef } from '../../src/bosses/defs/joker.js';
import { catBurglarDef, twoFaceDef } from '../../src/openworld/chains/bosses.js';
describe('boss hints for the scripted player read only what a player can see', () => {
  it('the Joker: batarang during a throw, strike while stunned, finish when staggered', () => {
    const d = jokerDef({}, {});
    const h = (j) => d.sim({ boss: { joker: { pos: { x: 0, z: 0 }, ...j } } });
    expect(h({ state: 'throw' }).action).toBe('batarang');
    expect(h({ state: 'stunned' }).action).toBe('punch');
    expect(h({ state: 'roam', finishable: true }).action).toBe('special');
    expect(h({ state: 'windup' })).toBeNull();
  });
  it('side bosses expose a hint (the cat burglar, the two-faced DA)', () => {
    const opts = { sites: { cat: { x: 0, y: 0, z: 0 }, twoFace: { x: 0, y: 0, z: 0 } }, roofPath: () => [] };
    const cat = catBurglarDef(opts)({});
    expect(typeof cat.sim).toBe('function');
    const tf = twoFaceDef(opts)({});
    const b = { e: { vulnerable: 0 }, arena: { x: 0, y: 0, z: 0 }, phase: 0, heroes: [{ pos: { x: 0, z: 0 } }], data: { round: { said: 1, truth: 1 } }, actor: { pos: { x: 0, z: 0 } } };
    expect(tf.sim(b).goTo.x).toBe(7);
  });
});

import { scaleForDifficulty, WAVE_MAX } from '../../src/combat/rules.js';
describe('squad size by difficulty', () => {
  const wave = [{ type: 'grunt', dx: 0, dz: 6 }, { type: 'grunt', dx: 6, dz: 0 }, { type: 'knife', dx: -6, dz: 0 }, { type: 'brute', dx: 0, dz: -6 }];
  it('story and normal keep the wave as written', () => {
    expect(scaleForDifficulty(wave, 'story')).toBe(wave);
    expect(scaleForDifficulty(wave, 'normal')).toBe(wave);
  });
  it('hard and knightmare add more of the same light goons, never brutes', () => {
    expect(scaleForDifficulty(wave, 'hard').length).toBe(5);
    const k = scaleForDifficulty(wave, 'knightmare');
    expect(k.length).toBe(6);
    expect(k.filter((e) => e.type === 'brute').length).toBe(1);
  });
  it('never past WAVE_MAX from difficulty alone', () => {
    const big = Array.from({ length: 8 }, (_, i) => ({ type: 'grunt', dx: i, dz: 0 }));
    expect(scaleForDifficulty(big, 'knightmare').length).toBe(WAVE_MAX);
  });
});

import { createDirector } from '../../src/combat/director.js';
import { createRng } from '../../src/core/rng.js';
describe('attacker spacing per difficulty', () => {
  it('configure() takes the tier minSpacing: hard lets three start within half a second', () => {
    const d = createDirector({ maxWindups: 3, gap: [0, 0], budget: 5, rng: createRng(3) });
    d.configure(DIFFICULTY.hard);
    const c = [1, 2, 3].map((id) => ({ id, ready: true }));
    let n = 0;
    for (let i = 0; i < 30; i++) n += d.tick(1 / 60, c).length;
    expect(n).toBe(3);
    const s = createDirector({ maxWindups: 3, gap: [0, 0], budget: 5, rng: createRng(3) });
    s.configure(DIFFICULTY.normal);
    let m = 0;
    for (let i = 0; i < 30; i++) m += s.tick(1 / 60, c).length;
    expect(m).toBe(2);
  });
});
