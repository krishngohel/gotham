// The whole city as a vector map, built once at load from the region data, the street graph and
// the built world's roofs (workstream L2). Pure: no DOM, no three.js. The minimap, the full-screen
// city map and the Progress page all draw from this one model (src/ui/minimap/mapPainter.js).
//
// Axes as everywhere: x east, z south (north is -z, the top of a north-up map), metres.
//
//   model = {
//     bounds    { minX, maxX, minZ, maxZ } the drawable city (WORLD_BOUNDS)
//     water     [{ minX, maxX, minZ, maxZ, kind }]      rects (river | lake | harbour), merged runs
//     land      [{ minX, maxX, minZ, maxZ, region }]    every region's land (water drawn on top)
//     districts [{ id, label, tint, region, park, rects, cx, cz, area }]   district areas as runs
//     streets   [{ edge, x0, y0, z0, x1, y1, z1, cls, width, bridge, deck }]   cls: STREET_CLASSES
//     el        { tracks: [[{ x, z }]], stations: [{ id, name, x, y, z, line }] }
//     buildings [{ x, z, w, d, h, district }]               footprints (centre + size), simplified
//     landmarks [{ id, x, y, z, kind, icon, label, district }]
//     fastTravel[{ id, kind: 'el' | 'batwing' | 'batcave', x, y, z, label, district }]
//     bridges   [{ id, x, z, axis }]                       movable bridges (live state from world.bridges)
//   }
import { REGION_DATA, WATER_BODIES, REGION_SITES, WORLD_BOUNDS, DISTRICTS, districtAt as regionDistrictAt, regionDataAt } from '../world/regions/data.js';
import { EL, EL_STATIONS, EL_WEST_STATIONS, loopTrack, westTrack } from '../world/regions/loopLayout.js';

export const CITY_BOUNDS = { minX: WORLD_BOUNDS.minX, maxX: WORLD_BOUNDS.maxX, minZ: WORLD_BOUNDS.minZ, maxZ: WORLD_BOUNDS.maxZ };

// Street classes, widest first (draw order is the reverse: paths under avenues).
export const STREET_CLASSES = ['highway', 'avenue', 'street', 'alley', 'bridge', 'ramp', 'lower', 'path'];

// Districts drawn as parks (green, no blocks).
export const PARK_DISTRICTS = new Set(['robinsonPark']);

// The 'city' ground between the core's named districts has no district record; it is paper.
export const CITY_TINT = '#d8cfb8';

// Which class a street-graph edge draws as.
export function streetClass(e) {
  if (e.deck === 'lower') return 'lower';
  if (e.bridge || e.kind === 'bridge') return 'bridge';
  if (e.kind === 'ramp' || e.deck === 'ramp') return 'ramp';
  if (e.deck === 'walk' || !e.lanes || e.kind === 'walk' || e.kind === 'stairs') return 'path';
  if ((e.kind === 'drive' && e.lanes >= 4) || e.kind === 'causeway') return 'highway';
  if (e.kind === 'boulevard' || e.lanes >= 4 || e.width >= 20) return 'avenue';
  if (e.width <= 8) return 'alley';
  return 'street';
}

// Icons for site kinds (mapPainter draws each icon id).
const ICON_FOR_KIND = { landmark: 'star', vista: 'eye', rooftop: 'roof', collectible: 'riddle', crime: 'crime', door: 'door', cave: 'bat', arena: 'fist', stealth: 'gargoyle', fight: 'fist', gate: 'door', story: 'star', landing: 'anchor' };

const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

// Run-length rows -> rects, merging a run with the identical run in the row above.
function runsToRects(rows, cell, b) {
  const out = [];
  let open = new Map(); // key x0:x1:tag -> rect
  for (let j = 0; j < rows.length; j++) {
    const next = new Map();
    for (const [i0, i1, tag] of rows[j]) {
      const key = `${i0}:${i1}:${tag}`;
      const r = open.get(key);
      if (r) { r.maxZ = b.minZ + (j + 1) * cell; next.set(key, r); open.delete(key); continue; }
      const nr = { minX: b.minX + i0 * cell, maxX: b.minX + i1 * cell, minZ: b.minZ + j * cell, maxZ: b.minZ + (j + 1) * cell, tag };
      out.push(nr);
      next.set(key, nr);
    }
    open = next;
  }
  return out;
}

