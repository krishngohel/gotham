// Small builders shared by the east-side regions (lakefront, museum campus, pier, Arkham): slabs,
// railings at any height or angle, lamps, road ribbons along curves, stylised trees, statues,
// signs and string lights. Everything goes through the region's buckets (chunked, merged), the
// shared halos and light-spot list; nothing here adds a PointLight or a material of its own except
// textured sign planes, which staticBatches packs into one atlas per chunk.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { LAYER_FX } from '../../render/layers.js';
import { box, tiledBox, cylinder } from '../buckets.js';
import { solid, glow, lightSpot } from '../cityBuilder.js';
import { neonTexture, billboardTexture } from '../textures.js';

export const STONE = 0x8c877d;
export const DARK_STONE = 0x4e4b46;
export const IRON = 0x1e2422;
export const BRASS = 0xb08a3e;

// ---- geometry on polylines ----

// Right-hand normal of a heading (x east, z south, seen from above): heading north -> east.
const rightOf = (dx, dz) => { const l = Math.hypot(dx, dz) || 1; return { x: -dz / l, z: dx / l }; };

// Points `d` metres to the right of a polyline (mitred, clamped at sharp corners).
export function offsetLine(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(pts.length - 1, i + 1)];
    const n0 = rightOf(b.x - a.x || c.x - b.x, b.z - a.z || c.z - b.z);
    const n1 = rightOf(c.x - b.x || b.x - a.x, c.z - b.z || b.z - a.z);
    let nx = n0.x + n1.x, nz = n0.z + n1.z;
    const l = Math.hypot(nx, nz) || 1;
    nx /= l; nz /= l;
    const k = Math.min(2, 1 / Math.max(0.5, nx * n1.x + nz * n1.z));
    out.push({ x: b.x + nx * d * k, z: b.z + nz * d * k, y: b.y });
  }
  return out;
}

// Re-samples a polyline every `step` metres (keeps the end points).
export function resample(pts, step) {
  const out = [{ ...pts[0] }];
  let carry = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    let s = step - carry;
    while (s < L) { const t = s / L; out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t }); s += step; }
    carry = L - (s - step);
  }
  const last = pts[pts.length - 1];
  const q = out[out.length - 1];
  if (Math.hypot(q.x - last.x, q.z - last.z) > 0.2) out.push({ ...last });
  return out;
}

export const lineLength = (pts) => { let s = 0; for (let i = 0; i + 1 < pts.length; i++) s += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z); return s; };

// A flat ribbon of width w along a polyline at height y (top face only), uv in metres / uvM.
export function ribbon(pts, w, y, uvM = 17) {
  const L = offsetLine(pts, -w / 2), R = offsetLine(pts, w / 2);
  const pos = [], uv = [], idx = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const yy = (pts[i].y ?? 0) + y;
    pos.push(L[i].x, yy, L[i].z, R[i].x, yy, R[i].z);
    uv.push(0, s / uvM, w / uvM, s / uvM);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Collision for a road surface along a polyline: boxes every `step` m covering the cross-section
// (axis-aligned, so a diagonal stretch is a little generous at its edges, which over water only
// widens the deck by a hand's breadth at most once step is small).
export function ribbonBoxes(ctx, pts, w, yTop, { yBot = yTop - 1.2, step = 2, slice = 3, tag = 'road', where = null } = {}) {
  const s = resample(pts, step);
  const k = Math.max(1, Math.ceil(w / slice)), sw = w / k;
  for (let i = 0; i + 1 < s.length; i++) {
    const a = s[i], b = s[i + 1];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if (where && !where(mx, mz)) continue;
    const n = rightOf(b.x - a.x, b.z - a.z);
    const top = yTop + ((a.y ?? 0) + (b.y ?? 0)) / 2;
    // Slices across the road, each boxed on its own: a diagonal stretch overhangs its kerb by
    // well under a metre instead of by half the road width.
    for (let j = 0; j < k; j++) {
      const o0 = -w / 2 + j * sw, o1 = o0 + sw;
      const xs = [a.x + n.x * o0, a.x + n.x * o1, b.x + n.x * o0, b.x + n.x * o1];
      const zs = [a.z + n.z * o0, a.z + n.z * o1, b.z + n.z * o0, b.z + n.z * o1];
      ctx.collision.addBox(Math.min(...xs), yBot, Math.min(...zs), Math.max(...xs), top, Math.max(...zs), tag);
    }
  }
}

// Lane paint along a polyline, `d` metres right of it: dashes (gap > 0) or a solid line.
export function laneLine(ctx, pts, d, y = 0.02, { gap = 9, len = 3.5, width = 0.22 } = {}) {
  const line = resample(offsetLine(pts, d), gap > 0 ? gap : 3);
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const ln = gap > 0 ? Math.min(len, L) : L + 0.05;
    const g = new THREE.PlaneGeometry(width, ln).rotateX(-Math.PI / 2).rotateY(Math.atan2(b.x - a.x, b.z - a.z));
    ctx.buckets.add('lane', g.translate((a.x + b.x) / 2, y + (a.y ?? 0), (a.z + b.z) / 2));
  }
}

