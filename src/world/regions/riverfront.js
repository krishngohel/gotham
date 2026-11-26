// The proof region (Long Night 2 wave 1): the river's main stem with two working bascule
// bridges, Lower Gotham's double-decker drive, and the first row of Loop blocks with a stretch of
// the elevated train. Built through the same region framework workstream H uses for the rest of
// the city (docs/design/world-framework.md): own rng per region, chunked buckets, far LOD, the
// shared street graph (regions/streets.js holds the layout numbers this file builds to).
//
// Scale rule (long-night-2.md section 8): plan x0.3, heights x0.45, anything a body touches at
// true size: 1.1 m railings, 4.2 m deck clearance, El bents every 12 m, 0.33 m steps.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { LAYER_FX } from '../../render/layers.js';
import { box, tiledBox, cylinder } from '../buckets.js';
import { solid, glow, lightSpot, edgeGrapples, building, parkedCar, streetLamp } from '../cityBuilder.js';
import { hydrant, newsBoxes, trashCan, mailbox, bench, manhole, puddle, trafficLight, trashBags } from '../streetDressing.js';
import { addGargoyle, plinth } from '../gargoyles.js';
import { addLadder } from '../climbables.js';
import { LEVELS, SCALE } from './data.js';
import { RIVERFRONT as R, CORE_LINES } from './streets.js';

const GREEN = 0x9fcf6a;   // Lower Gotham's sodium-green (research 1.4)
const EL = 0x1f2a26;      // El steel: black-green paint
const STONE = 0x8c877d;
const DOCK_YELLOW = 0xd9b43a;

// ---- small builders shared by the three regions ----

// An axis-aligned slab from bounds, tiled in metres, optionally solid.
function slab(ctx, key, minX, minY, minZ, maxX, maxY, maxZ, { collide = true, tag = '', uv = [4, 4], faces = 'all', color = null } = {}) {
  const g = tiledBox(maxX - minX, maxY - minY, maxZ - minZ, (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, { uvScale: uv, faces });
  if (collide) ctx.collision.addBox(minX, minY, minZ, maxX, maxY, maxZ, tag);
  ctx.buckets.add(key, g, color);
}

// A 1.1 m railing along x (alongX) or z, from a to b at the fixed other coordinate `at`, base y.
// Collides as one thin box so nobody walks, drives or glides off the edge at foot level.
function railing(ctx, alongX, a, b, at, y, { color = PALETTE.steel, post = 2.4 } = {}) {
  const len = b - a, mid = (a + b) / 2, h = SCALE.railing;
  const bx = (l, hh, w, c, yy) => (alongX ? box(l, hh, w, c, yy, at) : box(w, hh, l, at, yy, c));
  ctx.buckets.add('painted', bx(len, 0.08, 0.1, mid, y + h), color);
  ctx.buckets.add('painted', bx(len, 0.05, 0.06, mid, y + h * 0.55), color);
  for (let t = a; t <= b + 1e-6; t += post) ctx.buckets.add('painted', bx(0.07, h, 0.07, t, y + h / 2), color);
  if (alongX) ctx.collision.addBox(a, y, at - 0.15, b, y + h, at + 0.15, 'railing');
  else ctx.collision.addBox(at - 0.15, y, a, at + 0.15, y + h, b, 'railing');
}

// A lamp post standing at height y (streetLamp() always stands at street level).
function lampAt(ctx, x, y, z, nx, nz, color = PALETTE.sodium, { pole = 4.2, pool = 0x6b4520 } = {}) {
  solid(ctx, 'steel', cylinder(0.08, 0.12, pole, x, y + pole / 2, z, 8));
  const hx = x + nx * 0.9, hz = z + nz * 0.9;
  ctx.buckets.add('steel', box(Math.abs(nx) ? 1 : 0.08, 0.08, Math.abs(nz) ? 1 : 0.08, x + nx * 0.45, y + pole - 0.05, z + nz * 0.45));
  ctx.buckets.add('steel', box(0.6, 0.2, 0.6, hx, y + pole, hz));
  glow(ctx, box(0.45, 0.1, 0.45, hx, y + pole - 0.14, hz), color);
  ctx.halos.add(hx, y + pole - 0.3, hz, color, 2.8);
  lightSpot(ctx, hx, y + pole - 0.5, hz, color, 22, 15);
  ctx.reflect.push({ x: hx, y: y + 0.16, z: hz, h: pole, color, w: 0.45, len: 7, k: 0.34 });
  ctx.buckets.add('pool', new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2).translate(hx, y + 0.03, hz), pool);
}

// Lane dashes along x between a and b at z (or along z at x).
function dashes(ctx, alongX, a, b, at, y = 0.02, { gap = 8, len = 3.5 } = {}) {
  for (let t = a + gap / 2; t < b; t += gap) {
    const g = alongX ? new THREE.PlaneGeometry(len, 0.25) : new THREE.PlaneGeometry(0.25, len);
    ctx.buckets.add('lane', g.rotateX(-Math.PI / 2).translate(alongX ? t : at, y, alongX ? at : t));
  }
}

function crosswalk(ctx, x, z, alongX, width = 10, y = 0.02) {
  for (let s = -width / 2; s <= width / 2; s += 1.4) {
    const g = alongX ? new THREE.PlaneGeometry(3, 0.7) : new THREE.PlaneGeometry(0.7, 3);
    ctx.buckets.add('lane', g.rotateX(-Math.PI / 2).translate(alongX ? x : x + s, y, alongX ? z + s : z));
  }
}

