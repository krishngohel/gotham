// Robinson Park (workstream H2): the long lakefront park between Robinson Avenue (the frontage road
// beside the Loop and Gotham Mile) and Lakeshore Drive, north of the river, plus its southern
// stretch beside Old Gotham. Landmarks: Founders' Fountain (a three-tier fountain with bronze
// gargoyle-fish, an original design), the Mirror (a polished bat-wing arch, not a bean), the
// Robinson Shell (bandshell), the glass Conservatory, the Congress Gate statues and the boathouse.
// Lawns, winding paths, tree lines and park lamps; the drive is built by lakeshoreDrive.js.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { box, tiledBox, cylinder } from '../buckets.js';
import { solid, glow, lightSpot } from '../cityBuilder.js';
import { hydrant, trashCan, phoneBooth, newsBoxes } from '../streetDressing.js';
import { EAST, SHORE_X, bezier, inRect } from './eastLayout.js';
import { slab, railing, ribbon, laneLine, offsetLine, resample, tree, hedge, parkBench, statue, globeLamp, neonWord, board, STONE, DARK_STONE, IRON, BRASS } from './eastKit.js';
import { buildLakeshoreDrive, promenade } from './lakeshoreDrive.js';

const F = EAST.front, PK = EAST.park;
const AVE_E = F.x + F.width / 2;            // 252: avenue's east kerb
const PARK_W = AVE_E + F.sidewalk;          // 256: the park starts here
const LAWN_E = EAST.lsd.x - EAST.lsd.width / 2; // 334: the drive's west kerb

// ---------------------------------------------------------------------------------------------
// shared pieces
// ---------------------------------------------------------------------------------------------

// Robinson Avenue between z0 and z1 (x 236/240..252), its park-side sidewalk and furniture.
export function avenue(ctx, z0, z1, { x0 = 236, entrances = [] } = {}) {
  const { rng } = ctx;
  ctx.buckets.add('asphalt', tiledBox(AVE_E - x0, 0.2, z1 - z0, (x0 + AVE_E) / 2, -0.1, (z0 + z1) / 2, { uvScale: [17, 17], faces: [2] }));
  laneLine(ctx, [{ x: F.x, z: z0 }, { x: F.x, z: z1 }], 0, 0.02);
  slab(ctx, 'sidewalk', AVE_E, 0, z0, PARK_W, 0.15, z1, { tag: 'sidewalk' });
  // Low iron park fence on the lawn side (visual only: the hero vaults nothing, cars can chase
  // across the grass), with stone gate piers at each entrance.
  let f0 = z0;
  const fence = (a, b) => {
    if (b - a < 1) return;
    ctx.buckets.add('painted', box(0.06, 0.06, b - a, PARK_W + 0.2, 0.75, (a + b) / 2), IRON);
    for (let z = a; z < b; z += 0.4) ctx.buckets.add('painted', box(0.04, 0.6, 0.04, PARK_W + 0.2, 0.45, z), IRON);
  };
  for (const [e0, e1] of [...entrances].sort((a, b) => a[0] - b[0])) {
    fence(f0, e0);
    for (const z of [e0, e1]) {
      solid(ctx, 'painted', box(0.9, 2.2, 0.9, PARK_W + 0.3, 1.25, z), { color: STONE, tag: 'pier' });
      ctx.buckets.add('painted', new THREE.SphereGeometry(0.4, 8, 6).translate(PARK_W + 0.3, 2.75, z), DARK_STONE);
      ctx.grapple.push({ x: PARK_W + 0.3, y: 2.35, z, nx: -1, nz: 0, perch: true });
    }
    f0 = e1;
  }
  fence(f0, z1);
  // Lamps on the kerb every 24 m, furniture between them.
  for (let z = z0 + 10, k = 0; z < z1 - 4; z += 24, k++) {
    globeLamp(ctx, AVE_E + 0.9, 0.15, z, { spot: k % 2 === 0, alongX: false });
    const r = rng.next();
    const zz = z + 12;
    if (zz > z1 - 3 || entrances.some(([a, b]) => zz > a - 2 && zz < b + 2)) continue;
    if (r < 0.25) hydrant(ctx, AVE_E + 0.7, zz);
    else if (r < 0.5) trashCan(ctx, AVE_E + 0.8, zz);
    else if (r < 0.62) newsBoxes(ctx, AVE_E + 0.8, zz, -1, 0);
    else if (r < 0.7) phoneBooth(ctx, AVE_E + 1.4, zz, -1, 0);
  }
}

// A bus shelter on the avenue sidewalk, its back to the park, an ad panel on the end.
function busShelter(ctx, z, ad) {
  const x = AVE_E + 2.2;
  ctx.buckets.add('painted', box(1.9, 0.12, 5, x, 2.6, z), 0x2a2d33);
  for (const dz of [-2.4, 2.4]) solid(ctx, 'steel', box(0.1, 2.5, 0.1, x - 0.8, 1.4, z + dz), { tag: 'prop' });
  ctx.buckets.add('glow', box(0.05, 1.8, 4.6, x + 0.85, 1.25, z), 0x3a4a5e);
  ctx.collision.addBox(x + 0.8, 0.15, z - 2.5, x + 0.95, 2.6, z + 2.5, 'prop');
  ctx.buckets.add('wood', box(0.4, 0.08, 3.2, x + 0.5, 0.6, z));
  board(ctx, ad[0], ad[1], x, 1.45, z + 2.55, 0, 1, { w: 1.7, bg: ad[2] ?? PALETTE.containerBlue, posts: false });
  ctx.grapple.push({ x, y: 2.66, z, nx: -1, nz: 0, perch: true });
}

// A cross drive through the park at z (avenue <-> Lakeshore Drive), two lanes, kerbed islands.
export function crossDrive(ctx, z, x0 = AVE_E, x1 = LAWN_E) {
  ctx.buckets.add('asphalt', tiledBox(x1 - x0, 0.2, 12, (x0 + x1) / 2, -0.1, z, { uvScale: [17, 17], faces: [2] }));
  laneLine(ctx, [{ x: x0, z }, { x: x1, z }], 0, 0.02);
  for (const s of [-1, 1]) laneLine(ctx, [{ x: x0 + 2, z }, { x: x1 - 2, z }], s * 5.6, 0.02, { gap: 0, width: 0.16 });
  for (let x = x0 + 14, k = 0; x < x1 - 6; x += 26, k++) for (const s of [-1, 1]) globeLamp(ctx, x, 0, z + s * 7, { spot: (k + (s > 0 ? 1 : 0)) % 2 === 0 });
  // Crosswalks at both ends.
  for (const x of [x0 + 2.5, x1 - 2.5]) for (let s = -5; s <= 5; s += 1.4) ctx.buckets.add('lane', new THREE.PlaneGeometry(3, 0.7).rotateX(-Math.PI / 2).translate(x, 0.02, z + s));
}

