// Lakeshore Drive (workstream H2): the city's fast road, four lanes and a planted median along the
// lake from Gotham Mile's latitude to the Museum Campus. North of the river it runs between
// Robinson Park and the seawall promenade; at the river mouth it swings out over the lake on a
// viaduct (Lower Gotham and the river own the shore there), links to Lower Gotham's east plaza and
// to the quay over the river lock, and swings back to the shore beside Old Gotham (research 1.6,
// "S-curve at the river mouth"). Built once, by the lakefront region; pieces south of the river
// land in their own chunks like everything else.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { box, cylinder } from '../buckets.js';
import { solid, glow, lightSpot } from '../cityBuilder.js';
import { EAST, LAKE_LEVEL, SHORE_X, lsdLine } from './eastLayout.js';
import { LEVELS } from './data.js';
import { slab, railing, railLine, ribbon, ribbonBoxes, laneLine, offsetLine, resample, turned, globeLamp, board, parkBench, STONE, IRON } from './eastKit.js';

const L = EAST.lsd;
const HALF = L.width / 2;             // 11 m kerb to centre
const PARAPET = HALF + 0.8;           // viaduct parapets
const overLake = (x) => x > SHORE_X - 8;

// Pieces of a polyline split into runs of about `len` metres (so each lands in its own chunk).
function pieces(pts, len = 60) {
  const s = resample(pts, 3);
  const out = [];
  const per = Math.max(2, Math.round(len / 3));
  for (let i = 0; i < s.length - 1; i += per) out.push(s.slice(i, Math.min(s.length, i + per + 1)));
  return out;
}

// Junctions where the median and the parapets open (z of the crossing on the drive's line).
const JUNCTIONS = [...EAST.crossNorth, -450, EAST.lgLink.z, EAST.causeway.z, ...EAST.crossSouth, EAST.museumDrive.z];

