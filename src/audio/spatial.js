// Positioned sound maths. Pure: no Web Audio, no three.js import, nothing allocated per call
// when the caller passes `out`. The audio engine turns the result into a gain, a StereoPanner
// value (or a PannerNode position on the upper tiers) and an occlusion low-pass.
//
// Listeners are plain objects so split screen can hand in two of them:
//   { x, y, z, rx, rz, fx, fz, indoors }
// (rx, rz) is the listener's right vector flattened onto the ground plane and (fx, fz) its
// forward vector; both unit length. `indoors` is true/false, or null when unknown.

export const SPATIAL_DEFAULTS = Object.freeze({
  ref: 4, // full volume inside this many metres
  max: 110, // silent beyond this
  rolloff: 1, // inverse-distance slope past `ref`
  near: 1.5, // closer than this the pan collapses toward the centre (a sound on top of you)
  splitWidth: 0.65, // two listeners share one stereo field, so each one's pan is narrowed
  occluded: 0.5, // gain kept when the listener and the source are on different sides of a wall
});

export function makeListener() {
  return { x: 0, y: 0, z: 0, rx: 1, rz: 0, fx: 0, fz: -1, indoors: null };
}

// Inverse-distance attenuation with a smooth fade to silence over the last 25% of `max`, so a
// sound never pops off at the edge of its range.
export function attenuation(dist, { ref = SPATIAL_DEFAULTS.ref, max = SPATIAL_DEFAULTS.max, rolloff = SPATIAL_DEFAULTS.rolloff } = SPATIAL_DEFAULTS) {
  const d = Math.max(0, Number(dist) || 0);
  if (d >= max) return 0;
  const inv = d <= ref ? 1 : ref / (ref + rolloff * (d - ref));
  const edge = max * 0.75;
  if (d <= edge) return inv;
  const x = (d - edge) / (max - edge); // 0..1 across the fade band
  return inv * (1 - x * x * (3 - 2 * x));
}

// Copies a three.js camera / Object3D world transform into a listener. Reads matrixWorld
// directly (column 0 = right, column 2 = back, column 3 = position), so no Vector3 is made.
export function listenerFromObject(obj, out = makeListener()) {
  const e = obj?.matrixWorld?.elements;
  if (!e) return out;
  out.x = e[12]; out.y = e[13]; out.z = e[14];
  let rx = e[0], rz = e[2];
  let len = Math.hypot(rx, rz);
  if (len > 1e-6) { out.rx = rx / len; out.rz = rz / len; }
  // forward is minus the back column
  const fx = -e[8], fz = -e[10];
  len = Math.hypot(fx, fz);
  if (len > 1e-6) { out.fx = fx / len; out.fz = fz / len; }
  return out;
}

// Accepts the forms other workstreams are likely to hand over:
//   { camera } / { object }    a three.js Object3D (matrixWorld is read)
//   { position, yaw }          yaw in radians, three.js convention (0 looks down -Z)
//   { x, y, z, yaw }           same, flattened
// plus an optional `indoors` flag. Writes into `out`.
export function readListener(src, out = makeListener()) {
  if (!src) return out;
  const obj = src.camera ?? src.object ?? (src.matrixWorld ? src : null);
  if (obj) listenerFromObject(obj, out);
  else {
    const p = src.position ?? src;
    if (Number.isFinite(p.x)) { out.x = p.x; out.y = Number(p.y) || 0; out.z = Number(p.z) || 0; }
    if (Number.isFinite(src.yaw)) {
      // three.js: an object with rotation.y = yaw looks down (-sin yaw, 0, -cos yaw)
      out.fx = -Math.sin(src.yaw); out.fz = -Math.cos(src.yaw);
      out.rx = Math.cos(src.yaw); out.rz = -Math.sin(src.yaw);
    }
  }
  out.indoors = typeof src.indoors === 'boolean' ? src.indoors : null;
  return out;
}

export function makeSpatialResult() {
  return { gain: 1, pan: 0, dist: 0, nearest: 0, muffle: 0, behind: 0, lx: 0, ly: 0, lz: 0 };
}

