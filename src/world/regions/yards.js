// The Yards (workstream H3): the industrial south-west between Chinatown and the harbour.
// Merged yards instead of blocks: the stockyards behind their stone gate (pens, a cattle catwalk,
// sheds), the steel works (a blast furnace and stoves glowing orange through emissive geometry and
// halos, never point lights), a row of grain elevators on the South Branch with a gallery out over
// the river, the rail yard (six tracks, boxcars to fight between and run along, a roundhouse round
// a turntable, signal gantries), a junkyard with a car crusher, the cold-storage plant (later
// someone's frozen headquarters) and a power substation. The freight viaduct comes down a ramp
// out of the stockyards into the rail yard.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { box, cylinder, tiledBox } from '../buckets.js';
import { solid, glow, lightSpot, building, edgeGrapples, streetLamp, sawtoothRoof } from '../cityBuilder.js';
import { trashBags } from '../streetDressing.js';
import { addLadder } from '../climbables.js';
import { WEST, RECTS, LANDMARKS as L } from './westLayout.js';
import { slab, railing, ground, paveStreets, block, kerb, around, signPlane, lampAt, chainFence, dumpster } from './westKit.js';
import { viaductSegment } from './parkRow.js';

const ORANGE = 0xff7a2a;
const RUSTS = [0x7a3e22, 0x6a4a32, 0x5a3a2a, 0x7a5a3a, 0x3a4a5a, 0x8a5a2a];
export const YARDS = {
  stockyards: { minX: -566, maxX: -467, minZ: -23, maxZ: 83 },
  steelworks: { minX: -453, maxX: -377, minZ: -23, maxZ: 83 },
  silos: { minX: -363, maxX: -317, minZ: -23, maxZ: 83 },
  railWest: { minX: -566, maxX: -467, minZ: 97, maxZ: 190 },
  railEast: { minX: -453, maxX: -377, minZ: 97, maxZ: 190 },
  cold: { minX: -363, maxX: -317, minZ: 97, maxZ: 143 },
  substation: { minX: -363, maxX: -317, minZ: 157, maxZ: 190 },
};
export const TRACKS_Z = [104, 112, 120, 128, 136, 144];

export function buildYards(ctx) {
  const R = RECTS.yards;
  ground(ctx, R);
  const zCross = [-30, 90, 150, 197].map((z) => [z - 7, z + 7]);
  for (const [a, b] of around(-23, 204, zCross)) slab(ctx, 'sidewalk', -303, 0, a, -300, 0.15, b, { tag: 'sidewalk' });
  // Seawall along the harbour, a lamp every 30 m.
  slab(ctx, 'concrete', R.minX, -1.4, 203.5, R.maxX, 0.3, 205, { tag: 'seawall' });
  railing(ctx, true, R.minX, R.maxX, 204.6, 0.3);
  for (let x = -565; x < -305; x += 30) streetLamp(ctx, x, 203, 0, -1);
  for (const [key, r] of Object.entries(YARDS)) {
    const rail = key.startsWith('rail');
    if (rail) {
      slab(ctx, 'yard', r.minX, 0, r.minZ, r.maxX, 0.12, r.maxZ, { tag: 'gravel', uv: [8, 8] });
      for (const [x, z, nx, nz] of [[r.minX + 1, r.minZ + 1, -1, 0], [r.maxX - 1, r.minZ + 1, 1, 0], [r.minX + 1, r.maxZ - 1, -1, 0], [r.maxX - 1, r.maxZ - 1, 1, 0]]) streetLamp(ctx, x, z, nx, nz);
    } else block(ctx, r, { lampEvery: 40 });
  }
  paveStreets(ctx, R);
  // Level crossings where the -460 street crosses the tracks: rails across the road, gate posts.
  for (const z of TRACKS_Z) for (const s of [-0.72, 0.72]) ctx.buckets.add('painted', box(14, 0.06, 0.1, -460, 0.03, z + s), 0x6e6a62);
  for (const [z, s] of [[100, -1], [148, 1]]) crossingSignal(ctx, -452, z, s);
  stockyards(ctx);
  steelworks(ctx);
  grainElevators(ctx);
  railYard(ctx);
  junkyard(ctx);
  coldStorage(ctx);
  substation(ctx);
  // The viaduct from Park Row comes down a ramp in the stockyards to the 90 street.
  viaductSegment(ctx, R.minZ, 40, { startStop: false });
  viaductRamp(ctx, 40, 82);
}

// A crossing signal: a post with two red lamps that alternate, a crossbuck.
function crossingSignal(ctx, x, z, s) {
  solid(ctx, 'steel', cylinder(0.1, 0.12, 4, x, 2, z, 6), { tag: 'prop' });
  for (const r of [-0.6, 0.6]) ctx.buckets.add('painted', box(0.08, 0.3, 1.8, 0, 0, 0).rotateX(r).translate(x, 3.7, z), 0xe8e2d4);
  const a = ctx.halos.add(x, 3.0, z - 0.4 * s, PALETTE.crimson, 1.6);
  const b = ctx.halos.add(x, 3.0, z + 0.4 * s, PALETTE.crimson, 1.6);
  ctx.updaters.push((t) => { const on = Math.floor(t * 1.5) % 2; ctx.halos.setSize(a, on ? 1.6 : 0.01); ctx.halos.setSize(b, on ? 0.01 : 1.6); });
}

