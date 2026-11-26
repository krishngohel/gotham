// The regions of the city as plain data: bounds, districts (names, palettes, map tints), water
// bodies, named sites and spawn tables. Pure (no three.js), so saves, crimes, the comic palette
// and the progress page can read district ids and names from here without pulling in the city
// builders. src/world/regions/index.js adds each region's build() on top (REGIONS).
//
// Axes as in mapData.js: x east, z south (north is -z), y up, metres. Regions never overlap;
// `rects` is the land a region owns (its `bounds` is their bounding box).
//
// Long Night 2 contract 4.2. The core's five district ids and their order are part of the save
// format (gotham-progress-v1 `districts`), so they stay first and unchanged.
import { districtAt as coreDistrictAt } from '../mapData.js';
import { LOOP_SITES, LOOP_CRIMES, LOOP_SPAWNS, MILE_REGION } from './loopData.js';
import { EAST_REGIONS } from './eastData.js'; // east side: lakefront, museum campus, lake + pier, Arkham (H2)
import { WEST_REGION_DATA } from './westData.js'; // workstream H3: the west side
import { BRISTOL, BRISTOL_WATER, bristolHeight } from './bristolLayout.js';
import { BLACKGATE } from './blackgateLayout.js';

// Scale rule (docs/design/long-night-2.md section 8): plan distances x0.3 of Chicago, heights
// x0.45, anything a body touches at true size. Builders read these instead of inventing numbers.
export const SCALE = { plan: 0.3, height: 0.45, alley: 5, railing: 1.1, door: 2.4, stair: 0.18, deckClearance: 4.2, elBent: 12 };

// Street levels shared by the riverfront regions (research 1.3 / 1.4).
export const LEVELS = { street: 0, lowerDeck: -5.5, riverWalk: -4.5, river: -6, harbour: -0.6 };

const CORE_DISTRICTS = [
  { id: 'gcpd', label: 'GCPD', phrase: 'outside GCPD', tint: '#9fb2d6', palette: { key: 'gcpd', center: { x: 0, z: 0 }, swatches: [0x1c2433, 0x3a4a66, 0x5b6f8e, 0x2e3a4f, 0xc9a54a, 0xd9dfe9] } },
  { id: 'docks', label: 'The Docks', phrase: 'at the Docks', tint: '#8fb3a8', palette: { key: 'docks', center: { x: -20, z: 200 }, swatches: [0x1d2426, 0x8a4a2e, 0x2f6b6e, 0x3b3531, 0xd98c3a, 0xe6d8c0] } },
  { id: 'neon', label: 'Neon Row', phrase: 'on Neon Row', tint: '#d99ac8', palette: { key: 'neon', center: { x: 150, z: 0 }, swatches: [0x1b1426, 0x8a2f6e, 0x3d2a5c, 0x2a2433, 0x9be23c, 0xf2c6e6] } },
  { id: 'ace', label: 'Ace Chemicals', phrase: 'at Ace Chemicals', tint: '#a7c47a', palette: { key: 'ace', center: { x: 130, z: -160 }, swatches: [0x161c16, 0x4f6b2e, 0x5a3a78, 0x2d3326, 0xb9e04a, 0xdfe8c8] } },
  // The clock district's palette has always been keyed 'cathedral' (comicPalette.js).
  { id: 'clock', label: 'The Clock Plaza', phrase: 'in the Clock Plaza', tint: '#c9b48a', palette: { key: 'cathedral', center: { x: -90, z: -150 }, swatches: [0x1e1c1c, 0x6e675e, 0x4f4a44, 0x34302c, 0xe8a23f, 0xefe1c4] } },
];