// ======================================================================================
// The River: quay wall on the core side, the water channel, the river walk on the north bank,
// bridgehouses, and two bascule bridges (their moving leaves are built by createBascules).
// ======================================================================================
export function buildRiver(ctx) {
  const { rng } = ctx;
  const X0 = -266, X1 = 366;
  const QZ0 = -241, QZ1 = -236;          // quay top (core side), y 0
  const WZ0 = -266;                      // water from WZ0 to QZ0
  const WALK0 = -276;                    // river walk z -276..-266 at y -4.5
  const gaps = R.bridges.map((b) => [b.x - 10, b.x + 10]);
  const outsideGaps = (a, b) => {
    // Splits [a, b] around the bridge openings.
    const out = [];
    let s = a;
    for (const [g0, g1] of gaps) { if (g1 <= s || g0 >= b) continue; if (g0 > s) out.push([s, g0]); s = Math.max(s, g1); }
    if (s < b) out.push([s, b]);
    return out;
  };

  // Quay: a deep concrete wall, its top a paved promenade (a kerb above the core's asphalt).
  slab(ctx, 'concrete', X0, -7, QZ0, X1, 0, QZ1, { tag: 'quay', uv: [6, 6] });
  for (const [a, b] of outsideGaps(X0, X1)) {
    slab(ctx, 'sidewalk', a, 0, QZ0, b, 0.15, QZ1, { tag: 'sidewalk' });
    railing(ctx, true, a, b, QZ0 + 0.2, 0.15);
  }
  // Stone coping along the canal edge, and the wall's face down to the water.
  ctx.buckets.add('painted', box(X1 - X0, 0.35, 0.6, (X0 + X1) / 2, -0.2, QZ0 - 0.1), STONE);
  for (let x = X0 + 12; x < X1; x += 24) ctx.buckets.add('painted', box(1.2, 5.4, 0.3, x, -3.2, QZ0 - 0.15), 0x3e4146);
  for (let x = X0 + 18; x < X1 - 6; x += 30) {
    if (gaps.some(([g0, g1]) => x > g0 - 4 && x < g1 + 4)) continue;
    lampAt(ctx, x, 0.15, QZ1 - 1.2, 0, -1);
  }

  // River walk: paved, at y -4.5, 10 m wide, with a railing over the water.
  slab(ctx, 'concrete', X0, -7, WALK0, X1, LEVELS.riverWalk - 0.15, WZ0, { tag: 'riverWalk', uv: [6, 6] });
  slab(ctx, 'sidewalk', X0, LEVELS.riverWalk - 0.15, WALK0, X1, LEVELS.riverWalk, WZ0, { tag: 'sidewalk' });
  railing(ctx, true, X0, X1, WZ0 - 0.2, LEVELS.riverWalk);
  ctx.buckets.add('painted', box(X1 - X0, 0.3, 0.5, (X0 + X1) / 2, LEVELS.riverWalk - 0.15, WZ0 + 0.05), STONE);
  // River walk lamps (low, warm), benches and planters, steps up from Lower Gotham's lower deck.
  for (let x = X0 + 14; x < X1 - 4; x += 24) {
    lampAt(ctx, x, LEVELS.riverWalk, WZ0 - 1.2, 0, 1);
    if (rng.chance(0.5)) riverBench(ctx, x + 6, WZ0 - 1.6);
  }
  ctx.steam.push({ x: -120, y: LEVELS.riverWalk + 0.2, z: -273, s: 1.1 }, { x: 140, y: LEVELS.riverWalk + 0.2, z: -273, s: 1.1 });

  // Bridgehouses: one at each corner of each bridge, stone with a copper roof and lit windows.
  for (const b of R.bridges) {
    for (const s of [-1, 1]) {
      const x = b.x + s * 13.5;
      bridgehouse(ctx, x, 0.15, (QZ0 + QZ1) / 2 + 0.5, 4.2, 4.2);
      bridgehouse(ctx, x, 0, R.bridges[0].z1 - 3, 4.2, 4.2);
    }
    // Abutments under each hinge: dark pits for the counterweights.
    for (const z of [b.z0, b.z1]) ctx.buckets.add('painted', box(22, 5.5, 1.2, b.x, -3.3, z + (z === b.z0 ? -0.6 : 0.6)), 0x2a2c30);
  }
}

// A bench on the river walk (streetDressing's benches stand at street level).
function riverBench(ctx, x, z) {
  const y = LEVELS.riverWalk;
  solid(ctx, 'wood', box(1.8, 0.1, 0.5, x, y + 0.45, z), { tag: 'prop' });
  ctx.buckets.add('wood', box(1.8, 0.45, 0.08, x, y + 0.75, z - 0.24));
  for (const s of [-0.75, 0.75]) ctx.buckets.add('steel', box(0.08, 0.45, 0.5, x + s, y + 0.22, z));
}

function bridgehouse(ctx, x, y, z, w, d) {
  const h = 5.2;
  solid(ctx, 'painted', box(w, h, d, x, y + h / 2, z), { color: 0x7a746a, tag: 'bridgehouse' });
  ctx.buckets.add('painted', box(w + 0.5, 0.35, d + 0.5, x, y + h + 0.1, z), STONE);
  solid(ctx, 'painted', new THREE.ConeGeometry(w * 0.62, 2.2, 4).rotateY(Math.PI / 4).translate(x, y + h + 1.35, z), { color: 0x3f6b5c, tag: 'roof' });
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    glow(ctx, box(Math.abs(nz) ? 1.6 : 0.06, 1.1, Math.abs(nx) ? 1.6 : 0.06, x + nx * (w / 2 + 0.02), y + 3.2, z + nz * (d / 2 + 0.02)), 0xc89a52);
  }
  ctx.halos.add(x, y + h + 2.6, z, PALETTE.crimson, 2);
  ctx.grapple.push({ x, y: y + h + 0.45, z, nx: 0, nz: 1, perch: true });
}

