// The west side's plan (workstream H3): the North and South Branches of the river with their
// bridges and locks, the South Branch quay, the Narrows island and its channel, Park Row with
// Crime Alley, Chinatown + Little Odessa and the Yards. Pure numbers (no three.js): the region
// data, the street graph, the builders and the tests all read the layout from here, so the roads
// the graph drives are exactly the roads the builders pave.
//
// Axes as everywhere: x east, z south (north is -z), y up, metres. District table:
// docs/design/long-night-2.md section 8. Scale rule: plan x0.3 / heights x0.45 of Chicago, anything
// a body touches true size (5 m alleys, 1.1 m railings, 14 m streets with 3 m sidewalks).

export const WEST = {
  // ---- water ----
  branch: { minX: -300, maxX: -266 },          // North + South Branch channel
  waterY: -6,                                  // river level (the harbour is -0.6: the locks lift 5.4 m)
  wallTop: 0,
  // The Narrows island is ringed by water: the branch on the east, a 20 m channel on the west,
  // and two cuts joining the channel back to the branch (north at the Bristol edge, south at the
  // fork), the way Goose Island sits in the North Branch Canal.
  channel: { minX: -450, maxX: -430, minZ: -588, maxZ: -232 },
  northCut: { minX: -450, maxX: -300, minZ: -600, maxZ: -588 },
  southCut: { minX: -450, maxX: -300, minZ: -246, maxZ: -232 },
  island: { minX: -430, maxX: -300, minZ: -588, maxZ: -246 },
  // The river walk shelf below street level along the quay (the main stem's walk is on its north
  // bank at the same height).
  walkY: -4.5,
  quayWalk: { minX: -272, maxX: -267, minZ: -230, maxZ: 138, stairs: [[-228, -216], [124, 136]] }, // incl. stairs + landings
  // Locks where the South Branch meets the harbour: chamber between two pairs of mitre gates.
  lock: { minX: -300, maxX: -266, lowerZ: 166, upperZ: 200, cycle: 150 }, // lower gates clear of the z 150 bascule

  // ---- streets ----
  // E-W lines. South of the river: the core's own 60 m lines carry straight on west over the
  // South Branch. North: the Loop's phase (its El street is z -359), so every North Branch bridge
  // lands on a Loop street; -298 is Lower Gotham's north-half road (its west plaza).
  zNorth: [-298, -359, -419, -479, -539, -580],
  zSouth: [-210, -150, -90, -30, 30, 90, 150],
  harbourRoad: 197,
  // N-S lines. -310 is the riverside drive on the west bank (end to end); -370 the Narrows and
  // Chinatown middle street; -421 runs inside the island along the channel; -460 runs from the
  // Bristol edge down Park Row (west of the channel) into the Chinatown/Odessa line and the
  // Yards; -520 is Odessa's; -573 the city's west edge street.
  xRiverside: -310,
  street: { width: 14, sidewalk: 3 },
  alley: 5,

  // ---- the El West Line corridor (built by H1 to x -266; reserved here to x -580) ----
  // The Loop's z -479 street carried straight on west (loopLayout.js westLineData(): rail top
  // 7.5, deck 5.5..7.1, deck half-width 4.5, tracks at +-2.2, columns at +-6.2 every 12 m,
  // platforms out to +-6.15 at y 8.55, stairs landing +-8 on the sidewalks). No building in the
  // envelope (street + sidewalks, +-10) at any height; station plots keep 2 m more and the
  // 64 m platforms plus stairs clear.
  el: {
    z: -479, minX: -580, maxX: -266,
    streetWidth: 14,                      // kerb to kerb (z -486..-472), like the Loop's stretch
    envelope: { minZ: -489, maxZ: -469 }, // building-free (street + sidewalks)
    railY: 7.5, deckUnderside: 5.5,
    columnZ: [-485.2, -472.8],            // the column lines (+-6.2) H1 uses in the Loop
    stations: [
      { id: 'elNarrows', x: -370, minX: -404, maxX: -336, minZ: -491, maxZ: -467 },
      { id: 'elParkRow', x: -520, minX: -554, maxX: -486, minZ: -491, maxZ: -467 },
    ],
  },
};

// The rectangles of each region (also their district split points).
export const RECTS = {
  westRiver: { minX: -300, maxX: -266, minZ: -600, maxZ: 205 },
  quay: { minX: -266, maxX: -236, minZ: -236, maxZ: 205 },
  narrows: { minX: -450, maxX: -300, minZ: -600, maxZ: -226 },
  parkRow: { minX: -580, maxX: -450, minZ: -600, maxZ: -226 },
  chinatown: { minX: -580, maxX: -300, minZ: -226, maxZ: -30 },
  yards: { minX: -580, maxX: -300, minZ: -30, maxZ: 205 },
};

