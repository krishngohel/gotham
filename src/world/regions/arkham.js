// Arkham Island (workstream H2): the asylum as a gothic complex on a rocky island in the lake,
// reached by a stone causeway on z -80 from Lakeshore Drive, through a gatehouse on the shore.
// On a 5 m plateau above cliffs: the main hall with its clock-and-bell tower, the intensive
// treatment wing (north) and the south wing round a walled yard, a greenhouse, a chapel with its
// graveyard, a water tower, searchlight towers, a perimeter wall with a broken stretch, and a dock
// below the south cliff. A rooftop route crosses the whole complex (wall tops -> chapel -> north
// wing -> main hall -> tower; south wing -> greenhouse -> wall), with zip lines over the gaps.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { box, cylinder } from '../buckets.js';
import { solid, glow, lightSpot, building, waterTower, graffiti } from '../cityBuilder.js';
import { addGargoyle, plinth } from '../gargoyles.js';
import { addLadder, addZipline } from '../climbables.js';
import { EAST, SHORE_X, LAKE_LEVEL } from './eastLayout.js';
import { slab, railing, neonWord, board, lampAt, turned, STONE, DARK_STONE, IRON } from './eastKit.js';
import { LAYER_FX } from '../../render/layers.js';

const A = EAST.arkham, C = EAST.causeway;
const PY = A.plateau;
const SICK = 0xb8e0a0;      // Arkham's lamp colour: a cold, sick green-white
const BONE = 0x9a9e8c;
const CZ = C.z, CW = C.width;

export function buildArkham(ctx) {
  causeway(ctx);
  island(ctx);
  complex(ctx);
  perimeter(ctx);
  grounds(ctx);
}

// ---- the causeway and its gatehouses ----

function causeway(ctx) {
  const x0 = SHORE_X, x1 = C.x1, top = 0.5;
  const z0 = CZ - CW / 2, z1 = CZ + CW / 2;
  // Rock-fill causeway with a paved top; the first 5 m ramp up from the promenade (0.15 -> 0.5).
  slab(ctx, 'concrete', x0, -3, z0 - 1, x1, top - 0.2, z1 + 1, { tag: 'causeway', uv: [6, 6] });
  ctx.buckets.add('asphalt', new THREE.BoxGeometry(x1 - x0, 0.2, CW).translate((x0 + x1) / 2, top - 0.1, CZ));
  ctx.collision.addBox(x0, top - 0.2, z0, x1, top, z1, 'causeway');
  for (let k = 0; k < 4; k++) ctx.collision.addBox(EAST.promenade.x0 - 1 + k, -1, z0, EAST.promenade.x0 + k, 0.15 + (k + 1) * 0.09, z1, 'ramp');
  // Rubble skirts at the waterline.
  for (let x = x0 + 4; x < x1; x += 6) for (const s of [-1, 1]) ctx.buckets.add('painted', new THREE.IcosahedronGeometry(1.4, 0).scale(1.3, 0.7, 1).rotateY(x).translate(x + ctx.rng.range(-2, 2), LAKE_LEVEL + 0.1, CZ + s * (CW / 2 + 1.6)), 0x4a4844);
  // Stone parapets, open at the mid-causeway lift span, and gothic lamps on posts every 32 m.
  for (const z of [z0 + 0.25, z1 - 0.25]) {
    railing(ctx, true, x0 + 8, 462, z, top, { color: DARK_STONE, post: 1.2 });
    railing(ctx, true, 478, x1, z, top, { color: DARK_STONE, post: 1.2 });
  }
  for (let x = x0 + 24, k = 0; x < x1 - 4; x += 32, k++) for (const s of [-1, 1]) lampAt(ctx, x, top, CZ + s * (CW / 2 - 0.6), 0, -s, SICK, { pole: 5.5, pool: 0x2f4a2a, spot: k % 2 === 0 && s > 0 });
  ctx.buckets.add('lane', new THREE.PlaneGeometry(x1 - x0 - 8, 0.2).rotateX(-Math.PI / 2).translate((x0 + x1) / 2 + 4, top + 0.02, CZ));
  // Shore gatehouse (two crenellated towers and an arch) and the lift-span towers mid-way.
  gate(ctx, x0 + 6, top, 'ARKHAM ASYLUM', 'VISITING HOURS: NEVER');
  for (const s of [-1, 1]) {
    const z = CZ + s * (CW / 2 + 2.2);
    for (const x of [462, 478]) {
      solid(ctx, 'painted', box(3, 12, 3, x, top + 6, z), { color: STONE, tag: 'tower' });
      ctx.buckets.add('painted', new THREE.ConeGeometry(2.4, 3, 4).rotateY(Math.PI / 4).translate(x, top + 13.5, z), 0x2f3a34);
      ctx.grapple.push({ x, y: top + 12, z, nx: 0, nz: s, perch: true });
    }
    // Counterweight beams of the (lowered) lift span.
    ctx.buckets.add('painted', box(16, 0.8, 0.8, 470, top + 10, z), IRON);
  }
  ctx.buckets.add('painted', box(16, 1.2, CW + 1, 470, top - 0.5, CZ), 0x2a2d30);
  for (const x of [463, 477]) ctx.buckets.add('painted', box(0.4, 0.3, CW, x, top + 0.05, CZ), 0x1a1c1e);
  board(ctx, 'LIFT SPAN', 'MAY RISE WITHOUT WARNING. LIKE THE INMATES.', 458, top + 2.2, z0 - 0.6, 0, -1, { w: 3.2, bg: 0x3e5a46, base: top });
}

