// Small builders shared by the Loop, the El and Gotham Mile (workstream H). Same patterns as the
// proof region's riverfront.js (slab, railing, lamp at any height, lane paint), plus sign planes,
// stairs and a few civic pieces (columns, domes, statues) built from the city's shared materials.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { LAYER_FX } from '../../render/layers.js';
import { box, tiledBox, cylinder } from '../buckets.js';
import { solid, glow, lightSpot } from '../cityBuilder.js';
import { neonTexture } from '../textures.js';
import { SCALE } from './data.js';

export const STONE = 0x8c877d;
export const BRONZE = 0x6b5a3a;
export const EL_STEEL = 0x1f2a26;

// An axis-aligned slab from bounds, tiled in metres, optionally solid.
export function slab(ctx, key, minX, minY, minZ, maxX, maxY, maxZ, { collide = true, tag = '', uv = [4, 4], faces = 'all', color = null } = {}) {
  const g = tiledBox(maxX - minX, maxY - minY, maxZ - minZ, (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, { uvScale: uv, faces });
  if (collide) ctx.collision.addBox(minX, minY, minZ, maxX, maxY, maxZ, tag);
  ctx.buckets.add(key, g, color);
}

// A 1.1 m railing along x (alongX) or z from a to b at the other coordinate `at`, base y.
export function railing(ctx, alongX, a, b, at, y, { color = PALETTE.steel, post = 2.4, collide = true } = {}) {
  if (b - a < 0.2) return;
  const len = b - a, mid = (a + b) / 2, h = SCALE.railing;
  const bx = (l, hh, w, c, yy) => (alongX ? box(l, hh, w, c, yy, at) : box(w, hh, l, at, yy, c));
  ctx.buckets.add('painted', bx(len, 0.08, 0.1, mid, y + h), color);
  ctx.buckets.add('painted', bx(len, 0.05, 0.06, mid, y + h * 0.55), color);
  for (let t = a; t <= b + 1e-6; t += post) ctx.buckets.add('painted', bx(0.07, h, 0.07, t, y + h / 2), color);
  if (!collide) return;
  if (alongX) ctx.collision.addBox(a, y, at - 0.15, b, y + h, at + 0.15, 'railing');
  else ctx.collision.addBox(at - 0.15, y, a, at + 0.15, y + h, b, 'railing');
}

// A lamp post at height y, its head reaching (nx, nz). `globes` makes the Mile's double-globe lamp.
export function lampAt(ctx, x, y, z, nx, nz, { color = PALETTE.sodium, pole = 5.2, globes = false, pool = 0x6b4520, halo = true } = {}) {
  solid(ctx, 'steel', cylinder(0.09, 0.14, pole, x, y + pole / 2, z, 8), { tag: 'prop' });
  if (globes) {
    for (const s of [-1, 1]) {
      const gx = x + (nz ? s * 0.55 : 0), gz = z + (nx ? s * 0.55 : 0);
      ctx.buckets.add('steel', box(nz ? 1.1 : 0.08, 0.08, nx ? 1.1 : 0.08, x, y + pole - 0.2, z));
      glow(ctx, new THREE.SphereGeometry(0.28, 10, 8).translate(gx, y + pole + 0.05, gz), PALETTE.window);
    }
    if (halo) ctx.halos.add(x, y + pole + 0.1, z, PALETTE.window, 3.4);
    lightSpot(ctx, x, y + pole - 0.4, z, PALETTE.window, 22, 15);
    ctx.reflect.push({ x, y: 0.16, z, h: pole, color: PALETTE.window, w: 0.5, len: 8, k: 0.32 });
    ctx.buckets.add('pool', new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2).translate(x, y + 0.03, z), pool);
    return;
  }
  const hx = x + nx * 1.2, hz = z + nz * 1.2;
  ctx.buckets.add('steel', box(Math.abs(nx) ? 1.3 : 0.08, 0.08, Math.abs(nz) ? 1.3 : 0.08, x + nx * 0.6, y + pole - 0.05, z + nz * 0.6));
  ctx.buckets.add('steel', box(0.65, 0.2, 0.65, hx, y + pole, hz));
  glow(ctx, box(0.5, 0.1, 0.5, hx, y + pole - 0.14, hz), color);
  if (halo) ctx.halos.add(hx, y + pole - 0.3, hz, color, 3);
  lightSpot(ctx, hx, y + pole - 0.5, hz, color, 24, 16);
  ctx.reflect.push({ x: hx, y: y + 0.16, z: hz, h: pole, color, w: 0.45, len: 8, k: 0.34 });
  ctx.buckets.add('pool', new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2).translate(hx, y + 0.03, hz), pool);
}

