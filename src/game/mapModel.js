// The Progress page's city map as plain shapes: blocks, water, trophy pins and challenge
// medals, plus (workstream L2) each district's progress. Pure; src/ui/progressMap.js inks it onto
// a canvas: the whole city from the navigation model when one is running (src/nav), the old
// core-only map otherwise.
import { WORLD } from '../world/mapData.js';
import { districtAt, PROGRESS_MAP_BOUNDS, DISTRICTS, REGION_SITES } from '../world/regions/data.js';
import { CITY_BOUNDS } from '../nav/cityMapData.js';
import { ALL_CRIME_SPOTS } from './crimes.js';

// The regions shown on the Progress page, from the region list (each region's mapBounds where
// progressMap is set: the core plus its harbour today, so the lighthouse trophy at z 270 fits).
export const MAP_BOUNDS = PROGRESS_MAP_BOUNDS;
// The whole city (workstream L2): what the city map and the redesigned Progress map draw.
export const CITY_MAP_BOUNDS = CITY_BOUNDS;
const span = (b) => Math.max(b.maxX - b.minX, b.maxZ - b.minZ);

export function toMap(x, z, size, b = MAP_BOUNDS) {
  const s = size / span(b);
  return { u: (x - b.minX) * s, v: (z - b.minZ) * s };
}

// Per district: trophies found / placed, challenge medals won / offered, collectible sites, crime
// spots and crimes stopped there (progress.map.crimes, counted by src/nav/navSystem.js).
export function districtProgress({ trophies = [], challenges = [], progress, sites = REGION_SITES, crimeSpots = ALL_CRIME_SPOTS }) {
  const out = new Map(DISTRICTS.map((d) => [d.id, {
    id: d.id, label: d.label, tint: d.tint, visited: (progress.districts ?? []).includes(d.id),
    trophies: { found: 0, total: 0 }, medals: { won: 0, gold: 0, total: 0 }, collectibles: 0, crimes: { stopped: progress.map?.crimes?.[d.id] ?? 0, spots: 0 },
  }]));
  trophies.forEach((t, i) => { const r = out.get(districtAt(t.x, t.z)); if (!r) return; r.trophies.total++; if (progress.trophies.includes(i)) r.trophies.found++; });
  for (const c of challenges) {
    const r = out.get(districtAt(c.x, c.z));
    if (!r) continue;
    r.medals.total++;
    const medal = progress.challenges[c.id]?.medal ?? null;
    if (medal) r.medals.won++;
    if (medal === 'gold') r.medals.gold++;
  }
  for (const s of Object.values(sites)) if (s.kind === 'collectible') { const r = out.get(districtAt(s.x, s.z)); if (r) r.collectibles++; }
  for (const s of crimeSpots) { const r = out.get(s.district) ?? out.get(districtAt(s.x, s.z)); if (r) r.crimes.spots++; }
  return [...out.values()];
}

export function mapModel({ buildings, trophies, challenges, progress, size = 360 }) {
  const s = size / span(MAP_BOUNDS);
  const blocks = buildings.map((b) => {
    const c = toMap(b.x - b.w / 2, b.z - b.d / 2, size);
    return { u: c.u, v: c.v, w: b.w * s, h: b.d * s, district: b.district, landmark: !!b.landmark };
  });
  // World x/z ride along (the city-wide map places pins by them).
  const pins = trophies
    .map((bl, i) => ({ ...toMap(bl.x, bl.z, size), x: bl.x, z: bl.z, found: progress.trophies.includes(i), district: districtAt(bl.x, bl.z) }))
    .filter((p) => p.found || progress.districts.includes(p.district))
    .map(({ u, v, x, z, found }) => ({ u, v, x, z, found }));
  const medals = challenges.map((c) => ({ id: c.id, ...toMap(c.x, c.z, size), x: c.x, z: c.z, medal: progress.challenges[c.id]?.medal ?? null }));
  return { size, water: toMap(0, WORLD.waterZ, size).v, blocks, trophies: pins, challenges: medals, districts: districtProgress({ trophies, challenges, progress }) };
}