// Samples a predicate on a grid and returns merged rects for each distinct tag (null = nothing).
function rasterRects(b, cell, tagAt) {
  const nx = Math.ceil((b.maxX - b.minX) / cell), nz = Math.ceil((b.maxZ - b.minZ) / cell);
  const rows = [];
  for (let j = 0; j < nz; j++) {
    const z = b.minZ + (j + 0.5) * cell;
    const row = [];
    let start = 0, cur = tagAt(b.minX + 0.5 * cell, z);
    for (let i = 1; i <= nx; i++) {
      const t = i < nx ? tagAt(b.minX + (i + 0.5) * cell, z) : undefined;
      if (t !== cur) {
        if (cur !== null && cur !== undefined) row.push([start, i, cur]);
        start = i; cur = t;
      }
    }
    rows.push(row);
  }
  return runsToRects(rows, cell, b);
}

// Water at (x, z): inside a water body, unless something solid stands there (a pier, an island:
// `groundAt` from the built world; lakes and the harbour only, so bridges never dam a river).
export function waterKindAt(x, z, groundAt = null, bodies = WATER_BODIES) {
  for (const w of bodies) {
    if (!inRect(w, x, z)) continue;
    if (groundAt && w.kind !== 'river') {
      const g = groundAt(x, z);
      if (g > w.level + 0.35) return null;
    }
    return w.kind;
  }
  return null;
}

// Footprints from the built world: the roofs list (every building() records one) plus any tall
// collision box the roofs do not cover (spires, towers, hangars). Each { x, z, w, d, h }.
export function footprintsFromWorld({ roofs = [], boxes = [] } = {}) {
  const out = roofs.map((r) => ({ x: r.x, z: r.z, w: r.w, d: r.d, h: r.y ?? 10, district: r.district ?? null }));
  const covered = (x, z) => out.some((f) => Math.abs(x - f.x) < f.w / 2 && Math.abs(z - f.z) < f.d / 2);
  const SKIP = /^(bound|quay|fill|rock|wall|tree|railing|ramp|prop|elColumn|column|post|step|sidewalk|road|bridge|leaf|gate|train|platform|pier|dock|lowerDeck|upperDeck|riverWalk|elDeck|floor|landing)$/;
  for (const b of boxes) {
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ, h = b.maxY - b.minY;
    if (h < 6 || b.minY > 2 || w * d < 60 || w > 200 || d > 200 || SKIP.test(b.tag ?? '')) continue;
    const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
    if (covered(x, z)) continue;
    out.push({ x, z, w, d, h: b.maxY, district: null });
  }
  return out;
}

// Fast-travel points: El stations (one per station, between its two platforms), Batwing drop
// sites (any other site flagged fastTravel), and the Batcave's entrances.
// [polish2] Every El station: the Loop's and the West Line's beyond it.
export const ALL_EL_STATIONS = [...EL_STATIONS, ...EL_WEST_STATIONS];
export function fastTravelPoints(sites = REGION_SITES, stations = ALL_EL_STATIONS, districtAt = regionDistrictAt) {
  const out = [];
  for (const s of stations) {
    // Arrive on a platform (the station's own centre is over the tracks).
    const plat = Object.values(sites).find((q) => q.station === s.id);
    // (No platform site: the middle of the station's north or west platform.)
    const mid = (EL.platformIn + EL.platformOut) / 2;
    const at = plat ?? { x: s.along === 'z' ? s.x - mid : s.x, y: EL.platformTop, z: s.along === 'x' ? s.z - mid : s.z };
    out.push({ id: s.id, kind: 'el', x: at.x, y: at.y ?? EL.platformTop, z: at.z, label: titleCase(s.name), line: s.line, district: districtAt(s.x, s.z) });
  }
  for (const [id, s] of Object.entries(sites)) {
    if (s.station) continue; // El platforms are covered above
    if (s.kind === 'fastTravel' || s.fastTravel) out.push({ id, kind: 'batwing', x: s.x, y: s.y ?? 0, z: s.z, label: s.label ?? labelFromId(id), district: districtAt(s.x, s.z) });
    else if (s.interior === 'batcave' && (s.kind === 'door' || s.kind === 'cave')) out.push({ id, kind: 'batcave', x: s.x, y: s.y ?? 0, z: s.z, yaw: s.yaw ?? 0, label: s.label ?? labelFromId(id), district: districtAt(s.x, s.z) });
  }
  return out;
}

function titleCase(s) { return String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }
function labelFromId(id) { return id.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim(); }

// The El as drawn: the Loop rectangle's centre line and the West Line to where it is built.
export function elTracks() {
  const loop = loopTrack(0, 1, 4).map((p) => ({ x: p.x, z: p.z }));
  const west = westTrack(0).map((p) => ({ x: p.x, z: p.z }));
  return [loop, west];
}