// ---- the stockyards ----
function stockyards(ctx) {
  const { rng } = ctx;
  const S = YARDS.stockyards;
  const y0 = 0.15;
  const V = L.viaduct.corridor;
  // Perimeter wall (brick, 2.4 m) with the gate opening at x -520 and a gap at the east end.
  const wallH = 2.4;
  const wall = (x0, z0, x1, z1) => solid(ctx, 'painted', box(Math.max(0.5, x1 - x0), wallH, Math.max(0.5, z1 - z0), (x0 + x1) / 2, y0 + wallH / 2, (z0 + z1) / 2), { color: 0x6e3a2c, tag: 'wall' });
  for (const [a, b] of around(S.minX + 3, S.maxX - 3, [[L.yardsGate.x - 3, L.yardsGate.x + 3], [V.minX, V.maxX], [S.maxX - 12, S.maxX - 6]])) wall(a, S.minZ + 3, b, S.minZ + 3.5);
  for (const [a, b] of around(S.minX + 3, S.maxX - 3, [[V.minX, V.maxX], [-500, -494]])) wall(a, S.maxZ - 3.5, b, S.maxZ - 3);
  wall(S.minX + 3, S.minZ + 3, S.minX + 3.5, S.maxZ - 3);
  for (const [a, b] of around(S.minZ + 3, S.maxZ - 3, [[28, 36]])) wall(S.maxX - 3.5, a, S.maxX - 3, b);
  yardsGate(ctx);
  // Pens: 9 x 9 m cells of 1.3 m timber fences in two banks either side of a central driveway
  // (z 30), leaving the viaduct corridor clear.
  const penFence = (x0, z0, x1, z1) => {
    const ax = Math.abs(z1 - z0) < 0.01;
    const len = ax ? x1 - x0 : z1 - z0;
    for (const h of [0.55, 1.15]) ctx.buckets.add('wood', ax ? box(len, 0.12, 0.08, (x0 + x1) / 2, y0 + h, z0) : box(0.08, 0.12, len, x0, y0 + h, (z0 + z1) / 2));
    for (let t = 0; t <= len + 0.01; t += 3) ctx.buckets.add('wood', ax ? box(0.14, 1.3, 0.14, x0 + t, y0 + 0.65, z0) : box(0.14, 1.3, 0.14, x0, y0 + 0.65, z0 + t));
    ctx.collision.addBox(ax ? x0 : x0 - 0.08, y0, ax ? z0 - 0.08 : z0, ax ? x1 : x0 + 0.08, y0 + 1.3, ax ? z0 + 0.08 : z1, 'pen');
  };
  const banks = [[S.minZ + 6, 15], [35, 62]]; // (the sheds stand south of the second bank)
  const xRuns = around(S.minX + 6, S.maxX - 14, [[V.minX - 1, V.maxX + 1]]);
  for (const [za, zb] of banks) {
    for (const [xa, xb] of xRuns) {
      for (let x = xa; x + 9 <= xb + 0.01; x += 9) {
        for (let z = za; z + 9 <= zb + 0.01; z += 9) {
          penFence(x, z, x + 9, z);
          penFence(x, z, x, z + 9 - (rng.chance(0.4) ? 3 : 0));
          if (rng.chance(0.3)) solid(ctx, 'wood', box(2.4, 0.6, 0.8, x + 4.5, y0 + 0.3, z + 4.5), { tag: 'trough' });
          if (rng.chance(0.15)) trashBags(ctx, x + 2, z + 2);
        }
        penFence(Math.floor((xb - xa) / 9) * 9 + xa, za, Math.floor((xb - xa) / 9) * 9 + xa, zb);
      }
    }
  }
  // The cattle catwalk: a timber walkway 4.5 m up over the pens along z 20, stairs at both ends.
  const cy = 4.5;
  for (const [xa, xb] of xRuns) {
    slab(ctx, 'wood', xa, y0 + cy - 0.2, 18.8, xb, y0 + cy, 21.2, { tag: 'catwalk' });
    for (let x = xa + 1; x < xb; x += 6) for (const z of [18.9, 21.1]) solid(ctx, 'wood', box(0.2, cy - 0.2, 0.2, x, y0 + (cy - 0.2) / 2, z), { tag: 'post' });
    for (const z of [18.75, 21.25]) ctx.buckets.add('wood', box(xb - xa, 0.08, 0.08, (xa + xb) / 2, y0 + cy + 1.05, z));
    edgeGrapples(ctx, (xa + xb) / 2, 20, xb - xa, 2.4, y0 + cy, 8);
    // stairs down at the east end
    for (let k = 0; k < 12; k++) slab(ctx, 'wood', xb + k * 0.5, y0, 18.8, xb + (k + 1) * 0.5, y0 + cy - k * (cy / 12), 21.2, { tag: 'step' });
  }
  // Sheds along the north wall and the old livestock exchange by the gate.
  building(ctx, { id: 'pensShedW', x: -560 + 0.5, z: 52, w: 7, d: 40, h: 6, style: 'warehouse', roof: 'flat', parapet: false, cornice: false, storefront: false, tiers: [], props: 'none', neon: [], district: 'yards' });
  for (const [sx, sz] of [[-530, 72], [-500, 72]]) building(ctx, { id: `pensShed${sx}`, x: sx, z: sz, w: 20, d: 8, h: 5.5, style: 'warehouse', roof: 'flat', parapet: false, cornice: false, storefront: false, tiers: [], props: 'none', neon: [], district: 'yards' });
  floodMast(ctx, -480, 45);
  building(ctx, { id: 'livestockExchange', x: -475, z: 2, w: 8, d: 16, h: 10.2, style: 'brick', roof: 'flat', parapet: true, cornice: true, storefront: false, tiers: [], props: 'auto', neon: [], district: 'yards' });
  signPlane(ctx, 'LIVESTOCK EXCHANGE', 0xcdbb8a, -479.1, 8.2, 2, -1, 0, 0.6, { back: false });
  for (let k = 0; k < 6; k++) dumpster(ctx, rng.range(S.minX + 8, S.maxX - 16), rng.pick([S.minZ + 5, S.maxZ - 5]), true);
}

