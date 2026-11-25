// [polish] Wayne Manor's set dressing, room by room: raised panelling with rails and cornices,
// drapes at every tall window, sconces, lamps on side tables, rugs with borders and medallions,
// portraits, busts and consoles with flowers, seating grouped round the fires, the dining table
// laid, and the ballroom dressed for a gala (round tables, a buffet, a band stand with a grand
// piano, palms, coffers, and a stone balcony beyond the great window with the city behind it).
//
// Everything merges into the pocket's buckets (one draw per material for the whole pocket) and is
// lit by emissive glow, soft additive cards and halo sprites: no lights of its own, no per-frame
// work. `rich` is false on Potato (crowdDensity < 0.5): the shells, panelling, drapes, chandeliers,
// rugs and the big furniture stay; the small things (place settings, sconces, lamps, flowers,
// books on tables) go. LOCAL coordinates (pocket origin), like ./manor.js.
import * as THREE from 'three';
import { box, cylinder } from '../buckets.js';
import { add, addBox, block, armchair, sofa, picture, BRASS, WOOD, WOOD_DARK, WOOD_LIGHT, STONE_W, STONE_D, RED, GREEN, CREAM } from './pocketKit.js';
import {
  panelling, drapes, sconce, tableLamp, floorLamp, sideTable, rug, chandelier, flowers, candelabra, placeSetting,
  roundTable, banquetTable, coffers, bust, globe, palm, softGlow, lightPool,
} from './dressing.js';

const UP = 5.4;
const MARBLE_D = 0x2a2622, MARBLE_L = 0x7e766a;
const BURGUNDY = 0x5a1620, NAVY = 0x1e2a44, OLIVE = 0x3a4a2a, GOLD_DRAPE = 0x8a6a2a;

// A console table against a wall (yaw: facing the room), optionally with flowers and two lamps.
function consoleTable(ctx, x, z, yaw, { w = 1.8, y = 0, rich = true, seed = 3 } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const R = (g) => g.rotateY(yaw).translate(x, y, z);
  add(ctx, 'painted', R(box(w, 0.06, 0.5, 0, 0.86, 0)), WOOD_DARK);
  add(ctx, 'painted', R(box(w - 0.1, 0.12, 0.44, 0, 0.77, 0)), WOOD);
  for (const sx of [-1, 1]) add(ctx, 'painted', R(box(0.07, 0.72, 0.07, sx * (w / 2 - 0.1), 0.36, 0)), WOOD_DARK);
  add(ctx, 'painted', R(box(w - 0.3, 0.04, 0.36, 0, 0.14, 0)), WOOD_DARK);
  addBox(ctx, x - Math.abs(c) * w / 2 - Math.abs(s) * 0.25, y, z - Math.abs(s) * w / 2 - Math.abs(c) * 0.25, x + Math.abs(c) * w / 2 + Math.abs(s) * 0.25, y + 0.9, z + Math.abs(s) * w / 2 + Math.abs(c) * 0.25, 'furniture');
  if (!rich) return;
  flowers(ctx, x, y + 0.89, z, { s: 0.9, seed });
  for (const sx of [-1, 1]) tableLamp(ctx, x + c * sx * (w / 2 - 0.25), y + 0.89, z - s * sx * (w / 2 - 0.25), { h: 0.6 });
}

// A sideboard / buffet cabinet against a wall with doors and brass pulls.
function sideboard(ctx, x, z, yaw, { w = 2.4, y = 0, rich = true } = {}) {
  const R = (g) => g.rotateY(yaw).translate(x, y, z);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  add(ctx, 'painted', R(box(w, 0.9, 0.55, 0, 0.5, 0)), WOOD_DARK);
  add(ctx, 'painted', R(box(w + 0.08, 0.05, 0.6, 0, 0.97, 0)), WOOD);
  for (let k = 0; k < 4; k++) {
    const u = -w / 2 + w / 8 + (k * w) / 4;
    add(ctx, 'painted', R(box(w / 4 - 0.08, 0.66, 0.02, u, 0.46, 0.28)), WOOD);
    add(ctx, 'painted', R(box(0.04, 0.12, 0.03, u + (k % 2 ? -0.18 : 0.18), 0.5, 0.3)), BRASS);
  }
  addBox(ctx, x - Math.abs(c) * w / 2 - Math.abs(s) * 0.3, y, z - Math.abs(s) * w / 2 - Math.abs(c) * 0.3, x + Math.abs(c) * w / 2 + Math.abs(s) * 0.3, y + 1, z + Math.abs(s) * w / 2 + Math.abs(c) * 0.3, 'furniture');
  if (!rich) return;
  candelabra(ctx, x - c * w * 0.3, y + 1.0, z + s * w * 0.3, { yaw });
  candelabra(ctx, x + c * w * 0.3, y + 1.0, z - s * w * 0.3, { yaw });
  add(ctx, 'painted', R(cylinder(0.2, 0.18, 0.05, 0, 1.02, 0, 12)), 0xc8ccd4); // a silver salver
  add(ctx, 'painted', R(cylinder(0.06, 0.08, 0.28, 0.1, 1.17, -0.05, 8)), 0xc8ccd4); // a decanter
}

