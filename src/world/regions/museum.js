// The Museum Campus (workstream H2): where the park meets the harbour. The Gotham Museum of
// Natural History (a marble hall on a podium, a twelve-column portico, grand steps, banners, a
// dinosaur skeleton and a giant penny on the lawn), the octagonal Gotham Aquarium (with the cold
// plant a certain villain will want), the domed Planetarium on its own point into the harbour, and
// a marina of moored boats. Each museum has a door site and a walkable roof.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { box, cylinder } from '../buckets.js';
import { solid, glow, lightSpot } from '../cityBuilder.js';
import { addGargoyle } from '../gargoyles.js';
import { EAST, SHORE_X } from './eastLayout.js';
import { slab, railing, laneLine, tree, parkBench, globeLamp, neonWord, board, statue, STONE, DARK_STONE, IRON, BRASS } from './eastKit.js';
import { avenue, lawn, baseGround, path, grove, edgeGrapplesAt } from './lakefront.js';
import { promenade } from './lakeshoreDrive.js';

const MARBLE = 0xd6d2c6, MARBLE_DARK = 0xa8a398, AQUA = 0x2f6f8f;
const DRIVE_Z = EAST.museumDrive.z;
const SEAWALL = 205;

export function buildMuseum(ctx) {
  const Z0 = 80;
  baseGround(ctx, 240, Z0, SHORE_X, DRIVE_Z - 7);
  avenue(ctx, Z0, DRIVE_Z - 7, { x0: 240, entrances: [[88, 98], [140, 152]] });
  // The museum drive (the drive's south end, back west to the avenue) and the seawall walk.
  ctx.buckets.add('asphalt', new THREE.BoxGeometry(SHORE_X - 10 - 240, 0.2, 14).translate((240 + SHORE_X - 10) / 2, -0.1, DRIVE_Z));
  laneLine(ctx, [{ x: 240, z: DRIVE_Z }, { x: 345, z: DRIVE_Z }], 0, 0.02);
  slab(ctx, 'sidewalk', 240, 0, DRIVE_Z + 7, SHORE_X, 0.15, SEAWALL, { tag: 'sidewalk' });
  slab(ctx, 'concrete', 240, -3, SEAWALL - 0.5, 300, 0.15, SEAWALL, { tag: 'seawall' });
  railing(ctx, true, 240, 258, SEAWALL - 0.3, 0.15, { color: IRON });
  railing(ctx, true, 266, 300, SEAWALL - 0.3, 0.15, { color: IRON });
  for (let x = 250; x < SHORE_X; x += 22) globeLamp(ctx, x, 0.15, DRIVE_Z + 8.5, { spot: (x / 22) % 2 < 1 });
  promenade(ctx, Z0, DRIVE_Z - 7);
  // The drive's turn at the shore: a kerbed corner.
  slab(ctx, 'sidewalk', 356, 0, DRIVE_Z - 7, SHORE_X, 0.15, DRIVE_Z + 7, { tag: 'sidewalk' });
  railing(ctx, false, DRIVE_Z - 7, SEAWALL, SHORE_X - 0.5, 0.15, { color: IRON });
  lawn(ctx, 256, Z0, 334, DRIVE_Z - 7);

  naturalHistory(ctx, 294, 118);
  aquarium(ctx, 294, 162);
  planetariumPoint(ctx);
  marina(ctx);

  const paths = [
    path(ctx, [{ x: 256, z: 94 }, { x: 278, z: 94 }], { benches: false }),
    path(ctx, [{ x: 262, z: 140 }, { x: 326, z: 140 }]),
    path(ctx, [{ x: 294, z: 176 }, { x: 294, z: 183 }], { lamps: false, benches: false }),
  ];
  const keep = [{ minX: 258, maxX: 330, minZ: 84, maxZ: 136 }, { minX: 278, maxX: 310, minZ: 144, maxZ: 180 }];
  grove(ctx, 258, 142, 332, 181, 14, keep, paths.flat());
  for (let z = 104; z < 136; z += 8) { tree(ctx, 259, z, { kind: 'column' }); tree(ctx, 329, z, { kind: 'column' }); }
}