// A crenellated gatehouse straddling the road at x: two towers, an arch, a sign, lit lanterns.
function gate(ctx, x, y, title, sub) {
  for (const s of [-1, 1]) {
    const z = CZ + s * (CW / 2 + 2.5);
    solid(ctx, 'painted', box(5, 11, 5, x, y + 5.5, z), { color: STONE, tag: 'gatehouse' });
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) solid(ctx, 'painted', box(1, 1.2, 1, x + dx, y + 11.6, z + dz), { color: STONE, tag: 'crenel' });
    glow(ctx, box(0.8, 1.6, 0.06, x, y + 7, z - s * 2.53), SICK);
    ctx.grapple.push({ x, y: y + 11, z, nx: 0, nz: s, perch: true });
    ctx.facades.push({ minX: x - 2.5, minY: 0, minZ: z - 2.5, maxX: x + 2.5, maxY: y + 11, maxZ: z + 2.5, style: 'stone' });
  }
  slab(ctx, 'painted', x - 2.5, y + 7.5, CZ - CW / 2, x + 2.5, y + 10, CZ + CW / 2, { color: STONE, tag: 'arch' });
  ctx.buckets.add('painted', new THREE.TorusGeometry(CW / 2, 0.5, 4, 12, Math.PI).rotateY(Math.PI / 2).translate(x - 2.55, y + 7.3 - CW / 2 + 1, CZ), DARK_STONE);
  board(ctx, title, sub, x - 2.7, y + 8.75, CZ, -1, 0, { w: 6, bg: 0x3e5a46, posts: false });
  ctx.halos.add(x - 3, y + 6.5, CZ, SICK, 4);
  lightSpot(ctx, x - 4, y + 5, CZ, SICK, 22, 16);
  ctx.grapple.push({ x, y: y + 10, z: CZ, nx: -1, nz: 0, perch: true });
}

// ---- the island: a plateau of boxes on cliffs of broken rock ----

const ISLE = { x0: 576, x1: 740, z0: -156, z1: -4 };
const RAMP = { x0: 572, x1: 596, z0: CZ - CW / 2, z1: CZ + CW / 2 };