// A lawn: one textured quad at y 0 (the region's floor is y 0: no collision needed).
export function lawn(ctx, x0, z0, x1, z1) {
  if (x1 - x0 < 0.5 || z1 - z0 < 0.5) return;
  // Split big lawns so each piece lands in its own render cell.
  const n = Math.max(1, Math.ceil((z1 - z0) / 120));
  for (let i = 0; i < n; i++) {
    const a = z0 + ((z1 - z0) * i) / n, b = z0 + ((z1 - z0) * (i + 1)) / n;
    ctx.buckets.add('lawn', tiledBox(x1 - x0, 0.2, b - a, (x0 + x1) / 2, -0.1, (a + b) / 2, { uvScale: [9, 9], faces: [2] }));
  }
}

// A lawn polygon (outline in x/z, counter-clockwise seen from above), for the odd corners the
// drive's curves leave.
export function lawnPoly(ctx, outline) {
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.z)));
  const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 9, pos.getZ(i) / 9);
  ctx.buckets.add('lawn', g);
}

// A dark base under a region's land at y -0.12, so a hairline between lawn, road and plaza never
// shows the horizon's ground through it.
export function baseGround(ctx, x0, z0, x1, z1) {
  ctx.buckets.add('concrete', tiledBox(x1 - x0, 0.1, z1 - z0, (x0 + x1) / 2, -0.17, (z0 + z1) / 2, { uvScale: [8, 8], faces: [2] }));
}

// A paved plaza (sidewalk slab, kerb 0.15) with lamps on its corners.
export function plaza(ctx, x0, z0, x1, z1, { lamps = true } = {}) {
  slab(ctx, 'sidewalk', x0, 0, z0, x1, 0.15, z1, { tag: 'plaza' });
  ctx.buckets.add('painted', box(x1 - x0 + 0.3, 0.16, 0.3, (x0 + x1) / 2, 0.08, z0), STONE);
  ctx.buckets.add('painted', box(x1 - x0 + 0.3, 0.16, 0.3, (x0 + x1) / 2, 0.08, z1), STONE);
  if (lamps) for (const [x, z] of [[x0 + 1.5, z0 + 1.5], [x1 - 1.5, z0 + 1.5], [x0 + 1.5, z1 - 1.5], [x1 - 1.5, z1 - 1.5]]) globeLamp(ctx, x, 0.15, z, { spot: false });
}

// Winding paths: sidewalk ribbons 3 m wide at y 0.06, lamps and benches along them. Returns the
// sampled points (trees keep clear of them).
export function path(ctx, pts, { lamps = true, benches = true } = {}) {
  const s = resample(pts, 2);
  for (let i = 0; i < s.length - 1; i += 30) ctx.buckets.add('sidewalk', ribbon(s.slice(i, Math.min(s.length, i + 31)), 3, 0.06, 4));
  if (lamps) {
    const lp = resample(pts, 22);
    lp.forEach((p, k) => { if (k > 0 && k < lp.length - 1) { const q = offsetLine(lp, 2.2)[k]; globeLamp(ctx, q.x, 0, q.z, { spot: k % 3 === 1, alongX: Math.abs(lp[k + 1].z - lp[k - 1].z) > Math.abs(lp[k + 1].x - lp[k - 1].x) }); } });
  }
  if (benches) {
    const bp = resample(pts, 17);
    const left = offsetLine(bp, -2.3);
    bp.forEach((p, k) => {
      if (k === 0 || k === bp.length - 1 || ctx.rng.chance(0.45)) return;
      const q = left[k];
      parkBench(ctx, q.x, 0, q.z, p.x - q.x, p.z - q.z);
    });
  }
  return s;
}

// Trees scattered over a rectangle, kept off plazas, roads and paths.
export function grove(ctx, x0, z0, x1, z1, count, keepOut, pathPts, { kind = 'round', perchEvery = 6 } = {}) {
  const { rng } = ctx;
  let placed = 0;
  for (let t = 0; t < count * 6 && placed < count; t++) {
    const x = rng.range(x0, x1), z = rng.range(z0, z1);
    if (keepOut.some((r) => x > r.minX - 4 && x < r.maxX + 4 && z > r.minZ - 4 && z < r.maxZ + 4)) continue;
    if (pathPts.some((p) => Math.abs(p.x - x) < 4.5 && Math.abs(p.z - z) < 4.5)) continue;
    tree(ctx, x, z, { kind: rng.chance(0.18) ? 'cone' : kind, s: rng.range(0.85, 1.25), perch: placed % perchEvery === 0 });
    placed++;
  }
}

// ---------------------------------------------------------------------------------------------
// landmarks
// ---------------------------------------------------------------------------------------------