// ---- the Gotham Museum of Natural History ----

function naturalHistory(ctx, cx, cz) {
  const W = 64, D = 30, PODIUM = 3.4, H = 20;
  const x0 = cx - W / 2, z0 = cz - D / 2; // z0 is the north (front) face
  // Podium, main block, attic and cornice.
  slab(ctx, 'painted', x0, 0, z0, x0 + W, PODIUM, z0 + D, { color: MARBLE_DARK, tag: 'podium' });
  slab(ctx, 'painted', x0 + 2, PODIUM, z0 + 2, x0 + W - 2, H, z0 + D - 2, { color: MARBLE, tag: 'building' });
  ctx.buckets.add('painted', box(W - 2, 1.0, D - 2, cx, H + 0.2, cz), MARBLE_DARK);
  slab(ctx, 'painted', cx - 20, H, z0 + 6, cx + 20, H + 4, z0 + D - 6, { color: MARBLE, tag: 'attic' });
  ctx.facades.push({ minX: x0, minY: 0, minZ: z0, maxX: x0 + W, maxY: H, maxZ: z0 + D, style: 'stone' });
  // Blind niches along the walls (dark recesses) and a frieze band.
  for (let x = x0 + 5; x < x0 + W - 3; x += 5) for (const [z, n] of [[z0 + 1.98, -1], [z0 + D - 1.98, 1]]) ctx.buckets.add('painted', box(2, 7, 0.06, x, PODIUM + 6, z + n * 0.01), 0x6e6a62);
  ctx.buckets.add('painted', box(W - 3.6, 1.2, D - 3.6, cx, H - 2, cz), 0xc4bfb2);
  // Portico: twelve columns across the north face under a pediment, banners between the outer ones.
  const pz = z0 - 6;
  slab(ctx, 'painted', cx - 24, PODIUM - 0.2, pz, cx + 24, PODIUM, z0, { color: MARBLE_DARK, tag: 'portico' });
  for (let k = 0; k < 12; k++) {
    const x = cx - 22 + k * 4;
    solid(ctx, 'painted', cylinder(0.8, 0.9, 11, x, PODIUM + 5.5, pz + 1.2, 12), { color: MARBLE, tag: 'column' });
    ctx.buckets.add('painted', box(2, 0.5, 2, x, PODIUM + 11.2, pz + 1.2), MARBLE_DARK);
  }
  slab(ctx, 'painted', cx - 24, PODIUM + 11.4, pz, cx + 24, PODIUM + 13, z0 + 2, { color: MARBLE, tag: 'entablature' });
  const pediment = new THREE.Shape([new THREE.Vector2(-25, 0), new THREE.Vector2(25, 0), new THREE.Vector2(0, 6)]);
  ctx.buckets.add('painted', new THREE.ExtrudeGeometry(pediment, { depth: 8, bevelEnabled: false }).translate(cx, PODIUM + 13, pz), MARBLE);
  ctx.collision.addBox(cx - 18, PODIUM + 13, pz, cx + 18, PODIUM + 16, z0 + 2, 'roof');
  ctx.grapple.push({ x: cx, y: PODIUM + 19, z: pz + 4, nx: 0, nz: -1, perch: true });
  // Banners hanging between the outer columns.
  const banners = [['DINOSAURS', 0x7a2e2a], ['BONES!', 0x2f5a46], ['GEMS', 0x2c4a63], ['MUMMIES', 0x6a4a22]];
  banners.forEach(([text, col], k) => {
    const x = cx + (k < 2 ? -20 + k * 4 : 12 + (k - 2) * 4);
    ctx.buckets.add('painted', box(2.2, 6, 0.08, x, PODIUM + 6.5, pz + 0.2), col);
    neonWord(ctx, text, x, PODIUM + 7.2, pz + 0.12, 0, -1, { h: 0.7, color: 0xf0e2c4, back: false, spot: false, halo: 0.01 });
  });
  // Grand steps down to the lawn (0.15 m rise each over 0.7 m), the doors, lamps.
  const nSteps = 14;
  for (let k = 1; k <= nSteps; k++) slab(ctx, 'painted', cx - 16, 0, pz - (nSteps - k + 1) * 0.7, cx + 16, (PODIUM * k) / nSteps, pz - (nSteps - k) * 0.7 + 0.02, { color: MARBLE_DARK, tag: 'step' });
  ctx.buckets.add('painted', box(5, 6, 0.1, cx, PODIUM + 3, z0 + 1.96), 0x2a2420);
  glow(ctx, box(4.2, 1.6, 0.06, cx, PODIUM + 5.4, z0 + 1.9), PALETTE.window);
  ctx.halos.add(cx, PODIUM + 5.4, z0 + 1.4, PALETTE.window, 4);
  lightSpot(ctx, cx, PODIUM + 4, pz + 2, PALETTE.window, 26, 20);
  for (const s of [-1, 1]) {
    globeLamp(ctx, cx + s * 17.5, 0, pz - 9.5, { spot: false });
    // Floodlights washing the colonnade.
    ctx.halos.add(cx + s * 12, PODIUM + 0.6, pz - 1, PALETTE.windowCool, 6);
  }
  lightSpot(ctx, cx, 1, pz - 4, PALETTE.windowCool, 22, 22);
  board(ctx, 'NATURAL HISTORY', 'DINOSAURS: THEY WERE HERE FIRST', cx - 26, 2.4, pz - 9, 0, -1, { w: 5, bg: 0x7a2e2a, base: 0 });
  // Roof: a perch ring of urns and two gargoyles over the portico corners (pre-1940 masonry).
  edgeGrapplesAt(ctx, cx, cz, W - 4, D - 4, H, 8);
  for (const s of [-1, 1]) addGargoyle(ctx, cx + s * 23, PODIUM + 13, pz + 0.6, Math.PI);
  for (let x = x0 + 4; x < x0 + W - 2; x += 8) ctx.buckets.add('painted', cylinder(0.35, 0.25, 1.1, x, H + 1.25, z0 + 2.4, 8), MARBLE_DARK);
  ctx.roofs.push({ id: 'museumHall', x: cx, z: cz, w: W - 4, d: D - 4, y: H, district: 'museumCampus' });
  // On the lawn: a tyrant-lizard skeleton and a giant penny on edge (a wink for the Batcave).
  dinosaur(ctx, cx - 22, 87);
  pennyPlinth(ctx, cx + 22, 88);
}

