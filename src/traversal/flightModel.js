// The wingsuit flight model (workstream L3, `[move]`): a point-mass glider in energy terms. Pure,
// no three.js, no allocation in step(). The hero (src/actors/hero.js) owns position and collision;
// this owns speed, the flight-path angle, heading and bank.
//
//   speed v (m/s along the path), gamma (flight-path angle, + climbing), heading (yaw, forward is
//   (sin, cos)), roll (bank; positive roll turns toward positive yaw, the same sign as the `turn`
//   input), stalled.
//
// The physics is the energy exchange of a glider: dv/dt = -g sin(gamma) - drag(v), and the height
// changes by v sin(gamma) dt, so with no drag v^2/2 + g h is constant (tests/unit/flightModel.test.js
// checks that). Drag is c v^2 with c chosen so that level stick holds the profile's cruise speed at
// its glide angle (the equilibrium g sin(glideAngle) = c cruise^2). Diving (pitch +1) steepens the
// path and gravity builds speed toward a terminal speed; pulling up (pitch -1) raises the path and
// spends speed for height until the stall speed, where the nose drops whatever the stick says.
// Turns are banked: the turn rate is g tan(roll) / v (scaled by `turnGain`), so a fast suit turns
// wide and a slow one tight, and the air brake trades speed for control near a landing.

export const WINGSUIT = Object.freeze({
  1: Object.freeze({ g: 20, cruise: 17, glideAngle: 0.11, vMax: 56, vStall: 9, maxRoll: 0.8, rollRate: 2.6, gammaRate: 2.4, diveAngle: 1.1, climbAngle: 0.6, brake: 3.5, turnGain: 1.5 }),
  2: Object.freeze({ g: 20, cruise: 18, glideAngle: 0.1, vMax: 62, vStall: 8.5, maxRoll: 1.0, rollRate: 3.4, gammaRate: 2.8, diveAngle: 1.15, climbAngle: 0.65, brake: 4.5, turnGain: 1.75 }),
  // Tier 3 (the skill tree's "speed tunnel and top speed"): slipperier, a higher top speed.
  3: Object.freeze({ g: 20, cruise: 19, glideAngle: 0.09, vMax: 72, vStall: 8.5, maxRoll: 1.0, rollRate: 3.4, gammaRate: 2.8, diveAngle: 1.2, climbAngle: 0.65, brake: 4.5, turnGain: 1.75 }),
});

// The profile for a wingsuit tier and a kit's traversal profile: the future Batman's glider wings
// (style 'wings') cruise faster and dive to a higher top speed, the same way the cape glide does.
export function wingsuitProfile(tier, trav = null) {
  const base = WINGSUIT[Math.max(1, Math.min(3, tier | 0))] ?? WINGSUIT[1];
  if (trav?.style !== 'wings') return base;
  return Object.freeze({ ...base, cruise: Math.max(base.cruise, trav.glideCruise ?? 22), vMax: base.vMax + Math.max(0, (trav.glideMax ?? 48) - 48) });
}

export const dragCoef = (p) => (p.g * Math.sin(p.glideAngle)) / (p.cruise * p.cruise);
// Top speed reachable in a held dive (before the vMax cap).
export const terminalDive = (p) => Math.sqrt((p.g * Math.sin(p.diveAngle)) / dragCoef(p));

export function createFlightState() {
  return { speed: 0, gamma: 0, heading: 0, roll: 0, stalled: false, vx: 0, vy: 0, vz: 0, turnRate: 0 };
}

// Starts a flight from a world velocity (the glide entry: a jump, a grapple boost, an eject).
export function enterFlight(s, vx, vy, vz, p, fallbackHeading = 0) {
  const hs = Math.hypot(vx, vz);
  s.speed = Math.min(p.vMax, Math.max(p.cruise * 0.8, Math.hypot(hs, vy)));
  s.gamma = clamp(Math.atan2(vy, Math.max(1, hs)), -1.2, p.climbAngle);
  s.heading = hs > 1 ? Math.atan2(vx, vz) : fallbackHeading;
  s.roll = 0;
  s.stalled = false;
  writeVelocity(s, 0);
  return s;
}

// One step. input: { pitch -1 (pull up) .. +1 (dive), turn -1..1 (+1: turn so yaw increases),
// brake: bool, updraft: m/s of rising air here, dt }. Mutates and returns s; s.vx/vy/vz is the world
// velocity to move by this frame.
export function stepFlight(s, input, p) {
  const dt = input.dt;
  if (!(dt > 0)) return s;
  const pitch = clamp(input.pitch ?? 0, -1, 1), turn = clamp(input.turn ?? 0, -1, 1);
  const brake = !!input.brake;
  // Stall: below vStall the wing quits; it bites again a little above (hysteresis).
  if (s.speed < p.vStall) s.stalled = true;
  else if (s.speed > p.vStall + 3) s.stalled = false;
  let target;
  if (s.stalled) target = -0.6;
  else if (pitch > 0) target = -p.glideAngle - (p.diveAngle - p.glideAngle) * pitch;
  else if (pitch < 0) target = -p.glideAngle + (p.climbAngle + p.glideAngle) * -pitch;
  else target = -p.glideAngle;
  if (brake) target = Math.min(target, -0.3);
  const dg = clamp(target - s.gamma, -p.gammaRate * dt, p.gammaRate * dt);
  s.gamma = clamp(s.gamma + dg, -1.25, p.climbAngle);
  // Energy: gravity along the path, drag against it (the air brake multiplies it).
  const c = dragCoef(p) * (brake ? p.brake : 1);
  const v0 = s.speed;
  const a = -p.g * Math.sin(s.gamma) - c * v0 * v0;
  s.speed = clamp(v0 + a * dt, 0, p.vMax);
  // Bank toward the stick and turn with it (a coordinated turn: g tan(roll) / v).
  const wantRoll = turn * p.maxRoll;
  s.roll += clamp(wantRoll - s.roll, -p.rollRate * dt, p.rollRate * dt);
  s.turnRate = (p.g * Math.tan(s.roll) / Math.max(8, s.speed)) * p.turnGain;
  s.heading += s.turnRate * dt;
  writeVelocity(s, input.updraft ?? 0, (v0 + s.speed) * 0.5);
  return s;
}

// The world velocity for the current state (midpoint speed: the height change then matches the
// energy change, which keeps v^2/2 + g h steady with no drag).
function writeVelocity(s, updraft, v = s.speed) {
  const h = v * Math.cos(s.gamma);
  s.vx = Math.sin(s.heading) * h;
  s.vz = Math.cos(s.heading) * h;
  s.vy = v * Math.sin(s.gamma) + updraft;
}

// How a landing reads, from the velocity at touchdown: 'roll' (fast and shallow: a landing roll
// that keeps some of the speed), 'hard' (fast and steep: a heavy landing, a beat to recover),
// 'soft' (anything slow).
export function landingKind(vx, vy, vz) {
  const hs = Math.hypot(vx, vz);
  if (vy < -16) return 'hard';
  if (hs > 15) return vy < -9 ? 'hard' : 'roll';
  return 'soft';
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