export function buildLakeshoreDrive(ctx) {
  const pts = lsdLine();
  // ---- the road surface: asphalt ribbon in 60 m runs, lane paint, kerb lines ----
  for (const run of pieces(pts)) {
    ctx.buckets.add('asphalt', ribbon(run, L.width, 0));
    laneLine(ctx, run, -L.median / 2 - 3.6, 0.02);
    laneLine(ctx, run, L.median / 2 + 3.6, 0.02);
    laneLine(ctx, run, -HALF + 0.5, 0.02, { gap: 0, width: 0.18 });
    laneLine(ctx, run, HALF - 0.5, 0.02, { gap: 0, width: 0.18 });
  }
  // Over the water (and the shore it lands on) the road is a deck: collision boxes, a concrete
  // girder under it, piers down into the lake, parapets on both sides.
  const vStart = pts.findIndex((p) => p.x > SHORE_X - 14);
  let vEnd = pts.length - 1;
  for (let i = vStart; i < pts.length; i++) if (pts[i].x > SHORE_X - 14) vEnd = i;
  const vpts = pts.slice(Math.max(0, vStart - 1), vEnd + 2);
  ribbonBoxes(ctx, vpts, L.width + 2, 0, { where: (x) => overLake(x), tag: 'viaduct' });
  const sv = resample(vpts, 3);
  for (let i = 0; i + 1 < sv.length; i++) {
    const a = sv[i], b = sv[i + 1];
    if (!overLake((a.x + b.x) / 2)) continue;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z), len = Math.hypot(b.x - a.x, b.z - a.z) + 0.05;
    ctx.buckets.add('painted', turned(L.width + 2, 1.3, len, (a.x + b.x) / 2, -0.66, (a.z + b.z) / 2, yaw), 0x55585e);
  }
  for (const p of resample(vpts, 18)) {
    if (!overLake(p.x)) continue;
    for (const o of [-6, 6]) {
      const q = offsetLine([p, { x: p.x, z: p.z + 1 }], o)[0];
      ctx.buckets.add('concrete', cylinder(1.0, 1.2, 4.2, q.x, -3.2, q.z, 8));
    }
    ctx.buckets.add('concrete', box(14, 0.8, 1.6, p.x, -1.5, p.z));
  }
  // Parapets: stone balustrade-style rails, open where the Lower Gotham link and the lock walk join
  // on the west side.
  const westGaps = [[EAST.lgLink.z - 9, EAST.lgLink.z + 8], [-259, -249]];
  const vRun = (o, gaps) => {
    const line = resample(offsetLine(vpts, o), 1.5).filter((p) => overLake(p.x));
    let cur = [];
    for (const p of line) {
      const gap = gaps.some(([z0, z1]) => p.z > z0 && p.z < z1) || p.x < SHORE_X - 0.5;
      if (gap) { if (cur.length > 1) railLine(ctx, cur, 0, { color: STONE }); cur = []; } else cur.push(p);
    }
    if (cur.length > 1) railLine(ctx, cur, 0, { color: STONE });
  };
  vRun(PARAPET, westGaps);  // west edge (right of travel going south)
  vRun(-PARAPET, []);       // lake side
  // Viaduct lamps: tall sodium heads over each carriageway, both parapets, every 30 m.
  for (const p of resample(vpts, 30)) {
    if (!overLake(p.x)) continue;
    for (const o of [-PARAPET + 0.3, PARAPET - 0.3]) {
      const q = offsetLine([p, { x: p.x, z: p.z + 1 }], o)[0];
      const inward = { x: p.x - q.x, z: p.z - q.z }, l = Math.hypot(inward.x, inward.z) || 1;
      driveLamp(ctx, q.x, q.z, inward.x / l, inward.z / l);
    }
  }

  // ---- the median: a planted kerb, lamps every 36 m, open at junctions ----
  const med = resample(pts, 4);
  for (let i = 0; i + 1 < med.length; i++) {
    const a = med[i], b = med[i + 1];
    const mz = (a.z + b.z) / 2, mx = (a.x + b.x) / 2;
    if (JUNCTIONS.some((z) => Math.abs(mz - z) < 10)) continue;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z), len = Math.hypot(b.x - a.x, b.z - a.z) + 0.02;
    ctx.buckets.add('painted', turned(L.median, 0.22, len, mx, 0.11, mz, yaw), 0x6a6760);
    if (i % 2 === 0) ctx.buckets.add('painted', new THREE.IcosahedronGeometry(0.75, 0).scale(1, 0.7, 1).translate(mx, 0.6, mz), 0x22402a);
  }
  for (let k = 0, pl = resample(pts, 36); k < pl.length; k++) {
    const p = pl[k];
    if (JUNCTIONS.some((z) => Math.abs(p.z - z) < 12)) continue;
    medianLamp(ctx, p.x, p.z, k % 2 === 0);
  }

  // ---- links: Lower Gotham's east plaza, the quay over the river lock ----
  lowerGothamLink(ctx);
  riverLock(ctx);
  // ---- an overhead sign gantry on the park stretch, both directions ----
  gantry(ctx, -628);
}

// A tall cobra-head lamp on a parapet or kerb, its head over the road.
function driveLamp(ctx, x, z, nx, nz) {
  solid(ctx, 'steel', cylinder(0.1, 0.16, 9, x, 4.5, z, 8), { tag: 'prop' });
  const hx = x + nx * 2.4, hz = z + nz * 2.4;
  ctx.buckets.add('steel', turned(0.12, 0.12, 2.6, x + nx * 1.2, 8.95, z + nz * 1.2, Math.atan2(nx, nz)));
  ctx.buckets.add('steel', box(0.8, 0.22, 0.8, hx, 9, hz));
  glow(ctx, box(0.6, 0.1, 0.6, hx, 8.85, hz), PALETTE.sodium);
  ctx.halos.add(hx, 8.7, hz, PALETTE.sodium, 3.4);
  lightSpot(ctx, hx, 8.4, hz, PALETTE.sodium, 26, 20);
  ctx.reflect.push({ x: hx, y: 0.05, z: hz, h: 9, color: PALETTE.sodium, w: 0.5, len: 11, k: 0.32 });
  ctx.buckets.add('pool', new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2).translate(hx, 0.04, hz), 0x6b4520);
}

