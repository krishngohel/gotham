// Workstream K: the lazily built interiors (src/world/interiors/manor.js, batcave.js, wayneTower.js)
// built headless into a real collision world (the pattern of tests/unit/interiors.test.js), then
// walked: every entry lands on collision, and from the main spawn a walker that can only step up
// 0.45 m and drop 0.6 m reaches every room, every station and every exit.
import { describe, it, expect } from 'vitest';
import { createCollision } from '../../src/world/collision.js';
import { createPocketCtx, finishPocket } from '../../src/world/interiors/pocketKit.js';
import { MANOR_ORIGIN, MANOR_ROOMS, MANOR_STATIONS, MANOR_ENTRIES, MANOR_EXITS, MANOR_SPAWN, buildManor } from '../../src/world/interiors/manor.js';
import { CAVE_ORIGIN, CAVE_ROOMS, CAVE_AREAS, CAVE_STATIONS, CAVE_ENTRIES, CAVE_EXITS, CAVE_SPAWN, SIM_ARENA, buildBatcave } from '../../src/world/interiors/batcave.js';
import { TOWER_ORIGIN, TOWER_ROOMS, TOWER_STATIONS, TOWER_ENTRIES, TOWER_EXITS, TOWER_FLOORS, buildWayneTower } from '../../src/world/interiors/wayneTower.js';
import { REGION_SITES, WORLD_BOUNDS } from '../../src/world/regions/data.js';
import { LOOP_SITES } from '../../src/world/regions/loopData.js';
import { POCKETS } from '../../src/bruce/pockets.js';

function build(builder, origin, quality = {}) {
  const collision = createCollision();
  const ctx = createPocketCtx({ collision, quality, origin });
  builder(ctx);
  finishPocket(ctx, 'test');
  return { collision, ctx };
}

// Flood fill over walkable cells (local coordinates in, local out). Returns a Set of 'i,j,y10'.
function walk(collision, O, start, bounds, { cell = 0.5, r = 0.3 } = {}) {
  const seen = new Map();
  const key = (x, z, y) => `${Math.round(x / cell)},${Math.round(z / cell)},${Math.round(y * 4)}`;
  const near = [];
  const blocked = (x, z, g) => {
    near.length = 0;
    for (const b of collision.query(O.x + x - r, O.z + z - r, O.x + x + r, O.z + z + r, near)) {
      if (b.minY < O.y + g + 1.7 && b.maxY > O.y + g + 0.46) return true;
    }
    return false;
  };
  const g0 = collision.groundBelow(O.x + start.x, O.y + start.y + 0.45, O.z + start.z, 0.25) - O.y;
  const q = [[start.x, start.z, g0]];
  seen.set(key(start.x, start.z, g0), [start.x, start.z, g0]);
  while (q.length) {
    const [x, z, y] = q.shift();
    for (const [dx, dz] of [[cell, 0], [-cell, 0], [0, cell], [0, -cell]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < bounds.x0 - 2 || nx > bounds.x1 + 2 || nz < bounds.z0 - 2 || nz > bounds.z1 + 2) continue;
      const g = collision.groundBelow(O.x + nx, O.y + y + 0.45, O.z + nz, 0.2) - O.y;
      if (!(g > -10) || y - g > 0.6) continue;
      if (blocked(nx, nz, g)) continue;
      const k = key(nx, nz, g);
      if (seen.has(k)) continue;
      seen.set(k, [nx, nz, g]);
      q.push([nx, nz, g]);
    }
  }
  return [...seen.values()];
}
const reached = (cells, x, z, y, r = 1.6, dy = 1) => cells.some(([cx, cz, cy]) => Math.hypot(cx - x, cz - z) <= r && Math.abs(cy - y) <= dy);
const inRect = (cells, R, y) => cells.some(([x, z, cy]) => x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1 && Math.abs(cy - y) < 0.6);
const boundsOf = (rooms) => ({ x0: Math.min(...rooms.map((r) => r.x0)), x1: Math.max(...rooms.map((r) => r.x1)), z0: Math.min(...rooms.map((r) => r.z0)), z1: Math.max(...rooms.map((r) => r.z1)) });

function checkPocket({ builder, origin, rooms, stations, entries, exits, spawn, quality }) {
  const { collision } = build(builder, origin, quality);
  const bounds = boundsOf(Object.values(rooms));
  // Every entry stands on collision at its floor (not inside a wall, not in the air).
  for (const [id, e] of Object.entries(entries)) {
    const g = collision.groundBelow(origin.x + e.x, origin.y + e.y + 0.45, origin.z + e.z, 0.25) - origin.y;
    expect(Math.abs(g - e.y), `entry ${id} ground ${g}`).toBeLessThan(0.35);
  }
  const cells = walk(collision, origin, spawn, bounds);
  expect(cells.length).toBeGreaterThan(200);
  for (const room of Object.values(rooms)) expect(inRect(cells, room, room.y), `room ${room.id}`).toBe(true);
  for (const s of Object.values(stations)) expect(reached(cells, s.x, s.z, s.y, s.r ?? 1.6), `station ${s.id}`).toBe(true);
  for (const [id, e] of Object.entries(entries)) expect(reached(cells, e.x, e.z, e.y, 1), `entry ${id} reachable`).toBe(true);
  for (const x of exits) expect(cells.some(([cx, cz]) => cx >= x.x0 - 0.3 && cx <= x.x1 + 0.3 && cz >= x.z0 - 0.3 && cz <= x.z1 + 0.3), `exit ${x.id}`).toBe(true);
  return { collision, cells };
}

