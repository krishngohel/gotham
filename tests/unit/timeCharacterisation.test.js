// Characterisation of how combat drives time, written against the single-hero code BEFORE the
// per-actor time refactor (workstream B, Long Night 2). The snapshots pin, for each scenario:
//   - every call combat makes into time (hitStop / slowMo / hold, with its seconds and scale), and
//   - the dt sequence the hero's move and the goon's AI actually received, frame by frame.
// After the refactor the same scenarios must produce the same calls and the same per-actor dt
// with one player: that is the "single-player feels identical" proof for hit-stop, criticals,
// counters, the special and the gadget wheel's hold.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCombat } from '../../src/combat/combatSystem.js';
import { createEvents } from '../../src/core/events.js';
import { createTimeControl } from '../../src/core/time.js';
import { createTimeControl as createLegacyTime } from './legacy/time.legacy.js';
import { createRng } from '../../src/core/rng.js';
import { ENEMY } from '../../src/combat/rules.js';
import { upgradeEffects } from '../../src/progress/upgrades.js';

function makeHero() {
  return {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), state: 'ground', grounded: true, control: null, dead: false,
    invulnerable: 0, health: 100, maxHealth: 100, blocking: false, heightAboveGround: () => 0,
    collision: { raycast: () => null, resolveCylinder: () => ({ groundY: 0 }), groundBelow: () => 0 },
    bat: {
      yaw: 0, face(y) { this.yaw = y; }, tilt: { rotation: { set() {} } },
      animator: { play: () => ({ time: 0, getClip: () => ({ duration: 1 }) }), update() {}, has: () => false },
      bone: () => ({ getWorldPosition: (v) => v.set(0, 1.4, 0) }),
    },
    cape: { setWings() {} },
  };
}
function makeGoon(id, type, x, z, o = {}) {
  const g = {
    id, type, def: ENEMY[type], scale: ENEMY[type].scale, radius: 0.42, alive: true, down: false, air: false, aware: true,
    state: 'engage', health: ENEMY[type].health, stunned: false, glyph: null, pos: new THREE.Vector3(x, 0, z),
    get x() { return this.pos.x; }, get z() { return this.pos.z; },
    ch: { headWorld: (v) => v.set(g.pos.x, 1.6, g.pos.z), animator: { play() {} }, face() {} },
    dts: [],
    applyHit(r) {
      if (r.outcome === 'ko') { this.alive = false; this.down = true; this.state = 'ko'; }
      else if (r.outcome === 'knockdown') { this.down = true; this.state = 'down'; }
      return false;
    },
    update(dt) { this.dts.push(dt); },
    ready() { return false; },
    startWindup(w) { this.state = 'windup'; this.windup = w; },
    ...o,
  };
  return g;
}
const follow = { forward: (v = new THREE.Vector3()) => v.set(0, 0, 1), right: (v = new THREE.Vector3()) => v.set(-1, 0, 0), addShake() {}, hitKick() {}, actionShot() {} };

// A real time control behind a recorder: every call combat makes into it is logged by frame.
function recordedTime(base) {
  const calls = [];
  let frame = 0;
  const proxy = new Proxy(base, {
    get(t, k) {
      // Seconds (and the slow-motion scale): what the player feels. The actors a hit-stop freezes
      // and the scope of a slow motion arrived with per-actor time and are passed through as given.
      if (k === 'hitStop') return (a, ...rest) => { calls.push([frame, k, a, null]); return t[k](a, ...rest); };
      if (k === 'slowMo') return (a, b, ...rest) => { calls.push([frame, k, a, b ?? null]); return t[k](a, b, ...rest); };
      if (k === 'setFrame') return (n) => { frame = n; };
      if (k === 'calls') return calls;
      return t[k];
    },
  });
  return proxy;
}

// Drives a fight frame by frame the way game.js does: time first, combat, then the hero's move.
function run({ goons, presses = {}, frames = 120, combo = 0, owned = [], wheelFrames = null }) {
  const hero = makeHero();
  const time = recordedTime(createTimeControl());
  const events = createEvents();
  const combat = createCombat({ hero, follow, time, events, rng: createRng(5), getDifficulty: () => 'normal', effects: upgradeEffects(owned) });
  hero.combat = combat;
  combat.setEnemies(goons);
  for (let i = 0; i < combo; i++) combat.combo.hit();
  const heroDts = [], worldDts = [];
  const real = 1 / 60;
  for (let f = 0; f < frames; f++) {
    time.setFrame(f);
    if (wheelFrames && f === wheelFrames[0]) time.hold('wheel', 0.2);
    if (wheelFrames && f === wheelFrames[1]) time.release('wheel');
    const dt = time.scale(real);
    worldDts.push(dt);
    const p = presses[f] ?? [];
    combat.update(dt, { input: { move: { x: 0, y: 0 }, pressed: (a) => p.includes(a), down: () => false }, fx: {} });
    const hdt = time.dtFor ? time.dtFor(hero) : dt;
    heroDts.push(hdt);
    if (hero.control && hero.control.update(hdt) && hero.control) hero.control = null;
    hero.invulnerable = Math.max(0, hero.invulnerable - hdt);
  }
  const r6 = (a) => a.map((v) => Math.round(v * 1e9) / 1e9);
  return { calls: time.calls, heroDts: r6(heroDts), goonDts: goons.map((g) => r6(g.dts)), worldDts: r6(worldDts), combat, hero };
}