// N-S street lines, each with the z ranges it runs ([north end, south end]).
export const X_STREETS = [
  { x: -310, segs: [[-600, 197]] },      // riverside drive: over both cuts on fixed bridges, to Bristol
  { x: -370, segs: [[-580, 197]] },      // island middle street, over the south cut, Chinatown, Yards
  { x: -421, segs: [[-580, -298]] },     // inside the island, along the channel
  { x: -460, segs: [[-600, 197]] },      // Park Row's east street (to Bristol), Chinatown/Odessa line, Yards
  { x: -520, segs: [[-580, -30]] },      // Park Row's middle street, Odessa, ends at the Yards Gate
  { x: -573, segs: [[-580, 197]] },      // the west edge street
  { x: -261, segs: [[-228, 190]], quay: true }, // the quay apron lane (8 m, along the water)
];

// E-W street lines, each with the x ranges it runs ([west end, east end]).
export const Z_STREETS = [
  // North half. -298, -419, -479 and -539 cross the channel on small bridges; -298, -359, -419
  // and -539 cross the North Branch on bascules, -479 (the El West Line street) on a fixed span.
  { z: -298, segs: [[-573, -266]] },
  { z: -359, segs: [[-421, -266]] },
  { z: -419, segs: [[-573, -266]] },
  { z: -479, segs: [[-573, -266]], el: true },
  { z: -539, segs: [[-573, -266]] },
  { z: -580, segs: [[-573, -460], [-421, -310]] },
  // South half: the core's lines carry on west (bridged ones over the South Branch; the others
  // end at the quay lane on the core side and start again at the riverside drive).
  { z: -210, segs: [[-573, -310], [-261, -236]] },
  { z: -150, segs: [[-573, -236]] },
  { z: -90, segs: [[-573, -310], [-261, -236]] },
  { z: -30, segs: [[-573, -236]] },
  { z: 30, segs: [[-261, -236]] },
  { z: 90, segs: [[-573, -236]] },
  { z: 150, segs: [[-310, -236]] },
  { z: 197, segs: [[-573, -310]] },        // the harbour road along the Yards' seawall
];

// Bridges. Movable double-leaf bascules over the branches (deck y 0, 20 m wide, 34 m span), one
// fixed steel span carrying the El corridor street, and small fixed bridges over the channel and
// the two cuts (the Narrows' "small bridges").
export const WEST_BRIDGES = {
  bascules: [
    // North Branch, landing on the Loop's street lines at its west edge (x -266).
    { id: 'nbr298', axis: 'x', z: -298, x0: -266, x1: -300 },
    { id: 'nbr359', axis: 'x', z: -359, x0: -266, x1: -300 },
    { id: 'nbr419', axis: 'x', z: -419, x0: -266, x1: -300 },
    { id: 'nbr539', axis: 'x', z: -539, x0: -266, x1: -300 },
    // South Branch, carrying the core's lines west over the quay.
    { id: 'sbr150', axis: 'x', z: -150, x0: -266, x1: -300 },
    { id: 'sbr30', axis: 'x', z: -30, x0: -266, x1: -300 },
    { id: 'sbr90', axis: 'x', z: 90, x0: -266, x1: -300 },
    { id: 'sbr150s', axis: 'x', z: 150, x0: -266, x1: -300 },
  ],
  fixed: [
    { id: 'elBridge', axis: 'x', z: -479, x0: -300, x1: -266, width: 20, kind: 'truss' },
    { id: 'chan298', axis: 'x', z: -298, x0: -450, x1: -430, width: 14, kind: 'small' },
    { id: 'chan419', axis: 'x', z: -419, x0: -450, x1: -430, width: 14, kind: 'small' },
    { id: 'chan479', axis: 'x', z: -479, x0: -450, x1: -430, width: 20, kind: 'small' },
    { id: 'chan539', axis: 'x', z: -539, x0: -450, x1: -430, width: 14, kind: 'small' },
    { id: 'cutS310', axis: 'z', x: -310, z0: -246, z1: -232, width: 14, kind: 'small' },
    { id: 'cutS370', axis: 'z', x: -370, z0: -246, z1: -232, width: 14, kind: 'small' },
    { id: 'cutN310', axis: 'z', x: -310, z0: -600, z1: -588, width: 14, kind: 'small' },
  ],
};

// The street lines a neighbour region meets (for the hand-back and the boundary tests).
export const BOUNDARY = {
  // Loop's west edge (x -266): every North Branch bridge lands on one of its 60 m lines
  // (-593, the Loop's north edge street, meets the north cut's mouth: no bridge there).
  loop: [-298, -359, -419, -479, -539].map((z) => ({ x: -266, z })),
  // Core's west edge (x -236): the core's z lines continue west across the quay.
  core: [-210, -150, -90, -30, 30, 90, 150].map((z) => ({ x: -236, z })),
  // Bristol (z -600): two roads north.
  bristol: [{ x: -460, z: -600 }, { x: -310, z: -600 }],
};

// Blocks between streets: [minX, maxX, minZ, maxZ] of the sidewalk slab (street half-width +
// nothing; buildings sit on the slab with a 3 m sidewalk margin inside it).
const HALF = 7;
export function blocksBetween(xs, zs) {
  const out = [];
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
    out.push({ minX: xs[i] + HALF, maxX: xs[i + 1] - HALF, minZ: zs[j] + HALF, maxZ: zs[j + 1] - HALF });
  }
  return out;
}