// ---- solids ----

export function slab(ctx, key, minX, minY, minZ, maxX, maxY, maxZ, { collide = true, tag = '', uv = [4, 4], faces = 'all', color = null } = {}) {
  const g = tiledBox(maxX - minX, maxY - minY, maxZ - minZ, (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, { uvScale: uv, faces });
  if (collide) ctx.collision.addBox(minX, minY, minZ, maxX, maxY, maxZ, tag);
  ctx.buckets.add(key, g, color);
}

// A box rotated about y at (x, z) (visual only), for diagonal pieces.
export function turned(w, h, d, x, y, z, yaw) {
  return new THREE.BoxGeometry(w, h, d).rotateY(yaw).translate(x, y, z);
}

// A 1.1 m railing along x (alongX) or z, from a to b at the other coordinate `at`, base y.
export function railing(ctx, alongX, a, b, at, y, { color = PALETTE.steel, post = 2.4, h = 1.1 } = {}) {
  if (b - a < 0.2) return;
  const len = b - a, mid = (a + b) / 2;
  const bx = (l, hh, w, c, yy) => (alongX ? box(l, hh, w, c, yy, at) : box(w, hh, l, at, yy, c));
  ctx.buckets.add('painted', bx(len, 0.08, 0.1, mid, y + h), color);
  ctx.buckets.add('painted', bx(len, 0.05, 0.06, mid, y + h * 0.55), color);
  for (let t = a; t <= b + 1e-6; t += post) ctx.buckets.add('painted', bx(0.07, h, 0.07, t, y + h / 2), color);
  if (alongX) ctx.collision.addBox(a, y, at - 0.15, b, y + h, at + 0.15, 'railing');
  else ctx.collision.addBox(at - 0.15, y, a, at + 0.15, y + h, b, 'railing');
}

// A railing along any polyline (curves of the viaduct, the pier's ramps): rails drawn as turned
// boxes, collision as short thin boxes every metre or so.
export function railLine(ctx, pts, y, { color = PALETTE.steel, h = 1.1, post = 3 } = {}) {
  const s = resample(pts, 1.5);
  for (let i = 0; i + 1 < s.length; i++) {
    const a = s[i], b = s[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z), yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, yy = y + ((a.y ?? 0) + (b.y ?? 0)) / 2;
    ctx.buckets.add('painted', turned(0.1, 0.08, L + 0.05, mx, yy + h, mz, yaw), color);
    ctx.buckets.add('painted', turned(0.06, 0.05, L + 0.05, mx, yy + h * 0.55, mz, yaw), color);
    if (i % Math.max(1, Math.round(post / 1.5)) === 0) ctx.buckets.add('painted', box(0.08, h, 0.08, a.x, yy + h / 2, a.z), color);
    ctx.collision.addBox(Math.min(a.x, b.x) - 0.15, yy, Math.min(a.z, b.z) - 0.15, Math.max(a.x, b.x) + 0.15, yy + h, Math.max(a.z, b.z) + 0.15, 'railing');
  }
}

// ---- lights ----

// A lamp post standing at height y, its head reaching toward (nx, nz).
export function lampAt(ctx, x, y, z, nx, nz, color = PALETTE.sodium, { pole = 6.2, pool = 0x6b4520, spot = true } = {}) {
  solid(ctx, 'steel', cylinder(0.09, 0.14, pole, x, y + pole / 2, z, 8), { tag: 'prop' });
  const hx = x + nx * 1.3, hz = z + nz * 1.3;
  ctx.buckets.add('steel', box(Math.abs(nx) > 0.1 ? 1.4 : 0.1, 0.1, Math.abs(nz) > 0.1 ? 1.4 : 0.1, x + nx * 0.65, y + pole - 0.05, z + nz * 0.65));
  ctx.buckets.add('steel', box(0.7, 0.2, 0.7, hx, y + pole, hz));
  glow(ctx, box(0.5, 0.1, 0.5, hx, y + pole - 0.14, hz), color);
  ctx.halos.add(hx, y + pole - 0.3, hz, color, 3);
  if (spot) lightSpot(ctx, hx, y + pole - 0.5, hz, color, 24, 16);
  ctx.reflect.push({ x: hx, y: y + 0.16, z: hz, h: pole, color, w: 0.45, len: 8, k: 0.34 });
  ctx.buckets.add('pool', new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2).translate(hx, y + 0.04, hz), pool);
}

