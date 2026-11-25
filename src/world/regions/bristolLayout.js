// Bristol's layout as pure data and maths (no three.js): the hills, the roads and the water.
// Shared by the region data (the collision floor is this heightfield), the street graph (the
// roads with their heights) and the builder (terrain mesh, road ribbons, rocks, trees).
//
// The land: an escarpment runs east-west across the region at z -700. North of it a plateau
// (18 m in the west, falling away east toward the village and Gotham Mile), south of it the
// lowland along Bristol Road. Below Wayne Manor the escarpment is a cliff over a small lake (the
// waterfall and the cave mouth are there); elsewhere it is a slope of at most ~0.28 that the
// roads climb in switchbacks. Every edge that meets another region (z -600, x -40) is at y 0.
//
// Collision: the region's floor is this heightfield (bilinear on a 3 m grid, the same vertices
// the terrain mesh is drawn from), so the hero and cars walk and drive on the real slope; cells
// steeper than ROCK_SLOPE are covered by rock boxes the builder adds (a wall from below, a flat
// top from above), so nothing ever has to climb a face the step rule cannot take.

export const BRISTOL = {
  minX: -580, maxX: -40, minZ: -780, maxZ: -600,
  step: 3,
  escarpZ: -700,
  plateau: 18,
  manor: { x: -400, z: -745 },
  forecourt: { x: -362, z: -745 },
  gates: { x: -280, z: -752 },
  lake: { x: -385, z: -668, rx: 40, rz: 18, level: -0.2, bed: -1.6 },
  cliff: { x0: -440, x1: -345 },
  cave: { x: -395, z: -691, w: 6, depth: 8 },
  waterfall: { x: -395, z: -700 },
  boathouse: { x: -428, z: -668 },
  cemetery: { x: -537, z: -748, w: 54, d: 40 },
  familyPlot: { x: -548, z: -756 },
  overlook: { x: -214, z: -763 },
  village: { z: -672, x0: -170, x1: -55 },
  church: { x: -158, z: -692 },
  pub: { x: -120, z: -689 },
  garage: { x: -62, z: -660 },
  estates: [
    { id: 'ashcombe', name: 'Ashcombe House', x: -255, z: -652, w: 44, d: 28, gate: 's' },
    { id: 'kestrel', name: 'Kestrel Hall', x: -170, z: -745, w: 40, d: 30, gate: 's' },
  ],
};

export const ROCK_SLOPE = 0.75;

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// Plateau height along x: 18 m in the west, down to the village and 0 at Gotham Mile.
function ridgeH(x) {
  if (x <= -300) return 18;
  if (x <= -200) return lerp(18, 11, smooth(-300, -200, x));
  if (x <= -110) return lerp(11, 3, smooth(-200, -110, x));
  return lerp(3, 0, smooth(-110, -50, x));
}
// Width of the escarpment's slope south of its top edge: a cliff under the manor, gentle elsewhere.
function slopeW(x) {
  const { x0, x1 } = BRISTOL.cliff;
  if (x >= x0 && x <= x1) return 6;
  if (x < x0) return lerp(6, 95, smooth(x0, x0 - 12, x));
  return lerp(6, 95, smooth(x1, x1 + 12, x));
}

// A cheap smooth value noise for the lowland's rolls (deterministic).
function hash2(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(i, j), hash2(i + 1, j), u), lerp(hash2(i, j + 1), hash2(i + 1, j + 1), u), v);
}

// The natural ground before roads, pads and water are cut in.
export function baseHeight(x, z) {
  const zE = BRISTOL.escarpZ, w = slopeW(x);
  const s = 1 - smooth(zE, zE + w, z); // 1 on the plateau, 0 at the slope's foot
  let h = ridgeH(x) * s;
  // Rolls: a metre or so in the lowland and on the plateau, none at the cliff.
  const roll = (noise(x / 46, z / 46) - 0.5) * 2.2 + (noise(x / 17 + 9, z / 17 + 3) - 0.5) * 0.6;
  h += roll * (w > 20 ? 1 : 0.2);
  // The overlook knoll at the east end of the ridge.
  const o = BRISTOL.overlook;
  h += 3 * Math.exp(-((x - o.x) ** 2 + (z - o.z) ** 2) / (2 * 22 * 22));
  // Every edge another region meets is at street level (and nothing natural dips under the water).
  h = Math.max(0, h);
  h *= smooth(BRISTOL.maxZ, BRISTOL.maxZ - 14, z) * smooth(BRISTOL.maxX, BRISTOL.maxX - 16, x);
  return h;
}

