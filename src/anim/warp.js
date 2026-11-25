// Motion warping for strikes (docs/design/research/combat-animation-assets.md 1.1): instead of
// snapping the facing and sliding the body along a separate lunge curve, the clip's own root
// motion is skewed so the striking limb arrives on the target on the clip's `contact` frame.
//
// - Translation: inside the warp window [warpStart, contact] each frame adds the clip's authored
//   root step plus a share of the remaining correction (where the root must be at contact, less
//   the authored motion still to come), so the correction is spread over the window in clip time.
// - Rotation: eased from the start of the move to `rotateAt` (65%) of the window, then frozen: the
//   limb travels straight into the target instead of turning on impact.
// - Cap: the total correction is limited to `maxWarp` (2.5 m for strikes). Longer gaps are the move
//   selector's job (a travel strike whose authored motion covers them), never a faster lunge.
// - Target drift is tracked until contact; from contact on only the authored root motion plays.
// Pure and allocation-free per step: begin() once per strike, step() per frame writes into `out`.
import { rootMotionAt } from '../combat/reach.js';

export const MAX_WARP = 2.5;
export const ROTATE_AT = 0.65;

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
// Clip space (x = the character's left, z = forward) to world for a facing `yaw` (atan2(x, z)).
const rotX = (yaw, x, z) => Math.cos(yaw) * x + Math.sin(yaw) * z;
const rotZ = (yaw, x, z) => -Math.sin(yaw) * x + Math.cos(yaw) * z;

// entry: { contact, reach: {x, z}, root, fps, events? } (a reach-table / clipInfo record).
export function createStrikeWarp(entry, { startAt = 0, warpStart = null, contact = null, maxWarp = MAX_WARP, rotateAt = ROTATE_AT, inside = 0.15, gap = 0.25, fallbackReach = 0.9 } = {}) {
  const c = contact ?? entry?.events?.contact ?? entry?.contact ?? startAt + 0.15;
  const ws = Math.min(c, Math.max(startAt, warpStart ?? entry?.events?.warpStart ?? startAt));
  const rotUntil = ws + (c - ws) * rotateAt;
  const reachX = entry?.reach?.x ?? 0, reachZ = entry?.reach?.z ?? fallbackReach;
  const reachLen = Math.hypot(reachX, reachZ), reachAng = Math.atan2(reachX, reachZ);
  const a = [0, 0], b = [0, 0], k = [0, 0];
  rootMotionAt(entry, c, k);
  const rmContactX = k[0], rmContactZ = k[1];
  let used = 0, frozenYaw = null, goalYaw = 0;
  const plan = { goalX: 0, goalZ: 0, goalYaw: 0, need: 0 };

  // Where the root must be on the contact frame, and the yaw that lines the limb up, for a target
  // at (tx, tz) seen from (px, pz). Writes plan.
  function goal(px, pz, tx, tz, radius, scale) {
    const dx = tx - px, dz = tz - pz, d = Math.hypot(dx, dz) || 1e-6;
    const ux = dx / d, uz = dz / d;
    const baseYaw = Math.atan2(dx, dz);
    // The limb lands a little inside the body; the root keeps a gap outside its radius.
    const lx = tx - ux * inside * scale, lz = tz - uz * inside * scale;
    let gx = lx - Math.sin(baseYaw) * reachLen, gz = lz - Math.cos(baseYaw) * reachLen;
    const sx = gx - tx, sz = gz - tz, sd = Math.hypot(sx, sz), min = radius + gap;
    // A short reach (a knee, a jab) stops short instead of standing inside the target.
    if (sd < min) { gx = tx - ux * min; gz = tz - uz * min; }
    plan.goalX = gx; plan.goalZ = gz; plan.goalYaw = baseYaw - reachAng;
    plan.need = Math.hypot(gx - px, gz - pz);
    return plan;
  }

  return {
    contact: c, warpStart: ws, rotateUntil: rotUntil, maxWarp,
    get used() { return used; },
    goal,
    // How far the correction would have to stretch for a target this far: the move selector's
    // test (> maxWarp means pick a longer move).
    stretchFor(dist, radius = 0.42, scale = 1) {
      rootMotionAt(entry, startAt, a);
      const authored = rmContactZ - a[1];
      const p = goal(0, 0, 0, dist, radius, scale);
      return Math.abs(p.need - authored);
    },
    // One frame: clip time c0 -> c1. pos/yaw: the actor now; target: { x, z, radius, scale }.
    // out: { dx, dz, yaw } (the step to apply and the new facing).
    step(c0, c1, px, pz, yaw, target, out) {
      rootMotionAt(entry, c0, a);
      rootMotionAt(entry, c1, b);
      const rx = b[0] - a[0], rz = b[1] - a[1];
      let nyaw = yaw;
      if (c0 < c) {
        goal(px, pz, target.x, target.z, target.radius ?? 0.42, target.scale ?? 1);
        goalYaw = plan.goalYaw;
      }
      // Rotation: ease toward the goal until rotateUntil, then hold.
      if (frozenYaw === null) {
        if (c1 >= rotUntil || c0 >= c) { nyaw = c0 < c ? goalYaw : yaw; frozenYaw = nyaw; }
        else {
          const span = Math.max(1e-4, rotUntil - c0);
          nyaw = yaw + angleDiff(goalYaw, yaw) * Math.min(1, (c1 - c0) / span);
        }
      } else nyaw = frozenYaw;
      let dx = rotX(nyaw, rx, rz), dz = rotZ(nyaw, rx, rz);
      // Translation correction inside the window.
      if (c1 > ws && c0 < c) {
        const from = Math.max(c0, ws);
        rootMotionAt(entry, Math.max(c1, from), b);
        const remX = rmContactX - b[0], remZ = rmContactZ - b[1];
        const wx = rotX(frozenYaw ?? goalYaw, remX, remZ), wz = rotZ(frozenYaw ?? goalYaw, remX, remZ);
        // Where the root would end up with the authored motion only (after this frame's step).
        let cx = plan.goalX - (px + dx + wx), cz = plan.goalZ - (pz + dz + wz);
        const frac = Math.min(1, (c1 - from) / Math.max(1e-4, c - from));
        cx *= frac; cz *= frac;
        const len = Math.hypot(cx, cz), left = Math.max(0, maxWarp - used);
        if (len > left) { const s = left / len; cx *= s; cz *= s; }
        used += Math.min(len, left);
        dx += cx; dz += cz;
      }
      out.dx = dx; out.dz = dz; out.yaw = nyaw;
      return out;
    },
  };
}

// The facing after `dt` of turning toward `goal` at `rate` (1/s, critically damped feel): the
// replacement for ch.face() snaps (counters, dodges, throws, batarangs). Never faster than
// `maxSpeed` rad/s (anim2: at rate 20 a half turn swung 60 degrees in the first frame). Pure.
export function turnToward(yaw, goal, rate, dt, maxSpeed = 14) {
  const d = angleDiff(goal, yaw);
  const step = d * Math.min(1, rate * dt), cap = maxSpeed * dt;
  return yaw + Math.max(-cap, Math.min(cap, step));
}

export { angleDiff };