describe('Wayne Manor interior', () => {
  it('every door site lands on collision; every room, station and exit is reachable on foot', () => {
    checkPocket({ builder: buildManor, origin: MANOR_ORIGIN, rooms: MANOR_ROOMS, stations: MANOR_STATIONS, entries: MANOR_ENTRIES, exits: MANOR_EXITS, spawn: MANOR_SPAWN });
  });
  it('the Potato build (fewer props) is just as walkable', () => {
    checkPocket({ builder: buildManor, origin: MANOR_ORIGIN, rooms: MANOR_ROOMS, stations: MANOR_STATIONS, entries: MANOR_ENTRIES, exits: MANOR_EXITS, spawn: MANOR_SPAWN, quality: { crowdDensity: 0.25 } });
  });
  it('every Bristol door site the Manor answers exists in the region data', () => {
    for (const id of Object.keys(MANOR_ENTRIES)) expect(REGION_SITES[id], id).toBeTruthy();
    for (const x of MANOR_EXITS) expect(REGION_SITES[x.site]?.interior, x.site).toBe('wayneManor');
  });
});

describe('the Batcave', () => {
  it('the lift ledge, the deck, the pad and the floor connect; every station and exit is reachable', () => {
    const { cells } = checkPocket({ builder: buildBatcave, origin: CAVE_ORIGIN, rooms: CAVE_ROOMS, stations: CAVE_STATIONS, entries: CAVE_ENTRIES, exits: CAVE_EXITS, spawn: CAVE_SPAWN });
    for (const [id, a] of Object.entries(CAVE_AREAS)) expect(inRect(cells, a, a.y), `area ${id}`).toBe(true);
    expect(reached(cells, SIM_ARENA.x, SIM_ARENA.z, SIM_ARENA.y, 1, 0.4)).toBe(true);
  });
  it('the cave entrances are the region sites', () => {
    for (const x of CAVE_EXITS) expect(REGION_SITES[x.site]?.interior, x.site).toBe('batcave');
  });
});

describe('Wayne Tower and the clinic', () => {
  it('each floor is walkable from its lift; the lobby and the clinic reach their street doors', () => {
    const { collision } = build(buildWayneTower, TOWER_ORIGIN);
    // Each floor is its own island (the lift connects them): walk each from its lift arrival.
    for (const [id, f] of Object.entries(TOWER_FLOORS)) {
      const room = TOWER_ROOMS[id];
      const cells = walk(collision, TOWER_ORIGIN, { x: f.x, y: 0, z: f.z }, room);
      expect(inRect(cells, room, 0), id).toBe(true);
      for (const s of Object.values(TOWER_STATIONS).filter((x) => x.room === id)) expect(reached(cells, s.x, s.z, 0, s.r), `${id} ${s.id}`).toBe(true);
    }
    const clinic = walk(collision, TOWER_ORIGIN, TOWER_ENTRIES.narrowsClinicDoor, TOWER_ROOMS.clinic);
    for (const s of Object.values(TOWER_STATIONS).filter((x) => x.room === 'clinic')) expect(reached(clinic, s.x, s.z, 0, s.r), s.id).toBe(true);
    for (const [id, e] of Object.entries(TOWER_ENTRIES)) {
      const g = collision.groundBelow(TOWER_ORIGIN.x + e.x, 0.45, TOWER_ORIGIN.z + e.z, 0.25);
      expect(Math.abs(g), id).toBeLessThan(0.35);
    }
    expect(LOOP_SITES.wayneTowerLobby).toBeTruthy();
    expect(REGION_SITES.narrowsClinicDoor).toBeTruthy();
    for (const x of TOWER_EXITS) expect(REGION_SITES[x.site] ?? LOOP_SITES[x.site], x.site).toBeTruthy();
  });
});

describe('pockets sit outside the playable city and do not overlap', () => {
  it('origins are far outside WORLD_BOUNDS and apart', () => {
    const list = Object.values(POCKETS);
    for (const p of list) expect(p.origin.x > WORLD_BOUNDS.maxX + 500 || p.origin.z < WORLD_BOUNDS.minZ - 500).toBe(true);
    for (const a of list) for (const b of list) if (a !== b) expect(Math.hypot(a.origin.x - b.origin.x, a.origin.z - b.origin.z)).toBeGreaterThan(250);
  });
});