// ---------------------------------------------------------------- roads

// Junctions and ends (x, z). Ends on the region's edge are the boundary endpoints other regions
// stitch to (listed in BRISTOL_ENTRIES).
const P = {
  E1: [-460, -600], E2: [-310, -600], E3: [-210, -600], E4: [-90, -600], E5: [-40, -713], E6: [-150, -600],
  JW: [-460, -619], JN: [-310, -618], JL1: [-210, -617], JL2: [-90, -618], JL3: [-150, -620],
  JV1: [-95, -672], JVW: [-170, -674], JO: [-230, -728], G: [-280, -752], FC: [-351, -745],
  OV: [-214, -758], CG: [-500, -730],
};
export const BRISTOL_ENTRIES = [
  { id: 'parkRow', x: -460, z: -600, toward: "Park Row: its x -460 street (merges on build)" },
  { id: 'narrows', x: -310, z: -600, toward: 'The riverside drive (x -310) over the north cut (merges on build)' },
  { id: 'loopWest', x: -210, z: -600, toward: 'The Loop: its x -210 stub (merges on build)' },
  { id: 'loopCanyon', x: -150, z: -600, toward: 'The Loop: its x -150 stub (merges on build)' },
  { id: 'loopEast', x: -90, z: -600, toward: 'The Loop: its x -90 stub (merges on build)' },
  { id: 'mile', x: -40, z: -713, toward: "Gotham Mile: its z -713 street's west end (merges on build)" },
];

// kind: 'lane' (asphalt, 8 m) | 'drive' (gravel, 6 m) | 'spur' (asphalt, 8 m, straight)
export const ROAD_DEFS = [
  { id: 'parkRowSpur', kind: 'spur', pts: ['E1', 'JW'] },
  { id: 'bristolRoadW', kind: 'lane', name: 'Bristol Road', pts: ['JW', [-420, -620], [-370, -617], 'JN'] },
  { id: 'narrowsSpur', kind: 'spur', pts: ['E2', 'JN'] },
  { id: 'bristolRoadM', kind: 'lane', name: 'Bristol Road', pts: ['JN', [-288, -624], [-250, -620], 'JL1'] },
  { id: 'loopSpurW', kind: 'spur', pts: ['E3', 'JL1'] },
  { id: 'bristolRoadE', kind: 'lane', name: 'Bristol Road', pts: ['JL1', [-180, -622], 'JL3'] },
  { id: 'loopSpurC', kind: 'spur', pts: ['E6', 'JL3'] },
  { id: 'bristolRoadF', kind: 'lane', name: 'Bristol Road', pts: ['JL3', [-125, -616], 'JL2'] },
  { id: 'loopSpurE', kind: 'spur', pts: ['E4', 'JL2'] },
  { id: 'churchLane', kind: 'lane', name: 'Church Lane', pts: ['JL2', [-80, -640], 'JV1'] },
  { id: 'villageW', kind: 'lane', name: 'Village Street', pts: ['JVW', [-135, -671], 'JV1'] },
  { id: 'villageE', kind: 'lane', name: 'Village Street', pts: ['JV1', [-66, -682], [-50, -703], 'E5'] },
  { id: 'ridgeRoadE', kind: 'lane', name: 'Ridge Road', pts: ['JVW', [-196, -688], [-214, -710], 'JO'] },
  { id: 'ridgeRoadW', kind: 'lane', name: 'Ridge Road', pts: ['JO', [-258, -737], 'G'] },
  { id: 'manorDrive', kind: 'drive', name: 'Manor Drive', pts: ['G', [-310, -751], [-335, -748], 'FC'] },
  { id: 'forecourt', kind: 'drive', pts: ['FC', [-355, -734], [-369, -734], [-374, -745], [-369, -756], [-355, -756], 'FC'], loop: true },
  { id: 'overlookLane', kind: 'lane', name: 'Overlook Lane', pts: ['JO', [-226, -746], 'OV'] },
  { id: 'cemeteryLane', kind: 'lane', name: 'Cemetery Lane', pts: ['JW', [-500, -625], [-545, -632], [-570, -648], [-574, -668], [-556, -680], [-530, -686], [-505, -694], [-490, -712], 'CG'] },
];
const WIDTH = { lane: 8, drive: 6, spur: 8 };
const GRADE = 0.105;

