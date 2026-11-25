// Enemy AI on the animation graph (workstream I): attacks resolve on the strike clip's contact
// event against where the hero is then, and the roles' special answers (ripostes, shocks,
// surrender, revives). createGoon is stubbed (as in enemyFreeze.test.js); the clip data is real.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createRng } from '../../src/core/rng.js';
import { resolveHit } from '../../src/combat/rules.js';

vi.mock('../../src/actors/characters.js', () => ({
  createGoon: () => {
    const ch = {
      root: new THREE.Group(), yaw: 0,
      face(y) { ch.yaw = y; }, headWorld: (v) => v,
      animator: {
        current: null,
        prime: () => {},
        play(name, o = {}) { ch.animator.current = { name, timeScale: o.timeScale ?? 1, time: o.startAt ?? 0, getClip: () => ({ name, duration: 2 }) }; return ch.animator.current; },
        get currentAction() { return ch.animator.current; },
        get currentName() { return ch.animator.current?.name ?? null; },
        update: () => {},
        has: () => true,
        mixer: { timeScale: 1 },
      },
      groundAt: null,
    };
    return ch;
  },
  footGround: () => () => 0,
  enemyPlantsFeet: () => false,
}));

const { createEnemy } = await import('../../src/actors/enemy.js');
const collision = { resolveCylinder: () => ({ groundY: 0 }), groundBelow: () => 0 };
const make = (type, seed = 1) => createEnemy({ id: type, type, assets: {}, scene: { add() {}, remove() {} }, collision, rng: createRng(seed) });

function fightCtx(hero, out) {
  return {
    hero, others: [],
    onAttackLand: (e, kind) => out.landed.push(kind),
    onAttackEnd: () => { out.ended += 1; },
    onRifleFire: () => {},
  };
}
const step = (e, ctx, secs, dt = 1 / 60, each = null) => { for (let t = 0; t < secs; t += dt) { e.update(dt, ctx); each?.(t); } };

describe('melee attacks resolve on the clip contact', () => {
  it('a grunt in reach lands his blow, and only once', () => {
    const e = make('grunt');
    e.engageNow();
    const hero = { pos: new THREE.Vector3(0, 0, 1.6) };
    const out = { landed: [], ended: 0 };
    const ctx = fightCtx(hero, out);
    e.startWindup(0.6, hero);
    expect(e.state).toBe('windup');
    expect(e.glyph).toBe('blue');
    step(e, ctx, 2);
    expect(out.landed).toEqual(['grunt']);
    expect(out.ended).toBe(1);
  });
  it('a hero who steps out of reach before contact is not hit (dodging works)', () => {
    const e = make('grunt');
    e.engageNow();
    const hero = { pos: new THREE.Vector3(0, 0, 1.6) };
    const out = { landed: [], ended: 0 };
    const ctx = fightCtx(hero, out);
    e.startWindup(0.6, hero);
    step(e, ctx, 0.6);
    hero.pos.set(0, 0, 7.5); // rolled away as the blow comes in
    step(e, ctx, 1.4);
    expect(out.landed).toEqual([]);
  });
  it('far away, a goon with a token walks in first and only then winds up (no tell while walking)', () => {
    const e = make('grunt');
    e.engageNow();
    const hero = { pos: new THREE.Vector3(0, 0, 6) };
    const out = { landed: [], ended: 0 };
    e.startWindup(0.6, hero);
    expect(e.state).toBe('approach');
    expect(e.glyph).toBe(null);
    step(e, fightCtx(hero, out), 2.4, 1 / 60, () => {});
    expect(['windup', 'attack', 'recover', 'engage']).toContain(e.state);
  });
  it('knightmare hides the glyph but keeps the tell', () => {
    const e = make('grunt');
    e.engageNow();
    e.startWindup(0.42, { pos: new THREE.Vector3(0, 0, 1.6) }, { warn: false });
    expect(e.glyph).toBe(null);
    expect(e.tell).toBe('blue');
  });
});