// The Yards Gate: two limestone piers and an arch (5 m clear, 10 m overall) with a carved bull's
// head over it, one horn broken off. Its top is a perch; the piers are climbable by their quoins.
function yardsGate(ctx) {
  const G = L.yardsGate;
  const x = G.x, z = G.z, stone = 0xb8ae96;
  for (const s of [-1, 1]) {
    solid(ctx, 'painted', box(3.2, 8, 3, x + s * 4.1, 4.15, z), { color: stone, tag: 'gate' });
    ctx.buckets.add('painted', box(3.6, 0.4, 3.4, x + s * 4.1, 8.3, z), 0x9a907a);
    for (let y = 1; y < 8; y += 1.4) ctx.buckets.add('painted', box(3.3, 0.5, 0.06, x + s * 4.1, y, z - 1.53), 0x9a907a);
    addLadder(ctx.climbables, { x: x + s * 4.1, z: z - 1.62, nx: 0, nz: -1, bottom: 0, top: 10.15 });
  }
  // Arch and attic.
  solid(ctx, 'painted', box(5, 2, 3, x, 6.15 + 1, z), { color: stone, tag: 'gate' });
  ctx.buckets.add('painted', new THREE.CylinderGeometry(2.5, 2.5, 3.02, 12, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(x, 5.15, z), 0x14151a);
  solid(ctx, 'painted', box(11.4, 2, 3.2, x, 9.15, z), { color: stone, tag: 'gate' });
  ctx.buckets.add('painted', box(12, 0.3, 3.6, x, 10.3, z), 0x9a907a);
  // The bull: head, snout, ears, one whole horn and one broken stump.
  const hz = z - 1.9, hy = 7.4;
  ctx.buckets.add('painted', box(1.6, 1.8, 1.2, x, hy, hz), 0x8c8270);
  ctx.buckets.add('painted', box(1.1, 0.8, 0.9, x, hy - 0.9, hz - 0.5), 0x8c8270);
  for (const s of [-1, 1]) ctx.buckets.add('painted', box(0.5, 0.25, 0.4, x + s * 1.05, hy + 0.5, hz), 0x8c8270);
  ctx.buckets.add('painted', new THREE.ConeGeometry(0.22, 1.6, 6).rotateZ(-1.1).translate(x + 1.4, hy + 1.2, hz), 0xd8ceb6);
  ctx.buckets.add('painted', new THREE.CylinderGeometry(0.18, 0.22, 0.4, 6).rotateZ(1.1).translate(x - 1.0, hy + 0.95, hz), 0xd8ceb6);
  ctx.grapple.push({ x, y: 10.45, z, nx: 0, nz: -1, perch: true });
  edgeGrapples(ctx, x, z, 11.4, 3.2, 10.45, 4);
  signPlane(ctx, 'UNION YARDS', 0xd8ceb6, x, 9.15, z - 1.65, 0, -1, 0.7, { back: false });
  for (const s of [-1, 1]) lampAt(ctx, x + s * 6.6, 0.15, z - 2.2, 0, -1, PALETTE.sodium, { pole: 5 });
  ctx.facades.push({ minX: x - 5.7, minY: 0, minZ: z - 1.6, maxX: x + 5.7, maxY: 10.3, maxZ: z + 1.6, style: 'stone' });
}

// ---- the steel works ----
function steelworks(ctx) {
  const F = L.furnace, S = YARDS.steelworks;
  const y0 = 0.15;
  const x = F.x, z = F.z;
  // Blast furnace: hearth, tapered shaft, top platform, bustle pipe glowing at the tuyeres.
  solid(ctx, 'painted', cylinder(6.5, 7, 10, x, y0 + 5, z, 16), { color: 0x3a3532, tag: 'furnace' });
  solid(ctx, 'painted', cylinder(4, 6, 20, x, y0 + 20, z, 16), { color: 0x4a3a30, tag: 'furnace' });
  solid(ctx, 'painted', cylinder(5.5, 5.5, 1, x, y0 + 30.5, z, 16), { color: 0x2a2724, tag: 'furnaceTop' });
  solid(ctx, 'painted', cylinder(2.6, 3.4, 6, x, y0 + 34, z, 12), { color: 0x3a3532, tag: 'furnace' });
  ctx.buckets.add('painted', new THREE.TorusGeometry(7.6, 0.7, 6, 20).rotateX(Math.PI / 2).translate(x, y0 + 10.6, z), 0x2a2724);
  glow(ctx, new THREE.TorusGeometry(6.8, 0.25, 4, 24).rotateX(Math.PI / 2).translate(x, y0 + 9.8, z), ORANGE);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    ctx.buckets.add('painted', cylinder(0.7, 0.7, 26, 0, 0, 0, 8).rotateZ(0.12).rotateY(a).translate(x + Math.cos(a) * 3.2, y0 + 40, z + Math.sin(a) * 3.2), 0x2f2a26);
  }
  for (const [hx, hy, hz, s] of [[x, y0 + 9.8, z + 7, 10], [x - 7, y0 + 9.8, z, 9], [x, y0 + 31, z, 7], [x + 2, y0 + 1.2, z + 12, 12]]) ctx.halos.add(hx, hy, hz, ORANGE, s);
  lightSpot(ctx, x, y0 + 4, z + 12, ORANGE, 30, 22);
  // Platforms ringing the shaft at 10.6 and 30.5 m with grapple points; a skip incline up to the top.
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    ctx.grapple.push({ x: x + Math.cos(ang) * 5.5, y: y0 + 31, z: z + Math.sin(ang) * 5.5, nx: Math.cos(ang), nz: Math.sin(ang) });
  }
  const incl = { x0: S.minX + 6, y0: y0, x1: x - 5.5, y1: y0 + 31 };
  const len = Math.hypot(incl.x1 - incl.x0, incl.y1 - incl.y0), ang = Math.atan2(incl.y1 - incl.y0, incl.x1 - incl.x0);
  ctx.buckets.add('painted', box(len, 0.8, 2.4, 0, 0, 0).rotateZ(ang).translate((incl.x0 + incl.x1) / 2, (incl.y0 + incl.y1) / 2, z - 8), 0x3a3f48);
  for (let k = 1; k < 5; k++) {
    const t = k / 5;
    const px = incl.x0 + (incl.x1 - incl.x0) * t, py = incl.y0 + (incl.y1 - incl.y0) * t;
    solid(ctx, 'painted', box(0.5, py, 0.5, px, py / 2, z - 8), { color: 0x3a3f48, tag: 'trestle' });
  }
  addLadder(ctx.climbables, { x: x + 7.1, z, nx: 1, nz: 0, bottom: y0, top: y0 + 10.4 });
  addLadder(ctx.climbables, { x: x + 5.6, z: z + 2, nx: 1, nz: 0, bottom: y0 + 10.6, top: y0 + 31 });
  for (let k = 0.4; k < 31; k += 0.6) ctx.buckets.add('steel', box(0.05, 0.05, 0.5, x + (k < 10.4 ? 7.12 : 5.62), y0 + k, z + (k < 10.4 ? 0 : 2)));
  slab(ctx, 'steel', x - 9.5, y0 + 10.2, z - 9.5, x + 9.5, y0 + 10.6, z - 7.5, { tag: 'platform' });
  // Three hot-blast stoves in a row, tall domed cylinders.
  for (let k = 0; k < 3; k++) {
    const sx = S.minX + 12 + k * 10, sz = S.maxZ - 14;
    solid(ctx, 'painted', cylinder(3.6, 3.6, 26, sx, y0 + 13, sz, 14), { color: 0x4a4440, tag: 'stove' });
    ctx.buckets.add('painted', new THREE.SphereGeometry(3.6, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(sx, y0 + 26, sz), 0x3a3532);
    ctx.grapple.push({ x: sx, y: y0 + 26 + 0.1, z: sz, nx: 0, nz: 1, perch: true });
    ctx.collision.addBox(sx - 2.4, y0 + 26, sz - 2.4, sx + 2.4, y0 + 28.6, sz + 2.4, 'stove');
    ctx.facades.push({ minX: sx - 3.6, minY: 0, minZ: sz - 3.6, maxX: sx + 3.6, maxY: 29, maxZ: sz + 3.6, style: 'factory' });
  }
  ctx.buckets.add('painted', box(32, 1.6, 1.6, S.minX + 22, y0 + 18, S.maxZ - 14), 0x2f2a26); // hot-blast main
  // Two stacks with blinking tops.
  for (const [sx, sz] of [[S.maxX - 8, S.minZ + 8], [S.maxX - 8, S.minZ + 18]]) {
    solid(ctx, 'painted', cylinder(1.6, 2.4, 48, sx, y0 + 24, sz, 12), { color: 0x5a3a2a, tag: 'stack' });
    for (const h of [20, 36, 46]) ctx.buckets.add('painted', cylinder(2.5 - h * 0.017, 2.5 - h * 0.017, 0.8, sx, y0 + h, sz, 12), 0xd8d0c0);
    const i = ctx.halos.add(sx, y0 + 49, sz, PALETTE.crimson, 3);
    ctx.blinkers.push({ i, size: 3, phase: sz });
    ctx.steam.push({ x: sx, y: y0 + 48.5, z: sz, s: 1.6 });
    ctx.facades.push({ minX: sx - 2, minY: 0, minZ: sz - 2, maxX: sx + 2, maxY: 48, maxZ: sz + 2, style: 'factory' });
  }
  // The cast house: a long shed with a sawtooth roof, its open door glowing with the pour.
  const cast = { id: 'castHouse', x: x + 4, z: S.minZ + 10, w: 30, d: 14, h: 12, style: 'factory', roof: 'sawtooth', parapet: false, cornice: false, storefront: false, tiers: [], props: 'industrial', neon: [], district: 'yards' };
  building(ctx, cast);
  glow(ctx, box(8, 6, 0.1, cast.x, y0 + 3, cast.z + cast.d / 2 + 0.06), 0xff8a3a);
  ctx.halos.add(cast.x, y0 + 3, cast.z + cast.d / 2 + 1.5, ORANGE, 14);
  // Slag pit: a sunken glowing plane with steam, a rail for ladle cars.
  glow(ctx, new THREE.PlaneGeometry(10, 6).rotateX(-Math.PI / 2).translate(x - 12, y0 + 0.04, z + 14), 0xd8501a);
  for (const s of [-1, 1]) solid(ctx, 'concrete', box(10.6, 0.8, 0.4, x - 12, y0 + 0.4, z + 14 + s * 3.2), { tag: 'pitWall' });
  ctx.halos.add(x - 12, y0 + 1, z + 14, ORANGE, 16);
  for (let k = 0; k < 3; k++) ctx.steam.push({ x: x - 16 + k * 4, y: y0 + 0.3, z: z + 14, s: 1.4 });
  signPlane(ctx, 'GOTHAM STEEL & IRON', 0xff9a4a, S.maxX - 0.5, 9, S.minZ + 30, 1, 0, 1.2);
  ctx.facades.push({ minX: x - 6.5, minY: 0, minZ: z - 6.5, maxX: x + 6.5, maxY: 37, maxZ: z + 6.5, style: 'factory' });
}