// The park's ornamental lamp: a fluted iron post with two glass globes on a crossbar (research
// 1.10: double-globe lamps on bridges, boulevards and parks). `spot` puts a light-pool spot here.
export function globeLamp(ctx, x, y, z, { spot = true, color = PALETTE.window, alongX = true } = {}) {
  solid(ctx, 'painted', cylinder(0.11, 0.16, 4.2, x, y + 2.1, z, 8), { color: IRON, tag: 'prop' });
  ctx.buckets.add('painted', cylinder(0.26, 0.3, 0.5, x, y + 0.25, z, 8), IRON);
  ctx.buckets.add('painted', box(alongX ? 1.5 : 0.08, 0.08, alongX ? 0.08 : 1.5, x, y + 4.15, z), IRON);
  for (const s of [-0.7, 0.7]) {
    const gx = x + (alongX ? s : 0), gz = z + (alongX ? 0 : s);
    glow(ctx, new THREE.IcosahedronGeometry(0.26, 1).translate(gx, y + 4.5, gz), color);
    ctx.buckets.add('painted', cylinder(0.08, 0.14, 0.12, gx, y + 4.78, gz, 6), IRON);
    ctx.halos.add(gx, y + 4.5, gz, color, 2.4);
  }
  if (spot) lightSpot(ctx, x, y + 4.2, z, color, 18, 14);
  ctx.reflect.push({ x, y: y + 0.1, z, h: 4.5, color, w: 0.5, len: 6, k: 0.3 });
  ctx.buckets.add('pool', new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2).translate(x, y + 0.05, z), 0x5c4020);
}

// ---- park furniture ----

const LEAVES = [0x1d3a24, 0x23452a, 0x2a4f30, 0x193320, 0x2f5434];
const AUTUMN = [0x6b4a22, 0x7a3a1e, 0x5c5a24];

// A stylised tree: a lumpy round crown, a conifer, or a column (poplar). ~40 triangles. The trunk
// collides; the crown is perchable from a grapple only where `perch` is set (big park trees).
export function tree(ctx, x, z, { y = 0, kind = 'round', s = 1, autumn = 0.12, perch = false } = {}) {
  const r = ctx.rng;
  const col = r.chance(autumn) ? r.pick(AUTUMN) : r.pick(LEAVES);
  const th = (kind === 'cone' ? 1.6 : 2.8) * s;
  solid(ctx, 'painted', cylinder(0.16 * s, 0.26 * s, th, x, y + th / 2, z, 5), { color: 0x2a2018, tag: 'tree' });
  if (kind === 'cone') {
    for (let k = 0; k < 3; k++) ctx.buckets.add('painted', new THREE.ConeGeometry((2.4 - k * 0.6) * s, 3.2 * s, 6).translate(x, y + th + (1.2 + k * 1.7) * s, z), col);
  } else if (kind === 'column') {
    ctx.buckets.add('painted', new THREE.IcosahedronGeometry(1.5 * s, 0).scale(1, 2.6, 1).translate(x, y + th + 3.4 * s, z), col);
  } else {
    const R = r.range(2.4, 3.2) * s;
    ctx.buckets.add('painted', new THREE.IcosahedronGeometry(R, 0).scale(1, 0.8, 1).rotateY(r.range(0, 3)).translate(x, y + th + R * 0.65, z), col);
    ctx.buckets.add('painted', new THREE.IcosahedronGeometry(R * 0.7, 0).rotateY(r.range(0, 3)).translate(x + r.range(-1, 1) * s, y + th + R * 1.25, z + r.range(-1, 1) * s), col);
    if (perch) {
      ctx.collision.addBox(x - 0.8, y + th + R * 0.65, z - 0.8, x + 0.8, y + th + R * 1.1, z + 0.8, 'treetop');
      ctx.grapple.push({ x, y: y + th + R * 1.1, z, nx: 0, nz: 1, perch: true });
    }
  }
}