// Footpaths (on foot only): each leaves a road at the road node nearest `near` (or the road's last
// node) through a gap in the walls. [x, z, y] points.
export const FOOTPATHS = [
  { id: 'lakeShore', road: 'bristolRoadW', near: [-440, -617], pts: [[-438, -628, 0.4], [-437, -642, 0.4], [-438.2, -662, 0.4], [-436.5, -683.5, 0.4], [-403, -685, 0.3], [-395, -686.5, 0.3]] },
  { id: 'manorBackGate', road: 'cemeteryLane', end: true, pts: [[-470, -742, 18], [-455, -745, 18]] },
];

// The stream from the lake to the head of the Narrows Cut, and the lake itself.
export const STREAM = [[-400, -650], [-418, -636], [-432, -618], [-440, -602]];

const named = (p) => (typeof p === 'string' ? P[p] : p);

// Chaikin-rounds a polyline's inner corners (ends stay put) and densifies it to ~`step` metres.
function roundAndDensify(pts, step, closed = false) {
  let a = pts.map(([x, z]) => ({ x, z }));
  for (let it = 0; it < 2; it++) {
    const out = [a[0]];
    for (let i = 0; i + 1 < a.length; i++) {
      const p = a[i], q = a[i + 1];
      if (i > 0 || closed) out.push({ x: p.x * 0.75 + q.x * 0.25, z: p.z * 0.75 + q.z * 0.25 });
      if (i + 2 < a.length || closed) out.push({ x: p.x * 0.25 + q.x * 0.75, z: p.z * 0.25 + q.z * 0.75 });
    }
    out.push(a[a.length - 1]);
    a = out;
  }
  const d = [a[0]];
  for (let i = 0; i + 1 < a.length; i++) {
    const p = a[i], q = a[i + 1], L = Math.hypot(q.x - p.x, q.z - p.z), n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) d.push({ x: p.x + ((q.x - p.x) * k) / n, z: p.z + ((q.z - p.z) * k) / n });
  }
  return d;
}

// Road heights: the ground under the road, smoothed, then held to GRADE with both ends pinned
// (junction heights are shared by every road meeting there).
function profile(pts, y0, y1) {
  const n = pts.length;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  let y = pts.map((p) => baseHeight(p.x, p.z));
  for (let it = 0; it < 6; it++) y = y.map((v, i) => (i === 0 || i === n - 1 ? v : (y[i - 1] + 2 * v + y[i + 1]) / 4));
  y[0] = y0; y[n - 1] = y1;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < n; i++) y[i] = Math.min(y[i], y[i - 1] + GRADE * (s[i] - s[i - 1])), y[i] = Math.max(y[i], y[i - 1] - GRADE * (s[i] - s[i - 1]));
    y[n - 1] = y1;
    for (let i = n - 2; i >= 0; i--) y[i] = Math.min(y[i], y[i + 1] + GRADE * (s[i + 1] - s[i])), y[i] = Math.max(y[i], y[i + 1] - GRADE * (s[i + 1] - s[i]));
    y[0] = y0;
  }
  return pts.map((p, i) => ({ x: p.x, y: y[i], z: p.z, s: s[i] }));
}

const junctionY = new Map();
function pinY(key) {
  if (typeof key !== 'string') return null;
  if (!junctionY.has(key)) {
    const [x, z] = P[key];
    const onEdge = Math.abs(z - BRISTOL.maxZ) < 0.5 || Math.abs(x - BRISTOL.maxX) < 0.5;
    junctionY.set(key, onEdge ? 0 : Math.max(0.15, baseHeight(x, z)));
  }
  return junctionY.get(key);
}