function island(ctx) {
  const { x0, x1, z0, z1 } = ISLE;
  // The plateau in three pieces round the ramp notch the causeway climbs through.
  const pieces = [[x0, z0, RAMP.x1, RAMP.z0], [x0, RAMP.z1, RAMP.x1, z1], [RAMP.x1, z0, x1, z1]];
  for (const [a, b, c, d] of pieces) {
    slab(ctx, 'concrete', a, -4, b, c, PY - 0.1, d, { tag: 'island', uv: [8, 8], collide: false });
    slab(ctx, 'yard', a, PY - 0.1, b, c, PY, d, { tag: 'island', uv: [10, 10], faces: [2], collide: false });
    ctx.collision.addBox(a, -4, b, c, PY, d, 'island');
  }
  ctx.facades.push({ minX: x0, minY: 0, minZ: z0, maxX: x1, maxY: PY, maxZ: z1, style: 'stone' });
  // The ramp from the causeway (y 0.5) up to the plateau, in 0.1 m steps, walled both sides.
  const n = Math.ceil((PY - 0.5) / 0.1);
  for (let k = 0; k < n; k++) {
    const xa = RAMP.x0 + ((RAMP.x1 - RAMP.x0) * k) / n, xb = RAMP.x0 + ((RAMP.x1 - RAMP.x0) * (k + 1)) / n;
    ctx.collision.addBox(xa, -3, RAMP.z0, xb, 0.5 + ((PY - 0.5) * (k + 1)) / n, RAMP.z1, 'ramp');
  }
  const rg = new THREE.PlaneGeometry(Math.hypot(RAMP.x1 - RAMP.x0, PY - 0.5), CW).rotateX(-Math.PI / 2).rotateZ(Math.atan2(PY - 0.5, RAMP.x1 - RAMP.x0)).translate((RAMP.x0 + RAMP.x1) / 2, (PY + 0.5) / 2 + 0.03, CZ);
  ctx.buckets.add('asphalt', rg);
  for (const s of [-1, 1]) ctx.buckets.add('painted', box(RAMP.x1 - x0, PY + 1.2, 0.8, (x0 + RAMP.x1) / 2, PY / 2 + 0.6, CZ + s * (CW / 2 + 0.4)), DARK_STONE);
  // Cliffs: broken rock all round the plateau down to the water.
  const rock = (x, z, s) => ctx.buckets.add('painted', new THREE.IcosahedronGeometry(s, 0).scale(1, 0.9, 1).rotateY(ctx.rng.range(0, 3)).rotateX(ctx.rng.range(-0.3, 0.3)).translate(x, ctx.rng.range(-0.5, PY - 2), z), ctx.rng.pick([0x3e3c38, 0x4a4742, 0x34332f]));
  for (let x = x0; x <= x1; x += 5) { rock(x, z0 - 1.5, ctx.rng.range(2.4, 3.6)); if (x < 630 || x > 650) rock(x, z1 + 1.5, ctx.rng.range(2.4, 3.6)); }
  for (let z = z0; z <= z1; z += 5) { rock(x1 + 1.5, z, ctx.rng.range(2.4, 3.6)); if (Math.abs(z - CZ) > 9) rock(x0 - 1.5, z, ctx.rng.range(2.4, 3.6)); }
  // The dock below the south cliff, with a ladder up the rock and a moored police launch.
  slab(ctx, 'wood', 630, -1, z1, 650, 0.4, z1 + 18, { tag: 'dock', uv: [3, 3] });
  for (let x = 631; x < 650; x += 4) for (const dz of [4, 11, 17]) ctx.buckets.add('wood', cylinder(0.22, 0.22, 3, x, -1.4, z1 + dz, 6));
  railing(ctx, false, z1 + 1, z1 + 18, 649.8, 0.4, { color: IRON });
  railing(ctx, true, 630, 650, z1 + 17.8, 0.4, { color: IRON });
  for (let k = 0; k < 2; k++) {
    const lx = 634 + k * 8;
    for (const s of [-0.25, 0.25]) ctx.buckets.add('steel', box(0.05, PY - 0.4, 0.05, lx + s, 0.4 + (PY - 0.4) / 2, z1 + 0.3));
    for (let y = 0.7; y < PY; y += 0.3) ctx.buckets.add('steel', box(0.5, 0.04, 0.04, lx, y, z1 + 0.3));
    addLadder(ctx.climbables, { x: lx, z: z1 + 0.3, nx: 0, nz: 1, bottom: 0.4, top: PY });
  }
  const launch = (x, z) => {
    ctx.buckets.add('painted', new THREE.CylinderGeometry(1.5, 0.9, 9, 8).rotateX(Math.PI / 2).scale(1, 0.55, 1).translate(x, LAKE_LEVEL + 0.5, z), 0x1e2a3e);
    ctx.buckets.add('painted', box(2.2, 1.6, 3.4, x, LAKE_LEVEL + 1.7, z + 1), 0xd8dce0);
    ctx.collision.addBox(x - 1.5, LAKE_LEVEL - 0.4, z - 4.5, x + 1.5, LAKE_LEVEL + 1.1, z + 4.5, 'boat');
    ctx.halos.add(x, LAKE_LEVEL + 2.8, z + 1, PALETTE.crimson, 2);
  };
  launch(626, z1 + 10);
  lampAt(ctx, 648, 0.4, z1 + 16, -1, 0, SICK, { pole: 4.5, pool: 0x2f4a2a });
  board(ctx, 'ARKHAM DOCK', 'ARRIVALS ONLY', 641, 1.9, z1 + 17.6, 0, 1, { w: 3, bg: 0x3e5a46, base: 0.4 });
}

