// Rings and slots around each player (research doc 3.1: "tokens fix timing; slots fix space").
// Pure and allocation-free per call once warmed up: plan() writes each enemy's slot into the
// objects it is given.
//
//   inner ring  1.8–2.6 m, `innerSlots` angular slots: token holders and the next in line
//   outer ring  4–7 m: everyone else in melee (strafe, taunt, pick up weapons, flank)
//   ranged ring 10–20 m: ranged roles, holding an angle
//
// Assignment is greedy: token holders first, then the next in line, then the rest; each takes the
// free slot of lowest cost (distance to walk + angle change around the player + crowding by
// slots already taken). The next in line weights slots behind the player's facing (flankScore),
// so the second attacker of a pair comes from where the hero is not looking. The counter glyph
// still announces it (the fairness rule lives in the tells, not here).
//
// Callers: the enemy AI (src/actors/enemy.js) reads e.slotX / e.slotZ / e.ring as where to stand;
// combatSystem feeds plan() once per frame with the live squad.
export const RINGS = {
  inner: { min: 1.8, max: 2.6 },
  outer: { min: 4, max: 7 },
  ranged: { min: 10, max: 20 },
};
const OUTER_SLOTS = 10;
const RANGED_SLOTS = 8;
const TAU = Math.PI * 2;

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// How much a slot at world angle `angle` (around the player, atan2(dx, dz) convention like yaw)
// sits behind a player facing `yaw`: 0 dead ahead, 1 dead behind.
export function flankScore(angle, yaw) {
  return (1 - Math.cos(wrap(angle - yaw))) / 2;
}

// Whether `challenger` (already in the inner ring, no token) may take the token of `holder`
// (still on its way from more than 4 m). Both: { dist, ring, holdsToken }.
export function shouldSteal(holder, challenger) {
  if (!holder?.holdsToken || challenger?.holdsToken) return false;
  return holder.dist > 4 && challenger.ring === 'inner' && challenger.dist < RINGS.inner.max + 0.4;
}

export function createSquadPlanner({ innerSlots = 6 } = {}) {
  // Per player key: taken flags per ring (typed arrays, grown never: fixed slot counts).
  const taken = new Map();
  const takenFor = (key) => {
    let t = taken.get(key);
    if (!t) { t = { inner: new Uint8Array(innerSlots), outer: new Uint8Array(OUTER_SLOTS), ranged: new Uint8Array(RANGED_SLOTS) }; taken.set(key, t); }
    return t;
  };
  const slotCount = (ring) => (ring === 'inner' ? innerSlots : ring === 'outer' ? OUTER_SLOTS : RANGED_SLOTS);
  const radius = (ring) => (RINGS[ring].min + RINGS[ring].max) / 2;

  // Picks the cheapest free slot of `ring` around player `p` for enemy `e` and writes it.
  function assign(e, p, ring, flank) {
    const t = takenFor(p.key)[ring];
    const n = slotCount(ring);
    const r = radius(ring);
    const here = Math.atan2(e.x - p.x, e.z - p.z);
    const dist = Math.hypot(e.x - p.x, e.z - p.z);
    let best = -1, bestCost = Infinity;
    for (let i = 0; i < n; i++) {
      if (t[i]) continue;
      // Slots are offset half a step so slot 0 is not dead ahead of the player's world +z.
      const a = ((i + 0.5) / n) * TAU;
      const turn = Math.abs(wrap(a - here));
      const sx = p.x + Math.sin(a) * r, sz = p.z + Math.cos(a) * r;
      const walk = Math.hypot(sx - e.x, sz - e.z);
      // Crowding: taken neighbours make a slot less attractive.
      const crowd = (t[(i + 1) % n] ? 0.6 : 0) + (t[(i + n - 1) % n] ? 0.6 : 0);
      let cost = walk * 0.5 + turn * Math.max(1, dist) * 0.35 + crowd;
      // Strong enough to outweigh walking round: the flanker should really come from behind.
      if (flank) cost -= flankScore(a, p.yaw ?? 0) * (6 + dist);
      if (cost < bestCost) { bestCost = cost; best = i; }
    }
    if (best < 0) {
      // Ring full: stay on this side, at the ring's radius.
      e.slotX = p.x + Math.sin(here) * r; e.slotZ = p.z + Math.cos(here) * r;
      e.ring = ring === 'inner' ? 'outer' : ring;
      return;
    }
    t[best] = 1;
    const a = ((best + 0.5) / n) * TAU;
    e.slotX = p.x + Math.sin(a) * r;
    e.slotZ = p.z + Math.cos(a) * r;
    e.ring = ring;
    e.slotIndex = best;
  }

  function playerFor(players, key) {
    for (let i = 0; i < players.length; i++) if (players[i].key === key) return players[i];
    return players[0];
  }

  return {
    // players: [{ key, x, z, yaw }]; enemies: [{ id, x, z, targetKey, ranged, holdsToken,
    // nextInLine, alive, role }]. Writes slotX, slotZ, ring (and slotIndex) on each live enemy.
    plan(players, enemies) {
      if (!players.length) return;
      for (const t of taken.values()) { t.inner.fill(0); t.outer.fill(0); t.ranged.fill(0); }
      // Three passes instead of a sort: holders, next in line, everyone else.
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (!e.alive) continue;
          const p = playerFor(players, e.targetKey);
          if (e.ranged) { if (pass === 2) assign(e, p, 'ranged', false); continue; }
          if (pass === 0 && e.holdsToken) assign(e, p, 'inner', false);
          else if (pass === 1 && !e.holdsToken && e.nextInLine) assign(e, p, 'inner', true);
          else if (pass === 2 && !e.holdsToken && !e.nextInLine) assign(e, p, 'outer', false);
        }
      }
    },
  };
}

// [balance] Rush a downed co-op player: the `count` nearest melee goons (no token, not ranged) take
// slots in a tight ring round the body, so the partner has to fight through them to revive (and a
// goon standing over a body is a readable "go and get him" for the partner). Writes slotX/slotZ,
// ring 'inner' and `rushing` on the chosen ones; returns how many. Allocation-free.
export function rushDowned(body, enemies, count) {
  let n = 0;
  for (let k = 0; k < count; k++) {
    let best = null, bd = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive || e.ranged || e.holdsToken || e.rushing) continue;
      const d = Math.hypot(e.x - body.x, e.z - body.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best || bd > 25) break;
    const a = (k / Math.max(1, count)) * Math.PI * 2 + 0.6;
    best.slotX = body.x + Math.sin(a) * 1.6; best.slotZ = body.z + Math.cos(a) * 1.6;
    best.ring = 'inner'; best.rushing = true;
    n += 1;
  }
  return n;
}
