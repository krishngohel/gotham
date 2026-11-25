// The Batcave (workstream K). A lazily built pocket (see ./pocketKit.js): a vertical cavern under
// the Manor. Entrances: the grandfather-clock lift from the study (arrives on the high ledge), the
// cave mouth behind the waterfall (regions/data.js batcaveMouth, by car), and the disused service
// door on Lower Gotham's lower deck (batcaveDowntown: the fast-travel tunnel).
//
// Levels: the lift ledge (14 m) -> a stair down to the main deck (4 m: the Batcomputer, the suit
// vault, the partner lockers, the gadget workbench, a bridge out to the Batwing's pad) -> a stair
// down to the cave floor (the vehicle turntable, the medical bay, the trophy hall, the training
// simulator, the waterfall and its pool). Pure data first (local coordinates), then build(ctx).
import * as THREE from 'three';
import { box, cylinder } from '../buckets.js';
import {
  add, addBox, block, stair, table, chair, rug, textTexture, picture,
  ROCK, ROCK_D, STEEL, CYAN, BRASS, CREAM, WARM, STONE_D,
} from './pocketKit.js';
import { dressCave, rail } from './caveDressing.js'; // [polish] depth, waterfall, railed walkways, the set pieces

export const CAVE_ORIGIN = Object.freeze({ x: 2000, y: 0, z: -2400 });
export const CAVE_BOUNDS = Object.freeze({ x0: -46, x1: 46, z0: -36, z1: 36, y: 0, h: 32 });
const DECK = 4, LEDGE = 14;

export const CAVE_ROOMS = Object.freeze({
  cavern: { id: 'cavern', name: 'The Batcave', x0: -46, x1: 46, z0: -36, z1: 36, y: 0, h: 32 },
});
// Named areas (labels, the runtime's "where am I", the co-op partner's place).
export const CAVE_AREAS = Object.freeze({
  ledge: { name: 'The lift ledge', x0: -44, x1: -32, z0: -34, z1: -24, y: LEDGE },
  deck: { name: 'The main deck', x0: -26, x1: 14, z0: -16, z1: 8, y: DECK },
  pad: { name: 'The Batwing pad', x0: 22, x1: 38, z0: -30, z1: -10, y: DECK },
  bay: { name: 'The vehicle bay', x0: -16, x1: 14, z0: 15, z1: 30, y: 0 },
  medbay: { name: 'The medical bay', x0: -38, x1: -22, z0: 8, z1: 22, y: 0 },
  trophies: { name: 'The trophy hall', x0: -44, x1: -28, z0: -20, z1: 4, y: 0 },
  sim: { name: 'The training simulator', x0: 18, x1: 42, z0: 2, z1: 30, y: 0 },
});

const S = (id, x, y, z, o) => [id, { id, x, y, z, r: 1.8, ...o }];
export const CAVE_STATIONS = Object.freeze(Object.fromEntries([
  S('lift', -41, LEDGE, -29, { kind: 'lift', label: 'The lift to the study', yaw: -Math.PI / 2 }),
  S('batcomputer', 0, DECK, -12, { kind: 'batcomputer', label: 'The Batcomputer', yaw: Math.PI }),
  S('suitVault', -21, DECK, -6, { kind: 'suitVault', label: 'The suit vault', yaw: -Math.PI / 2 }),
  S('suitUp', -21, DECK, -11, { kind: 'suitUp', label: 'Suit up', yaw: -Math.PI / 2 }),
  S('lockers', -22, DECK, 5, { kind: 'lockers', label: 'The partner lockers', yaw: Math.PI / 2 }),
  S('workbench', 9.5, DECK, -5, { kind: 'workbench', label: 'The gadget workbench', yaw: Math.PI / 2 }),
  S('skillBench', 9.5, DECK, 2, { kind: 'skillTree', label: 'The upgrade bench', yaw: Math.PI / 2 }),
  S('batwingPad', 26, DECK, -20, { kind: 'batwing', label: 'The Batwing', yaw: Math.PI / 2 }),
  S('vehicleBay', 0, 0, 17, { kind: 'vehicleBay', label: 'The Batmobile (drive out)', yaw: 0 }),
  S('batcycle', -11, 0, 19, { kind: 'batcycle', label: 'The Batcycle', yaw: 0 }),
  S('medbay', -27, 0, 15, { kind: 'medbay', label: 'The medical bay', yaw: -Math.PI / 2 }),
  S('trophyCoin', -38, 0, -12, { kind: 'trophy', trophy: 'coin', label: 'The giant coin', yaw: -Math.PI / 2 }),
  S('trophyDino', -35, 0, -2, { kind: 'trophy', trophy: 'dinosaur', label: 'The dinosaur', yaw: -Math.PI / 2 }),
  S('trophyCard', -38, 0, -18, { kind: 'trophy', trophy: 'card', label: 'The playing card', yaw: -Math.PI / 2 }),
  S('simConsole', 19.5, 0, 6, { kind: 'sim', label: 'The training simulator', yaw: Math.PI / 2 }),
  S('tunnel', 41, 0, -6, { kind: 'tunnel', label: 'The tunnel to Lower Gotham', yaw: Math.PI / 2 }),
  S('waterfall', 0, 0, 29, { kind: 'thing', label: 'The waterfall', yaw: 0 }),
]));
// The sim's arena (local): goons spawn on its ring, the player fights in the middle.
export const SIM_ARENA = Object.freeze({ x: 30, z: 16, r: 9, y: 0.25 });