// ---- the asylum buildings ----

function complex(ctx) {
  const b = (o) => building(ctx, { roof: 'flat', parapet: true, cornice: true, storefront: false, tiers: [], props: 'none', neon: [], district: 'arkham', ...o });
  const H = (h) => PY + h; // buildings rise from y 0 inside the rock; h is above the plateau
  // Main hall: a long gothic hall with a steep roof.
  b({ id: 'arkhamMain', x: 640, z: -80, w: 26, d: 50, h: H(16), style: 'stone', roof: 'pitched', parapet: false });
  // The clock-and-bell tower on its west front.
  b({ id: 'arkhamTower', x: 622, z: -80, w: 10, d: 10, h: H(28), style: 'stone', parapet: true, tiers: [{ w: 7.5, d: 7.5, h: 8.5, spire: true }] });
  // Wings round the yard, a corridor bridge to each.
  b({ id: 'arkhamNorth', x: 668, z: -122, w: 56, d: 16, h: H(12), style: 'brick' });
  b({ id: 'arkhamSouth', x: 668, z: -38, w: 56, d: 16, h: H(12), style: 'brick' });
  for (const [z0, z1] of [[-114, -105], [-55, -46]]) slab(ctx, 'painted', 642, PY, z0, 650, H(9), z1, { color: 0x6e675e, tag: 'corridor' });
  for (const [z0, z1] of [[-114, -105], [-55, -46]]) ctx.grapple.push({ x: 646, y: H(9), z: (z0 + z1) / 2, nx: 1, nz: 0 });
  // The chapel with its spire, and a squat stone annex.
  b({ id: 'arkhamChapel', x: 612, z: -138, w: 12, d: 20, h: H(9), style: 'stone', roof: 'pitched', parapet: false });
  solid(ctx, 'painted', box(4, 6, 4, 612, H(9) + 3, -127), { color: STONE, tag: 'tower' });
  solid(ctx, 'painted', new THREE.ConeGeometry(2.6, 10, 4).rotateY(Math.PI / 4).translate(612, H(15) + 5, -127), { color: 0x2f3a34, tag: 'spire' });
  ctx.grapple.push({ x: 612, y: H(15), z: -127, nx: 0, nz: 1, perch: true });
  glow(ctx, new THREE.CircleGeometry(1.6, 12).translate(612, H(6), -127.98), 0x7a3a5a);
  // Greenhouse: glass on a stone base, glowing an unhealthy green (someone has been gardening).
  greenhouse(ctx, 712, -28);
  // The clock faces (one per side) and the bell, lit at night.
  const ty = H(25);
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const fx = 622 + nx * 5.05, fz = -80 + nz * 5.05;
    const face = new THREE.CircleGeometry(2.6, 20).rotateY(Math.atan2(nx, nz)).translate(fx, ty, fz);
    glow(ctx, face, PALETTE.clockFace);
    ctx.buckets.add('painted', turned(0.25, 2.0, 0.06, fx + nx * 0.05, ty + 0.7, fz + nz * 0.05, Math.atan2(nx, nz)), 0x1a1a1a);
    ctx.buckets.add('painted', new THREE.BoxGeometry(1.5, 0.2, 0.06).rotateZ(0.6).rotateY(Math.atan2(nx, nz)).translate(fx + nx * 0.06 - nz * 0.5, ty + 0.3, fz + nz * 0.06 + nx * 0.5), 0x1a1a1a);
    ctx.halos.add(fx + nx * 0.6, ty, fz + nz * 0.6, PALETTE.clockFace, 5);
  }
  lightSpot(ctx, 616, ty, -80, PALETTE.clockFace, 24, 22);
  for (const s of [-1, 1]) for (const zz of [-105, -55]) { plinth(ctx, 640 + s * 12.3, H(16), zz + (zz < -80 ? 0.6 : -0.6)); addGargoyle(ctx, 640 + s * 12.3, H(16) + 0.9, zz + (zz < -80 ? 0.6 : -0.6), zz < -80 ? Math.PI : 0); }
  for (const [x, z, yaw] of [[617.6, -84.4, -Math.PI * 0.75], [617.6, -75.6, -Math.PI * 0.25]]) addGargoyle(ctx, x, H(28), z, yaw);
  // The main door on the west front (under the tower's arch) and the wing doors.
  ctx.buckets.add('painted', box(0.1, 4, 3.4, 616.9, PY + 2, -80), 0x16120e);
  glow(ctx, box(0.06, 0.8, 2.6, 616.85, PY + 4.6, -80), SICK);
  ctx.halos.add(616.5, PY + 4.6, -80, SICK, 3);
  ctx.buckets.add('painted', box(3, 3.6, 0.1, 668, PY + 1.8, -113.95), 0x1a1c20);
  board(ctx, 'INTENSIVE TREATMENT', 'PLEASE KNOCK. THEY WILL.', 674, PY + 4.6, -113.8, 0, 1, { w: 4, bg: 0x6a2a2a, posts: false });
  neonWord(ctx, 'ARKHAM', 616.7, H(14), -80, -1, 0, { h: 2.2, color: SICK, back: false, halo: 6 });
  // Barred, lit windows scattered on the wings (the rest stay dark).
  for (let k = 0; k < 18; k++) {
    const north = k % 2 === 0, x = 645 + ctx.rng.range(0, 46), y = PY + 2 + ctx.rng.int(0, 2) * 3.4;
    const z = north ? -113.96 : -46.04;
    glow(ctx, box(1.2, 1.4, 0.06, x, y, z), ctx.rng.chance(0.3) ? SICK : PALETTE.window);
    for (let b2 = -0.45; b2 < 0.5; b2 += 0.3) ctx.buckets.add('painted', box(0.05, 1.4, 0.08, x + b2, y, z), 0x111111);
  }
  // Zip lines over the gaps: tower balcony -> north wing roof; south wing -> greenhouse roof.
  zip(ctx, { x: 625.5, y: H(28) + 0.6, z: -84 }, { x: 645, y: H(12) + 1.2, z: -116 });
  zip(ctx, { x: 694, y: H(12) + 1.2, z: -33 }, { x: 706, y: H(8) + 1.0, z: -24 });
  ctx.roofs.push({ id: 'arkhamRoute', x: 668, z: -80, w: 100, d: 100, y: H(12), district: 'arkham' });
}

