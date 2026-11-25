// Builder helpers shared by the west side's regions (workstream H3): ground and street paint
// from the layout, block slabs split by 5 m alleys, kerb and alley dressing, cheap roof props
// (water tanks, pigeon coops), washing lines, roof planks, zip lines, roll-down grilles, sign
// planes and the canal walls. All world-space, all through the shared buckets (no new
// materials: colours ride in 'painted' / 'glow'), all random draws from the region's own rng.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { LAYER_FX } from '../../render/layers.js';
import { box, tiledBox, cylinder } from '../buckets.js';
import { solid, glow, lightSpot, streetLamp, parkedCar, graffiti } from '../cityBuilder.js';
import { hydrant, newsBoxes, trashCan, mailbox, bench, phoneBooth, manhole, puddle, trashBags, streetTree } from '../streetDressing.js';
import { addLadder, addZipline, zipSag } from '../climbables.js';
import { neonTexture } from '../textures.js';
import { WEST, X_STREETS, Z_STREETS, WEST_BRIDGES } from './westLayout.js';

export const RAIL = 1.1;

// An axis-aligned slab from bounds, tiled in metres, optionally solid.
export function slab(ctx, key, minX, minY, minZ, maxX, maxY, maxZ, { collide = true, tag = '', uv = [4, 4], faces = 'all', color = null } = {}) {
  const g = tiledBox(maxX - minX, maxY - minY, maxZ - minZ, (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, { uvScale: uv, faces });
  if (collide) ctx.collision.addBox(minX, minY, minZ, maxX, maxY, maxZ, tag);
  ctx.buckets.add(key, g, color);
}

// A 1.1 m railing along x (alongX) or z from a to b at the other coordinate `at`, base y.
export function railing(ctx, alongX, a, b, at, y, { color = PALETTE.steel, post = 2.4 } = {}) {
  if (b - a < 0.5) return;
  const len = b - a, mid = (a + b) / 2, h = RAIL;
  const bx = (l, hh, w, c, yy) => (alongX ? box(l, hh, w, c, yy, at) : box(w, hh, l, at, yy, c));
  ctx.buckets.add('painted', bx(len, 0.08, 0.1, mid, y + h), color);
  ctx.buckets.add('painted', bx(len, 0.05, 0.06, mid, y + h * 0.55), color);
  for (let t = a; t <= b + 1e-6; t += post) ctx.buckets.add('painted', bx(0.07, h, 0.07, t, y + h / 2), color);
  if (alongX) ctx.collision.addBox(a, y, at - 0.15, b, y + h, at + 0.15, 'railing');
  else ctx.collision.addBox(at - 0.15, y, a, at + 0.15, y + h, b, 'railing');
}

// A lamp post standing at height y (streetLamp() always stands at street level).
export function lampAt(ctx, x, y, z, nx, nz, color = PALETTE.sodium, { pole = 4.2, halo = 2.8 } = {}) {
  solid(ctx, 'steel', cylinder(0.08, 0.12, pole, x, y + pole / 2, z, 6));
  const hx = x + nx * 0.9, hz = z + nz * 0.9;
  ctx.buckets.add('steel', box(Math.abs(nx) ? 1 : 0.08, 0.08, Math.abs(nz) ? 1 : 0.08, x + nx * 0.45, y + pole - 0.05, z + nz * 0.45));
  ctx.buckets.add('steel', box(0.6, 0.2, 0.6, hx, y + pole, hz));
  glow(ctx, box(0.45, 0.1, 0.45, hx, y + pole - 0.14, hz), color);
  ctx.halos.add(hx, y + pole - 0.3, hz, color, halo);
  lightSpot(ctx, hx, y + pole - 0.5, hz, color, 20, 14);
  ctx.reflect.push({ x: hx, y: y + 0.16, z: hz, h: pole, color, w: 0.45, len: 7, k: 0.34 });
  ctx.buckets.add('pool', new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2).translate(hx, y + 0.03, hz), 0x6b4520);
}

