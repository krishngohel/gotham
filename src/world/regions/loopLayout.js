// Layout numbers for the Loop (rows 2-5, north of the proof region's first row), Gotham Mile and
// the El (the Loop rectangle and the West Line). Pure: the street graph, the builders, the train
// runtime, the tests and the neighbouring districts' agents all read these, so the streets, the
// structure and the trains can never disagree.
//
// Axes as everywhere: x east, z south (north is -z), metres. Scale rule (long-night-2.md 8): plan
// x0.3, heights x0.45, true size where a body touches (stairs, platforms, doors, railings).

// ---- the Loop ----
// The core's x lines continue north (60 m pitch). Street centre lines running east-west: the
// proof row's El street (-359), then 60 m on, and the Loop's north edge street (-593) whose north
// kerb is exactly the region edge (z -600), so nothing it needs lies in the districts north of it.
export const LOOP = {
  minX: -266, maxX: 236, minZ: -600, maxZ: -306,
  rowSouthZ: -366,                         // the proof row's north kerb: our rows start here
  xLines: [-210, -150, -90, -30, 30, 90, 150, 210],
  zLines: [-359, -419, -479, -539, -593],  // -359 is the proof row's (already in the graph)
  street: 14, sidewalk: 3,
  // The x -150 canyon ends at the Gotham Exchange, which closes it on the north row.
  canyonX: -150, canyonEndZ: -539,
};
// Block columns between the x lines (kerb to kerb), west edge to east edge.
export const LOOP_COLUMNS = [
  { c: -240, x0: -263, x1: -217 }, { c: -180, x0: -203, x1: -157 }, { c: -120, x0: -143, x1: -97 },
  { c: -60, x0: -83, x1: -37 }, { c: 0, x0: -23, x1: 23 }, { c: 60, x0: 37, x1: 83 },
  { c: 120, x0: 97, x1: 143 }, { c: 180, x0: 157, x1: 203 }, { c: 226, x0: 217, x1: 235 },
];
// Block rows north of the proof row (kerb to kerb).
export const LOOP_ROWS = [
  { c: -389, z0: -412, z1: -366 }, { c: -449, z0: -472, z1: -426 },
  { c: -509, z0: -532, z1: -486 }, { c: -566, z0: -586, z1: -546 },
];

// ---- Gotham Mile ----
// A 30 m boulevard with a planted median on x 150, the Loop's x lines -30, 30, 90 carried north,
// cross streets every 60 m. Block rows (kerb to kerb) and columns (the boulevard's kerbs at 135
// and 165; the east blocks run to 230, with a 6 m promenade to the park edge).
export const MILE = {
  minX: -40, maxX: 236, minZ: -780, maxZ: -600,
  xLines: [-30, 30, 90], boulevardX: 150, boulevardW: 30, medianW: 6,
  zLines: [-593, -653, -713, -773],
  street: 14,
};
export const MILE_COLUMNS = [
  { c: 0, x0: -23, x1: 23 }, { c: 60, x0: 37, x1: 83 }, { c: 116, x0: 97, x1: 135 }, { c: 197.5, x0: 165, x1: 230 },
];
export const MILE_ROWS = [
  { c: -623, z0: -646, z1: -600 }, { c: -683, z0: -706, z1: -660 }, { c: -743, z0: -766, z1: -720 },
];

// ---- the El ----
// Heights from the research doc (1.2) and the proof stretch (riverfront.js elStretch): deck
// underside 5.5, deck top 7.1, rail top 7.5; two tracks 2.2 m either side of the centre line.
// Platforms stand at the car floor (rail + EL_CAR.floorY 1.1), so a body walks straight on.
export const EL = {
  deckBottom: 5.5, deckTop: 7.1, railTop: 7.5, deckHalf: 4.5, track: 2.2, column: 6.2, bent: 12,
  platformTop: 8.55, platformIn: 3.75, platformOut: 6.15, platformLen: 64,
  // The Loop rectangle: legs on the x -90 / 90 streets and the z -359 / -539 streets (the south
  // leg is the proof stretch on -359; the research sketch's -330 predates the row's real street).
  loop: { minX: -90, maxX: 90, minZ: -539, maxZ: -359 },
  cornerR: 10,
  // West Line: west out of the Loop along the z -479 street. Its east end is a terminal beside the
  // rectangle's west leg; it runs to x -580 when the western districts join (they build their own
  // stretch to these numbers). Inside the Loop region it is built to the region edge.
  // [polish2] Beyond the Loop the western districts' stretch is built by el.js buildElWest: the
  // tracks end at trackWestX (a four-car train standing against the buffers there is centred on
  // the Park Row terminus at x -520), the deck a little past them at deckWestX.
  westLine: { z: -479, eastX: -100, westX: -580, regionEdgeX: -266, trackWestX: -551, deckWestX: -557 },
};

