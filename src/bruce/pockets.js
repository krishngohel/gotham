// The lazily built interiors at runtime (workstream K): which pockets exist, which city door site
// leads into which, and the builder that makes each one the first time anyone goes in.
//
//   POCKETS[id] = { id, name, origin, rooms, stations, entries, exits, spawn, music, build }
//   createPockets({ scene, collision, world, quality }) -> {
//     ensure(id)          build it now if it is not built (returns the built record)
//     at(pos)             the pocket a world position is inside (or null), with its room/area
//     toWorld(id, p)      local -> world { x, y, z, yaw }
//     entryFor(siteId)    { pocket, entry } for a city door site, or null
//     built(id), update(t)
//   }
// Light: each pocket's light spots join the shared light pool (world.lightPool.addSpots), so the
// pool's fixed PointLights light the pocket while a player is in it. No PointLight is ever added.
import { MANOR_ORIGIN, MANOR_ROOMS, MANOR_STATIONS, MANOR_ENTRIES, MANOR_EXITS, MANOR_SPAWN, buildManor } from '../world/interiors/manor.js';
import { CAVE_ORIGIN, CAVE_ROOMS, CAVE_STATIONS, CAVE_ENTRIES, CAVE_EXITS, CAVE_SPAWN, CAVE_AREAS, buildBatcave } from '../world/interiors/batcave.js';
import { TOWER_ORIGIN, TOWER_ROOMS, TOWER_STATIONS, TOWER_ENTRIES, TOWER_EXITS, TOWER_SPAWN, buildWayneTower } from '../world/interiors/wayneTower.js';
import { createPocketCtx, finishPocket, scrollTextures } from '../world/interiors/pocketKit.js';

export const POCKETS = Object.freeze({
  wayneManor: { id: 'wayneManor', name: 'Wayne Manor', origin: MANOR_ORIGIN, rooms: MANOR_ROOMS, stations: MANOR_STATIONS, entries: MANOR_ENTRIES, exits: MANOR_EXITS, spawn: MANOR_SPAWN, music: 'manor', build: buildManor },
  batcave: { id: 'batcave', name: 'The Batcave', origin: CAVE_ORIGIN, rooms: CAVE_ROOMS, areas: CAVE_AREAS, stations: CAVE_STATIONS, entries: CAVE_ENTRIES, exits: CAVE_EXITS, spawn: CAVE_SPAWN, music: 'cave', build: buildBatcave },
  wayneTower: { id: 'wayneTower', name: 'Wayne Tower', origin: TOWER_ORIGIN, rooms: TOWER_ROOMS, stations: TOWER_STATIONS, entries: TOWER_ENTRIES, exits: TOWER_EXITS, spawn: TOWER_SPAWN, music: 'manor', build: buildWayneTower },
});
export const POCKET_IDS = Object.keys(POCKETS);

// Which pocket a city door site opens (the site's own `interior` tag wins, then the entries).
export function pocketForSite(siteId, site = null) {
  if (site?.interior && POCKETS[site.interior]) return POCKETS[site.interior];
  // The clock passage is a Manor site that leads to the cave.
  for (const p of Object.values(POCKETS)) if (p.entries[siteId]) return p;
  return null;
}

function inRoom(r, x, y, z, pad = 1.5) {
  return x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad && y >= (r.y ?? 0) - 1.5 && y <= (r.y ?? 0) + (r.h ?? 6) + 1;
}

// Pure lookup: a world position -> { pocket, room, local } or null.
export function pocketAt(pos) {
  for (const p of Object.values(POCKETS)) {
    const x = pos.x - p.origin.x, y = pos.y - p.origin.y, z = pos.z - p.origin.z;
    if (Math.abs(x) > 120 || Math.abs(z) > 120) continue;
    let room = null;
    // Upstairs rooms first: they sit over the ground floor's footprint.
    const rooms = Object.values(p.rooms).sort((a, b) => (b.y ?? 0) - (a.y ?? 0));
    for (const r of rooms) if (inRoom(r, x, y, z, 0.3)) { room = r.id; break; }
    if (!room) for (const r of rooms) if (inRoom(r, x, y, z)) { room = r.id; break; }
    if (!room) continue;
    let area = null;
    for (const [id, a] of Object.entries(p.areas ?? {})) if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1 && Math.abs(y - a.y) < 3) { area = id; break; }
    return { pocket: p.id, room, area, local: { x, y, z } };
  }
  return null;
}

export function toWorld(pocketId, p) {
  const o = POCKETS[pocketId].origin;
  return { x: o.x + p.x, y: o.y + (p.y ?? 0), z: o.z + p.z, yaw: p.yaw ?? 0 };
}

// [perf3] Half-size of the box around a pocket's origin in which it is shown (pockets span +-120 m).
const NEAR = 160;

export function createPockets({ scene, collision, world = null, quality = {} }) {
  const built = new Map();
  function ensure(id) {
    if (built.has(id)) return built.get(id);
    const def = POCKETS[id];
    if (!def) return null;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const ctx = createPocketCtx({ collision, quality, origin: def.origin });
    def.build(ctx);
    const rec = { ...finishPocket(ctx, id), extras: ctx.extras, def, ms: 0 };
    if (rec.group && scene) {
      // [perf3] Parked while nobody is near: once built, a pocket (the dressed Manor alone is
      // thousands of objects) was walked by the matrix update and three's scene walk every frame
      // for the rest of the session, wherever the players were.
      rec.group.userData.parkHidden = true;
      scene.add(rec.group);
    }
    // The shared pool's fixed lights reach the pocket's own spots from now on.
    world?.lightPool?.addSpots?.(rec.lights);
    // [polish] The pocket's halo sprites join the city's shared halo Points (no draw call of their own).
    if (world?.halos) for (const [x, y, z, c, s] of rec.halos ?? []) world.halos.add(x, y, z, c, s);
    rec.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    built.set(id, rec);
    return rec;
  }
  return {
    ensure,
    built: (id) => built.has(id),
    record: (id) => built.get(id) ?? null,
    at: pocketAt,
    toWorld,
    entryFor(siteId, site = null) {
      const p = pocketForSite(siteId, site);
      if (!p) return null;
      // The clock passage site belongs to the Manor's exterior but opens the cave's lift.
      if (siteId === 'wayneManorClockPassage' && site?.leadsTo === 'batcave') return { pocket: POCKETS.batcave, entry: POCKETS.batcave.entries[siteId] };
      return { pocket: p, entry: p.entries[siteId] ?? p.spawn };
    },
    // focus: [{ x, y, z }] the players' positions (and cameras); a pocket draws and animates only
    // while one of them is within NEAR of its origin. Omit to keep every built pocket on.
    update(t, focus = null) {
      scrollTextures(t);
      for (const rec of built.values()) {
        if (focus && rec.group) {
          const o = rec.def.origin;
          let near = false;
          for (const p of focus) if (p && Math.abs(p.x - o.x) < NEAR && Math.abs(p.z - o.z) < NEAR && Math.abs(p.y - o.y) < NEAR) { near = true; break; }
          rec.group.visible = near;
          if (!near) continue;
        }
        for (const u of rec.updaters) u(t);
      }
    },
  };
}