// A dim bulb over a back door (alley light): a glow box, a small halo every other one.
export function alleyBulb(ctx, x, y, z, nx, nz, color = 0xd9a24a, halo = true) {
  ctx.buckets.add('steel', box(Math.abs(nx) ? 0.5 : 0.06, 0.06, Math.abs(nz) ? 0.5 : 0.06, x + nx * 0.25, y + 0.25, z + nz * 0.25));
  glow(ctx, box(0.22, 0.18, 0.22, x + nx * 0.5, y, z + nz * 0.5), color);
  if (halo) ctx.halos.add(x + nx * 0.5, y - 0.1, z + nz * 0.5, color, 1.4);
  lightSpot(ctx, x + nx * 0.8, y - 0.3, z + nz * 0.8, color, 10, 9);
}

export function dashes(ctx, alongX, a, b, at, y = 0.02, { gap = 8, len = 3.5 } = {}) {
  for (let t = a + gap / 2; t < b; t += gap) {
    const g = alongX ? new THREE.PlaneGeometry(len, 0.25) : new THREE.PlaneGeometry(0.25, len);
    ctx.buckets.add('lane', g.rotateX(-Math.PI / 2).translate(alongX ? t : at, y, alongX ? at : t));
  }
}

export function crosswalk(ctx, x, z, alongX, width = 10, y = 0.02) {
  for (let s = -width / 2; s <= width / 2; s += 1.4) {
    const g = alongX ? new THREE.PlaneGeometry(3, 0.7) : new THREE.PlaneGeometry(0.7, 3);
    ctx.buckets.add('lane', g.rotateX(-Math.PI / 2).translate(alongX ? x : x + s, y, alongX ? z + s : z));
  }
}

const inR = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

// Asphalt over a rectangle (its top face only: the region floor is y 0 under it).
export function ground(ctx, r) {
  ctx.buckets.add('asphalt', tiledBox(r.maxX - r.minX, 0.2, r.maxZ - r.minZ, (r.minX + r.maxX) / 2, -0.1, (r.minZ + r.maxZ) / 2, { uvScale: [17, 17], faces: [2] }));
}

// Street paint inside a rect: lane dashes on every street segment (not on bridges or in the
// water), crosswalks and a manhole at each crossing, puddles.
export function paveStreets(ctx, rect) {
  const { rng } = ctx;
  const bridgeSpan = (alongX, at, t) => [...WEST_BRIDGES.bascules, ...WEST_BRIDGES.fixed].some((b) => {
    if ((b.axis === 'x') !== alongX) return false;
    if (alongX) return Math.abs(b.z - at) < 1 && t > Math.min(b.x0, b.x1) - 2 && t < Math.max(b.x0, b.x1) + 2;
    return Math.abs(b.x - at) < 1 && t > Math.min(b.z0, b.z1) - 2 && t < Math.max(b.z0, b.z1) + 2;
  });
  const crossZ = (x) => Z_STREETS.filter((t) => t.segs.some(([a, b]) => x >= a - 0.1 && x <= b + 0.1)).map((t) => t.z);
  const crossX = (z) => X_STREETS.filter((s) => s.segs.some(([a, b]) => z >= a - 0.1 && z <= b + 0.1)).map((s) => s.x);
  for (const s of X_STREETS) {
    if (s.quay || s.x < rect.minX || s.x > rect.maxX) continue;
    const zs = crossZ(s.x);
    for (const [z0, z1] of s.segs) {
      for (let t = Math.max(z0, rect.minZ) + 4; t < Math.min(z1, rect.maxZ) - 2; t += 8) {
        if (zs.some((q) => Math.abs(t - q) < 11) || bridgeSpan(false, s.x, t)) continue;
        ctx.buckets.add('lane', new THREE.PlaneGeometry(0.25, 3.5).rotateX(-Math.PI / 2).translate(s.x, 0.02, t));
      }
    }
  }
  for (const t of Z_STREETS) {
    if (t.z < rect.minZ || t.z > rect.maxZ) continue;
    const xs = crossX(t.z);
    for (const [x0, x1] of t.segs) {
      for (let s = Math.max(x0, rect.minX) + 4; s < Math.min(x1, rect.maxX) - 2; s += 8) {
        if (xs.some((q) => Math.abs(s - q) < 11) || bridgeSpan(true, t.z, s)) continue;
        ctx.buckets.add('lane', new THREE.PlaneGeometry(3.5, 0.25).rotateX(-Math.PI / 2).translate(s, 0.02, t.z));
        if (t.el) for (const off of [-6.2, 6.2]) ctx.buckets.add('lane', new THREE.PlaneGeometry(3.5, 0.18).rotateX(-Math.PI / 2).translate(s, 0.02, t.z + off));
      }
    }
  }
  // Crossings.
  for (const s of X_STREETS) {
    if (s.quay) continue;
    for (const z of crossZ(s.x)) {
      if (!inR(rect, s.x, z) || !s.segs.some(([a, b]) => z >= a && z <= b)) continue;
      const hw = Z_STREETS.find((q) => q.z === z)?.el ? 10 : 7;
      crosswalk(ctx, s.x, z - hw - 1.6, false, 10);
      crosswalk(ctx, s.x, z + hw + 1.6, false, 10);
      crosswalk(ctx, s.x - 8.6, z, true, hw * 2 - 4);
      crosswalk(ctx, s.x + 8.6, z, true, hw * 2 - 4);
      if (rng.chance(0.7)) manhole(ctx, s.x + rng.range(-3, 3), z + rng.range(-3, 3));
    }
  }
  const area = (rect.maxX - rect.minX) * (rect.maxZ - rect.minZ);
  for (let k = 0; k < area / 1800; k++) {
    // Puddles on street lines only (a random street, a random point along it).
    const t = rng.pick(Z_STREETS), [a, b] = rng.pick(t.segs);
    const x = rng.range(a, b), z = t.z + rng.range(-5, 5);
    if (inR(rect, x, z)) puddle(ctx, x, 0.018, z, rng.range(1.4, 3.4));
  }
}