// Founders' Fountain: a 40 m pool with a walkable rim, three stacked basins on fluted columns,
// eight bronze gargoyle-fish spouting arcs inward, and a centre jet that climbs on the hour.
// The water is one small dynamic mesh with a scrolling stripe texture (one draw, culled with its
// chunk at the LOD distance); the night lighting is halos and two light-pool spots.
export function foundersFountain(ctx, cx, cz) {
  const y0 = 0.15, R = 20;
  const bronze = 0x4a6a58;
  // Pool rim: 40 segments, 0.45 m high (a step: you can walk it), and its collision ring.
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    ctx.buckets.add('painted', new THREE.BoxGeometry(1.0, 0.45, (2 * Math.PI * R) / 40 + 0.08).rotateY(-a).translate(x, y0 + 0.225, z), STONE);
  }
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    ctx.collision.addBox(x - 1.2, y0, z - 1.2, x + 1.2, y0 + 0.45, z + 1.2, 'fountain');
  }
  // Water in the pool (a dark teal disc; the animated sheen sits on top).
  ctx.buckets.add('painted', new THREE.CircleGeometry(R - 0.5, 40).rotateX(-Math.PI / 2).translate(cx, y0 + 0.3, cz), 0x16384a);
  // Tiers: [radius, rim y, column radius below it].
  const tiers = [[9, 3.4, 3.2], [5.6, 7.0, 2.0], [3.0, 9.8, 1.1]];
  let base = y0;
  for (const [r, y, col] of tiers) {
    // Fluted column (12 sides) from the basin below up to this tier.
    solid(ctx, 'painted', cylinder(col, col * 1.15, y - base - 0.6, cx, (base + y - 0.6) / 2, cz, 12), { color: STONE, tag: 'fountain' });
    // Basin: a shallow bowl (cone frustum) with a lip ring, water disc inside.
    ctx.buckets.add('painted', cylinder(r, r * 0.55, 0.9, cx, y - 0.45, cz, 24), STONE);
    ctx.buckets.add('painted', cylinder(r + 0.25, r + 0.25, 0.25, cx, y, cz, 24, true), DARK_STONE);
    ctx.buckets.add('painted', new THREE.CircleGeometry(r - 0.2, 24).rotateX(-Math.PI / 2).translate(cx, y - 0.05, cz), 0x1d4a60);
    // Collision: the basin's floor as a square plus a cross inscribed in its circle (the rim is a
    // perch ring; you can climb the fountain tier by tier).
    for (const [hx, hz] of [[0.72, 0.72], [1, 0.5], [0.5, 1]]) ctx.collision.addBox(cx - r * hx, y - 0.9, cz - r * hz, cx + r * hx, y, cz + r * hz, 'fountain');
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      ctx.grapple.push({ x: cx + Math.cos(a) * r, y, z: cz + Math.sin(a) * r, nx: Math.cos(a), nz: Math.sin(a) });
    }
    // Underlit rim: a ring of small halos.
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      ctx.halos.add(cx + Math.cos(a) * (r - 0.4), y - 0.75, cz + Math.sin(a) * (r - 0.4), k % 2 ? PALETTE.windowCool : PALETTE.window, 1.6);
    }
    base = y;
  }
  // Finial: four bronze wings round a lantern.
  const top = tiers[2][1];
  for (let k = 0; k < 4; k++) ctx.buckets.add('painted', new THREE.BoxGeometry(0.12, 2.2, 1.4).translate(0, 1.1, 0.7).rotateY((k * Math.PI) / 2 + Math.PI / 4).translate(cx, top, cz), bronze);
  glow(ctx, new THREE.IcosahedronGeometry(0.45, 1).translate(cx, top + 2.4, cz), PALETTE.windowCool);
  ctx.halos.add(cx, top + 2.4, cz, PALETTE.windowCool, 5);
  ctx.grapple.push({ x: cx, y: top + 0.2, z: cz, nx: 0, nz: 1, perch: true });
  // Eight bronze gargoyle-fish on plinths round the pool, facing the middle.
  const spouts = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const fr = R - 2.6, x = cx + Math.cos(a) * fr, z = cz + Math.sin(a) * fr;
    solid(ctx, 'painted', box(1.4, 1.2, 1.4, x, y0 + 0.6, z), { color: STONE, tag: 'fountain' });
    const yaw = Math.atan2(cx - x, cz - z);
    const m = new THREE.Matrix4().makeRotationY(yaw);
    const fish = (g, px, py, pz) => ctx.buckets.add('painted', g.applyMatrix4(new THREE.Matrix4().makeTranslation(px, py, pz)).applyMatrix4(m).translate(x, y0 + 1.2, z), bronze);
    fish(new THREE.IcosahedronGeometry(0.6, 0).scale(0.8, 0.7, 1.3), 0, 0.55, 0);                  // body
    fish(new THREE.ConeGeometry(0.35, 0.6, 4).rotateX(Math.PI / 2), 0, 0.6, 0.85);                 // open jaw
    fish(new THREE.BoxGeometry(0.05, 0.8, 0.6).rotateZ(0.6), 0.45, 0.9, -0.1);                     // bat fins
    fish(new THREE.BoxGeometry(0.05, 0.8, 0.6).rotateZ(-0.6), -0.45, 0.9, -0.1);
    fish(new THREE.ConeGeometry(0.3, 0.9, 4).rotateX(-Math.PI / 2 - 0.6), 0, 0.9, -0.95);          // curled tail
    ctx.grapple.push({ x, y: y0 + 1.2, z, nx: Math.cos(a), nz: Math.sin(a), perch: true });
    spouts.push({ x: x + Math.sin(yaw) * 1.1, y: y0 + 1.85, z: z + Math.cos(yaw) * 1.1, yaw });
  }
  // Pool lights: alternating cool and amber halos under the water line, pulsing slowly.
  const pool = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    pool.push(ctx.halos.add(cx + Math.cos(a) * (R - 1.2), y0 + 0.5, cz + Math.sin(a) * (R - 1.2), k % 2 ? PALETTE.windowCool : 0x6fd0ff, 3));
  }
  lightSpot(ctx, cx, 6, cz, PALETTE.windowCool, 30, 26);
  lightSpot(ctx, cx, 2, cz + R + 2, 0x6fd0ff, 18, 14);

  // ---- the moving water ----
  const water = fountainWater(cx, cz, tiers, spouts, y0);
  ctx.scene.add(water.mesh, water.jet);
  const bb = { minX: cx - R, minY: 0, minZ: cz - R, maxX: cx + R, maxY: 30, maxZ: cz + R };
  ctx.chunks.addDetail(water.mesh, bb, 'lod');
  ctx.chunks.addDetail(water.jet, bb, 'lod');
  ctx.updaters.push((t) => {
    water.tex.offset.y = -t * 0.9;
    // On the hour (every two minutes of story time) the centre jet climbs to 25 m for 20 s.
    const c = t % 120;
    const k = c < 20 ? Math.min(1, c / 3, (20 - c) / 3) : 0;
    water.jet.scale.y = 0.15 + k * 0.85;
    water.jet.updateMatrix();
    const pulse = 2.6 + Math.sin(t * 0.8) * 0.6;
    for (let i = 0; i < pool.length; i++) ctx.halos.setSize(pool[i], pulse + (i % 2) * Math.sin(t * 1.3 + i));
  });
}

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(0, 0, 16, 64);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 16, 5);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function fountainWater(cx, cz, tiers, spouts, y0) {
  const tex = stripeTexture();
  const mat = new THREE.MeshBasicMaterial({ color: 0x9fd8ee, map: tex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const geos = [];
  // Curtains falling from each tier's lip to the basin (or pool) below.
  for (let i = 0; i < tiers.length; i++) {
    const [r, y] = tiers[i];
    const below = i === 0 ? y0 + 0.3 : tiers[i - 1][1] - 0.05;
    const g = new THREE.CylinderGeometry(r + 0.15, r + 0.6, y - below, 24, 1, true).translate(cx, (y + below) / 2, cz);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 8, uv.getY(k) * (y - below) * 0.4);
    geos.push(g);
  }
  // Eight arcs from the fish into the pool.
  for (const s of spouts) {
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push(new THREE.Vector3(s.x + Math.sin(s.yaw) * t * 6, s.y + 2.2 * t * (1 - t) * 4 - t * 1.4, s.z + Math.cos(s.yaw) * t * 6));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.12, 4, false);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getY(k), uv.getX(k) * 3);
    geos.push(g);
  }
  const merged = mergeAll(geos);
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'fountainWater';
  mesh.userData.dynamic = true;
  mesh.renderOrder = 2;
  // The centre jet: a tall thin cone, scaled in y by the updater (from its base).
  const top = tiers[2][1];
  const jg = new THREE.CylinderGeometry(0.12, 0.5, 15, 8, 1, true).translate(0, 7.5, 0);
  const juv = jg.attributes.uv;
  for (let k = 0; k < juv.count; k++) juv.setXY(k, juv.getX(k) * 2, juv.getY(k) * 6);
  const jet = new THREE.Mesh(jg, mat);
  jet.position.set(cx, top + 2.8, cz);
  jet.userData.dynamic = true;
  jet.matrixAutoUpdate = false;
  jet.updateMatrix();
  jet.renderOrder = 2;
  return { mesh, jet, tex };
}