// Builds the model. `graph`: the street graph; `footprints`: building footprints (above);
// `groundAt(x, z)`: top surface height (optional, lets piers and islands show as land).
export function buildCityMap({ graph = null, footprints = [], groundAt = null, sites = REGION_SITES, regions = REGION_DATA, districtAt = regionDistrictAt, landCell = 5, districtCell = 10, coreLandmarks = [] } = {}) {
  const b = CITY_BOUNDS;
  const land = regions.map((r) => ({ ...r.bounds, region: r.id }));
  const water = rasterRects(b, landCell, (x, z) => waterKindAt(x, z, groundAt)).map((r) => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, kind: r.tag }));

  // Districts: every land cell inside a region, tagged with its district id.
  const byId = new Map(DISTRICTS.map((d) => [d.id, d]));
  const tagged = rasterRects(b, districtCell, (x, z) => {
    // Water is not excluded: island districts (Arkham, Blackgate, the pier) sit inside water
    // bodies; the painter draws the water on top wherever nothing stands.
    if (!regionDataAt(x, z)) return null;
    const id = districtAt(x, z);
    return byId.has(id) ? id : null;
  });
  const districts = [];
  for (const d of DISTRICTS) {
    const rects = tagged.filter((r) => r.tag === d.id).map(({ minX, maxX, minZ, maxZ }) => ({ minX, maxX, minZ, maxZ }));
    let area = 0, sx = 0, sz = 0;
    for (const r of rects) { const a = (r.maxX - r.minX) * (r.maxZ - r.minZ); area += a; sx += a * (r.minX + r.maxX) / 2; sz += a * (r.minZ + r.maxZ) / 2; }
    // The label sits at the palette centre when the district has one inside it, else the centroid.
    const pc = d.palette?.center;
    const inside = pc && rects.some((r) => inRect(r, pc.x, pc.z));
    districts.push({ id: d.id, label: d.label, tint: d.tint, region: d.region, park: PARK_DISTRICTS.has(d.id), rects, area,
      cx: inside ? pc.x : area ? sx / area : pc?.x ?? 0, cz: inside ? pc.z : area ? sz / area : pc?.z ?? 0 });
  }

  const streets = [];
  if (graph) {
    for (const e of graph.edges) {
      const A = graph.nodes[e.a], B = graph.nodes[e.b];
      streets.push({ edge: e.id, x0: A.x, y0: A.y, z0: A.z, x1: B.x, y1: B.y, z1: B.z, cls: streetClass(e), width: e.width, bridge: e.bridge ?? null, deck: e.deck });
    }
  }
  // Movable bridges: the middle of their edges.
  const bridgeMap = new Map();
  for (const s of streets) {
    if (!s.bridge) continue;
    const m = bridgeMap.get(s.bridge) ?? { id: s.bridge, sx: 0, sz: 0, n: 0, axis: Math.abs(s.x1 - s.x0) > Math.abs(s.z1 - s.z0) ? 'x' : 'z' };
    m.sx += (s.x0 + s.x1) / 2; m.sz += (s.z0 + s.z1) / 2; m.n++;
    bridgeMap.set(s.bridge, m);
  }
  const bridges = [...bridgeMap.values()].map((m) => ({ id: m.id, x: m.sx / m.n, z: m.sz / m.n, axis: m.axis }));

  const buildings = footprints.map((f) => ({ x: f.x, z: f.z, w: f.w, d: f.d, h: f.h ?? 10, district: f.district ?? districtAt(f.x, f.z) }));

  const landmarks = [];
  for (const [id, s] of Object.entries(sites)) {
    if (s.station || s.kind === 'fastTravel' || s.fastTravel) continue;
    const icon = ICON_FOR_KIND[s.kind];
    if (!icon || !['landmark', 'vista', 'rooftop', 'collectible', 'cave', 'arena', 'landing'].includes(s.kind)) continue;
    landmarks.push({ id, x: s.x, y: s.y ?? 0, z: s.z, kind: s.kind, icon, label: s.label ?? labelFromId(id), district: districtAt(s.x, s.z) });
  }
  for (const l of coreLandmarks) landmarks.push({ icon: 'star', kind: 'landmark', y: 0, district: districtAt(l.x, l.z), ...l });

  const el = {
    tracks: elTracks(),
    stations: ALL_EL_STATIONS.map((s) => ({ id: s.id, name: titleCase(s.name), x: s.x, y: EL.platformTop, z: s.z, line: s.line })),
  };
  return { bounds: { ...b }, water, land, districts, streets, el, buildings, landmarks, fastTravel: fastTravelPoints(sites, ALL_EL_STATIONS, districtAt), bridges };
}

// The district record of the model at (x, z), or null.
export function districtOfModel(model, x, z) {
  for (const d of model.districts) for (const r of d.rects) if (inRect(r, x, z)) return d;
  return null;
}