// A city block: the sidewalk slab (0.15 m kerb), cut by alleys (asphalt at y 0) running along x
// (`alleysZ`: their centre z) and along z (`alleysX`). Returns the sub-blocks between alleys and
// the alley rects. Lamps stand on the corners and mid-edges facing the streets.
export function block(ctx, b, { alleysX = [], alleysZ = [], lamps = true, lampEvery = 0 } = {}) {
  const A = WEST.alley / 2;
  const xs = [b.minX, ...alleysX.flatMap((x) => [x - A, x + A]), b.maxX];
  const zs = [b.minZ, ...alleysZ.flatMap((z) => [z - A, z + A]), b.maxZ];
  const subs = [];
  for (let i = 0; i < xs.length; i += 2) for (let j = 0; j < zs.length; j += 2) {
    const r = { minX: xs[i], maxX: xs[i + 1], minZ: zs[j], maxZ: zs[j + 1] };
    slab(ctx, 'sidewalk', r.minX, 0, r.minZ, r.maxX, 0.15, r.maxZ, { tag: 'sidewalk' });
    subs.push(r);
  }
  const alleys = [
    ...alleysX.map((x) => ({ minX: x - A, maxX: x + A, minZ: b.minZ, maxZ: b.maxZ, alongX: false })),
    ...alleysZ.map((z) => ({ minX: b.minX, maxX: b.maxX, minZ: z - A, maxZ: z + A, alongX: true })),
  ];
  if (lamps) {
    const e = 0.8;
    const pts = [
      [b.minX + e, b.minZ + e, 0, -1], [b.maxX - e, b.minZ + e, 1, 0], [b.maxX - e, b.maxZ - e, 0, 1], [b.minX + e, b.maxZ - e, -1, 0],
    ];
    const step = lampEvery || 34;
    for (let x = b.minX + step; x < b.maxX - step / 2; x += step) pts.push([x, b.minZ + e, 0, -1], [x, b.maxZ - e, 0, 1]);
    for (let z = b.minZ + step; z < b.maxZ - step / 2; z += step) pts.push([b.minX + e, z, -1, 0], [b.maxX - e, z, 1, 0]);
    for (const [x, z, nx, nz] of pts) {
      if (alleys.some((a) => x > a.minX - 1.5 && x < a.maxX + 1.5 && z > a.minZ - 1.5 && z < a.maxZ + 1.5)) continue;
      streetLamp(ctx, x, z, nx, nz);
    }
  }
  return { subs, alleys };
}

