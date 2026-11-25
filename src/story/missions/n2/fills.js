// [m23] Fill light for a night's set pieces (the owner's rule: no scene too dark to read). A night
// lists `fills: [{ id, x, y, z, r, color?, intensity?, distance? }]`: a broad, cool light hung over
// a roof or a yard where a mission stops for a fight, a case or a rescue, so the hero, the goons and
// the objective never read as dark shapes on a dark floor.
//
// These are light SPOTS for the shared pool (src/world/lightPool.js addSpots, the same call the
// Bruce interiors use), not new lights: the pool's light count is fixed per quality tier and a spot
// only takes a slot while a player is inside its box, so nothing is paid for elsewhere in the city
// (and on Potato, which has no pool lights, the ambient look is unchanged).
const added = new Set();

export const FILL_DEFAULT = { color: 0xc4d2ff, intensity: 46, distance: 44, decay: 1.5, height: 9 };

// The pool's spot for a fill (pure).
export function fillSpot(f) {
  const r = f.r ?? 18;
  const y = f.y + (f.height ?? FILL_DEFAULT.height);
  return {
    x: f.x, y, z: f.z,
    color: f.color ?? FILL_DEFAULT.color, intensity: f.intensity ?? FILL_DEFAULT.intensity,
    distance: f.distance ?? Math.max(FILL_DEFAULT.distance, r * 2.2), decay: f.decay ?? FILL_DEFAULT.decay,
    room: { minX: f.x - r, maxX: f.x + r, minY: f.y - 3, maxY: f.y + 14, minZ: f.z - r, maxZ: f.z + r },
  };
}

// Adds a night's fills to the light pool, once per night per run. Safe with no world (tests).
export function registerNightFills(night, world) {
  if (!night?.fills?.length || added.has(night.id)) return 0;
  const pool = world?.lightPool;
  if (!pool?.addSpots) return 0;
  added.add(night.id);
  pool.addSpots(night.fills.map(fillSpot));
  return night.fills.length;
}
