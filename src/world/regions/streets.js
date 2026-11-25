// Each region's streets, added to one shared street graph (src/world/streetGraph.js). Pure, so
// traffic, the vehicles module and tests can build the graph without a scene. The geometry the
// region builders lay down follows these same numbers (riverfront.js imports them).
import { createStreetGraph } from '../streetGraph.js';
import { GRID, WORLD } from '../mapData.js';
import { LEVELS } from './data.js';
import { addLoopStreets, addMileStreets } from './loopStreets.js';
import { addEastStreets } from './eastStreets.js'; // H2: lakefront, museum campus, pier, Arkham
import { addWestStreets } from './westStreets.js'; // workstream H3
import { bristolRoads, FOOTPATHS } from './bristolLayout.js';
import { BLACKGATE } from './blackgateLayout.js';

// The core's street centre lines (60 m pitch, 14 m wide streets between 46 m blocks).
export const CORE_LINES = [GRID.centers[0] - 30, ...GRID.centers.map((c) => c + 30)];
// Merged compounds have no streets inside them (mapData COMPOUNDS, padded by the 1 m the city
// builder uses).
const COMPOUNDS = [{ minX: 37, maxX: 203, minZ: -203, maxZ: -97 }, { minX: -143, maxX: -37, minZ: -203, maxZ: -97 }];
const inCompound = (x, z) => COMPOUNDS.some((c) => x > c.minX - 1 && x < c.maxX + 1 && z > c.minZ - 1 && z < c.maxZ + 1);

// Riverfront layout (river, Lower Gotham, the first Loop row). See riverfront.js for the build.
export const RIVERFRONT = {
  bridges: [
    // Two double-leaf bascules carrying core x lines north across the main stem.
    { id: 'bridgeW', x: -150, z0: -241, z1: -276 },
    { id: 'bridgeE', x: -30, z0: -241, z1: -276 },
  ],
  upperZ: -291,          // Lower Gotham drive centre line (upper and lower decks)
  northHalfZ: -298,      // the 2-lane upper road beyond the covered stretch
  covered: [-200, 290],  // x extent of the double deck (the lower deck runs under it)
  rampZ: -284,           // both ramps run in the south half of the deck
  rampW: { top: -252 },   // the ramp runs from its top (y 0) down to the covered edge (y -5.5)
  rampE: { top: 350 },
  plazaW: -258, plazaE: 360,
  riverWalkZ: -271,
  loopSouthZ: -306, loopStreetZ: -359,
  loopX: [-266, 236],
};

export function addCoreStreets(g) {
  const opts = { width: 14, lanes: 2, sidewalk: 3, region: 'core' };
  const zLines = CORE_LINES.filter((z) => z < WORLD.waterZ);
  // North-south streets run the city's whole depth, from the north edge to the docks road.
  const zStops = [WORLD.minZ, ...zLines, WORLD.waterZ - 8];
  for (const x of CORE_LINES) {
    for (let i = 0; i + 1 < zStops.length; i++) {
      const z0 = zStops[i], z1 = zStops[i + 1];
      if (inCompound(x, (z0 + z1) / 2)) continue;
      g.addStreet([{ x, z: z0 }, { x, z: z1 }], opts);
    }
  }
  const xStops = [WORLD.minX, ...CORE_LINES, WORLD.maxX];
  for (const z of zLines) {
    for (let i = 0; i + 1 < xStops.length; i++) {
      const x0 = xStops[i], x1 = xStops[i + 1];
      if (inCompound((x0 + x1) / 2, z)) continue;
      g.addStreet([{ x: x0, z }, { x: x1, z }], opts);
    }
  }
}