function mergeAll(geos) {
  // Minimal merge (position + uv), so this module needs no BufferGeometryUtils import.
  let n = 0, m = 0;
  for (const g of geos) { n += g.attributes.position.count; m += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(m);
  let o = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    const c = g.attributes.position.count;
    if (g.index) for (let k = 0; k < g.index.count; k++) idx[io++] = g.index.array[k] + o;
    else for (let k = 0; k < c; k++) idx[io++] = k + o;
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// The Mirror: a polished steel bat-wing arch (an original abstract piece, not a bean): a 20 m
// wide, 11 m high arc whose inner edge is scalloped like a wing's membrane between its fingers.
// Two feet stand on the plaza; the crown of the arch is a walkable ridge with perches along it.
export function mirrorArch(ctx, cx, cz, yaw = 0.35) {
  const RX = 10, RY = 11, rx = 6.6, ry = 7.6, D = 1.6, N = 28;
  const outer = [], inner = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI;
    outer.push(new THREE.Vector2(Math.cos(a) * RX, Math.sin(a) * RY));
    const f = 1 + 0.16 * Math.abs(Math.sin(a * 4));            // scallops between four "fingers"
    inner.push(new THREE.Vector2(Math.cos(a) * rx * f, Math.sin(a) * ry * f));
  }
  const shape = new THREE.Shape([...outer, ...inner.reverse()]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0.15, -D / 2).rotateY(yaw).translate(cx, 0, cz);
  ctx.buckets.add('painted', g, 0xc4ccd4);
  // Dark mirror band down its middle (reads as reflection in the toon shading).
  const band = new THREE.ExtrudeGeometry(new THREE.Shape([...outer.map((p) => p.clone().multiplyScalar(0.93)), ...[...inner].map((p) => p.clone().multiplyScalar(1.05))]), { depth: D + 0.6, bevelEnabled: false, curveSegments: 4 });
  band.translate(0, 0.15, -(D + 0.6) / 2).rotateY(yaw).translate(cx, 0, cz);
  ctx.buckets.add('painted', band, 0x6f7f8e);
  // [polish2] Polished steel, drawn the way a comic draws chrome (polish list: "the Mirror reads
  // plainly"): hard bands following the arch, each a little prouder of the face than the last: a
  // night-sky band, a thin warm horizon line under it, a pale band of city glow, and a white
  // glint along the outer edge. t runs from the inner edge (0) to the outer (1).
  const ring = (t0, t1, proud, color, key = 'painted') => {
    const pts = (t) => outer.map((o, i) => { const q = inner[inner.length - 1 - i]; return new THREE.Vector2(q.x + (o.x - q.x) * t, q.y + (o.y - q.y) * t); });
    const sh = new THREE.Shape([...pts(t1), ...pts(t0).reverse()]);
    const gg = new THREE.ExtrudeGeometry(sh, { depth: D + proud * 2, bevelEnabled: false, curveSegments: 4 });
    gg.translate(0, 0.15, -(D + proud * 2) / 2).rotateY(yaw).translate(cx, 0, cz);
    ctx.buckets.add(key, gg, color);
  };
  ring(0.16, 0.44, 0.36, 0x1d2a40);
  ring(0.44, 0.5, 0.4, 0xd89a5c);
  ring(0.5, 0.74, 0.36, 0x8fa6be);
  ring(0.84, 0.9, 0.42, 0xf4f8fc);
  // Four-point glints where the light catches the crown and one shoulder.
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  for (const [lx, ly, r] of [[-2.6, RY - 0.25, 0.9], [6.6, 7.6, 0.6]]) {
    for (const side of [-1, 1]) {
      const off = side * (D / 2 + 0.5);
      const gx = cx + lx * cs + off * sn, gz = cz - lx * sn + off * cs;
      for (const a of [0, Math.PI / 2]) glow(ctx, box(r * 2, 0.07, 0.04, 0, 0, 0).rotateZ(a + 0.3).rotateY(yaw).translate(gx, ly + 0.15, gz), 0xffffff);
    }
    ctx.halos.add(cx + lx * cs, ly + 0.3, cz - lx * sn, 0xdfeeff, r * 3.2);
  }
  // Its reflection in the plaza: a dark polished oval under the arch with the arch's pale curve
  // lying in it, and a ring of low uplights round the two feet.
  const pool = new THREE.CircleGeometry(1, 28).scale(RX + 3.5, 5.2, 1).rotateX(-Math.PI / 2).rotateY(yaw).translate(cx, 0.17, cz);
  ctx.buckets.add('painted', pool, 0x232b38);
  for (const side of [-1, 1]) {
    const arc = new THREE.RingGeometry(0.72, 0.8, 24, 1, 0, Math.PI).scale(RX, 4.6, 1).rotateX(-Math.PI / 2).rotateY(yaw + (side > 0 ? 0 : Math.PI)).translate(cx, 0.185, cz);
    ctx.buckets.add('painted', arc, 0x7f93ab);
  }
  for (const k of [-1, 1]) for (const side of [-1, 1]) {
    const ux = cx + k * 8.3 * cs + side * 2.2 * sn, uz = cz - k * 8.3 * sn + side * 2.2 * cs;
    glow(ctx, cylinder(0.22, 0.22, 0.08, ux, 0.2, uz, 8), 0xcfe6ff);
  }
  // Collision: boxes along the arch's band (walls at the steep feet, a ridge across the crown).
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI;
    const ox = Math.cos(a) * RX, oy = Math.sin(a) * RY;
    const ix = Math.cos(a) * rx, iy = Math.sin(a) * ry;
    const lx = (ox + ix) / 2;
    const wx = cx + lx * c, wz = cz - lx * s;
    const hw = Math.max(Math.abs(ox - ix), 1.2) / 2 + 0.3;
    ctx.collision.addBox(wx - hw, iy + 0.15, wz - hw, wx + hw, oy + 0.15, wz + hw, 'sculpture');
    if (i % 4 === 2 && oy > 6) ctx.grapple.push({ x: wx, y: oy + 0.15, z: wz, nx: s, nz: c, perch: true });
  }
  for (const k of [-1, 1]) ctx.halos.add(cx + k * 3 * c, 0.5, cz - k * 3 * s, PALETTE.windowCool, 3.5);
  lightSpot(ctx, cx, 3, cz, PALETTE.windowCool, 22, 18);
}

