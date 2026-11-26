// Wayne Manor, inside (workstream K). A lazily built pocket (see ./pocketKit.js) entered from the
// Bristol door sites (regions/data.js: wayneManorFront, wayneManorTerrace, wayneManorGarage,
// wayneManorStudyWindow; wayneManorClockPassage leads down to the Batcave).
//
// Gothic warmth: wood panelling, fireplaces (emissive fire + light spots, no PointLights), rain
// running down tall windows, chandeliers. Ground floor: the vestibule, the great hall with its
// staircase, the study (the grandfather clock passage), the library (piano), the dining room, the
// kitchen (Alfred), the ballroom (galas), the drawing room (the glass-roofed conservatory link to
// the terrace), the garage. Upstairs off the landing: the portrait gallery and Bruce's bedroom.
//
// Pure data first (rooms, stations, entries, exits in LOCAL coordinates; world = origin + local),
// then build(ctx).
import * as THREE from 'three';
import { box, cylinder } from '../buckets.js';
import {
  add, addBox, block, glowBox, shell, panelling, windowPane, fireplace, chandelier, rug, bookshelf, table, chair,
  armchair, sofa, stair, picture, portraitTexture, textTexture, wall, filler,
  WOOD, WOOD_DARK, WOOD_LIGHT, PANEL, PLASTER, STONE_W, STONE_D, BRASS, RED, GREEN, CREAM, WARM,
} from './pocketKit.js';
import { dressManor } from './manorDressing.js'; // [polish] panelling, drapes, lamps, the gala's dressing
import { chandelier as grandChandelier } from './dressing.js';

export const MANOR_ORIGIN = Object.freeze({ x: 2000, y: 0, z: -2000 });
const UP = 5.4; // the upstairs floor

// Rooms: clear floor plans (local). y: floor height; h: to the ceiling.
export const MANOR_ROOMS = Object.freeze({
  vestibule: { id: 'vestibule', name: 'Vestibule', x0: -3, x1: 3, z0: -16, z1: -10, y: 0, h: 5 },
  hall: { id: 'hall', name: 'Great hall', x0: -9, x1: 9, z0: -10, z1: 10, y: 0, h: 11 },
  study: { id: 'study', name: 'Study', x0: 9, x1: 23, z0: -10, z1: 2, y: 0, h: 6 },
  library: { id: 'library', name: 'Library', x0: 9, x1: 23, z0: 2, z1: 14, y: 0, h: 6 },
  dining: { id: 'dining', name: 'Dining room', x0: -23, x1: -9, z0: -10, z1: 3, y: 0, h: 6 },
  kitchen: { id: 'kitchen', name: 'Kitchen', x0: -23, x1: -9, z0: 3, z1: 14, y: 0, h: 5 },
  garage: { id: 'garage', name: 'Garage', x0: -39, x1: -23, z0: -6, z1: 14, y: 0, h: 5 },
  ballroom: { id: 'ballroom', name: 'Ballroom', x0: -9, x1: 9, z0: 10, z1: 36, y: 0, h: 9 },
  service: { id: 'service', name: 'Service passage', x0: -15, x1: -9, z0: 27, z1: 33, y: 0, h: 4 },
  drawingRoom: { id: 'drawingRoom', name: 'Drawing room', x0: 9, x1: 25, z0: 14, z1: 30, y: 0, h: 6 },
  gallery: { id: 'gallery', name: 'Portrait gallery', x0: -9, x1: 9, z0: -28, z1: -10, y: UP, h: 5 },
  bedroom: { id: 'bedroom', name: "Bruce's bedroom", x0: 9, x1: 23, z0: -28, z1: -14, y: UP, h: 5 },
});

