// [polish2] Gotham Mile touch-ups (polish list: "Iceberg Lounge plain from the street; Gotham Mile
// boulevard a little empty").
//
//   icebergFront       the cold store's street face as an iceberg in relief: a deep-water band
//                      with a lit waterline, pale shards above it and the bigger dark mass below,
//                      lit fins up both corners, a band of frosted lounge windows, icicles along
//                      the canopy, a carpet and two frosted firs at the rope line.
//   boulevardDressing  the boulevard as a grand avenue: pennants on the globe lamps, strings of
//                      bulbs down the median between its trees, benches and flower boxes, and one
//                      centrepiece per block (a fountain, a statue, a street clock), with clipped
//                      shrubs in stone boxes along both kerbs.
//
// Everything goes into the region's buckets (so into its 128 m chunks and their far LOD) and draws
// nothing from the region's rng: the Mile's seed places exactly what it placed before.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { box, cylinder } from '../buckets.js';
import { glow, lightSpot } from '../cityBuilder.js';
import { bench } from '../streetDressing.js';
import { MILE } from './loopLayout.js';
import { statue, STONE, BRONZE } from './loopKit.js';

const ICE = 0x9ee8ff;

// A four-sided spike flattened against a facade (z = its face), point up or down.
function shard(ctx, x, y, z, r, h, color, down = false, skew = 0) {
  const g = new THREE.ConeGeometry(r, h, 4).rotateY(Math.PI / 4 + skew);
  if (down) g.rotateX(Math.PI);
  ctx.buckets.add('painted', g.scale(1, 1, 0.14).translate(x, y + (down ? -h / 2 : h / 2), z), color);
}

export function icebergFront(ctx, b) {
  const x = b.x, w = b.w, fz = b.z + b.d / 2;
  const WL = 6.6; // the waterline
  // Deep water up to the waterline, the line itself lit, a fainter swell line under it.
  ctx.buckets.add('painted', box(w - 0.5, WL - 0.2, 0.1, x, (WL + 0.2) / 2, fz + 0.05), 0x0f3448);
  glow(ctx, box(w - 0.5, 0.16, 0.1, x, WL, fz + 0.12), ICE);
  glow(ctx, box(w - 0.5, 0.06, 0.1, x, WL - 0.55, fz + 0.11), 0x2f86a8);
  // The berg: pale shards above the line...
  for (const [dx, r, h, c] of [[0.5, 6.2, 3.5, 0xeaf8ff], [-5.6, 3.6, 2.6, 0xc6e8f6], [5.6, 4.2, 3.0, 0xd6f0fa], [-10.2, 2.2, 1.5, 0xeaf8ff], [10.6, 2.6, 1.9, 0xc6e8f6]]) {
    shard(ctx, x + dx, WL + 0.08, fz + 0.3, r, h, c, false, dx * 0.05);
  }
  // ...and nine tenths of it below, darker, either side of the door.
  for (const [dx, r, h, c] of [[-10.6, 5.2, 5.6, 0x23708e], [10.8, 4.8, 5.2, 0x1d6584], [-16.4, 2.6, 3.4, 0x2d86a6], [16.6, 3.0, 3.8, 0x23708e], [-6.4, 2.0, 2.0, 0x2d86a6], [6.6, 2.2, 2.2, 0x2d86a6]]) {
    shard(ctx, x + dx, WL - 0.1, fz + 0.26, r, h, c, true, dx * 0.04);
  }
  // Fins up both corners, a strip of cold light down the front of each.
  for (const s of [-1, 1]) {
    const fx = x + s * (w / 2 - 0.9);
    ctx.buckets.add('painted', box(1.1, 21.4, 0.8, fx, 10.7, fz + 0.4), 0x1c3040);
    glow(ctx, box(0.18, 19.6, 0.06, fx, 11.2, fz + 0.82), ICE);
    ctx.buckets.add('painted', box(1.5, 0.5, 1.1, fx, 21.6, fz + 0.45), 0xd8f2ff);
    ctx.halos.add(fx, 20.4, fz + 1.0, ICE, 3.2);
  }
  // The lounge behind frosted glass: a band of tall lit windows under the cornice.
  for (let k = -3; k <= 3; k++) {
    const wx = x + k * 4.9;
    ctx.buckets.add('painted', box(3.5, 4.3, 0.12, wx, 17.0, fz + 0.06), 0x16242e);
    glow(ctx, box(3.1, 3.9, 0.1, wx, 17.0, fz + 0.1), k % 2 ? 0x3a94b6 : 0x4aa9cc);
    for (const m of [-0.52, 0.52]) ctx.buckets.add('painted', box(0.08, 3.9, 0.08, wx + m, 17.0, fz + 0.16), 0x16242e);
    ctx.buckets.add('painted', box(3.1, 0.08, 0.08, wx, 17.6, fz + 0.16), 0x16242e);
  }
  ctx.buckets.add('painted', box(w - 4, 0.3, 0.5, x, 14.7, fz + 0.25), 0xd8f2ff);
  // Icicles along the canopy's edge.
  for (let k = 0; k < 18; k++) {
    const L = 0.3 + ((k * 7) % 5) * 0.13;
    ctx.buckets.add('painted', new THREE.ConeGeometry(0.08, L, 4).rotateX(Math.PI).translate(x - 5.7 + k * 0.67, 4.2 - L / 2, fz + 2.78), 0xe4f6ff);
  }
  // The rope line: an ice-blue carpet, and a frosted fir in a white box either side of it.
  ctx.buckets.add('painted', box(3.2, 0.02, 4.4, x, 0.165, fz + 2.3), 0x1c5a78);
  for (const s of [-1, 1]) {
    const px = x + s * 4.4, pz = fz + 2.4;
    ctx.buckets.add('painted', box(0.9, 0.7, 0.9, px, 0.5, pz), 0xe2eef4);
    ctx.buckets.add('painted', new THREE.ConeGeometry(0.62, 2.3, 6).translate(px, 2.0, pz), 0x1f3a34);
    ctx.buckets.add('painted', new THREE.ConeGeometry(0.34, 0.8, 6).translate(px, 3.0, pz), 0xcfeaf4);
    ctx.collision.addBox(px - 0.45, 0.15, pz - 0.45, px + 0.45, 0.85, pz + 0.45, 'prop');
  }
  ctx.reflect.push({ x, y: 0.16, z: fz + 5, h: WL, color: ICE, w: 6, len: 8, k: 0.22 });
}