// The Robinson Shell: a concert bandshell of five concentric deco arches over a stage, facing +z.
function bandshell(ctx, cx, cz) {
  const cream = 0xe2dccb;
  slab(ctx, 'concrete', cx - 16, 0, cz - 6, cx + 16, 1.3, cz + 8, { tag: 'stage' });
  for (let k = 1; k <= 3; k++) slab(ctx, 'concrete', cx - 6, 0, cz + 8, cx + 6, k * 0.43, cz + 8 + (4 - k) * 0.6, { tag: 'step' });
  for (let i = 0; i < 5; i++) {
    const r = 15 - i * 1.6, z = cz - 6 + i * 1.6;
    ctx.buckets.add('painted', new THREE.TorusGeometry(r, 0.45, 4, 18, Math.PI).translate(cx, 1.3, z), cream);
    // Lights along each arch's underside.
    for (let k = 1; k < 8; k++) {
      const a = (k / 8) * Math.PI;
      ctx.halos.add(cx + Math.cos(a) * (r - 0.5), 1.3 + Math.sin(a) * (r - 0.5), z + 0.3, i % 2 ? PALETTE.window : PALETTE.neonCyan, 1.2);
    }
  }
  ctx.buckets.add('painted', new THREE.CircleGeometry(15.2, 18, 0, Math.PI).translate(cx, 1.3, cz - 6.3), 0x3a3a44);
  ctx.buckets.add('painted', new THREE.CircleGeometry(15.2, 18, 0, Math.PI).rotateY(Math.PI).translate(cx, 1.3, cz - 6.6), cream);
  // Collision: the shell's back and its crown (a perch ridge you can run across).
  ctx.collision.addBox(cx - 15.5, 1.3, cz - 6.8, cx + 15.5, 9, cz - 6, 'shell');
  ctx.collision.addBox(cx - 9, 9, cz - 6.8, cx + 9, 14, cz - 6, 'shell');
  ctx.collision.addBox(cx - 4, 14, cz - 6.8, cx + 4, 16.4, cz - 0.5, 'shell');
  for (const x of [-3, 0, 3]) ctx.grapple.push({ x: cx + x, y: 16.4, z: cz - 3, nx: 0, nz: 1, perch: true });
  for (const x of [-12, 12]) ctx.grapple.push({ x: cx + x, y: 9, z: cz - 6.4, nx: 0, nz: 1 });
  lightSpot(ctx, cx, 6, cz + 2, PALETTE.window, 24, 18);
  ctx.halos.add(cx, 3, cz + 1, PALETTE.window, 5);
  neonWord(ctx, 'ROBINSON SHELL', cx, 18.2, cz - 6.2, 0, 1, { h: 1.6, color: PALETTE.window, back: false });
}

// The Conservatory: a glass palm house, a 12 m central hall under a glass dome (top 25 m) between
// two lower wings, white iron frames, interior glowing green at night.
function conservatory(ctx, cx, cz) {
  const white = 0xd9ddd6, lit = 0x3f7a4a;
  const part = (w, d, h, x, z, roofH) => {
    solid(ctx, 'painted', box(w, 0.8, d, x, 0.4, z), { color: STONE, tag: 'building' });
    ctx.buckets.add('glow', box(w - 0.2, h - 1.6, d - 0.2, x, 0.8 + (h - 1.6) / 2, z), lit);
    ctx.collision.addBox(x - w / 2, 0.8, z - d / 2, x + w / 2, h, z + d / 2, 'building');
    // Frames: vertical mullions every 2 m and a cornice.
    for (let t = -w / 2; t <= w / 2 + 1e-6; t += 2) for (const s of [-1, 1]) ctx.buckets.add('painted', box(0.14, h - 0.8, 0.14, x + t, 0.8 + (h - 0.8) / 2, z + s * (d / 2 + 0.02)), white);
    for (let t = -d / 2; t <= d / 2 + 1e-6; t += 2) for (const s of [-1, 1]) ctx.buckets.add('painted', box(0.14, h - 0.8, 0.14, x + s * (w / 2 + 0.02), 0.8 + (h - 0.8) / 2, z + t), white);
    ctx.buckets.add('painted', box(w + 0.4, 0.35, d + 0.4, x, h, z), white);
    // Pitched glass roof along x.
    const roof = new THREE.CylinderGeometry(0.01, d / 2 + 0.2, roofH, 4, 1).rotateY(Math.PI / 4).scale(w / d, 1, 1).translate(x, h + roofH / 2, z);
    ctx.buckets.add('glass', roof);
    ctx.collision.addBox(x - w / 2, h, z - d * 0.25, x + w / 2, h + roofH * 0.5, z + d * 0.25, 'roof');
    edgeGrapplesAt(ctx, x, z, w, d, h);
    ctx.facades.push({ minX: x - w / 2, minY: 0, minZ: z - d / 2, maxX: x + w / 2, maxY: h, maxZ: z + d / 2, style: 'steel' });
  };
  part(20, 20, 12, cx, cz, 0.1);
  part(12, 16, 8, cx - 16, cz, 3);
  part(12, 16, 8, cx + 16, cz, 3);
  // The dome and its lantern.
  ctx.buckets.add('glass', new THREE.SphereGeometry(9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(cx, 12.2, cz));
  for (let k = 0; k < 8; k++) ctx.buckets.add('painted', new THREE.TorusGeometry(9.05, 0.12, 3, 12, Math.PI).rotateY((k * Math.PI) / 8).translate(cx, 12.2, cz), white);
  solid(ctx, 'painted', cylinder(1.8, 2.0, 3, cx, 22.5, cz, 8), { color: white, tag: 'roof' });
  glow(ctx, cylinder(1.6, 1.6, 2, cx, 22.5, cz, 8, true), PALETTE.window);
  ctx.buckets.add('painted', new THREE.ConeGeometry(2.2, 2, 8).translate(cx, 25, cz), 0x3f6b5c);
  ctx.collision.addBox(cx - 6, 12, cz - 6, cx + 6, 18.5, cz + 6, 'roof');
  ctx.collision.addBox(cx - 1.8, 18.5, cz - 1.8, cx + 1.8, 26, cz + 1.8, 'roof');
  ctx.grapple.push({ x: cx, y: 26, z: cz, nx: 0, nz: 1, perch: true });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ctx.grapple.push({ x: cx + Math.cos(a) * 6, y: 18.5, z: cz + Math.sin(a) * 6, nx: Math.cos(a), nz: Math.sin(a) }); }
  ctx.halos.add(cx, 22.5, cz, PALETTE.window, 6);
  // South entrance portico.
  slab(ctx, 'sidewalk', cx - 6, 0, cz + 10, cx + 6, 0.8, cz + 14, { tag: 'step' });
  for (const x of [-4.5, 4.5]) solid(ctx, 'painted', box(0.6, 5, 0.6, cx + x, 3.3, cz + 13.4), { color: white, tag: 'column' });
  ctx.buckets.add('painted', box(11, 0.6, 4.4, cx, 6, cz + 12), white);
  ctx.collision.addBox(cx - 5.5, 5.7, cz + 9.8, cx + 5.5, 6.3, cz + 14.2, 'roof');
  neonWord(ctx, 'GOTHAM CONSERVATORY', cx, 7.1, cz + 14.25, 0, 1, { h: 0.9, color: 0x9be29a, back: false });
  board(ctx, 'NIGHT BLOOMS', 'NOW SHOWING: THE PLANT THAT ATE PARKING', cx + 14, 2.4, cz + 9, 0, 1, { w: 4, bg: 0x2f5a3a });
  lightSpot(ctx, cx, 4, cz + 16, PALETTE.window, 22, 16);
}

