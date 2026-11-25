// [balance] Local avoidance and a stuck detector for anyone on foot steered straight at a point
// (GCPD officers in src/wanted/units.js, goons in src/actors/enemy.js). Direct steering into a
// building corner used to leave them walking on the spot: resolveCylinder pushes them back out
// every frame and the goal is still dead ahead.
//
// Sliced and allocation-free: an agent probes the way ahead (one ray, then up to four fanned ones
// only when that is blocked) at most every PROBE_EVERY seconds and keeps the chosen deflection in
// its own state object until the next probe. Between probes a frame costs a few multiplies.
//
//   const st = createAvoidState();
//   avoidSteer(st, collision, x, y, z, dirX, dirZ, dt)  -> st.dx, st.dz (unit), st.stuck (seconds)
// `stuck`: seconds of wanting to move without getting anywhere (less than 0.35 m per 1.2 s window).
// Callers re-route at 2 s and, where nobody can see, give up (despawn) at STUCK_GIVE_UP.
export const PROBE_EVERY = 0.25;
export const PROBE_DIST = 1.6;
export const STUCK_REROUTE = 2;
export const STUCK_GIVE_UP = 8;
const FAN = [0.6, -0.6, 1.2, -1.2];

const eye = { x: 0, y: 0, z: 0 }, dir = { x: 0, y: 0, z: 0 }, hit = { t: 0, box: null, normal: { x: 0, y: 0, z: 0 } };

export function createAvoidState() {
  return { t: Math.random() * PROBE_EVERY, angle: 0, dx: 0, dz: 0, stuck: 0, win: 0, wx: NaN, wz: NaN, side: 1 };
}

function clear(collision, x, y, z, ax, az) {
  eye.x = x; eye.y = y + 0.9; eye.z = z;
  dir.x = ax; dir.y = 0; dir.z = az;
  return !collision.raycast(eye, dir, PROBE_DIST, hit);
}

// Pure decision for tests: given which of [ahead, +0.6, -0.6, +1.2, -1.2] are clear, the angle to
// turn (0 when ahead is clear; the side preference breaks ties toward the last side taken).
export function pickDeflection(clearAhead, clearFan, side = 1) {
  if (clearAhead) return 0;
  for (let i = 0; i < FAN.length; i += 2) {
    const a = FAN[i] * side, b = FAN[i + 1] * side;
    if (clearFan[side > 0 ? i : i + 1]) return a;
    if (clearFan[side > 0 ? i + 1 : i]) return b;
  }
  return 1.57 * side; // boxed in: slide along the wall
}

const fanClear = [false, false, false, false];
export function avoidSteer(st, collision, x, y, z, dirX, dirZ, dt) {
  const l = Math.hypot(dirX, dirZ) || 1;
  const ux = dirX / l, uz = dirZ / l;
  st.t -= dt;
  if (st.t <= 0 && collision?.raycast) {
    st.t = PROBE_EVERY;
    const ahead = clear(collision, x, y, z, ux, uz);
    if (ahead) st.angle = 0;
    else {
      for (let i = 0; i < FAN.length; i++) {
        const c = Math.cos(FAN[i]), s = Math.sin(FAN[i]);
        fanClear[i] = clear(collision, x, y, z, ux * c + uz * s, -ux * s + uz * c);
      }
      st.angle = pickDeflection(false, fanClear, st.side);
      if (st.angle) st.side = st.angle > 0 ? 1 : -1;
    }
  }
  const c = Math.cos(st.angle), s = Math.sin(st.angle);
  st.dx = ux * c + uz * s; st.dz = -ux * s + uz * c;
  // Progress over a 1.2 s window.
  if (Number.isNaN(st.wx)) { st.wx = x; st.wz = z; }
  st.win += dt;
  if (st.win >= 1.2) {
    const moved = Math.hypot(x - st.wx, z - st.wz);
    st.stuck = moved < 0.35 ? st.stuck + st.win : 0;
    if (st.stuck >= STUCK_REROUTE) st.side = -st.side; // try the other way round
    st.win = 0; st.wx = x; st.wz = z;
  }
  return st;
}
// Not moving on purpose (standing, attacking): the window restarts, nothing counts as stuck.
export function avoidIdle(st) { st.win = 0; st.wx = NaN; st.stuck = 0; }