// ---- grain elevators ----
function grainElevators(ctx) {
  const S = L.silos;
  const y0 = 0.15;
  const cxm = (S.minX + S.maxX) / 2;
  const rows = [cxm - S.r - 0.1, cxm + S.r + 0.1]; // two tangent rows
  const zs = [];
  for (let z = S.minZ + S.r; z <= S.maxZ - S.r + 0.01; z += S.r * 2 + 0.2) zs.push(z);
  for (const x of rows) {
    for (const z of zs) {
      const g = cylinder(S.r, S.r, S.h, x, y0 + S.h / 2, z, 16);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 4);
      ctx.buckets.add('concrete', g);
      // Collision: a square plus a cross inscribed in the circle (round towers, see corncobs()).
      for (const [hx, hz] of [[0.72, 0.72], [1, 0.45], [0.45, 1]]) ctx.collision.addBox(x - S.r * hx, y0, z - S.r * hz, x + S.r * hx, y0 + S.h, z + S.r * hz, 'silo');
      ctx.buckets.add('painted', cylinder(S.r + 0.12, S.r + 0.12, 0.5, x, y0 + S.h - 0.25, z, 16, true), 0x8c877d);
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2;
        ctx.grapple.push({ x: x + Math.cos(ang) * S.r * 0.95, y: y0 + S.h, z: z + Math.sin(ang) * S.r * 0.95, nx: Math.cos(ang), nz: Math.sin(ang) });
      }
    }
    ctx.facades.push({ minX: x - S.r, minY: 0, minZ: S.minZ, maxX: x + S.r, maxY: S.h, maxZ: S.maxZ, style: 'concrete' });
  }
  // Interstitial fill between the rows (walkable top), the gallery on top, the headhouse.
  slab(ctx, 'concrete', rows[0], y0, S.minZ + S.r, rows[1], y0 + S.h, S.maxZ - S.r, { tag: 'silo', uv: [6, 6] });
  const top = y0 + S.h;
  const hh = { id: 'headhouse', x: cxm, z: 30, w: 2 * (S.r * 2 + 0.2) + 1, d: 18, h: 8, style: 'concrete' };
  slab(ctx, 'concrete', hh.x - hh.w / 2, top, hh.z - hh.d / 2, hh.x + hh.w / 2, top + hh.h, hh.z + hh.d / 2, { tag: 'headhouse', uv: [6, 6] });
  ctx.buckets.add('facade_concrete', tiledBox(hh.w, hh.h, hh.d, hh.x, top + hh.h / 2, hh.z, { uvScale: [32, 54.4], faces: [0, 1, 4, 5] }));
  edgeGrapples(ctx, hh.x, hh.z, hh.w, hh.d, top + hh.h, 6);
  ctx.roofs.push({ id: 'headhouse', x: hh.x, z: hh.z, w: hh.w, d: hh.d, y: top + hh.h, district: 'yards' });
  ctx.facades.push({ minX: hh.x - hh.w / 2, minY: top, minZ: hh.z - hh.d / 2, maxX: hh.x + hh.w / 2, maxY: top + hh.h, maxZ: hh.z + hh.d / 2, style: 'concrete' });
  for (const s of [-1, 1]) slab(ctx, 'painted', hh.x - 3, top, hh.z + s * (hh.d / 2) + (s < 0 ? -24 : 0), hh.x + 3, top + 3, hh.z + s * (hh.d / 2) + (s < 0 ? 0 : 24), { tag: 'gallery', color: 0x8a8070 });
  signPlane(ctx, 'GOTHAM GRAIN CO-OP', 0xe8d8a8, S.maxX + 0.05, top + 4, hh.z, 1, 0, 2.2, { back: false });
  const i = ctx.halos.add(hh.x, top + hh.h + 1.5, hh.z, PALETTE.crimson, 4);
  ctx.blinkers.push({ i, size: 4, phase: 2.2 });
  // The river gallery: a conveyor bridge from the headhouse over the riverside drive to a spout
  // hanging over the South Branch, on one trestle.
  const gy = 24;
  slab(ctx, 'painted', S.maxX, gy, hh.z - 1.6, -294, gy + 2.8, hh.z + 1.6, { tag: 'gallery', color: 0x8a8070 });
  solid(ctx, 'painted', box(0.8, gy, 0.8, S.maxX + 2, gy / 2, hh.z), { color: 0x5a5650, tag: 'trestle' });
  ctx.buckets.add('painted', cylinder(0.5, 0.3, 14, -295, gy - 7, hh.z, 8).rotateZ(0), 0x5a5650);
  edgeGrapples(ctx, (S.maxX - 294) / 2, hh.z, -294 - S.maxX, 3.2, gy + 2.8, 6);
  addLadder(ctx.climbables, { x: S.maxX + 2.45, z: hh.z, nx: 1, nz: 0, bottom: 0, top: gy });
  for (let k = 0.4; k < gy; k += 0.6) ctx.buckets.add('steel', box(0.05, 0.05, 0.5, S.maxX + 2.47, k, hh.z));
  // A ladder cage up the end silo to the top.
  const ex = rows[1] + S.r + 0.05, ez = zs[0];
  addLadder(ctx.climbables, { x: ex, z: ez, nx: 1, nz: 0, bottom: 0, top: top });
  for (let k = 0.4; k < S.h; k += 0.6) ctx.buckets.add('steel', box(0.05, 0.05, 0.5, ex + 0.02, k, ez));
  for (let k = 2; k < S.h; k += 1.2) ctx.buckets.add('steel', new THREE.TorusGeometry(0.45, 0.03, 3, 8, Math.PI).rotateY(-Math.PI / 2).translate(ex + 0.2, k, ez));
}

