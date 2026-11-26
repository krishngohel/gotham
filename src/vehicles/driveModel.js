// The Batmobile's (and the bikes') driving model on top of vehiclePhysics.js (workstream L3,
// `[move]`). Pure: no three.js, no allocation per step. vehicles.js owns the scene.
//
//   stepPursuit   PURSUIT mode: the arcade drive (stepDrive) plus a held power slide and
//                 countersteer recovery
//   stepHeat      afterburner heat: boost heats, coasting cools, full heat locks boost until it
//                 cools to `relock`
//   stepBattle    BATTLE mode: the body turns to the aim, the stick moves it in any direction,
//                 dodge thrusters kick it sideways
//   stepMode      the pursuit <-> battle transform (0..1, as the model's setMode wants it)
//   followGround  real ground under four wheels: slopes, ramps, decks, jumps and landings, with
//                 the probe rule that stops a fast car tunnelling through a deck
import { stepDrive, driveVelocity } from './vehiclePhysics.js';

export const PURSUIT_EXTRA = {
  slideHold: 0.7,       // 1/s: drift decay while a power slide is held (throttle, steer into it)
  counterRecover: 7,    // 1/s: drift decay with countersteer
  slideThreshold: 0.22, // |drift| that counts as a slide (skid marks, the 'vehicleSkid' event)
};

export function stepPursuit(v, input, dt, t, extra = PURSUIT_EXTRA) {
  const d0 = v.drift;
  stepDrive(v, input, dt, t);
  if (!input.handbrake && input.throttle > 0 && Math.abs(d0) > extra.slideThreshold) {
    const into = input.steer !== 0 && Math.sign(input.steer) === Math.sign(d0);
    const counter = input.steer !== 0 && !into;
    if (into) v.drift = d0 - d0 * Math.min(1, dt * extra.slideHold);
    else if (counter) v.drift = d0 - d0 * Math.min(1, dt * extra.counterRecover);
  }
  v.sliding = Math.abs(v.drift) > extra.slideThreshold && Math.abs(v.speed) > 6;
  return v;
}

// Heat: { heat 0..1, locked }. cap > 1 (the bmHeat1 upgrade) lasts longer.
export const HEAT = { burn: 4.5, cool: 3.2, relock: 0.35 };
export function stepHeat(h, wantBoost, dt, cap = 1, k = HEAT) {
  const boosting = wantBoost && !h.locked;
  if (boosting) h.heat = Math.min(1, h.heat + dt / (k.burn * cap));
  else h.heat = Math.max(0, h.heat - dt / k.cool);
  if (h.heat >= 1) h.locked = true;
  else if (h.locked && h.heat <= k.relock) h.locked = false;
  h.boosting = boosting;
  return boosting;
}

// Battle mode. v gains { lat (m/s sideways, + right), dodgeCd }. input: { moveX, moveY (-1..1),
// aimYaw (the yaw the turret looks along), dodge (pressed this frame) }.
export const BATTLE = { fwd: 13, back: 9, side: 11, accel: 16, turn: 3.2, dodge: 17, dodgeCd: 1.1, damp: 3.5 };
export function stepBattle(v, input, dt, b = BATTLE) {
  v.lat = v.lat ?? 0;
  v.dodgeCd = Math.max(0, (v.dodgeCd ?? 0) - dt);
  // [fix1] A car left parked in battle mode is still stepped, with the plain neutral input
  // (vehicles.js NEUTRAL_INPUT: no aimYaw, moveX or moveY): it holds its heading and coasts to a
  // stop. Undefined there made the yaw and then the position NaN, and the hero who climbed back in
  // was put at NaN (story: boardBatmobileAce2 after driving in the Ace battle).
  const aimYaw = Number.isFinite(input.aimYaw) ? input.aimYaw : v.yaw;
  const moveX = Number.isFinite(input.moveX) ? input.moveX : 0, moveY = Number.isFinite(input.moveY) ? input.moveY : 0;
  input = { ...input, aimYaw, moveX, moveY };
  // The body swings toward where the gun looks (the camera), so "forward" is always the aim.
  const dy = Math.atan2(Math.sin(input.aimYaw - v.yaw), Math.cos(input.aimYaw - v.yaw));
  v.yaw += Math.max(-b.turn * dt, Math.min(b.turn * dt, dy));
  const wantF = input.moveY >= 0 ? input.moveY * b.fwd : input.moveY * b.back;
  const wantS = input.moveX * b.side;
  const a = b.accel * dt;
  v.speed += Math.max(-a, Math.min(a, wantF - v.speed));
  // A dodge impulse decays on its own (damp), the stick's strafe is approached like the throttle.
  if (input.dodge && v.dodgeCd <= 0) {
    v.lat = (input.moveX !== 0 ? Math.sign(input.moveX) : 1) * b.dodge;
    v.dodgeCd = b.dodgeCd;
    v.dodged = true;
  } else v.dodged = false;
  if (Math.abs(v.lat) > b.side + 0.5) v.lat -= (v.lat - Math.sign(v.lat) * b.side) * Math.min(1, dt * b.damp);
  else v.lat += Math.max(-a, Math.min(a, wantS - v.lat));
  v.drift = 0;
  v.steer = 0;
  return v;
}
// World velocity in battle mode (right = (-cos, sin) as everywhere else in vehicles).
export function battleVelocity(v, out) {
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), rx = -Math.cos(v.yaw), rz = Math.sin(v.yaw);
  // + lat is the car's right, which in battle mode is the camera's right (the stick's +x).
  out.x = fx * v.speed + rx * (v.lat ?? 0);
  out.z = fz * v.speed + rz * (v.lat ?? 0);
  return out;
}
// Either mode's velocity.
export function modeVelocity(v, tuning, battle, out) { return battle ? battleVelocity(v, out) : driveVelocity(v, tuning, out); }