function dinosaur(ctx, x, z) {
  const bone = 0xe8dfc6;
  solid(ctx, 'painted', box(14, 0.6, 4, x, 0.3, z), { color: DARK_STONE, tag: 'plinth' });
  const y = 0.6;
  // Spine: a curve of vertebrae from tail tip to skull.
  for (let k = 0; k < 22; k++) {
    const t = k / 21, sx = x - 6.5 + t * 13;
    const sy = y + 2.2 + Math.sin(t * Math.PI) * 2.6 + (t > 0.85 ? (t - 0.85) * 6 : 0) - (t < 0.15 ? (0.15 - t) * 6 : 0);
    ctx.buckets.add('painted', box(0.5, 0.45, 0.35, sx, sy, z), bone);
    if (t > 0.35 && t < 0.72) for (const s of [-1, 1]) ctx.buckets.add('painted', new THREE.TorusGeometry(1.2, 0.08, 3, 8, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI / 2).rotateZ(Math.PI).translate(sx, sy - 0.1, z + s * 0.02), bone);
  }
  // Skull with jaw, legs, little arms.
  ctx.buckets.add('painted', box(2.2, 1.1, 0.9, x + 7.4, y + 5.4, z), bone);
  ctx.buckets.add('painted', box(1.8, 0.35, 0.8, x + 7.3, y + 4.6, z).rotateZ(0), bone);
  for (const s of [-1, 1]) {
    ctx.buckets.add('painted', new THREE.BoxGeometry(0.4, 2.6, 0.4).rotateZ(0.25).translate(x + 0.6, y + 3.2, z + s * 0.7), bone);
    ctx.buckets.add('painted', new THREE.BoxGeometry(0.35, 2.4, 0.35).rotateZ(-0.3).translate(x + 1.0, y + 1.2, z + s * 0.7), bone);
    ctx.buckets.add('painted', box(1.2, 0.25, 0.5, x + 1.5, y + 0.15, z + s * 0.7), bone);
    ctx.buckets.add('painted', new THREE.BoxGeometry(0.15, 0.8, 0.15).rotateZ(0.9).translate(x + 5.4, y + 4.2, z + s * 0.4), bone);
  }
  ctx.collision.addBox(x - 6.5, y, z - 1, x + 8.5, y + 6, z + 1, 'skeleton');
  ctx.grapple.push({ x: x + 2, y: y + 6, z, nx: 0, nz: -1, perch: true });
  board(ctx, 'MEET GERTRUDE', 'SHE DOES NOT BITE. ANY MORE.', x - 8, 1.6, z - 2.2, 0, -1, { w: 2.6, bg: 0x7a2e2a, base: 0.6 });
  ctx.halos.add(x, 1.5, z - 3, PALETTE.windowCool, 4);
}