// A clipped hedge between two points along one axis (collides as a low wall).
export function hedge(ctx, x0, z0, x1, z1, { h = 1.1, w = 1.0, y = 0 } = {}) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const minX = alongX ? Math.min(x0, x1) : x0 - w / 2, maxX = alongX ? Math.max(x0, x1) : x0 + w / 2;
  const minZ = alongX ? z0 - w / 2 : Math.min(z0, z1), maxZ = alongX ? z0 + w / 2 : Math.max(z0, z1);
  solid(ctx, 'painted', box(maxX - minX, h, maxZ - minZ, (minX + maxX) / 2, y + h / 2, (minZ + maxZ) / 2), { color: 0x1c3a22, tag: 'hedge' });
}

// A park bench at any height, facing (nx, nz).
export function parkBench(ctx, x, y, z, nx, nz) {
  const yaw = Math.atan2(nx, nz);
  ctx.buckets.add('wood', turned(1.8, 0.08, 0.5, x, y + 0.45, z, yaw));
  ctx.buckets.add('wood', turned(1.8, 0.4, 0.06, x - nx * 0.25, y + 0.75, z - nz * 0.25, yaw));
  for (const s of [-0.8, 0.8]) ctx.buckets.add('painted', turned(0.07, 0.45, 0.5, x + nz * s, y + 0.22, z - nx * s, yaw), IRON);
  ctx.collision.addBox(x - 0.9, y, z - 0.9, x + 0.9, y + 0.5, z + 0.9, 'prop');
}

