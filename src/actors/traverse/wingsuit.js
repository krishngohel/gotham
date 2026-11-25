// The wingsuit glide (workstream L3, `[move]`): the hero's glide state when the wingsuit upgrade
// is owned (src/traversal/moves.js `wingsuit` > 0). The physics is the pure flight model
// (src/traversal/flightModel.js); this maps the controls onto it and poses the body.
//
// Controls (the same as the cape glide, so nothing new to learn): look down or hold sprint to
// dive, look up or pull back to climb, steer with the camera and the stick (it banks into the
// turn), crouch for the air brake. Rising air (h.updrafts, set by game.js) lifts it; the weather's
// wind (h.wind: { x, z }) drifts it.
import { createFlightState, enterFlight, stepFlight, wingsuitProfile } from '../../traversal/flightModel.js';

export function createWingsuit(h) {
  const s = createFlightState();
  let profile = null;
  const input = { pitch: 0, turn: 0, brake: false, updraft: 0, dt: 0 };
  return {
    state: s,
    get profile() { return profile; },
    enter(fallbackHeading) {
      profile = wingsuitProfile(h.moves.wingsuit, h.trav);
      enterFlight(s, h.vel.x, h.vel.y, h.vel.z, profile, fallbackHeading);
      h.glide.speed = s.speed;
      h.glide.heading = s.heading;
    },
    // ctrl: -1 climb .. +1 dive (hero.js computes it the cape glide's way); want: the yaw to steer
    // toward. Writes h.vel and the body's lean. Returns the frame's turn rate (rad/s).
    step(dt, ctrl, want, brake) {
      const delta = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading));
      input.pitch = ctrl;
      input.turn = Math.max(-1, Math.min(1, delta * 1.6));
      input.brake = brake && h.moves.wingsuit >= 1;
      input.updraft = h.updrafts ? h.updrafts.at(h.pos.x, h.pos.y, h.pos.z) * (h.moves.updraftMul ?? 1) : 0;
      input.dt = dt;
      stepFlight(s, input, profile);
      // [verify] Nothing ever set h.wind; game.js gives every hero the weather's wind with its gusts
      // (hero.envWind = world.windVec, [x, z] m/s, the capes read it), so the drift reads that.
      const wx = h.wind?.x ?? h.envWind?.[0] ?? 0, wz = h.wind?.z ?? h.envWind?.[1] ?? 0;
      h.vel.set(s.vx + wx * 0.35, s.vy, s.vz + wz * 0.35);
      h.glide.speed = s.speed;
      h.glide.heading = s.heading;
      h.glide.ctrl = ctrl;
      h.glide.stalled = s.stalled;
      h.glide.updraft = input.updraft;
      h.bat.face(s.heading);
      // Nose follows the path; the body rolls with the bank (more than the cape glide's lean).
      const lean = 1.15 - s.gamma * 0.6;
      h.bat.tilt.rotation.x += (lean * h.bat.lm.fwd - h.bat.tilt.rotation.x) * Math.min(1, dt * 6);
      h.bat.tilt.rotation.z += (-s.roll * 0.9 - h.bat.tilt.rotation.z) * Math.min(1, dt * 6);
      return s.turnRate;
    },
    // Lost speed against a wall: the suit stops flying.
    get speed() { return s.speed; },
  };
}