describe('role answers', () => {
  it('the knife turns the first counter aside and comes straight back (counter again)', () => {
    const e = make('knife');
    e.engageNow();
    const hero = { pos: new THREE.Vector3(0, 0, 1.6) };
    expect(e.riposte(hero)).toBe(true);
    expect(e.state).toBe('riposte');
    step(e, fightCtx(hero, { landed: [], ended: 0 }), 0.25);
    expect(e.state).toBe('windup');
    expect(e.riposte(hero)).toBe(false); // the chain is spent: the next counter lands
  });
  it('a charged baton shocks a bare-handed strike from the front, not from behind or once stunned', () => {
    const e = make('baton');
    expect(e.charged).toBe(true);
    expect(resolveHit('punch', e).outcome).toBe('shocked');
    expect(resolveHit('punch', e, { fromBehind: true }).outcome).not.toBe('shocked');
    e.stunned = true;
    expect(resolveHit('punch', e).outcome).not.toBe('shocked');
  });
  it('a stunned baton goon hit drops his baton (disarmed for good)', () => {
    const e = make('baton');
    const drops = [];
    e.engageNow();
    e.stunned = true;
    e.applyHit({ outcome: 'hit', damage: 1, stun: 0 }, new THREE.Vector3(0, 0, -1));
    expect(e.weapon).toBe(null);
    expect(e.charged).toBe(false);
    void drops;
  });
  it('a shield bearer takes a frontal blow on the shield; from behind it lands', () => {
    const e = make('shield');
    expect(resolveHit('punch', e).outcome).toBe('blocked');
    expect(resolveHit('punch', e, { fromBehind: true }).outcome).toBe('hit');
    expect(resolveHit('jumpKick', e, { aerial: true }).outcome).not.toBe('blocked');
    expect(resolveHit('cape', e).outcome).toBe('stun');
  });
  it('fear: a surrendering goon goes to his knees; a fleeing one leaves the fight', () => {
    const a = make('grunt'), b = make('grunt', 2);
    a.engageNow(); b.engageNow();
    a.setMood('surrender', { windupDelay: 0 });
    expect(a.state).toBe('surrender');
    b.setMood('flee', {});
    const hero = { pos: new THREE.Vector3(0, 0, 2) };
    step(b, fightCtx(hero, { landed: [], ended: 0 }), 4);
    expect(b.alive).toBe(false);
    expect(b.fled).toBe(true);
  });
  it('a medic kneels by a knocked-out goon and gets him back up', () => {
    const m = make('medic'), body = make('grunt', 3);
    m.engageNow();
    body.applyHit({ outcome: 'ko', damage: 9, stun: 0 }, new THREE.Vector3(0, 0, -2));
    expect(body.alive).toBe(false);
    body.pos.set(0, 0, 0.5);
    expect(m.startRevive(body)).toBe(true);
    const hero = { pos: new THREE.Vector3(8, 0, 8) };
    step(m, fightCtx(hero, { landed: [], ended: 0 }), 4);
    expect(body.alive).toBe(true);
    expect(body.state).toBe('getup');
  });
  it('a blow on a medic interrupts the revive', () => {
    const m = make('medic'), body = make('grunt', 3);
    m.engageNow();
    body.applyHit({ outcome: 'ko', damage: 9, stun: 0 }, new THREE.Vector3(0, 0, -2));
    m.startRevive(body);
    step(m, fightCtx({ pos: new THREE.Vector3(8, 0, 8) }, { landed: [], ended: 0 }), 1);
    m.applyHit({ outcome: 'hit', damage: 1, stun: 0 }, new THREE.Vector3(1, 0, 0));
    step(m, fightCtx({ pos: new THREE.Vector3(8, 0, 8) }, { landed: [], ended: 0 }), 4);
    expect(body.alive).toBe(false);
  });
});
