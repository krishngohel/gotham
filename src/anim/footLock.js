// Foot locking during strikes, counters and reactions (docs/design/research/combat-animation-assets.md
// 1.7): when the clip plants a foot (its footL / footR event), that foot is held where it landed
// in the world while the warp moves the body, using the two-bone leg IK (src/actors/limbIK.js),
// so the warp's stretch reads as a step on a planted foot instead of a skate.
//
// anim2 rewrite. The first version (workstream I) made the audit worse and was switched off on
// every tier; why:
// - it locked on the event alone, even when the foot was not on the floor at that moment (a
//   plant event at frame 0 of a clip still blending in from a kick, a knockdown's flailing feet),
//   so the "planted" foot hung in the air and was dragged;
// - it held a fixed 0.32 s whatever the clip did, so a foot the clip had already lifted for the
//   next step stayed nailed down until the leg stretched 0.3 m and the lock let go;
// - the release was a linear 0.1 s fade over up to 0.3 m: a velocity step of ~3 m/s, one pop
//   per release, and the knockdown/get-up states (the feet leave the floor) were locked too.
// Now a lock arms only on a foot that really is down (low in root space, nearly still in the
// clip), lets go as soon as the clip lifts the foot or the leg stretches 0.22 m, and eases out
// on a smoothstep over a time scaled to how far the foot has to travel back.
//
// Runs as a post-mix hook (animator.after) so it poses on top of the clip and before dead
// blending records the pose. Allocation-free per frame. Medium tier and up (src/anim/quality.js).
import * as THREE from 'three';
import { solveTwoBone } from '../actors/limbIK.js';

let enabled = false; // src/anim/quality.js turns it on from the medium tier up
export function setFootLockEnabled(on) { enabled = !!on; }
export const footLockEnabled = () => enabled;

const DOWN_Y = 0.16;    // m: a foot (ankle bone) higher than this above the root is in the air
const STILL_V = 0.9;    // m/s: the clip is moving the foot faster than this (lifting, sliding)
const SLIP = 0.22;      // m: the leg has stretched this far from the clip's foot: let go
const FADE_IN = 0.06;   // s
const OUT_MIN = 0.1, OUT_MAX = 0.24, OUT_SPEED = 1.2; // s, s, m/s: the ease back to the clip's foot

const pole = new THREE.Vector3(), cur = new THREE.Vector3(), loc = new THREE.Vector3();
const smooth = (w) => w * w * (3 - 2 * w);

// grounded(): whether the character stands on something (a kick in the air has its feet near the
// root, which would otherwise read as planted).
export function createFootLock(ch, { grounded = () => true } = {}) {
  const side = (s) => {
    const thigh = ch.bone(`thigh_${s}`), calf = ch.bone(`calf_${s}`), foot = ch.bone(`foot_${s}`);
    return thigh && calf && foot ? { thigh, calf, foot, want: false, armed: false, w: 0, out: OUT_MIN, target: new THREE.Vector3(), prev: new THREE.Vector3(), hasPrev: false } : null;
  };
  const legs = [side('l'), side('r')].filter(Boolean);
  const bySide = { l: legs.find((l) => l.foot.name.endsWith('_l')) ?? null, r: legs.find((l) => l.foot.name.endsWith('_r')) ?? null };
  return {
    // A plant event: lock the foot where the clip puts it this frame, if it is really down.
    plant(s) {
      const leg = bySide[s === 'footL' || s === 'l' ? 'l' : 'r'];
      if (!leg || !enabled) return;
      leg.want = true; leg.armed = false;
    },
    release() { for (const leg of legs) if (leg.want) { leg.want = false; leg.out = OUT_MAX * 0.75; } },
    get active() { return legs.some((l) => l.w > 0); },
    apply(dt) {
      if (!legs.length) return;
      ch.root.updateMatrixWorld(true);
      ch.forward(pole);
      pole.y = 0.15;
      for (const leg of legs) {
        leg.foot.getWorldPosition(cur);
        loc.copy(cur);
        ch.root.worldToLocal(loc);
        const v = dt > 0 && leg.hasPrev ? Math.hypot(loc.x - leg.prev.x, loc.z - leg.prev.z) / dt : 0;
        const down = loc.y < DOWN_Y && v < STILL_V && grounded();
        if (leg.want && !leg.armed) {
          if (down) { leg.target.copy(cur); leg.armed = true; } else leg.want = false;
        } else if (leg.want && dt > 0 && (!down || cur.distanceTo(leg.target) > SLIP)) {
          // The clip lifts the foot for its next step, or the leg would stretch: let go, easing
          // back over a time that keeps the foot's speed sane.
          leg.want = false;
          leg.out = Math.min(OUT_MAX, Math.max(OUT_MIN, cur.distanceTo(leg.target) / OUT_SPEED));
        }
        if (dt > 0) {
          leg.w = leg.want && leg.armed ? Math.min(1, leg.w + dt / FADE_IN) : Math.max(0, leg.w - dt / leg.out);
          leg.prev.copy(loc); leg.hasPrev = true;
        }
        if (leg.w > 0 && leg.armed) solveTwoBone(leg.thigh, leg.calf, leg.foot, leg.target, pole, smooth(leg.w));
        else if (leg.w <= 0 && !leg.want) leg.armed = false;
      }
    },
  };
}