// A twin-armed lamp standing on the median, one head over each carriageway.
function medianLamp(ctx, x, z, spot) {
  solid(ctx, 'steel', cylinder(0.12, 0.18, 9.5, x, 4.75, z, 8), { tag: 'prop' });
  ctx.buckets.add('steel', box(5.6, 0.14, 0.14, x, 9.4, z));
  for (const s of [-1, 1]) {
    const hx = x + s * 2.8;
    ctx.buckets.add('steel', box(0.9, 0.22, 0.7, hx, 9.4, z));
    glow(ctx, box(0.66, 0.1, 0.5, hx, 9.25, z), PALETTE.sodium);
    ctx.halos.add(hx, 9.1, z, PALETTE.sodium, 3.4);
    if (spot) lightSpot(ctx, hx, 8.8, z, PALETTE.sodium, 26, 20);
    ctx.reflect.push({ x: hx, y: 0.05, z, h: 9.5, color: PALETTE.sodium, w: 0.5, len: 11, k: 0.32 });
    ctx.buckets.add('pool', new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2).translate(hx, 0.04, z), 0x6b4520);
  }
}

// The link from the viaduct to the end of Lower Gotham's upper deck (its north half ends at the
// east plaza, x 360): a short road on fill with a sidewalk and railings.
function lowerGothamLink(ctx) {
  const x0 = SHORE_X, x1 = L.viaductX - HALF + 0.5;
  slab(ctx, 'concrete', x0, -3, -306, x1, -0.2, -291, { tag: 'fill', uv: [6, 6] });
  slab(ctx, 'asphalt', x0, -0.2, -301, x1, 0, -291, { tag: 'road', uv: [17, 17], faces: [2] });
  slab(ctx, 'sidewalk', x0, -0.2, -306, x1, 0.15, -301, { tag: 'sidewalk' });
  railing(ctx, true, x0, x1, -305.8, 0.15, { color: STONE });
  railing(ctx, true, x0, x1, -291.2, 0, { color: STONE });
  laneLine(ctx, [{ x: x0, z: -296 }, { x: x1, z: -296 }], 0, 0.02);
}

// The lock at the river mouth (research 3.3: the river sits 5.4 m below the lake): a massive
// concrete sill across the channel with timber gates on the river side and a lockkeeper's hut on
// top. Its walkway joins the quay (core side, y 0.15) to the viaduct over a short footbridge, and it
// closes the east end of the river walk (which ends in a railing over the lake).
function riverLock(ctx) {
  const X0 = SHORE_X - 4, X1 = SHORE_X + 4, Z0 = -268, Z1 = -236;
  slab(ctx, 'concrete', X0, -7, Z0, X1, 0, Z1, { tag: 'lock', uv: [6, 6] });
  slab(ctx, 'sidewalk', X0, 0, Z0, X1, 0.15, Z1, { tag: 'sidewalk' });
  // Timber gate leaves (mitre gates, drawn closed) on the river face, a stone coping, bollards.
  for (const [za, zb] of [[-266, -253.5], [-253.5, -241]]) {
    const zc = (za + zb) / 2;
    ctx.buckets.add('wood', box(1.0, 5.6, zb - za, X0 - 0.5, -3.3, zc));
    for (let y = -5.6; y < -0.8; y += 1.2) ctx.buckets.add('painted', box(0.12, 0.18, zb - za, X0 - 1.05, y, zc), IRON);
  }
  ctx.buckets.add('painted', box(X1 - X0 + 0.6, 0.3, Z1 - Z0, (X0 + X1) / 2, 0.02, (Z0 + Z1) / 2), STONE);
  railing(ctx, false, Z0, -259, X0 + 0.2, 0.15);
  railing(ctx, false, -249, Z1 - 5, X1 - 0.2, 0.15);
  railing(ctx, false, Z0, -259, X1 - 0.2, 0.15);
  railing(ctx, true, X0, X1, Z0 + 0.2, 0.15);
  // Lockkeeper's hut with a lit window and a bell.
  solid(ctx, 'painted', box(3.4, 3, 3.4, SHORE_X, 1.65, -244), { color: 0x6e675e, tag: 'hut' });
  solid(ctx, 'painted', new THREE.ConeGeometry(2.7, 1.6, 4).rotateY(Math.PI / 4).translate(SHORE_X, 3.95, -244), { color: 0x3f6b5c, tag: 'roof' });
  glow(ctx, box(1.4, 0.9, 0.06, SHORE_X, 2.2, -242.27), PALETTE.window);
  ctx.halos.add(SHORE_X, 2.2, -242, PALETTE.window, 2);
  ctx.grapple.push({ x: SHORE_X, y: 4.75, z: -244, nx: 0, nz: 1, perch: true });
  globeLamp(ctx, SHORE_X, 0.15, -262, { alongX: false });
  // Footbridge from the lock to the viaduct (west parapet opens at z -259..-249).
  const fx0 = X1, fx1 = L.viaductX - HALF;
  slab(ctx, 'wood', fx0, -0.6, -258, fx1, 0.15, -250, { tag: 'footbridge' });
  railing(ctx, true, fx0, fx1, -257.8, 0.15, { color: IRON });
  railing(ctx, true, fx0, fx1, -250.2, 0.15, { color: IRON });
  // The river walk's east end: a railing over the lake.
  railing(ctx, false, -276, -268, SHORE_X - 0.3, LEVELS.riverWalk);
}