function pennyPlinth(ctx, x, z) {
  solid(ctx, 'painted', box(3, 1.6, 2, x, 0.8, z), { color: DARK_STONE, tag: 'plinth' });
  ctx.buckets.add('painted', new THREE.CylinderGeometry(3.25, 3.25, 0.3, 28).rotateX(Math.PI / 2).translate(x, 4.8, z), 0x8a5028);
  ctx.buckets.add('painted', new THREE.CylinderGeometry(2.4, 2.4, 0.5, 20).rotateX(Math.PI / 2).translate(x, 4.8, z), 0xc47a44);
  ctx.collision.addBox(x - 3.2, 1.6, z - 0.3, x + 3.2, 8, z + 0.3, 'penny');
  ctx.grapple.push({ x, y: 8, z, nx: 0, nz: -1, perch: true });
  board(ctx, 'ONE CENT', 'ON LOAN FROM AN ANONYMOUS DONOR', x + 4.5, 1.6, z - 1.2, 0, -1, { w: 2.6, bg: 0x6a4a22, base: 0 });
  ctx.halos.add(x, 2, z - 2, PALETTE.window, 4);
}

// ---- the Gotham Aquarium: an octagonal drum under a green dome ----

function aquarium(ctx, cx, cz) {
  const R = 14, H = 12;
  const oct = (r, h, y, col, key = 'painted') => ctx.buckets.add(key, new THREE.CylinderGeometry(r, r, h, 8).rotateY(Math.PI / 8).translate(cx, y + h / 2, cz), col);
  oct(R + 1, 1.2, 0, MARBLE_DARK);
  oct(R, H, 1.2, MARBLE);
  oct(R + 0.6, 1, H + 1.2, MARBLE_DARK);
  for (const [hx, hz] of [[0.92, 0.38], [0.38, 0.92], [0.66, 0.66]]) ctx.collision.addBox(cx - R * hx, 0, cz - R * hz, cx + R * hx, H + 2.2, cz + R * hz, 'building');
  ctx.facades.push({ minX: cx - R, minY: 0, minZ: cz - R, maxX: cx + R, maxY: H + 2, maxZ: cz + R, style: 'stone' });
  // Tall aquarium-blue windows on each face.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const r = R * Math.cos(Math.PI / 8) + 0.03;
    glow(ctx, new THREE.BoxGeometry(3.2, 6, 0.08).rotateY(-a + Math.PI / 2).translate(cx + Math.cos(a) * r, 6.5, cz + Math.sin(a) * r), k === 6 ? 0x2a2420 : AQUA);
    ctx.halos.add(cx + Math.cos(a) * (r + 0.5), 6.5, cz + Math.sin(a) * (r + 0.5), 0x4fb6d8, 3);
  }
  // Dome, lantern, and a bronze fish weathervane.
  ctx.buckets.add('painted', new THREE.SphereGeometry(R - 1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(cx, H + 2.2, cz), 0x3f7a6a);
  ctx.collision.addBox(cx - 8, H + 2.2, cz - 8, cx + 8, H + 6.5, cz + 8, 'roof');
  solid(ctx, 'painted', cylinder(1.4, 1.6, 2.2, cx, H + 8.1, cz, 8), { color: MARBLE, tag: 'roof' });
  ctx.buckets.add('painted', new THREE.IcosahedronGeometry(0.8, 0).scale(1.8, 0.8, 0.4).translate(cx, H + 10.4, cz), BRASS);
  ctx.grapple.push({ x: cx, y: H + 9.2, z: cz, nx: 0, nz: -1, perch: true });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; ctx.grapple.push({ x: cx + Math.cos(a) * (R - 0.4), y: H + 2.2, z: cz + Math.sin(a) * (R - 0.4), nx: Math.cos(a), nz: Math.sin(a) }); }
  // Entrance on the north face: steps, a door, the name.
  const fz = cz - R * Math.cos(Math.PI / 8);
  for (let k = 1; k <= 3; k++) slab(ctx, 'painted', cx - 4, 0, fz - (4 - k) * 0.7, cx + 4, k * 0.4, fz, { color: MARBLE_DARK, tag: 'step' });
  ctx.buckets.add('painted', box(3.4, 4.4, 0.1, cx, 3.4, fz - 0.04), 0x15222c);
  neonWord(ctx, 'GOTHAM AQUARIUM', cx, H - 0.5, fz - 0.1, 0, -1, { h: 1.2, color: 0x6fd6ff, back: false, halo: 5 });
  board(ctx, 'SEE THE FISH', 'THAT SEE YOU', cx + 9, 1.8, fz - 2, 0, -1, { w: 2.6, bg: AQUA, base: 0 });
  // The cold plant on the east side: frosted tanks, pipes into the wall, a steady breath of steam.
  const px = cx + R + 3;
  for (let k = 0; k < 3; k++) {
    solid(ctx, 'painted', cylinder(1.2, 1.2, 4, px, 2, cz - 4 + k * 4, 12), { color: 0xcfe6ee, tag: 'tank' });
    ctx.buckets.add('painted', box(3, 0.3, 0.3, px - 1.6, 3.5, cz - 4 + k * 4), 0x9fb8c4);
    ctx.steam.push({ x: px, y: 4.2, z: cz - 4 + k * 4, s: 0.9 });
  }
  ctx.halos.add(px + 1.5, 3, cz, 0x9fe8ff, 3);
  board(ctx, 'COLD PLANT', 'AUTHORISED PERSONNEL. NO GENIUSES.', px + 2, 1.8, cz + 7, 1, 0, { w: 2.6, bg: 0x2c4a63, base: 0 });
  lightSpot(ctx, cx, 3, fz - 4, 0x6fd6ff, 22, 18);
}