// Pressing the same action every few frames keeps the buffer fed through a whole chain.
const every = (action, n, frames) => Object.fromEntries(Array.from({ length: frames }, (_, i) => [i, i % n === 0 ? [action] : []]));

describe('characterisation: combat drives time the same way (one hero)', () => {
  it('a plain punch: one hit-stop for both fighters', () => {
    const r = run({ goons: [makeGoon('a', 'grunt', 0, 1.5, { health: 40 }), makeGoon('b', 'grunt', 5, 5)], presses: { 0: ['punch'] }, frames: 40 });
    expect(r.calls).toMatchSnapshot('calls');
    expect(r.heroDts).toMatchSnapshot('hero dt');
    expect(r.goonDts).toMatchSnapshot('goon dt');
  });
  it('a kick chain into its finisher (a critical: hit-stop and slow motion)', () => {
    const r = run({ goons: [makeGoon('a', 'grunt', 0, 1.5, { health: 40 }), makeGoon('b', 'grunt', 6, 6)], presses: every('kick', 6, 140), frames: 160 });
    expect(r.calls.some(([, k]) => k === 'slowMo')).toBe(true);
    expect(r.calls).toMatchSnapshot('calls');
    expect(r.heroDts).toMatchSnapshot('hero dt');
    expect(r.goonDts).toMatchSnapshot('goon dt');
  });
  it('the last goon down: lastHit critical slow motion', () => {
    const r = run({ goons: [makeGoon('a', 'grunt', 0, 1.5, { health: 1 })], presses: { 0: ['punch'] }, frames: 90 });
    expect(r.calls.some(([, k, a, b]) => k === 'slowMo' && a === 0.9 && b === 0.22)).toBe(true);
    expect(r.calls).toMatchSnapshot('calls');
    expect(r.heroDts).toMatchSnapshot('hero dt');
    expect(r.goonDts).toMatchSnapshot('goon dt');
  });
  it('a counter on a wind-up: counter slow motion then the counter hit-stop', () => {
    const r = run({ goons: [makeGoon('a', 'grunt', 0, 2, { state: 'windup', health: 40 }), makeGoon('b', 'grunt', 6, 6)], presses: { 0: ['block'] }, frames: 60 });
    expect(r.calls.some(([, k, a, b]) => k === 'slowMo' && a === 0.18 && b === 0.35)).toBe(true);
    expect(r.calls).toMatchSnapshot('calls');
    expect(r.heroDts).toMatchSnapshot('hero dt');
    expect(r.goonDts).toMatchSnapshot('goon dt');
  });
  it('a special takedown: run-up slow motion, then the critical', () => {
    const r = run({ goons: [makeGoon('a', 'grunt', 0, 2, { health: 40 }), makeGoon('b', 'grunt', 6, 6)], presses: { 0: ['special'] }, combo: 8, frames: 90 });
    expect(r.calls.some(([, k, a, b]) => k === 'slowMo' && a === 0.8 && b === 0.28)).toBe(true);
    expect(r.calls).toMatchSnapshot('calls');
    expect(r.heroDts).toMatchSnapshot('hero dt');
    expect(r.goonDts).toMatchSnapshot('goon dt');
  });
  it('the gadget wheel held at 20% across punches', () => {
    const r = run({ goons: [makeGoon('a', 'grunt', 0, 1.5, { health: 40 }), makeGoon('b', 'grunt', 6, 6)], presses: every('punch', 8, 80), frames: 100, wheelFrames: [10, 70] });
    expect(r.calls).toMatchSnapshot('calls');
    expect(r.heroDts).toMatchSnapshot('hero dt');
    expect(r.goonDts).toMatchSnapshot('goon dt');
  });
});