// ======================================================================================
// Lower Gotham: the double-decker drive. Upper deck at y 0 (z -306..-276), lower deck at y -5.5
// under it between x -200 and 290 (4.2 m clearance), ramps between them in the south half at
// both ends, loading docks along the north wall under the Loop, sodium-green light below.
// ======================================================================================
export function buildLowerGotham(ctx) {
  const { rng } = ctx;
  const Z0 = -306, Z1 = -276, X0 = -266, X1 = 366;
  const [C0, C1] = R.covered;           // covered stretch
  const LOW = LEVELS.lowerDeck, SLAB = -1.3;
  const ZM = R.upperZ;                  // drive centre line
  const SW = 5;                         // sidewalk width each side of the upper drive

  // No rain falls under the upper deck (world.js hides it while the camera is in here).
  ctx.world?.covers.push({ minX: C0, maxX: C1, minY: -8, maxY: SLAB, minZ: Z0, maxZ: Z1 });
  // ---- lower deck ----
  slab(ctx, 'asphalt', C0, -7, Z0, C1, LOW, Z1, { tag: 'lowerDeck', uv: [17, 17] });
  // End walls of the lower deck (north half only: the south half opens onto the ramps).
  slab(ctx, 'concrete', C0 - 1, LOW, Z0, C0, SLAB, ZM, { tag: 'wall' });
  slab(ctx, 'concrete', C1, LOW, Z0, C1 + 1, SLAB, ZM, { tag: 'wall' });
  // North wall: the Loop's basements, with loading docks every 30 m.
  slab(ctx, 'concrete', C0, LOW, Z0 - 1, C1, SLAB, Z0, { tag: 'wall' });
  let dockN = 0;
  for (let x = C0 + 18; x < C1 - 10; x += 30) {
    const w = 8;
    // Dock platform 1.2 m high, bumpers, a dark roller door, a lamp over it.
    slab(ctx, 'concrete', x - w / 2, LOW, Z0, x + w / 2, LOW + 1.2, Z0 + 3, { tag: 'dock' });
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) ctx.buckets.add('painted', box(0.42, 0.35, 0.16, x + s * (w / 2 - 0.6), LOW + 0.2 + k * 0.35, Z0 + 3.08), k % 2 ? 0x111214 : DOCK_YELLOW);
    }
    ctx.buckets.add('painted', box(w - 1.6, 3.2, 0.1, x, LOW + 1.2 + 1.6, Z0 + 0.06), dockN % 3 === 1 ? 0x3a2c1c : 0x1a1c20);
    ctx.buckets.add('painted', box(w - 1.4, 0.18, 0.3, x, LOW + 4.0, Z0 + 0.15), 0x2a2d33);
    glow(ctx, box(0.5, 0.12, 0.3, x, LOW + 3.75, Z0 + 0.35), GREEN);
    ctx.halos.add(x, LOW + 3.65, Z0 + 0.5, GREEN, 2.6);
    // Stairs up onto the platform at one end.
    for (let k = 1; k <= 3; k++) slab(ctx, 'concrete', x + w / 2, LOW, Z0, x + w / 2 + (4 - k) * 0.4, LOW + k * 0.4, Z0 + 3, { tag: 'step' });
    if (rng.chance(0.6)) for (const s of [-1.5, 0.2]) solid(ctx, 'wood', box(1.2, 1.0, 1.2, x + s, LOW + 1.7, Z0 + 1.4), { tag: 'crate' });
    dockN++;
  }
  // Columns: two rows every 12 m, with sodium-green strips on their caps.
  for (let x = C0 + 6; x < C1; x += 12) {
    for (const z of [-298, -284]) {
      solid(ctx, 'concrete', box(0.9, SLAB - LOW, 0.9, x, (LOW + SLAB) / 2, z), { tag: 'column' });
      ctx.buckets.add('painted', box(1.1, 0.4, 1.1, x, SLAB - 0.2, z), 0x4a4d52);
      // yellow-black hazard band at bumper height
      ctx.buckets.add('painted', box(0.94, 0.5, 0.94, x, LOW + 0.6, z), DOCK_YELLOW);
    }
    // Green light strip under the deck between the column rows, a pool every other bay.
    glow(ctx, box(2.4, 0.08, 0.3, x, SLAB - 0.05, ZM), GREEN);
    ctx.halos.add(x, SLAB - 0.25, ZM, GREEN, 2.2);
    if (((x - C0 - 6) / 12) % 2 === 0) {
      ctx.buckets.add('pool', new THREE.PlaneGeometry(11, 9).rotateX(-Math.PI / 2).translate(x, LOW + 0.03, ZM), 0x2f4a1c);
      lightSpot(ctx, x, SLAB - 0.6, ZM, GREEN, 20, 14);
    }
  }
  // Lower deck markings, jersey barriers along the centre in places, steam from grates.
  dashes(ctx, true, C0, C1, ZM, LOW + 0.02);
  dashes(ctx, true, C0, C1, ZM - 7, LOW + 0.02, { gap: 12, len: 6 });
  dashes(ctx, true, C0, C1, ZM + 7, LOW + 0.02, { gap: 12, len: 6 });
  for (let x = C0 + 40; x < C1 - 40; x += 64) {
    for (let k = 0; k < 3; k++) solid(ctx, 'painted', box(3.6, 0.85, 0.6, x + k * 3.8, LOW + 0.42, ZM), { color: 0x8a8578, tag: 'barrier' });
  }
  for (let x = C0 + 30; x < C1; x += 55) ctx.steam.push({ x: x + rng.range(-6, 6), y: LOW + 0.2, z: ZM + rng.range(-5, 5), s: 1.3 });
  // Steps from the lower deck up to the river walk (1 m) every 48 m, at its south edge.
  for (let x = C0 + 24; x < C1 - 4; x += 48) {
    for (let k = 1; k <= 3; k++) slab(ctx, 'concrete', x - 2.5, LOW, Z1 - (4 - k), x + 2.5, LOW + k * (1 / 3), Z1, { tag: 'step' });
  }

  // ---- upper deck (covered stretch) ----
  slab(ctx, 'concrete', C0, SLAB, Z0, C1, -0.2, Z1, { tag: 'upperDeck', uv: [6, 6] });
  slab(ctx, 'asphalt', C0, -0.2, Z0 + SW, C1, 0, Z1 - SW, { tag: 'road', uv: [17, 17], faces: [2] });
  slab(ctx, 'sidewalk', C0, -0.2, Z0, C1, 0.15, Z0 + SW, { tag: 'sidewalk' });
  slab(ctx, 'sidewalk', C0, -0.2, Z1 - SW, C1, 0.15, Z1, { tag: 'sidewalk' });

  // ---- open ends: the north half carries the upper road on fill, the south half the ramps ----
  for (const [a, b] of [[X0, C0], [C1, X1]]) {
    slab(ctx, 'concrete', a, -7, Z0, b, -0.2, ZM, { tag: 'fill', uv: [6, 6] });
    slab(ctx, 'asphalt', a, -0.2, Z0 + SW, b, 0, ZM, { tag: 'road', uv: [17, 17], faces: [2] });
    slab(ctx, 'sidewalk', a, -0.2, Z0, b, 0.15, Z0 + SW, { tag: 'sidewalk' });
  }
  ramp(ctx, R.rampW.top, C0, X0, ZM, Z1);
  ramp(ctx, R.rampE.top, C1, X1, ZM, Z1);

  // Balustrade over the river walk (stone posts, open where the bridges land) and between the
  // ramps and the upper road.
  const gaps = R.bridges.map((b) => [b.x - 10, b.x + 10]);
  let s0 = C0;
  for (const [g0, g1] of gaps) { balustrade(ctx, s0, g0, Z1 - 0.2); s0 = g1; }
  balustrade(ctx, s0, C1, Z1 - 0.2);
  for (const [a, b] of [[X0 + 8, C0], [C1, X1 - 8]]) railing(ctx, true, a, b, ZM + 0.2, 0, { color: STONE });

  // Upper deck markings, crosswalks at the Loop streets, obelisk lamps on the river side.
  dashes(ctx, true, C0, C1, ZM);
  dashes(ctx, true, C0, C1, ZM - 5, 0.02, { gap: 12, len: 6 });
  dashes(ctx, true, C0, C1, ZM + 5, 0.02, { gap: 12, len: 6 });
  for (const x of CORE_LINES) if (x > C0 && x < C1) crosswalk(ctx, x, ZM - 13.5, true, 12);
  for (let x = C0 + 10; x < C1; x += 24) {
    if (gaps.some(([g0, g1]) => x > g0 - 3 && x < g1 + 3)) continue;
    obeliskLamp(ctx, x, Z1 - 1.2);
    if (rng.chance(0.4)) streetLamp(ctx, x + 12, Z0 + 1.2, 0, 1);
  }
  for (let x = C1 + 20; x < X1 - 8; x += 24) streetLamp(ctx, x, Z0 + 1.2, 0, 1);
  for (let x = X0 + 14; x < C0; x += 24) streetLamp(ctx, x, Z0 + 1.2, 0, 1);
  // Kerbside furniture on the upper deck.
  for (let x = C0 + 15; x < C1; x += 36) {
    if (rng.chance(0.5)) hydrant(ctx, x, Z0 + SW - 0.6);
    if (rng.chance(0.4)) newsBoxes(ctx, x + 6, Z0 + SW - 0.8, 0, 1);
    if (rng.chance(0.3)) trashCan(ctx, x - 5, Z1 - SW + 0.7);
  }
  for (let k = 0; k < 6; k++) parkedCar(ctx, C0 + 30 + k * 70 + rng.range(-8, 8), Z0 + SW + 1.2, true);
  for (let x = C0 + 20; x < C1; x += 40) manhole(ctx, x + rng.range(-6, 6), ZM + rng.range(-6, 6));
  for (let k = 0; k < 16; k++) puddle(ctx, rng.range(C0, C1), 0.018, ZM + rng.range(-9, 9), rng.range(1.4, 3.4));
  for (let k = 0; k < 14; k++) puddle(ctx, rng.range(C0, C1), LOW + 0.018, ZM + rng.range(-12, 12), rng.range(1.4, 3.4));
}