export function addRiverfrontStreets(g) {
  const R = RIVERFRONT;
  const lg = { width: 20, lanes: 4, sidewalk: 5, region: 'lowerGotham' };
  const two = { width: 10, lanes: 2, sidewalk: 3, region: 'lowerGotham', kind: 'drive' };
  // Bridges: the core street's north end, over the river, onto the upper deck.
  for (const b of R.bridges) {
    g.addStreet([{ x: b.x, z: WORLD.minZ }, { x: b.x, z: b.z0 }], { width: 14, lanes: 2, sidewalk: 3, region: 'river' });
    g.addStreet([{ x: b.x, z: b.z0 }, { x: b.x, z: b.z1 }], { width: 14, lanes: 2, sidewalk: 3, region: 'river', kind: 'bridge', deck: 'bridge', bridge: b.id });
    g.addStreet([{ x: b.x, z: b.z1 }, { x: b.x, z: R.upperZ }], { width: 14, lanes: 2, sidewalk: 3, region: 'lowerGotham' });
  }
  // Upper deck: the covered 4-lane drive, then the 2-lane north half out to the end plazas.
  const xs = [R.covered[0], ...CORE_LINES.filter((x) => x > R.covered[0] && x < R.covered[1]), R.covered[1]];
  g.addStreet(xs.map((x) => ({ x, z: R.upperZ })), lg);
  g.addStreet([{ x: R.plazaW, z: R.northHalfZ }, { x: -210, z: R.northHalfZ }, { x: R.covered[0], z: R.upperZ }], two);
  g.addStreet([{ x: R.covered[1], z: R.upperZ }, { x: R.plazaE, z: R.northHalfZ }], two);
  // Lower deck: same line 5.5 m down, between the two ramps.
  const low = (x) => ({ x, y: LEVELS.lowerDeck, z: R.upperZ, deck: 'lower' });
  g.addStreet(xs.map(low), { ...lg, deck: 'lower', sidewalk: 0 });
  // Ramps (south half): plaza (y 0) -> ramp top -> ramp bottom (y -5.5) -> lower deck end.
  const ramp = { width: 10, lanes: 2, sidewalk: 0, region: 'lowerGotham', kind: 'ramp', deck: 'ramp' };
  // [polish] Each ramp turns in through the open end of the deck (the 8 m past the railing between
  // the ramp and the upper road): the straight plaza -> ramp top leg cut through that railing.
  g.addStreet([{ x: R.plazaE, z: R.northHalfZ }, { x: R.plazaE + 2, z: R.rampZ, deck: 'ramp' }, { x: R.rampE.top, z: R.rampZ, deck: 'ramp' }, { ...low(R.covered[1]), z: R.rampZ }, low(R.covered[1])], ramp);
  g.addStreet([{ x: R.plazaW, z: R.northHalfZ }, { x: R.plazaW - 4, z: R.rampZ, deck: 'ramp' }, { x: R.rampW.top, z: R.rampZ, deck: 'ramp' }, { ...low(R.covered[0]), z: R.rampZ }, low(R.covered[0])], ramp);
  // River walk (on foot only: no lanes), with stairs down from the lower deck at each end.
  const walk = { width: 4, lanes: 0, sidewalk: 0, region: 'river', kind: 'walk', deck: 'walk' };
  g.addStreet([-262, -150, -30, 90, 210, 362].map((x) => ({ x, y: LEVELS.riverWalk, z: R.riverWalkZ, deck: 'walk' })), walk);
  // The Loop's first row: x streets from the upper deck to the row's north street (the El street).
  const loop = { width: 14, lanes: 2, sidewalk: 3, region: 'loop' };
  for (const x of CORE_LINES) {
    if (x < R.loopX[0] || x > R.loopX[1]) continue;
    const southEnd = x < R.covered[0] ? { x, z: R.northHalfZ } : { x, z: R.upperZ };
    g.addStreet([southEnd, { x, z: R.loopSouthZ }, { x, z: R.loopStreetZ }], loop);
  }
  const north = [R.loopX[0] + 4, ...CORE_LINES.filter((x) => x > R.loopX[0] && x < R.loopX[1]), R.loopX[1] - 4];
  g.addStreet(north.map((x) => ({ x, z: R.loopStreetZ })), loop);
}

// The whole graph for every region that exists today.
export function buildStreetGraph() {
  const g = createStreetGraph();
  addCoreStreets(g);
  addRiverfrontStreets(g);
  addLoopStreets(g);
  addMileStreets(g);
  addEastStreets(g);
  addWestStreets(g);
  addBristolStreets(g);
  addBlackgateStreets(g);
  return g;
}