// ---- Planetarium Point: a promontory into the harbour with the domed planetarium ----

function planetariumPoint(ctx) {
  const X0 = 300, X1 = SHORE_X, Z0 = SEAWALL, Z1 = 290, cx = 336, cz = 258;
  slab(ctx, 'concrete', X0, -3, Z0, X1, 0, Z1, { tag: 'point', uv: [6, 6] });
  slab(ctx, 'sidewalk', X0, 0, Z0, X1, 0.15, Z1, { tag: 'sidewalk' });
  // Revetment and railings on the three water sides.
  for (const [a, b, at, alongX] of [[X0, X1, Z1 - 0.4, true], [Z0, Z1, X0 + 0.4, false], [Z0 - 12, Z1, X1 - 0.4, false]]) railing(ctx, alongX, a, b, at, 0.15, { color: IRON });
  ctx.buckets.add('concrete', new THREE.BoxGeometry(X1 - X0 + 6, 1.6, 4).translate((X0 + X1) / 2, -1.3, Z1 + 2));
  ctx.buckets.add('concrete', new THREE.BoxGeometry(4, 1.6, Z1 - Z0).translate(X0 - 2, -1.3, (Z0 + Z1) / 2));
  // Drum and dome.
  const R = 15, H = 8;
  ctx.buckets.add('painted', new THREE.CylinderGeometry(R, R + 0.5, H, 24).translate(cx, 0.15 + H / 2, cz), 0x8e96a3);
  for (const [hx, hz] of [[0.72, 0.72], [1, 0.5], [0.5, 1]]) ctx.collision.addBox(cx - R * hx, 0.15, cz - R * hz, cx + R * hx, H + 0.15, cz + R * hz, 'building');
  ctx.facades.push({ minX: cx - R, minY: 0, minZ: cz - R, maxX: cx + R, maxY: H, maxZ: cz + R, style: 'concrete' });
  ctx.buckets.add('painted', cylinder(R + 0.6, R + 0.6, 0.6, cx, H + 0.45, cz, 24), 0x6e7684);
  ctx.buckets.add('painted', new THREE.SphereGeometry(R - 1.2, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1).translate(cx, H + 0.75, cz), 0x4f6f7a);
  ctx.collision.addBox(cx - 9, H + 0.75, cz - 9, cx + 9, H + 6.5, cz + 9, 'roof');
  ctx.collision.addBox(cx - 4, H + 6.5, cz - 4, cx + 4, 17.4, cz + 4, 'roof');
  ctx.grapple.push({ x: cx, y: 17.4, z: cz, nx: 0, nz: -1, perch: true });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; ctx.grapple.push({ x: cx + Math.cos(a) * R, y: H + 0.75, z: cz + Math.sin(a) * R, nx: Math.cos(a), nz: Math.sin(a) }); }
  // The zodiac band: twelve lit plaques round the drum.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    glow(ctx, new THREE.BoxGeometry(1.4, 1.4, 0.08).rotateY(-a + Math.PI / 2).translate(cx + Math.cos(a) * (R + 0.08), 5.4, cz + Math.sin(a) * (R + 0.08)), k % 2 ? 0xe8c070 : 0x9fb8e0);
  }
  // Entrance (north) and the joke.
  ctx.buckets.add('painted', box(4, 4, 0.1, cx, 2.15, cz - R - 0.02), 0x1a1c22);
  neonWord(ctx, 'PLANETARIUM', cx, H - 1, cz - R - 0.2, 0, -1, { h: 1.1, color: 0xe8c070, back: false, halo: 4 });
  board(ctx, 'THE SKY TONIGHT', 'OVERCAST. AS ALWAYS.', cx - 12, 2, cz - R - 4, 0, -1, { w: 3.6, bg: 0x2c3a52, base: 0.15 });
  // A sundial plaza and benches facing the skyline across the harbour.
  ctx.buckets.add('painted', cylinder(2.5, 2.5, 0.3, 312, 0.3, 222, 16), STONE);
  ctx.buckets.add('painted', new THREE.BoxGeometry(0.15, 1.8, 2).rotateZ(-0.6).translate(312, 1.2, 222), BRASS);
  for (let x = 306; x < 360; x += 9) parkBench(ctx, x, 0.15, Z1 - 2, 0, 1);
  for (let x = 308; x < 362; x += 18) globeLamp(ctx, x, 0.15, Z1 - 3.5, { spot: x % 36 < 18 });
  lightSpot(ctx, cx, 2, cz - R - 3, 0xe8c070, 20, 16);
  statue(ctx, 312, 236, Math.PI, { kind: 'figure', y: 0.15, bronze: 0x5a6a7a });
}