let ROADS = null;
// Every road: { id, kind, name, width, points: [{ x, y, z, s }] (densified ~3 m, the ribbon and the
// carve), nodes: [{ x, y, z }] (every ~15 m, the street graph) }.
export function bristolRoads() {
  if (ROADS) return ROADS;
  ROADS = ROAD_DEFS.map((d) => {
    const raw = d.pts.map(named);
    const pts = roundAndDensify(raw, 3, d.loop);
    const first = d.pts[0], last = d.pts[d.pts.length - 1];
    const y0 = pinY(first) ?? baseHeight(raw[0][0], raw[0][1]);
    const y1 = pinY(last) ?? baseHeight(raw[raw.length - 1][0], raw[raw.length - 1][1]);
    const points = profile(pts, y0, y1);
    const total = points[points.length - 1].s;
    const nNodes = Math.max(1, Math.round(total / 15));
    const nodes = [];
    for (let k = 0, j = 0; k <= nNodes; k++) {
      const target = (total * k) / nNodes;
      while (j + 1 < points.length && points[j + 1].s < target - 1e-6) j++;
      const a = points[j], b = points[Math.min(points.length - 1, j + 1)];
      const t = b.s > a.s ? (target - a.s) / (b.s - a.s) : 0;
      nodes.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
    }
    nodes[0] = { x: raw[0][0], y: y0, z: raw[0][1] };
    nodes[nodes.length - 1] = { x: raw[raw.length - 1][0], y: y1, z: raw[raw.length - 1][1] };
    return { id: d.id, kind: d.kind, name: d.name ?? null, width: WIDTH[d.kind], points, nodes, loop: !!d.loop };
  });
  return ROADS;
}

// ---------------------------------------------------------------- the baked heightfield

const NX = Math.round((BRISTOL.maxX - BRISTOL.minX) / BRISTOL.step);
const NZ = Math.round((BRISTOL.maxZ - BRISTOL.minZ) / BRISTOL.step);
let H = null;

// Flat pads where buildings and gardens stand: { x, z, w, d, h (null: the ground at the centre), fall }.
function pads() {
  const B = BRISTOL;
  const out = [
    // Wayne Manor, its forecourt, gardens and terrace: one level lawn at the plateau's height,
    // stopping short of the cliff top (z -700).
    { x: -398, z: -742, w: 132, d: 66, h: B.plateau, fall: 8 },
    { x: B.cemetery.x, z: B.cemetery.z, w: B.cemetery.w + 4, d: B.cemetery.d + 4, h: B.plateau, fall: 12 },
    { x: B.overlook.x, z: B.overlook.z - 1, w: 22, d: 16, h: null, fall: 12 },
    { x: B.church.x, z: B.church.z, w: 26, d: 20, h: null, fall: 10 },
  ];
  // Estates on the slope sit on a lawn at their centre's height, eased out over 26 m (no cliffs).
  for (const e of B.estates) out.push({ x: e.x, z: e.z, w: e.w + 6, d: e.d + 6, h: null, fall: 26 });
  return out;
}