// The core's traffic lines, read from the graph (src/world/cityLife.js, src/vehicles/vehicles.js):
// every distinct x and z of the core's straight streets, sorted.
export function coreTrafficLines(g = buildStreetGraph()) {
  const { x, z } = g.axisLines('core');
  return [...new Set([...x, ...z])].sort((a, b) => a - b);
}

// Closed loops the riverfront's ambient traffic drives (as node coordinate lists: each leg is
// routed through the graph, so the cars follow real streets, ramps and bridges).
export const RIVERFRONT_TRAFFIC = [
  // Lower Gotham: along the upper deck, down the east ramp, back west on the lower deck, up the
  // west ramp.
  { id: 'lowerGothamCircuit', cars: 7, speed: [10, 14], legs: [
    { x: RIVERFRONT.plazaW, y: 0, z: RIVERFRONT.northHalfZ }, { x: RIVERFRONT.plazaE, y: 0, z: RIVERFRONT.northHalfZ },
    { x: RIVERFRONT.covered[1], y: LEVELS.lowerDeck, z: RIVERFRONT.upperZ }, { x: RIVERFRONT.covered[0], y: LEVELS.lowerDeck, z: RIVERFRONT.upperZ },
  ] },
  // Across both bridges: north over the east one, west on the drive, south over the west one,
  // east along the core's north street.
  { id: 'bridgesCircuit', cars: 5, speed: [9, 12], legs: [
    { x: -30, y: 0, z: -210 }, { x: -30, y: 0, z: RIVERFRONT.upperZ }, { x: -150, y: 0, z: RIVERFRONT.upperZ }, { x: -150, y: 0, z: -210 },
  ] },
  // The Loop row: east under the El, down to the drive, west along it, back up into the Loop.
  { id: 'loopCircuit', cars: 5, speed: [9, 12], legs: [
    { x: -210, y: 0, z: RIVERFRONT.loopStreetZ }, { x: 210, y: 0, z: RIVERFRONT.loopStreetZ }, { x: 210, y: 0, z: RIVERFRONT.upperZ }, { x: -150, y: 0, z: RIVERFRONT.upperZ }, { x: -150, y: 0, z: RIVERFRONT.loopStreetZ },
  ] },
];

// Bristol (workstream H): winding lanes over the hills, every ~15 m a node at the road's height
// (bristolLayout.js grades them), plus footpaths (no lanes) to the cave mouth and the Manor's back
// gate. Boundary ends at z -600 and x -40 are where the Narrows, Park Row, the Loop and Gotham Mile
// stitch on (bristolLayout.BRISTOL_ENTRIES).
export function addBristolStreets(g) {
  for (const r of bristolRoads()) {
    g.addStreet(r.nodes, { width: r.width, lanes: 2, sidewalk: r.kind === 'drive' ? 0 : 1.2, region: 'bristol', kind: r.kind === 'drive' ? 'drive' : 'street' });
  }
  const walk = { width: 3, lanes: 0, sidewalk: 0, region: 'bristol', kind: 'walk', deck: 'walk' };
  const on = (x, z, y) => ({ x, z, y, deck: 'walk' });
  // Each footpath starts at a road node (its own node on the 'walk' deck, joined to the road's).
  const join = (n, path) => {
    const ids = g.addStreet([{ ...n, deck: 'walk' }, ...path], walk);
    g.addEdge(g.addNode(n.x, n.z, { y: n.y, region: 'bristol' }), ids[0], walk);
  };
  for (const f of FOOTPATHS) join(footpathStart(f), f.pts.map(([x, z, y]) => on(x, z, y)));
}

// The road node a footpath leaves from.
export function footpathStart(f) {
  const road = bristolRoads().find((r) => r.id === f.road);
  if (f.end) return road.nodes[road.nodes.length - 1];
  return road.nodes.reduce((a, n) => (Math.hypot(n.x - f.near[0], n.z - f.near[1]) < Math.hypot(a.x - f.near[0], a.z - f.near[1]) ? n : a));
}

// Blackgate: the causeway from the docks road (x 90) to the gatehouse plaza.
export function addBlackgateStreets(g) {
  g.addStreet(BLACKGATE.causeway.map(([x, y, z]) => ({ x, y, z })), { width: 10, lanes: 2, sidewalk: 1.5, region: 'blackgate' });
}