export function edgeGrapplesAt(ctx, x, z, w, d, y, step = 6) {
  for (let t = -w / 2 + step / 2; t < w / 2; t += step) { ctx.grapple.push({ x: x + t, y, z: z - d / 2, nx: 0, nz: -1 }, { x: x + t, y, z: z + d / 2, nx: 0, nz: 1 }); }
  for (let t = -d / 2 + step / 2; t < d / 2; t += step) { ctx.grapple.push({ x: x - w / 2, y, z: z + t, nx: -1, nz: 0 }, { x: x + w / 2, y, z: z + t, nx: 1, nz: 0 }); }
}

// The boathouse on piles off the promenade: rental deck, a shed with a pitched roof, rowboats.
function boathouse(ctx, z) {
  const x0 = SHORE_X, x1 = SHORE_X + 26;
  slab(ctx, 'wood', x0, -0.9, z - 14, x1, 0.15, z + 14, { tag: 'deck', uv: [3, 3] });
  for (let x = x0 + 2; x < x1; x += 4) for (const dz of [-13, 0, 13]) ctx.buckets.add('wood', cylinder(0.2, 0.2, 3, x, -2, z + dz, 6));
  railing(ctx, true, x0, x1, z - 13.8, 0.15, { color: 0x6a5a44 });
  railing(ctx, false, z - 14, z - 3, x1 - 0.2, 0.15, { color: 0x6a5a44 });
  railing(ctx, false, z + 3, z + 14, x1 - 0.2, 0.15, { color: 0x6a5a44 });
  const bx = x0 + 11, bz = z - 4;
  solid(ctx, 'painted', box(14, 4.4, 9, bx, 2.35, bz), { color: 0x7a5e44, tag: 'building' });
  for (let x = bx - 6.5; x <= bx + 6.5; x += 1.3) ctx.buckets.add('painted', box(0.1, 4.4, 0.1, x, 2.35, bz + 4.55), 0x5a4432);
  ctx.buckets.add('roof', new THREE.CylinderGeometry(0.01, 6.6, 3.2, 4, 1).rotateY(Math.PI / 4).scale(1.55, 1, 1).translate(bx, 6.15, bz));
  ctx.collision.addBox(bx - 7, 4.55, bz - 2.5, bx + 7, 6.2, bz + 2.5, 'roof');
  ctx.grapple.push({ x: bx, y: 6.2, z: bz, nx: 0, nz: 1, perch: true });
  edgeGrapplesAt(ctx, bx, bz, 14, 9, 4.55, 7);
  glow(ctx, box(3, 1.4, 0.06, bx - 3, 2.6, bz + 4.53), PALETTE.window);
  glow(ctx, box(3, 1.4, 0.06, bx + 3, 2.6, bz + 4.53), PALETTE.window);
  ctx.halos.add(bx, 3.6, bz + 5.2, PALETTE.window, 3);
  lightSpot(ctx, bx, 3.5, bz + 7, PALETTE.window, 18, 14);
  neonWord(ctx, 'BOATS', bx, 5.2, bz + 4.7, 0, 1, { h: 1.1, color: PALETTE.neonCyan, back: true });
  board(ctx, 'ROW, ROW, ROW', 'YOUR BOAT. GENTLY. PLEASE.', x0 + 4, 2.2, z + 9, 1, 0, { w: 3.6, bg: PALETTE.containerBlue });
  board(ctx, 'NO FEEDING', 'THE PENGUINS', x1 - 3, 2.2, z + 13.6, 0, -1, { w: 3, bg: PALETTE.crimson });
  // Dock finger and rowboats.
  slab(ctx, 'wood', x1, -0.6, z - 2, x1 + 14, 0.05, z + 2, { tag: 'dock', uv: [3, 3] });
  for (let k = 0; k < 5; k++) rowboat(ctx, x1 + 3 + k * 2.4, z + (k % 2 ? 3.6 : -3.6), k);
}

function rowboat(ctx, x, z, k) {
  const hull = new THREE.CylinderGeometry(0.75, 0.45, 3.4, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).rotateY(Math.PI / 2);
  ctx.buckets.add('painted', hull.scale(1, 0.6, 1).translate(x, -0.35, z), [0x7a3a2e, 0x2f4a6e, 0xd8d0b8, 0x3f5e45][k % 4]);
  ctx.buckets.add('wood', box(1.2, 0.06, 0.25, x, -0.3, z));
}

// ---------------------------------------------------------------------------------------------
// the regions
// ---------------------------------------------------------------------------------------------

