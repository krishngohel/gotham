// [sandbox] Drift and jump scoring (pure; tests/unit/sandbox.test.js). The runtime feeds it the
// driven car's speed, its sideways slip and its air time; it answers with scores to show.
//
// A drift: sideways slip over SLIP m/s at over MIN_SPEED m/s. Points grow with slip x speed and a
// multiplier that climbs the longer the drift is held (x1 .. x4). Straightening up for GRACE
// seconds banks it; a crash (a big drop in speed) loses it.
// A jump: air time over MIN_AIR seconds. Points from air time, distance and landing speed; a clean
// landing (still fast) doubles it.

export const DRIFT = Object.freeze({ SLIP: 2.6, MIN_SPEED: 9, GRACE: 0.9, MIN_BANK: 150, MULT_EVERY: 1.6, MAX_MULT: 4 });
export const JUMP = Object.freeze({ MIN_AIR: 0.7, CLEAN_SPEED: 12 });

export function createDrift() { return { on: false, t: 0, grace: 0, pts: 0, mult: 1, lastSpeed: 0 }; }

// Returns null, or { banked: points } when a drift ends well, or { lost: points } on a crash.
export function driftStep(d, { dt, speed, slip }) {
  const drifting = Math.abs(slip) > DRIFT.SLIP && speed > DRIFT.MIN_SPEED;
  const crashed = d.on && d.lastSpeed - speed > 9;
  d.lastSpeed = speed;
  if (crashed) { const lost = Math.round(d.pts); reset(d); return lost > 0 ? { lost } : null; }
  if (drifting) {
    if (!d.on) { d.on = true; d.t = 0; d.pts = 0; d.mult = 1; }
    d.t += dt; d.grace = DRIFT.GRACE;
    d.mult = Math.min(DRIFT.MAX_MULT, 1 + Math.floor(d.t / DRIFT.MULT_EVERY));
    d.pts += Math.abs(slip) * speed * dt * 2 * d.mult;
    return null;
  }
  if (!d.on) return null;
  d.grace -= dt;
  if (d.grace > 0) return null;
  const pts = Math.round(d.pts);
  reset(d);
  return pts >= DRIFT.MIN_BANK ? { banked: pts } : null;
}
function reset(d) { d.on = false; d.t = 0; d.grace = 0; d.pts = 0; d.mult = 1; }

// air: seconds airborne; dist: metres covered; land: speed on landing (m/s).
export function jumpScore({ air = 0, dist = 0, land = 0 } = {}) {
  if (air < JUMP.MIN_AIR) return 0;
  const base = air * 220 + dist * 9;
  return Math.round(base * (land >= JUMP.CLEAN_SPEED ? 2 : 1));
}

export function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
