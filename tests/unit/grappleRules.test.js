import { describe, it, expect } from 'vitest';
import { zipSpeed, zipDuration, boostKind, boostLaunch, createChain, canChain, spendChain, tickChain, landChain, pullOutcome, PERFECT_WINDOW, ZIP_BASE, ZIP_MAX, CHAIN_COOLDOWN } from '../../src/traversal/grappleRules.js';
import { moveEffects, BASE_MOVES, MOVE_NODES, movesAllFromQuery } from '../../src/traversal/moves.js';
import { upgradeEffects } from '../../src/progress/upgrades.js';
import * as tree from '../../src/progress/skillTree.js';
const SKILL_NODES = tree.NODES ?? tree.SKILL_NODES ?? [];

const TUNING = { boostUp: 15, boostOut: 9 };

describe('moves (upgrade ownership)', () => {
  it('nothing owned is today, including the skill tree defaults', () => {
    expect(moveEffects(null)).toEqual(BASE_MOVES);
    expect(moveEffects({ maxHealthBonus: 0 })).toEqual(BASE_MOVES);
    expect(moveEffects(upgradeEffects([]))).toEqual(BASE_MOVES);
  });
  it('reads the skill tree effect keys (docs/design/progression.md)', () => {
    const m = moveEffects({ grappleRange: 1.5, grappleReel: 1.2, grappleBoost: true, glideReGrapple: true, grapplePull: true, wingsuit: 2, updrafts: true, carTopSpeed: 1.1, carRamDamage: 1.5, carArmor: 0.7, carAfterburner: true });
    expect(m.grappleRange).toBe(78);
    expect(m.reel).toBe(1.2);
    expect(m.perfectBoost && m.reGrapple && m.pull && m.barrage && m.winch).toBe(true);
    expect(m.wingsuit).toBe(2);
    expect(m.chainCharges).toBe(4);
    expect(m.updraftMul).toBe(1.4);
    expect(m.topSpeed).toBe(1.1);
    expect(m.armorMul).toBe(0.7);
    expect(m.heatCap).toBe(1.6);
  });
  it('the live effects object after buying the nodes', () => {
    const owned = SKILL_NODES.filter((n) => ['grappleRange1', 'grappleBoost', 'wingsuit1'].includes(n.id)).map((n) => n.id);
    if (owned.length === 3) {
      const m = moveEffects(upgradeEffects(owned));
      expect(m.grappleRange).toBe(65);
      expect(m.perfectBoost).toBe(true);
      expect(m.wingsuit).toBe(1);
    }
  });
  it('a list of node ids works too, and ?moves=all owns everything', () => {
    expect(moveEffects(['grappleRange2']).grappleRange).toBe(78);
    expect(moveEffects(new Set(['wingsuit3'])).wingsuit).toBe(3);
    const m = moveEffects(null, { all: movesAllFromQuery('?moves=all') });
    expect(m.grappleRange).toBe(78);
    expect(m.perfectBoost && m.reGrapple && m.pull && m.barrage && m.winch).toBe(true);
    expect(m.wingsuit).toBe(3);
    expect(MOVE_NODES.length).toBe(new Set(MOVE_NODES).size);
  });
});

describe('grapple rules', () => {
  it('reel speed: today, the reel upgrade, and a chained reel that keeps flight speed', () => {
    expect(zipSpeed({ grappleSpeed: 1 }, BASE_MOVES)).toBe(ZIP_BASE);
    expect(zipSpeed({ grappleSpeed: 1 }, { reel: 1.35 })).toBeCloseTo(40.5);
    expect(zipSpeed({}, BASE_MOVES, { entrySpeed: 50, chained: true })).toBeCloseTo(46);
    expect(zipSpeed({}, BASE_MOVES, { entrySpeed: 10, chained: true })).toBe(ZIP_BASE);
    expect(zipSpeed({}, BASE_MOVES, { entrySpeed: 200, chained: true })).toBe(ZIP_MAX);
    expect(zipDuration(3, 30)).toBe(0.35);
  });

  it('a boost press: plain without the upgrade, perfect only in the window with it', () => {
    expect(boostKind(null, BASE_MOVES)).toBe(null);
    expect(boostKind(0.9, BASE_MOVES)).toBe('boost');
    const m = moveEffects({ grappleBoost: true });
    expect(boostKind(PERFECT_WINDOW - 0.05, m)).toBe('boost');
    expect(boostKind(PERFECT_WINDOW + 0.01, m)).toBe('perfect');
  });

  it('a perfect boost launches harder than the plain one, and chained links gain less each time', () => {
    const plain = boostLaunch('boost', TUNING);
    expect(plain).toEqual({ up: 15, out: 9 });
    const p0 = boostLaunch('perfect', TUNING, { reel: 45, link: 0 });
    const p3 = boostLaunch('perfect', TUNING, { reel: 45, link: 3 });
    expect(p0.up).toBeGreaterThan(plain.up);
    expect(p0.out).toBeGreaterThan(plain.out);
    expect(p3.out).toBeLessThan(p0.out);
    expect(p3.out).toBeGreaterThan(plain.out);
  });

  it('chain charges: a skill, not an exploit', () => {
    const m = moveEffects({ glideReGrapple: true });
    const c = createChain();
    expect(canChain(c, BASE_MOVES, true)).toBe(false); // not owned
    expect(canChain(c, m, false)).toBe(false);         // from the ground it is a normal grapple
    let used = 0;
    for (let t = 0; t < 10; t += 0.1) { tickChain(c, 0.1); if (canChain(c, m, true)) { spendChain(c); used++; } }
    expect(used).toBe(m.chainCharges);                  // charges run out mid-air
    landChain(c);
    tickChain(c, CHAIN_COOLDOWN);
    expect(canChain(c, m, true)).toBe(true);            // the ground refills them
    spendChain(c);
    expect(canChain(c, m, true)).toBe(false);           // cooldown between links
  });

  it('pull outcome by role', () => {
    const e = (type, o = {}) => ({ type, alive: true, down: false, def: {}, ...o });
    expect(pullOutcome(e('grunt'))).toBe('yank');
    expect(pullOutcome(e('knife'))).toBe('disarm');
    expect(pullOutcome(e('knife', { disarmed: true }))).toBe('yank');
    expect(pullOutcome(e('shield'))).toBe('stripShield');
    expect(pullOutcome(e('shield', { shieldLost: true }))).toBe('yank');
    expect(pullOutcome(e('heavy'))).toBe('resist');
    expect(pullOutcome(e('grunt', { def: { armored: true } }))).toBe('resist');
    expect(pullOutcome(e('joker', { def: { boss: true } }))).toBe(null);
    expect(pullOutcome(e('grunt', { down: true }))).toBe(null);
  });
});