// Robinson Park, north of the river (region 'lakefront', x 236..366, z -780..-306), and Lakeshore
// Drive along its whole length.
export function buildLakefront(ctx) {
  buildLakeshoreDrive(ctx);
  const Z0 = -780, Z1 = -306;
  baseGround(ctx, 236, Z0, SHORE_X, Z1);
  const cross = EAST.crossNorth;
  // Plazas and landmark footprints (the trees and paths keep clear of these).
  const P = {
    congress: { minX: PARK_W, maxX: LAWN_E, minZ: -405, maxZ: -372 },
    fountain: { minX: 262, maxX: 326, minZ: -502, maxZ: -438 },
    mirror: { minX: 258, maxX: 310, minZ: -596, maxZ: -558 },
    shell: { minX: 282, maxX: 318, minZ: -670, maxZ: -646 },
    audience: { minX: 284, maxX: 316, minZ: -642, maxZ: -604 },
    conservatory: { minX: 270, maxX: 318, minZ: -766, maxZ: -727 },
    roads: { minX: 236, maxX: PARK_W, minZ: Z0, maxZ: Z1 },
  };
  const entrances = [[-400, -377], [-476, -464], [-582, -570], [-736, -728], [-340, -330], [-690, -680]];
  avenue(ctx, Z0, Z1, { entrances });
  for (const z of cross) crossDrive(ctx, z);
  // Lawns between the cross drives.
  const bands = [[Z0, cross[2] - 6], [cross[2] + 6, cross[1] - 6], [cross[1] + 6, cross[0] - 6], [cross[0] + 6, Z1]];
  for (const [a, b] of bands) lawn(ctx, PARK_W, a, LAWN_E, b);
  // The corner the drive's north curve leaves between the park and Lower Gotham.
  const curveW = offsetLine(EAST.lsd.northCurve, EAST.lsd.width / 2).filter((p) => p.x < SHORE_X);
  lawnPoly(ctx, [{ x: LAWN_E, z: -400 }, { x: LAWN_E, z: Z1 }, { x: SHORE_X, z: Z1 }, ...[...curveW].reverse().filter((p) => p.z > -400)]);
  // [polish] Open at the foot of the pier ramp (z -458..-442): the railing crossed the walk onto it.
  promenade(ctx, Z0, -392, { gaps: [[-624, -596], [EAST.pier.z - 8, EAST.pier.z + 8]] });
  // North edge (the world's edge for now): a hedge and a row of conifers.
  hedge(ctx, PARK_W, Z0 + 1, LAWN_E, Z0 + 1, { h: 1.6 });

  // ---- plazas and landmarks ----
  plaza(ctx, P.congress.minX, P.congress.minZ, P.congress.maxX, P.congress.maxZ);
  statue(ctx, 294, -388, Math.PI / 2 + Math.PI, { kind: 'rider', y: 0.15, scale: 1.2 });
  statue(ctx, PARK_W + 3, -397, -Math.PI / 2, { kind: 'beast', y: 0.15 });
  statue(ctx, PARK_W + 3, -380, -Math.PI / 2, { kind: 'beast', y: 0.15 });
  board(ctx, 'ROBINSON PARK', 'CLOSES AT DUSK. NOBODY LISTENS.', 276, 2.6, -404.6, 0, -1, { w: 6, bg: 0x2f5a3a, base: 0.15 });
  for (let x = 266; x < 326; x += 10) parkBench(ctx, x, 0.15, -373.5, 0, -1);

  plaza(ctx, P.fountain.minX, P.fountain.minZ, P.fountain.maxX, P.fountain.maxZ);
  foundersFountain(ctx, 294, -470);
  for (const [x, z] of [[264.5, -440.5], [323.5, -440.5], [264.5, -499.5], [323.5, -499.5]]) { hedge(ctx, x - 1.5, z, x + 1.5, z, { y: 0.15, h: 0.9, w: 3 }); }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    parkBench(ctx, 294 + Math.cos(a) * 25, 0.15, -470 + Math.sin(a) * 25, -Math.cos(a), -Math.sin(a));
  }
  board(ctx, 'FOUNDERS\' FOUNTAIN', 'NO SWIMMING. NO WISHES. NO REFUNDS.', 294, 2.6, -437.6, 0, 1, { w: 5, bg: 0x2c4a63, base: 0.15 });

  plaza(ctx, P.mirror.minX, P.mirror.minZ, P.mirror.maxX, P.mirror.maxZ);
  mirrorArch(ctx, 284, -577, 0.35);
  bandshell(ctx, 300, -660);
  conservatory(ctx, 294, -752);
  slab(ctx, 'sidewalk', 284, 0, -738, 304, 0.15, -726, { tag: 'plaza' });
  board(ctx, 'KEEP OFF THE GRASS', 'IVY MEANS IT.', 262, 1.6, -640, 1, 0, { w: 2.6, bg: 0x2f5a3a });
  board(ctx, 'OUTDOOR CONCERT TONIGHT', 'THE GOTHAM PHILHARMONIC PLAYS IT SAFE', 320, 1.8, -600, -1, 0, { w: 3.6, bg: PALETTE.jokerPurple });

  // ---- paths ----
  const paths = [];
  paths.push(path(ctx, [{ x: 294, z: -405 }, { x: 294, z: -438 }], { benches: false }));
  paths.push(path(ctx, bezier({ x: PARK_W, z: -335 }, { x: 290, z: -335 }, { x: 300, z: -360 }, { x: 330, z: -372 }, 12)));
  paths.push(path(ctx, [{ x: PARK_W, z: -470 }, { x: 262, z: -470 }], { lamps: false, benches: false }));
  paths.push(path(ctx, bezier({ x: 294, z: -502 }, { x: 294, z: -515 }, { x: 320, z: -520 }, { x: 330, z: -532 }, 10)));
  paths.push(path(ctx, [{ x: PARK_W, z: -576 }, { x: 258, z: -576 }], { lamps: false, benches: false }));
  paths.push(path(ctx, bezier({ x: 300, z: -545 }, { x: 300, z: -552 }, { x: 296, z: -556 }, { x: 292, z: -558 }, 6), { lamps: false }));
  paths.push(path(ctx, bezier({ x: 312, z: -585 }, { x: 330, z: -600 }, { x: 330, z: -640 }, { x: 318, z: -655 }, 14)));
  paths.push(path(ctx, bezier({ x: 270, z: -596 }, { x: 262, z: -640 }, { x: 266, z: -690 }, { x: 290, z: -712 }, 16)));
  paths.push(path(ctx, bezier({ x: 318, z: -672 }, { x: 330, z: -690 }, { x: 325, z: -705 }, { x: 312, z: -712 }, 10)));
  paths.push(path(ctx, bezier({ x: PARK_W, z: -686 }, { x: 270, z: -686 }, { x: 276, z: -700 }, { x: 290, z: -712 }, 10), { lamps: false }));
  paths.push(path(ctx, [{ x: PARK_W, z: -732 }, { x: 284, z: -732 }], { lamps: false, benches: false }));
  paths.push(path(ctx, bezier({ x: 304, z: -732 }, { x: 322, z: -732 }, { x: 330, z: -745 }, { x: 330, z: -775 }, 10)));
  const pts = paths.flat();

  // ---- trees: avenue and drive rows, then groves ----
  const keep = Object.values(P);
  for (let z = Z0 + 8; z < Z1 - 4; z += 12) {
    if (entrances.some(([a, b]) => z > a - 3 && z < b + 3) || cross.some((c) => Math.abs(z - c) < 9)) continue;
    if (!keep.some((r) => r !== P.roads && inRect(r, PARK_W + 3, z))) tree(ctx, PARK_W + 3, z, { s: 1.1, perch: Math.round(z) % 5 === 0 });
  }
  for (let z = Z0 + 6; z < -400; z += 15) {
    if (cross.some((c) => Math.abs(z - c) < 9) || Math.abs(z + 450) < 9) continue;
    tree(ctx, LAWN_E - 2.5, z, { kind: 'column', s: 1.05 });
  }
  const groves = [[Z0 + 4, cross[2] - 8, 18], [cross[2] + 8, cross[1] - 8, 46], [cross[1] + 8, cross[0] - 8, 26], [cross[0] + 8, Z1 - 4, 22]];
  for (const [a, b, n] of groves) grove(ctx, PARK_W + 7, a, LAWN_E - 6, b, n, keep, pts);
  // Conifers framing the conservatory.
  for (const x of [264, 324]) for (let z = -772; z < -740; z += 8) tree(ctx, x, z, { kind: 'cone', s: 1.2 });

  boathouse(ctx, -610);
  // A few seawall extras: life rings and a "NO WAKE" buoy line.
  for (let z = -760; z < -400; z += 90) board(ctx, 'NO SWIMMING', 'THE LAKE IS NOT YOUR FRIEND', EAST.promenade.x1 - 0.8, 1.5, z, -1, 0, { w: 2, bg: PALETTE.crimson });
}

