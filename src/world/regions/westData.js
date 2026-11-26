// The west side's regions as plain data (workstream H3), appended to REGION_DATA by data.js:
// the river branches, the South Branch quay, the Narrows, Park Row, Chinatown + Little Odessa and
// the Yards. Pure (no three.js). Nothing here imports data.js (data.js imports this file).
//
// District ids are saved (gotham-progress-v1 `districts`) and keyed by the audio ambience
// profiles (src/audio/cityAmbience.js already knows narrows, parkRow, chinatown, littleOdessa,
// yards); once shipped, never rename one. The branches report the main stem's 'river' district.
import { WEST, RECTS, LANDMARKS as L, westWaterAt } from './westLayout.js';

const WY = WEST.waterY;
const WALK = WEST.walkY;

// Swatches: darkest, main, second, mid, accent, paper-light (as the core's).
const D = {
  quay: { id: 'quay', label: 'South Branch Quay', phrase: 'on the South Branch quay', tint: '#a9b4b0', ambience: 'river', palette: { key: 'quay', center: { x: -251, z: -20 }, swatches: [0x12171a, 0x5a4e3e, 0x2f4a4e, 0x2e3133, 0xd98c3a, 0xdcd6c6] } },
  narrows: { id: 'narrows', label: 'The Narrows', phrase: 'in the Narrows', tint: '#b9bf7c', ambience: 'narrows', palette: { key: 'narrows', center: { x: -365, z: -420 }, swatches: [0x151810, 0x7d8a3a, 0x8a4a2e, 0x33352a, 0xe0b84a, 0xe2e4c4] } },
  parkRow: { id: 'parkRow', label: 'Park Row', phrase: 'on Park Row', tint: '#c99c7c', ambience: 'parkRow', palette: { key: 'parkRow', center: { x: -515, z: -400 }, swatches: [0x1c1612, 0x8a3e2e, 0x5a4a3c, 0x33292a, 0xe8962f, 0xecdcc4] } },
  chinatown: { id: 'chinatown', label: 'Chinatown', phrase: 'in Chinatown', tint: '#d98c8c', ambience: 'chinatown', palette: { key: 'chinatown', center: { x: -385, z: -128 }, swatches: [0x1a1012, 0xa8262e, 0x2e7a5e, 0x2e2226, 0xe8c04a, 0xf0e0c8] } },
  littleOdessa: { id: 'littleOdessa', label: 'Little Odessa', phrase: 'in Little Odessa', tint: '#8fc4be', ambience: 'littleOdessa', palette: { key: 'littleOdessa', center: { x: -522, z: -128 }, swatches: [0x121a1c, 0x2f7f7a, 0x8a6a4a, 0x2a3032, 0xd8b46a, 0xeee6d0] } },
  yards: { id: 'yards', label: 'The Yards', phrase: 'in the Yards', tint: '#c49c6c', ambience: 'yards', palette: { key: 'yards', center: { x: -440, z: 90 }, swatches: [0x1a1410, 0x7a3e22, 0x5a4632, 0x30282a, 0xf07a2a, 0xe6d6bc] } },
};

const crime = (id, district, x, z, yaw = 0, y = 0) => ({ id, district, x, y, z, yaw });