// ---- rail yard ----
function railYard(ctx) {
  const { rng } = ctx;
  const W = YARDS.railWest, E = YARDS.railEast;
  const y = 0.12;
  const x0 = W.minX + 4, x1 = E.maxX;
  for (const z of TRACKS_Z) {
    for (const [a, b] of around(x0, x1, [[-467, -453]])) {
      for (const s of [-0.72, 0.72]) ctx.buckets.add('painted', box(b - a, 0.16, 0.1, (a + b) / 2, y + 0.2, z + s), 0x6e6a62);
      for (let x = a + 0.4; x < b; x += 1.2) ctx.buckets.add('wood', new THREE.PlaneGeometry(0.24, 2.5).rotateX(-Math.PI / 2).translate(x, y + 0.06, z));
    }
  }
  // Boxcars (walkable roofs, ladders on their ends), tank cars and flats on four of the tracks.
  const cars = [];
  for (const [ti, from, to] of [[1, -560, -470], [2, -450, -380], [4, -545, -475], [4, -440, -392], [5, -500, -470]]) {
    let x = from;
    while (x + 15 <= to) {
      const kind = rng.next();
      const z = TRACKS_Z[ti];
      if (kind < 0.65) boxcar(ctx, x + 7.5, z, rng.pick(RUSTS));
      else if (kind < 0.85) tankCar(ctx, x + 7.5, z);
      else flatCar(ctx, x + 7.5, z);
      cars.push({ x: x + 7.5, z });
      x += 15 + rng.range(1.2, 6);
    }
  }
  // Signal gantries over the tracks (perches), with red and green lamps.
  for (const gx of [-470, -390]) {
    const z0 = TRACKS_Z[0] - 5, z1 = TRACKS_Z[TRACKS_Z.length - 1] + 5;
    for (const z of [z0, z1]) solid(ctx, 'steel', box(0.5, 8, 0.5, gx, 4, z), { tag: 'gantry' });
    solid(ctx, 'painted', box(1.2, 0.8, z1 - z0, gx, 8.2, (z0 + z1) / 2), { color: 0x2f3a36, tag: 'gantry' });
    edgeGrapples(ctx, gx, (z0 + z1) / 2, 1.2, z1 - z0, 8.6, 5);
    for (const z of TRACKS_Z) ctx.halos.add(gx + 0.7, 7.4, z, rng.chance(0.6) ? PALETTE.crimson : 0x5fe08a, 1.4);
    addLadder(ctx.climbables, { x: gx + 0.31, z: z0, nx: 1, nz: 0, bottom: 0, top: 7.8 });
  }
  roundhouse(ctx, -540, 168);
  void cars;
  // The freight house along the harbour road, and floodlight masts over the tracks.
  building(ctx, { id: 'freightHouse', x: -492, z: 175, w: 44, d: 20, h: 8.5, style: 'warehouse', roof: 'sawtooth', parapet: false, cornice: false, storefront: false, tiers: [], props: 'none', neon: [], district: 'yards' });
  slab(ctx, 'concrete', -514, 0.12, 163.5, -470, 1.2, 165, { tag: 'dock' });
  signPlane(ctx, 'BRANCH LINE FREIGHT', 0xcdbb8a, -492, 6.6, 164.9, 0, -1, 0.8, { back: false });
  for (const [fx, fz] of [[-500, 100], [-420, 150], [-560, 120], [-400, 100]]) floodMast(ctx, fx, fz);
}