// A low coffee table with a stack of books and a bowl.
function coffeeTable(ctx, x, z, { w = 1.3, d = 0.7, y = 0, rich = true, yaw = 0 } = {}) {
  const R = (g) => g.rotateY(yaw).translate(x, y, z);
  add(ctx, 'painted', R(box(w, 0.06, d, 0, 0.44, 0)), WOOD_DARK);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(ctx, 'painted', R(box(0.06, 0.42, 0.06, sx * (w / 2 - 0.08), 0.21, sz * (d / 2 - 0.08))), WOOD_DARK);
  addBox(ctx, x - w / 2, y, z - w / 2, x + w / 2, y + 0.47, z + w / 2, 'furniture');
  if (!rich) return;
  for (let k = 0; k < 3; k++) add(ctx, 'painted', R(box(0.34 - k * 0.03, 0.05, 0.26, -0.3, 0.5 + k * 0.05, 0)), [RED, NAVY, CREAM][k]);
  add(ctx, 'painted', R(cylinder(0.16, 0.08, 0.08, 0.3, 0.51, 0, 10)), BRASS);
}

// A library ladder leaning on a shelf front (x, z at its foot; yaw: facing the shelf).
function ladder(ctx, x, z, yaw, h = 3.6) {
  const R = (g) => g.rotateX(-0.22).rotateY(yaw).translate(x, 0, z);
  for (const sx of [-0.22, 0.22]) add(ctx, 'painted', R(box(0.05, h, 0.06, sx, h / 2, 0)), WOOD_LIGHT);
  for (let y = 0.35; y < h - 0.2; y += 0.38) add(ctx, 'painted', R(box(0.44, 0.04, 0.06, 0, y, 0)), WOOD_LIGHT);
}

// Checkerboard marble over a rectangle (y: the floor), as long flat boxes.
function marble(ctx, x0, x1, z0, z1, step, y = 0) {
  for (let i = 0, x = x0; x < x1 - 0.01; i++, x += step) for (let j = 0, z = z0; z < z1 - 0.01; j++, z += step) {
    if ((i + j) % 2) add(ctx, 'painted', box(Math.min(step, x1 - x), 0.012, Math.min(step, z1 - z), x + Math.min(step, x1 - x) / 2, y + 0.028, z + Math.min(step, z1 - z) / 2), MARBLE_L);
  }
}

// The ballroom's grand piano on the band stand, keyboard facing -x (towards the pianist).
function grandPiano(ctx, x, y, z) {
  add(ctx, 'painted', box(1.5, 0.34, 2.1, x, y + 0.86, z), 0x0d0d10);
  add(ctx, 'painted', new THREE.CylinderGeometry(0.75, 0.75, 0.34, 16, 1, false, 0, Math.PI).rotateY(Math.PI / 2).translate(x, y + 0.86, z + 1.05), 0x0d0d10);
  add(ctx, 'painted', box(1.4, 0.04, 1.8, x, y + 1.42, z + 0.3).rotateX(0), 0x0d0d10);
  add(ctx, 'painted', box(0.04, 0.9, 1.7, x + 0.7, y + 1.45, z + 0.35), 0x0d0d10); // the lid, propped
  add(ctx, 'painted', box(0.18, 0.06, 1.3, x - 0.82, y + 0.95, z - 0.05), CREAM); // the keys
  for (let k = 0; k < 9; k++) add(ctx, 'painted', box(0.1, 0.03, 0.05, x - 0.86, y + 0.99, z - 0.6 + k * 0.15), 0x0d0d10);
  for (const [lx, lz] of [[-0.6, -0.9], [0.6, -0.9], [0, 1.4]]) add(ctx, 'painted', box(0.1, 0.7, 0.1, x + lx, y + 0.35, z + lz), 0x0d0d10);
  add(ctx, 'painted', box(0.5, 0.06, 0.9, x - 1.4, y + 0.5, z), 0x0d0d10); // the bench
  for (const [lx, lz] of [[-0.2, -0.4], [0.2, -0.4], [-0.2, 0.4], [0.2, 0.4]]) add(ctx, 'painted', box(0.05, 0.48, 0.05, x - 1.4 + lx, y + 0.24, z + lz), 0x0d0d10);
  candelabra(ctx, x + 0.2, y + 1.44, z - 0.6);
  addBox(ctx, x - 0.8, y, z - 1.1, x + 0.8, y + 1.1, z + 1.9, 'furniture');
}