// Stations: centre, the axis the line runs along ('x' or 'z'), and one stair per platform
// ({ side: +1 | -1 of the centre line, top: along-offset of the stair head, dir: +1 | -1 }).
// Stairs come down onto the block sidewalk between the cross streets (they never land in a road).
export const EL_STATIONS = [
  { id: 'elRiverside', name: 'RIVERSIDE', line: 'loop', x: 0, z: -359, along: 'x', stairs: [{ side: -1, top: 10, dir: 1 }], north: true },
  { id: 'elLafayette', name: 'LAFAYETTE', line: 'loop', x: 0, z: -539, along: 'x', stairs: [{ side: -1, top: -10, dir: -1 }, { side: 1, top: 10, dir: 1 }] },
  { id: 'elKane', name: 'KANE STREET', line: 'loop', x: -90, z: -449, along: 'z', stairs: [{ side: -1, top: 10, dir: 1 }, { side: 1, top: -10, dir: -1 }] },
  { id: 'elCityHall', name: 'CITY HALL', line: 'loop', x: 90, z: -449, along: 'z', stairs: [{ side: -1, top: -10, dir: -1 }, { side: 1, top: 10, dir: 1 }] },
  { id: 'elWestJunction', name: 'WELLS JUNCTION', line: 'west', x: -132, z: -479, along: 'x', stairs: [{ side: -1, top: 7, dir: 1 }, { side: 1, top: 17, dir: 1 }] },
  { id: 'elCanal', name: 'CANAL', line: 'west', x: -226, z: -479, along: 'x', stairs: [{ side: -1, top: -6, dir: -1 }, { side: 1, top: 26, dir: 1 }] },
];
// [polish2] The West Line's stations beyond the Loop (the plots westLayout.js WEST.el.stations
// keeps clear). Each platform straddles its cross street the way an El station sits over an
// avenue; the stairs come down onto the corridor street's sidewalks either side of it.
export const EL_WEST_STATIONS = [
  { id: 'elNarrows', name: 'NARROWS', line: 'west', region: 'narrows', x: -370, z: -479, along: 'x', stairs: [{ side: -1, top: -10, dir: -1 }, { side: 1, top: 10, dir: 1 }] },
  { id: 'elParkRow', name: 'PARK ROW', line: 'west', region: 'parkRow', x: -520, z: -479, along: 'x', stairs: [{ side: -1, top: -10, dir: -1 }, { side: 1, top: 10, dir: 1 }] },
];
// The ground footprint of every station stair, from its head to a little past its foot, padded:
// street furniture and lamps keep out of these so the way up stays clear.
export function stairZones(pad = 1.0) {
  const out = [];
  const n = Math.ceil((EL.platformTop - 0.15) / 0.3), run = n * 0.4;
  for (const st of EL_STATIONS) {
    for (const s of st.stairs) {
      const a = (st.along === 'x' ? st.x : st.z) + s.top, b = a + s.dir * (run + 1.5);
      const lat = (st.along === 'x' ? st.z : st.x) + s.side * (EL.platformOut + 1.85);
      const [l0, l1] = [Math.min(a, b) - pad, Math.max(a, b) + pad], [m0, m1] = [lat - 0.9 - pad, lat + 0.9 + pad];
      out.push(st.along === 'x' ? { minX: l0, maxX: l1, minZ: m0, maxZ: m1 } : { minX: m0, maxX: m1, minZ: l0, maxZ: l1 });
    }
  }
  return out;
}
export const inStairZone = (zones, x, z) => zones.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);

// Stations the West Line is planned to call at beyond the Loop (research 3.3), for the western
// districts' builders; positions are theirs to adjust to their streets.
export const WEST_LINE_PLANNED = [
  { id: 'elNarrows', name: 'NARROWS', x: -370, z: -479 },
  { id: 'elParkRow', name: 'PARK ROW', x: -520, z: -479 },
  { id: 'elChinatown', name: 'CHINATOWN', x: -520, z: -120 },
  { id: 'elYards', name: 'THE YARDS', x: -520, z: 100 },
];