// Kerbside furniture along one edge of a block (outward normal nx, nz), `n` items.
export function kerb(ctx, b, nx, nz, n = 3, { trees = false } = {}) {
  const { rng } = ctx;
  for (let k = 0; k < n; k++) {
    let x, z;
    if (nz) { x = rng.range(b.minX + 3, b.maxX - 3); z = nz < 0 ? b.minZ + 0.7 : b.maxZ - 0.7; }
    else { z = rng.range(b.minZ + 3, b.maxZ - 3); x = nx < 0 ? b.minX + 0.7 : b.maxX - 0.7; }
    const r = rng.next();
    if (trees && r < 0.25) streetTree(ctx, x, z);
    else if (r < 0.4) hydrant(ctx, x, z);
    else if (r < 0.55) trashCan(ctx, x, z);
    else if (r < 0.68) newsBoxes(ctx, x - nx * 0.2, z - nz * 0.2, nx, nz);
    else if (r < 0.76) mailbox(ctx, x, z, nx, nz);
    else if (r < 0.84) bench(ctx, x - nx * 0.4, z - nz * 0.4, -nx, -nz);
    else if (r < 0.9) phoneBooth(ctx, x - nx * 0.5, z - nz * 0.5, nx, nz);
    else trashBags(ctx, x - nx * 1.6, z - nz * 1.6);
  }
}

// Parked cars along a block edge (in the street's parking lane).
export function parkCars(ctx, b, nx, nz, n) {
  const { rng } = ctx;
  for (let k = 0; k < n; k++) {
    if (nz) parkedCar(ctx, rng.range(b.minX + 4, b.maxX - 4), nz < 0 ? b.minZ - 2.2 : b.maxZ + 2.2, true);
    else parkedCar(ctx, nx < 0 ? b.minX - 2.2 : b.maxX + 2.2, rng.range(b.minZ + 4, b.maxZ - 4), false);
  }
}

// An alley: dumpsters, bags, a fence or two, steam, puddles, one dim bulb every ~20 m.
export function dressAlley(ctx, a, { bulbs = true, fence = null } = {}) {
  const { rng } = ctx;
  const len = a.alongX ? a.maxX - a.minX : a.maxZ - a.minZ;
  const at = (t, side) => (a.alongX ? [a.minX + t, side < 0 ? a.minZ + 0.6 : a.maxZ - 0.6] : [side < 0 ? a.minX + 0.6 : a.maxX - 0.6, a.minZ + t]);
  for (let t = 6; t < len - 6; t += rng.range(9, 16)) {
    const side = rng.chance(0.5) ? -1 : 1;
    const [x, z] = at(t, side);
    const r = rng.next();
    if (r < 0.35) dumpster(ctx, x, z, a.alongX);
    else if (r < 0.7) trashBags(ctx, x, z);
    else if (r < 0.8) solid(ctx, 'wood', box(1.1, 1.0, 1.1, x, 0.5, z), { tag: 'crate' });
    if (rng.chance(0.25)) puddle(ctx, a.alongX ? x : (a.minX + a.maxX) / 2, 0.018, a.alongX ? (a.minZ + a.maxZ) / 2 : z, rng.range(1, 2.2));
  }
  if (bulbs) {
    let k = 0;
    for (let t = 10; t < len - 4; t += 20, k++) {
      const side = k % 2 ? -1 : 1;
      const [x, z] = at(t, side);
      const nx = a.alongX ? 0 : -side, nz = a.alongX ? -side : 0;
      alleyBulb(ctx, x - nx * 0.6, 3.6, z - nz * 0.6, nx, nz, 0xd9a24a, k % 2 === 0);
    }
  }
  if (rng.chance(0.5)) ctx.steam.push({ x: (a.minX + a.maxX) / 2, y: 0.2, z: (a.minZ + a.maxZ) / 2, s: 0.9 });
  if (fence !== null) chainFence(ctx, a, fence);
}

