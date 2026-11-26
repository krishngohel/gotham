import { describe, it, expect } from 'vitest';
import { createStrikeWarp, turnToward, MAX_WARP } from '../../src/anim/warp.js';
import { clipInfo } from '../../src/anim/clips.js';

// Plays one strike's warp frame by frame against a (possibly moving) target. Returns where the
// limb is on the contact frame and the yaw history.
function run(name, { dist = 2.4, side = 0, yaw0 = 0, vx = 0, vz = 0, startAt = 0, speed = 1.3, dt = 1 / 60 } = {}) {
  const info = clipInfo(name);
  const warp = createStrikeWarp(info, { startAt });
  const target = { x: side, z: dist, radius: 0.42, scale: 1 };
  let px = 0, pz = 0, yaw = yaw0, c = startAt;
  const out = { dx: 0, dz: 0, yaw: 0 };
  const yaws = [];
  let limb = null, tAtContact = null;
  for (let i = 0; i < 400 && c < info.events.contact + 0.3; i++) {
    const c1 = c + dt * speed;
    warp.step(c, c1, px, pz, yaw, target, out);
    px += out.dx; pz += out.dz; yaw = out.yaw;
    yaws.push(yaw);
    if (limb === null && c1 >= warp.contact) {
      const r = info.reach;
      limb = { x: px + Math.cos(yaw) * r.x + Math.sin(yaw) * r.z, z: pz - Math.sin(yaw) * r.x + Math.cos(yaw) * r.z };
      tAtContact = { x: target.x, z: target.z, px, pz };
    }
    c = c1;
    if (c1 < warp.contact) { target.x += vx * dt; target.z += vz * dt; }
  }
  return { limb, target: tAtContact, yaws, warp, info };
}
const miss = ({ limb, target }) => {
  // The limb should land 0.15 m inside the near side of the target's centre line.
  const dx = target.x - target.px, dz = target.z - target.pz, d = Math.hypot(dx, dz);
  const aimX = target.x - (dx / d) * 0.15, aimZ = target.z - (dz / d) * 0.15;
  return Math.hypot(limb.x - aimX, limb.z - aimZ);
};

describe('motion warping', () => {
  for (const name of ['Punch_Jab', 'Punch_Cross', 'Kick_Front', 'Kick_Round', 'Punch_BodyHook', 'Kick_SideRound']) {
    it(`${name}: the limb lands on a target off to the side and at a different distance`, () => {
      for (const [dist, side] of [[1.9, 0], [2.6, 0.8], [3.2, -1.1], [1.6, 0.4]]) {
        const r = run(name, { dist, side, startAt: 0 });
        expect(miss(r), `${name} @ ${dist},${side}`).toBeLessThan(0.12);
      }
    });
  }
  it('tracks a target that keeps moving until contact', () => {
    const r = run('Kick_Front', { dist: 2.5, side: 0.3, vx: 1.2, vz: 0.8 });
    expect(miss(r)).toBeLessThan(0.12);
  });
  it('turns smoothly (no snap) and finishes turning before contact', () => {
    const r = run('Punch_Cross', { dist: 2.2, side: 1.8, yaw0: -1.2 });
    let maxStep = 0;
    for (let i = 1; i < r.yaws.length; i++) maxStep = Math.max(maxStep, Math.abs(r.yaws[i] - r.yaws[i - 1]));
    // A 1.9 rad turn spread over the window: no single frame does more than ~a third of it.
    expect(maxStep).toBeLessThan(0.8);
    expect(r.warp.rotateUntil).toBeLessThan(r.warp.contact);
  });
  it('never stretches more than the cap', () => {
    const r = run('Punch_Jab', { dist: 9 });
    expect(r.warp.used).toBeLessThanOrEqual(MAX_WARP + 1e-6);
    expect(r.warp.stretchFor(9)).toBeGreaterThan(MAX_WARP);
    expect(r.warp.stretchFor(1.8)).toBeLessThan(MAX_WARP);
  });
  it('turnToward eases and never overshoots', () => {
    expect(turnToward(0, 1, 10, 0.05)).toBeCloseTo(0.5);
    expect(turnToward(0, 1, 10, 1)).toBeCloseTo(1);
    const w = turnToward(3, -3, 100, 1);
    expect(Math.cos(w)).toBeCloseTo(Math.cos(-3));
    expect(Math.sin(w)).toBeCloseTo(Math.sin(-3));
  });
});
