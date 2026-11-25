// Minimap rules (workstream L2), pure: how far the map shows, what it shows, height cues, and
// how a far marker clamps to the rim.
//
// Flags other systems set (nav.flags, all booleans):
//   crimes            live crimes in progress show (default on)
//   sideContent       challenge pillars and side-content markers (default on)
//   collectibleHints  unfound collectibles near you (a skill or Detective rule turns it on)
//   enemiesAlways     every enemy (dev); otherwise only detected ones (below)
//   breadcrumbs       a trail of where you have been (a setting)
export const MINIMAP = {
  // Metres from the centre to the rim, by how you move.
  radius: { foot: 75, glide: 120, drive: 135, fly: 230 },
  speedK: 1.6,    // + metres per m/s of speed
  altK: 0.8,      // + metres per metre above the ground
  min: 55, max: 340,
  heightCue: 4,   // metres of height difference before a marker gets an up/down chevron
  hintRadius: 90, // collectible hints within this range
};

export const DEFAULT_FLAGS = Object.freeze({ crimes: true, sideContent: true, collectibleHints: false, enemiesAlways: false, breadcrumbs: false });

// mode: 'foot' | 'glide' | 'drive' | 'fly'.
export function zoomRadius({ mode = 'foot', speed = 0, altitude = 0 } = {}, R = MINIMAP) {
  const base = R.radius[mode] ?? R.radius.foot;
  return Math.max(R.min, Math.min(R.max, base + Math.max(0, speed) * R.speedK + Math.max(0, altitude) * R.altK));
}

// An enemy shows only when detected: detective vision on (within its range), marked (a ping or a
// tracker), or seen by a drone; or always with the enemiesAlways flag.
export function enemyVisible(e, { detective = false, detectiveRange = 60, dist = 0, marked = false, drone = false, flags = DEFAULT_FLAGS } = {}) {
  if (!e || e.alive === false) return false;
  if (flags.enemiesAlways) return true;
  return marked || drone || (detective && dist <= detectiveRange);
}

// 'up' | 'down' | null: the target is on another level (a roof, the lower deck).
export function heightCue(dy, k = MINIMAP.heightCue) {
  return dy > k ? 'up' : dy < -k ? 'down' : null;
}

// A marker at map offset (dx, dy) (pixels from the centre) kept inside a circle of radius r:
// { x, y, edge } with edge true when it was pulled in to the rim.
export function clampToRim(dx, dy, r, out = { x: 0, y: 0, edge: false }) {
  const d = Math.hypot(dx, dy);
  if (d <= r) { out.x = dx; out.y = dy; out.edge = false; return out; }
  out.x = (dx / d) * r; out.y = (dy / d) * r; out.edge = true;
  return out;
}

// World (x, z) -> minimap pixels relative to the centre, for a map centred on (cx, cz) showing
// `radius` metres in `px` pixels, rotated by `rot` (the player's heading when the map turns with
// them; 0 north-up). Screen up is -z when rot = 0.
export function worldToMinimap(x, z, cx, cz, radius, px, rot = 0, out = { x: 0, y: 0 }) {
  const k = px / radius;
  const dx = (x - cx) * k, dz = (z - cz) * k;
  const c = Math.cos(rot), s = Math.sin(rot);
  out.x = dx * c - dz * s;
  out.y = dx * s + dz * c;
  return out;
}

// How someone is moving, from what the game knows.
export function moveMode({ driving = false, flying = false, gliding = false } = {}) {
  return flying ? 'fly' : driving ? 'drive' : gliding ? 'glide' : 'foot';
}