export const CAVE_ENTRIES = Object.freeze({
  wayneManorClockPassage: { x: -38, y: LEDGE, z: -29, yaw: Math.PI / 2, area: 'ledge' },
  batcaveMouth: { x: 0, y: 0, z: 29, yaw: Math.PI, area: 'bay' },
  batcaveDowntown: { x: 41, y: 0, z: -6, yaw: -Math.PI / 2, area: 'sim' },
});
export const CAVE_EXITS = Object.freeze([
  { id: 'mouth', site: 'batcaveMouth', x0: -4, x1: 4, z0: 33.2, z1: 36, label: 'Through the waterfall' },
  { id: 'tunnel', site: 'batcaveDowntown', x0: 44, x1: 46, z0: -8, z1: -4, label: 'The tunnel to Lower Gotham' },
]);
export const CAVE_SPAWN = CAVE_ENTRIES.wayneManorClockPassage;

// Trophies filled in by story progress (the runtime shows each once its test passes).
export const CAVE_TROPHIES = Object.freeze({
  coin: { label: 'A two-faced coin, man-high', after: 'twoFace' },
  dinosaur: { label: 'A mechanical dinosaur from a museum heist', after: 'night1' },
  card: { label: 'A playing card the size of a door', after: 'joker' },
});

export function buildBatcave(ctx) {
  const q = ctx.quality ?? {};
  const rich = (q.crowdDensity ?? 1) >= 0.5;
  const B = CAVE_BOUNDS;
  // ---- the rock: a floor, walls round the cavern (collision), a ceiling, rocks and stalactites ----
  add(ctx, 'painted', box(B.x1 - B.x0 + 4, 0.4, B.z1 - B.z0 + 4, 0, -0.2, 0), 0x2a2c30);
  const T = 3;
  block(ctx, B.x0 - T, -1, B.z0 - T, B.x1 + T, B.h + 2, B.z0, ROCK, { key: 'wall', tag: 'building' });
  block(ctx, B.x0 - T, -1, B.z1, -4, B.h + 2, B.z1 + T, ROCK, { key: 'wall', tag: 'building' });
  block(ctx, 4, -1, B.z1, B.x1 + T, B.h + 2, B.z1 + T, ROCK, { key: 'wall', tag: 'building' });
  block(ctx, -4, 6, B.z1 + 0.5, 4, B.h + 2, B.z1 + T, ROCK, { key: 'wall', tag: 'building' }); // over the mouth
  addBox(ctx, -4, -1, B.z1 + T, 4, 6, B.z1 + T + 1, 'bound'); // the mouth's far end (the exit takes you out first)
  block(ctx, B.x0 - T, -1, B.z0, B.x0, B.h + 2, B.z1, ROCK, { key: 'wall', tag: 'building' });
  block(ctx, B.x1, -1, B.z0, B.x1 + T, B.h + 2, -8, ROCK, { key: 'wall', tag: 'building' });
  block(ctx, B.x1, 3.2, -8, B.x1 + T, B.h + 2, -4, ROCK, { key: 'wall', tag: 'building' });
  block(ctx, B.x1, -1, -4, B.x1 + T, B.h + 2, B.z1, ROCK, { key: 'wall', tag: 'building' });
  addBox(ctx, B.x1 + T, -1, -8, B.x1 + T + 1, 4, -4, 'bound');
  block(ctx, B.x0 - T, B.h, B.z0 - T, B.x1 + T, B.h + 2, B.z1 + T, ROCK_D, { key: 'wall', tag: 'ceiling' });
  let s = 4242;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const nRocks = rich ? 70 : 34;
  for (let i = 0; i < nRocks; i++) {
    // Boulders hugging the walls, taller toward the back: the cavern reads as rock, not a box.
    const side = i % 4, t = rnd();
    const x = side === 0 ? B.x0 + 1 : side === 1 ? B.x1 - 1 : B.x0 + t * (B.x1 - B.x0);
    const z = side === 2 ? B.z0 + 1 : side === 3 ? B.z1 - 1 : B.z0 + t * (B.z1 - B.z0);
    if (side === 3 && Math.abs(x) < 14) continue; // keep the waterfall clear
    if (side === 1 && z > -10 && z < -2) continue; // and the tunnel
    const r = 2 + rnd() * 4;
    add(ctx, 'painted', new THREE.IcosahedronGeometry(r, 0).scale(1, 1.6 + rnd() * 2, 1).translate(x, rnd() * 18, z), rnd() < 0.5 ? ROCK : ROCK_D);
  }
  for (let i = 0; i < (rich ? 60 : 24); i++) {
    const x = B.x0 + 4 + rnd() * (B.x1 - B.x0 - 8), z = B.z0 + 4 + rnd() * (B.z1 - B.z0 - 8), L = 2 + rnd() * 6;
    add(ctx, 'painted', new THREE.ConeGeometry(0.4 + rnd() * 0.8, L, 5).rotateX(Math.PI).translate(x, B.h - L / 2, z), ROCK_D);
  }

  // ---- the lift ledge, high on the north-west wall, and its stair down to the deck ----
  block(ctx, -44, LEDGE - 0.6, -34, -32, LEDGE, -24, STONE_D, { tag: 'floor' });
  add(ctx, 'painted', cylinder(2.2, 3.4, LEDGE - 0.6, -38, (LEDGE - 0.6) / 2, -29, 8), ROCK);
  addBox(ctx, -40.5, 0, -31.5, -35.5, LEDGE - 0.6, -26.5, 'pillar');
  // The lift cage the clock brings you down in.
  for (const [x, z] of [[-43.4, -31.4], [-43.4, -26.6], [-38.8, -31.4], [-38.8, -26.6]]) add(ctx, 'painted', box(0.12, 3.2, 0.12, x, LEDGE + 1.6, z), BRASS);
  add(ctx, 'painted', box(4.8, 0.15, 5, -41.1, LEDGE + 3.2, -29), BRASS);
  add(ctx, 'glow', box(4.4, 0.05, 4.6, -41.1, LEDGE + 3.1, -29), 0xffe0a0);
  ctx.spot(-40, LEDGE + 2.5, -29, WARM, 10, 12);
  // Railing on the ledge's open edges.
  rail(ctx, -44, -24.1, -32, -24.1, LEDGE);
  rail(ctx, -32.1, -34, -32.1, -31.2, LEDGE);
  rail(ctx, -32.1, -26.8, -32.1, -24, LEDGE);
  stair(ctx, { axis: 'x', at: -29, from: -14, to: -32, y0: DECK, y1: LEDGE, w: 3.6, color: STONE_D });
  block(ctx, -32, LEDGE - 0.6, -30.8, -31.5, LEDGE, -27.2, STONE_D, { tag: 'floor' });
  // A walkway from the stair's foot to the deck.
  block(ctx, -16, DECK - 0.6, -31, -12, DECK, -16, STONE_D, { tag: 'floor' });
  for (const z of [-30, -22]) add(ctx, 'painted', cylinder(0.5, 0.7, DECK, -14, DECK / 2, z, 8), ROCK);

  // ---- the main deck ----
  block(ctx, -26, DECK - 0.6, -16, 14, DECK, 8, 0x30343a, { tag: 'floor' });
  for (const [x, z] of [[-20, -10], [-2, -10], [10, -10], [-20, 4], [-2, 4], [10, 4]]) add(ctx, 'painted', cylinder(0.9, 1.2, DECK - 0.6, x, (DECK - 0.6) / 2, z, 8), ROCK);
  for (const [x, z] of [[-20, -10], [-2, -10], [10, -10], [-20, 4], [-2, 4], [10, 4]]) addBox(ctx, x - 1, 0, z - 1, x + 1, DECK - 0.6, z + 1, 'pillar');
  // Edge rails, open where the stairs and the bridge meet the deck.
  rail(ctx, -26, 7.9, -3, 7.9, DECK);
  rail(ctx, 3, 7.9, 14, 7.9, DECK);
  rail(ctx, 13.9, -10.5, 13.9, 8, DECK);
  rail(ctx, -26.1, -16, -26.1, 8, DECK);
  rug(ctx, 0, -6, 10, 8, 0x1a2230, STEEL, DECK);
  // The Batcomputer: a bank of screens on the north edge, a console, a chair. The big screen is a
  // live canvas the runtime draws the city map on (userData.screen).
  block(ctx, -9, DECK, -16, 9, DECK + 1, -14.6, 0x1a1c22, { tag: 'furniture' });
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.32;
    add(ctx, 'painted', box(3.8, 2.6, 0.2, 0, 0, 0).rotateY(-a).translate(Math.sin(a) * 11 + 0, DECK + 3.2, -15.2 - (1 - Math.cos(a)) * 11 * 0.4), 0x0c0e12);
    if (i !== 0) add(ctx, 'glow', box(3.5, 2.3, 0.05, 0, 0, 0).rotateY(-a).translate(Math.sin(a) * 11, DECK + 3.2, -15.05 - (1 - Math.cos(a)) * 11 * 0.4), [0x0e3a4a, 0x123a2a, 0x0e3a4a, 0x2a1a3a][i + 2] ?? 0x0e3a4a);
  }
  chair(ctx, 0, -12.6, Math.PI, { y: DECK, color: 0x1a1a1a });
  ctx.spot(0, DECK + 3, -12, CYAN, 12, 14);
  if (ctx.group && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 352;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.4), new THREE.MeshBasicMaterial({ map: t }));
    scr.position.set(ctx.O.x, ctx.O.y + DECK + 3.2, ctx.O.z - 15.0);
    scr.userData.canvas = c; scr.userData.texture = t;
    scr.name = 'batcomputerScreen';
    ctx.add(scr);
    ctx.extras.push(scr);
  }
  // The suit vault: glass cases along the west alcove (the runtime puts a suit in each).
  for (let k = 0; k < 4; k++) {
    const z = -13 + k * 4;
    add(ctx, 'painted', box(1.8, 0.3, 1.8, -24.6, DECK + 0.15, z), 0x1a1c22);
    add(ctx, 'glass', box(1.7, 2.6, 1.7, -24.6, DECK + 1.6, z));
    add(ctx, 'glow', box(1.6, 0.06, 1.6, -24.6, DECK + 2.95, z), 0xd8e8ff);
    addBox(ctx, -25.5, DECK, z - 0.9, -23.7, DECK + 3, z + 0.9, 'furniture');
  }
  ctx.spot(-22, DECK + 2.5, -7, 0xd8e8ff, 10, 12);
  // The partner lockers (Nightwing, Robin): tall steel doors, each with its own coloured stripe.
  for (const [k, col] of [[0, 0x49b4ff], [1, 0xd2363f], [2, 0xd9a92c]]) {
    const x = -25 + k * 1.4;
    block(ctx, x - 0.6, DECK, 7.2, x + 0.6, DECK + 2.6, 7.9, STEEL);
    add(ctx, 'glow', box(0.1, 1.8, 0.05, x + 0.3, DECK + 1.4, 7.15), col);
  }
  // The gadget workbench and the upgrade bench on the east edge.
  table(ctx, 12, -5, 2, 4, { y: DECK, color: 0x3a3e46 });
  for (let k = 0; k < 6; k++) add(ctx, 'painted', box(0.3, 0.08, 0.15, 12 + (k % 2) * 0.5 - 0.25, DECK + 0.82, -6.4 + k * 0.5), [0x8a9098, 0xd9a92c, 0x2a2a2a][k % 3]);
  add(ctx, 'glow', box(1.6, 0.04, 0.5, 12, DECK + 2.4, -5), 0xf0f0e0);
  table(ctx, 12, 2, 2, 3, { y: DECK, color: 0x3a3e46 });
  add(ctx, 'glow', box(1.2, 0.8, 0.05, 12.6, DECK + 1.3, 2), 0x123a2a);
  ctx.spot(11, DECK + 2.4, -2, 0xf0f0e0, 10, 10);
  // A bridge from the deck out to the Batwing's pad.
  block(ctx, 14, DECK - 0.4, -14.5, 22, DECK, -10.5, STEEL, { tag: 'floor' });
  rail(ctx, 14, -14.6, 22, -14.6, DECK);
  rail(ctx, 14, -10.4, 22, -10.4, DECK);
  block(ctx, 22, DECK - 0.6, -30, 38, DECK, -10, 0x2a2e34, { tag: 'floor' });
  add(ctx, 'painted', cylinder(5, 5, 0.06, 30, DECK + 0.04, -20, 24), 0xd9a92c);
  add(ctx, 'painted', cylinder(4.7, 4.7, 0.07, 30, DECK + 0.05, -20, 24), 0x2a2e34);
  for (const [x, z] of [[24, -26], [36, -26], [24, -14], [36, -14]]) add(ctx, 'painted', cylinder(0.8, 1, DECK - 0.6, x, (DECK - 0.6) / 2, z, 8), ROCK);
  for (const [x, z] of [[24, -26], [36, -26], [24, -14], [36, -14]]) addBox(ctx, x - 0.9, 0, z - 0.9, x + 0.9, DECK - 0.6, z + 0.9, 'pillar');
  rail(ctx, 37.9, -30, 37.9, -10, DECK);
  rail(ctx, 22, -10.1, 38, -10.1, DECK);
  rail(ctx, 22, -29.9, 38, -29.9, DECK);
  ctx.spot(30, DECK + 4, -20, 0xd8e8ff, 12, 16);
  // The stair down from the deck to the cave floor (south edge).
  stair(ctx, { axis: 'z', at: 0, from: 15, to: 8, y0: 0, y1: DECK, w: 6, color: STONE_D });

  // ---- the vehicle bay: the turntable (the Batmobile, placed by the runtime), the Batcycle ----
  add(ctx, 'painted', cylinder(7, 7, 0.16, 0, 0.08, 24, 32), 0x30343a);
  add(ctx, 'painted', cylinder(6.6, 6.6, 0.17, 0, 0.09, 24, 32), 0x24282e);
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; add(ctx, 'glow', box(0.6, 0.05, 0.12, Math.cos(a) * 6.8, 0.17, 24 + Math.sin(a) * 6.8).rotateY(0), 0xd9a92c); }
  ctx.spot(0, 7, 23, 0xd8e8ff, 8, 16);
  add(ctx, 'painted', cylinder(1.6, 1.6, 0.1, -11, 0.05, 22, 16), 0x30343a);

  // ---- the waterfall and its pool, the cave mouth behind ----
  // [polish] the fall itself, its foot, mist and pool: caveDressing.js waterfall()
  ctx.spot(0, 3, 31, 0x9ac8e8, 12, 16);
  add(ctx, 'glow', box(7.6, 5.6, 0.1, 0, 2.8, 38.9), 0x1a2a38); // the night through the mouth

  // ---- the medical bay ----
  block(ctx, -36, 0, 13, -32, 0.8, 17, 0xe8e8e0, { tag: 'bed' });
  add(ctx, 'painted', box(4, 0.15, 4, -34, 0.88, 15), 0xf4f4f0);
  block(ctx, -37.6, 0, 18.5, -36.4, 2.2, 19.5, 0x8a9098);
  add(ctx, 'glow', box(1.0, 0.7, 0.05, -37, 1.6, 18.45), 0x1a4a3a);
  add(ctx, 'glow', box(3, 0.08, 1.2, -34, 3.4, 15), 0xf8f8ff);
  ctx.spot(-33, 3, 15, 0xf0f8ff, 12, 12);
  rug(ctx, -30, 15, 10, 10, 0x2a2e34, 0xe8e8e0);

  // ---- the trophy hall: plinths (the runtime fills them as the story goes) ----
  for (const [x, z, w] of [[-41, -12, 3], [-38.5, -2, 6], [-41, -18, 2.5]]) {
    block(ctx, x - w / 2, 0, z - w / 2, x + w / 2, 0.5, z + w / 2, 0x3a3e46, { tag: 'plinth' });
    add(ctx, 'glow', box(w - 0.2, 0.04, w - 0.2, x, 0.52, z), 0x2a2a30);
  }
  ctx.spot(-38, 6, -10, 0xffe8c0, 12, 16);

  // ---- the training simulator: a ring platform, a holographic dome, its console ----
  add(ctx, 'painted', cylinder(SIM_ARENA.r + 0.5, SIM_ARENA.r + 0.5, SIM_ARENA.y, SIM_ARENA.x, SIM_ARENA.y / 2, SIM_ARENA.z, 32), 0x1a1e26);
  addBox(ctx, SIM_ARENA.x - SIM_ARENA.r, 0, SIM_ARENA.z - SIM_ARENA.r, SIM_ARENA.x + SIM_ARENA.r, SIM_ARENA.y, SIM_ARENA.z + SIM_ARENA.r, 'floor');
  add(ctx, 'glow', new THREE.TorusGeometry(SIM_ARENA.r, 0.08, 6, 48).rotateX(Math.PI / 2).translate(SIM_ARENA.x, SIM_ARENA.y + 0.02, SIM_ARENA.z), CYAN);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI; add(ctx, 'holo', new THREE.TorusGeometry(SIM_ARENA.r, 0.03, 4, 48, Math.PI).rotateY(a).translate(SIM_ARENA.x, SIM_ARENA.y, SIM_ARENA.z)); }
  for (let i = -4; i <= 4; i++) {
    add(ctx, 'glow', box(SIM_ARENA.r * 1.9, 0.02, 0.04, SIM_ARENA.x, SIM_ARENA.y + 0.02, SIM_ARENA.z + i * 2), 0x1a5a6a);
    add(ctx, 'glow', box(0.04, 0.02, SIM_ARENA.r * 1.9, SIM_ARENA.x + i * 2, SIM_ARENA.y + 0.02, SIM_ARENA.z), 0x1a5a6a);
  }
  block(ctx, 18.2, 0, 4.6, 19, 1.2, 7.4, 0x2a2e34);
  add(ctx, 'glow', box(0.05, 0.6, 2.2, 19.05, 1.1, 6), CYAN);
  ctx.spot(30, 6, 16, CYAN, 12, 18);

  // ---- the tunnel door to Lower Gotham ----
  add(ctx, 'glow', box(0.1, 0.4, 3.2, 45.9, 3.3, -6), 0xd9a92c);
  add(ctx, 'glow', box(0.05, 3, 3.6, 46.6, 1.5, -6), 0x101418);
  ctx.spot(42, 3, -6, 0xd9a92c, 8, 10);

  // ---- [polish] the set dressing (./caveDressing.js) ----
  dressCave(ctx, rich);

  // ---- a sign over the deck (browser only) ----
  if (ctx.group && typeof document !== 'undefined') void textTexture; // (screens are the runtime's)
  void picture; void CREAM;
}

// Bats: a small flock circling under the roof (an instanced mesh the runtime animates).
export function buildBats(count) {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([-0.35, 0, 0, 0, 0.04, 0.12, 0, 0, -0.08, 0.35, 0, 0, 0, 0.04, 0.12, 0, 0, -0.08]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x0b0b12, side: THREE.DoubleSide }), count);
  mesh.frustumCulled = false;
  mesh.name = 'caveBats';
  return mesh;
}