// Stations: things to walk to and use (local). kind: what the runtime does with it.
const S = (id, x, z, o) => [id, { id, x, z, y: 0, r: 1.6, ...o }];
export const MANOR_STATIONS = Object.freeze(Object.fromEntries([
  S('clock', 22.2, -4, { room: 'study', kind: 'clockPassage', label: 'The grandfather clock', yaw: -Math.PI / 2 }),
  S('phone', 16, -7.2, { room: 'study', kind: 'phone', label: 'The study phone', yaw: Math.PI }),
  S('calendar', 13, -7.2, { room: 'study', kind: 'calendar', label: 'The diary (both calendars)', yaw: Math.PI }),
  S('trophies', 12, -9.2, { room: 'study', kind: 'thing', thing: 'trophies', label: 'The shelf of old things', yaw: Math.PI }),
  S('piano', 19, 8, { room: 'library', kind: 'thing', thing: 'piano', label: 'The piano', yaw: 0 }),
  S('newspaper', -16, -3.5, { room: 'dining', kind: 'newspaper', label: 'The morning paper', yaw: 0 }),
  S('kitchen', -16, 10, { room: 'kitchen', kind: 'alfred', label: 'Alfred', yaw: Math.PI }),
  S('hallFire', -7, 3, { room: 'hall', kind: 'thing', thing: 'fireplace', label: 'The hall fire', yaw: -Math.PI / 2 }),
  S('wardrobe', 21, -24, { room: 'bedroom', kind: 'wardrobe', label: 'The wardrobe', y: UP, yaw: -Math.PI / 2 }),
  S('bed', 14, -21.6, { room: 'bedroom', kind: 'bed', label: 'Bed (rest until morning)', y: UP, yaw: Math.PI }),
  S('portraitFather', -6, -26.6, { room: 'gallery', kind: 'thing', thing: 'portrait', label: 'A portrait', y: UP, yaw: Math.PI }),
  S('portraitMother', 0, -26.6, { room: 'gallery', kind: 'thing', thing: 'portrait', label: 'A portrait', y: UP, yaw: Math.PI }),
  S('car', -31, 4, { room: 'garage', kind: 'car', label: 'The car (drive into the city)', yaw: -Math.PI / 2 }),
  // Gala and scene marks.
  S('galaWindow', 7.4, 24, { room: 'ballroom', kind: 'mark', label: 'The tall windows', yaw: Math.PI / 2 }),
  S('galaBar', -6.6, 16.5, { room: 'ballroom', kind: 'mark', label: 'The bar', yaw: -Math.PI / 2 }),
  S('galaFloor', 0, 22, { room: 'ballroom', kind: 'mark', label: 'The dance floor', yaw: 0 }),
  S('galaService', -12.5, 30, { room: 'service', kind: 'mark', label: 'The service passage', yaw: -Math.PI / 2, r: 2 }),
  S('drawingSeat', 16, 20, { room: 'drawingRoom', kind: 'mark', label: 'Your chair', yaw: Math.PI / 2 }),
  S('drawingGuest', 19.5, 20, { room: 'drawingRoom', kind: 'mark', label: 'The guest chair', yaw: -Math.PI / 2 }),
]));

// Where each Bristol door site puts you inside (local; yaw: facing into the room).
export const MANOR_ENTRIES = Object.freeze({
  wayneManorFront: { x: 0, y: 0, z: -14.5, yaw: 0, room: 'vestibule' },
  wayneManorTerrace: { x: 23.5, y: 0, z: 22, yaw: -Math.PI / 2, room: 'drawingRoom' },
  wayneManorGarage: { x: -36, y: 0, z: 4, yaw: Math.PI / 2, room: 'garage' },
  wayneManorStudyWindow: { x: 20, y: 0, z: -1, yaw: Math.PI, room: 'study' },
  wayneManorClockPassage: { x: 20.5, y: 0, z: -4, yaw: -Math.PI / 2, room: 'study' },
});
// Walking into an exit's box takes you out to its city site (local box; site: regions/data.js).
export const MANOR_EXITS = Object.freeze([
  { id: 'front', site: 'wayneManorFront', x0: -1.4, x1: 1.4, z0: -16.6, z1: -15.6, label: 'Front door' },
  { id: 'terrace', site: 'wayneManorTerrace', x0: 24.4, x1: 25.6, z0: 20.6, z1: 23.4, label: 'Terrace doors' },
  { id: 'garage', site: 'wayneManorGarage', x0: -39.6, x1: -38.4, z0: 1, z1: 7, label: 'Garage door' },
]);
export const MANOR_SPAWN = MANOR_ENTRIES.wayneManorFront;