// ---- track paths (pure maths) ----

// The Loop rectangle as a closed polyline at `offset` metres outward from the centre line (the
// outer track +2.2, the inner -2.2). As built it runs west along the south leg, north up the west
// leg, east along the north leg and south down the east leg (clockwise on a north-up map); `dir`
// -1 reverses it. Corners are arcs of radius cornerR + offset about centres cornerR inside the
// centre-line corner, so both tracks stay parallel through the curve.
export function loopTrack(offset = EL.track, dir = 1, seg = 8) {
  const { minX, maxX, minZ, maxZ } = EL.loop;
  const R = EL.cornerR;
  const r = R + offset;
  const pts = [];
  // Angles in the x-z plane (x = cos, z = sin); each arc turns +90 degrees.
  const corners = [
    { cx: minX + R, cz: maxZ - R, a0: Math.PI / 2 },   // south-west: south leg -> west leg
    { cx: minX + R, cz: minZ + R, a0: Math.PI },       // north-west
    { cx: maxX - R, cz: minZ + R, a0: -Math.PI / 2 },  // north-east
    { cx: maxX - R, cz: maxZ - R, a0: 0 },             // south-east
  ];
  for (const c of corners) {
    for (let k = 0; k <= seg; k++) {
      const p = polar(c, r, c.a0 + (k / seg) * (Math.PI / 2));
      pts.push({ x: p.x, z: p.z });
    }
  }
  pts.push({ ...pts[0] });
  const out = dir > 0 ? pts : pts.slice().reverse();
  return out.map((p) => ({ x: p.x, y: EL.railTop, z: p.z }));
}
// Point on a corner arc: angle a in the x-z plane (x = cos, z = sin), centre (cx, cz).
function polar(c, r, a) { return { x: c.cx + r * Math.cos(a), z: c.cz + r * Math.sin(a) }; }

// The West Line track at `offset` (north track -2.2, south +2.2), from its west end (x westX,
// clipped to `westX` given; by default the built end at Park Row) to the junction terminal's buffer stop.
export function westTrack(offset, westX = EL.westLine.trackWestX) {
  const z = EL.westLine.z + offset;
  return [{ x: westX, y: EL.railTop, z }, { x: EL.westLine.eastX - 2, y: EL.railTop, z }];
}

// Cumulative lengths of a polyline (for pathPoint).
export function pathTable(pts) {
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return { pts, cum, length: cum[pts.length - 1] };
}
// Point and heading s metres along a path table (wrapping when `closed`). Allocation-free with `out`.
export function pathPoint(T, s, closed, out) {
  const L = T.length;
  if (closed) s = ((s % L) + L) % L; else s = Math.min(Math.max(s, 0), L);
  const cum = T.cum, pts = T.pts;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi];
  const seg = cum[hi] - cum[lo];
  const t = seg > 0 ? (s - cum[lo]) / seg : 0;
  out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t;
  out.yaw = Math.atan2(b.x - a.x, b.z - a.z);
  return out;
}
// Distance along a path table of the point nearest (x, z).
export function pathProject(T, x, z) {
  let best = Infinity, bs = 0;
  for (let i = 0; i + 1 < T.pts.length; i++) {
    const a = T.pts[i], b = T.pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2)) : 0;
    const d = (a.x + dx * t - x) ** 2 + (a.z + dz * t - z) ** 2;
    if (d < best) { best = d; bs = T.cum[i] + Math.sqrt(L2) * t; }
  }
  return bs;
}

// Export for the western districts and the integrator: the West Line as data.
export function westLineData() {
  return {
    z: EL.westLine.z, railTop: EL.railTop, deckTop: EL.deckTop, deckBottom: EL.deckBottom,
    deckHalf: EL.deckHalf, track: EL.track, column: EL.column, bent: EL.bent,
    platformTop: EL.platformTop, platformIn: EL.platformIn, platformOut: EL.platformOut,
    eastX: EL.westLine.eastX, westX: EL.westLine.westX, builtToX: EL.westLine.regionEdgeX,
    trackWestX: EL.westLine.trackWestX, deckWestX: EL.westLine.deckWestX,
    stations: [...EL_STATIONS.filter((s) => s.line === 'west'), ...EL_WEST_STATIONS].map(({ id, name, x, z }) => ({ id, name, x, z })),
    planned: WEST_LINE_PLANNED,
  };
}