function zip(ctx, a, b) {
  addZipline(ctx.climbables, a, b);
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)]);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: PALETTE.ink }));
  line.layers.set(LAYER_FX);
  ctx.scene.add(line);
  for (const p of [a, b]) solid(ctx, 'steel', box(0.25, 1.4, 0.25, p.x, p.y - 0.7, p.z), { tag: 'zipPost' });
}

function greenhouse(ctx, cx, cz) {
  const w = 24, d = 20, h = 6;
  slab(ctx, 'painted', cx - w / 2, PY, cz - d / 2, cx + w / 2, PY + 1, cz + d / 2, { color: STONE, tag: 'building' });
  ctx.buckets.add('glow', box(w - 0.3, h - 1, d - 0.3, cx, PY + 1 + (h - 1) / 2, cz), 0x3f8a3a);
  ctx.collision.addBox(cx - w / 2, PY + 1, cz - d / 2, cx + w / 2, PY + h, cz + d / 2, 'building');
  for (let t = -w / 2; t <= w / 2 + 1e-6; t += 2) for (const s of [-1, 1]) ctx.buckets.add('painted', box(0.12, h - 1, 0.12, cx + t, PY + 1 + (h - 1) / 2, cz + s * (d / 2 + 0.02)), 0x2a3a2e);
  for (let t = -d / 2; t <= d / 2 + 1e-6; t += 2) for (const s of [-1, 1]) ctx.buckets.add('painted', box(0.12, h - 1, 0.12, cx + s * (w / 2 + 0.02), PY + 1 + (h - 1) / 2, cz + t), 0x2a3a2e);
  ctx.buckets.add('glass', new THREE.CylinderGeometry(0.01, d / 2 + 0.3, 3, 4, 1).rotateY(Math.PI / 4).scale(w / d, 1, 1).translate(cx, PY + h + 1.5, cz));
  ctx.collision.addBox(cx - w / 2, PY + h, cz - d / 4, cx + w / 2, PY + h + 1.5, cz + d / 4, 'roof');
  ctx.facades.push({ minX: cx - w / 2, minY: 0, minZ: cz - d / 2, maxX: cx + w / 2, maxY: PY + h, maxZ: cz + d / 2, style: 'steel' });
  // Vines climbing out through broken panes.
  for (let k = 0; k < 10; k++) {
    const x = cx - w / 2 + ctx.rng.range(0, w), s = ctx.rng.chance(0.5) ? 1 : -1;
    ctx.buckets.add('painted', new THREE.CylinderGeometry(0.08, 0.14, ctx.rng.range(3, 7), 4).rotateZ(ctx.rng.range(-0.5, 0.5)).translate(x, PY + 3, cz + s * (d / 2 + 0.2)), 0x2a5a2a);
  }
  ctx.halos.add(cx, PY + 3, cz, 0x7fe07a, 7);
  lightSpot(ctx, cx - w / 2 - 2, PY + 3, cz, 0x7fe07a, 20, 16);
  for (let t = -w / 2 + 3; t < w / 2; t += 6) ctx.grapple.push({ x: cx + t, y: PY + h, z: cz - d / 2, nx: 0, nz: -1 }, { x: cx + t, y: PY + h, z: cz + d / 2, nx: 0, nz: 1 });
  ctx.buckets.add('painted', box(0.1, 3, 2.4, cx - w / 2 - 0.02, PY + 2.5, cz - 2), 0x1a1c18);
  board(ctx, 'BOTANICAL THERAPY', 'DO NOT TALK TO THE PLANTS', cx - w / 2 - 0.3, PY + 4.6, cz + 4, -1, 0, { w: 3.2, bg: 0x2f5a3a, posts: false });
}

