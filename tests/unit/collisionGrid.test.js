import { describe, it, expect, beforeAll } from 'vitest';
import { createCollision } from '../../src/world/collision.js';
import { createCollision as createLegacy } from './helpers/collisionLegacy.js';
import { createRng } from '../../src/core/rng.js';
import { buildCoreCityHeadless } from './helpers/headlessCity.js';

// The dense-grid collision must answer exactly like the old 8 m hash it replaced: same query sets
// in the same order, same ground heights, same pushes, same ray hits (including ties). Checked on
// the real core city with random probes, with the grid frozen, with boxes added after the freeze
// (breakables, sheds) and with boxes removed (blown-open walls).

const BOUNDS = { minX: -700, maxX: 800, minZ: -820, maxZ: 420 };
const floor = (x, z) => (z > 205 ? -Infinity : 0);

let city;
beforeAll(async () => { city = await buildCoreCityHeadless(); }, 120000);

function pair() {
  const a = createCollision({ floor, bounds: BOUNDS });
  const b = createLegacy({ floor });
  return { a, b };
}

function load({ a, b }, boxes) {
  for (const x of boxes) {
    a.addBox(x.minX, x.minY, x.minZ, x.maxX, x.maxY, x.maxZ, x.tag);
    b.addBox(x.minX, x.minY, x.minZ, x.maxX, x.maxY, x.maxZ, x.tag);
  }
}

const ids = (list) => list.map((x) => x.id);

function compare({ a, b }, rng, n) {
  let hits = 0, walls = 0;
  for (let i = 0; i < n; i++) {
    const x = rng.range(-260, 260), z = rng.range(-260, 340), y = rng.range(-2, 70);
    // query: same boxes, same order
    const w = rng.range(0, rng.chance(0.1) ? 60 : 6), d = rng.range(0, 6);
    expect(ids(a.query(x - w, z - d, x + w, z + d))).toEqual(ids(b.query(x - w, z - d, x + w, z + d)));
    // groundBelow
    const r = rng.range(0, 1);
    expect(a.groundBelow(x, y, z, r)).toBe(b.groundBelow(x, y, z, r));
    // resolveCylinder: same push, same flags
    const pa = { x, y, z }, pb = { x, y, z };
    const opts = rng.chance(0.5) ? { prevY: y + rng.range(-1, 3) } : rng.chance(0.5) ? { stepUp: 0.45 } : undefined;
    const ra = a.resolveCylinder(pa, 0.35, 1.8, opts), rb = b.resolveCylinder(pb, 0.35, 1.8, opts);
    expect(ra).toEqual(rb);
    expect(pa).toEqual(pb);
    if (rb.hitWall) walls++;
    // raycast: random direction (sometimes axis-aligned, to hit the parallel-slab branch)
    let dx = rng.range(-1, 1), dy = rng.range(-1, 1), dz = rng.range(-1, 1);
    if (rng.chance(0.2)) { dy = 0; } if (rng.chance(0.1)) { dx = 0; dz = 0; dy = -1; }
    const len = Math.hypot(dx, dy, dz) || 1;
    const dir = { x: dx / len, y: dy / len, z: dz / len };
    const dist = rng.range(1, rng.chance(0.2) ? 300 : 40);
    const ha = a.raycast({ x, y, z }, dir, dist), hb = b.raycast({ x, y, z }, dir, dist);
    if (hb) {
      hits++;
      expect(ha.t).toBe(hb.t);
      expect(ha.box.id).toBe(hb.box.id);
      expect(ha.normal).toEqual(hb.normal);
    } else expect(ha).toBe(null);
  }
  return { hits, walls };
}

