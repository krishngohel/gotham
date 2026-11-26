// Fast travel (workstream L2): which points are unlocked, whether a player may travel now, and
// where everyone lands. Pure; the transition and the moving of heroes live in src/nav/navSystem.js.
//
// Points (src/nav/cityMapData.js fastTravelPoints): El stations (unlocked by a first visit: ride
// the train there), Batwing drop sites (unlocked by a first visit: a glide-in arrival) and the
// Batcave's entrances (always known).
//
// canFastTravel(player): the built-in rules (alive, in free play, no fight or predator room
// around, no story step, crime, challenge or chase that holds you, wanted heat not high), then
// every veto other systems added with addVeto(fn): fn(player) returns a reason string to refuse,
// or null/false to allow.
export const FAST_TRAVEL = {
  unlockRadius: { el: 32, batwing: 45, batcave: 0 },
  combatRadius: 30,
  maxHeat: 2,                 // heat above this (if any system reports heat) refuses travel
  elSpeed: 12,                // m/s: El ride time = track distance / speed (clock advance)
  batwingMinutes: 4,
  partnerRing: [2.4, 3.6, 5],  // metres: where the second hero lands around the point
};

export function createFastTravel({ points = [], unlocked = [] } = {}) {
  const open = new Set(unlocked.filter((id) => points.some((p) => p.id === id)));
  const vetoes = new Set();
  let version = 0;
  const api = {
    points,
    get version() { return version; },
    isUnlocked: (id) => { const p = points.find((q) => q.id === id); return !!p && (p.kind === 'batcave' || open.has(id)); },
    unlock(id) { if (open.has(id) || !points.some((p) => p.id === id)) return false; open.add(id); version++; return true; },
    unlockedIds: () => [...open],
    // Unlocks every point within its kind's radius of (x, y, z). Returns the new ones.
    visit(x, y, z) {
      const out = [];
      for (const p of points) {
        if (p.kind === 'batcave' || open.has(p.id)) continue;
        const r = FAST_TRAVEL.unlockRadius[p.kind] ?? 30;
        if ((p.x - x) ** 2 + (p.z - z) ** 2 <= r * r && Math.abs((p.y ?? 0) - y) < r) { open.add(p.id); out.push(p); }
      }
      if (out.length) version++;
      return out;
    },
    addVeto(fn) { vetoes.add(fn); return () => vetoes.delete(fn); },
    // state: what the game knows about this player right now (navSystem builds it).
    canFastTravel(player, state = {}) {
      const r = travelRules(state);
      if (r) return { ok: false, reason: r };
      for (const fn of vetoes) {
        let why = null;
        try { why = fn(player); } catch { why = null; }
        if (why) return { ok: false, reason: typeof why === 'string' ? why : 'Not now.' };
      }
      return { ok: true, reason: null };
    },
  };
  return api;
}

// The built-in rules. Returns a reason (shown to the player) or null.
export function travelRules(s = {}) {
  if (s.dead) return 'Get back on your feet first.';
  if (s.playing === false) return 'Not during a scene.';
  if (s.inCombat) return 'Not in the middle of a fight.';
  if (s.stealthRoom) return 'Not while the room is watching.';
  if (s.stepForbids) return 'The case needs you here.';
  if (s.crimeEngaged) return 'Finish the crime in progress first.';
  if (s.challenge) return 'Quit the challenge first.';
  if (s.chase) return 'Not during a chase.';
  if (s.inVehicle) return 'Step out of the vehicle first.';
  if (typeof s.heat === 'number' && s.heat > FAST_TRAVEL.maxHeat) return 'Too hot right now: lose the heat first.';
  return null;
}

// Where n heroes land at a point: the point itself for the first, then spots on rings around it
// where `groundAt(x, y, z)` finds ground within 2.5 m of the point's height and `free(x, y, z)`
// (optional) says nothing solid stands. Returns [{ x, y, z }] (length n; falls back to the point).
export function arrivalSpots(point, n, { groundAt = null, free = null, yaw = 0 } = {}) {
  const out = [];
  const settle = (x, z) => {
    const y0 = point.y ?? 0;
    const g = groundAt ? groundAt(x, y0 + 2, z) : y0;
    if (!(g > -Infinity) || Math.abs(g - y0) > 2.5) return null;
    if (free && !free(x, g, z)) return null;
    return { x, y: g, z };
  };
  const first = settle(point.x, point.z) ?? { x: point.x, y: point.y ?? 0, z: point.z };
  out.push(first);
  for (const r of FAST_TRAVEL.partnerRing) {
    for (let k = 0; k < 8 && out.length < n; k++) {
      const a = yaw + Math.PI / 2 + (k * Math.PI) / 4;
      const p = settle(point.x + Math.sin(a) * r, point.z + Math.cos(a) * r);
      if (p) out.push(p);
    }
    if (out.length >= n) break;
  }
  // Nowhere to stand (a drop point in the air: the Batwing's glide-in): beside the first, same height.
  for (let k = 0; out.length < n; k++) {
    const a = yaw + Math.PI / 2 + (k * Math.PI) / 2;
    out.push({ x: first.x + Math.sin(a) * FAST_TRAVEL.partnerRing[0], y: first.y, z: first.z + Math.cos(a) * FAST_TRAVEL.partnerRing[0] });
  }
  return out;
}

// How long the trip takes in the world (minutes), for world.clock: an El ride at train speed along
// the straight-line distance (a fair stand-in for the track), a Batwing hop a flat few minutes.
export function travelMinutes(from, point) {
  if (point.kind === 'el') return Math.max(1, Math.round(Math.hypot(point.x - from.x, point.z - from.z) / FAST_TRAVEL.elSpeed / 60 * 1.6 + 2));
  if (point.kind === 'batwing') return FAST_TRAVEL.batwingMinutes;
  return 2;
}