// The transform: m eases toward 1 (battle) or 0 (pursuit) over `dur` seconds.
export function stepMode(m, wantBattle, dt, dur = 0.7) {
  const step = dt / dur;
  return wantBattle ? Math.min(1, m + step) : Math.max(0, m - step);
}

// ---------------- ground following ----------------
// gs: { y, vy, air, airT, pitch, roll } (the caller keeps it per vehicle).
// h: four ground heights under the wheels [fl, fr, rl, rr] (-Infinity: nothing there), each
//    probed from no higher than y + STEP_UP, so a deck overhead is never "the ground" and a
//    car on the lower deck stays on the lower deck. Probed BEFORE this frame's fall, from the
//    current height: a surface the fall would pass through this frame is still found, and the
//    landing test below catches it (no tunnelling through a deck floor at any speed).
// geo: { wheelbase, track }. Returns 0, or the landing speed (m/s, negative) on the frame it lands.
export const STEP_UP = 0.9;
export const GROUND = { gravity: 26, snap: 0.45, maxClimb: 14 };
export function followGround(gs, h, dt, geo, k = GROUND) {
  let n = 0, sum = 0;
  for (let i = 0; i < 4; i++) if (h[i] > -Infinity) { n++; sum += h[i]; }
  const ground = n ? sum / n : -Infinity;
  let landed = 0;
  if (!gs.air) {
    // Off the end of a ramp, over a drop, or nothing under it: it flies, keeping the slope's rise.
    const drop = k.snap + Math.max(0, -gs.vy) * dt * 1.5;
    if (n < 2 || ground < gs.y - drop) {
      gs.air = true;
      gs.airT = 0;
    } else {
      const vy = (ground - gs.y) / Math.max(dt, 1e-4);
      gs.vy = Math.max(-k.maxClimb, Math.min(k.maxClimb, vy));
      gs.y = ground;
    }
  }
  if (gs.air) {
    gs.airT += dt;
    gs.vy -= k.gravity * dt;
    const next = gs.y + gs.vy * dt;
    if (n >= 1 && next <= ground && gs.vy <= 0) {
      landed = gs.vy;
      gs.y = ground;
      gs.vy = 0;
      gs.air = false;
    } else gs.y = next;
  }
  // Attitude from the wheels (when all four see ground), easing toward level in the air.
  if (!gs.air && n === 4) {
    gs.pitch = Math.atan2((h[0] + h[1]) / 2 - (h[2] + h[3]) / 2, geo.wheelbase);
    gs.roll = Math.atan2((h[0] + h[2]) / 2 - (h[1] + h[3]) / 2, geo.track);
  } else if (gs.air) {
    gs.pitch += (Math.max(-0.5, Math.min(0.4, gs.vy * 0.03)) - gs.pitch) * Math.min(1, dt * 2);
    gs.roll *= Math.max(0, 1 - dt * 2);
  }
  return landed;
}

// A bike's lean into a turn (radians): more with speed and steer, capped.
export function bikeLean(speed, steer, max = 0.62) {
  return Math.max(-max, Math.min(max, -steer * Math.min(1, Math.abs(speed) / 14) * max));
}