describe('dense collision grid matches the old hash exactly', () => {
  it('on the frozen core city', () => {
    const p = pair();
    load(p, city.collision.boxes);
    p.a.freeze();
    const { hits, walls } = compare(p, createRng(7), 4000);
    // The probes really exercise the interesting branches.
    expect(hits).toBeGreaterThan(400);
    expect(walls).toBeGreaterThan(20);
  });

  it('with boxes added after the freeze and some removed', () => {
    const p = pair();
    const all = city.collision.boxes;
    load(p, all.slice(0, 2000));
    p.a.freeze();
    load(p, all.slice(2000));
    const rng = createRng(3);
    for (let i = 0; i < 120; i++) {
      const k = rng.int(0, all.length - 1);
      p.a.removeBox(p.a.boxes[k]);
      p.b.removeBox(p.b.boxes[k]);
    }
    compare(p, createRng(9), 2500);
    // Freezing again packs the late boxes in and drops the removed ones: still identical.
    p.a.freeze();
    compare(p, createRng(10), 2500);
  });

  it('without bounds (everything in the sparse map) and outside the bounds', () => {
    const a = createCollision({ floor });
    const b = createLegacy({ floor });
    load({ a, b }, city.collision.boxes);
    a.freeze();
    compare({ a, b }, createRng(11), 1500);
    const c = createCollision({ floor, bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } });
    load({ a: c, b: createLegacy() }, []);
    const legacy = createLegacy({ floor });
    load({ a: c, b: legacy }, city.collision.boxes);
    c.freeze();
    compare({ a: c, b: legacy }, createRng(12), 1500);
  });

  it('passing `out` reuses the caller object and gives the same answer', () => {
    const p = pair();
    load(p, city.collision.boxes);
    p.a.freeze();
    const out = { grounded: false, groundY: 0, hitWall: false, ceiling: false };
    const pos = { x: 10.1, y: 0.2, z: 21 };
    const r = p.a.resolveCylinder(pos, 0.35, 1.8, undefined, out);
    expect(r).toBe(out);
    const hitOut = { t: 0, box: null, normal: { x: 0, y: 0, z: 0 } };
    const h = p.a.raycast({ x: 0, y: 30, z: 60 }, { x: 0, y: -1, z: 0 }, 100, hitOut);
    expect(h).toBe(hitOut);
    expect(h.normal.y).toBe(1);
    const q = [];
    expect(p.a.query(0, 0, 10, 10, q)).toBe(q);
  });
});

describe('dense collision grid scales', () => {
  it('handles 300k boxes (a 4x city and then some) without falling back to a full scan', () => {
    const c = createCollision({ floor: () => 0, bounds: { minX: -1200, maxX: 1200, minZ: -1200, maxZ: 1200 } });
    const rng = createRng(5);
    for (let i = 0; i < 300000; i++) {
      const x = rng.range(-1150, 1150), z = rng.range(-1150, 1150), w = rng.range(0.2, 6), h = rng.range(0.2, 40);
      c.addBox(x, 0, z, x + w, h, z + w, 'b');
    }
    c.freeze();
    const out = [];
    const t0 = performance.now();
    let found = 0;
    for (let i = 0; i < 20000; i++) {
      const x = rng.range(-1100, 1100), z = rng.range(-1100, 1100);
      found += c.query(x - 0.5, z - 0.5, x + 0.5, z + 0.5, out).length;
      c.groundBelow(x, 50, z, 0.3);
    }
    const ms = performance.now() - t0;
    expect(found).toBeGreaterThan(0);
    // 20k queries + 20k ground probes: a full scan of 300k boxes each would take minutes.
    expect(ms).toBeLessThan(1500);
    // A query result that agrees with brute force.
    const x = 12, z = -40;
    const brute = c.boxes.filter((b) => b.maxX >= x - 3 && b.minX <= x + 3 && b.maxZ >= z - 3 && b.minZ <= z + 3).map((b) => b.id).sort((p, q) => p - q);
    expect(c.query(x - 3, z - 3, x + 3, z + 3).map((b) => b.id).sort((p, q) => p - q)).toEqual(brute);
  });
});