// A music stand.
function musicStand(ctx, x, y, z, yaw) {
  const R = (g) => g.rotateY(yaw).translate(x, y, z);
  add(ctx, 'painted', R(cylinder(0.02, 0.02, 1.1, 0, 0.55, 0, 5)), 0x1a1a1a);
  add(ctx, 'painted', R(box(0.5, 0.36, 0.02, 0, 1.18, 0.04).rotateX(-0.35)), 0x1a1a1a);
  add(ctx, 'painted', R(box(0.42, 0.3, 0.01, 0, 1.2, 0.06).rotateX(-0.35)), 0xf0ece0);
  add(ctx, 'glow', R(box(0.3, 0.03, 0.06, 0, 1.42, 0.0)), 0xffe2a0); // the stand light
}

// A double bass standing on its end pin (a band member's), and a drum kit.
function doubleBass(ctx, x, y, z, yaw) {
  const R = (g) => g.rotateY(yaw).translate(x, y, z);
  add(ctx, 'painted', R(new THREE.SphereGeometry(0.36, 10, 8).scale(1, 1.25, 0.4).translate(0, 0.62, 0)), 0x6a2e12);
  add(ctx, 'painted', R(new THREE.SphereGeometry(0.28, 10, 8).scale(1, 1.1, 0.4).translate(0, 1.12, 0)), 0x6a2e12);
  add(ctx, 'painted', R(box(0.07, 0.8, 0.05, 0, 1.6, 0.02)), 0x1a1210);
  add(ctx, 'painted', R(box(0.1, 0.14, 0.08, 0, 2.02, 0)), 0x6a2e12);
}
function drumKit(ctx, x, y, z) {
  add(ctx, 'painted', cylinder(0.32, 0.32, 0.36, x, y + 0.32, z, 14).rotateX(0), 0xe8e0d0);
  add(ctx, 'painted', new THREE.CylinderGeometry(0.3, 0.3, 0.38, 14).rotateX(Math.PI / 2).translate(x, y + 0.32, z + 0.6), 0x8a1a22);
  for (const [dx, dz, r, h] of [[-0.55, 0.3, 0.2, 0.62], [0.55, 0.35, 0.22, 0.5]]) add(ctx, 'painted', cylinder(r, r, 0.2, x + dx, y + h, z + dz, 12), 0x8a1a22);
  for (const [dx, dz] of [[-0.8, -0.1], [0.75, -0.2]]) {
    add(ctx, 'painted', cylinder(0.015, 0.015, 1.0, x + dx, y + 0.5, z + dz, 4), 0x8a8a8a);
    add(ctx, 'painted', cylinder(0.3, 0.3, 0.015, x + dx, y + 1.0, z + dz, 14), 0xd8a840);
  }
}

// Wall sconces in a row along a wall (axis 'x': the wall along x at z = at; 'z': along z at
// x = at; `at` is the wall's centre line), at the positions in `list`. face: the room's side.
function sconceRow(ctx, axis, at, list, y, face) {
  const yaw = axis === 'x' ? (face > 0 ? 0 : Math.PI) : (face > 0 ? Math.PI / 2 : -Math.PI / 2);
  for (const s of list) {
    if (axis === 'x') sconce(ctx, s, y, at + face * 0.26, yaw);
    else sconce(ctx, at + face * 0.26, y, s, yaw);
  }
}

