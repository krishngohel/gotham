// Small builders for things that stand on uneven ground (Bristol's hills, Blackgate's rock):
// cityBuilder.building() always stands at y 0, these take a base height. All world-space, all
// through the chunk buckets, collision as boxes like the rest of the city.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { box, tiledBox, cylinder } from '../buckets.js';
import { solid, glow, lightSpot, edgeGrapples } from '../cityBuilder.js';
import { FACADE_METERS, FLOOR_METERS } from '../materials.js';

export const STONE = 0x7a756c, DARK_STONE = 0x4a4741, SLATE = 0x353a42, MOSS = 0x3f4a32, IRON = 0x1c1e22, LIME = 0xb8b0a0;

// A box from bounds (painted, optional collision).
export function block(ctx, minX, minY, minZ, maxX, maxY, maxZ, color, { collide = true, tag = '', key = 'painted' } = {}) {
  ctx.buckets.add(key, box(maxX - minX, maxY - minY, maxZ - minZ, (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2), color);
  if (collide) ctx.collision.addBox(minX, minY, minZ, maxX, maxY, maxZ, tag);
}

// Highest and lowest ground under a footprint (corners, edge midpoints and centre).
export function groundSpan(ground, x, z, w, d) {
  let lo = Infinity, hi = -Infinity;
  for (const sx of [-0.5, 0, 0.5]) for (const sz of [-0.5, 0, 0.5]) {
    const h = ground(x + sx * w, z + sz * d);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return { lo, hi };
}

// A pitched roof over (x, z, w, d) from height y: ridge along x (`alongX`) or z, `rise` metres.
// Collides as three tiers (like cityBuilder's pitched roofs) with a perch on the ridge.
export function pitchedRoof(ctx, x, y, z, w, d, rise, { alongX = true, color = SLATE, over = 0.45, perch = true, collide = true } = {}) {
  const shape = new THREE.Shape();
  const span = alongX ? d + over * 2 : w + over * 2, len = alongX ? w + over * 2 : d + over * 2;
  shape.moveTo(-span / 2, 0); shape.lineTo(span / 2, 0); shape.lineTo(0, rise); shape.lineTo(-span / 2, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2);
  if (alongX) g.rotateY(Math.PI / 2);
  ctx.buckets.add('painted', g.translate(x, y, z), color);
  if (collide) {
    for (let k = 0; k < 3; k++) {
      const f = [1, 0.6, 0.24][k];
      const hw = alongX ? w / 2 : (w / 2) * f, hd = alongX ? (d / 2) * f : d / 2;
      ctx.collision.addBox(x - hw, y + (rise * k) / 3, z - hd, x + hw, y + (rise * (k + 1)) / 3, z + hd, 'roof');
    }
  }
  if (perch) ctx.grapple.push({ x, y: y + rise, z, nx: alongX ? 0 : 1, nz: alongX ? 1 : 0, perch: true });
}

// A building on the ground: a stone plinth down to the lowest ground under it, facade walls in
// one of the city's facade styles (their textures carry the lit windows), a pitched or flat roof,
// collision, far-LOD record, eave grapples on flat roofs, a lit door. Returns its base height.
export function house(ctx, ground, o) {
  const { x, z, w, d, h } = o;
  const style = o.style ?? 'stone';
  const { lo, hi } = groundSpan(ground, x, z, w, d);
  const y = o.y ?? hi + 0.1;
  block(ctx, x - w / 2 - 0.3, lo - 1, z - d / 2 - 0.3, x + w / 2 + 0.3, y + 0.25, z + d / 2 + 0.3, o.plinth ?? DARK_STONE, { tag: 'building' });
  ctx.buckets.add(`facade_${style}`, tiledBox(w, h, d, x, y + h / 2, z, { uvScale: [FACADE_METERS[style], FLOOR_METERS], uOffset: ctx.rng.next(), faces: [0, 1, 4, 5] }));
  ctx.collision.addBox(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, 'building');
  ctx.facades.push({ minX: x - w / 2, minY: y, minZ: z - d / 2, maxX: x + w / 2, maxY: y + h, maxZ: z + d / 2, style });
  ctx.roofs.push({ id: o.id ?? `house${x | 0}_${z | 0}`, x, z, w, d, y: y + h, district: o.district ?? 'bristol' });
  // Cornice band under the eaves.
  ctx.buckets.add('painted', box(w + 0.5, 0.35, d + 0.5, x, y + h - 0.1, z), o.trim ?? LIME);
  if (o.roof === 'flat') {
    ctx.buckets.add('roof', tiledBox(w, 0.3, d, x, y + h + 0.15, z, { uvScale: [8, 8], faces: [2] }));
    edgeGrapples(ctx, x, z, w, d, y + h, 8);
  } else {
    const alongX = o.ridge ? o.ridge === 'x' : w >= d;
    pitchedRoof(ctx, x, y + h, z, w, d, o.rise ?? Math.min(w, d) * 0.55, { alongX, color: o.roofColor ?? SLATE });
  }
  // Chimneys.
  for (const [cx, cz] of o.chimneys ?? []) chimneyStack(ctx, x + cx, y + h, z + cz, o.rise ?? Math.min(w, d) * 0.55);
  // A front door with a lamp: face 'n' | 's' | 'e' | 'w'.
  if (o.door) {
    const f = faceOf(o.door, x, z, w, d);
    ctx.buckets.add('painted', box(Math.abs(f.nz) ? 1.4 : 0.12, 2.4, Math.abs(f.nx) ? 1.4 : 0.12, f.px + f.nx * 0.05, y + 1.2, f.pz + f.nz * 0.05), 0x2a1c14);
    lantern(ctx, f.px + f.nx * 0.35 + f.nz * 1.2, y + 2.7, f.pz + f.nz * 0.35 - f.nx * 1.2, PALETTE.window, 1.6);
  }
  return y;
}

export function faceOf(face, x, z, w, d) {
  if (face === 'n') return { px: x, pz: z - d / 2, nx: 0, nz: -1 };
  if (face === 's') return { px: x, pz: z + d / 2, nx: 0, nz: 1 };
  if (face === 'e') return { px: x + w / 2, pz: z, nx: 1, nz: 0 };
  return { px: x - w / 2, pz: z, nx: -1, nz: 0 };
}

// A tall clustered chimney stack standing through a roof (a perch on top).
export function chimneyStack(ctx, x, y, z, rise) {
  const top = y + rise + 1.6;
  solid(ctx, 'painted', box(1.3, top - y, 0.9, x, (y + top) / 2, z), { color: 0x6a4a3a, tag: 'stack' });
  ctx.buckets.add('painted', box(1.5, 0.25, 1.1, x, top - 0.1, z), DARK_STONE);
  for (const s of [-0.35, 0.35]) ctx.buckets.add('painted', cylinder(0.18, 0.18, 0.7, x + s, top + 0.35, z, 8), 0x7a5444);
  ctx.grapple.push({ x, y: top, z, nx: 0, nz: 1, perch: true });
  ctx.steam.push({ x, y: top + 0.8, z, s: 0.7 });
}

// A wall-hung or post lantern: a small lit box with a halo (no real light).
export function lantern(ctx, x, y, z, color = PALETTE.window, size = 2) {
  ctx.buckets.add('painted', box(0.32, 0.08, 0.32, x, y + 0.26, z), IRON);
  glow(ctx, box(0.24, 0.4, 0.24, x, y, z), color);
  ctx.halos.add(x, y, z, color, size);
}

// A lamp post standing on the ground at (x, z): an old iron lantern, a halo, a light spot for
// the pooled lights and a warm streak on wet ground.
export function lampPost(ctx, ground, x, z, { color = PALETTE.window, h = 4.2, spot = true } = {}) {
  const y = ground(x, z);
  solid(ctx, 'painted', cylinder(0.07, 0.11, h, x, y + h / 2, z, 8), { color: IRON, tag: 'prop' });
  ctx.buckets.add('painted', cylinder(0.18, 0.22, 0.4, x, y + 0.2, z, 8), IRON);
  lantern(ctx, x, y + h + 0.25, z, color, 2.8);
  ctx.buckets.add('painted', new THREE.ConeGeometry(0.3, 0.3, 4).rotateY(Math.PI / 4).translate(x, y + h + 0.62, z), IRON);
  if (spot) lightSpot(ctx, x, y + h - 0.2, z, color, 20, 14);
  ctx.reflect.push({ x, y: y + 0.05, z, h, color, w: 0.4, len: 6, k: 0.3 });
  ctx.buckets.add('pool', new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2).translate(x, y + 0.06, z), 0x6b4520);
}

// A dry-stone wall from (x0, z0) to (x1, z1), 1 m high, following the ground in 4 m segments, each
// its own box (a car or a walker stops at it; anyone can hop it). Capstones on top.
export function stoneWall(ctx, ground, x0, z0, x1, z1, { h = 1.0, t = 0.55, color = STONE, gaps = null, tag = 'wall' } = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(L / 4));
  const ang = Math.atan2(x1 - x0, z1 - z0);
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2;
    const mx = x0 + (x1 - x0) * tm, mz = z0 + (z1 - z0) * tm;
    if (gaps && gaps.some(([gx, gz, r]) => Math.hypot(mx - gx, mz - gz) < r)) continue;
    const sl = L / n;
    const ya = ground(x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0), yb = ground(x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1);
    const yLo = Math.min(ya, yb, ground(mx, mz)) - 0.4, yHi = Math.max(ya, yb) + h;
    const g = new THREE.BoxGeometry(t, yHi - yLo, sl + 0.05).rotateY(ang).translate(mx, (yLo + yHi) / 2, mz);
    ctx.buckets.add('painted', g, color);
    ctx.buckets.add('painted', new THREE.BoxGeometry(t + 0.14, 0.14, sl + 0.05).rotateY(ang).translate(mx, yHi + 0.05, mz), DARK_STONE);
    g.computeBoundingBox();
    // Axis-aligned collision: a diagonal wall becomes a chain of small boxes along its line.
    const sub = Math.abs(Math.sin(ang * 2)) > 0.2 ? 3 : 1;
    for (let q = 0; q < sub; q++) {
      const ta = t0 + ((t1 - t0) * q) / sub, tb = t0 + ((t1 - t0) * (q + 1)) / sub;
      const ax = x0 + (x1 - x0) * ta, az = z0 + (z1 - z0) * ta, bx = x0 + (x1 - x0) * tb, bz = z0 + (z1 - z0) * tb;
      const r = t / 2;
      ctx.collision.addBox(Math.min(ax, bx) - r, yLo, Math.min(az, bz) - r, Math.max(ax, bx) + r, yHi + 0.12, Math.max(az, bz) + r, tag);
    }
  }
}

