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

// [polish2] World-space value noise: the same point always gets the same number, so neighbouring
// rock boxes displace their shared edges alike and their beds line up.
function h3(x, y, z) { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(xi, yi, zi), h3(xi + 1, yi, zi), sx), L(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), sx), sy),
    L(L(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), sx), L(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), sx), sy), sz);
}

// A rock face filling a box (the ink pass draws rock, not a crate).
// [polish2] The polish list's "cliffs and gorge walls look like stacked slabs": each box used to be
// one jittered crate with a flat lid, so a cliff read as a pile of them. Now the box is cut finer
// and every vertex moves by noise of its WORLD position: upright ribs and gullies that carry
// across the joints between boxes, beds that step in and out at the same heights all along the
// face, tops that are no longer one plane, and colour in dipping beds (darker at the foot, moss
// on the caps). The rng is drawn exactly as before (the same numbers in the same order: nothing
// placed after a rock moves), and the collision boxes are the caller's and unchanged.
export function boulder(ctx, rng, minX, minY, minZ, maxX, maxY, maxZ, color = DARK_STONE) {
  const w = maxX - minX, h = maxY - minY, d = maxZ - minZ;
  // The old crate's draws, kept: three numbers per corner of a box cut every 4 m of height.
  const coarse = new THREE.BoxGeometry(w + 0.5, h, d + 0.5, 1, Math.max(1, Math.round(h / 4)), 1);
  const cp = coarse.attributes.position;
  const seen = new Set();
  for (let i = 0; i < cp.count; i++) {
    const k = `${cp.getX(i).toFixed(2)},${cp.getY(i).toFixed(2)},${cp.getZ(i).toFixed(2)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    rng.range(-0.45, 0.45);
    if (cp.getY(i) > h / 2 - 0.01) rng.range(-0.25, 0); else rng.range(-0.3, 0.3);
    rng.range(-0.45, 0.45);
  }
  coarse.dispose();
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  // Potato cuts each box half as fine and stands no flakes (hard rule 5).
  const lite = (ctx.quality?.crowdDensity ?? 1) < 0.5;
  const seg = (L, m) => Math.max(1, Math.min(lite ? 3 : 6, Math.round(L / (lite ? m * 2 : m))));
  const g = new THREE.BoxGeometry(w + 0.5, h, d + 0.5, seg(w, 3), seg(h, 2.2), seg(d, 3));
  const p = g.attributes.position, nrm = g.attributes.normal;
  const base = new THREE.Color(color), moss = new THREE.Color(MOSS), c = new THREE.Color();
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const lx = p.getX(i), ly = p.getY(i), lz = p.getZ(i);
    const X = lx + cx, Y = ly + cy, Z = lz + cz;
    const top = ly > h / 2 - 0.01, bottom = ly < -h / 2 + 0.01;
    // Upright ribs: the same push for every height at this (x, z).
    // On a face they push it out into a buttress or let it fall back into a gully (up to ~1.6 m).
    const rib = vnoise(X * 0.24, 0.5, Z * 0.24);
    const rx = (vnoise(X * 0.31, 0.5, Z * 0.31) - 0.5) * 1.2, rz = (vnoise(X * 0.31 + 40, 7.5, Z * 0.31 + 11) - 0.5) * 1.2;
    // Beds: every ~2.5 m of height the face steps out or in, the same all along the cliff.
    const bed = vnoise(X * 0.035, Y * 0.42 + X * 0.012, Z * 0.035) - 0.5;
    const ox = Math.abs(lx) > w / 2 ? Math.sign(lx) : 0, oz = Math.abs(lz) > d / 2 ? Math.sign(lz) : 0;
    const push = (rib - 0.42) * 3.2 + bed * 1.4;
    let dx = rx + ox * push, dz = rz + oz * push, dy = 0;
    // Tops stay within a hand of the collision lid; along a cliff's brow they rise and dip a
    // little so the skyline is not ruled. The foot is buried anyway.
    if (top) { dy = (ox || oz) && h > 5 ? (vnoise(X * 0.45, 3.3, Z * 0.45) - 0.55) * 0.9 : -0.3 * vnoise(X * 0.5, 3.3, Z * 0.5); dx *= 0.7; dz *= 0.7; }
    else if (!bottom) dy = (vnoise(X * 0.2, Y * 0.7, Z * 0.2) - 0.5) * 0.7;
    p.setXYZ(i, lx + dx, ly + dy, lz + dz);
    // Colour: beds a step lighter or darker, shade gathering toward the foot, moss on the caps.
    const band = Math.sin(Y * 1.15 + X * 0.045 + Z * 0.03 + vnoise(X * 0.05, 1.5, Z * 0.05) * 3);
    // Gullies sit in shade, buttresses catch the light.
    let k = 0.7 + rib * 0.5 + (band > 0.25 ? 0.07 : band < -0.45 ? -0.06 : 0) + (vnoise(X * 0.4, Y * 0.4, Z * 0.4) - 0.5) * 0.1;
    k *= 0.74 + 0.26 * Math.min(1, Math.max(0, (Y - minY) / 5));
    c.copy(base).multiplyScalar(k);
    if (nrm.getY(i) > 0.9) c.lerp(moss, 0.45);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const f = g.toNonIndexed();
  f.computeVertexNormals();
  ctx.buckets.add('painted', f.translate(cx, cy, cz), color);
  // Flakes: on a tall face, a slab or two of rock standing a little proud of it and leaning in,
  // so the wall has pillars and joints with real edges for the ink to find. Placed by a hash of
  // the box's position (both long sides: one is inside the hill).
  if (lite || h < 6 || Math.max(w, d) < 3) return;
  const alongX = w >= d;
  const L = alongX ? w : d;
  for (const side of [-1, 1]) {
    const n = 1 + (h3(cx * 0.37, side, cz * 0.53) > 0.45 ? 1 : 0);
    for (let q = 0; q < n; q++) {
      const r0 = h3(cx * 0.71 + q * 3.1, side * 2.3, cz * 0.29), r1 = h3(cx * 0.13, q * 5.7 + side, cz * 0.91), r2 = h3(cx * 0.57 + side, cz * 0.23, q + 0.5);
      const fw = 1.6 + r0 * Math.min(3.4, L * 0.45), fh = h * (0.5 + r1 * 0.42), ft = 0.9 + r2 * 0.9;
      const along = (r1 - 0.5) * Math.max(0, L - fw) + (q ? (r0 - 0.5) * 2 : 0);
      const fg = new THREE.BoxGeometry(alongX ? fw : ft, fh, alongX ? ft : fw, 1, 2, 1);
      const fp = fg.attributes.position;
      // Taper to a broken top: pull the upper corners in and stagger them.
      for (let i = 0; i < fp.count; i++) {
        const yy = fp.getY(i);
        if (yy > fh / 2 - 0.01) fp.setXYZ(i, fp.getX(i) * (alongX ? 0.55 + r2 * 0.3 : 1), yy - h3(fp.getX(i) + cx, q + 1.5, fp.getZ(i) + cz) * fh * 0.14, fp.getZ(i) * (alongX ? 1 : 0.55 + r2 * 0.3));
        else if (Math.abs(yy) < 0.01) fp.setXYZ(i, fp.getX(i) * (alongX ? 0.9 : 1.15), yy, fp.getZ(i) * (alongX ? 1.15 : 0.9));
      }
      const off = side * ((alongX ? d : w) / 2 + 0.25 + ft * 0.2 + (rib0(cx, cz) - 0.42) * 2.2);
      const fx = cx + (alongX ? along : off), fz = cz + (alongX ? off : along);
      const ff = fg.toNonIndexed();
      ff.computeVertexNormals();
      const lean = side * (0.03 + r0 * 0.05);
      if (alongX) ff.rotateX(-lean); else ff.rotateZ(lean);
      c.copy(base).multiplyScalar(0.82 + r1 * 0.42);
      ctx.buckets.add('painted', ff.rotateY((r2 - 0.5) * 0.3).translate(fx, minY + fh / 2, fz), c.getHex());
    }
  }
}
const rib0 = (x, z) => vnoise(x * 0.24, 0.5, z * 0.24);