export function dressManor(ctx, R, rich) {
  // ---- the great hall ----
  panelling(ctx, R.hall, { dado: 1.6, doors: [
    { side: 'n', at: 0, w: 3, h: 3.6 }, { side: 'e', at: -4, w: 2.4 }, { side: 'e', at: 8, w: 2.4 },
    { side: 'w', at: -3, w: 2.4 }, { side: 'w', at: 9, w: 2.4 }, { side: 's', at: 0, w: 4.4, h: 3.8 },
  ] });
  marble(ctx, -8.6, 8.6, -9.6, 9.6, 1.2);
  rug(ctx, 0, 8.6, 5.6, 2.4, BURGUNDY, { medallion: 0xc8a050 });
  chandelier(ctx, 0, 8.4, 2, { r: 1.9, drop: 1.8 });
  drapes(ctx, 'z', 9, 1.5, 4.5, 2.4, 5.5, -1, BURGUNDY);
  drapes(ctx, 'z', -9, -7, 6, 2, 4, 1, BURGUNDY);
  // The seating by the fire: two wing chairs facing it across a lamp table.
  armchair(ctx, -5.0, 0.7, -Math.PI / 2 + 0.35, { color: RED });
  armchair(ctx, -5.0, 5.0, -Math.PI / 2 - 0.35, { color: OLIVE });
  sideTable(ctx, -4.6, 2.85, { lamp: rich });
  rug(ctx, -5.6, 2.85, 3.4, 5.2, NAVY, { yaw: Math.PI / 2 });
  picture(ctx, -8.55, 3.5, 3, Math.PI / 2, 1.5, 1.8, 'founder');
  // The sofa on the east side with lamp tables and a low table.
  sideTable(ctx, 7.2, -0.35, { lamp: rich });
  sideTable(ctx, 7.2, 4.35, { lamp: rich });
  coffeeTable(ctx, 5.4, 2, { rich, yaw: Math.PI / 2 });
  // Busts by the front door, consoles with flowers either side of the ballroom doors.
  bust(ctx, -2.7, -9.1);
  bust(ctx, 2.7, -9.1);
  consoleTable(ctx, -5.8, 9.45, Math.PI, { rich, seed: 5 });
  consoleTable(ctx, 5.8, 9.45, Math.PI, { rich, seed: 9 });
  // Paintings high on the side walls, and sconces between the doors.
  picture(ctx, 8.7, 7.6, -6.6, -Math.PI / 2, 2.4, 1.7, 'landscape');
  picture(ctx, -8.7, 7.4, 4.5, Math.PI / 2, 2.6, 1.8, 'ship');
  if (rich) {
    sconceRow(ctx, 'z', 9, [-1.6, 5.6], 2.7, -1);
    sconceRow(ctx, 'z', -9, [-5.6, 0.4, 5.8], 2.7, 1);
    sconceRow(ctx, 'x', -10, [-4.6, 4.6], 2.9, 1);
  }
  // The landing above: a long runner and two more sconces.
  rug(ctx, 0, -8.2, 15, 2.4, BURGUNDY, { y: UP });
  if (rich) sconceRow(ctx, 'x', -10, [-6.5, 6.5], UP + 2.3, 1);

  // ---- the vestibule ----
  panelling(ctx, R.vestibule, { dado: 1.3, skip: ['s'], doors: [{ side: 'n', at: 0, w: 2.6, h: 3.4 }] });
  marble(ctx, -2.6, 2.6, -15.6, -10.2, 0.9);
  if (rich) { palm(ctx, -2.2, -11, { s: 0.8 }); palm(ctx, 2.2, -11, { s: 0.8 }); }

  // ---- the study ----
  panelling(ctx, R.study, { dado: 1.3, skip: ['w'], doors: [{ side: 's', at: 16, w: 2.4 }] });
  drapes(ctx, 'x', -10, 19, 1.2, 2.2, 3.4, 1, OLIVE);
  rug(ctx, 14.2, -4.2, 5.6, 4.2, BURGUNDY);
  armchair(ctx, 10.9, -0.7, 0.35, { color: RED });
  armchair(ctx, 13.3, -0.7, -0.35, { color: RED });
  globe(ctx, 10.3, -6.2);
  picture(ctx, 12, 3.6, 1.72, Math.PI, 1.6, 1.2, 'landscape');
  if (rich) {
    sideTable(ctx, 12.1, -1.55, { lamp: true, r: 0.26 });
    tableLamp(ctx, 13.1, 0.8, -8.0, { shadeC: 0x7ac090 }); // the banker's lamp, green glass
    floorLamp(ctx, 21.7, 0.9);
    sconceRow(ctx, 'z', 23, [-1.2], 2.4, -1);
  }

  // ---- the library ----
  panelling(ctx, R.library, { dado: 0.9, skip: ['n', 'w'], doors: [{ side: 's', at: 17, w: 2.4 }] });
  rug(ctx, 15, 7, 5.4, 6.2, NAVY, { medallion: 0x8a6a2a });
  drapes(ctx, 'z', 23, 3, 1.2, 2.2, 3.6, -1, BURGUNDY);
  ladder(ctx, 14.6, 13.1, Math.PI);
  if (rich) {
    sideTable(ctx, 12.0, 7.0, { lamp: true });
    floorLamp(ctx, 22.1, 11.6);
    candelabra(ctx, 19.6, 1.06, 9.4);
    coffeeTable(ctx, 14.6, 7, { rich, yaw: 0 });
  }

  // ---- the dining room ----
  panelling(ctx, R.dining, { dado: 1.2, color: WOOD_DARK, skip: ['e'], doors: [{ side: 's', at: -16, w: 2.4 }] });
  drapes(ctx, 'x', -10, -16, 1.2, 2.4, 3.4, 1, BURGUNDY);
  rug(ctx, -16, -3.5, 4.6, 10.6, BURGUNDY, { medallion: 0x6a1a22 });
  sideboard(ctx, -20.6, -9.4, 0, { rich });
  sideboard(ctx, -11.4, -9.4, 0, { rich });
  picture(ctx, -22.72, 3.6, -3.5, Math.PI / 2, 1.6, 1.2, 'house');
  picture(ctx, -9.3, 2.9, -7.3, -Math.PI / 2, 1.4, 1.7, 'mother');
  if (rich) {
    for (let z = -7; z <= 0.1; z += 1.4) for (const sx of [-1, 1]) placeSetting(ctx, -16 + sx * 0.72, 0.8, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    candelabra(ctx, -16, 0.8, -6.3, { yaw: Math.PI / 2 });
    candelabra(ctx, -16, 0.8, -0.7, { yaw: Math.PI / 2 });
    flowers(ctx, -16, 0.8, -5.0, { s: 0.6, seed: 4 });
  }

  // ---- the kitchen and the garage: lit work surfaces, a rack of pans already there ----
  if (rich) {
    softGlow(ctx, -15.5, 4.4, 9, 2.2, 0x3a3020, { flat: false });
    lightPool(ctx, -15.5, 0, 8, 4, 3, 0x2a2418);
  }

  // ---- the ballroom (the gala) ----
  panelling(ctx, R.ballroom, { dado: 1.4, color: 0x4a3020, skip: ['n'], pilasters: 5, doors: [
    { side: 'w', at: 30, w: 2, h: 2.8 }, { side: 'e', at: 22, w: 2.6, h: 3.2 }, { side: 's', at: 0, w: 12, y0: 1.4, h: 7.8 },
  ] });
  coffers(ctx, R.ballroom, { step: 3.6, color: 0xd8ccb0 });
  for (const z of [17, 28]) chandelier(ctx, 0, 6.8, z, { r: 2.2, drop: 1.4 });
  for (let z = 13; z < 35; z += 5) {
    if (Math.abs(z - 22) > 2) drapes(ctx, 'z', 9, z, 1.4, 2.6, 6.2, -1, GOLD_DRAPE, { dw: 0.8 });
    if (Math.abs(z - 30) > 2) drapes(ctx, 'z', -9, z, 1.4, 2.6, 6.2, 1, GOLD_DRAPE, { dw: 0.8 });
  }
  drapes(ctx, 'x', 36, 0, 1.4, 12, 6.4, -1, BURGUNDY, { dw: 1.4 });
  // The band stand: a grand piano, a bass, the drums, music stands, palms either side.
  grandPiano(ctx, -3.2, 0.4, 34.0);
  doubleBass(ctx, 0.6, 0.4, 34.8, Math.PI);
  drumKit(ctx, 3.4, 0.4, 34.9);
  for (const x of [-0.6, 1.8]) musicStand(ctx, x, 0.4, 33.7, Math.PI);
  for (const sx of [-1, 1]) palm(ctx, sx * 7.4, 34.6, { s: 1.2 });
  add(ctx, 'painted', box(12.2, 0.1, 0.12, 0, 0.42, 33.15), BRASS); // the stand's brass nosing
  // The tables round the edge, the buffet on the east wall, flowers on pedestals.
  roundTable(ctx, -6.3, 13.1, { seats: rich ? 5 : 0, seed: 2, centre: 'flowers', skipSeats: [3] });
  roundTable(ctx, -6.3, 24.4, { seats: rich ? 6 : 0, seed: 5, centre: 'candles' });
  roundTable(ctx, 6.3, 30.2, { seats: rich ? 6 : 0, seed: 8, centre: 'flowers' });
  banquetTable(ctx, 8.0, 15.8, 6.4, { axis: 'z', w: 1.0, settings: 'buffet', seed: 11 });
  if (rich) {
    for (const [x, z] of [[-7.8, 20.6], [7.8, 26.4]]) { add(ctx, 'painted', cylinder(0.26, 0.3, 1.1, x, 0.55, z, 10), CREAM); flowers(ctx, x, 1.1, z, { s: 1.3, seed: Math.round(z) }); addBox(ctx, x - 0.3, 0, z - 0.3, x + 0.3, 1.1, z + 0.3, 'furniture'); }
    // The bar: bottles and glasses on the counter, a back shelf.
    for (let k = 0; k < 7; k++) add(ctx, 'painted', cylinder(0.045, 0.05, 0.32, -8.4, 1.32, 14.9 + k * 0.5, 8), [0x2a5a2a, 0x6a2a1a, 0xd8c890, 0x1a2a4a][k % 4]);
    for (let k = 0; k < 6; k++) add(ctx, 'painted', cylinder(0.035, 0.002, 0.09, -7.85, 1.21, 15.2 + k * 0.55, 6), 0xd8e4ec);
    sconceRow(ctx, 'z', 9, [15.5, 20.5, 25.5, 30.5], 3.4, -1);
    sconceRow(ctx, 'z', -9, [15.5, 20.5, 25.5, 32.5], 3.4, 1);
  }
  // The balcony beyond the great window: a stone floor and a balustrade, the city behind.
  add(ctx, 'painted', box(13, 0.3, 2.6, 0, 1.2, 37.4), STONE_W);
  add(ctx, 'painted', box(13, 0.18, 0.4, 0, 2.35, 38.5), STONE_W);
  add(ctx, 'painted', box(13, 0.14, 0.34, 0, 1.42, 38.5), STONE_D);
  for (let x = -6.2; x <= 6.21; x += 0.4) add(ctx, 'painted', new THREE.CylinderGeometry(0.07, 0.1, 0.8, 6).translate(x, 1.88, 38.5), STONE_W);
  for (const sx of [-1, 1]) { add(ctx, 'painted', box(0.5, 1.4, 0.5, sx * 6.5, 2.0, 38.5), STONE_W); flowers(ctx, sx * 6.5, 2.7, 38.5, { s: 0.9, urn: STONE_W, seed: 21 + sx }); }

  // ---- the drawing room ----
  rug(ctx, 17.75, 20, 6, 4.6, OLIVE, { medallion: 0xc8a050 });
  if (rich) { floorLamp(ctx, 14.4, 18.2); sideTable(ctx, 21.2, 18.4, { lamp: true }); }

  // ---- the portrait gallery and the bedroom ----
  panelling(ctx, R.gallery, { dado: 1.0, color: 0x2a1a2a, skip: ['s'], doors: [{ side: 'e', at: -21, w: 2.2 }] });
  rug(ctx, 0, -19, 3, 15, BURGUNDY, { y: UP });
  for (const x of [-7.6, 7.6]) bust(ctx, x, -27.2, { y: UP });
  if (rich) sconceRow(ctx, 'x', -28, [-3, 3], UP + 2.2, 1); // between the portraits
  panelling(ctx, R.bedroom, { dado: 1.1, color: 0x1a2030, skip: ['w'] });
  rug(ctx, 14, -23, 5, 4, NAVY, { y: UP });
  drapes(ctx, 'x', -14, 19, UP + 1, 2.4, 2.8, -1, NAVY);
  if (rich) {
    for (const x of [11.4, 16.6]) sideTable(ctx, x, -27, { y: UP, lamp: true, r: 0.28 });
    armchair(ctx, 18.6, -24.6, 0.4, { y: UP, color: NAVY });
  }
  void GREEN; void WOOD_LIGHT; void block; void sofa;
}