// A ramp in the south half of the deck (z0..z1) from its top (y 0, at x `top`) down to the
// lower deck's open end (y -5.5, at x `bottom`), with a level plaza from the top out to the
// region edge. Drawn as one sloped road; collides as 1 m steps of about 0.1 m (vehicles and the
// hero step 0.45 m), with a stepped parapet on the river side.
function ramp(ctx, top, bottom, edge, z0, z1) {
  const LOW = LEVELS.lowerDeck;
  const dir = Math.sign(bottom - top);
  const len = Math.abs(bottom - top), w = z1 - z0;
  const pa = Math.min(edge, top), pb = Math.max(edge, top);
  slab(ctx, 'concrete', pa, -7, z0, pb, -0.2, z1, { tag: 'fill', uv: [6, 6] });
  slab(ctx, 'asphalt', pa, -0.2, z0, pb, 0, z1, { tag: 'road', uv: [17, 17], faces: [2] });
  railing(ctx, true, pa, pb, z1 - 0.3, 0, { color: STONE });
  // Sloped road surface.
  const g = new THREE.PlaneGeometry(Math.hypot(len, LOW), w).rotateX(-Math.PI / 2);
  g.rotateZ((dir > 0 ? -1 : 1) * Math.atan2(-LOW, len));
  g.translate((top + bottom) / 2, LOW / 2, (z0 + z1) / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 17, (uv.getY(i) * w) / 17);
  ctx.buckets.add('asphalt', g);
  const surf = (x) => (LOW * Math.abs(x - top)) / len; // road height at x
  for (let k = 0; k < Math.ceil(len); k++) {
    const xa = top + dir * k, xb = top + dir * Math.min(len, k + 1);
    ctx.collision.addBox(Math.min(xa, xb), -7, z0, Math.max(xa, xb), surf((xa + xb) / 2) + 0.05, z1, 'ramp');
  }
  // Under-ramp wall (both faces, so it reads from the river walk and from the lower deck), and a
  // stepped parapet on the river side.
  const P = [top, 0, z1, bottom, LOW, z1, bottom, -7, z1, top, 0, z1, bottom, -7, z1, top, -7, z1];
  const R2 = [];
  for (let i = P.length - 3; i >= 0; i -= 3) R2.push(P[i], P[i + 1], P[i + 2]);
  for (const arr of [P, R2]) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    wg.computeVertexNormals();
    ctx.buckets.add('concrete', wg);
  }
  for (let k = 0; k < len; k += 5) {
    const xa = top + dir * k, xb = top + dir * Math.min(len, k + 5);
    const yTop = surf(xb) + 1.0;
    solid(ctx, 'concrete', box(Math.abs(xb - xa), yTop - surf(xb) + 1.0, 0.4, (xa + xb) / 2, (yTop + surf(xb) - 1.0) / 2, z1 - 0.2), { tag: 'parapet' });
  }
}