// A floodlight mast: a lattice pole with a bank of lamps (emissive + halo + a pooled light spot),
// a ladder and a perch on the lamp platform.
function floodMast(ctx, x, z, h = 16) {
  solid(ctx, 'steel', box(0.6, h, 0.6, x, h / 2, z), { tag: 'mast' });
  for (let y = 2; y < h; y += 2.4) ctx.buckets.add('steel', box(0.9, 0.06, 0.9, x, y, z));
  slab(ctx, 'steel', x - 1.6, h, z - 1.2, x + 1.6, h + 0.2, z + 1.2, { tag: 'platform' });
  for (let k = -1; k <= 1; k++) glow(ctx, box(0.8, 0.6, 0.2, x + k * 1, h + 0.9, z + 1.1), 0xf0e0b0);
  ctx.halos.add(x, h + 0.9, z + 1.5, 0xf0e0b0, 9);
  lightSpot(ctx, x, h - 1, z + 4, 0xf0e0b0, 28, 30);
  ctx.buckets.add('pool', new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2).translate(x, 0.2, z + 8), 0x4a4028);
  addLadder(ctx.climbables, { x: x + 0.31, z, nx: 1, nz: 0, bottom: 0, top: h });
  ctx.grapple.push({ x, y: h + 0.2, z, nx: 0, nz: 1, perch: true });
}

function boxcar(ctx, x, z, color) {
  const L2 = 14.4, Wd = 3, H = 4.2;
  solid(ctx, 'painted', box(L2, H - 1.2, Wd, x, 1.2 + (H - 1.2) / 2, z), { color, tag: 'boxcar' });
  ctx.collision.addBox(x - L2 / 2, 0.12, z - 1.2, x + L2 / 2, 1.2, z + 1.2, 'boxcar');
  ctx.buckets.add('painted', box(L2 + 0.1, 0.12, Wd + 0.1, x, H + 0.06, z), 0x2a2c30);
  ctx.buckets.add('wood', box(L2 - 0.6, 0.06, 0.6, x, H + 0.15, z));
  for (const s of [-1, 1]) {
    ctx.buckets.add('painted', box(2.6, 1.0, 2.4, x + s * 5, 0.7, z), 0x1d2024);
    ctx.buckets.add('painted', box(3.2, 2.6, 0.06, x, 2.6, z + s * (Wd / 2 + 0.03)), 0x2a2c30);
    addLadder(ctx.climbables, { x: x + s * (L2 / 2 + 0.05), z: z + 0.9, nx: s, nz: 0, bottom: 0.12, top: H });
  }
  ctx.grapple.push({ x: x - 5, y: H + 0.12, z, nx: 0, nz: 1 }, { x: x + 5, y: H + 0.12, z, nx: 0, nz: -1 });
}
function tankCar(ctx, x, z) {
  solid(ctx, 'painted', cylinder(1.4, 1.4, 13, 0, 0, 0, 12).rotateZ(Math.PI / 2).translate(x, 2.5, z), { color: 0x1d2024, tag: 'tankcar' });
  ctx.buckets.add('painted', cylinder(0.5, 0.5, 0.5, x, 4.1, z, 8), 0x2a2c30);
  for (const s of [-1, 1]) ctx.buckets.add('painted', box(2.6, 1.0, 2.4, x + s * 5, 0.7, z), 0x1d2024);
  ctx.grapple.push({ x, y: 3.9, z, nx: 0, nz: 1, perch: true });
}
function flatCar(ctx, x, z) {
  solid(ctx, 'painted', box(14, 0.5, 2.8, x, 1.35, z), { color: 0x3a3f48, tag: 'flatcar' });
  for (const s of [-1, 1]) ctx.buckets.add('painted', box(2.6, 1.0, 2.4, x + s * 5, 0.7, z), 0x1d2024);
  solid(ctx, 'wood', box(5, 1.4, 2.4, x - 3, 2.3, z), { tag: 'crate' });
}

// The roundhouse: seven brick engine stalls on an arc west of a turntable, each with a tall door,
// rails radiating into them; roofs walkable (collision in 2 m tiles over each stall's footprint).
function roundhouse(ctx, tx, tz) {
  const y = 0.12;
  // Turntable: a sunken ring with a bridge girder.
  ctx.buckets.add('painted', cylinder(9, 9, 0.1, tx, y + 0.02, tz, 24), 0x23211f);
  ctx.buckets.add('painted', cylinder(9.2, 9.2, 0.3, tx, y + 0.1, tz, 24, true), 0x5a5650);
  solid(ctx, 'painted', box(18, 0.6, 2.4, tx, y + 0.4, tz), { color: 0x2f3a36, tag: 'turntable' });
  const n = 6, r0 = 10, r1 = 24, h = 8.5;
  for (let k = 0; k < n; k++) {
    const a = Math.PI * (0.75 + 0.5 * (k / (n - 1))); // fan out to the west
    const dx = Math.cos(a), dz = Math.sin(a);
    const cx = tx + dx * (r0 + r1) / 2, cz = tz + dz * (r0 + r1) / 2;
    const len = r1 - r0, wid = 7;
    const g = tiledBox(len, h, wid, 0, 0, 0, { uvScale: [28, 54.4], faces: [0, 1, 4, 5] }).rotateY(-a).translate(cx, y + h / 2, cz);
    ctx.buckets.add('facade_brick', g);
    ctx.buckets.add('roof', box(len + 0.4, 0.4, wid + 0.4, 0, 0, 0).rotateY(-a).translate(cx, y + h + 0.2, cz));
    // Door on the turntable end, rails leading in.
    ctx.buckets.add('painted', box(0.1, 6, 4.6, 0, 0, 0).rotateY(-a).translate(tx + dx * (r0 - 0.06), y + 3, tz + dz * (r0 - 0.06)), 0x1a1c20);
    for (const s of [-0.72, 0.72]) ctx.buckets.add('painted', box(r0 - 9, 0.14, 0.1, 0, 0, 0).rotateY(-a).translate(tx + dx * (9 + r0) / 2 - dz * s, y + 0.2, tz + dz * (9 + r0) / 2 + dx * s), 0x6e6a62);
    // Collision: 2 m tiles over the stall (walls up to the roof; the roof is standable).
    for (let t = r0 + 1; t < r1; t += 2) for (let c = -wid / 2 + 1; c < wid / 2; c += 2) {
      const px = tx + dx * t - dz * c, pz = tz + dz * t + dx * c;
      ctx.collision.addBox(px - 1, y, pz - 1, px + 1, y + h + 0.4, pz + 1, 'roundhouse');
    }
    ctx.grapple.push({ x: tx + dx * r0, y: y + h + 0.4, z: tz + dz * r0, nx: -dx, nz: -dz });
    ctx.facades.push({ minX: cx - 6, minY: 0, minZ: cz - 6, maxX: cx + 6, maxY: h, maxZ: cz + 6, style: 'brick' });
  }
  signPlane(ctx, 'ROUNDHOUSE NO. 2', 0xcdbb8a, tx - 10.2, 7.4, tz, 1, 0, 0.6, { back: false });
  // The lead track east out of the turntable into the yard.
  for (const s of [-0.72, 0.72]) ctx.buckets.add('painted', box(60, 0.16, 0.1, tx + 39, y + 0.2, tz + s), 0x6e6a62);
  for (let x = tx + 9.6; x < tx + 69; x += 1.2) ctx.buckets.add('wood', new THREE.PlaneGeometry(0.24, 2.5).rotateX(-Math.PI / 2).translate(x, y + 0.06, tz));
  lampAt(ctx, tx + 10, y, tz - 10, -1, 0, PALETTE.sodium, { pole: 7 });
}