// The time engine itself against the frozen pre-refactor copy: same calls, same game time out.
describe('characterisation: the time engine matches the pre-refactor engine (one player)', () => {
  // A scripted night: variable frame times, overlapping hit-stops, slow motion, holds, releases.
  const script = [
    [0.016, []], [0.017, [['hitStop', 0.05]]], [0.016, []], [0.033, []], [0.016, [['slowMo', 0.55, 0.28], ['hitStop', 0.14]]],
    [0.016, []], [0.05, []], [0.016, [['hold', 'wheel', 0.2]]], [0.016, [['hitStop', 0.065]]], [0.016, []], [0.02, []],
    [0.016, [['hold', 'remote', 0.3]]], [0.016, [['release', 'wheel']]], [0.016, [['slowMo', 0.18, 0.35]]], [0.016, [['hitStop', 0.1]]],
    [0.016, []], [0.04, [['hold', 'impact', 0.01]]], [0.016, []], [0.016, [['release', 'impact']]], [0.016, [['releaseAll']]],
    [0.016, [['slowMo', 1.4, 0.25]]], ...Array.from({ length: 40 }, (_, i) => [0.012 + (i % 5) * 0.006, i % 9 === 0 ? [['hitStop', 0.05 + (i % 3) * 0.03]] : []]),
  ];
  const drive = (time) => {
    const out = [];
    for (const [real, ops] of script) {
      out.push(Math.round(time.scale(real) * 1e12));
      for (const [op, ...args] of ops) time[op](...args);
    }
    return out;
  };
  it('scale(real) is the same frame for frame', () => {
    expect(drive(createTimeControl())).toEqual(drive(createLegacyTime()));
  });
});

describe('per-actor time: one player is the old world clock, several players freeze only the fighters', () => {
  const real = 1 / 60;
  it('one player: dtFor(any actor) equals the old engine frame for frame, actor-tagged or not', () => {
    const legacy = createLegacyTime(), now = createTimeControl();
    const hero = {}, goon = {}, other = {};
    const seq = [];
    for (let f = 0; f < 90; f++) {
      const a = legacy.scale(real), b = now.scale(real);
      seq.push([a, b, now.dtFor(hero), now.dtFor(goon), now.dtFor(other)]);
      if (f === 3) { legacy.hitStop(0.05); now.hitStop(0.05, [hero, goon]); }
      if (f === 10) { legacy.slowMo(0.55, 0.28); now.slowMo(0.55, 0.28, { id: 0 }); legacy.hitStop(0.14); now.hitStop(0.14, [hero, goon]); }
      if (f === 40) { legacy.hold('wheel', 0.2); now.hold('wheel', 0.2, 0); }
      if (f === 60) { legacy.release('wheel'); now.release('wheel'); }
      if (f === 70) { legacy.slowMo(1.4, 0.25); now.slowMo(1.4, 0.25, 'world'); }
    }
    for (const [a, b, h, g, o] of seq) { expect(b).toBe(a); expect(h).toBe(a); expect(g).toBe(a); expect(o).toBe(a); }
  });
  it('two players: a hit-stop freezes the attacker and the victim, nobody else', () => {
    const t = createTimeControl();
    t.setPlayerCount(2);
    const p1 = {}, p2 = {}, victim = {}, bystander = {};
    t.scale(real);
    t.hitStop(0.05, [p1, victim]);
    const frames = [];
    for (let i = 0; i < 6; i++) { const w = t.scale(real); frames.push([w, t.dtFor(p1), t.dtFor(victim), t.dtFor(p2), t.dtFor(bystander)]); }
    // The world never stopped.
    for (const [w, , , q, b] of frames) { expect(w).toBeCloseTo(real); expect(q).toBeCloseTo(real); expect(b).toBeCloseTo(real); }
    // 0.05 s of freeze at 60 fps: three frames frozen, the fourth gets what is left of its frame.
    expect(frames.slice(0, 3).map((f) => f[1])).toEqual([0, 0, 0]);
    expect(frames[3][1]).toBeCloseTo(4 * real - 0.05);
    expect(frames[3][2]).toBeCloseTo(4 * real - 0.05);
    expect(frames[4][1]).toBeCloseTo(real);
    expect(t.frozen(p1)).toBe(false);
  });
  it('two players: the wheel and remote holds are player-local, the world runs on', () => {
    const t = createTimeControl();
    t.setPlayerCount(2);
    t.hold('wheel', 0.2, { id: 0 });
    t.hold('remote', 0.3, 1);
    expect(t.scale(real)).toBeCloseTo(real);
    expect(t.held).toBe(1);
    expect(t.heldFor({ id: 0 })).toBeCloseTo(0.2);
    expect(t.localScale(0)).toBeCloseTo(0.2);
    expect(t.localScale(1)).toBeCloseTo(0.3);
    t.release('wheel');
    expect(t.localScale(0)).toBe(1);
    t.releaseAll();
    expect(t.localScale(1)).toBe(1);
  });
  it('two players: a counter or critical slow motion is player-local; a world (cinematic) one slows everyone', () => {
    const t = createTimeControl();
    t.setPlayerCount(2);
    t.slowMo(0.18, 0.35, { id: 1 });
    expect(t.scale(real)).toBeCloseTo(real);
    expect(t.localScale(1)).toBeCloseTo(0.35);
    for (let i = 0; i < 12; i++) t.scale(real);
    expect(t.localScale(1)).toBe(1);
    t.slowMo(1.4, 0.25, 'world');
    expect(t.scale(real)).toBeCloseTo(real * 0.25);
    // An untagged hit-stop (old callers) is still a world freeze.
    t.hitStop(0.1);
    expect(t.scale(real)).toBe(0);
  });
});