// ---- build ----
export function buildManor(ctx) {
  const R = MANOR_ROOMS;
  const q = ctx.quality ?? {};
  const rich = (q.crowdDensity ?? 1) >= 0.5; // Potato keeps the shells and the big pieces only

  // Shells. Sides: n = -z, s = +z, w = -x, e = +x. A wall two rooms share is built once (by the
  // room listed first below) and skipped by the other, so nothing is doubled or z-fights.
  shell(ctx, { ...R.hall, wall: PANEL, floor: 0x3a3632, doors: [
    { side: 'n', at: 0, w: 3, h: 3.6 }, { side: 'n', at: 0, w: 2.4, y0: UP, h: UP + 2.8 },
    { side: 'e', at: -4, w: 2.4 }, { side: 'e', at: 8, w: 2.4 }, { side: 'w', at: -3, w: 2.4 }, { side: 'w', at: 9, w: 2.4 },
    { side: 's', at: 0, w: 4.4, h: 3.8 },
  ] });
  shell(ctx, { ...R.vestibule, wall: PANEL, floor: 0x3a3632, doors: [{ side: 'n', at: 0, w: 2.6, h: 3.4 }], skip: ['s'] });
  shell(ctx, { ...R.study, wall: PANEL, doors: [{ side: 's', at: 16, w: 2.4 }], skip: ['w'] });
  shell(ctx, { ...R.library, wall: 0x4a3020, doors: [{ side: 's', at: 17, w: 2.4 }], skip: ['n', 'w'] });
  shell(ctx, { ...R.dining, wall: 0x5a2a26, doors: [{ side: 's', at: -16, w: 2.4 }], skip: ['e'] });
  shell(ctx, { ...R.kitchen, wall: 0x8a8270, floor: 0x5a5048, ceil: 0xb0a890, doors: [{ side: 'w', at: 9, w: 2.6 }], skip: ['n', 'e'] });
  shell(ctx, { ...R.garage, wall: 0x6a645a, floor: 0x3a3a3a, ceil: 0x8a8478, doors: [{ side: 'w', at: 4, w: 6, h: 3.8 }], skip: ['e'] });
  shell(ctx, { ...R.ballroom, wall: 0x6a5240, floor: 0x5a3a24, ceil: 0x9a8a70, doors: [{ side: 'w', at: 30, w: 2, h: 2.8 }, { side: 'e', at: 22, w: 2.6, h: 3.2 }, { side: 's', at: 0, w: 12, y0: 1.4, h: 7.8 }], skip: ['n'] });
  addBox(ctx, -6, 1.4, 35.8, 6, 7.8, 36.2, 'glass'); // the great window: glass, not a way out
  shell(ctx, { ...R.service, wall: 0x6a645a, floor: 0x4a4640, skip: ['e'] });
  shell(ctx, { ...R.drawingRoom, wall: 0x6a5a48, floor: WOOD_LIGHT, noCeil: true, doors: [{ side: 'e', at: 22, w: 2.4, h: 3 }], skip: ['w', 'n'] });
  filler(ctx, 'x', 14, 23.2, 25.2, 0, 6, 0x6a5a48);
  shell(ctx, { ...R.gallery, wall: 0x3a2a3a, floor: WOOD, doors: [{ side: 'e', at: -21, w: 2.2 }], skip: ['s'] });
  shell(ctx, { ...R.bedroom, wall: 0x2a3040, floor: WOOD, skip: ['w'] });
  // The drawing room's glass roof on iron ribs.
  add(ctx, 'glass', box(16, 0.05, 16, 17, 6.2, 22));
  for (let x = 9; x <= 25; x += 2) add(ctx, 'painted', box(0.1, 0.12, 16, x, 6.2, 22), 0x2a2a2a);
  addBox(ctx, 8.8, 6.1, 13.8, 25.2, 6.5, 30.2, 'ceiling');

  // ---- the great hall: a central staircase up to a landing across the north, a fire on the west ----
  stair(ctx, { axis: 'z', at: 0, from: 7, to: -5, y0: 0, y1: UP, w: 3, color: WOOD_DARK });
  block(ctx, -9, UP - 0.3, -10, 9, UP, -6.4, WOOD, { tag: 'floor' });
  block(ctx, -1.5, UP - 0.3, -6.4, 1.5, UP, -5, WOOD, { tag: 'floor' });
  // Balustrade along the landing's open edge (hip height, solid so nobody walks off it).
  for (const [a, b] of [[-9, -1.5], [1.5, 9]]) {
    block(ctx, a, UP, -6.55, b, UP + 1.0, -6.35, WOOD_DARK, { tag: 'balustrade' });
    for (let x = a + 0.3; x < b; x += 0.6) add(ctx, 'painted', cylinder(0.05, 0.05, 0.9, x, UP + 0.45, -6.45, 6), WOOD_LIGHT);
  }
  for (const s of [-1, 1]) block(ctx, s * 1.6 - 0.1, UP, -6.4, s * 1.6 + 0.1, UP + 1.0, -5, WOOD_DARK, { tag: 'balustrade' });
  fireplace(ctx, -8.6, 3, Math.PI / 2);
  add(ctx, 'painted', box(0.3, 4, 3.4, -8.75, 4.2, 3), STONE_W);
  for (const z of [-2, 6]) for (const x of [-5.5, 5.5]) { add(ctx, 'painted', cylinder(0.35, 0.4, 11, x, 5.5, z, 10), STONE_W); addBox(ctx, x - 0.4, 0, z - 0.4, x + 0.4, 11, z + 0.4, 'pillar'); }
  windowPane(ctx, 'z', 9, 1.5, 4.5, 2.4, 5.5, -1);
  windowPane(ctx, 'z', -9, -7, 6, 2, 4, 1);
  sofa(ctx, 7, 2, -Math.PI / 2, 2.4, { color: GREEN });
  // The vestibule: panelling, a lantern.
  add(ctx, 'glow', new THREE.SphereGeometry(0.25, 8, 6).translate(0, 4.2, -13), 0xffe0a0);
  ctx.spot(0, 3.8, -13, WARM, 8, 9);

  // ---- the study: desk, phone, diary, the shelf of old things, the grandfather clock ----
  fireplace(ctx, 12, 1.6, Math.PI);
  table(ctx, 14.5, -7.6, 3.2, 1.4, { color: WOOD_DARK });
  chair(ctx, 14.5, -8.8, 0);
  add(ctx, 'painted', box(0.25, 0.08, 0.2, 16, 0.84, -7.6), 0x1a1a1a); // the phone
  add(ctx, 'painted', box(0.4, 0.06, 0.3, 13, 0.82, -7.6), CREAM); // the diary
  add(ctx, 'glow', cylinder(0.12, 0.2, 0.25, 15.6, 0.95, -8, 8), 0xffd890); // desk lamp
  ctx.spot(15, 1.6, -7.5, WARM, 8, 8);
  // The shelf of old things: a tin car, a theatre ticket, a fencing medal, a cracked pocket watch.
  block(ctx, 10, 0, -9.95, 14, 2.2, -9.45, WOOD_DARK);
  add(ctx, 'painted', box(0.3, 0.12, 0.15, 10.8, 1.32, -9.6), 0xb83a2a);
  add(ctx, 'painted', box(0.2, 0.01, 0.28, 11.8, 1.27, -9.6), CREAM);
  add(ctx, 'painted', cylinder(0.08, 0.08, 0.02, 12.7, 1.4, -9.6, 12).rotateX(Math.PI / 2), BRASS);
  add(ctx, 'painted', cylinder(0.1, 0.1, 0.03, 13.4, 1.32, -9.6, 12).rotateX(Math.PI / 2), 0xd8d0b8);
  // The grandfather clock on the east wall: a tall case, a pale face, its hands stopped.
  block(ctx, 22.3, 0, -4.7, 22.9, 2.6, -3.3, WOOD_DARK);
  add(ctx, 'painted', cylinder(0.4, 0.4, 0.05, 22.25, 2.1, -4, 16).rotateZ(Math.PI / 2), CREAM);
  add(ctx, 'painted', box(0.02, 0.32, 0.03, 22.2, 2.2, -4), 0x111111);
  add(ctx, 'painted', box(0.02, 0.03, 0.24, 22.2, 2.1, -3.92), 0x111111);
  add(ctx, 'painted', new THREE.ConeGeometry(0.75, 0.5, 4).rotateY(Math.PI / 4).translate(22.6, 2.85, -4), WOOD_DARK);
  add(ctx, 'glow', box(0.04, 0.9, 0.5, 22.25, 1.2, -4), 0x3a2a14);
  windowPane(ctx, 'x', -10, 19, 1.2, 2.2, 3.4, 1);
  bookshelf(ctx, 22.7, -8, -Math.PI / 2, 3, 3, 0, 11);

  // ---- the library: shelves, the piano, reading chairs ----
  for (const x of [11.5, 14.6, 20.6]) bookshelf(ctx, x, 13.7, Math.PI, 3, 4.2, 0, Math.round(x * 7));
  bookshelf(ctx, 22.7, 6, -Math.PI / 2, 4, 4.2, 0, 31);
  // The piano: a grand, black, lid up.
  add(ctx, 'painted', box(3, 0.35, 2.4, 19, 0.875, 10), 0x0d0d10);
  add(ctx, 'painted', box(2.8, 0.06, 1.8, 19, 1.7, 10.3).rotateX(-0.5), 0x0d0d10);
  add(ctx, 'painted', box(1.4, 0.05, 0.25, 19, 0.95, 8.75), CREAM);
  for (const [lx, lz] of [[17.8, 9.1], [20.2, 9.1], [19, 11]]) add(ctx, 'painted', box(0.1, 0.7, 0.1, lx, 0.35, lz), 0x0d0d10);
  addBox(ctx, 17.5, 0, 8.8, 20.5, 1.05, 11.2, 'furniture');
  armchair(ctx, 12.5, 5, Math.PI * 0.25);
  armchair(ctx, 12.5, 9, Math.PI * 0.75, { color: RED });
  grandChandelier(ctx, 16, 4.6, 7, { r: 1.1, drop: 0.6, tiers: 1 });
  windowPane(ctx, 'z', 23, 3, 1.2, 2.2, 3.6, -1);

  // ---- the dining room: the long table, the morning paper, a fire ----
  table(ctx, -16, -3.5, 2, 9, { cloth: CREAM });
  if (rich) for (let z = -7; z <= 0; z += 1.4) { chair(ctx, -17.4, z, Math.PI / 2); chair(ctx, -14.6, z, -Math.PI / 2); }
  add(ctx, 'painted', box(0.5, 0.02, 0.36, -16, 0.8, -3.5), 0xe8e4d8); // the paper
  add(ctx, 'painted', cylinder(0.05, 0.04, 0.1, -15.6, 0.83, -3.0, 8), 0xf0f0f0); // the coffee cup
  fireplace(ctx, -22.6, -3.5, Math.PI / 2);
  grandChandelier(ctx, -16, 4.6, -3.5, { r: 1.2, drop: 0.6 });
  windowPane(ctx, 'x', -10, -16, 1.2, 2.4, 3.4, 1);

  // ---- the kitchen: a range, copper pans, the big table ----
  block(ctx, -22.9, 0, 4, -21.8, 0.95, 7.6, 0xb8b0a0);
  block(ctx, -22.9, 0, 10.6, -21.8, 0.95, 13.6, 0xb8b0a0);
  add(ctx, 'painted', box(1.1, 0.03, 2, -22.35, 0.97, 5.2), 0x2a2a2e); // the range top
  add(ctx, 'glow', box(0.6, 0.02, 1.4, -22.3, 0.99, 5.2), 0x7a2a10);
  for (let z = 4.4; z < 7.4; z += 0.7) add(ctx, 'painted', cylinder(0.18, 0.18, 0.06, -22.75, 2.2, z, 10).rotateZ(Math.PI / 2), 0xb8683a);
  table(ctx, -15.5, 8, 3, 1.4, { color: WOOD_LIGHT });
  add(ctx, 'glow', box(1.2, 0.1, 0.5, -15.5, 4.8, 9), 0xfff0d0);
  ctx.spot(-15.5, 3.8, 9, 0xffe8c0, 12, 12);

  // ---- the garage: the Wayne cars, a tool wall ----
  for (const [z, col] of [[-1, 0x1a1a1e], [10, 0x6a1a1a]]) {
    block(ctx, -34, 0.3, z - 1, -28, 1.3, z + 1, col, { tag: 'car' });
    add(ctx, 'painted', box(3, 0.6, 1.8, -31.3, 1.6, z), col);
    add(ctx, 'glow', box(2.8, 0.5, 1.7, -31.3, 1.62, z), 0x1a2434);
    for (const [wx, wz] of [[-33, -0.9], [-29, -0.9], [-33, 0.9], [-29, 0.9]]) add(ctx, 'painted', cylinder(0.35, 0.35, 0.25, wx, 0.35, z + wz, 10).rotateX(Math.PI / 2), 0x111111);
  }
  block(ctx, -38.6, 0, -5.6, -38.2, 2.6, -1, 0x4a4a4a);
  add(ctx, 'glow', box(6, 0.1, 0.5, -31, 4.8, 4), 0xf0f0e0);
  ctx.spot(-31, 4, 4, 0xf0f0e0, 10, 14);

  // ---- the ballroom: parquet, tall windows with the rain, the lake and the city through the south
  // window (where the signal shows), chandeliers, the bar, a band stand ----
  // [polish] Parquet: boards in staggered courses (two tones) inside a dark border band with a
  // brass inlay line, instead of a few big flat squares.
  for (let i = 0, x = -8.4; x < 8.39; i++, x += 0.6) for (let j = 0, z = 10.6 + (i % 2) * 0.9; z < 35.4; j++, z += 1.8) {
    const len = Math.min(1.8, 35.4 - z);
    if (len > 0.2) add(ctx, 'painted', box(0.58, 0.02, len - 0.04, x + 0.3, 0.035, z + len / 2), (i * 3 + j) % 4 ? 0x6a4a2c : 0x5e4028);
  }
  for (const [w, d, x, z] of [[17.6, 0.5, 0, 10.4], [17.6, 0.5, 0, 35.6], [0.5, 25.6, -8.6, 23], [0.5, 25.6, 8.6, 23]]) add(ctx, 'painted', box(w, 0.025, d, x, 0.04, z), 0x3a2416);
  for (const [w, d, x, z] of [[16.4, 0.06, 0, 10.75], [16.4, 0.06, 0, 35.25], [0.06, 24.5, -8.25, 23], [0.06, 24.5, 8.25, 23]]) add(ctx, 'painted', box(w, 0.03, d, x, 0.045, z), BRASS);
  for (let z = 13; z < 35; z += 5) { if (Math.abs(z - 22) > 2) windowPane(ctx, 'z', 9, z, 1.4, 2.6, 6.2, -1); if (Math.abs(z - 30) > 2) windowPane(ctx, 'z', -9, z, 1.4, 2.6, 6.2, 1); }
  // South: the great window over the lake (the sky behind it is a painted plane: see skyPlane).
  windowPane(ctx, 'x', 36, 0, 1.4, 12, 6.4, -1, { clear: true });
  block(ctx, -8.8, 0, 14.5, -7.6, 1.1, 18.5, WOOD_DARK); // the bar
  add(ctx, 'painted', box(1.3, 0.06, 4.1, -8.2, 1.13, 16.5), BRASS);
  block(ctx, -6, 0, 33.2, 6, 0.4, 35.8, WOOD_DARK, { tag: 'stage' }); // the band stand
  ctx.spot(0, 6, 22, WARM, 20, 26);

  // ---- the service passage: a plain corridor to the kitchens ----
  add(ctx, 'glow', box(0.8, 0.08, 0.3, -12, 3.9, 30), 0xf0f0e0);
  block(ctx, -14.9, 0, 27.4, -14.4, 2.2, 32.6, 0x8a8270);

  // ---- the drawing room: under glass, plants, the two chairs where guests are interviewed ----
  armchair(ctx, 16, 20, Math.PI / 2);
  armchair(ctx, 19.5, 20, -Math.PI / 2, { color: RED });
  table(ctx, 17.75, 20, 1, 1, { h: 0.5 });
  add(ctx, 'painted', cylinder(0.06, 0.05, 0.08, 17.6, 0.54, 20.1, 8), 0xf0f0f0); // the detective's tea
  for (const [x, z] of [[11, 15.5], [24, 15.5], [11, 28.5], [24, 28.5], [20, 28.8]]) {
    add(ctx, 'painted', cylinder(0.35, 0.28, 0.6, x, 0.3, z, 8), 0x8a4a2a);
    add(ctx, 'painted', new THREE.IcosahedronGeometry(0.75, 0).translate(x, 1.2, z), 0x2f5a2a);
    addBox(ctx, x - 0.4, 0, z - 0.4, x + 0.4, 1.2, z + 0.4, 'furniture');
  }
  for (const z of [16.5, 27]) windowPane(ctx, 'z', 25, z, 0.6, 2.4, 4.6, -1, { night: 0x101c28 });
  add(ctx, 'glow', box(0.08, 2.6, 2, 24.9, 1.4, 22), 0x2a2018); // the terrace doors
  ctx.spot(17, 3.5, 20, WARM, 10, 12);

  // ---- upstairs: the gallery (portraits) and the bedroom ----
  const kinds = ['father', 'mother', 'founder', 'children', 'house', 'hound'];
  [[-6, -27.7], [0, -27.7], [6, -27.7]].forEach(([x, z], i) => picture(ctx, x, UP + 2.6, z, 0, 2.2, 2.8, () => portraitTexture(kinds[i])));
  [[-8.7, -22, Math.PI / 2], [-8.7, -15, Math.PI / 2], [8.7, -14.5, -Math.PI / 2]].forEach(([x, z, yaw], i) => picture(ctx, x, UP + 2.4, z, yaw, 1.8, 2.3, () => portraitTexture(kinds[3 + i])));
  for (const z of [-24, -18, -12]) add(ctx, 'glow', box(0.6, 0.1, 0.25, 0, UP + 4.8, z), 0xffe8b8);
  ctx.spot(0, UP + 3.5, -20, WARM, 12, 14);
  // The bed (rest), a wardrobe (change), a window, a small fire.
  block(ctx, 12, UP, -27.6, 16, UP + 0.6, -22.6, 0x2a3048, { tag: 'bed' });
  add(ctx, 'painted', box(4, 0.25, 4.6, 14, UP + 0.72, -25.1), CREAM);
  add(ctx, 'painted', box(4.2, 1.6, 0.2, 14, UP + 0.8, -27.7), WOOD_DARK);
  block(ctx, 22.3, UP, -26.2, 22.95, UP + 2.6, -21.8, WOOD_DARK);
  add(ctx, 'painted', box(0.04, 2.3, 0.04, 22.28, UP + 1.3, -24), BRASS);
  windowPane(ctx, 'x', -14, 19, UP + 1, 2.4, 2.8, -1);
  fireplace(ctx, 19, -27.6, 0, UP, { w: 1.8 });
  ctx.spot(14, UP + 2.5, -22, 0xb8c8e0, 8, 10);

  // ---- [polish] the set dressing (./manorDressing.js) ----
  dressManor(ctx, R, rich);

  // ---- the painted night beyond the ballroom's great window (browser only) ----
  skyPlane(ctx);
}

