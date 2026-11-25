// [wanted] Who sees whom (pure; tests/unit/wantedRules.test.js). Built on the stealth system's
// cone maths (src/stealth/vision.js) so a GCPD officer and a goon see the same way; the runtime does
// the line-of-sight raycast afterwards, and only when these say yes (the cheap test first).
//
// Observers: { kind: 'officer'|'spotter'|'cruiser'|'heli', x, y, z, yaw, stun (seconds blind),
//              light: { x, z, r } for the helicopter's searchlight spot on the ground }
// Heroes:    { x, y, z, hidden (inside an interior / sewer: nobody outside sees in), crouched,
//              overhead (a deck, an awning or a roof over the head: the helicopter can't see),
//              driving }
// sight: { night 0..1, fog 0..1, rain 0..1 } from the environment.
import { inCone } from '../stealth/vision.js';

export const SIGHT = Object.freeze({
  officer: { range: 32, fov: (110 * Math.PI) / 180, lookUp: 7, instant: 4 },
  spotter: { range: 70, fov: (140 * Math.PI) / 180, lookUp: 30, instant: 6 },
  cruiser: { range: 48, fov: (120 * Math.PI) / 180, lookUp: 6, instant: 6 },
  // The pilot's own eyes, below the rotor: a ring around the aircraft (no cone), and the light.
  heli: { range: 38, fov: Math.PI * 2, lookUp: 200, instant: 0 },
});

// Range factor from the weather and the hour: fog hides most, rain some, night a little (the
// streets are lit; the rooftops are not, see `rooftopDark`).
export function weatherFactor({ night = 1, fog = 0, rain = 0 } = {}) {
  return Math.max(0.35, 1 - fog * 0.5 - rain * 0.15 - night * 0.1);
}

const pos = { x: 0, z: 0 };
// The distance at which observer o sees hero h, or -1. No raycast here.
export function canSee(o, h, sight = {}, out = null) {
  if (!o || !h || h.hidden || (o.stun ?? 0) > 0) return -1;
  const S = SIGHT[o.kind] ?? SIGHT.officer;
  const dx = h.x - o.x, dz = h.z - o.z, d = Math.hypot(dx, dz);
  const rise = h.y - o.y;
  if (rise > S.lookUp) return -1;
  if (rise < -40) return -1;
  let range = S.range * weatherFactor(sight);
  // Rooftops at night are dark: half the range from the street unless you are close.
  if (o.kind !== 'heli' && o.kind !== 'spotter' && rise > 4 && (sight.night ?? 1) > 0.5) range *= 0.55;
  if (h.crouched) range *= 0.7;
  if (h.driving) range *= 1.3; // a car is big and loud
  if (d > range) return -1;
  if (o.kind === 'heli') return h.overhead ? -1 : d;
  if (d < S.instant) return d;
  pos.x = h.x; pos.z = h.z;
  if (!inCone(o, o.yaw, pos, S.fov)) return -1;
  if (out) out.range = range;
  return d;
}

// The searchlight: a hero inside the lit spot on the ground (r metres) is seen, whatever the
// weather (that's the point of the light), unless something is over his head or he is inside.
export function inSearchlight(light, h) {
  if (!light || !h || h.hidden || h.overhead) return false;
  return Math.hypot(h.x - light.x, h.z - light.z) <= light.r;
}

// A call-in from a civilian: how long until it reaches dispatch (seconds) and how far off the
// reported position is (metres). r: a random number in [0, 1).
export function callDelay(r = 0.5) { return 4 + r * 5; }
export function callError(r = 0.5) { return 6 + r * 14; }

// Where the hidden heroes are, as searchDrain()'s spot: the LEAST hidden counts (one hero seen
// keeps the pursuit; two hidden heroes drain at the slower of their rates).
// spots: [{ safe, cover, rooftop, districtChanged, farFromLkp }] for each hidden hero.
export function worstSpot(spots, out = {}) {
  out.safe = true; out.cover = true; out.rooftop = true; out.districtChanged = true; out.farFromLkp = Infinity; out.weather = 0;
  if (!spots.length) { out.safe = false; out.cover = false; out.rooftop = false; out.districtChanged = false; out.farFromLkp = 0; return out; }
  for (const s of spots) {
    out.safe = out.safe && !!s.safe;
    out.cover = out.cover && !!(s.cover || s.safe);
    out.rooftop = out.rooftop && !!s.rooftop;
    out.districtChanged = out.districtChanged && !!s.districtChanged;
    out.farFromLkp = Math.min(out.farFromLkp, s.farFromLkp ?? 0);
    out.weather = s.weather ?? 0;
  }
  return out;
}
