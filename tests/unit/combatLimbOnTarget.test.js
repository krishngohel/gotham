// Every strike in the hero tables lands its limb on the target on the clip's contact frame, also
// when the target stands off to the side, at a different range, or keeps moving until contact
// (motion warping, src/anim/warp.js; the hit fires from the clip's contact event, src/anim/graph.js).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createCombat } from '../../src/combat/combatSystem.js';
import { MOCAP_DATA } from '../../src/config/mocapData.js';
import { MOCAP_DATA as COMBAT2 } from '../../src/config/mocapData.combat2.js';
import { registerClipData, clipInfo } from '../../src/anim/clips.js';
import { BATMAN_MOVES } from '../../src/combat/kitMoves.js';
import { MOVE_TABLE } from '../../src/combat/moveSelect.js';
import { ENEMY } from '../../src/combat/rules.js';
import { createRng } from '../../src/core/rng.js';

beforeAll(() => registerClipData(COMBAT2));

// The reach table the game builds (src/combat/reach.js + the pack's strikes, src/anim/packs.js).
function reachTable() {
  const t = {};
  for (const [n, d] of Object.entries(MOCAP_DATA)) t[n] = { contact: d.contact, limb: d.limb, reach: { ...d.reach }, root: d.root, fps: d.fps, duration: d.duration };
  for (const [n, d] of Object.entries(COMBAT2)) if (d.kind === 'strike' && !t[n]) t[n] = { contact: d.events?.contact ?? d.contact, limb: d.limb, reach: { ...d.reach }, root: d.root, fps: d.fps, duration: d.duration };
  return t;
}

function harness(clip, kind) {
  const hero = {
    pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), state: 'ground', grounded: true, dead: false,
    invulnerable: 0, health: 100, maxHealth: 100, control: null, blocking: false, speed: 0,
    bat: { yaw: 0, face(y) { this.yaw = y; }, animator: { play() {}, has: () => true }, tilt: { rotation: { set() {} } }, bone: () => ({ getWorldPosition: (v) => v }) },
    cape: { setWings() {} },
    heightAboveGround: () => 0,
    collision: { raycast: () => null, resolveCylinder(p) { return { groundY: p.y }; }, groundBelow: () => 0 },
  };
  const follow = { forward: (o) => o.set(0, 0, 1), right: (o) => o.set(-1, 0, 0), addShake() {}, hitKick() {}, actionShot() {} };
  const events = { emit() {}, on() {} };
  const time = { hitStop() {}, slowMo() {} };
  // A kit whose every table is this one clip.
  const list = [clip];
  const kit = { moves: { punchTiers: [list, list, list], kicks: list, finishers: { punch: list, kick: list }, travel: { kick: [], punch: [] } } };
  const combat = createCombat({ players: [{ id: 0, slot: 0, local: true, hero, kit }], follow, time, events, rng: createRng(3), getDifficulty: () => 'normal', reach: reachTable() });
  return { hero, combat, kind };
}

function goonAt(x, z, vx, vz, onHit) {
  const e = {
    id: 1, type: 'grunt', def: ENEMY.grunt, scale: 1, radius: 0.42, pos: new THREE.Vector3(x, 0, z), vel: { x: vx, z: vz },
    alive: true, aware: true, state: 'engage', down: false, air: false, stunned: false, health: 40, glyph: null,
    applyHit() { onHit(e); return false; },
    ch: { headWorld(out) { return out.copy(e.pos); }, face() {}, yaw: Math.PI },
    update(dt) { this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; }, ready: () => false, wake() {}, startWindup() {},
    get x() { return this.pos.x; }, get z() { return this.pos.z; },
  };
  return e;
}

const ctxFor = (pressed) => ({ input: { pressed: (a) => a === pressed, down: () => false, move: { x: 0, y: 0 } }, fx: {} });

// Runs one press; returns the limb's distance from the target's centre on the contact frame.
function strikeOnce(clip, kind, { x, z, vx = 0, vz = 0 }) {
  const { hero, combat } = harness(clip, kind);
  let miss = null, played = null;
  const reach = reachTable()[clip].reach;
  const e = goonAt(x, z, vx, vz, (g) => {
    if (miss !== null) return;
    const yaw = hero.bat.yaw;
    const lx = hero.pos.x + Math.cos(yaw) * reach.x + Math.sin(yaw) * reach.z;
    const lz = hero.pos.z - Math.sin(yaw) * reach.x + Math.cos(yaw) * reach.z;
    miss = Math.hypot(lx - g.pos.x, lz - g.pos.z);
  });
  combat.setEnemies([e]);
  const dt = 1 / 60;
  combat.update(dt, ctxFor(kind));
  played = hero.control?.name;
  for (let i = 0; i < 300 && hero.control && miss === null; i++) {
    combat.update(dt, ctxFor(null));
    if (hero.control && hero.control.update(dt, ctxFor(null))) hero.control = null;
  }
  return { miss, played, gap: Math.hypot(e.pos.x - hero.pos.x, e.pos.z - hero.pos.z) };
}

// Every strike clip the hero tables and the movement moves name that strikes forward with a limb.
const TABLE = new Map();
const add = (c, kind) => { const r = MOCAP_DATA[c] ?? COMBAT2[c]; if (r?.reach && Math.hypot(r.reach.x, r.reach.z) >= 0.3 && !TABLE.has(c)) TABLE.set(c, kind); };
for (const tier of BATMAN_MOVES.punchTiers) for (const c of tier) add(c, 'punch');
for (const c of BATMAN_MOVES.finishers.punch) add(c, 'punch');
for (const c of BATMAN_MOVES.kicks) add(c, 'kick');
for (const c of BATMAN_MOVES.finishers.kick) add(c, 'kick');
for (const c of BATMAN_MOVES.counters) add(c, 'punch');
for (const m of MOVE_TABLE) if (!m.air && m.id !== 'stomp') add(m.clip, m.action);

const CASES = [
  { name: 'straight ahead, close', x: 0, z: 1.7 },
  { name: 'off to the side', x: 0.9, z: 2.1 },
  { name: 'far side, longer', x: -1.2, z: 2.7 },
  { name: 'moving away and across', x: 0.4, z: 2.2, vx: 1.2, vz: 0.8 },
];

describe('limb on target at contact, every strike in the tables', () => {
  it('covers the tables', () => expect(TABLE.size).toBeGreaterThan(20));
  for (const [clip, kind] of TABLE) {
    it(`${clip}`, () => {
      expect(clipInfo(clip)?.events?.contact, `${clip} has a contact event`).toBeTypeOf('number');
      for (const c of CASES) {
        const r = strikeOnce(clip, kind, c);
        expect(r.miss, `${clip} ${c.name}: no contact`).not.toBeNull();
        // Inside the target's body (radius 0.42) give or take a few centimetres.
        expect(r.miss, `${clip} ${c.name}: limb ${r.miss?.toFixed(2)} m from centre`).toBeLessThan(0.5);
      }
    });
  }
});
