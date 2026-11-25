// The east side's regions as plain data (appended to REGION_DATA in ./data.js): Robinson Park and
// Lakeshore Drive north of the river, Lakeshore Drive's southern stretch beside Old Gotham, the
// Museum Campus, the lake with the Amusement Mile pier, and Arkham Island with its causeway.
// Pure (no three.js). Layout numbers come from ./eastLayout.js, the builders build to them.
//
// Regions may not overlap (tests/unit/regions.test.js), so the shore is cut into rectangles: the
// river and Lower Gotham own x 236..366 between z -306 and -236, the two lake regions own
// everything east of the seawall (x 366..800), split at z -160.
import { EAST, LAKE_LEVEL, PIER_RECT, ISLAND_RECT, CAUSEWAY_RECT, inRect } from './eastLayout.js';

const P = EAST.pier, A = EAST.arkham;
const lakeWater = [
  { id: 'lake', kind: 'lake', ...EAST.lake, level: LAKE_LEVEL },
  { id: 'lakeSE', kind: 'lake', ...EAST.lakeSE, level: LAKE_LEVEL },
];
// Lakeshore Drive's strip and the seawall count as the drive's district, the lawns as the park.
const driveOrPark = (x) => (x > EAST.park.x1 ? 'lakeshore' : 'robinsonPark');