// Lane dashes along x (alongX) between a and b at `at`.
export function dashes(ctx, alongX, a, b, at, { y = 0.02, gap = 8, len = 3.5, skip = [] } = {}) {
  for (let t = a + gap / 2; t < b; t += gap) {
    if (skip.some((q) => Math.abs(t - q) < 9)) continue;
    const g = alongX ? new THREE.PlaneGeometry(len, 0.25) : new THREE.PlaneGeometry(0.25, len);
    ctx.buckets.add('lane', g.rotateX(-Math.PI / 2).translate(alongX ? t : at, y, alongX ? at : t));
  }
}

// Zebra crossing centred at (x, z); stripes run across a street that runs along x (alongX).
export function crosswalk(ctx, x, z, alongX, width = 10, y = 0.02) {
  for (let s = -width / 2; s <= width / 2; s += 1.4) {
    const g = alongX ? new THREE.PlaneGeometry(3, 0.7) : new THREE.PlaneGeometry(0.7, 3);
    ctx.buckets.add('lane', g.rotateX(-Math.PI / 2).translate(alongX ? x : x + s, y, alongX ? z + s : z));
  }
}

// A flat lettered sign: a dark backing panel and a glowing text plane facing (nx, nz). Static
// planes are packed into the chunk's sign atlas by staticBatches. Returns the text's width.
export function signPlane(ctx, text, x, y, z, nx, nz, { height = 1.2, color = '#e8ecef', panel = 0x1a2233, halo = 0, haloColor = null } = {}) {
  const { texture, aspect } = neonTexture(text, color);
  const width = height * aspect;
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  m.position.set(x + nx * 0.08, y, z + nz * 0.08);
  m.rotation.y = Math.atan2(nx, nz);
  m.layers.set(LAYER_FX);
  ctx.scene.add(m);
  if (panel !== null) {
    const pw = width * 0.86 + 0.4;
    ctx.buckets.add('painted', box(Math.abs(nz) ? pw : 0.12, height + 0.25, Math.abs(nx) ? pw : 0.12, x - nx * 0.02, y, z - nz * 0.02), panel);
  }
  if (halo) {
    const c = haloColor ?? new THREE.Color(color).getHex();
    for (const t of [-0.3, 0.3]) ctx.halos.add(x + nx * 0.4 + nz * t * width, y, z + nz * 0.4 - nx * t * width, c, halo);
  }
  return width;
}