export const REGION_DATA = [
  {
    id: 'core',
    name: 'Old Gotham',
    seed: 11,
    bounds: { minX: -236, maxX: 236, minZ: -236, maxZ: 205 },
    // The progress page map: the core plus the harbour (the lighthouse trophy is at z 270).
    mapBounds: { minX: -236, maxX: 236, minZ: -236, maxZ: 280 },
    progressMap: true,
    districts: CORE_DISTRICTS,
    // 'city' between the named districts; see mapData.districtAt (frozen with the core).
    districtAt: coreDistrictAt,
    // The harbour is open water south of the seawall, as far as the eye goes.
    water: [{ id: 'harbour', kind: 'harbour', minX: -1400, maxX: 1400, minZ: 205, maxZ: 1400, level: LEVELS.harbour }],
    floor: (x, z) => (z > 205 ? -Infinity : 0),
    sites: {},
    spawnTables: { crimes: [] }, // the core's crime spots live in src/game/crimes.js (CRIME_SPOTS)
  },
  {
    id: 'river',
    name: 'The River',
    seed: 101,
    bounds: { minX: -266, maxX: 366, minZ: -276, maxZ: -236 },
    districts: [
      { id: 'river', label: 'The River', phrase: 'down on the river walk', tint: '#9db6bf', palette: { key: 'river', center: { x: 40, z: -262 }, swatches: [0x10161c, 0x2f4a4e, 0x1f3640, 0x2c3236, 0xd98c3a, 0xd8d4c4] } },
    ],
    districtAt: () => 'river',
    // Main stem: 25 m of water between the core's quay wall and the river walk.
    water: [{ id: 'river', kind: 'river', minX: -266, maxX: 366, minZ: -266, maxZ: -241, level: LEVELS.river }],
    // Nothing is solid ground here but what the builder put down (quay, walk, bridges).
    floor: () => -Infinity,
    sites: {
      riverWalk: { x: -90, y: LEVELS.riverWalk, z: -271 },
      riverWalkEast: { x: 120, y: LEVELS.riverWalk, z: -271 },
      bridgeWest: { x: -150, y: 0, z: -258 },
      bridgeEast: { x: -30, y: 0, z: -258 },
    },
    spawnTables: {
      crimes: [
        { id: 'riverWalkWest', district: 'river', x: -120, y: LEVELS.riverWalk, z: -271, yaw: Math.PI / 2 },
        { id: 'riverWalkEast', district: 'river', x: 60, y: LEVELS.riverWalk, z: -271, yaw: -Math.PI / 2 },
      ],
      civilians: { density: 0.4, kinds: ['walker', 'jogger', 'tourist'] },
      traffic: { density: 0 },
    },
  },
  {
    id: 'lowerGotham',
    name: 'Lower Gotham',
    seed: 102,
    bounds: { minX: -266, maxX: 366, minZ: -306, maxZ: -276 },
    districts: [
      { id: 'lowerGotham', label: 'Lower Gotham', phrase: 'down in Lower Gotham', tint: '#b4c48a', palette: { key: 'lowerGotham', center: { x: 40, z: -291 }, swatches: [0x121a12, 0x6f8a3a, 0x3d4a3c, 0x34352f, 0xe0c23a, 0xd9e2c0] } },
    ],
    districtAt: () => 'lowerGotham',
    water: [],
    // Two decks: every walkable surface is a box (upper deck y 0, lower deck y -5.5).
    floor: () => -Infinity,
    sites: {
      lowerDeck: { x: 0, y: LEVELS.lowerDeck, z: -291 },
      upperDeck: { x: 0, y: 0, z: -291 },
      loadingDock: { x: 60, y: LEVELS.lowerDeck, z: -300 },
    },
    spawnTables: {
      crimes: [
        { id: 'lowerDockWest', district: 'lowerGotham', x: -60, y: LEVELS.lowerDeck, z: -296, yaw: 0 },
        { id: 'lowerDockEast', district: 'lowerGotham', x: 150, y: LEVELS.lowerDeck, z: -296, yaw: 0 },
      ],
      civilians: { density: 0.2, kinds: ['worker'] },
      traffic: { density: 1 },
    },
  },
  {
    id: 'loop',
    name: 'The Loop',
    seed: 103,
    // The first row (wave 1) plus rows 2-5 to the north edge (workstream H: regions/loop.js).
    bounds: { minX: -266, maxX: 236, minZ: -600, maxZ: -306 },
    districts: [
      { id: 'loop', label: 'The Loop', phrase: 'in the Loop', tint: '#c8d2d8', palette: { key: 'loop', center: { x: 0, z: -340 }, swatches: [0x14181e, 0x2f5a46, 0x3a4152, 0x2b2f38, 0xd8b24a, 0xe8ecef] } },
    ],
    districtAt: () => 'loop',
    water: [],
    floor: () => 0,
    sites: {
      loopStreet: { x: -30, y: 0, z: -330 },
      elDeck: { x: 0, y: 7.5, z: -359 },
      ...LOOP_SITES,
    },
    spawnTables: {
      crimes: [
        { id: 'loopCanyon', district: 'loop', x: -150, y: 0, z: -330, yaw: 0 },
        { id: 'loopUnderEl', district: 'loop', x: 60, y: 0, z: -359, yaw: Math.PI / 2 },
        ...LOOP_CRIMES,
      ],
      ...LOOP_SPAWNS,
    },
  },
  MILE_REGION,
  ...EAST_REGIONS,
  ...WEST_REGION_DATA, // H3: river branches, quay, Narrows, Park Row, Chinatown + Little Odessa, Yards
  // ---- Workstream H (city north): Bristol and Wayne Manor; Blackgate on its harbour islet ----
  {
    id: 'bristol',
    name: 'Bristol',
    seed: 112,
    bounds: { minX: BRISTOL.minX, maxX: BRISTOL.maxX, minZ: BRISTOL.minZ, maxZ: BRISTOL.maxZ },
    districts: [
      { id: 'bristol', label: 'Bristol', phrase: 'up in Bristol', tint: '#a8966a', palette: { key: 'bristol', center: { x: -200, z: -680 }, swatches: [0x14120e, 0x5e4a2e, 0x3d4a32, 0x2b2924, 0xd9a441, 0xe8dec6] } },
      { id: 'wayneManor', label: 'Wayne Manor', phrase: 'at Wayne Manor', tint: '#b9a27a', palette: { key: 'wayneManor', center: { x: -400, z: -740 }, swatches: [0x16110f, 0x6b4a34, 0x34402f, 0x2e2722, 0xe0b25a, 0xefe3c8] } },
    ],
    // The Manor's grounds (the plateau west of the gates) are their own district.
    districtAt: (x, z) => (x > -480 && x < -270 && z < -700 ? 'wayneManor' : 'bristol'),
    water: BRISTOL_WATER,
    // Hills: the floor is the terrain (bilinear on the drawn mesh's grid; see bristolLayout.js).
    floor: bristolHeight,
    sites: {
      // Doors the interior workstream attaches the Manor and the Batcave to (y = the floor there;
      // yaw: the way the door faces, atan2(nx, nz)).
      wayneManorFront: { x: -382.6, y: 18.6, z: -745, yaw: Math.PI / 2, kind: 'door', interior: 'wayneManor', room: 'hall', label: 'Wayne Manor, front door' },
      wayneManorTerrace: { x: -399, y: 18.6, z: -724.6, yaw: 0, kind: 'door', interior: 'wayneManor', room: 'drawingRoom', label: 'Wayne Manor, terrace doors' },
      wayneManorGarage: { x: -358, y: 18, z: -767.6, yaw: 0, kind: 'door', interior: 'wayneManor', room: 'garage', vehicle: true, label: 'Wayne Manor, garage' },
      wayneManorStudyWindow: { x: -388.6, y: 23, z: -757, yaw: Math.PI / 2, kind: 'window', interior: 'wayneManor', room: 'study', label: 'Wayne Manor, study window' },
      wayneManorClockPassage: { x: -399, y: 18.6, z: -752, yaw: Math.PI / 2, kind: 'interior', interior: 'wayneManor', room: 'study', leadsTo: 'batcave', label: 'The grandfather clock (passage down to the cave)' },
      batcaveMouth: { x: -395, y: 0.3, z: -690, yaw: 0, kind: 'cave', interior: 'batcave', vehicle: true, label: 'The cave mouth behind the waterfall' },
      wayneManorGates: { x: -280, y: bristolHeight(-280, -752), z: -752, yaw: Math.PI / 2, kind: 'gate', label: 'Wayne Manor gates' },
      wayneFamilyPlot: { x: BRISTOL.familyPlot.x, y: 18, z: BRISTOL.familyPlot.z, kind: 'story', label: 'The Wayne family plot' },
      // Not in Bristol: the downtown Batcave entrance, a disused service door on the north wall of
      // Lower Gotham's lower deck (between two loading docks). A site only; the cave behind it is
      // the interior workstream's.
      batcaveDowntown: { x: -137, y: -5.5, z: -305.4, yaw: 0, kind: 'door', interior: 'batcave', region: 'lowerGotham', label: 'A disused service door, Lower Gotham' },
      bristolOverlook: { x: BRISTOL.overlook.x, y: bristolHeight(BRISTOL.overlook.x, BRISTOL.overlook.z - 1) + 0.3, z: BRISTOL.overlook.z - 1, kind: 'vista', fastTravel: true, label: 'Bristol overlook' },
      bristolChurch: { x: BRISTOL.church.x, y: bristolHeight(BRISTOL.church.x, BRISTOL.church.z + 11), z: BRISTOL.church.z + 11, yaw: 0, kind: 'stealth', label: 'St. Swithin-in-the-Hills (perches in the tower)' },
      bristolPub: { x: BRISTOL.pub.x, y: bristolHeight(BRISTOL.pub.x, BRISTOL.pub.z + 7), z: BRISTOL.pub.z + 7, yaw: 0, kind: 'door', label: "The Gargoyle's Rest (side mission)" },
      bristolGarage: { x: BRISTOL.garage.x, y: bristolHeight(BRISTOL.garage.x, BRISTOL.garage.z - 6), z: BRISTOL.garage.z - 6, yaw: Math.PI, kind: 'door', label: 'Bristol garage' },
      bristolBoathouse: { x: BRISTOL.boathouse.x, y: 0.8, z: BRISTOL.boathouse.z, kind: 'collectible', label: 'The Wayne boathouse (a hide under the boards)' },
      bristolCemeteryGate: { x: -505, y: bristolHeight(-505, -731), z: -731, kind: 'gate', label: 'Bristol cemetery gate' },
    },
    spawnTables: {
      crimes: [
        { id: 'bristolVillageMugging', district: 'bristol', x: -112, y: bristolHeight(-112, -672), z: -672, yaw: Math.PI / 2 },
        { id: 'bristolLaneAmbush', district: 'bristol', x: -240, y: bristolHeight(-240, -620), z: -620, yaw: -Math.PI / 2 },
        { id: 'bristolCemetery', district: 'bristol', x: -530, y: 18, z: -742, yaw: 0 },
        { id: 'bristolOverlookCar', district: 'bristol', x: -219, y: bristolHeight(-219, -754), z: -754, yaw: 0 },
      ],
      civilians: { density: 0.15, kinds: ['walker', 'jogger', 'dogWalker'] },
      traffic: { density: 0.55 },
    },
  },
  {
    id: 'blackgate',
    name: 'Blackgate',
    seed: 113,
    bounds: { ...BLACKGATE.bounds },
    districts: [
      { id: 'blackgate', label: 'Blackgate', phrase: 'on Blackgate Isle', tint: '#9a9c9e', palette: { key: 'blackgate', center: { x: 140, z: 380 }, swatches: [0x121417, 0x5c6064, 0x3a3f46, 0x26292d, 0xe8d27a, 0xdfe1e3] } },
    ],
    // The strip of harbour between the old map edge (z 320) and the islet's shore answers as the
    // harbour always did; the islet is Blackgate.
    districtAt: (x, z) => (z < 332 ? coreDistrictAt(x, z) : 'blackgate'),
    water: [],
    floor: () => -Infinity,
    sites: {
      blackgateGate: { x: BLACKGATE.gate.x, y: BLACKGATE.ground, z: BLACKGATE.gate.z - 2.4, yaw: Math.PI, kind: 'door', interior: 'blackgate', label: 'Blackgate gatehouse' },
      blackgateCellBlockA: { x: 142, y: BLACKGATE.ground, z: 374.2, yaw: 0, kind: 'door', interior: 'blackgate', room: 'cellBlockA', label: 'Cell Block A' },
      blackgateCellBlockB: { x: 142, y: BLACKGATE.ground, z: 387.8, yaw: Math.PI, kind: 'door', interior: 'blackgate', room: 'cellBlockB', label: 'Cell Block B' },
      blackgateYard: { x: BLACKGATE.yard.x, y: BLACKGATE.ground, z: BLACKGATE.yard.z + 4, kind: 'arena', label: 'Blackgate exercise yard' },
      blackgateDock: { x: 196, y: BLACKGATE.dock.y, z: BLACKGATE.dock.z, kind: 'landing', fastTravel: true, label: 'Blackgate ferry landing' },
      blackgateTower: { x: 178, y: BLACKGATE.ground + 14.3, z: 404, kind: 'vista', perch: true, label: 'South-east searchlight tower' },
      blackgateCollectible: { x: 109, y: BLACKGATE.ground + 10, z: 372, kind: 'collectible', label: 'Behind the water tank on the admin roof' },
    },
    spawnTables: {
      crimes: [
        { id: 'blackgateYardRiot', district: 'blackgate', x: 160, y: BLACKGATE.ground, z: 381, yaw: 0 },
        { id: 'blackgateCauseway', district: 'blackgate', x: 100, y: BLACKGATE.ground, z: 343, yaw: Math.PI / 2 },
      ],
      civilians: { density: 0.05, kinds: ['guard'] },
      traffic: { density: 0.3 },
    },
  },
];

