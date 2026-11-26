// The east side's streets for the shared street graph (workstream H2): Robinson Avenue (north and
// south of the river), Lakeshore Drive with its viaduct, the park's cross drives, the stitches
// onto the core's z streets and the Loop's existing El street, the link to Lower Gotham's east
// plaza, the Museum Campus drive, the Arkham causeway, and walking lines for the pier, the
// promenade, the lock footbridge and the park paths. Pure (no three.js).
import { EAST, lsdLine } from './eastLayout.js';
import { RIVERFRONT } from './streets.js';

const F = EAST.front, L = EAST.lsd;
const ave = { width: F.width, lanes: 2, sidewalk: 3, region: 'lakefront' };
const drive = { width: L.width, lanes: 4, sidewalk: 0, region: 'lakefront', kind: 'drive' };
const cross = { width: 12, lanes: 2, sidewalk: 2, region: 'lakefront' };
const walk = (region) => ({ width: 4, lanes: 0, sidewalk: 0, region, kind: 'walk', deck: 'walk' });

export function addEastStreets(g) {
  // Robinson Avenue north (beside the Loop and Gotham Mile), with a node on every boundary line the
  // Loop / Mile builders may stitch to from x 236.
  const north = [...new Set([F.north[0], ...EAST.loopStitch, ...EAST.crossNorth, F.north[1]])].filter((z) => z >= F.north[0] && z <= F.north[1]).sort((a, b) => a - b);
  g.addStreet(north.map((z) => ({ x: F.x, z })), ave);
  // ... and south (beside Old Gotham, through the Museum Campus).
  const south = [...new Set([F.south[0], ...EAST.coreStitch, ...EAST.crossSouth, EAST.causeway.z, F.south[1]])].filter((z) => z >= F.south[0] && z <= F.south[1]).sort((a, b) => a - b);
  g.addStreet(south.map((z) => ({ x: F.x, z })), { ...ave, region: 'lakeshore' });
  // Stitches: the core's z streets end at (236, z); the Loop row's El street ends at (232, -359).
  for (const z of EAST.coreStitch) g.addStreet([{ x: 236, z }, { x: F.x, z }], { ...ave, region: 'lakeshore' });
  g.addStreet([{ x: RIVERFRONT.loopX[1] - 4, z: RIVERFRONT.loopStreetZ }, { x: F.x, z: RIVERFRONT.loopStreetZ }], ave);
  // The avenue's south end drops onto Lower Gotham's upper deck (x 245 lies on its covered drive,
  // between the x 210 and x 290 nodes).
  g.addStreet([{ x: F.x, z: F.north[1] }, { x: F.x, z: RIVERFRONT.upperZ }], ave);
  g.addStreet([{ x: 210, z: RIVERFRONT.upperZ }, { x: F.x, z: RIVERFRONT.upperZ }, { x: RIVERFRONT.covered[1], z: RIVERFRONT.upperZ }], { width: 20, lanes: 4, sidewalk: 5, region: 'lowerGotham' });

  // Lakeshore Drive, north to south (viaduct included), and its junctions.
  const lsd = lsdLine();
  g.addStreet(lsd, drive);
  for (const z of EAST.crossNorth) g.addStreet([{ x: F.x, z }, { x: L.x, z }], cross);
  for (const z of EAST.crossSouth) g.addStreet([{ x: F.x, z }, { x: L.x, z }], { ...cross, region: 'lakeshore' });
  g.addStreet([{ x: F.x, z: EAST.causeway.z }, { x: L.x, z: EAST.causeway.z }], { ...cross, region: 'lakeshore' });
  // Link from the viaduct to Lower Gotham's east plaza (the end of its north half).
  g.addStreet([{ x: L.viaductX, z: EAST.lgLink.z }, { x: RIVERFRONT.plazaE, z: RIVERFRONT.northHalfZ }], { width: 10, lanes: 2, sidewalk: 3, region: 'pier' });
  // Museum Campus drive: the drive's south end back west to the avenue.
  g.addStreet([{ x: L.x, z: EAST.museumDrive.z }, { x: 294, z: EAST.museumDrive.z }, { x: F.x, z: EAST.museumDrive.z }], { width: 14, lanes: 2, sidewalk: 3, region: 'museum' });
  // Arkham causeway: from the drive across the lake, up onto the island's plateau, to the gate.
  const C = EAST.causeway, A = EAST.arkham;
  g.addStreet([{ x: L.x, z: C.z }, { x: 372, z: C.z, y: 0.5 }, { x: C.x1, z: C.z, y: 0.5 }, { x: 590, z: C.z, y: A.plateau }, { x: 600, z: C.z, y: A.plateau }], { width: C.width, lanes: 2, sidewalk: 1.5, region: 'arkham', kind: 'causeway' });

  // ---- on foot ----
  // The seawall promenade (north and south), and the lock footbridge to the quay.
  g.addStreet([-780, -620, -450, -392].map((z) => ({ x: 361.5, y: 0.15, z, deck: 'walk' })), walk('lakefront'));
  g.addStreet([-150, -80, 0, 80].map((z) => ({ x: 361.5, y: 0.15, z, deck: 'walk' })), walk('lakeshore'));
  g.addStreet([{ x: 361.5, y: 0.15, z: -450, deck: 'walk' }, { x: L.x, z: -450 }], walk('lakefront'));
  g.addStreet([{ x: L.viaductX - L.width / 2, z: -254 }, { x: 366, y: 0.15, z: -254, deck: 'walk' }, { x: 366, y: 0.15, z: -238.5, deck: 'walk' }, { x: 330, y: 0.15, z: -238.5, deck: 'walk' }], walk('river'));
  // The pier: up the ramp, along the deck to the ballroom, and the undercroft catwalk.
  const P = EAST.pier;
  g.addStreet([{ x: 361.5, y: 0.15, z: P.z, deck: 'walk' }, { x: 386, y: P.deck, z: P.z, deck: 'walk' }, { x: EAST.wheel.x, y: P.deck, z: P.z, deck: 'walk' }, { x: 500, y: P.deck, z: P.z, deck: 'walk' }, { x: 594, y: P.deck, z: P.z, deck: 'walk' }], walk('pier'));
  // Park walks (a few spines, for civilians: avenue -> fountain -> shell -> conservatory).
  g.addStreet([{ x: F.x + 9, y: 0.15, z: -388, deck: 'walk' }, { x: 294, y: 0.15, z: -388, deck: 'walk' }, { x: 294, y: 0.15, z: -438, deck: 'walk' }, { x: 294, y: 0.15, z: -502, deck: 'walk' }, { x: 300, y: 0.15, z: -646, deck: 'walk' }, { x: 294, y: 0.15, z: -727, deck: 'walk' }], walk('lakefront'));
}

// Ambient traffic loops (cityLife regionLoops): legs routed through the graph.
export const EAST_TRAFFIC = [
  // Round the park: up the drive, west on the north cross drive, down the avenue, back east.
  { id: 'parkCircuit', cars: 6, speed: [11, 15], legs: [
    { x: L.x, y: 0, z: -419 }, { x: L.x, y: 0, z: -719 }, { x: F.x, y: 0, z: -719 }, { x: F.x, y: 0, z: -419 },
  ] },
  // The whole drive: north end to the museum and back, over the viaduct both ways.
  { id: 'lakeshoreRun', cars: 8, speed: [14, 19], legs: [
    { x: L.x, y: 0, z: -719 }, { x: L.x, y: 0, z: 150 }, { x: F.x, y: 0, z: EAST.museumDrive.z }, { x: F.x, y: 0, z: 30 }, { x: L.x, y: 0, z: 30 },
  ] },
];