// Stone gate piers with ball finials either side of an opening (a perch on each).
export function gatePiers(ctx, ground, x, z, gap, alongX, { h = 3.2, w = 1.1, color = STONE } = {}) {
  for (const s of [-1, 1]) {
    const px = x + (alongX ? s * (gap / 2 + w / 2) : 0), pz = z + (alongX ? 0 : s * (gap / 2 + w / 2));
    const y = ground(px, pz) - 0.3;
    solid(ctx, 'painted', box(w, h, w, px, y + h / 2, pz), { color, tag: 'pier' });
    ctx.buckets.add('painted', box(w + 0.25, 0.2, w + 0.25, px, y + h + 0.1, pz), DARK_STONE);
    ctx.buckets.add('painted', new THREE.SphereGeometry(0.38, 10, 8).translate(px, y + h + 0.55, pz), LIME);
    ctx.grapple.push({ x: px, y: y + h + 0.2, z: pz, nx: alongX ? 0 : 1, nz: alongX ? 1 : 0, perch: true });
  }
}

// A road ribbon over the terrain: quads between consecutive centre points, `width` wide, `lift`
// above the road height (the terrain under it is carved to exactly that height).
export function roadRibbon(ctx, points, width, { key = 'asphalt', lift = 0.04, uv = 17 } = {}) {
  const pos = [], uvs = [], idx = [];
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    if (i > 0) s += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    const nx = -dz * width / 2, nz = dx * width / 2;
    pos.push(p.x - nx, p.y + lift, p.z - nz, p.x + nx, p.y + lift, p.z + nz);
    uvs.push(0, s / uv, width / uv, s / uv);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  // Faces must point up whichever way the road was drawn.
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  ctx.buckets.add(key, g);
}

// A faceted boulder filling a box (jittered corners, so the ink pass draws rock, not a crate).
export function boulder(ctx, rng, minX, minY, minZ, maxX, maxY, maxZ, color = DARK_STONE) {
  const w = maxX - minX, h = maxY - minY, d = maxZ - minZ;
  const g = new THREE.BoxGeometry(w + 0.5, h, d + 0.5, 1, Math.max(1, Math.round(h / 4)), 1);
  const p = g.attributes.position;
  const jit = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(2)},${p.getY(i).toFixed(2)},${p.getZ(i).toFixed(2)}`;
    if (!jit.has(k)) jit.set(k, [rng.range(-0.45, 0.45), p.getY(i) > h / 2 - 0.01 ? rng.range(-0.25, 0) : rng.range(-0.3, 0.3), rng.range(-0.45, 0.45)]);
    const [a, b, c] = jit.get(k);
    p.setXYZ(i, p.getX(i) + a, p.getY(i) + b, p.getZ(i) + c);
  }
  const f = g.toNonIndexed();
  f.computeVertexNormals();
  ctx.buckets.add('painted', f.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2), color);
}