// ---- the marina: floating docks, finger piers, moored boats, a harbourmaster's hut ----

function marina(ctx) {
  const y = 0.2;
  slab(ctx, 'wood', 258, -0.4, SEAWALL, 266, y, 214, { tag: 'gangway', uv: [2, 2] });
  slab(ctx, 'wood', 244, -0.4, 214, 298, y, 217, { tag: 'dock', uv: [2, 2] });
  const colours = [0xe6e0d6, 0x2f4a6e, 0x7a3a2e, 0xd8d0b8, 0x3f5e45, 0x1e2026];
  for (let x = 248, k = 0; x < 298; x += 10, k++) {
    slab(ctx, 'wood', x - 1, -0.4, 217, x + 1, y, 246, { tag: 'dock', uv: [2, 2] });
    for (let z = 222; z < 246; z += 8) ctx.buckets.add('painted', cylinder(0.12, 0.12, 0.5, x + 0.9, y + 0.25, z, 6), DARK_STONE);
    if (k % 3 !== 2) cruiser(ctx, x + 4.4, 232 + (k % 2) * 4, colours[k % colours.length], ctx.rng);
    if (k % 2 === 0) cruiser(ctx, x - 4.4, 236 - (k % 3) * 3, colours[(k + 3) % colours.length], ctx.rng);
    glow(ctx, box(0.25, 0.25, 0.25, x, y + 1.1, 246), PALETTE.window);
    ctx.halos.add(x, y + 1.1, 246, PALETTE.window, 1.6);
    solid(ctx, 'painted', cylinder(0.06, 0.06, 1, x, y + 0.5, 246, 6), { color: IRON, tag: 'prop' });
  }
  railing(ctx, true, 244, 298, 214.2, y, { color: IRON });
  // Harbourmaster's hut on the seawall walk.
  solid(ctx, 'painted', box(6, 3.2, 4, 248, 1.75, 201), { color: 0x6e675e, tag: 'building' });
  ctx.buckets.add('roof', new THREE.CylinderGeometry(0.01, 4, 1.6, 4).rotateY(Math.PI / 4).scale(1.1, 1, 0.75).translate(248, 4.15, 201));
  ctx.collision.addBox(245, 3.35, 199.5, 251, 4.2, 202.5, 'roof');
  glow(ctx, box(2, 1, 0.06, 248, 2.2, 203.03), PALETTE.window);
  board(ctx, 'MARINA', 'SLIPS FOR RENT. NO QUESTIONS. SOME ANSWERS.', 254, 1.9, 203.2, 0, 1, { w: 3, bg: PALETTE.containerBlue, base: 0.15 });
  ctx.grapple.push({ x: 248, y: 4.2, z: 201, nx: 0, nz: 1, perch: true });
  lightSpot(ctx, 262, 3, 214, PALETTE.window, 18, 16);
}

