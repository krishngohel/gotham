import { describe, it, expect, beforeAll } from 'vitest';
import { buildCoreCityHeadless } from './helpers/headlessCity.js';
import { buildStreetGraph } from '../../src/world/regions/streets.js';
import { EAST, LAKE_LEVEL } from '../../src/world/regions/eastLayout.js';
import { killYAt, floorAt, districtAt, REGION_SITES } from '../../src/world/regions/index.js';
import { coasterHeight } from '../../src/world/regions/pier.js';
import { createCollision } from '../../src/world/collision.js';
import { movingBox, setMovingBox } from '../../src/world/regions/eastKit.js';

// The east side (workstream H2) walked and driven through its real collision, the way hero.js
// integrates: move, resolve against boxes, stand on the ground below (or fall to it).
function walk(collision, from, to, { radius = 0.35, height = 1.8, step = 0.25 } = {}) {
  const p = { ...from };
  const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz);
  const n = Math.ceil(L / step);
  let walls = 0, minY = Infinity, maxY = -Infinity;
  for (let i = 1; i <= n; i++) {
    const prevY = p.y;
    p.x = from.x + (dx * i) / n; p.z = from.z + (dz * i) / n;
    const r = collision.resolveCylinder(p, radius, height, { prevY });
    if (r.hitWall) walls++;
    if (r.groundY > -Infinity && p.y > r.groundY) p.y = r.groundY;
    if (r.groundY === -Infinity) { p.y = -Infinity; break; }
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { p, walls, minY, maxY };
}
// Follows a polyline (graph route points) with a car-sized cylinder; returns the lowest height seen.
function drive(collision, pts, opts = { radius: 1.1, height: 1.5 }) {
  let p = { x: pts[0].x, y: (pts[0].y ?? 0) + 0.3, z: pts[0].z }, low = Infinity, walls = 0;
  for (let i = 1; i < pts.length; i++) {
    const r = walk(collision, p, pts[i], opts);
    walls += r.walls;
    low = Math.min(low, r.minY);
    p = r.p;
    if (p.y === -Infinity) return { low: -Infinity, walls, p };
  }
  return { low, walls, p };
}

let city;
const g = buildStreetGraph();
beforeAll(async () => { city = await buildCoreCityHeadless(); }, 120000);

describe('east side: ground, water and districts', () => {
  it('the lake is water (no floor) and counts as in the water; the park is land', () => {
    expect(floorAt(500, -700)).toBe(-Infinity);
    expect(floorAt(300, -500)).toBe(0);
    expect(killYAt(500, -700)).toBeGreaterThan(LAKE_LEVEL - 0.5);
    expect(city.collision.groundBelow(500, 3, -700, 0.3)).toBe(-Infinity);
    expect(districtAt(300, -500)).toBe('robinsonPark');
    expect(districtAt(345, -500)).toBe('lakeshore');
    expect(districtAt(500, -450)).toBe('amusementMile');
    expect(districtAt(650, -80)).toBe('arkham');
    expect(districtAt(300, 150)).toBe('museumCampus');
    expect(districtAt(600, -600)).toBe('lake');
  });
  it('door sites stand on something (museums, the funhouse, the pavilion, Arkham)', () => {
    const doors = Object.entries(REGION_SITES).filter(([, s]) => s.kind === 'door');
    expect(doors.length).toBeGreaterThanOrEqual(9);
    for (const [id, s] of doors) {
      const gy = city.collision.groundBelow(s.x, s.y + 0.6, s.z, 0.3);
      expect(Math.abs(gy - s.y), id).toBeLessThan(0.5);
    }
  });
});

describe('east side: on foot', () => {
  it('from the core east along a z street, across the avenue into the park', () => {
    const r = walk(city.collision, { x: 225, y: 0, z: -30 }, { x: 300, z: -30 });
    expect(r.p.x).toBeGreaterThan(299);
    expect(r.minY).toBeGreaterThan(-0.2);
  });
  it('the length of the north promenade along the seawall', () => {
    const r = walk(city.collision, { x: 360, y: 0.15, z: -770 }, { x: 360, z: -400 });
    expect(r.p.z).toBeLessThan(-399.9);
    expect(r.minY).toBeGreaterThan(0);
  });
  it('the seawall railing stops a walk into the lake', () => {
    const r = walk(city.collision, { x: 360, y: 0.15, z: -700 }, { x: 380, z: -700 });
    expect(r.walls).toBeGreaterThan(0);
  });
  it('up the pier ramp and along the deck to the pavilion', () => {
    const r = walk(city.collision, { x: 360, y: 0.15, z: -450 }, { x: 386, z: -450 });
    expect(r.p.y).toBeCloseTo(EAST.pier.deck, 1);
    const r2 = walk(city.collision, { x: 390, y: EAST.pier.deck, z: -442 }, { x: 595, z: -442 });
    expect(r2.p.x).toBeGreaterThan(560); // the stalls and the hole are off this line until the end
    expect(r2.minY).toBeGreaterThan(EAST.pier.deck - 0.1);
  });
  it('the collapsed deck section drops you in', () => {
    expect(city.collision.groundBelow(576, 3.5, -442, 0.2)).toBe(-Infinity);
  });
  it('the undercroft catwalk runs under the pier, ceiling clear of a standing hero', () => {
    const r = walk(city.collision, { x: 392, y: 0.3, z: -471 }, { x: 610, z: -471 });
    expect(r.minY).toBeCloseTo(0.3, 2);
    expect(r.p.x).toBeGreaterThan(609);
  });
  it('the coaster track is runnable: every metre is a step a body can take', () => {
    for (let x = 392; x < 609; x++) if (!(x >= 573 && x < 579)) expect(Math.abs(coasterHeight(x + 1) - coasterHeight(x))).toBeLessThan(0.45);
    const r = walk(city.collision, { x: 393, y: EAST.pier.deck + 6, z: -466 }, { x: 560, z: -466 }, { radius: 0.3 });
    expect(r.walls).toBe(0);
    expect(r.maxY).toBeGreaterThan(EAST.pier.deck + 20);
  });
  it('over the lock footbridge from the quay to the drive\'s viaduct', () => {
    const r = walk(city.collision, { x: 360, y: 0.15, z: -238.5 }, { x: 366, z: -238.5 });
    const r2 = walk(city.collision, r.p, { x: 366, z: -254 });
    const r3 = walk(city.collision, r2.p, { x: 385, z: -254 });
    expect(r3.p.x).toBeGreaterThan(384);
    expect(r3.minY).toBeGreaterThan(-0.1);
  });
  it('across the causeway, up the ramp, through the asylum gate', () => {
    const r = walk(city.collision, { x: 350, y: 0, z: -80 }, { x: 610, z: -80 }, { radius: 0.35 });
    expect(r.p.x).toBeGreaterThan(609);
    expect(r.p.y).toBeCloseTo(EAST.arkham.plateau, 1);
  });
});