function balustrade(ctx, a, b, z) {
  if (b - a < 1) return;
  ctx.buckets.add('painted', box(b - a, 0.25, 0.5, (a + b) / 2, 1.1, z), STONE);
  ctx.buckets.add('painted', box(b - a, 0.2, 0.45, (a + b) / 2, 0.25, z), STONE);
  for (let x = a + 0.4; x < b; x += 0.55) ctx.buckets.add('painted', cylinder(0.09, 0.13, 0.75, x, 0.72, z, 6), STONE);
  ctx.collision.addBox(a, 0, z - 0.25, b, 1.23, z + 0.25, 'balustrade');
}

// The upper deck's river-side lamp: a stone obelisk with a lantern (research 1.4).
function obeliskLamp(ctx, x, z) {
  solid(ctx, 'painted', box(0.7, 1.2, 0.7, x, 0.75, z), { color: STONE, tag: 'prop' });
  ctx.buckets.add('painted', new THREE.CylinderGeometry(0.12, 0.3, 3.4, 4).rotateY(Math.PI / 4).translate(x, 3.05, z), STONE);
  glow(ctx, box(0.42, 0.5, 0.42, x, 5.0, z), PALETTE.window);
  ctx.buckets.add('painted', new THREE.ConeGeometry(0.4, 0.5, 4).rotateY(Math.PI / 4).translate(x, 5.5, z), 0x2a2d33);
  ctx.halos.add(x, 5.0, z, PALETTE.window, 3.6);
  lightSpot(ctx, x, 4.6, z, PALETTE.window, 20, 14);
  ctx.reflect.push({ x, y: 0.16, z, h: 5, color: PALETTE.window, w: 0.5, len: 8, k: 0.35 });
  ctx.buckets.add('pool', new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2).translate(x, 0.18, z), 0x6b4520);
}