// A stone flower box: a low trough with clumps of colour.
function flowerBox(ctx, x, z, alongX, colors) {
  const L = 2.6, W = 1.0;
  ctx.buckets.add('painted', box(alongX ? L : W, 0.5, alongX ? W : L, x, 0.45, z), STONE);
  for (let k = 0; k < 5; k++) {
    const t = (k - 2) * 0.5;
    ctx.buckets.add('painted', new THREE.IcosahedronGeometry(0.3 + (k % 2) * 0.06, 0).translate(x + (alongX ? t : 0), 0.82, z + (alongX ? 0 : t)), colors[k % colors.length]);
  }
  ctx.collision.addBox(x - (alongX ? L : W) / 2, 0.2, z - (alongX ? W : L) / 2, x + (alongX ? L : W) / 2, 0.7, z + (alongX ? W : L) / 2, 'prop');
}

// A clipped shrub in a square stone box at the kerb.
function kerbShrub(ctx, x, z) {
  ctx.buckets.add('painted', box(1.1, 0.6, 1.1, x, 0.45, z), STONE);
  ctx.buckets.add('painted', new THREE.IcosahedronGeometry(0.62, 0).scale(1, 1.15, 1).translate(x, 1.3, z), 0x263a2c);
  ctx.collision.addBox(x - 0.55, 0.15, z - 0.55, x + 0.55, 1.6, z + 0.55, 'prop');
}

export function boulevardDressing(ctx) {
  const BX = MILE.boulevardX, BW = MILE.boulevardW, Z0 = MILE.minZ, Z1 = MILE.maxZ;
  const crossZ = [...MILE.zLines].sort((p, q) => p - q);
  const PENNANTS = [0x7a2430, 0x2c3f6e, 0xb8923a];
  const lite = (ctx.quality?.crowdDensity ?? 1) < 0.5; // potato: no strings of bulbs (hard rule 5)
  // Pennants on the double-globe lamps (the same z as mile.js places them), one over the road
  // and one over the sidewalk, on a brass arm.
  let n = 0;
  for (let z = Z0 + 10; z < Z1 - 4; z += 20) {
    if (MILE.zLines.some((q) => Math.abs(z - q) < 9)) continue;
    for (const s of [-1, 1]) {
      const lx = BX + s * (BW / 2 + 1);
      ctx.buckets.add('painted', box(2.0, 0.06, 0.06, lx, 4.5, z), BRONZE);
      for (const t of [-0.75, 0.75]) ctx.buckets.add('painted', box(0.7, 1.7, 0.04, lx + t, 3.6, z), PENNANTS[(n + (t > 0 ? 1 : 0)) % 3]);
      n++;
    }
    // Clipped shrubs at the kerb half way to the next lamp (clear of the shelters and kiosks).
    for (const s of [-1, 1]) {
      const zz = z + 10, kx = BX + s * (BW / 2 + 1.1);
      if (MILE.zLines.some((q) => Math.abs(zz - q) < 10) || zz > Z1 - 6) continue;
      if ((s < 0 && (Math.abs(zz + 690) < 5 || Math.abs(zz + 632) < 4)) || (s > 0 && (Math.abs(zz + 630) < 5 || Math.abs(zz + 700) < 4))) continue;
      kerbShrub(ctx, kx, zz);
    }
  }
  // The median, block by block: bulbs strung tree to tree, benches and flower boxes between the
  // trees, and a centrepiece in the middle of each block.
  let block = 0;
  for (let i = 0; i + 1 < crossZ.length; i++) {
    const a = crossZ[i] + 8, b = Math.min(crossZ[i + 1] - 8, Z1 - 1);
    if (b - a < 4) continue;
    const trees = [];
    for (let z = a + 4; z < b - 2; z += 10) trees.push(z);
    const mid = Math.floor((trees.length - 1) / 2);
    for (let k = 0; k + 1 < trees.length; k++) {
      const z0 = trees[k], z1 = trees[k + 1], zm = (z0 + z1) / 2;
      // A string of bulbs, sagging between the trunks.
      for (let j = 1; j < (lite ? 0 : 10); j++) {
        const t = j / 10, y = 3.3 - Math.sin(t * Math.PI) * 0.5;
        glow(ctx, box(0.12, 0.14, 0.12, BX, y, z0 + (z1 - z0) * t), j % 3 ? 0xffe2a0 : 0xffb070);
      }
      if (!lite) ctx.buckets.add('painted', box(0.02, 0.02, z1 - z0, BX, 3.42, zm), 0x1a1a1a);
      if (k === mid) { centrepiece(ctx, BX, zm, block); continue; }
      if (k % 2 === 0) { bench(ctx, BX - 0.5, zm, -1, 0); bench(ctx, BX + 0.5, zm, 1, 0); }
      else flowerBox(ctx, BX, zm, false, k % 4 === 1 ? [0xc8323c, 0xe8c84a, 0xc8323c] : [0xe8e0d0, 0xb86ab0, 0xe8c84a]);
    }
    block++;
  }
}