export const EAST_REGIONS = [
  {
    id: 'lakefront',
    name: 'Robinson Park',
    seed: 146, // was 141, which Gotham Mile also took; seeds must be unique per region
    bounds: { minX: 236, maxX: 366, minZ: -780, maxZ: -306 },
    districts: [
      { id: 'robinsonPark', label: 'Robinson Park', phrase: 'in Robinson Park', tint: '#8fbf8a', palette: { key: 'robinsonPark', center: { x: 294, z: -560 }, swatches: [0x0e1712, 0x2f5a3a, 0x3c6b4a, 0x243029, 0xe6b45c, 0xdde6cc] } },
      { id: 'lakeshore', label: 'Lakeshore Drive', phrase: 'on Lakeshore Drive', tint: '#9ab4c8', palette: { key: 'lakeshore', center: { x: 350, z: -200 }, swatches: [0x0d141c, 0x2c4a63, 0x3e5a52, 0x262e36, 0xe8a24a, 0xdbe2e6] } },
    ],
    districtAt: (x) => driveOrPark(x),
    water: [],
    floor: () => 0,
    sites: {
      foundersFountain: { x: 294, y: 0.15, z: -470, kind: 'landmark' },
      parkMirror: { x: 282, y: 0.15, z: -585, kind: 'landmark' },
      parkConservatory: { x: 294, y: 0, z: -750, kind: 'landmark' },
      conservatoryDoor: { x: 294, y: 0.15, z: -733, yaw: 0, kind: 'door' },
      parkShell: { x: 300, y: 0.15, z: -650, kind: 'landmark' },
      parkFastTravel: { x: 300, y: 0.15, z: -350, kind: 'fastTravel' },
      conservatoryVista: { x: 294, y: 26.5, z: -750, kind: 'vista' },
      fountainStealth: { x: 294, y: 0.15, z: -470, kind: 'stealth' },
      boathouse: { x: 380, y: 0.2, z: -610, kind: 'landmark' },
      boathouseHide: { x: 388, y: 0.2, z: -616, kind: 'collectible' },
      lsdNorth: { x: 345, y: 0, z: -700, kind: 'chaseStart' },
    },
    spawnTables: {
      crimes: [
        { id: 'parkFountainMugging', district: 'robinsonPark', x: 294, y: 0.15, z: -440, yaw: 0 },
        { id: 'parkShellRumble', district: 'robinsonPark', x: 300, y: 0.15, z: -615, yaw: Math.PI },
        { id: 'parkMirrorDeal', district: 'robinsonPark', x: 270, y: 0.15, z: -560, yaw: Math.PI / 2 },
        { id: 'conservatoryBreakIn', district: 'robinsonPark', x: 294, y: 0.15, z: -725, yaw: 0 },
        { id: 'lsdCarjack', district: 'lakeshore', x: 345, y: 0, z: -560, yaw: Math.PI },
        { id: 'seawallSmugglers', district: 'lakeshore', x: 361, y: 0.15, z: -660, yaw: -Math.PI / 2 },
      ],
      civilians: { density: 0.7, kinds: ['jogger', 'walker', 'tourist', 'dogWalker'] },
      traffic: { density: 1, kinds: ['car', 'taxi', 'bus'] },
      gangs: ['ivy', 'joker'],
    },
    ambience: 'park',
  },
  {
    id: 'lakeshore',
    name: 'Lakeshore Drive',
    seed: 142,
    bounds: { minX: 236, maxX: 366, minZ: -236, maxZ: 80 },
    districts: [],
    districtAt: (x) => driveOrPark(x),
    water: [],
    floor: () => 0,
    sites: {
      lakeshoreShell: { x: 300, y: 0.15, z: -5, kind: 'landmark' },
      causewayGate: { x: 372, y: 0.5, z: -80, kind: 'landmark' },
      lakeshoreStatues: { x: 294, y: 0.15, z: -120, kind: 'stealth' },
      lsdSouth: { x: 345, y: 0, z: 40, kind: 'chaseStart' },
    },
    spawnTables: {
      crimes: [
        { id: 'lakeshoreShellHeist', district: 'robinsonPark', x: 300, y: 0.15, z: -40, yaw: Math.PI },
        { id: 'lakeshoreStatueVandals', district: 'robinsonPark', x: 294, y: 0.15, z: -100, yaw: 0 },
        { id: 'lsdSouthPileup', district: 'lakeshore', x: 345, y: 0, z: -10, yaw: 0 },
      ],
      civilians: { density: 0.5, kinds: ['jogger', 'walker'] },
      traffic: { density: 1, kinds: ['car', 'taxi'] },
      gangs: ['joker'],
    },
    ambience: 'park',
  },
  {
    id: 'museum',
    name: 'Museum Campus',
    seed: 143,
    bounds: { minX: 236, maxX: 366, minZ: 80, maxZ: 300 },
    districts: [
      { id: 'museumCampus', label: 'Museum Campus', phrase: 'at the Museum Campus', tint: '#d6d8dc', palette: { key: 'museumCampus', center: { x: 300, z: 170 }, swatches: [0x121820, 0x8e96a3, 0x2f6f8f, 0x2b323c, 0xe8c070, 0xeef0f2] } },
    ],
    districtAt: () => 'museumCampus',
    water: [],
    floor: () => 0, // the harbour (z > 205) stays water: floorAt answers that before asking the region
    sites: {
      museumHall: { x: 294, y: 0, z: 118, kind: 'landmark' },
      museumHallDoor: { x: 294, y: 3.4, z: 101, yaw: Math.PI, kind: 'door' },
      aquarium: { x: 294, y: 0, z: 162, kind: 'landmark' },
      aquariumDoor: { x: 294, y: 0.15, z: 146.5, yaw: Math.PI, kind: 'door' },
      planetarium: { x: 336, y: 0.15, z: 258, kind: 'landmark' },
      planetariumDoor: { x: 336, y: 0.15, z: 241.5, yaw: Math.PI, kind: 'door' },
      planetariumVista: { x: 336, y: 17.4, z: 258, kind: 'vista' },
      museumRoofStealth: { x: 294, y: 20.5, z: 118, kind: 'stealth' },
      marinaDocks: { x: 268, y: 0.2, z: 240, kind: 'landmark' },
      pennyHide: { x: 316, y: 0.15, z: 95, kind: 'collectible' },
      museumFastTravel: { x: 300, y: 0.15, z: 186, kind: 'fastTravel' },
    },
    spawnTables: {
      crimes: [
        { id: 'museumSteps', district: 'museumCampus', x: 294, y: 0.15, z: 92, yaw: 0 },
        { id: 'aquariumColdPlant', district: 'museumCampus', x: 318, y: 0.15, z: 170, yaw: -Math.PI / 2 },
        { id: 'marinaSmuggle', district: 'museumCampus', x: 262, y: 0.2, z: 203, yaw: Math.PI },
        { id: 'planetariumPoint', district: 'museumCampus', x: 336, y: 0.15, z: 232, yaw: Math.PI },
      ],
      civilians: { density: 0.6, kinds: ['tourist', 'walker', 'student'] },
      traffic: { density: 0.6, kinds: ['car', 'taxi', 'bus'] },
      gangs: ['freeze'],
    },
    ambience: 'campus',
  },
  {
    id: 'pier',
    name: 'The Lake and Amusement Mile',
    seed: 144,
    bounds: { minX: 366, maxX: 800, minZ: -820, maxZ: -160 },
    districts: [
      { id: 'amusementMile', label: 'Amusement Mile', phrase: 'on Amusement Mile', tint: '#e0a06a', palette: { key: 'amusementMile', center: { x: 500, z: -450 }, swatches: [0x1a1016, 0xb0302c, 0xd8a62a, 0x33222a, 0x3fd6c8, 0xf2e2c4] } },
      { id: 'lake', label: 'The Lake', phrase: 'out on the lake', tint: '#7d93ad', palette: { key: 'lake', center: { x: 520, z: -620 }, swatches: [0x0b1018, 0x1f3550, 0x2a4660, 0x1c242e, 0xe8b45a, 0xd6dee6] } },
    ],
    districtAt: (x, z) => (inRect(PIER_RECT, x, z) ? 'amusementMile' : 'lake'),
    water: lakeWater,
    floor: () => -Infinity, // open lake: the pier, breakwater and viaduct are boxes
    sites: {
      ferrisWheel: { x: EAST.wheel.x, y: P.deck, z: P.z, kind: 'landmark' },
      wheelTopVista: { x: EAST.wheel.x, y: EAST.wheel.axle + EAST.wheel.radius, z: P.z, kind: 'vista' },
      funhouseDoor: { x: 536, y: P.deck, z: -446.5, yaw: 0, kind: 'door' },
      pierBallroom: { x: 611, y: P.deck, z: P.z, kind: 'landmark' },
      ballroomDoor: { x: 597.5, y: P.deck, z: P.z, yaw: -Math.PI / 2, kind: 'door' },
      pierUndercroft: { x: 470, y: 0.3, z: -468, kind: 'stealth' },
      pierFastTravel: { x: 392, y: P.deck, z: P.z, kind: 'fastTravel' },
      coasterCollectible: { x: 520, y: 18, z: -466, kind: 'collectible' },
      lighthouse: { x: 712, y: 1, z: -600, kind: 'landmark' },
      lighthouseVista: { x: 712, y: 22.5, z: -600, kind: 'vista' },
      viaduct: { x: 391, y: 0, z: -270, kind: 'chaseRoute' },
    },
    spawnTables: {
      crimes: [
        { id: 'pierGateShakedown', district: 'amusementMile', x: 400, y: P.deck, z: -450, yaw: Math.PI / 2 },
        { id: 'wheelHostage', district: 'amusementMile', x: 446, y: P.deck, z: -438, yaw: 0 },
        { id: 'carouselRumble', district: 'amusementMile', x: 500, y: P.deck, z: -448, yaw: Math.PI / 2 },
        { id: 'funhouseClowns', district: 'amusementMile', x: 536, y: P.deck, z: -444, yaw: 0 },
        { id: 'derelictDeal', district: 'amusementMile', x: 570, y: P.deck, z: -436, yaw: -Math.PI / 2 },
        { id: 'undercroftStash', district: 'amusementMile', x: 470, y: 0.3, z: -468, yaw: Math.PI / 2 },
      ],
      civilians: { density: 0.8, kinds: ['tourist', 'family', 'teen'] },
      traffic: { density: 0 },
      boats: { density: 0.5, kinds: ['tour_boat', 'speedboat'] },
      gangs: ['joker', 'tweedles'],
    },
    ambience: 'carnival',
  },
  {
    id: 'arkham',
    name: 'Arkham Island',
    seed: 145,
    bounds: { minX: 366, maxX: 800, minZ: -160, maxZ: 300 },
    districts: [
      { id: 'arkham', label: 'Arkham Island', phrase: 'on Arkham Island', tint: '#b9c2b0', palette: { key: 'arkham', center: { x: 650, z: -80 }, swatches: [0x0d120f, 0x9a9e8c, 0x3e5a46, 0x262b27, 0xd8e6c0, 0xe8e6da] } },
    ],
    districtAt: (x, z) => (inRect(ISLAND_RECT, x, z) || inRect(CAUSEWAY_RECT, x, z) ? 'arkham' : 'lake'),
    water: [],
    floor: () => -Infinity, // the lake; the island, causeway and dock are boxes
    sites: {
      arkhamGate: { x: 596, y: A.plateau, z: -80, kind: 'landmark' },
      arkhamMainHallDoor: { x: 616.5, y: A.plateau, z: -80, yaw: -Math.PI / 2, kind: 'door' },
      arkhamIntensiveDoor: { x: 668, y: A.plateau, z: -113.5, yaw: 0, kind: 'door' },
      arkhamGreenhouseDoor: { x: 699.5, y: A.plateau, z: -30, yaw: -Math.PI / 2, kind: 'door' },
      arkhamClockTower: { x: 622, y: A.plateau, z: -80, kind: 'landmark' },
      arkhamTowerVista: { x: 622, y: A.plateau + 36.5, z: -80, kind: 'vista' },
      arkhamYard: { x: 702, y: A.plateau, z: -80, kind: 'stealth' },
      arkhamChapel: { x: 612, y: A.plateau, z: -138, kind: 'landmark' },
      arkhamDock: { x: 640, y: 0.4, z: 12, kind: 'landmark' },
      arkhamBreach: { x: 685, y: A.plateau, z: -150, kind: 'collectible' },
    },
    spawnTables: {
      crimes: [
        { id: 'arkhamGateBreakout', district: 'arkham', x: 600, y: A.plateau, z: -72, yaw: -Math.PI / 2 },
        { id: 'arkhamYardRiot', district: 'arkham', x: 702, y: A.plateau, z: -85, yaw: 0 },
        { id: 'arkhamDockEscape', district: 'arkham', x: 640, y: 0.4, z: 8, yaw: Math.PI },
        { id: 'causewayAmbush', district: 'arkham', x: 470, y: 0.5, z: -80, yaw: Math.PI / 2 },
        { id: 'arkhamGreenhouseVines', district: 'arkham', x: 690, y: A.plateau, z: -30, yaw: Math.PI / 2 },
      ],
      civilians: { density: 0.05, kinds: ['guard', 'orderly'] },
      traffic: { density: 0.1, kinds: ['police', 'van'] },
      gangs: ['inmates'],
    },
    ambience: 'asylum',
  },
];