// Lakeshore Drive's southern stretch beside Old Gotham (region 'lakeshore', x 236..366, z -236..80):
// the avenue, a lawn strip with a statue garden and a second, smaller shell, the promenade.
export function buildLakeshore(ctx) {
  const Z0 = -236, Z1 = 80;
  baseGround(ctx, 240, Z0, SHORE_X, Z1);
  const entrances = [[-126, -114], [-56, -44], [54, 66]];
  avenue(ctx, Z0, Z1, { x0: 240, entrances });
  // Stitches from the core's z streets (they end at x 236) onto the avenue: kerb cuts and paint.
  for (const z of EAST.coreStitch) if (z > Z0 && z < Z1) laneLine(ctx, [{ x: 240, z }, { x: F.x - 3, z }], 0, 0.02);
  const cross = [EAST.causeway.z, 30];
  for (const z of cross) crossDrive(ctx, z);
  const P = {
    statues: { minX: 268, maxX: 320, minZ: -150, maxZ: -108 },
    shell: { minX: 284, maxX: 316, minZ: -36, maxZ: -8 },
    audience: { minX: 284, maxX: 316, minZ: -72, maxZ: -38 },
    roads: { minX: 236, maxX: PARK_W, minZ: Z0, maxZ: Z1 },
  };
  const bands = [[Z0, cross[0] - 6], [cross[0] + 6, cross[1] - 6], [cross[1] + 6, Z1]];
  for (const [a, b] of bands) lawn(ctx, PARK_W, a, LAWN_E, b);
  // The corner the south curve leaves (between the quay and the drive).
  const curveW = offsetLine(EAST.lsd.southCurve, EAST.lsd.width / 2).filter((p) => p.x < SHORE_X);
  lawnPoly(ctx, [{ x: LAWN_E, z: Z0 }, { x: LAWN_E, z: -140 }, ...curveW.filter((p) => p.z < -140).reverse(), { x: SHORE_X, z: Z0 }].reverse());
  promenade(ctx, -150, Z1, { gaps: [[EAST.causeway.z - 8, EAST.causeway.z + 8]] });

  // Statue garden: a ring of worthies round a clipped parterre (low cover for a fight or a hunt).
  plaza(ctx, P.statues.minX, P.statues.minZ, P.statues.maxX, P.statues.maxZ);
  hedge(ctx, 278, -140, 310, -140, { y: 0.15 });
  hedge(ctx, 278, -118, 310, -118, { y: 0.15 });
  hedge(ctx, 278, -140, 278, -118, { y: 0.15 });
  hedge(ctx, 310, -140, 310, -128, { y: 0.15 });
  for (const [x, z, yaw] of [[272, -146, 0.4], [316, -146, -0.4], [272, -112, Math.PI - 0.4], [316, -112, Math.PI + 0.4], [294, -129, 0]]) statue(ctx, x, z, yaw, { kind: 'figure', y: 0.15 });
  board(ctx, 'THE WORTHIES', 'GOTHAM\'S FOUNDERS. MOSTLY ACQUITTED.', 294, 2.4, -107.6, 0, 1, { w: 4.4, bg: 0x4a4a52, base: 0.15 });
  // A second, smaller shell facing north over its lawn.
  plaza(ctx, P.shell.minX, P.shell.minZ, P.shell.maxX, P.shell.maxZ, { lamps: false });
  smallShell(ctx, 300, -20);

  const paths = [];
  paths.push(path(ctx, [{ x: PARK_W, z: -120 }, { x: 268, z: -120 }], { lamps: false, benches: false }));
  paths.push(path(ctx, bezier({ x: 320, z: -129 }, { x: 330, z: -150 }, { x: 330, z: -190 }, { x: 300, z: -230 }, 14)));
  paths.push(path(ctx, bezier({ x: PARK_W, z: -50 }, { x: 275, z: -50 }, { x: 282, z: -44 }, { x: 290, z: -38 }, 8)));
  paths.push(path(ctx, bezier({ x: PARK_W, z: 60 }, { x: 290, z: 60 }, { x: 310, z: 40 }, { x: 330, z: 60 }, 12)));
  const pts = paths.flat();
  const keep = Object.values(P);
  for (let z = Z0 + 8; z < Z1 - 4; z += 12) {
    if (entrances.some(([a, b]) => z > a - 3 && z < b + 3) || cross.some((c) => Math.abs(z - c) < 9)) continue;
    tree(ctx, PARK_W + 3, z, { s: 1.1, perch: Math.round(z) % 5 === 0 });
  }
  for (let z = -136; z < Z1 - 4; z += 15) if (!cross.some((c) => Math.abs(z - c) < 9)) tree(ctx, LAWN_E - 2.5, z, { kind: 'column', s: 1.05 });
  grove(ctx, PARK_W + 7, Z0 + 6, LAWN_E - 6, cross[0] - 8, 22, keep, pts);
  grove(ctx, PARK_W + 7, cross[0] + 8, LAWN_E - 6, cross[1] - 8, 12, keep, pts);
  grove(ctx, PARK_W + 7, cross[1] + 8, LAWN_E - 6, Z1 - 2, 10, keep, pts);
  board(ctx, 'PICNIC AREA', 'ANTS HAVE RIGHT OF WAY', 262, 1.6, 70, 1, 0, { w: 2.6, bg: 0x2f5a3a });
}

function smallShell(ctx, cx, cz) {
  const cream = 0xe2dccb;
  slab(ctx, 'concrete', cx - 10, 0.15, cz - 6, cx + 10, 1.2, cz + 4, { tag: 'stage' });
  for (let i = 0; i < 3; i++) ctx.buckets.add('painted', new THREE.TorusGeometry(9 - i * 1.4, 0.35, 4, 14, Math.PI).rotateY(Math.PI).translate(cx, 1.2, cz + 4 - 1.4 - i * 1.4), cream);
  ctx.buckets.add('painted', new THREE.CircleGeometry(9.2, 14, 0, Math.PI).translate(cx, 1.2, cz + 3.8), 0x3a3a44);
  ctx.collision.addBox(cx - 9.5, 1.2, cz + 3.4, cx + 9.5, 7, cz + 4.2, 'shell');
  ctx.collision.addBox(cx - 4, 7, cz + 1, cx + 4, 10.2, cz + 4.2, 'shell');
  ctx.grapple.push({ x: cx, y: 10.2, z: cz + 2.5, nx: 0, nz: -1, perch: true });
  for (let k = 1; k < 7; k++) { const a = (k / 7) * Math.PI; ctx.halos.add(cx + Math.cos(a) * 8.3, 1.2 + Math.sin(a) * 8.3, cz + 3, k % 2 ? PALETTE.window : PALETTE.neonPink, 1.2); }
  lightSpot(ctx, cx, 5, cz - 2, PALETTE.window, 20, 16);
  neonWord(ctx, 'LAKESIDE SHELL', cx, 11.6, cz + 4.3, 0, -1, { h: 1.1, color: PALETTE.neonPink, back: false });
}