// The view south over the lake: a painted plane outside the ballroom window. The runtime lights
// the signal on it (userData.setSignal) when a scene's 'batsignal' event fires.
function skyPlane(ctx) {
  if (!ctx.group || typeof document === 'undefined') return;
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const draw = (signal) => {
    const grd = g.createLinearGradient(0, 0, 0, 512); grd.addColorStop(0, '#0a0f1a'); grd.addColorStop(1, '#1c2a3a');
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
    // Clouds, the lake, the far city.
    g.fillStyle = 'rgba(70,84,104,0.5)';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse((i * 97) % 1024, 80 + (i * 37) % 120, 140, 30, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#0e1620'; g.fillRect(0, 380, 1024, 132);
    for (let x = 0; x < 1024; x += 18) { const h = 20 + ((x * 31) % 90); g.fillStyle = '#121a26'; g.fillRect(x, 380 - h, 16, h); g.fillStyle = 'rgba(255,200,120,0.6)'; if ((x / 18) % 3 === 0) g.fillRect(x + 5, 380 - h + 8, 3, 3); }
    g.strokeStyle = 'rgba(200,170,90,0.35)'; g.lineWidth = 2;
    for (let y = 395; y < 500; y += 9) { g.beginPath(); g.moveTo(200 + (y % 50), y); g.lineTo(260 + (y % 70), y); g.stroke(); }
    if (signal) {
      // The beam from the city and the shape on the low cloud, framed by the window.
      g.fillStyle = 'rgba(255,240,180,0.22)';
      g.beginPath(); g.moveTo(600, 380); g.lineTo(380, 250); g.lineTo(640, 250); g.fill();
      g.save(); g.translate(510, 262); g.scale(1.7, 1.7);
      g.fillStyle = 'rgba(255,236,170,0.95)'; g.beginPath(); g.ellipse(0, 0, 92, 46, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0b0b12';
      g.beginPath();
      g.moveTo(-80, -2); g.quadraticCurveTo(-36, -28, -18, -8); g.lineTo(-8, -22); g.lineTo(0, -10); g.lineTo(8, -22); g.lineTo(18, -8);
      g.quadraticCurveTo(36, -28, 80, -2); g.quadraticCurveTo(44, 8, 36, 28); g.quadraticCurveTo(18, 12, 0, 34); g.quadraticCurveTo(-18, 12, -36, 28); g.quadraticCurveTo(-44, 8, -80, -2);
      g.fill(); g.restore();
    }
  };
  draw(false);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(26, 13), new THREE.MeshBasicMaterial({ map: t, fog: false }));
  mesh.position.set(ctx.O.x, ctx.O.y + 6, ctx.O.z + 39);
  mesh.rotation.y = Math.PI;
  mesh.userData.setSignal = (on) => { draw(on); t.needsUpdate = true; };
  mesh.name = 'manorSky';
  ctx.add(mesh);
  ctx.extras.push(mesh);
}

// Silence unused-import lint in headless builds (text textures are the runtime's).
void textTexture; void glowBox; void wall; void STONE_D; void GREEN; void panelling; void chandelier; void rug; void armchair; void CREAM;