// ---- the perimeter wall, its watchtowers and searchlights ----

function perimeter(ctx) {
  const x0 = 600, x1 = 734, z0 = -150, z1 = -10, h = 6, t = 1.2, y = PY;
  const wall = (minX, minZ, maxX, maxZ) => {
    slab(ctx, 'painted', minX, y, minZ, maxX, y + h, maxZ, { color: BONE, tag: 'wall' });
    ctx.buckets.add('painted', box(maxX - minX + 0.3, 0.3, maxZ - minZ + 0.3, (minX + maxX) / 2, y + h + 0.15, (minZ + maxZ) / 2), 0x6e7262);
    const alongX = maxX - minX > maxZ - minZ;
    const len = alongX ? maxX - minX : maxZ - minZ;
    for (let s = 3; s < len - 1; s += 6) {
      const px = alongX ? minX + s : (minX + maxX) / 2, pz = alongX ? (minZ + maxZ) / 2 : minZ + s;
      ctx.grapple.push({ x: px, y: y + h, z: pz, nx: alongX ? 0 : (px < 667 ? -1 : 1), nz: alongX ? (pz < -80 ? -1 : 1) : 0 });
      // Coils of wire along the top.
      ctx.buckets.add('painted', new THREE.TorusGeometry(0.3, 0.03, 3, 8).rotateY(alongX ? 0 : Math.PI / 2).translate(px, y + h + 0.6, pz), 0x2a2a2a);
    }
  };
  // West wall with the gate opening on the causeway line; north wall broken at x 680..690.
  wall(x0, z0, x0 + t, CZ - CW / 2 - 1);
  wall(x0, CZ + CW / 2 + 1, x0 + t, z1);
  wall(x0, z0, 680, z0 + t);
  wall(690, z0, x1, z0 + t);
  wall(x0, z1 - t, x1, z1);
  wall(x1 - t, z0, x1, z1);
  // The breach: tumbled blocks you can climb.
  for (let k = 0; k < 7; k++) solid(ctx, 'painted', new THREE.BoxGeometry(1.6, 1.2, 1.4).rotateY(k).translate(681 + k * 1.3, y + 0.6 + (k % 3) * 0.5, z0 + 0.6 + ctx.rng.range(-1.5, 1.5)), { color: BONE, tag: 'rubble' });
  graffiti(ctx, 684, y + 2.5, z0 - 0.05, 0, -1, 4, 'HA HA HA');
  // Gate posts with iron gates standing open.
  for (const s of [-1, 1]) {
    const z = CZ + s * (CW / 2 + 1.5);
    solid(ctx, 'painted', box(2.2, h + 3, 2.2, x0 + 0.6, y + (h + 3) / 2, z), { color: STONE, tag: 'gatepost' });
    ctx.buckets.add('painted', new THREE.SphereGeometry(0.9, 8, 6).translate(x0 + 0.6, y + h + 3.8, z), DARK_STONE);
    ctx.grapple.push({ x: x0 + 0.6, y: y + h + 3, z, nx: -1, nz: 0, perch: true });
    for (let b = 0; b < 12; b++) ctx.buckets.add('painted', box(0.08, 4.5, 0.08, x0 + 1.2 + b * 0.45, y + 2.25, z - s * 0.4), IRON);
    ctx.buckets.add('painted', box(5.4, 0.12, 0.12, x0 + 3.7, y + 4.2, z - s * 0.4), IRON);
  }
  ctx.buckets.add('painted', new THREE.TorusGeometry(CW / 2 + 1.5, 0.25, 4, 16, Math.PI).rotateY(Math.PI / 2).translate(x0 + 0.6, y + h + 2, CZ), IRON);
  board(ctx, 'ELIZABETH ARKHAM ASYLUM', 'FOR THE CRIMINALLY INSANE. NO SOLICITORS.', x0 - 1.2, y + h + 4.6, CZ, -1, 0, { w: 7, bg: 0x2a2e2a, posts: false });
  // Watchtowers with sweeping searchlights at two corners.
  for (const [x, z, ph] of [[x0 + 3, z0 + 3, 0], [x1 - 3, z1 - 3, 2]]) {
    solid(ctx, 'painted', box(4, 12, 4, x, y + 6, z), { color: BONE, tag: 'tower' });
    slab(ctx, 'painted', x - 2.8, y + 12, z - 2.8, x + 2.8, y + 12.4, z + 2.8, { color: IRON, tag: 'tower' });
    ctx.buckets.add('painted', box(4.6, 0.3, 4.6, x, y + 15.2, z), 0x2a2e2a);
    for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) ctx.buckets.add('painted', box(0.15, 2.8, 0.15, x + dx, y + 13.8, z + dz), IRON);
    ctx.grapple.push({ x, y: y + 12.4, z, nx: 0, nz: 1, perch: true });
    ctx.facades.push({ minX: x - 2, minY: 0, minZ: z - 2, maxX: x + 2, maxY: y + 12, maxZ: z + 2, style: 'stone' });
    searchlight(ctx, x, y + 13.6, z, ph);
  }
  waterTower(ctx, 724, y, -140);
}