function bake() {
  const B = BRISTOL, st = B.step;
  H = new Float32Array((NX + 1) * (NZ + 1));
  const at = (i, j) => j * (NX + 1) + i;
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) H[at(i, j)] = baseHeight(B.minX + i * st, B.minZ + j * st);
  // Pads (a rectangle at one height, blended out over `fall` metres).
  for (const p of pads()) {
    const h = p.h ?? baseHeight(p.x, p.z);
    p.h = h;
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const x = B.minX + i * st, z = B.minZ + j * st;
      const dx = Math.max(0, Math.abs(x - p.x) - p.w / 2), dz = Math.max(0, Math.abs(z - p.z) - p.d / 2);
      const d = Math.hypot(dx, dz);
      if (d > p.fall) continue;
      H[at(i, j)] = lerp(h, H[at(i, j)], smooth(0, p.fall, d));
    }
  }
  // The lake: a bowl under the cliff, shallow at the shore.
  const L = B.lake;
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const x = B.minX + i * st, z = B.minZ + j * st;
    const r = Math.hypot((x - L.x) / L.rx, (z - L.z) / L.rz);
    if (r < 1) H[at(i, j)] = Math.min(H[at(i, j)], lerp(L.bed, L.level - 0.25, r * r));
    else if (r < 1.5) H[at(i, j)] = Math.min(H[at(i, j)], lerp(0.25, H[at(i, j)], smooth(1, 1.5, r)));
  }
  // The stream: a wadeable channel (0.4 m of water over its bed) with soft banks.
  const sp = roundAndDensify(STREAM, 2);
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const x = B.minX + i * st, z = B.minZ + j * st;
    const d = distToPolyline(sp, x, z);
    if (d < 2.2) H[at(i, j)] = Math.min(H[at(i, j)], -0.6);
    else if (d < 7) H[at(i, j)] = Math.min(H[at(i, j)], lerp(0.1, H[at(i, j)], smooth(2.2, 7, d)));
  }
  // The cave mouth: a notch cut into the foot of the cliff (its walls and roof are rock boxes).
  const c = B.cave;
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const x = B.minX + i * st, z = B.minZ + j * st;
    if (Math.abs(x - c.x) <= c.w / 2 + 1.5 && z >= c.z - c.depth && z <= c.z + 3) H[at(i, j)] = Math.min(H[at(i, j)], 0.3);
  }
  // Roads: flat across, at the road's height, blended into the ground over a 6 m shoulder. All
  // shoulders first, then every road's flat corridor, so no road's shoulder tilts another's surface.
  for (const pass of ['shoulder', 'road']) for (const r of bristolRoads()) {
    const half = r.width / 2 + 1;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of r.points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const i0 = Math.max(0, Math.floor((x0 - half - 7 - B.minX) / st)), i1 = Math.min(NX, Math.ceil((x1 + half + 7 - B.minX) / st));
    const j0 = Math.max(0, Math.floor((z0 - half - 7 - B.minZ) / st)), j1 = Math.min(NZ, Math.ceil((z1 + half + 7 - B.minZ) / st));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = B.minX + i * st, z = B.minZ + j * st;
      const near = nearestOn(r.points, x, z);
      if (near.d > half + 6) continue;
      if (pass === 'road') { if (near.d <= half) H[at(i, j)] = near.y; } else if (near.d > half) H[at(i, j)] = lerp(near.y, H[at(i, j)], smooth(half, half + 6, near.d));
    }
  }
}

function distToPolyline(pts, x, z) {
  let best = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return best;
}
const nearOut = { d: Infinity, y: 0 };
function nearestOn(pts, x, z) {
  nearOut.d = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    if (Math.abs(a.x - x) > 30 && Math.abs(b.x - x) > 30) continue;
    if (Math.abs(a.z - z) > 30 && Math.abs(b.z - z) > 30) continue;
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
    const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
    if (d < nearOut.d) { nearOut.d = d; nearOut.y = a.y + (b.y - a.y) * t; }
  }
  return nearOut;
}
export { distToPolyline, roundAndDensify };

export function bristolGrid() {
  if (!H) bake();
  return { H, NX, NZ, step: BRISTOL.step, minX: BRISTOL.minX, minZ: BRISTOL.minZ };
}

// The ground height at (x, z) (the collision floor and what the terrain mesh shows).
export function bristolHeight(x, z) {
  if (!H) bake();
  const B = BRISTOL;
  const fx = (x - B.minX) / B.step, fz = (z - B.minZ) / B.step;
  if (fx < 0 || fz < 0 || fx > NX || fz > NZ) return 0;
  const i = Math.min(NX - 1, Math.floor(fx)), j = Math.min(NZ - 1, Math.floor(fz));
  const u = fx - i, v = fz - j;
  const a = H[j * (NX + 1) + i], b = H[j * (NX + 1) + i + 1], c = H[(j + 1) * (NX + 1) + i], d = H[(j + 1) * (NX + 1) + i + 1];
  // Same split as the drawn mesh's triangles (a-c-b, b-c-d), so the floor is the visible surface.
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

// Water bodies for the region data (rendered by world/water.js; the floor dips under them).
export const BRISTOL_WATER = [
  { id: 'bristolLake', kind: 'lake', minX: BRISTOL.lake.x - BRISTOL.lake.rx - 6, maxX: BRISTOL.lake.x + BRISTOL.lake.rx + 6, minZ: BRISTOL.lake.z - BRISTOL.lake.rz - 5, maxZ: BRISTOL.lake.z + BRISTOL.lake.rz + 5, level: BRISTOL.lake.level },
  { id: 'bristolStream', kind: 'lake', minX: -446, maxX: -396, minZ: -654, maxZ: -600, level: BRISTOL.lake.level },
];