export const WEST_REGION_DATA = [
  {
    id: 'westRiver',
    name: 'The River Branches',
    seed: 3101,
    bounds: RECTS.westRiver,
    districts: [],
    districtAt: () => 'river',
    // The North and South Branch, the channel and cuts round the Narrows (in that region), and the
    // lock outfall at harbour level (the chamber itself is a moving surface the builder draws).
    water: [
      { id: 'branch', kind: 'river', minX: -300, maxX: -266, minZ: -600, maxZ: WEST.lock.lowerZ, level: WY },
      { id: 'lockOutfall', kind: 'river', minX: -300, maxX: -266, minZ: WEST.lock.upperZ, maxZ: 205, level: -0.6 },
    ],
    floor: () => -Infinity,
    sites: {
      wolfPointFork: { x: -283, y: 0, z: -298 },        // mid-span of the -298 bascule, over the fork
      quayWalk: { x: -269, y: WALK, z: -60 },
      locks: { x: -283, y: 0.15, z: WEST.lock.upperZ },  // the upper gate footway
      wolfPointWalk: { x: -269.5, y: WALK, z: -200 },   // the walk's north end under the fork
      quayBargeHide: { x: -277.5, y: WALK - 0.12, z: 70 }, // collectible on the moored barge
    },
    spawnTables: {
      crimes: [
        crime('quayWalkSmuggle', 'river', -269, 40, Math.PI / 2, WALK),
        crime('lockGateDeal', 'river', -283, WEST.lock.upperZ, 0, 0.15),
      ],
      civilians: { density: 0.2, kinds: ['walker', 'worker'] },
      traffic: { density: 0.6 },
      gangs: [{ id: 'smugglers', weight: 1 }],
    },
  },
  {
    id: 'quay',
    name: 'South Branch Quay',
    seed: 3102,
    bounds: RECTS.quay,
    districts: [D.quay],
    districtAt: () => 'quay',
    water: [],
    floor: () => 0,
    sites: {
      quayCraneNorth: { x: L.cranes[0].x, y: 18.65, z: L.cranes[0].z },    // vista: the crane jib
      quayCraneMid: { x: L.cranes[1].x, y: 18.65, z: L.cranes[1].z },
      quayDock: { x: -256, y: 1.35, z: -60 },                            // a loading dock (side-mission door)
      quayFastTravel: { x: -246, y: 0, z: -150 },
      quayCraneSouth: { x: L.cranes[2].x, y: 18.65, z: L.cranes[2].z },
      quayStealth: { x: -262, y: 0, z: 30 },                             // under the crane, between the docks and the water
      lockKeeper: { x: -263, y: 0, z: 195 },
    },
    spawnTables: {
      crimes: [
        crime('quayHeist', 'quay', -258, -120, -Math.PI / 2),
        crime('quayDockFight', 'quay', -258, 60, -Math.PI / 2),
        crime('quayBridgeHold', 'quay', -250, -30, Math.PI / 2),
      ],
      civilians: { density: 0.3, kinds: ['worker', 'walker'] },
      traffic: { density: 0.4 },
      gangs: [{ id: 'smugglers', weight: 2 }, { id: 'dockRats', weight: 1 }],
    },
  },
  {
    id: 'narrows',
    name: 'The Narrows',
    seed: 3103,
    bounds: RECTS.narrows,
    districts: [D.narrows],
    districtAt: () => 'narrows',
    water: [
      { id: 'channel', kind: 'river', ...WEST.channel, level: WY },
      { id: 'northCut', kind: 'river', ...WEST.northCut, level: WY },
      { id: 'southCut', kind: 'river', ...WEST.southCut, level: WY },
    ],
    floor: (x, z) => (westWaterAt(x, z) ? -Infinity : 0),
    sites: {
      narrowsStackTop: { x: L.stack.x, y: L.stack.h, z: L.stack.z },          // vista from the Stack
      wolfPointRoof: { x: L.wolfPoint.x, y: L.wolfPoint.h, z: L.wolfPoint.z }, // the district's tallest perch
      narrowsMarket: { x: (L.market.minX + L.market.maxX) / 2, y: 0.15, z: (L.market.minZ + L.market.maxZ) / 2 },
      narrowsClinicDoor: { x: L.clinic.x + L.clinic.w / 2 + 0.6, y: 0.15, z: L.clinic.z },  // side-mission door
      narrowsGymDoor: { x: L.gym.x - L.gym.w / 2 - 0.6, y: 0.15, z: L.gym.z },
      narrowsFastTravel: { x: -352, y: 0.15, z: -467.5 },                     // under the El's Narrows station plot
      narrowsRookery: { x: -340, y: 0, z: -451 },                             // stealth: courtyard ringed by tanks
      narrowsHide: { x: -306, y: 0.15, z: -566 },                             // collectible behind the north-cut bridgehead
    },
    spawnTables: {
      crimes: [
        crime('narrowsMugging', 'narrows', -370, -330, 0),
        crime('narrowsMarketBrawl', 'narrows', -340, -298, Math.PI),
        crime('narrowsDrugDeal', 'narrows', -421, -500, Math.PI / 2),
        crime('narrowsKidnap', 'narrows', -310, -450, -Math.PI / 2),
        crime('narrowsArson', 'narrows', -370, -539, 0),
        crime('narrowsUnderEl', 'narrows', -330, -479, Math.PI / 2),
      ],
      civilians: { density: 0.9, kinds: ['walker', 'vagrant', 'worker', 'kid'] },
      traffic: { density: 0.35 },
      gangs: [{ id: 'scarecrowCult', weight: 1 }, { id: 'narrowsCrew', weight: 3 }],
    },
  },
  {
    id: 'parkRow',
    name: 'Park Row',
    seed: 3104,
    bounds: RECTS.parkRow,
    districts: [D.parkRow],
    districtAt: () => 'parkRow',
    water: [],
    floor: () => 0,
    sites: {
      crimeAlley: { x: (L.crimeAlley.minX + L.crimeAlley.maxX) / 2, y: 0, z: -326 },   // story site: the still alley
      orpheumMarquee: { x: L.orpheum.x, y: 0.15, z: L.orpheum.z + L.orpheum.d / 2 + 1.5 },
      orpheumRoof: { x: L.orpheum.x, y: L.orpheum.h, z: L.orpheum.z },               // vista over Crime Alley
      parkRowMission: { x: L.mission.x + L.mission.w / 2 + 0.6, y: 0.15, z: L.mission.z }, // side-mission door
      parkRowOrphanage: { x: L.orphanage.x, y: 0.15, z: L.orphanage.z + L.orphanage.d / 2 + 2 },
      parkRowViaduct: { x: L.viaduct.x, y: L.viaduct.deck, z: -350 },                 // stealth perch line
      parkRowFastTravel: { x: -505, y: 0.15, z: -467.5 },                             // the El's Park Row station plot
      parkRowHide: { x: -546.5, y: 0, z: -560 },                                      // collectible in the north alley
    },
    spawnTables: {
      crimes: [
        crime('parkRowProtection', 'parkRow', -460, -360, Math.PI / 2),
        crime('parkRowArson', 'parkRow', -520, -450, 0),
        crime('parkRowPawnRobbery', 'parkRow', -460, -440, Math.PI / 2),
        crime('parkRowMugging', 'parkRow', -490, -298, 0),
        crime('parkRowUnderViaduct', 'parkRow', -546, -419, 0),
        crime('parkRowHotelDeal', 'parkRow', -520, -330, -Math.PI / 2),
      ],
      civilians: { density: 0.6, kinds: ['walker', 'vagrant', 'elderly'] },
      traffic: { density: 0.45 },
      gangs: [{ id: 'falconeRemnants', weight: 2 }, { id: 'parkRowCrew', weight: 2 }],
    },
  },
  {
    id: 'chinatown',
    name: 'Chinatown and Little Odessa',
    seed: 3105,
    bounds: RECTS.chinatown,
    districts: [D.chinatown, D.littleOdessa],
    districtAt: (x) => (x > -460 ? 'chinatown' : 'littleOdessa'),
    water: [],
    floor: () => 0,
    sites: {
      chinatownGate: { x: L.gate.x, y: 0, z: L.gate.z },
      chinatownGateRoof: { x: L.gate.x, y: 11.6, z: L.gate.z },                       // vista on the gate roof
      chinatownTemple: { x: L.temple.x, y: 0.15, z: L.temple.z + L.temple.d / 2 + 6 }, // temple courtyard
      chinatownNightMarket: { x: -415, y: 0.15, z: L.nightMarket.z },
      chinatownMahjongDoor: { x: -320.6, y: 0.15, z: -110 },                          // side-mission door (triad parlour)
      chinatownFastTravel: { x: -306, y: 0.15, z: -150 },
      chinatownHide: { x: -415, y: L.temple.h + 2.5, z: L.temple.z },                  // collectible on the temple ridge
      odessaChurchDomes: { x: L.church.x, y: L.church.h, z: L.church.z },             // stealth perch ring
      odessaBathhouseDoor: { x: L.bathhouse.x, y: 0.15, z: L.bathhouse.z + L.bathhouse.d / 2 + 0.6 },
      odessaClubDoor: { x: -529.4, y: 0.15, z: -60 },                                  // the mob's social club
    },
    spawnTables: {
      crimes: [
        crime('chinatownExtortion', 'chinatown', -370, -120, 0),
        crime('chinatownMarketRaid', 'chinatown', -415, -150, Math.PI),
        crime('chinatownGateAmbush', 'chinatown', -340, -150, -Math.PI / 2),
        crime('chinatownBackroom', 'chinatown', -310, -60, Math.PI / 2),
        crime('odessaShakedown', 'littleOdessa', -520, -120, 0),
        crime('odessaBathhouseHit', 'littleOdessa', -490, -90, Math.PI),
        crime('odessaTruckJack', 'littleOdessa', -573, -150, 0),
      ],
      civilians: { density: 1, kinds: ['walker', 'shopper', 'elderly', 'vendor'] },
      traffic: { density: 0.6 },
      gangs: [{ id: 'triad', district: 'chinatown', weight: 3 }, { id: 'odessaMob', district: 'littleOdessa', weight: 3 }],
    },
  },
  {
    id: 'yards',
    name: 'The Yards',
    seed: 3106,
    bounds: RECTS.yards,
    districts: [D.yards],
    districtAt: () => 'yards',
    water: [],
    floor: () => 0,
    sites: {
      yardsGate: { x: L.yardsGate.x, y: 0, z: L.yardsGate.z - 3 },
      yardsSiloTop: { x: (L.silos.minX + L.silos.maxX) / 2, y: L.silos.h + 8, z: 30 },  // vista: the headhouse roof
      yardsFurnace: { x: L.furnace.x, y: 0, z: L.furnace.z + 16 },
      yardsRoundhouse: { x: L.roundhouse.x, y: 0, z: L.roundhouse.z },                 // stealth: boxcars + stalls
      yardsColdStorageDoor: { x: L.coldStorage.x - L.coldStorage.w / 2 - 0.6, y: 0.15, z: L.coldStorage.z }, // later Mr-Freeze-type territory
      yardsCrusher: { x: L.crusher.x, y: 0, z: L.crusher.z },
      yardsFastTravel: { x: -460, y: 0.15, z: 84 },
      yardsHide: { x: L.substation.x, y: 0, z: L.substation.z },                       // collectible inside the substation fence
    },
    spawnTables: {
      crimes: [
        crime('yardsStolenCars', 'yards', -405, 160, 0),
        crime('yardsTrainHeist', 'yards', -500, 121, Math.PI / 2),
        crime('yardsSteelworksFight', 'yards', -418, -26, 0),
        crime('yardsStockyardChase', 'yards', -520, 30, Math.PI),
        crime('yardsSiloSniper', 'yards', -310, 30, -Math.PI / 2),
        crime('yardsHarbourRoad', 'yards', -460, 197, Math.PI / 2),
      ],
      civilians: { density: 0.25, kinds: ['worker'] },
      traffic: { density: 0.5, kinds: ['truck', 'van'] },
      gangs: [{ id: 'carRing', weight: 2 }, { id: 'fireflyCrew', weight: 1 }],
    },
  },
];
