import { describe, it, expect } from 'vitest';
import { resolveHit, damageToHero, ENEMY, DIFFICULTY, DIFFICULTIES, difficultyOf, healAfterFight, regenStep, RIFLE_DAMAGE } from '../../src/combat/rules.js';

const foe = (type, o = {}) => ({ type, def: ENEMY[type], health: ENEMY[type].health, down: false, stunned: false, ...o });

describe('difficulty tiers', () => {
  it('has four tiers, knightmare the hardest, and no health bloat', () => {
    expect(DIFFICULTIES).toEqual(['story', 'normal', 'hard', 'knightmare']);
    const k = DIFFICULTY.knightmare;
    expect(k.counterWarnings).toBe(false);
    expect(DIFFICULTY.hard.counterWarnings).toBe(true);
    expect(k.windup).toBeLessThan(DIFFICULTY.hard.windup);
    expect(k.budget).toBeGreaterThan(DIFFICULTY.normal.budget);
    for (const d of DIFFICULTIES) expect(DIFFICULTY[d].tellMin).toBeLessThanOrEqual(DIFFICULTY[d].windup + 0.4);
    expect(difficultyOf('nonsense')).toBe(DIFFICULTY.normal);
  });
  it('damage scales up to knightmare; its rifle shot keeps the old tiers pinned', () => {
    expect(damageToHero('grunt', { difficulty: 'knightmare' })).toBe(17.5);
    expect(damageToHero('rifle', { difficulty: 'knightmare' })).toBe(40);
    expect(RIFLE_DAMAGE.hard).toBe(37.5);
  });
  it('heals after a fight by tier: story in full, knightmare not at all, never lowering health', () => {
    expect(healAfterFight('story', 10, 150)).toBe(150);
    expect(healAfterFight('normal', 20, 100)).toBe(80);
    expect(healAfterFight('hard', 20, 100)).toBe(55);
    expect(healAfterFight('knightmare', 20, 100)).toBe(20);
    expect(healAfterFight('normal', 90, 100)).toBe(100);
  });
  it('regenerates out of combat after a delay, up to a cap', () => {
    expect(regenStep('normal', { health: 40, max: 100, sinceHurt: 1, inCombat: false }, 1)).toBe(40);
    expect(regenStep('normal', { health: 40, max: 100, sinceHurt: 5, inCombat: true }, 1)).toBe(40);
    expect(regenStep('normal', { health: 40, max: 100, sinceHurt: 5, inCombat: false }, 1)).toBe(46);
    expect(regenStep('normal', { health: 74, max: 100, sinceHurt: 5 }, 1)).toBe(75);
    expect(regenStep('normal', { health: 90, max: 100, sinceHurt: 5 }, 1)).toBe(90);
    expect(regenStep('knightmare', { health: 10, max: 100, sinceHurt: 50 }, 1)).toBe(10);
    expect(regenStep('story', { health: 10, max: 150, sinceHurt: 3 }, 1)).toBe(35);
  });
});

describe('roles in resolveHit', () => {
  it('a shield blocks from the front, not from behind, from above, or once stunned', () => {
    expect(resolveHit('punch', foe('shield')).outcome).toBe('blocked');
    expect(resolveHit('kick', foe('shield')).outcome).toBe('blocked');
    expect(resolveHit('punch', foe('shield'), { fromBehind: true }).outcome).toBe('hit');
    expect(resolveHit('aerial', foe('shield')).outcome).toBe('knockdown');
    expect(resolveHit('kick', foe('shield'), { aerial: true }).outcome).toBe('hit');
    expect(resolveHit('cape', foe('shield')).outcome).toBe('stun');
    expect(resolveHit('punch', foe('shield', { stunned: true })).outcome).toBe('hit');
  });
  it('a charged baton shocks a barehanded blow; uncharged or stunned he is a normal goon', () => {
    expect(resolveHit('punch', foe('baton', { charged: true })).outcome).toBe('shocked');
    expect(resolveHit('counter', foe('baton', { charged: true })).outcome).toBe('shocked');
    expect(resolveHit('batarang', foe('baton', { charged: true })).outcome).toBe('stun');
    expect(resolveHit('punch', foe('baton')).outcome).toBe('hit');
    expect(resolveHit('punch', foe('baton', { charged: true, stunned: true })).outcome).toBe('hit');
    expect(damageToHero('shock', { difficulty: 'normal' })).toBe(8);
  });
  it('a heavy only takes chip damage until stunned, then a beatdown works', () => {
    const h = foe('heavy');
    const r = resolveHit('punch', h);
    expect(r.outcome).toBe('chip');
    expect(h.health).toBe(ENEMY.heavy.health - 0.25);
    expect(resolveHit('counter', foe('heavy')).outcome).toBe('immune');
    expect(resolveHit('cape', h).outcome).toBe('stun');
    h.stunned = true;
    expect(resolveHit('beatdown', h).outcome).toBe('hit');
  });
  it('a disarm stuns and says so; a ground pound finishes a downed goon', () => {
    expect(resolveHit('disarm', foe('pistol'))).toMatchObject({ outcome: 'stun', disarm: true });
    expect(resolveHit('groundPound', foe('grunt', { down: true })).outcome).toBe('ko');
  });
  it('role definitions stay modest in health', () => {
    for (const t of ['shield', 'baton', 'pistol', 'sniper', 'ninja', 'medic', 'lieutenant']) expect(ENEMY[t].health).toBeLessThanOrEqual(6);
    expect(ENEMY.heavy.health).toBeLessThanOrEqual(ENEMY.brute.health);
    expect(ENEMY.rifle).toMatchObject({ ranged: true, cover: true, suppress: true });
    expect(ENEMY.sniper).toMatchObject({ ranged: true, laser: true, nest: true, range: 60 });
  });
  it('blocking reductions for the new attacks: a baton and a grab must be dodged', () => {
    expect(damageToHero('baton', { difficulty: 'normal', blocking: true })).toBe(18);
    expect(damageToHero('grab', { difficulty: 'normal', blocking: true })).toBe(25);
    expect(damageToHero('shieldBash', { difficulty: 'normal', blocking: true })).toBe(4.8);
  });
});