function searchlight(ctx, x, y, z, phase) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xe8f0d8, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(5, 70, 10, 1, true).translate(0, -35, 0).rotateZ(Math.PI / 2 + 0.35), mat);
  beam.position.set(x, y, z);
  beam.userData.dynamic = true;
  beam.castShadow = false;
  beam.name = 'searchlight';
  ctx.scene.add(beam);
  ctx.chunks.addDetail(beam, { minX: x - 70, minY: 0, minZ: z - 70, maxX: x + 70, maxY: y + 10, maxZ: z + 70 }, 'draw');
  glow(ctx, cylinder(0.6, 0.7, 0.9, x, y, z, 10), 0xfff6d8);
  ctx.halos.add(x, y, z, 0xfff6d8, 6);
  ctx.updaters.push((t) => { beam.rotation.y = phase + Math.sin(t * 0.25 + phase) * 1.6; });
}

// ---- grounds: graveyard, lamps, mist, the yard's furniture ----

function grounds(ctx) {
  const rng = ctx.rng;
  // The yard (between the wings, east of the main hall), walled off from the east lawn.
  slab(ctx, 'painted', 724, PY, -114, 725.2, PY + 4, -46, { color: BONE, tag: 'wall' });
  slab(ctx, 'concrete', 653, PY, -112, 724, PY + 0.06, -48, { tag: 'yard', collide: false, uv: [6, 6] });
  for (const z of [-96, -64]) {
    solid(ctx, 'painted', box(0.25, 3.6, 0.25, 708, PY + 1.8, z), { color: IRON, tag: 'prop' });
    ctx.buckets.add('painted', box(0.1, 1.1, 1.8, 708, PY + 3.4, z), 0xd8d4ca);
  }
  for (let k = 0; k < 4; k++) solid(ctx, 'wood', box(3, 0.5, 0.6, 680 + k * 10, PY + 0.25, -60), { tag: 'prop' });
  solid(ctx, 'painted', box(2, 9, 2, 690, PY + 4.5, -80), { color: BONE, tag: 'tower' });
  ctx.grapple.push({ x: 690, y: PY + 9, z: -80, nx: 0, nz: 1, perch: true });
  lampAt(ctx, 690, PY + 9, -80, 1, 0, SICK, { pole: 1.2, pool: 0x2f4a2a });
  board(ctx, 'EXERCISE YARD', 'ONE HOUR. NO ESCAPING.', 660, PY + 2, -110, 1, 0, { w: 3, bg: 0x3e5a46, base: PY });
  // Graveyard outside the west wall by the chapel.
  for (let k = 0; k < 26; k++) {
    const x = 582 + (k % 5) * 3.6 + rng.range(-0.6, 0.6), z = -152 + Math.floor(k / 5) * 4.4 + rng.range(-0.5, 0.5);
    if (z > CZ - CW / 2 - 3) continue;
    const g = rng.chance(0.3) ? new THREE.BoxGeometry(0.25, 1.6, 0.9).translate(0, 0.8, 0) : new THREE.BoxGeometry(0.2, 1.0, 0.7).translate(0, 0.5, 0);
    ctx.buckets.add('painted', g.rotateZ(rng.range(-0.15, 0.15)).translate(x, PY, z), rng.pick([0x6e6a62, 0x58554f, 0x7a766c]));
    if (rng.chance(0.3)) ctx.buckets.add('painted', new THREE.BoxGeometry(0.2, 0.12, 0.7).translate(x, PY + 1.25, z), 0x58554f);
  }
  for (const [x, z] of [[594, -140], [586, -112]]) {
    for (const g of [new THREE.CylinderGeometry(0.2, 0.3, 4, 5).translate(x, PY + 2, z), new THREE.CylinderGeometry(0.06, 0.12, 3, 4).rotateZ(0.9).translate(x + 1, PY + 4, z)]) ctx.buckets.add('painted', g, 0x1e1a18);
  }
  // Sick-green lamps on the paths, low mist everywhere.
  for (const [x, z, nx, nz] of [[606, -96, 1, 0], [606, -64, 1, 0], [660, -20, 0, -1], [700, -136, 0, 1], [720, -60, -1, 0], [596, -118, 1, 0]]) lampAt(ctx, x, PY, z, nx, nz, SICK, { pole: 4.8, pool: 0x2f4a2a, spot: rng.chance(0.6) });
  for (let k = 0; k < 14; k++) ctx.steam.push({ x: rng.range(590, 735), y: PY + 0.2, z: rng.range(-150, -10), s: 1.6 });
}