// One per block of the median: a fountain, a bronze figure, a four-faced street clock.
function centrepiece(ctx, x, z, kind) {
  if (kind % 3 === 0) {
    ctx.buckets.add('painted', cylinder(2.3, 2.4, 0.7, x, 0.55, z, 12), STONE);
    glow(ctx, new THREE.CircleGeometry(2.0, 12).rotateX(-Math.PI / 2).translate(x, 0.92, z), 0x1f4a5e);
    ctx.buckets.add('painted', cylinder(0.35, 0.55, 1.5, x, 1.45, z, 8), STONE);
    ctx.buckets.add('painted', cylinder(1.0, 0.4, 0.25, x, 2.3, z, 10), STONE);
    glow(ctx, new THREE.ConeGeometry(0.28, 1.4, 6).translate(x, 3.1, z), 0xbfe6f6);
    ctx.collision.addBox(x - 2.2, 0.2, z - 2.2, x + 2.2, 0.9, z + 2.2, 'fountain');
    ctx.halos.add(x, 2.6, z, 0xbfe6f6, 3.4);
    lightSpot(ctx, x, 2.4, z, 0xbfe6f6, 14, 10);
  } else if (kind % 3 === 1) {
    ctx.buckets.add('painted', box(2.0, 0.4, 2.0, x, 0.4, z), STONE);
    ctx.buckets.add('painted', box(1.4, 1.5, 1.4, x, 1.35, z), STONE);
    ctx.buckets.add('painted', box(1.7, 0.2, 1.7, x, 2.2, z), STONE);
    ctx.collision.addBox(x - 1, 0.2, z - 1, x + 1, 2.3, z + 1, 'plinth');
    statue(ctx, x, 2.3, z, 1.3, Math.PI, { scales: false });
    for (const s of [-1, 1]) glow(ctx, box(0.3, 0.12, 0.3, x + s * 1.5, 0.3, z), 0xf2d89a);
  } else {
    ctx.buckets.add('painted', box(1.0, 0.5, 1.0, x, 0.45, z), BRONZE);
    ctx.buckets.add('painted', cylinder(0.14, 0.2, 3.6, x, 2.5, z, 8), 0x2a2d33);
    ctx.buckets.add('painted', box(1.3, 1.3, 1.3, x, 4.9, z), 0x2a2d33);
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      glow(ctx, new THREE.CircleGeometry(0.52, 14).rotateY(Math.atan2(nx, nz)).translate(x + nx * 0.66, 4.9, z + nz * 0.66), 0xf2e6c8);
      // Hands at ten past ten, as on every clock in every shop window.
      ctx.buckets.add('painted', box(Math.abs(nz) ? 0.05 : 0.02, 0.34, Math.abs(nx) ? 0.05 : 0.02, x + nx * 0.68, 5.02, z + nz * 0.68).translate(0, 0, 0), 0x16181c);
    }
    ctx.buckets.add('painted', new THREE.ConeGeometry(0.9, 0.7, 4).rotateY(Math.PI / 4).translate(x, 5.9, z), BRONZE);
    ctx.collision.addBox(x - 0.5, 0.2, z - 0.5, x + 0.5, 3, z + 0.5, 'prop');
    ctx.halos.add(x, 4.9, z, PALETTE.window, 3);
  }
}