export function dumpster(ctx, x, z, alongX) {
  const w = alongX ? 1.9 : 1.2, d = alongX ? 1.2 : 1.9;
  solid(ctx, 'painted', box(w, 1.3, d, x, 0.65, z), { color: rng3(ctx, [0x2f4a3a, 0x3a3f4a, 0x5a3a2a]), tag: 'prop' });
  ctx.buckets.add('painted', box(w + 0.1, 0.08, d + 0.1, x, 1.34, z), 0x1d2024);
}
const rng3 = (ctx, list) => ctx.rng.pick(list);

// A chain-link fence across an alley at `t` metres from its start (a dead end).
export function chainFence(ctx, a, t) {
  const h = 2.6;
  if (a.alongX) {
    const x = a.minX + t;
    ctx.buckets.add('painted', box(0.05, h, a.maxZ - a.minZ, x, h / 2, (a.minZ + a.maxZ) / 2), 0x5d636d);
    for (const z of [a.minZ, (a.minZ + a.maxZ) / 2, a.maxZ]) ctx.buckets.add('steel', cylinder(0.05, 0.05, h, x, h / 2, z, 5));
    ctx.collision.addBox(x - 0.1, 0, a.minZ, x + 0.1, h, a.maxZ, 'fence');
  } else {
    const z = a.minZ + t;
    ctx.buckets.add('painted', box(a.maxX - a.minX, h, 0.05, (a.minX + a.maxX) / 2, h / 2, z), 0x5d636d);
    for (const x of [a.minX, (a.minX + a.maxX) / 2, a.maxX]) ctx.buckets.add('steel', cylinder(0.05, 0.05, h, x, h / 2, z, 5));
    ctx.collision.addBox(a.minX, 0, z - 0.1, a.maxX, h, z + 0.1, 'fence');
  }
}

// A cheap rooftop water tank (the Narrows have one on every other roof): 4 legs, a 10-sided
// stave tank, a conical cap you can perch on, a ladder.
export function waterTank(ctx, x, y, z, s = 1) {
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.buckets.add('steel', box(0.18, 2.6 * s, 0.18, x + lx * 1.2 * s, y + 1.3 * s, z + lz * 1.2 * s));
  ctx.collision.addBox(x - 1.4 * s, y, z - 1.4 * s, x + 1.4 * s, y + 2.6 * s, z + 1.4 * s, 'prop');
  const tank = cylinder(1.8 * s, 1.8 * s, 3 * s, x, y + 4.1 * s, z, 10);
  const tuv = tank.attributes.uv;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getY(i) * 0.4, tuv.getX(i) * 4);
  solid(ctx, 'wood', tank, { tag: 'prop' });
  ctx.buckets.add('steel', cylinder(1.85 * s, 1.85 * s, 0.12, x, y + 3.2 * s, z, 10, true));
  ctx.buckets.add('steel', cylinder(1.85 * s, 1.85 * s, 0.12, x, y + 5 * s, z, 10, true));
  solid(ctx, 'roof', new THREE.ConeGeometry(2 * s, 0.9 * s, 10).translate(x, y + 6.05 * s, z), { tag: 'prop' });
  addLadder(ctx.climbables, { x, z: z + 1.9 * s, nx: 0, nz: 1, bottom: y, top: y + 5.6 * s });
  for (let k = 0.4; k < 5.4 * s; k += 0.45) ctx.buckets.add('steel', box(0.5, 0.04, 0.04, x, y + k, z + 1.9 * s));
  ctx.grapple.push({ x, y: y + 6.5 * s, z, nx: 0, nz: 1, perch: true });
}