// A straight stair from (x0, top y) descending `dir` (+1/-1) along x (alongX) or z, at the other
// coordinate centred on `at`, `w` wide. Steps of ~0.3 m rise collide as solid boxes from the
// ground (so nothing slips under), drawn as treads with two stringers. Returns the foot position.
export function stair(ctx, alongX, s0, dir, at, top, { w = 1.8, base = 0.15, run = 0.4, color = EL_STEEL, rail = 1 } = {}) {
  const rise = top - base;
  const n = Math.max(1, Math.ceil(rise / 0.3));
  const h = rise / n;
  for (let k = 0; k < n; k++) {
    const a = s0 + dir * k * run, b = a + dir * run;
    const y = top - k * h;            // tread top of step k (k = 0 is level with the top)
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (alongX) ctx.collision.addBox(lo, 0, at - w / 2, hi, y - h, at + w / 2, 'stair');
    else ctx.collision.addBox(at - w / 2, 0, lo, at + w / 2, y - h, hi, 'stair');
    const g = alongX ? box(run, 0.08, w, (a + b) / 2, y - h - 0.04, at) : box(w, 0.08, run, at, y - h - 0.04, (a + b) / 2);
    ctx.buckets.add('painted', g, 0x3a3c40);
  }
  // Stringers: sloped plates along both sides.
  const len = n * run, ang = Math.atan2(rise, len);
  // A sloped plate of length `l`, its high end at s0: about z when running along x (rotateZ(-a)
  // lowers the +x end), about x when running along z (rotateX(+a) lowers the +z end).
  const sloped = (l, th, wd, mx, my, mz) => (alongX
    ? new THREE.BoxGeometry(l, th, wd).rotateZ(dir > 0 ? -ang : ang)
    : new THREE.BoxGeometry(wd, th, l).rotateX(dir > 0 ? ang : -ang)).translate(mx, my, mz);
  for (const s of [-1, 1]) {
    const mx = alongX ? s0 + dir * len / 2 : at + s * (w / 2 + 0.06);
    const mz = alongX ? at + s * (w / 2 + 0.06) : s0 + dir * len / 2;
    ctx.buckets.add('painted', sloped(Math.hypot(len, rise), 0.45, 0.12, mx, base + rise / 2, mz), color);
    // Handrail on the outer side(s), 1 m above the nosings, with a few posts.
    if (rail === 2 || s === rail) {
      ctx.buckets.add('painted', sloped(Math.hypot(len, rise), 0.06, 0.06, mx, base + rise / 2 + 1.0, mz), color);
      for (let k = 0; k <= n; k += 6) {
        const t = s0 + dir * k * run, y = top - k * h;
        ctx.buckets.add('painted', alongX ? box(0.06, 1.0, 0.06, t, y + 0.5, mz) : box(0.06, 1.0, 0.06, mx, y + 0.5, t), color);
      }
    }
  }
  return s0 + dir * len;
}

// A row of classical columns with base and capital, standing on y0.
export function colonnade(ctx, pts, y0, h, { r = 0.55, color = 0xcfc8b8 } = {}) {
  for (const [x, z] of pts) {
    solid(ctx, 'painted', cylinder(r, r * 1.08, h, x, y0 + h / 2, z, 12), { color, tag: 'column' });
    ctx.buckets.add('painted', box(r * 2.6, 0.35, r * 2.6, x, y0 + 0.17, z), color);
    ctx.buckets.add('painted', box(r * 2.5, 0.4, r * 2.5, x, y0 + h - 0.2, z), color);
  }
}

// A dome on a drum: drum radius r, drum height dh, standing at y; a lantern on top. Collides as a
// stack of square boxes inside the curve (you can stand on the drum's lip and climb the lantern).
export function dome(ctx, x, y, z, r, dh, { color = 0x6f8f86, drum = 0xcfc8b8 } = {}) {
  solid(ctx, 'painted', cylinder(r, r, dh, x, y + dh / 2, z, 24), { color: drum, collide: false });
  ctx.collision.addBox(x - r * 0.72, y, z - r * 0.72, x + r * 0.72, y + dh, z + r * 0.72, 'building');
  ctx.buckets.add('painted', cylinder(r + 0.3, r + 0.3, 0.5, x, y + dh, z, 24), drum);
  ctx.buckets.add('painted', new THREE.SphereGeometry(r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y + dh, z), color);
  for (const k of [0.45, 0.75]) {
    const hr = r * Math.sqrt(1 - k * k) * 0.7;
    ctx.collision.addBox(x - hr, y + dh, z - hr, x + hr, y + dh + r * k, z + hr, 'roof');
  }
  const ly = y + dh + r;
  solid(ctx, 'painted', cylinder(r * 0.16, r * 0.18, r * 0.35, x, ly + r * 0.17, z, 10), { color: drum, tag: 'roof' });
  glow(ctx, cylinder(r * 0.12, r * 0.12, r * 0.22, x, ly + r * 0.18, z, 10), PALETTE.window);
  ctx.buckets.add('painted', new THREE.ConeGeometry(r * 0.2, r * 0.3, 10).translate(x, ly + r * 0.5, z), color);
  ctx.grapple.push({ x, y: ly + r * 0.35, z, nx: 0, nz: 1, perch: true });
  return ly + r * 0.65;
}