// ---- junkyard with the car crusher ----
function junkyard(ctx) {
  const { rng } = ctx;
  const J = { minX: -453, maxX: -377, minZ: 152, maxZ: 190 };
  // Corrugated fence round it with a gate on the -460 street side.
  const fh = 3;
  for (const [a, b] of around(J.minZ, J.maxZ, [[165, 175]])) solid(ctx, 'painted', box(0.15, fh, b - a, J.minX + 0.5, fh / 2, (a + b) / 2), { color: 0x6a6e74, tag: 'fence' });
  solid(ctx, 'painted', box(J.maxX - J.minX, fh, 0.15, (J.minX + J.maxX) / 2, fh / 2, J.minZ + 0.5), { color: 0x6a6e74, tag: 'fence' });
  solid(ctx, 'painted', box(0.15, fh, J.maxZ - J.minZ, J.maxX - 0.5, fh / 2, (J.minZ + J.maxZ) / 2), { color: 0x6a6e74, tag: 'fence' });
  signPlane(ctx, "MANGLER'S AUTO SALVAGE", 0xe8b43a, J.minX - 0.1, 4.2, 170, -1, 0, 0.9);
  // Stacks of flattened hulks (each a walkable block), loose wrecks.
  for (let k = 0; k < 10; k++) {
    const x = rng.range(J.minX + 6, J.maxX - 18), z = rng.range(J.minZ + 5, J.maxZ - 5);
    const n = rng.int(2, 5);
    for (let j = 0; j < n; j++) solid(ctx, 'painted', box(4.2, 1.0, 1.9, x, 0.62 + j * 1.0, z), { color: rng.pick([0x6d2f2f, 0x2f3f5a, 0x39473a, 0x5a5146, 0x7a6a44, 0x4a3a52]), tag: 'hulk' });
    ctx.grapple.push({ x, y: 0.12 + n * 1.0, z, nx: 0, nz: 1, perch: true });
  }
  // The crusher: a steel frame with a press plate, a control cab, a hulk half crushed in it.
  const C = L.crusher;
  for (const s of [-1, 1]) solid(ctx, 'painted', box(1, 7, 7, C.x + s * 4.5, 3.5, C.z), { color: 0xc8962f, tag: 'crusher' });
  solid(ctx, 'painted', box(10, 1.2, 7.4, C.x, 7.6, C.z), { color: 0xc8962f, tag: 'crusher' });
  ctx.buckets.add('painted', box(8, 0.8, 6, C.x, 2.6, C.z), 0x3a3f48);
  ctx.buckets.add('painted', box(4.2, 1.2, 1.9, C.x, 1.4, C.z), 0x6d2f2f);
  solid(ctx, 'painted', box(2.6, 2.6, 2.6, C.x + 7, 1.45, C.z + 3), { color: 0x4a4e54, tag: 'cab' });
  glow(ctx, box(1.6, 0.8, 0.06, C.x + 7, 1.9, C.z + 1.67), 0xc89a52);
  ctx.halos.add(C.x, 8.6, C.z, 0xffb43a, 2.4);
  ctx.grapple.push({ x: C.x, y: 8.2, z: C.z, nx: 0, nz: 1, perch: true });
  // A magnet crane on a mast.
  solid(ctx, 'steel', box(0.8, 12, 0.8, J.maxX - 8, 6, J.minZ + 8), { tag: 'mast' });
  ctx.buckets.add('painted', box(16, 0.8, 0.8, J.maxX - 14, 12.2, J.minZ + 8), 0xc8962f);
  ctx.buckets.add('painted', cylinder(1.2, 1.2, 0.5, J.maxX - 20, 7, J.minZ + 8, 12), 0x2a2c30);
  ctx.grapple.push({ x: J.maxX - 8, y: 12.6, z: J.minZ + 8, nx: 0, nz: 1, perch: true });
}