// A pigeon coop: a slatted shed on legs with a flight cage and a couple of birds.
export function pigeonCoop(ctx, x, y, z, yaw = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const R = (g) => g.rotateY(yaw).translate(x, y, z);
  solid(ctx, 'wood', R(box(2.4, 1.4, 1.6, 0, 1.3, 0)), { tag: 'prop' });
  ctx.buckets.add('painted', R(new THREE.CylinderGeometry(0.01, 1.7, 0.6, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.75).translate(0, 2.3, 0)), 0x5a3a2a);
  for (const [lx, lz] of [[-1, -0.7], [1, -0.7], [-1, 0.7], [1, 0.7]]) ctx.buckets.add('wood', R(box(0.1, 0.6, 0.1, lx, 0.3, lz)));
  ctx.buckets.add('painted', R(box(1.6, 1.1, 1.2, 1.9, 0.95, 0)), 0x6a6e74); // wire cage (reads as grey mesh)
  for (let k = 0; k < 3; k++) ctx.buckets.add('painted', R(new THREE.SphereGeometry(0.12, 5, 4).scale(1, 0.8, 1.4).translate(-0.6 + k * 0.6, 2.05, 0.2)), 0x8a8e96);
  ctx.grapple.push({ x, y: y + 2, z, nx: s, nz: c, perch: true });
}

// A washing line between two points (ink cable) with clothes hung on it.
export function washingLine(ctx, a, b, { items = 6 } = {}) {
  const { rng } = ctx;
  const n = 10, pts = [];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const sag = 0.06 * len;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    pts.push(new THREE.Vector3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - sag * 4 * k * (1 - k), a.z + (b.z - a.z) * k));
  }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x0b0b12 }));
  line.layers.set(LAYER_FX);
  ctx.scene.add(line);
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  const cols = [0xd8d4c4, 0xb84a3a, 0x3a6a9a, 0xd9b43a, 0x7a9a5a, 0xc87aa0, 0xe8e2d4];
  for (let k = 0; k < items; k++) {
    const t = (k + 0.5 + rng.range(-0.25, 0.25)) / items;
    const y = a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t);
    const w = rng.range(0.4, 0.9), h = rng.range(0.45, 0.9);
    const g = new THREE.PlaneGeometry(w, h).rotateY(yaw + Math.PI / 2).translate(a.x + (b.x - a.x) * t, y - h / 2, a.z + (b.z - a.z) * t);
    ctx.buckets.add('painted', g, rng.pick(cols));
  }
}

// A walkable plank between two roof points (a and b at roof heights): drawn as boards, collides as
// steps of at most 0.3 m so the hero runs it whatever the height difference.
export function plank(ctx, a, b, width = 1.0) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz), pitch = Math.atan2(b.y - a.y, len);
  const g = box(width, 0.08, Math.hypot(len, b.y - a.y) + 0.6, 0, 0, 0).rotateX(-pitch).rotateY(yaw).translate((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.04, (a.z + b.z) / 2);
  ctx.buckets.add('wood', g);
  const n = Math.max(1, Math.ceil(Math.abs(b.y - a.y) / 0.3), Math.ceil(len / 2));
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const x0 = a.x + dx * t0, x1 = a.x + dx * t1, z0 = a.z + dz * t0, z1 = a.z + dz * t1;
    const y = a.y + (b.y - a.y) * (t0 + t1) / 2 + 0.08;
    const hw = width / 2;
    ctx.collision.addBox(Math.min(x0, x1) - hw, y - 0.3, Math.min(z0, z1) - hw, Math.max(x0, x1) + hw, y, Math.max(z0, z1) + hw, 'plank');
  }
}

// A zip line between two posts (a higher than b), the way ziplines.js builds them: the near post's
// collider stops short so its grapple point survives pruning; the cable sags (zipSag).
export function zip(ctx, a, b) {
  if (b.y > a.y) [a, b] = [b, a];
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len = Math.hypot(d.x, d.y, d.z);
  const hit = ctx.collision.raycast({ x: a.x, y: a.y - 0.3, z: a.z }, { x: d.x / len, y: d.y / len, z: d.z / len }, len - 1);
  if (hit) return null;
  const line = addZipline(ctx.climbables, a, b);
  ctx.buckets.add('steel', new THREE.CylinderGeometry(0.09, 0.12, 2.2, 6).translate(a.x, a.y - 1.1, a.z));
  ctx.collision.addBox(a.x - 0.12, a.y - 2.2, a.z - 0.12, a.x + 0.12, a.y - 0.8, a.z + 0.12, 'zipPost');
  solid(ctx, 'steel', new THREE.CylinderGeometry(0.09, 0.12, 2.2, 6).translate(b.x, b.y - 1.1, b.z));
  const n = 20, arr = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    arr.push(new THREE.Vector3(a.x + d.x * k, a.y + d.y * k - zipSag(line, k * len), a.z + d.z * k));
  }
  const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arr), new THREE.LineBasicMaterial({ color: 0x0b0b12 }));
  cable.layers.set(LAYER_FX);
  ctx.scene.add(cable);
  ctx.grapple.push({ x: a.x, y: a.y - 1.2, z: a.z, nx: 0, nz: 0, perch: true, zip: line });
  return line;
}