describe('east side: by car along graph routes (no falling through)', () => {
  const cases = [
    ['core to the park', { x: 150, y: 0, z: 30 }, { x: 345, y: 0, z: -700 }],
    ['the drive over the viaduct', { x: 345, y: 0, z: -560 }, { x: 345, y: 0, z: 60 }],
    ['Lower Gotham plaza to the museum drive', { x: 360, y: 0, z: -298 }, { x: 294, y: 0, z: 190 }],
    ['core to Arkham', { x: 150, y: 0, z: -30 }, { x: 600, y: EAST.arkham.plateau, z: -80 }],
    ['the Loop row to the avenue', { x: 150, y: 0, z: -359 }, { x: 245, y: 0, z: -719 }],
  ];
  for (const [name, a, b] of cases) {
    it(name, () => {
      const r = g.routeBetween(a, b);
      expect(r).toBeTruthy();
      const d = drive(city.collision, r.points);
      expect(d.low, name).toBeGreaterThan(-0.6);
      expect(Math.hypot(d.p.x - r.points[r.points.length - 1].x, d.p.z - r.points[r.points.length - 1].z), name).toBeLessThan(3);
    });
  }
});

describe('east side: traversal', () => {
  const near = (x, z, r) => city.ctx.grapple.filter((p) => Math.hypot(p.x - x, p.z - z) < r);
  it('a glide line over each district finds grapple points', () => {
    for (const [x, z] of [[294, -470], [294, -660], [300, 120], [446, -450], [560, -450], [650, -80], [700, -120]]) expect(near(x, z, 40).length, `${x},${z}`).toBeGreaterThan(5);
  });
  it('the Ferris wheel turns: gondola roofs and perches move, and collide where they are', () => {
    const perches = city.ctx.grapple.filter((p) => p.moving);
    expect(perches.length).toBe(EAST.wheel.gondolas);
    for (const u of city.ctx.updaters) u(10);
    const a = perches.map((p) => p.y);
    for (const u of city.ctx.updaters) u(40);
    const moved = perches.filter((p, i) => Math.abs(p.y - a[i]) > 1).length;
    expect(moved).toBeGreaterThan(10);
    const p = perches[3];
    expect(city.collision.groundBelow(p.x, p.y + 0.3, p.z, 0.2)).toBeCloseTo(p.y, 3);
    expect(city.ctx.world.platforms.length).toBe(EAST.wheel.gondolas);
  });
});

describe('movingBox', () => {
  it('collides at its current place anywhere inside its sweep, and not where it was', () => {
    const c = createCollision({ floor: () => -Infinity, bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } });
    const b = movingBox(c, { minX: -20, maxX: 20, minY: 0, maxY: 30, minZ: -1, maxZ: 1 });
    c.freeze();
    setMovingBox(b, -15, 4, -1, -13, 5, 1);
    expect(c.groundBelow(-14, 6, 0, 0.2)).toBe(5);
    setMovingBox(b, 13, 20, -1, 15, 21, 1);
    expect(c.groundBelow(-14, 6, 0, 0.2)).toBe(-Infinity);
    expect(c.groundBelow(14, 22, 0, 0.2)).toBe(21);
  });
});

describe('carryOnPlatforms', () => {
  it('moves a body standing on a platform with it, and leaves others alone', async () => {
    const { carryOnPlatforms } = await import('../../src/world/regions/eastKit.js');
    const box = { minX: 0, maxX: 2, minY: 4, maxY: 5, minZ: -1, maxZ: 1 };
    const pl = [{ box, vx: 1, vy: 0.5, vz: 0 }];
    const on = { x: 1, y: 5, z: 0 }, off = { x: 1, y: 7, z: 0 };
    expect(carryOnPlatforms(pl, on, 0.1)).toBe(pl[0]);
    expect(on.x).toBeCloseTo(1.1); expect(on.y).toBeCloseTo(5.05);
    expect(carryOnPlatforms(pl, off, 0.1)).toBe(null);
    expect(off.x).toBe(1);
  });
});