// ---- cold storage ----
function coldStorage(ctx) {
  const C = L.coldStorage;
  const b = { id: 'coldStorage', x: C.x, z: C.z, w: C.w, d: C.d, h: C.h, style: 'concrete', roof: 'flat', parapet: true, cornice: false, storefront: false, tiers: [], props: 'industrial', neon: [], district: 'yards' };
  building(ctx, b);
  const fx = C.x - C.w / 2;
  ctx.buckets.add('painted', box(0.1, 3.2, 4, fx - 0.05, 1.75, C.z), 0x9ab8c8);
  ctx.buckets.add('glow', box(0.06, 0.3, 4.4, fx - 0.1, 3.6, C.z), 0x8fd8ff);
  ctx.halos.add(fx - 0.6, 3.6, C.z, 0x8fd8ff, 3);
  signPlane(ctx, 'ARCTIC COLD STORAGE & PACKING', 0x8fd8ff, fx - 0.15, C.h - 3, C.z, -1, 0, 1.1);
  for (const dz of [-12, 12]) {
    ctx.buckets.add('painted', box(0.1, 3.6, 4, fx - 0.05, 1.95, C.z + dz), 0x3a4a5a);
    slab(ctx, 'concrete', fx - 2.4, 0.15, C.z + dz - 2.5, fx, 1.35, C.z + dz + 2.5, { tag: 'dock' });
  }
  // Ammonia tanks and condensers on the roof, venting cold steam.
  for (let k = 0; k < 3; k++) {
    solid(ctx, 'painted', cylinder(1.2, 1.2, 8, 0, 0, 0, 12).rotateX(Math.PI / 2).translate(C.x - 8 + k * 8, C.h + 1.4, C.z + 10), { color: 0xc8d0d8, tag: 'tank' });
    ctx.steam.push({ x: C.x - 8 + k * 8, y: C.h + 3, z: C.z - 8, s: 1.1 });
  }
}

// ---- power substation ----
function substation(ctx) {
  const S = YARDS.substation, P = L.substation;
  const fh = 2.6;
  const fence = (x0, z0, x1, z1) => {
    ctx.buckets.add('painted', box(Math.max(0.05, x1 - x0), fh, Math.max(0.05, z1 - z0), (x0 + x1) / 2, fh / 2 + 0.15, (z0 + z1) / 2), 0x5d636d);
    ctx.collision.addBox(Math.min(x0, x1) - 0.08, 0.15, Math.min(z0, z1) - 0.08, Math.max(x0, x1) + 0.08, fh + 0.15, Math.max(z0, z1) + 0.08, 'fence');
  };
  const fx0 = S.minX + 2, fx1 = S.maxX - 2, fz0 = S.minZ + 2, fz1 = S.maxZ - 2;
  fence(fx0, fz0, fx1, fz0);
  fence(fx0, fz1, fx1, fz1);
  for (const [a, b] of around(fz0, fz1, [[P.z - 2, P.z + 2]])) fence(fx0, a, fx0, b); // gate on the west
  fence(fx1, fz0, fx1, fz1);
  for (let k = 0; k < 3; k++) {
    const x = fx0 + 8 + k * 11, z = P.z + (k % 2 ? -6 : 6);
    solid(ctx, 'painted', box(4, 3.6, 3, x, 1.95, z), { color: 0x4a5a4a, tag: 'transformer' });
    for (let f = -1.6; f <= 1.6; f += 0.4) ctx.buckets.add('painted', box(0.06, 2.8, 3.4, x + f, 1.9, z), 0x3a4a3a);
    for (const s of [-1, 0, 1]) ctx.buckets.add('painted', cylinder(0.15, 0.25, 1.4, x + s * 1.2, 4.45, z, 6), 0xb8a890);
    // Lattice tower.
    const ty = 14;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.buckets.add('steel', box(0.15, ty, 0.15, 0, 0, 0).rotateX(sz * 0.06).rotateZ(-sx * 0.06).translate(x + sx * 1.0, ty / 2, z - (k % 2 ? -1 : 1) * 4 + sz * 1.0));
    ctx.buckets.add('steel', box(5, 0.2, 0.2, x, ty, z - (k % 2 ? -1 : 1) * 4));
    ctx.collision.addBox(x - 1.3, 0.15, z - (k % 2 ? -1 : 1) * 4 - 1.3, x + 1.3, ty, z - (k % 2 ? -1 : 1) * 4 + 1.3, 'pylon');
    ctx.grapple.push({ x, y: ty + 0.1, z: z - (k % 2 ? -1 : 1) * 4, nx: 0, nz: 1, perch: true });
  }
  building(ctx, { id: 'substationHut', x: fx1 - 5, z: fz1 - 4, w: 7, d: 5, h: 4, style: 'brick', roof: 'flat', parapet: false, cornice: true, storefront: false, tiers: [], props: 'none', neon: [], district: 'yards' });
  signPlane(ctx, 'DANGER HIGH VOLTAGE', 0xe8d24a, fx0 - 0.1, 2.2, P.z + 4, -1, 0, 0.45, { back: false });
  const i = ctx.halos.add(fx0 + 30, 15, P.z, PALETTE.crimson, 2.2);
  ctx.blinkers.push({ i, size: 2.2, phase: 0.7 });
}

// The viaduct's ramp down to grade: a sloped deck (collides in steps), retaining walls, the
// track carrying on across the 90 street into the rail yard.
function viaductRamp(ctx, z0, z1) {
  const V = L.viaduct, x = V.x, hw = V.half, top = V.deck;
  const len = z1 - z0;
  const n = Math.ceil(len);
  for (let k = 0; k < n; k++) {
    const za = z0 + k, zb = Math.min(z1, za + 1);
    const yTop = top - (top - 0.3) * ((za + zb) / 2 - z0) / len;
    ctx.collision.addBox(x - hw, 0, za, x + hw, yTop, zb, 'ramp');
  }
  const slope = Math.atan2(top - 0.3, len);
  const g = box(2 * hw, 0.4, Math.hypot(len, top), 0, 0, 0).rotateX(slope).translate(x, (top + 0.3) / 2 - 0.2, (z0 + z1) / 2);
  ctx.buckets.add('painted', g, 0x2a2724);
  for (const s of [-1, 1]) {
    const P = [x + s * hw, top, z0, x + s * hw, 0.3, z1, x + s * hw, 0, z1, x + s * hw, top, z0, x + s * hw, 0, z1, x + s * hw, 0, z0];
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(s > 0 ? P : P.slice().reverse().flatMap((_, i, a) => (i % 3 === 0 ? [a[i + 2], a[i + 1], a[i]] : [])), 3));
    wg.computeVertexNormals();
    ctx.buckets.add('concrete', wg);
  }
  for (let z = z0 + 0.5; z < z1 + 12; z += 1.2) ctx.buckets.add('wood', new THREE.PlaneGeometry(2.4, 0.24).rotateX(-Math.PI / 2).translate(x, z < z1 ? top - (top - 0.3) * (z - z0) / len + 0.05 : 0.08, z));
}