// ======================================================================================
// The Loop, first row: eight 60 m blocks between Lower Gotham's upper deck (z -306) and the
// row's north street (z -359, under the El). Chicago-school slabs, art-deco setback towers,
// one black International-style box and the two round "Corncobs", all at the scale rule's
// heights (40-120 m). Each block is a sidewalk slab with its buildings on it.
// ======================================================================================
const LOOP_BLOCKS = [
  // x centre: buildings as [dx, dz, w, d, h, style, extras]
  { x: -240, list: [[-1, 0, 20, 44, 38, 'brick', { fireEscape: 'w', storefront: true }], [11.5, 0, 21, 44, 50, 'stone', { storefront: true }]] },
  { x: -180, list: [[0, 0, 44, 44, 48, 'deco', { tiers: [{ w: 30, d: 30, h: 22 }, { w: 18, d: 18, h: 16, spire: true }], storefront: true, gargoyles: 48 }]] },
  { x: -120, list: [[0, -10.5, 44, 23, 52, 'concrete', { storefront: true }], [0, 12, 44, 20, 30, 'brick', { fireEscape: 'n' }]] },
  { x: -60, list: [[0, 0, 40, 40, 72, 'steel', { parapet: true, cornice: false, props: 'none' }]] },
  { x: 0, list: [[0, 0, 44, 42, 56, 'deco', { tiers: [{ w: 32, d: 30, h: 24 }, { w: 22, d: 20, h: 18 }, { w: 12, d: 12, h: 12, spire: true }], storefront: true, gargoyles: 56, crown: true }]] },
  { x: 60, list: [[-11.5, 0, 21, 44, 46, 'stone', { storefront: true }], [11.5, 0, 21, 44, 34, 'brick', { storefront: true, fireEscape: 'e' }]] },
  { x: 120, list: [[0, 0, 42, 44, 50, 'deco', { tiers: [{ w: 28, d: 28, h: 18 }, { w: 16, d: 16, h: 12 }], storefront: true, gargoyles: 50 }]] },
  { x: 180, corncobs: true },
];

export function buildLoopRow(ctx) {
  const { rng } = ctx;
  const ZS = R.loopSouthZ, ZN = R.loopStreetZ;  // block south edge, north street centre
  const BZ = (ZS + (ZN + 7)) / 2;                // block centre z (-329)
  const BD = ZS - (ZN + 7);                      // block depth (46)
  const [X0, X1] = R.loopX;

  // Ground: asphalt over the row, sidewalks per block.
  ctx.buckets.add('asphalt', tiledBox(X1 - X0, 0.2, ZS - (ZN - 7), (X0 + X1) / 2, -0.1, (ZS + ZN - 7) / 2, { uvScale: [17, 17], faces: [2] }));
  ctx.collision.addBox(X0, -1, ZN - 7, X1, 0, ZS, 'road');
  for (const blk of LOOP_BLOCKS) {
    const bx0 = Math.max(X0 + 1, blk.x - 23), bx1 = Math.min(X1 - 1, blk.x + 23);
    slab(ctx, 'sidewalk', bx0, 0, BZ - BD / 2, bx1, 0.15, BZ + BD / 2, { tag: 'sidewalk' });
    // Lamps on the corners and mid-edges, facing the streets.
    const e = 23 - 0.8;
    for (const [lx, lz, nx, nz] of [[-e, -e, 0, -1], [e, -e, 1, 0], [e, e, 0, 1], [-e, e, -1, 0], [0, -e, 0, -1], [e, 0, 1, 0], [-e, 0, -1, 0]]) {
      const px = blk.x + lx, pz = BZ + lz;
      if (px < bx0 || px > bx1) continue;
      streetLamp(ctx, px, pz, nx, nz);
    }
    if (blk.corncobs) corncobs(ctx, blk.x, BZ);
    else for (const [dx, dz, w, d, h, style, extra = {}] of blk.list) {
      const b = {
        id: `loop${blk.x}_${dx}`, x: blk.x + dx, z: BZ + dz, w, d, h, style,
        roof: 'flat', parapet: true, cornice: style !== 'steel', storefront: false, tiers: [], props: 'auto', neon: [],
        district: 'loop', ...extra,
      };
      building(ctx, b);
      if (extra.gargoyles) {
        const hw = w / 2 - 0.7, hd = d / 2 - 0.7;
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          plinth(ctx, b.x + sx * hw, extra.gargoyles, b.z + sz * hd);
          addGargoyle(ctx, b.x + sx * hw, extra.gargoyles + 0.9, b.z + sz * hd, Math.atan2(sx, sz));
        }
      }
      if (extra.crown) floodlitCrown(ctx, b);
      if (style === 'stone' || style === 'concrete') chicagoLedges(ctx, b);
    }
    // Street dressing along the block's south (Lower Gotham) and north (El) faces.
    for (const [nz, off] of [[1, 22.25], [-1, 22.25]]) {
      for (let k = 0; k < 3; k++) {
        const px = blk.x + rng.range(-18, 18), pz = BZ + nz * off;
        if (px < bx0 + 2 || px > bx1 - 2) continue;
        const r = rng.next();
        if (r < 0.3) hydrant(ctx, px, pz);
        else if (r < 0.5) trashCan(ctx, px, pz);
        else if (r < 0.65) mailbox(ctx, px, pz, 0, nz);
        else if (r < 0.8) newsBoxes(ctx, px, pz, 0, nz);
        else trashBags(ctx, px, pz - nz * 20);
      }
    }
    if (rng.chance(0.7)) parkedCar(ctx, blk.x + rng.range(-14, 14), ZN + 4.3, true);
  }
  // Street paint: north street dashes, x street dashes, crosswalks.
  dashes(ctx, true, X0 + 4, X1 - 4, ZN);
  for (const x of CORE_LINES) {
    if (x < X0 || x > X1) continue;
    dashes(ctx, false, ZN + 7, ZS, x, 0.02);
    crosswalk(ctx, x, ZN + 8.6, false, 10);
    crosswalk(ctx, x - 8.6, ZN, true, 10);
    manhole(ctx, x + rng.range(-3, 3), ZN + rng.range(-4, 4));
  }
  for (let k = 0; k < 18; k++) puddle(ctx, rng.range(X0 + 4, X1 - 4), 0.018, ZN + rng.range(-6, 6), rng.range(1.4, 3.6));
  // Traffic lights at the El street's intersections.
  const lights = [];
  for (const x of CORE_LINES) if (x > X0 + 10 && x < X1 - 10) lights.push(trafficLight(ctx, x + 6.8, ZN + 8.4, 0, -1, (x * 0.13) % 1));
  ctx.updaters.push((t) => {
    for (const L of lights) {
      const c = ((t / 12 + L.phase) % 1 + 1) % 1 * 12;
      const on = c < 5 ? 2 : c < 6.5 ? 1 : 0;
      L.ids.forEach((id, k) => ctx.halos.setSize(id, k === on ? 1.6 : 0.01));
      ctx.halos.setSize(L.walk, on === 0 && Math.floor(t * 2) % 2 ? 0.9 : 0.01);
    }
  });
  elStretch(ctx, ZN);
}