const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

// The region owning (x, z), or null (open harbour, or land no region covers yet).
export function regionDataAt(x, z) {
  for (const r of REGION_DATA) if (inRect(r.bounds, x, z)) return r;
  return null;
}

// District id at (x, z). Inside a region its own districtAt decides; elsewhere (the harbour, the
// freighter) the core's old answer stands, so nothing that used mapData.districtAt changes.
export function districtAt(x, z) {
  const r = regionDataAt(x, z);
  return r ? r.districtAt(x, z) : coreDistrictAt(x, z);
}

// Ground height the collision world falls back to under (x, z): -Infinity over water and on
// built-up decks (boxes are the only surfaces there), else 0.
export function floorAt(x, z) {
  if (z > 205) return -Infinity; // the harbour, exactly as before
  const r = regionDataAt(x, z);
  return r ? r.floor(x, z) : 0;
}

export const DISTRICTS = REGION_DATA.flatMap((r) => r.districts.map((d) => ({ ...d, region: r.id })));
export const DISTRICT_IDS = DISTRICTS.map((d) => d.id);
export const DISTRICT_LABEL = Object.fromEntries(DISTRICTS.map((d) => [d.id, d.label]));
export const DISTRICT_PHRASE = Object.fromEntries(DISTRICTS.map((d) => [d.id, d.phrase]));
export const DISTRICT_TINT = Object.fromEntries(DISTRICTS.map((d) => [d.id, d.tint]));
export const WATER_BODIES = REGION_DATA.flatMap((r) => r.water);
export const REGION_CRIME_SPOTS = REGION_DATA.flatMap((r) => r.spawnTables.crimes);
export const REGION_SITES = Object.assign({}, ...REGION_DATA.map((r) => r.sites));

// Bounding box of a set of regions (all of them by default).
export function boundsOf(list = REGION_DATA, key = 'bounds') {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const r of list) {
    const q = r[key] ?? r.bounds;
    b.minX = Math.min(b.minX, q.minX); b.maxX = Math.max(b.maxX, q.maxX);
    b.minZ = Math.min(b.minZ, q.minZ); b.maxZ = Math.max(b.maxZ, q.maxZ);
  }
  return b;
}

// The playable extent: every region, plus the harbour edge the core always had (waterZ 205).
// Vehicles, the Batwing and the blimp clamp to this.
export const WORLD_BOUNDS = { ...boundsOf(), waterZ: 205 };
// What the progress page draws (regions flagged progressMap; the core today).
export const PROGRESS_MAP_BOUNDS = boundsOf(REGION_DATA.filter((r) => r.progressMap), 'mapBounds');