// A roll-down steel grille over a shopfront (on a wall facing nx, nz), corrugated, with a tag.
export function grille(ctx, x, z, nx, nz, width = 4, { tag = null } = {}) {
  const along = { x: -nz, z: nx };
  const px = x + nx * 0.08, pz = z + nz * 0.08;
  const sx = Math.abs(along.x) ? width : 0.06, sz = Math.abs(along.z) ? width : 0.06;
  ctx.buckets.add('painted', box(sx, 2.9, sz, px, 0.15 + 1.45, pz), 0x6a6e74);
  for (let y = 0.4; y < 3; y += 0.35) ctx.buckets.add('painted', box(sx + 0.02, 0.05, sz + 0.02, px + nx * 0.02, 0.15 + y, pz + nz * 0.02), 0x4a4e54);
  ctx.buckets.add('painted', box(Math.abs(along.x) ? width + 0.3 : 0.4, 0.4, Math.abs(along.z) ? width + 0.3 : 0.4, px + nx * 0.12, 3.25, pz + nz * 0.12), 0x3a3e44);
  if (tag) graffiti(ctx, px + nx * 0.06, 1.6, pz + nz * 0.06, nx, nz, Math.min(width, 3.6), tag);
}

// A free-standing emissive sign plane (original text), facing (nx, nz). Batched per chunk with
// the city's other sign planes (staticBatches.batchTexturedPlanes).
export function signPlane(ctx, text, color, x, y, z, nx, nz, h = 1.4, { vertical = false, back = true, twoSided = false } = {}) {
  const css = '#' + new THREE.Color(color).getHexString();
  const { texture, aspect } = neonTexture(text, css, { vertical });
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: twoSided ? THREE.DoubleSide : THREE.FrontSide });
  const w = h * aspect;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x + nx * 0.06, y, z + nz * 0.06);
  m.rotation.y = Math.atan2(nx, nz);
  m.layers.set(LAYER_FX);
  ctx.scene.add(m);
  if (back) {
    const along = { x: -nz, z: nx };
    ctx.buckets.add('steel', box(Math.abs(along.x) ? w + 0.4 : 0.12, h + 0.3, Math.abs(along.z) ? w + 0.4 : 0.12, x - nx * 0.02, y, z - nz * 0.02));
  }
  ctx.halos.add(x + nx * 0.5, y, z + nz * 0.5, color, Math.max(3, w * 0.9));
  ctx.reflect.push({ x: x + nx * 0.6, y: 0.16, z: z + nz * 0.6, h: y, color, w: Math.min(1.2, w * 0.2), len: 10, k: 0.45 });
  return w;
}