// Chicago-school ledges: a projecting band every third floor (3.4 m floors) that the hero can
// stand on and catch (the ledge probe finds box edges), with grapple points along it.
function chicagoLedges(ctx, b) {
  for (let y = 3.4 * 4; y < b.h - 6; y += 3.4 * 3) {
    for (const [nx, nz] of [[0, -1], [0, 1]]) {
      const z = b.z + nz * (b.d / 2 + 0.3);
      solid(ctx, 'trim', box(b.w + 0.8, 0.3, 0.6, b.x, y, z), { tag: 'ledge' });
      for (let t = -b.w / 2 + 4; t < b.w / 2; t += 8) ctx.grapple.push({ x: b.x + t, y: y + 0.15, z, nx, nz });
    }
  }
}

// Cool-white floodlights washing a deco crown from its setback (the money districts' look).
function floodlitCrown(ctx, b) {
  let top = b.h;
  for (const t of b.tiers) top += t.h;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = b.x + sx * (b.w / 2 - 1.2), z = b.z + sz * (b.d / 2 - 1.2);
    ctx.halos.add(x, b.h + 1.2, z, PALETTE.windowCool, 9);
    glow(ctx, box(0.5, 0.4, 0.5, x, b.h + 1.1, z), PALETTE.windowCool);
  }
  ctx.halos.add(b.x, top + 15, b.z, PALETTE.crimson, 4);
  ctx.blinkers.push({ i: ctx.halos.count - 1, size: 4, phase: b.x * 0.01 });
}

// "The Corncobs": two round 95 m towers on a shared podium, scalloped balconies all the way up,
// the lower floors an open spiral car park (research 1.9, an original design, not a copy).
function corncobs(ctx, cx, cz) {
  const R0 = 10, H = 95;
  for (const dx of [-12, 12]) {
    const x = cx + dx, z = cz;
    // Core and floors.
    solid(ctx, 'concrete', cylinder(4.2, 4.2, H, x, H / 2, z, 16), { tag: 'building' });
    ctx.facades?.push({ minX: x - R0, minY: 0, minZ: z - R0, maxX: x + R0, maxY: H, maxZ: z + R0, style: 'concrete' });
    ctx.roofs.push({ id: `corncob${dx}`, x, z, w: R0 * 2, d: R0 * 2, y: H, district: 'loop' });
    for (let y = 3.2, k = 0; y < H; y += 3.2, k++) {
      const garage = y < 19 * 1;
      ctx.buckets.add('concrete', cylinder(R0, R0, 0.35, x, y, z, 24));
      // Scalloped balcony lips: a ring of short arcs, each a perch-sized ledge.
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2 + (k % 2) * 0.13;
        const bx = x + Math.cos(ang) * (R0 + 0.6), bz = z + Math.sin(ang) * (R0 + 0.6);
        ctx.buckets.add('painted', box(3.6, 0.9, 0.18, 0, 0, 0).rotateY(-ang + Math.PI / 2).translate(bx, y + 0.55, bz), garage ? 0x6a6c70 : 0xbfb9ae);
      }
      if (!garage) {
        // Window wall set back inside the balconies, lit at random.
        ctx.buckets.add('glass', cylinder(R0 - 1.6, R0 - 1.6, 2.8, x, y + 1.55, z, 20, true));
        if (ctx.rng.chance(0.35)) {
          const ang = ctx.rng.range(0, Math.PI * 2);
          glow(ctx, box(2.4, 1.8, 0.1, 0, 0, 0).rotateY(-ang + Math.PI / 2).translate(x + Math.cos(ang) * (R0 - 1.55), y + 1.5, z + Math.sin(ang) * (R0 - 1.55)), PALETTE.window);
        }
      } else if (k % 2 === 0) {
        // Car park: a parked car silhouette or two on the open floors.
        ctx.buckets.add('painted', box(4, 1.2, 1.8, x + 6, y + 0.8, z), 0x3a3f48);
      }
      // A walkable floor ring (balcony) for landing and catching.
      if (k % 3 === 2) {
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          ctx.grapple.push({ x: x + Math.cos(ang) * R0, y: y + 0.18, z: z + Math.sin(ang) * R0, nx: Math.cos(ang), nz: Math.sin(ang) });
        }
      }
    }
    // Floors collide as a square and a cross inscribed in the circle (stand on any balcony).
    for (let y = 3.2; y < H; y += 3.2) {
      for (const [hx, hz] of [[0.72, 0.72], [1, 0.5], [0.5, 1]]) ctx.collision.addBox(x - R0 * hx, y - 0.2, z - R0 * hz, x + R0 * hx, y + 0.18, z + R0 * hz, 'floor');
    }
    ctx.collision.addBox(x - R0 * 0.72, H - 0.5, z - R0 * 0.72, x + R0 * 0.72, H + 0.3, z + R0 * 0.72, 'roof');
    // Roof: a flat disc with a parapet ring, a beacon and a rooftop perch.
    ctx.buckets.add('roof', cylinder(R0 + 0.4, R0 + 0.4, 0.6, x, H + 0.3, z, 24));
    ctx.buckets.add('painted', cylinder(R0 + 0.5, R0 + 0.5, 1.0, x, H + 1.0, z, 24, true), 0xbfb9ae);
    ctx.halos.add(x, H + 2.5, z, PALETTE.crimson, 3);
    ctx.blinkers.push({ i: ctx.halos.count - 1, size: 3, phase: dx });
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      ctx.grapple.push({ x: x + Math.cos(ang) * R0, y: H + 0.6, z: z + Math.sin(ang) * R0, nx: Math.cos(ang), nz: Math.sin(ang) });
    }
    // A maintenance ladder up the core from the podium roof to the first balcony ring.
    addLadder(ctx.climbables, { x: x + 4.3, z, nx: 1, nz: 0, bottom: 6, top: 9.6 });
  }
  // Podium between the towers (shops), with a lit sign band.
  const b = { id: 'corncobPodium', x: cx, z: cz + 17, w: 44, d: 10, h: 6, style: 'concrete', roof: 'flat', parapet: true, cornice: false, storefront: true, tiers: [], props: 'none', neon: [], district: 'loop' };
  building(ctx, b);
}