// A standing figure in robes (original statue design): `scale` 1 is 2 m tall. Holds scales when
// `scales`, a torch otherwise. Painted bronze.
export function statue(ctx, x, y, z, scale, yaw = 0, { color = 0x5f7a5a, scales = true } = {}) {
  const s = scale, rot = new THREE.Matrix4().makeRotationY(yaw);
  const put = (g) => ctx.buckets.add('painted', g.applyMatrix4(rot).translate(x, y, z), color);
  put(new THREE.CylinderGeometry(0.22 * s, 0.42 * s, 1.3 * s, 8).translate(0, 0.65 * s, 0)); // robe
  put(new THREE.CylinderGeometry(0.2 * s, 0.22 * s, 0.45 * s, 8).translate(0, 1.5 * s, 0)); // chest
  put(new THREE.SphereGeometry(0.13 * s, 8, 6).translate(0, 1.85 * s, 0)); // head
  put(new THREE.ConeGeometry(0.16 * s, 0.2 * s, 8).translate(0, 2.0 * s, 0)); // hood
  put(new THREE.BoxGeometry(0.1 * s, 0.6 * s, 0.1 * s).rotateZ(-2.6).translate(0.36 * s, 1.75 * s, 0)); // raised arm
  put(new THREE.BoxGeometry(0.1 * s, 0.55 * s, 0.1 * s).rotateZ(0.4).translate(-0.3 * s, 1.35 * s, 0.05 * s)); // lowered arm
  if (scales) {
    put(new THREE.BoxGeometry(0.7 * s, 0.03 * s, 0.03 * s).translate(0.55 * s, 2.15 * s, 0));
    for (const d of [-0.32, 0.32]) put(new THREE.CylinderGeometry(0.12 * s, 0.05 * s, 0.05 * s, 8).translate(0.55 * s + d * s, 1.98 * s, 0));
    put(new THREE.BoxGeometry(0.05 * s, 1.4 * s, 0.05 * s).translate(-0.42 * s, 0.9 * s, 0.12 * s)); // sword, point down
  } else {
    put(new THREE.CylinderGeometry(0.04 * s, 0.03 * s, 0.5 * s, 6).translate(0.55 * s, 2.25 * s, 0));
    glow(ctx, new THREE.ConeGeometry(0.1 * s, 0.25 * s, 6).applyMatrix4(rot).translate(x + 0.55 * s * Math.cos(yaw), y + 2.6 * s, z - 0.55 * s * Math.sin(yaw)), PALETTE.sodium);
  }
  ctx.collision.addBox(x - 0.4 * s, y, z - 0.4 * s, x + 0.4 * s, y + 1.9 * s, z + 0.4 * s, 'statue');
  ctx.grapple.push({ x, y: y + 1.9 * s, z, nx: Math.sin(yaw), nz: Math.cos(yaw), perch: true });
}

// A flagpole leaning out from a facade at height y (a perch at its tip), with a flag.
export function flagpole(ctx, x, y, z, nx, nz, color = 0x7a2430) {
  const L = 4.5, ang = 0.5;
  const g = new THREE.CylinderGeometry(0.06, 0.07, L, 6).rotateX(Math.PI / 2 - ang);
  g.rotateY(Math.atan2(nx, nz)).translate(x + nx * L * 0.45, y + Math.sin(ang) * L * 0.5, z + nz * L * 0.45);
  ctx.buckets.add('steel', g);
  const tx = x + nx * L * 0.88, tz = z + nz * L * 0.88, ty = y + Math.sin(ang) * L;
  ctx.buckets.add('painted', box(Math.abs(nz) ? 1.6 : 0.04, 1.0, Math.abs(nx) ? 1.6 : 0.04, tx - nx * 0.3 + nz * 0.8, ty - 0.7, tz - nz * 0.3 + nx * 0.8), color);
  ctx.grapple.push({ x: tx, y: ty, z: tz, nx, nz, perch: true });
}