// A bronze statue on a stone plinth. kind: 'rider' (horse and rider), 'figure' (a standing
// worthy with a raised arm), 'beast' (a crouching stone lion-bat, the park's gate guardians).
// The plinth top is a perch.
export function statue(ctx, x, z, yaw, { kind = 'figure', y = 0, bronze = 0x3f5a4c, scale = 1 } = {}) {
  const P = 2.2 * scale, ph = (kind === 'beast' ? 1.6 : 3.2) * scale;
  solid(ctx, 'painted', box(P, ph, kind === 'rider' ? P * 1.5 : P, x, y + ph / 2, z), { color: STONE, tag: 'plinth' });
  ctx.buckets.add('painted', box(P + 0.4, 0.3, (kind === 'rider' ? P * 1.5 : P) + 0.4, x, y + 0.15, z), DARK_STONE);
  ctx.buckets.add('painted', box(P + 0.25, 0.2, (kind === 'rider' ? P * 1.5 : P) + 0.25, x, y + ph - 0.1, z), DARK_STONE);
  const top = y + ph;
  const m = new THREE.Matrix4().makeRotationY(yaw);
  const put = (g, px, py, pz) => { g.applyMatrix4(new THREE.Matrix4().makeTranslation(px, py, pz)).applyMatrix4(m).translate(x, top, z); ctx.buckets.add('painted', g, bronze); };
  const s = scale;
  if (kind === 'rider') {
    put(new THREE.BoxGeometry(0.9 * s, 1.0 * s, 2.4 * s), 0, 1.6 * s, 0);                       // horse body
    put(new THREE.BoxGeometry(0.5 * s, 1.1 * s, 0.6 * s).rotateX(-0.5), 0, 2.3 * s, 1.3 * s);    // neck
    put(new THREE.BoxGeometry(0.4 * s, 0.4 * s, 0.9 * s), 0, 2.75 * s, 1.75 * s);                // head
    for (const [lx, lz, rx] of [[-0.3, 0.9, -0.6], [0.3, 0.9, 0.2], [-0.3, -0.9, 0], [0.3, -0.9, 0]]) put(new THREE.BoxGeometry(0.2 * s, 1.2 * s, 0.2 * s).rotateX(rx), lx * s, 0.6 * s, lz * s);
    put(new THREE.BoxGeometry(0.6 * s, 1.1 * s, 0.4 * s), 0, 2.6 * s, -0.1 * s);                 // rider
    put(new THREE.BoxGeometry(0.35 * s, 0.4 * s, 0.35 * s), 0, 3.35 * s, -0.1 * s);
    put(new THREE.BoxGeometry(0.12 * s, 0.9 * s, 0.12 * s).rotateX(-1.0), 0.4 * s, 3.1 * s, 0.4 * s); // sabre arm
  } else if (kind === 'beast') {
    put(new THREE.BoxGeometry(1.0 * s, 0.8 * s, 1.8 * s), 0, 0.4 * s, 0);
    put(new THREE.BoxGeometry(0.9 * s, 0.9 * s, 0.8 * s).rotateX(-0.3), 0, 1.0 * s, 0.6 * s);
    put(new THREE.BoxGeometry(0.6 * s, 0.6 * s, 0.7 * s), 0, 1.5 * s, 1.1 * s);
    for (const w of [-1, 1]) put(new THREE.BoxGeometry(0.06 * s, 1.0 * s, 0.9 * s).rotateZ(-w * 0.6).rotateX(0.3), w * 0.6 * s, 1.5 * s, -0.2 * s);
  } else {
    put(new THREE.BoxGeometry(0.7 * s, 1.0 * s, 0.45 * s), 0, 0.5 * s, 0);                       // coat
    put(new THREE.BoxGeometry(0.6 * s, 0.9 * s, 0.4 * s), 0, 1.4 * s, 0);
    put(new THREE.BoxGeometry(0.34 * s, 0.4 * s, 0.34 * s), 0, 2.05 * s, 0);
    put(new THREE.BoxGeometry(0.14 * s, 0.9 * s, 0.14 * s).rotateZ(-0.5), 0.45 * s, 2.0 * s, 0); // raised arm
  }
  ctx.grapple.push({ x, y: top, z, nx: Math.sin(yaw), nz: Math.cos(yaw), perch: true });
}

// ---- signs ----

function signPlane(ctx, mat, w, h, x, y, z, nx, nz) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x + nx * 0.06, y, z + nz * 0.06);
  m.rotation.y = Math.atan2(nx, nz);
  m.layers.set(LAYER_FX);
  ctx.scene.add(m);
  return m;
}

// A neon word facing (nx, nz) with a dark backing board, halos and a light spot. Returns the
// sign's material so a caller can make it flicker (ctx.flickers) or go dark.
export function neonWord(ctx, text, x, y, z, nx, nz, { h = 1.6, color = PALETTE.neonPink, back = true, twoSided = false, spot = true, halo = 4 } = {}) {
  const css = '#' + new THREE.Color(color).getHexString();
  const { texture, aspect } = neonTexture(text, css);
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const w = h * aspect;
  if (back) {
    const bw = Math.abs(nx) > 0.5 ? 0.2 : w + 0.5, bd = Math.abs(nx) > 0.5 ? w + 0.5 : 0.2;
    ctx.buckets.add('painted', box(bw, h + 0.4, bd, x - nx * 0.12, y, z - nz * 0.12), 0x15121a);
  }
  signPlane(ctx, mat, w, h, x, y, z, nx, nz);
  if (twoSided) signPlane(ctx, mat, w, h, x - nx * 0.36, y, z - nz * 0.36, -nx, -nz);
  const ax = -nz, az = nx;
  for (const t of [-0.3, 0.3]) ctx.halos.add(x + nx * 0.3 + ax * t * w, y, z + nz * 0.3 + az * t * w, color, halo);
  if (spot) lightSpot(ctx, x + nx * 3, y, z + nz * 3, color, 20, 14);
  ctx.reflect.push({ x: x + nx * 0.4, y: 0.16, z: z + nz * 0.4, h: y, color, w: 0.6, len: 9, k: 0.45 });
  return mat;
}