// Where a sound at `pos` sits for the given listeners.
//   gain    nearest-listener attenuation (the loudest listener wins), times occlusion
//   pan     -1..1, each listener's pan weighted by how loud it hears the sound
//   muffle  0..1, 1 when the loudest listener is on the other side of an indoor/outdoor wall
//   behind  0..1, how far behind the loudest listener the sound is (for a gentle rear filter)
//   lx/ly/lz  the source in the loudest listener's own frame (x right, y up, z back), for HRTF
// opts: { ref, max, rolloff, indoors } where `indoors` describes the source (null = unknown).
export function spatialize(listeners, pos, opts = SPATIAL_DEFAULTS, out = makeSpatialResult()) {
  const n = listeners ? listeners.length : 0;
  if (!n || !pos || !Number.isFinite(pos.x)) {
    out.gain = 1; out.pan = 0; out.dist = 0; out.nearest = 0; out.muffle = 0; out.behind = 0;
    out.lx = 0; out.ly = 0; out.lz = 0;
    return out;
  }
  const near = opts.near ?? SPATIAL_DEFAULTS.near;
  const occluded = opts.occluded ?? SPATIAL_DEFAULTS.occluded;
  const srcIndoors = typeof opts.indoors === 'boolean' ? opts.indoors : null;
  let best = -1, bestGain = -1, wSum = 0, panSum = 0;
  for (let i = 0; i < n; i++) {
    const l = listeners[i];
    const dx = pos.x - l.x, dy = (Number(pos.y) || 0) - l.y, dz = pos.z - l.z;
    const dist = Math.hypot(dx, dy, dz);
    const flat = Math.hypot(dx, dz);
    let g = attenuation(dist, opts);
    const blocked = srcIndoors !== null && l.indoors !== null && l.indoors !== undefined && srcIndoors !== l.indoors;
    if (blocked) g *= occluded;
    let p = 0;
    if (flat > 1e-6) p = (dx * l.rx + dz * l.rz) / flat;
    if (dist < near) p *= dist / near;
    const w = g * g;
    wSum += w; panSum += w * p;
    if (g > bestGain) {
      bestGain = g; best = i;
      out.dist = dist;
      out.muffle = blocked ? 1 : 0;
      out.behind = flat > 1e-6 ? Math.max(0, -(dx * l.fx + dz * l.fz) / flat) : 0;
      out.lx = dx * l.rx + dz * l.rz;
      out.ly = dy;
      out.lz = -(dx * l.fx + dz * l.fz);
    }
  }
  out.nearest = best;
  out.gain = Math.max(0, bestGain);
  let pan = wSum > 1e-12 ? panSum / wSum : 0;
  if (n > 1) pan *= opts.splitWidth ?? SPATIAL_DEFAULTS.splitWidth;
  out.pan = Math.max(-1, Math.min(1, pan));
  return out;
}

// Doppler pitch ratio for a source moving at `radial` m/s along the line to the listener
// (positive = approaching). Clamped so a glitchy velocity never makes a chipmunk.
export function dopplerRatio(radial, c = 343) {
  const v = Math.max(-0.45 * c, Math.min(0.45 * c, Number(radial) || 0));
  return c / (c - v);
}

// A straight-line pass-by: a source moving at `speed` m/s whose closest approach is `closest`
// metres. Returns the pitch ratio and relative gain at `t` seconds from the closest point (t < 0
// approaching). Pure, so the engine can bake the curve into a few automation points.
export function passByAt(t, speed, closest, out = { ratio: 1, gain: 1, side: 0 }) {
  const along = speed * t; // metres past the closest point
  const d = Math.hypot(along, Math.max(0.5, closest));
  out.ratio = dopplerRatio(-speed * (along / d));
  out.gain = attenuation(d, { ref: Math.max(2, closest), max: 160, rolloff: 1 });
  out.side = Math.max(-1, Math.min(1, along / Math.max(4, closest * 2)));
  return out;
}
