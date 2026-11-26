// Collision benchmark: the old 8 m hash (tests/unit/helpers/collisionLegacy.js) against the dense
// grid (src/world/collision.js) on the real core city, and on synthetic cities of 4x and 32x its
// box count (the second is past the old 65,536-box cliff, where every query scanned every box).
// Usage: node scripts/collision-bench.mjs
import { createCollision } from '../src/world/collision.js';
import { createCollision as createLegacy } from '../tests/unit/helpers/collisionLegacy.js';
import { createRng } from '../src/core/rng.js';
import { buildCoreCityHeadless } from '../tests/unit/helpers/headlessCity.js';

const floor = () => 0;
const bounds = { minX: -1300, maxX: 1300, minZ: -1300, maxZ: 1300 };

function synth(n, seed) {
  // Copies of the core city's boxes tiled around it, so densities match the real thing.
  const out = [];
  const rng = createRng(seed);
  while (out.length < n) {
    const ox = Math.round(rng.range(-2, 2)) * 520, oz = Math.round(rng.range(-2, 2)) * 520;
    for (const b of base) { if (out.length >= n) break; out.push([b.minX + ox, b.minY, b.minZ + oz, b.maxX + ox, b.maxY, b.maxZ + oz, b.tag]); }
  }
  return out;
}

function bench(c, label, span) {
  const rng = createRng(1);
  const N = 20000;
  const probes = Array.from({ length: N }, () => ({ x: rng.range(-span, span), y: rng.range(0, 40), z: rng.range(-span, span), dx: rng.range(-1, 1), dz: rng.range(-1, 1) }));
  const p = { x: 0, y: 0, z: 0 }, dir = { x: 0, y: -0.2, z: 0 }, opts = { prevY: 0 };
  const run = () => {
    for (const q of probes) {
      c.groundBelow(q.x, q.y, q.z, 0.3);
      p.x = q.x; p.y = q.y; p.z = q.z; opts.prevY = q.y;
      c.resolveCylinder(p, 0.35, 1.8, opts);
      const l = Math.hypot(q.dx, 0.2, q.dz); dir.x = q.dx / l; dir.y = -0.2 / l; dir.z = q.dz / l;
      c.raycast(q, dir, 12);
    }
  };
  run();
  const t0 = performance.now();
  run(); run();
  const us = ((performance.now() - t0) / (2 * N)) * 1000;
  console.log(`${label.padEnd(44)} ${us.toFixed(2)} us per (groundBelow + resolveCylinder + raycast)`);
  return us;
}

const city = await buildCoreCityHeadless();
const base = city.collision.boxes;
for (const [name, boxes, span] of [
  ['core city', base.map((b) => [b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, b.tag]), 240],
  ['4x city (synthetic)', synth(base.length * 4, 2), 600],
  ['32x city (synthetic, past 65,536 boxes)', synth(base.length * 32, 3), 1200],
]) {
  const a = createLegacy({ floor }), b = createCollision({ floor, bounds });
  for (const x of boxes) { a.addBox(...x); b.addBox(...x); }
  b.freeze();
  console.log(`-- ${name}: ${boxes.length} boxes`);
  const old = bench(a, '   old hash', span), nu = bench(b, '   dense grid', span);
  console.log(`   speed-up x${(old / nu).toFixed(2)}`);
}
