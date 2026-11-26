// Two heroes in one fight (workstream B): goons split between them, each has their own combo,
// chain counters and health, attacks land on the hero the goon chose, and a hit-stop in co-op
// freezes only the fighters involved.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCombat } from '../../src/combat/combatSystem.js';
import { createEvents } from '../../src/core/events.js';
import { createTimeControl } from '../../src/core/time.js';
import { createRng } from '../../src/core/rng.js';
import { ENEMY } from '../../src/combat/rules.js';
import { upgradeEffects } from '../../src/progress/upgrades.js';

function makeHero(x = 0, z = 0) {
  return {
    pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), state: 'ground', grounded: true, control: null, dead: false,
    invulnerable: 0, health: 100, maxHealth: 100, blocking: false, heightAboveGround: () => 0,
    collision: { raycast: () => null, resolveCylinder: () => ({ groundY: 0 }), groundBelow: () => 0 },
    bat: {
      yaw: 0, face(y) { this.yaw = y; }, tilt: { rotation: { set() {} } },
      animator: { play: () => ({ time: 0, getClip: () => ({ duration: 1 }) }), update() {}, has: () => false },
      bone: () => ({ getWorldPosition: (v) => v.set(x, 1.4, z) }),
    },
    cape: { setWings() {} },
  };
}
function makeGoon(id, x, z, o = {}) {
  const g = {
    id, type: 'grunt', def: ENEMY.grunt, scale: 1, radius: 0.42, alive: true, down: false, air: false, aware: true,
    state: 'engage', health: 40, stunned: false, glyph: null, pos: new THREE.Vector3(x, 0, z),
    get x() { return this.pos.x; }, get z() { return this.pos.z; },
    ch: { headWorld: (v) => v.set(g.pos.x, 1.6, g.pos.z), animator: { play() {} }, face() {} },
    attack: null, seen: [], windupOn: [], dts: [],
    applyHit(r) { if (r.outcome === 'ko') { this.alive = false; this.down = true; this.state = 'ko'; } return false; },
    update(dt, ctx) {
      this.dts.push(dt);
      this.seen.push(ctx.hero);
      if (this.attack) { const k = this.attack; this.attack = null; ctx.onAttackLand(this, k); }
    },
    ready() { return this.state === 'engage'; },
    startWindup(w, hero) { this.state = 'windup'; this.windupOn.push(hero); },
    ...o,
  };
  return g;
}
const follow = { forward: (v = new THREE.Vector3()) => v.set(0, 0, 1), right: (v = new THREE.Vector3()) => v.set(-1, 0, 0), addShake() {}, hitKick() {}, actionShot() {}, lookDir: (v) => v.set(0, 0, 1) };
const input = (pressed = []) => ({ move: { x: 0, y: 0 }, pressed: (a) => pressed.includes(a), down: () => false });

function setup({ time = createTimeControl() } = {}) {
  const h0 = makeHero(0, 0), h1 = makeHero(20, 0);
  const p0 = { id: 0, slot: 0, local: true, hero: h0 };
  const p1 = { id: 1, slot: 1, local: true, hero: h1, ctx: { input: input(), fx: {} } };
  const events = createEvents();
  time.setPlayerCount?.(2);
  const combat = createCombat({ players: [p0, p1], follow, time, events, rng: createRng(7), getDifficulty: () => 'normal', effects: upgradeEffects([]) });
  h0.combat = combat;
  return { h0, h1, p0, p1, combat, events, time };
}