// A low-poly cabin cruiser moored at the waterline (merged into the chunk: it does not move).
function cruiser(ctx, x, z, col, rng) {
  const L = rng.range(7, 10), Wd = 2.6;
  const wl = -0.6;
  const hull = new THREE.CylinderGeometry(Wd / 2, Wd / 2 * 0.6, L, 8, 1).rotateX(Math.PI / 2).scale(1, 0.55, 1);
  ctx.buckets.add('painted', hull.translate(x, wl + 0.45, z), col);
  ctx.buckets.add('painted', new THREE.ConeGeometry(Wd / 2, 2.2, 8).rotateX(-Math.PI / 2).scale(1, 0.55, 1).translate(x, wl + 0.45, z - L / 2 - 1.05), col);
  ctx.buckets.add('painted', box(Wd * 0.75, 1.1, L * 0.4, x, wl + 1.3, z + L * 0.08), 0xe8e4da);
  ctx.buckets.add('glass', box(Wd * 0.7, 0.45, L * 0.38, x, wl + 1.45, z + L * 0.08));
  ctx.collision.addBox(x - Wd / 2, wl - 0.4, z - L / 2 - 2, x + Wd / 2, wl + 1.0, z + L / 2, 'boat');
  ctx.collision.addBox(x - Wd * 0.38, wl + 1.0, z - L * 0.12, x + Wd * 0.38, wl + 1.85, z + L * 0.28, 'boat');
  if (rng.chance(0.4)) { glow(ctx, box(0.2, 0.2, 0.2, x, wl + 2.0, z), PALETTE.window); ctx.halos.add(x, wl + 2.1, z, PALETTE.window, 1.4); }
}