// One stretch of the El (the Loop rectangle's south leg) over the row's north street: steel
// bents every 12 m with lattice bracing, cross girders, a 9 m deck with two tracks on top
// (rail top y 7.5, underside y 5.5), and lamps hung under it. Workstream H continues it north
// at x +-90 and adds the trains.
function elStretch(ctx, zc) {
  const XA = -96, XB = 96;
  const DECK0 = 5.5, DECK1 = 7.1, RAIL = 7.5;
  const zA = zc - 4.5, zB = zc + 4.5;     // deck edges
  const curbA = zc - 6.2, curbB = zc + 6.2; // column lines at the curbs
  for (let x = XA; x <= XB + 1e-6; x += SCALE.elBent) {
    for (const z of [curbA, curbB]) {
      solid(ctx, 'painted', box(0.55, DECK0, 0.55, x, DECK0 / 2, z), { color: EL, tag: 'elColumn' });
      ctx.buckets.add('painted', box(0.9, 0.3, 0.9, x, 0.15, z), 0x2b3330);
      // Lattice: two diagonals per column face.
      for (const s of [-1, 1]) ctx.buckets.add('painted', box(0.06, 3.6, 0.06, 0, 0, 0).rotateX(s * 0.32).translate(x, DECK0 - 2.2, z), EL);
    }
    // Cross girder (bent) over the street.
    ctx.buckets.add('painted', box(0.7, 0.8, curbB - curbA + 0.8, x, DECK0 - 0.4, zc), EL);
    // Lamp hung under the deck.
    if (Math.round((x - XA) / SCALE.elBent) % 2 === 0) {
      glow(ctx, box(0.5, 0.15, 0.5, x + 6, DECK0 - 0.3, zc), PALETTE.sodium);
      ctx.halos.add(x + 6, DECK0 - 0.45, zc, PALETTE.sodium, 2.6);
      lightSpot(ctx, x + 6, DECK0 - 0.8, zc, PALETTE.sodium, 22, 14);
      ctx.buckets.add('pool', new THREE.PlaneGeometry(8, 7).rotateX(-Math.PI / 2).translate(x + 6, 0.04, zc), 0x6b4520);
    }
  }
  // Longitudinal girders and the deck.
  for (const z of [zA + 0.4, zB - 0.4]) ctx.buckets.add('painted', box(XB - XA + 4, 1.0, 0.5, 0, DECK0 + 0.5, z), EL);
  solid(ctx, 'painted', box(XB - XA + 4, DECK1 - DECK0 - 1.0, zB - zA, 0, DECK0 + 1.0 + (DECK1 - DECK0 - 1.0) / 2, zc), { color: 0x2f2a24, tag: 'elDeck' });
  // Ties and rails: two tracks.
  for (const tz of [zc - 2.2, zc + 2.2]) {
    for (let x = XA - 2; x < XB + 2; x += 0.9) ctx.buckets.add('wood', box(0.22, 0.16, 2.6, x, DECK1 + 0.08, tz));
    for (const s of [-0.72, 0.72]) ctx.buckets.add('painted', box(XB - XA + 4, 0.24, 0.1, 0, RAIL - 0.12, tz + s), 0x6e6a62);
  }
  ctx.collision.addBox(XA - 2, DECK1, zA, XB + 2, DECK1 + 0.16, zB, 'elDeck');
  edgeGrapples(ctx, 0, zc, XB - XA + 4, zB - zA, DECK1 + 0.16, 12);
  // A station platform stub at the middle (stairs come later with the stations).
  slab(ctx, 'wood', -14, DECK1, zB, 14, DECK1 + 0.3, zB + 2.4, { tag: 'platform' });
  ctx.buckets.add('painted', box(28, 0.2, 2.8, 0, DECK1 + 3.4, zB + 1.2), 0x3b4a6e);
  for (let x = -12; x <= 12; x += 6) ctx.buckets.add('painted', box(0.18, 3.1, 0.18, x, DECK1 + 1.85, zB + 2.2), EL);
  ctx.halos.add(0, DECK1 + 3.1, zB + 1.2, PALETTE.windowCool, 4);
}