// Canal walls: a wall face from the water up to the street with stone coping, and a railing on
// the land side. `alongX` walls run along x at z = at, the land side at `land` (+1 / -1).
export function canalWall(ctx, alongX, a, b, at, land, { rail = true, waterY = WEST.waterY } = {}) {
  if (b - a < 0.5) return;
  const t = 1.0, y0 = waterY - 1;
  const c = at + land * (t / 2) * -1; // the wall sits on the water side of the line
  if (alongX) {
    slab(ctx, 'concrete', a, y0, Math.min(at, at - land * t), b, 0, Math.max(at, at - land * t), { tag: 'quay', uv: [6, 6] });
    ctx.buckets.add('painted', box(b - a, 0.35, 0.7, (a + b) / 2, -0.15, c), 0x8c877d);
    if (rail) railing(ctx, true, a, b, at - land * 0.35, 0);
  } else {
    slab(ctx, 'concrete', Math.min(at, at - land * t), y0, a, Math.max(at, at - land * t), 0, b, { tag: 'quay', uv: [6, 6] });
    ctx.buckets.add('painted', box(0.7, 0.35, b - a, c, -0.15, (a + b) / 2), 0x8c877d);
    if (rail) railing(ctx, false, a, b, at - land * 0.35, 0);
  }
  // Mooring rings and stains down the face, every 15 m.
  for (let s = a + 7; s < b - 3; s += 15) {
    const px = alongX ? s : at - land * (t + 0.03), pz = alongX ? at - land * (t + 0.03) : s;
    ctx.buckets.add('painted', box(alongX ? 1.2 : 0.06, 4.4, alongX ? 0.06 : 1.2, px, -3.4, pz), 0x2e3236);
  }
}

// Splits [a, b] around the given openings [[g0, g1], ...].
export function around(a, b, gaps) {
  const out = [];
  let s = a;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g1 <= s || g0 >= b) continue;
    if (g0 > s) out.push([s, g0]);
    s = Math.max(s, g1);
  }
  if (s < b) out.push([s, b]);
  return out;
}

// A bus shelter on a sidewalk facing the street (nx, nz).
export function busShelter(ctx, x, z, nx, nz, ad = 'RIDE THE EL') {
  const along = { x: -nz, z: nx };
  const w = 3.6;
  const L = (o, h, out) => [x + along.x * o - nx * out, z + along.z * o - nz * out];
  for (const o of [-w / 2, w / 2]) for (const out of [0, 1.3]) {
    const [px, pz] = L(o, 0, out);
    ctx.buckets.add('steel', box(0.08, 2.4, 0.08, px, 0.15 + 1.2, pz));
  }
  const [cx, cz] = L(0, 0, 0.65);
  ctx.buckets.add('painted', box(Math.abs(along.x) ? w + 0.3 : 1.6, 0.12, Math.abs(along.z) ? w + 0.3 : 1.6, cx, 2.6, cz), 0x2c3a52);
  const [bx, bz] = L(0, 0, 1.3);
  ctx.buckets.add('glow', box(Math.abs(along.x) ? w : 0.05, 1.6, Math.abs(along.z) ? w : 0.05, bx, 1.4, bz), 0x55657d);
  bench(ctx, cx - nx * 0.2, cz - nz * 0.2, nx, nz);
  ctx.collision.addBox(Math.min(x, bx) - 0.2 - Math.abs(along.x) * w / 2, 0.15, Math.min(z, bz) - 0.2 - Math.abs(along.z) * w / 2, Math.max(x, bx) + 0.2 + Math.abs(along.x) * w / 2, 2.7, Math.max(z, bz) + 0.2 + Math.abs(along.z) * w / 2, 'prop');
  void ad;
}

// A newsstand kiosk with a lit window and a striped canopy.
export function newsstand(ctx, x, z, nx, nz) {
  solid(ctx, 'painted', box(2.4, 2.3, 1.6, x, 0.15 + 1.15, z), { color: 0x2f5a46, tag: 'prop' });
  ctx.buckets.add('painted', box(2.8, 0.15, 2.2, x + nx * 0.3, 2.6, z + nz * 0.3), 0xb84a3a);
  glow(ctx, box(Math.abs(nz) ? 1.8 : 0.05, 0.8, Math.abs(nx) ? 1.8 : 0.05, x + nx * 0.82, 1.5, z + nz * 0.82), 0xc89a52);
}

// Grapple points along a roof edge segment (y the roof surface, n the outward normal).
export function edgePoints(ctx, x0, z0, x1, z1, y, nx, nz, step = 7) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  for (let t = step / 2; t < len; t += step) ctx.grapple.push({ x: x0 + (x1 - x0) * (t / len), y, z: z0 + (z1 - z0) * (t / len), nx, nz });
}
