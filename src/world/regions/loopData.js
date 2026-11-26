// Region data for the Loop's rows 2-5 and Gotham Mile (workstream H): sites for later content,
// crime spots, spawn tables and the Mile's district and palette. Pure; data.js folds it in.
// Every site carries a `kind` so content workstreams can filter: door (a side-mission or story
// door), rooftop, vista, stealth (a location with perches), fight (an alley or court), crime,
// collectible (a hide), fastTravel (El platforms, a Batwing drop), doorman (a hotel canopy spot).
import { EL, EL_STATIONS } from './loopLayout.js';

// One fast-travel site per El platform (both sides of each station, where it has two).
export function stationSites() {
  const out = {};
  for (const st of EL_STATIONS) {
    const sides = st.north ? [-1] : [-1, 1];
    for (const side of sides) {
      const off = side * (EL.platformIn + EL.platformOut) / 2;
      const id = `${st.id}${sides.length > 1 ? (side < 0 ? 'A' : 'B') : ''}`;
      out[id] = { x: st.along === 'x' ? st.x : st.x + off, y: EL.platformTop, z: st.along === 'x' ? st.z + off : st.z, kind: 'fastTravel', station: st.id, name: st.name };
    }
  }
  return out;
}

export const LOOP_SITES = {
  ...stationSites(),
  wayneTowerLobby: { x: 0, y: 0.15, z: -432.6, kind: 'door' },
  wayneTowerRoof: { x: 0, y: 169.2, z: -444.6, kind: 'rooftop' },
  exchangeTop: { x: -140, y: 92, z: -566.25, kind: 'vista' },
  heraldCrown: { x: -51, y: 80, z: -390, kind: 'stealth' },
  cityHallSteps: { x: 160.6, y: 1.35, z: -449, kind: 'crime' },
  loopAlleyWest: { x: -239.5, y: 0.15, z: -449, kind: 'fight' },
  marqueeRow: { x: 0, y: 0.15, z: -547.6, kind: 'crime' },
  elTrackCache: { x: 60, y: EL.deckTop + 0.16, z: -539, kind: 'collectible' },
  canyonBank: { x: -141.5, y: 0.15, z: -500, kind: 'crime' },
  gazetteRoof: { x: 8, y: 48, z: -512, kind: 'rooftop' },
};

export const LOOP_CRIMES = [
  { id: 'loopWaynePlaza', district: 'loop', x: 12, y: 0.15, z: -428.5, yaw: Math.PI },
  { id: 'loopExchangeSteps', district: 'loop', x: -150, y: 0.15, z: -547.8, yaw: 0 },
  { id: 'loopMarqueeRow', district: 'loop', x: -30, y: 0, z: -539, yaw: Math.PI / 2 },
  { id: 'loopCityHall', district: 'loop', x: 160.6, y: 1.35, z: -449, yaw: -Math.PI / 2 },
  { id: 'loopAlleyWest', district: 'loop', x: -239.5, y: 0.15, z: -449, yaw: 0 },
  { id: 'loopCanyonBank', district: 'loop', x: -141.5, y: 0.15, z: -500, yaw: -Math.PI / 2 },
  { id: 'loopElPlatform', district: 'loop', x: -94.95, y: EL.platformTop, z: -449, yaw: 0 },
  { id: 'loopGazette', district: 'loop', x: 0, y: 0.15, z: -487.6, yaw: 0 },
];

export const LOOP_SPAWNS = {
  civilians: { density: 1, kinds: ['office', 'walker', 'tourist', 'theatregoer'] },
  traffic: { density: 1, kinds: ['sedan', 'taxi', 'bus'] },
  gangs: [{ id: 'twoFace', weight: 3 }, { id: 'riddler', weight: 2 }, { id: 'street', weight: 1 }],
};

const MILE_CRIMES = [
  ...[0, 1, 2, 3].map((i) => ({ id: `mileDiamondRow${i}`, district: 'gothamMile', x: -14.25 + i * 9.5, y: 0.15, z: -661.6, yaw: Math.PI })),
  { id: 'mileIcebergDoor', district: 'gothamMile', x: 60, y: 0.15, z: -601.8, yaw: Math.PI },
  { id: 'mileBoulevard', district: 'gothamMile', x: 133.5, y: 0.15, z: -640, yaw: -Math.PI / 2 },
  { id: 'mileChurchSteps', district: 'gothamMile', x: 0, y: 0.15, z: -721.8, yaw: Math.PI },
  { id: 'milePumpingPark', district: 'gothamMile', x: 194, y: 0.2, z: -674, yaw: 0 },
];

export const MILE_REGION = {
  id: 'gothamMile',
  name: 'Gotham Mile',
  seed: 141,
  bounds: { minX: -40, maxX: 236, minZ: -780, maxZ: -600 },
  districts: [
    // The ambience already keys this district as 'gothamMile' (src/audio/cityAmbience.js).
    { id: 'gothamMile', label: 'Gotham Mile', phrase: 'on Gotham Mile', tint: '#d8c49a', palette: { key: 'gothamMile', center: { x: 120, z: -690 }, swatches: [0x1a1612, 0x8a6a3a, 0x5a4a3a, 0x2e2822, 0xe8c070, 0xf2e6cc] } },
  ],
  districtAt: () => 'gothamMile',
  water: [],
  floor: () => 0,
  sites: {
    icebergDoor: { x: 60, y: 0.15, z: -601.8, kind: 'door' },
    icebergRoof: { x: 72, y: 22, z: -613, kind: 'rooftop' },
    pumpingTowerTop: { x: 187, y: 34, z: -683, kind: 'vista' },
    pumpingStationDoor: { x: 206.2, y: 0.15, z: -683, kind: 'door' },
    oldChurchBelfry: { x: 0, y: 30, z: -727, kind: 'stealth' },
    diamondAlley: { x: 0, y: 0.15, z: -681, kind: 'fight' },
    diamondRow0: { x: -14.25, y: 0.15, z: -661.6, kind: 'crime' },
    diamondRow1: { x: -4.75, y: 0.15, z: -661.6, kind: 'crime' },
    diamondRow2: { x: 4.75, y: 0.15, z: -661.6, kind: 'crime' },
    diamondRow3: { x: 14.25, y: 0.15, z: -661.6, kind: 'crime' },
    grandKaneDoorman: { x: 0, y: 0.15, z: -601.8, kind: 'doorman' },
    pinnacleDoorman: { x: 166.8, y: 0.15, z: -623, kind: 'doorman' },
    mileBatwingDrop: { x: 197.5, y: 100, z: -623, kind: 'fastTravel' },
    mileCollectible: { x: 190.8, y: 12, z: -683, kind: 'collectible' },
  },
  spawnTables: {
    crimes: MILE_CRIMES,
    civilians: { density: 1, kinds: ['shopper', 'tourist', 'walker', 'doorman'] },
    traffic: { density: 0.9, kinds: ['sedan', 'taxi', 'limo', 'bus'] },
    gangs: [{ id: 'penguin', weight: 3 }, { id: 'street', weight: 1 }],
  },
};
