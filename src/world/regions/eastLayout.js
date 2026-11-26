// Layout numbers for the east side of the city (workstream H2): Robinson Park and Lakeshore
// Drive, the Museum Campus, the Amusement Mile pier, Arkham Island and the lake around them.
// Pure (no three.js): the region data, the street graph and the builders all read these, so the
// roads the graph routes along are exactly the roads the builders pave.
//
// Axes as everywhere: x east, z south (north is -z), y up, metres. Scale rule (long-night-2.md
// section 8): plan x0.3, heights x0.45, anything a body touches at true size.

export const LAKE_LEVEL = -0.6;   // the lake is at harbour level (research 3.3); the river is 5.4 m lower
export const SHORE_X = 366;       // the seawall: land west of it, the lake east of it

// Cubic Bezier sampled into n + 1 points (the S-curves of Lakeshore Drive).
export function bezier(p0, p1, p2, p3, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push({ x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, z: a * p0.z + b * p1.z + c * p2.z + d * p3.z });
  }
  return out;
}

const LSD_X = 345, VIADUCT_X = 391;
// Lakeshore Drive's centre line, north to south. It runs along the park, swings out over the lake
// on a viaduct to cross the river mouth (Lower Gotham and the river own the shore there), and swings
// back to the shore beside Old Gotham, down to the Museum Campus (research 1.6: the S-curve).
const NORTH_CURVE = bezier({ x: LSD_X, z: -400 }, { x: LSD_X, z: -360 }, { x: VIADUCT_X, z: -355 }, { x: VIADUCT_X, z: -315 }, 10);
const SOUTH_CURVE = bezier({ x: VIADUCT_X, z: -225 }, { x: VIADUCT_X, z: -185 }, { x: LSD_X, z: -180 }, { x: LSD_X, z: -140 }, 10);

export const EAST = {
  // Robinson Avenue: the frontage road along the park's west edge (Michigan Avenue's role), north
  // of the river beside the Loop and Gotham Mile, south of it beside Old Gotham.
  front: { x: 245, width: 14, sidewalk: 4, north: [-780, -306], south: [-236, 190] },
  // Lakeshore Drive: 4 lanes and a planted median, the city's fast road.
  lsd: { x: LSD_X, width: 22, median: 2.4, viaductX: VIADUCT_X, northEnd: -780, southEnd: 190, northCurve: NORTH_CURVE, southCurve: SOUTH_CURVE },
  promenade: { x0: 357, x1: SHORE_X },   // the seawall promenade between the drive and the lake
  park: { x0: 256, x1: 332 },            // Robinson Park's lawns between the avenue and the drive
  // Cross drives through the park (avenue <-> drive, both ways) and where the core's and the
  // Loop's streets meet the avenue.
  crossNorth: [-419, -539, -719],
  crossSouth: [-30, 30],
  coreStitch: [-210, -150, -90, -30, 30, 90, 150],    // the core's z lines end at x 236
  // Boundary endpoints offered to the Loop / Gotham Mile builders on x 236 (the avenue has a node at
  // each; a 9 m edge from (236, z) to (245, z) stitches a street on).
  loopStitch: [-359, -419, -479, -539, -599, -659, -719, -779],
  lgLink: { z: -298 },                    // the viaduct's link to Lower Gotham's east plaza (360, -298)
  causeway: { z: -80, x0: LSD_X, x1: 572, width: 12 },
  museumDrive: { z: 190 },
  pier: { x0: SHORE_X, x1: 626, z0: -472, z1: -428, deck: 3, z: -450 },
  arkham: { x0: 560, x1: 740, z0: -160, z1: 0, plateau: 5 },
  wheel: { x: 446, z: -450, axle: 34, radius: 26, gondolas: 24, period: 150 },
  // Water bodies (data.js `water`): the open lake out to the horizon, beyond the harbour's plane.
  lake: { minX: SHORE_X, maxX: 2600, minZ: -2600, maxZ: 205 },
  lakeSE: { minX: 900, maxX: 2600, minZ: 205, maxZ: 2600 },
};

// Lakeshore Drive as one polyline (north to south), with the nodes the graph needs on it.
export function lsdLine() {
  const L = EAST.lsd;
  const pts = [];
  const push = (p) => { const q = pts[pts.length - 1]; if (!q || Math.hypot(q.x - p.x, q.z - p.z) > 0.5) pts.push(p); };
  for (const z of [L.northEnd, -719, -659, -599, -539, -479, -450, -419]) push({ x: L.x, z });
  for (const p of L.northCurve) push(p);
  push({ x: L.viaductX, z: EAST.lgLink.z });
  for (const p of L.southCurve) push(p);
  for (const z of [-90, EAST.causeway.z, -30, 30, 90, 150, L.southEnd]) push({ x: L.x, z });
  return pts;
}

// Sites and spots, named once so data.js, the builders and the tests agree.
export const PIER_RECT = { minX: SHORE_X, maxX: 640, minZ: -480, maxZ: -420 };
export const ISLAND_RECT = { minX: 552, maxX: 748, minZ: -168, maxZ: 8 };
export const CAUSEWAY_RECT = { minX: SHORE_X, maxX: 560, minZ: -88, maxZ: -72 };
export const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