// A bus shelter (glass, lit roof, a poster panel) facing (nx, nz).
export function busShelter(ctx, x, z, nx, nz) {
  const alongX = Math.abs(nz) > 0;
  const w = 4, d = 1.6;
  const sx = alongX ? w : d, sz = alongX ? d : w;
  ctx.buckets.add('painted', box(sx + 0.2, 0.12, sz + 0.2, x, 2.6, z), 0x2a2f38);
  glow(ctx, box(sx - 0.3, 0.04, sz - 0.3, x, 2.53, z), PALETTE.windowCool);
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.buckets.add('steel', box(0.08, 2.45, 0.08, x + px * (sx / 2 - 0.1), 1.37, z + pz * (sz / 2 - 0.1)));
  // Back glass (away from the kerb) and a lit poster at one end.
  const bx = x - nx * (d / 2 - 0.05), bz = z - nz * (d / 2 - 0.05);
  ctx.buckets.add('glass', box(alongX ? w - 0.2 : 0.04, 1.8, alongX ? 0.04 : w - 0.2, bx, 1.3, bz));
  glow(ctx, box(alongX ? 0.04 : 1.2, 1.7, alongX ? 1.2 : 0.04, x + (alongX ? w / 2 - 0.1 : 0), 1.3, z + (alongX ? 0 : w / 2 - 0.1)), 0x8a6a5a);
  ctx.collision.addBox(bx - (alongX ? w / 2 : 0.1), 0.15, bz - (alongX ? 0.1 : w / 2), bx + (alongX ? w / 2 : 0.1), 2.5, bz + (alongX ? 0.1 : w / 2), 'prop');
  ctx.collision.addBox(x - sx / 2, 2.5, z - sz / 2, x + sx / 2, 2.7, z + sz / 2, 'roof');
}

// A newsstand kiosk: a green hut with a lit hatch and racks.
export function newsstand(ctx, x, z, nx, nz) {
  solid(ctx, 'painted', box(2.2, 2.3, 1.6, x, 1.3, z), { color: 0x2f4a3a, tag: 'prop' });
  ctx.buckets.add('painted', box(2.6, 0.15, 2.0, x, 2.52, z), 0x1e2b24);
  glow(ctx, box(Math.abs(nz) ? 1.6 : 0.04, 0.9, Math.abs(nx) ? 1.6 : 0.04, x + nx * 0.81, 1.5, z + nz * 0.81), 0xc89a52);
  ctx.buckets.add('painted', box(Math.abs(nz) ? 2.0 : 0.3, 1.0, Math.abs(nx) ? 2.0 : 0.3, x + nx * 1.0, 0.65, z + nz * 1.0), 0x8a3a2e);
}

// A street tree in a pit with a low iron fence (taller and fuller than the core's bare trees).
export function avenueTree(ctx, x, z, { lights = false } = {}) {
  ctx.buckets.add('painted', box(1.6, 0.08, 1.6, x, 0.17, z), 0x1b1a18);
  ctx.buckets.add('wood', cylinder(0.14, 0.2, 3.2, x, 1.75, z, 6));
  const rng = ctx.rng;
  for (let k = 0; k < 3; k++) {
    const r = rng.range(1.2, 1.7);
    ctx.buckets.add('painted', new THREE.IcosahedronGeometry(r, 0).translate(x + rng.range(-0.6, 0.6), 3.8 + k * 0.9, z + rng.range(-0.6, 0.6)), k % 2 ? 0x24352a : 0x2c3f30);
  }
  ctx.collision.addBox(x - 0.25, 0.15, z - 0.25, x + 0.25, 3.2, z + 0.25, 'tree');
  if (lights) for (let k = 0; k < 2; k++) ctx.halos.add(x + rng.range(-1, 1), 3.6 + k * 1.3, z + rng.range(-1, 1), 0xffe2a0, 2.2);
}