describe('combat with two heroes', () => {
  it('player 0 is the combat object; player 1 gets its own fighter api on hero.combat', () => {
    const { combat, h1, p1 } = setup();
    expect(combat.fighters).toHaveLength(2);
    expect(combat.fighterFor(h1).player).toBe(p1);
    expect(h1.combat).toBe(combat.fighterFor(p1).api);
    expect(h1.combat.enemies).toBe(combat.enemies);
  });
  it('goons near each hero go after that hero', () => {
    const { combat, h0, h1 } = setup();
    const a = makeGoon('a', 1, 2), b = makeGoon('b', 21, 2);
    combat.setEnemies([a, b]);
    combat.update(0.016, { input: input(), fx: {} });
    expect(a.seen.at(-1)).toBe(h0);
    expect(b.seen.at(-1)).toBe(h1);
  });
  it('a squad around both heroes is shared out between them', () => {
    const { combat, h0, h1 } = setup();
    h1.pos.set(4, 0, 0);
    const squad = [makeGoon('a', 1, 1), makeGoon('b', 1, -1), makeGoon('c', 2, 1.5), makeGoon('d', 2, -1.5), makeGoon('e', 1.5, 0)];
    combat.setEnemies(squad);
    combat.update(0.016, { input: input(), fx: {} });
    const on0 = squad.filter((g) => g.seen.at(-1) === h0).length, on1 = squad.filter((g) => g.seen.at(-1) === h1).length;
    expect(on0).toBeGreaterThan(0);
    expect(on1).toBeGreaterThan(0);
    expect(on0 + on1).toBe(5);
  });
  it('an attack lands on the hero the goon chose, not on player 0', () => {
    const { combat, h0, h1, events } = setup();
    const b = makeGoon('b', 21, 2);
    combat.setEnemies([b]);
    combat.update(0.016, { input: input(), fx: {} });
    const hurt = [];
    events.on('heroHurt', (d) => hurt.push(d.player.id));
    b.attack = 'grunt';
    combat.update(0.016, { input: input(), fx: {} });
    expect(h1.health).toBeLessThan(100);
    expect(h0.health).toBe(100);
    expect(hurt).toEqual([1]);
  });
  it('each hero has its own combo; hits and KOs carry the player who landed them', () => {
    const { combat, p0, p1, events } = setup();
    const a = makeGoon('a', 0, 1.5), b = makeGoon('b', 20, 1.5);
    combat.setEnemies([a, b, makeGoon('x', 50, 50)]);
    const impacts = [];
    events.on('impact', (d) => impacts.push(d.player.id));
    combat.fighterFor(p1).landHit('punch', b);
    combat.fighterFor(p1).landHit('punch', b);
    combat.fighterFor(p0).landHit('punch', a);
    expect(combat.fighterFor(p1).combo.value).toBe(2);
    expect(combat.combo.value).toBe(1);
    expect(impacts).toEqual([1, 1, 0]);
    // The goon hit by player 1 now prefers player 1.
    expect(b.lastHitBy).toBe(combat.fighterFor(p1));
  });
  it('player 1 starts strikes from its own input', () => {
    const { combat, h1, p1 } = setup();
    const b = makeGoon('b', 20, 1.5);
    combat.setEnemies([b]);
    p1.ctx.input = input(['punch']);
    combat.update(0.016, { input: input(), fx: {} });
    expect(h1.control?.name).toBe('strike');
  });
  it('wind-up tokens are per target hero: two heroes can each face the cap', () => {
    const { combat, h0, h1 } = setup();
    const near0 = [makeGoon('a', 1, 2), makeGoon('b', -1, 2), makeGoon('c', 0, 3)];
    const near1 = [makeGoon('d', 21, 2), makeGoon('e', 19, 2), makeGoon('f', 20, 3)];
    combat.setEnemies([...near0, ...near1]);
    for (let i = 0; i < 400; i++) combat.update(0.016, { input: input(), fx: {} });
    const on0 = near0.filter((g) => g.state === 'windup').length, on1 = near1.filter((g) => g.state === 'windup').length;
    expect(on0).toBe(2);
    expect(on1).toBe(2);
    for (const g of near0) for (const h of g.windupOn) expect(h).toBe(h0);
    for (const g of near1) for (const h of g.windupOn) expect(h).toBe(h1);
  });
  it('a downed hero is left alone; the last one standing going down is heroDown', () => {
    const { combat, h0, h1, events } = setup();
    const seen = [];
    events.on('playerDown', (d) => seen.push(['playerDown', d.player.id]));
    events.on('heroDown', (d) => seen.push(['heroDown', d.player.id]));
    combat.fighterFor(h1).killHero();
    const a = makeGoon('a', 19, 1);
    combat.setEnemies([a]);
    combat.update(0.016, { input: input(), fx: {} });
    expect(a.seen.at(-1)).toBe(h0);
    combat.killHero();
    expect(seen).toEqual([['playerDown', 1], ['heroDown', 0]]);
  });
  it('co-op hit-stop freezes the attacker and the victim only', () => {
    const time = createTimeControl();
    const { combat, h0, h1, p0 } = setup({ time });
    const a = makeGoon('a', 0, 1.5), b = makeGoon('b', 20, 1.5);
    combat.setEnemies([a, b, makeGoon('x', 60, 60)]);
    time.scale(1 / 60);
    combat.fighterFor(p0).landHit('kick', a, { stopTime: 0.065 });
    const w = time.scale(1 / 60);
    expect(w).toBeCloseTo(1 / 60);
    expect(time.dtFor(h0)).toBe(0);
    expect(time.dtFor(a)).toBe(0);
    expect(time.dtFor(h1)).toBeCloseTo(1 / 60);
    expect(time.dtFor(b)).toBeCloseTo(1 / 60);
    // And the goons' AI really got those dts through combat.update.
    combat.update(w, { input: input(), fx: {} });
    expect(a.dts.at(-1)).toBe(0);
    expect(b.dts.at(-1)).toBeCloseTo(1 / 60);
  });
  it('removing player 1 sends its goons back to player 0', () => {
    const { combat, h0, p1 } = setup();
    const b = makeGoon('b', 21, 2);
    combat.setEnemies([b]);
    combat.update(0.016, { input: input(), fx: {} });
    combat.removePlayer(p1);
    combat.update(0.016, { input: input(), fx: {} });
    expect(b.seen.at(-1)).toBe(h0);
    expect(combat.fighters).toHaveLength(1);
  });
});