// Does a building footprint (rect) intrude the El corridor's envelope or a station plot?
export function inElEnvelope(r) {
  const E = WEST.el;
  if (r.maxX <= E.minX || r.minX >= E.maxX) return false;
  if (r.maxZ > E.envelope.minZ && r.minZ < E.envelope.maxZ) return true;
  return E.stations.some((s) => r.maxX > s.minX && r.minX < s.maxX && r.maxZ > s.minZ && r.minZ < s.maxZ);
}

export const insideRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
export const overlaps = (a, b) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;

// Is (x, z) open water on the west side (channel, cuts, branch; the lock chamber counts)?
export function westWaterAt(x, z) {
  const W = WEST;
  if (x > W.branch.minX && x < W.branch.maxX && z < 205) return true;
  for (const r of [W.channel, W.northCut, W.southCut]) if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return true;
  return false;
}

// Pure schedule of the locks (a lift every `cycle` s): chamber level and gate states.
//   0..20   lower gates open (chamber at river level), 20..26 closing, 26..66 filling,
//   66..72  upper gates opening, 72..92 upper open (harbour level), 92..98 closing,
//   98..138 draining, 138..144 lower gates opening, 144..150 lower open.
export function lockState(t, cycle = WEST.lock.cycle) {
  const low = WEST.waterY, high = -0.6;
  const c = ((t % cycle) + cycle) % cycle;
  const s = (a, b) => Math.min(1, Math.max(0, (c - a) / (b - a)));
  const ease = (k) => k * k * (3 - 2 * k);
  let level, lower, upper;
  if (c < 20) { level = low; lower = 1; upper = 0; }
  else if (c < 26) { level = low; lower = 1 - s(20, 26); upper = 0; }
  else if (c < 66) { level = low + (high - low) * ease(s(26, 66)); lower = 0; upper = 0; }
  else if (c < 72) { level = high; lower = 0; upper = s(66, 72); }
  else if (c < 92) { level = high; lower = 0; upper = 1; }
  else if (c < 98) { level = high; lower = 0; upper = 1 - s(92, 98); }
  else if (c < 138) { level = high + (low - high) * ease(s(98, 138)); lower = 0; upper = 0; }
  else if (c < 144) { level = low; lower = s(138, 144); upper = 0; }
  else { level = low; lower = 1; upper = 0; }
  // A gate pair is walkable (its top is a footway) only while fully shut.
  return { level, lower, upper, lowerWalk: lower === 0, upperWalk: upper === 0 };
}

// Hand-placed landmarks (the procedural fill builds around them). Footprints x/z centre, w (x)
// by d (z), h the main roof. Sites in westData.js hang off these numbers.
export const LANDMARKS = {
  // The Narrows
  stack: { x: -397, z: -445, w: 24, d: 24, h: 36 },          // the overbuilt tenement tower
  wolfPoint: { x: -334, z: -270, w: 26, d: 26, h: 58 },      // Black Mask's tower on the fork
  clinic: { x: -330, z: -505, w: 20, d: 24, h: 13 },         // free clinic, door on the riverside
  gym: { x: -404, z: -387, w: 14, d: 20, h: 10 },            // boxing gym, door on the channel street
  market: { minX: -349, maxX: -331, minZ: -339, maxZ: -318 }, // the street-market court
  // Park Row
  orpheum: { x: -478.75, z: -326, w: 17.5, d: 36, h: 17 },   // the shuttered theatre (marquee on Park Row)
  crimeAlley: { minX: -492.5, maxX: -487.5, minZ: -350, maxZ: -305 }, // dead-ends at a fence
  hotel: { x: -536, z: -321, w: 12, d: 26, h: 22 },
  mission: { x: -478.75, z: -380, w: 17.5, d: 24, h: 9 },
  orphanage: { x: -490, z: -510.5, w: 30, d: 30, h: 14 },
  viaduct: { x: -546.5, z0: -396, z1: 92, deck: 6.2, half: 3.5, corridor: { minX: -551, maxX: -542 } }, // freight viaduct, Yards to Park Row
  // Chinatown + Little Odessa
  gate: { x: -332, z: -150 },
  temple: { x: -415, z: -188, w: 30, d: 20, h: 11 },
  nightMarket: { minX: -453, maxX: -377, z: -120 },
  church: { x: -490, z: -182, w: 24, d: 30, h: 13 },
  bathhouse: { x: -490, z: -120, w: 34, d: 30, h: 10 },
  // The Yards
  yardsGate: { x: -520, z: -20 },
  silos: { minX: -357, maxX: -323, minZ: -16, maxZ: 76, r: 4.6, h: 34 },
  furnace: { x: -418, z: 30, h: 38 },
  roundhouse: { x: -536, z: 158 },
  coldStorage: { x: -340, z: 122, w: 40, d: 40, h: 20 },
  crusher: { x: -405, z: 176 },
  substation: { x: -340, z: 172 },
  // The quay
  cranes: [-118, 2, 122].map((z) => ({ x: -262.5, z })),
};