// A painted board (billboardTexture: a title and a smaller line) facing (nx, nz), lit from below.
export function board(ctx, text, sub, x, y, z, nx, nz, { w = 8, bg = PALETTE.containerRed, posts = true, base = 0 } = {}) {
  const h = w * 0.39;
  const mat = new THREE.MeshToonMaterial({ map: billboardTexture(text, sub, bg), emissive: 0xffffff, emissiveIntensity: 0.25 });
  mat.emissiveMap = mat.map;
  signPlane(ctx, mat, w, h, x, y, z, nx, nz);
  const bw = Math.abs(nx) > 0.5 ? 0.2 : w + 0.3, bd = Math.abs(nx) > 0.5 ? w + 0.3 : 0.2;
  solid(ctx, 'painted', box(bw, h + 0.3, bd, x - nx * 0.14, y, z - nz * 0.14), { color: 0x1a1c22, tag: 'sign' });
  if (posts) for (const s of [-0.35, 0.35]) solid(ctx, 'steel', box(0.2, y - h / 2 - base, 0.2, x - nx * 0.2 + -nz * s * w, base + (y - h / 2 - base) / 2, z - nz * 0.2 + nx * s * w), { tag: 'prop' });
  ctx.halos.add(x + nx * 1.2, y - h / 2 - 0.2, z + nz * 1.2, PALETTE.windowCool, 2);
}

// ---- strings of bulbs ----

// Bulbs on a sagging wire between a and b ({x, y, z}): halos plus one ink line (folded into the
// chunk's line batch). Returns the halo indices (for chasing or dead bulbs).
export function stringLights(ctx, a, b, { n = 10, sag = 0.8, colors = [PALETTE.window, PALETTE.crimson, PALETTE.signal, PALETTE.neonCyan], size = 1.1, dead = 0 } = {}) {
  const ids = [], pts = [];
  let prev = null;
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    const p = [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t];
    if (prev) pts.push(...prev, ...p);
    prev = p;
  }
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (dead && ctx.rng.chance(dead)) continue;
    ids.push(ctx.halos.add(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t) - 0.12, a.z + (b.z - a.z) * t, colors[k % colors.length], size));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: PALETTE.ink }));
  line.layers.set(LAYER_FX);
  ctx.scene.add(line);
  return ids;
}

// ---- moving collision ----

// A collision box that moves every frame without re-registering: it is added once with the whole
// extent it will ever sweep (the grid's broad phase keeps that extent), then its own min/max are
// set to where it is now. Collision tests read the box's own fields (collision.js
// resolveCylinder / groundBelow / raycast), so it collides exactly where it is. setMovingBox
// writes the fields in place: nothing is allocated per frame.
export function movingBox(collision, sweep, tag = 'mover') {
  const b = collision.addBox(sweep.minX, sweep.minY, sweep.minZ, sweep.maxX, sweep.maxY, sweep.maxZ, tag);
  return b;
}
export function setMovingBox(b, minX, minY, minZ, maxX, maxY, maxZ) {
  b.minX = minX; b.minY = minY; b.minZ = minZ; b.maxX = maxX; b.maxY = maxY; b.maxZ = maxZ;
}

// Carries a body standing on a moving platform (ctx.world.platforms: { box, vx, vy, vz }, the
// Ferris wheel's gondola roofs) along with it for dt seconds. Pure; allocation-free. Returns the
// platform carried on, or null. The hero's integration is workstream B's (game.js / hero.js):
// calling this once per frame before collision, with the hero's feet position, is all it needs.
export function carryOnPlatforms(platforms, pos, dt, { tol = 0.2 } = {}) {
  if (!platforms) return null;
  for (let i = 0; i < platforms.length; i++) {
    const pl = platforms[i], b = pl.box;
    if (pos.x < b.minX || pos.x > b.maxX || pos.z < b.minZ || pos.z > b.maxZ) continue;
    if (Math.abs(pos.y - b.maxY) > tol) continue;
    pos.x += pl.vx * dt; pos.y += pl.vy * dt; pos.z += pl.vz * dt;
    return pl;
  }
  return null;
}
