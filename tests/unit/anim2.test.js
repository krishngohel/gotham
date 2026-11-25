// Workstream I2 (anim2): the dead blend's adaptive length and offset form, the paired-move maths,
// the dropped knife, the story armour break.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { adaptiveBlend, createDeadBlend } from '../../src/anim/deadBlend.js';
import { pairRel, pairYawFor, pairX, pairZ } from '../../src/anim/paired.js';
import { DIFFICULTY } from '../../src/combat/rules.js';
import { createRng } from '../../src/core/rng.js';

describe('adaptive dead-blend length', () => {
  it('keeps the asked length for close poses and stretches for far ones, within its caps', () => {
    expect(adaptiveBlend(0.1, 0.2)).toBe(0.1);
    const far = adaptiveBlend(0.1, 4);
    expect(far).toBeGreaterThan(0.2);
    expect(far).toBeLessThanOrEqual(0.38);
    expect(adaptiveBlend(0.1, 4, 0, 0.15)).toBe(0.15); // a strike's cap
    expect(adaptiveBlend(0.1, 0, 0.5)).toBeGreaterThan(0.1); // the hips' offset counts too
  });
});

describe('dead blend, offset form', () => {
  it('follows a clip spinning past 180 degrees from the held pose without a jump', () => {
    const bone = new THREE.Bone();
    bone.name = 'spine_01';
    const db = createDeadBlend([bone], null);
    const yAxis = new THREE.Vector3(0, 1, 0);
    // The old pose: still.
    for (let i = 0; i < 3; i++) { bone.quaternion.identity(); db.apply(1 / 60); db.record(1 / 60); }
    db.start(0.1);
    // The new clip spins the bone steadily from 150 to 330 degrees (it passes "opposite" mid-blend).
    let prev = null, worst = 0;
    for (let f = 0; f < 30; f++) {
      bone.quaternion.setFromAxisAngle(yAxis, THREE.MathUtils.degToRad(150 + f * 6));
      db.apply(1 / 60);
      const q = bone.quaternion.clone();
      if (prev) worst = Math.max(worst, prev.angleTo(q));
      prev = q;
      db.record(1 / 60);
    }
    // One frame never turns it more than the clip's own 6 degrees plus the blend's share.
    expect(THREE.MathUtils.radToDeg(worst)).toBeLessThan(25);
    // And it ends on the clip.
    expect(prev.angleTo(new THREE.Quaternion().setFromAxisAngle(yAxis, THREE.MathUtils.degToRad(150 + 29 * 6)))).toBeLessThan(1e-3);
  });
  it('re-applies the offset to a bone the new clip does not animate instead of stacking it', () => {
    const bone = new THREE.Bone();
    const db = createDeadBlend([bone], null);
    bone.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.8);
    for (let i = 0; i < 3; i++) { db.apply(1 / 60); db.record(1 / 60); }
    db.start(0.2);
    // The new clip has no track for it: the mixer leaves whatever was shown. Its raw pose is the
    // identity the clip "wrote" on the first frame.
    bone.quaternion.identity();
    const shown = [];
    for (let f = 0; f < 30; f++) { db.apply(1 / 60); shown.push(bone.quaternion.clone()); db.record(1 / 60); }
    // Monotonic decay toward identity, never overshooting past the start.
    const ang = shown.map((q) => q.angleTo(new THREE.Quaternion()));
    for (let i = 1; i < ang.length; i++) expect(ang[i]).toBeLessThanOrEqual(ang[i - 1] + 1e-6);
    expect(ang[ang.length - 1]).toBeLessThan(1e-3);
  });
});

describe('paired moves', () => {
  const att = { fps: 10, root: [0, 0, 0, 1, 0, 2] }, vic = { fps: 10, root: [0, 0, 0.5, 0, 1, 0], pair: { with: 'A', offset: [0, 3] } };
  it('the victim sits at offset + his root motion - the attacker\'s', () => {
    expect(pairRel(att, vic, 0)).toEqual([0, 3]);
    const r = pairRel(att, vic, 0.1);
    expect(r[0]).toBeCloseTo(0.5); expect(r[1]).toBeCloseTo(2);
  });
  it('the pair yaw turns the take so the victim lands where he stands', () => {
    const rel = [0.5, 2];
    const dx = 3, dz = -1; // where he really is, from the attacker
    const yaw = pairYawFor(rel, dx, dz);
    const wx = pairX(yaw, rel[0], rel[1]), wz = pairZ(yaw, rel[0], rel[1]);
    expect(Math.atan2(wx, wz)).toBeCloseTo(Math.atan2(dx, dz));
  });
});

describe('story armour break', () => {
  it('is a story-only tuning knob', () => {
    expect(DIFFICULTY.story.armorBreak).toBeGreaterThan(0);
    for (const d of ['normal', 'hard', 'knightmare']) expect(DIFFICULTY[d].armorBreak).toBeUndefined();
  });
});

vi.mock('../../src/actors/characters.js', () => ({
  createGoon: () => {
    const ch = {
      root: new THREE.Group(), yaw: 0, prop: { visible: true },
      face(y) { ch.yaw = y; }, headWorld: (v) => v,
      animator: {
        current: null, prime: () => {},
        play(name, o = {}) { ch.animator.current = { name, timeScale: o.timeScale ?? 1, time: o.startAt ?? 0, getClip: () => ({ name, duration: 2 }) }; return ch.animator.current; },
        get currentAction() { return ch.animator.current; },
        get currentName() { return ch.animator.current?.name ?? null; },
        update: () => {}, has: () => true, mixer: { timeScale: 1 },
      },
      groundAt: null,
    };
    return ch;
  },
  footGround: () => () => 0,
  enemyPlantsFeet: () => false,
}));
vi.mock('../../src/heroes/models/props.js', () => ({ createProp: () => new THREE.Group(), attachProp: (ch, p) => p }));

describe('the knife goon\'s knife', () => {
  it('disappears from his hand when he drops it and comes back when he picks a knife up again', async () => {
    const { createEnemy } = await import('../../src/actors/enemy.js');
    const collision = { resolveCylinder: () => ({ groundY: 0 }), groundBelow: () => 0 };
    const e = createEnemy({ id: 'k', type: 'knife', assets: {}, scene: { add() {}, remove() {} }, collision, rng: createRng(3) });
    expect(e.weapon).toBe('knife');
    expect(e.ch.prop.visible).toBe(true);
    e.dropWeapon();
    expect(e.weapon).toBe(null);
    expect(e.ch.prop.visible).toBe(false);
    e.arm('knife');
    expect(e.ch.prop.visible).toBe(true);
  });
});