// An overhead gantry across the drive with a sign each way (and a perch on its beam).
function gantry(ctx, z) {
  const xa = L.x - HALF - 0.6, xb = L.x + HALF + 0.6;
  for (const x of [xa, xb]) solid(ctx, 'steel', box(0.5, 7.2, 0.5, x, 3.6, z), { tag: 'gantry' });
  solid(ctx, 'steel', box(xb - xa + 0.6, 0.6, 1.2, L.x, 7.2, z), { tag: 'gantry' });
  for (let x = xa; x < xb; x += 1.8) ctx.buckets.add('steel', turned(0.06, 0.8, 0.06, x + 0.9, 7.2, z + 0.62, 0).rotateZ(0));
  board(ctx, 'LAKESHORE DR N', 'SPEED LIMIT: SUGGESTED', L.x - 5, 5.6, z + 0.65, 0, 1, { w: 8, bg: 0x2f5a46, posts: false });
  board(ctx, 'LAKESHORE DR S', 'MUSEUMS - ARKHAM (NO EXIT)', L.x + 5, 5.6, z - 0.65, 0, -1, { w: 8, bg: 0x2f5a46, posts: false });
  ctx.grapple.push({ x: L.x, y: 7.5, z, nx: 0, nz: 1, perch: true });
  ctx.grapple.push({ x: L.x - 7, y: 7.5, z, nx: 0, nz: 1, perch: true });
}

// The seawall promenade along the lake between z0 and z1: paved walk at y 0.15 over a concrete
// wall face, revetment steps down to the water outside, a railing, lamps and benches.
export function promenade(ctx, z0, z1, { lamps = true, gaps = [] } = {}) {
  const { x0, x1 } = EAST.promenade;
  slab(ctx, 'concrete', x0, -3, z0, x1, 0, z1, { tag: 'seawall', uv: [6, 6] });
  slab(ctx, 'sidewalk', x0, 0, z0, x1, 0.15, z1, { tag: 'sidewalk' });
  // Step-stone revetment (Chicago's lakefront): two broad steps down to the waterline.
  slab(ctx, 'concrete', x1, -2, z0, x1 + 2.2, -0.15, z1, { tag: 'revetment', uv: [3, 3] });
  slab(ctx, 'concrete', x1 + 2.2, -2, z0, x1 + 4.4, LAKE_LEVEL + 0.25, z1, { tag: 'revetment', uv: [3, 3] });
  ctx.buckets.add('painted', box(0.5, 0.3, z1 - z0, x1 - 0.1, 0.25, (z0 + z1) / 2), STONE);
  let r0 = z0;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) { railing(ctx, false, r0, g0, x1 - 0.5, 0.15, { color: IRON, post: 3 }); r0 = g1; }
  railing(ctx, false, r0, z1, x1 - 0.5, 0.15, { color: IRON, post: 3 });
  if (!lamps) return;
  for (let z = z0 + 12, k = 0; z < z1 - 6; z += 26, k++) {
    globeLamp(ctx, x1 - 1.6, 0.15, z, { spot: k % 2 === 0, alongX: false });
    // [polish] Same rng draw, but no bench across an opening (the pier ramp's foot).
    if (ctx.rng.chance(0.6) && !gaps.some(([g0, g1]) => z + 8 > g0 - 1.5 && z + 8 < g1 + 1.5)) parkBench(ctx, x1 - 2.2, 0.15, z + 8, 1, 0);
  }
}
