import { describe, it, expect, beforeAll } from 'vitest';
import { buildCoreCityHeadless } from './helpers/headlessCity.js';
import { WEST, WEST_BRIDGES } from '../../src/world/regions/westLayout.js';
import { WEST_REGION_DATA } from '../../src/world/regions/westData.js';
import { pointAlong, polylineLength } from '../../src/world/streetGraph.js';

// The west side's real collision (workstream H3), walked the way hero.js integrates (as
// riverfront.test.js does): on foot and in a car-sized cylinder, from the core into every
// district, over the bascules, down to the river walk, across a lock gate.
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
// Drives a polyline (a street-graph route) in a car-sized cylinder.
function drive(collision, pts, opts = { radius: 1.3, height: 1.6 }) {
  const out = { walls: 0, minY: Infinity, maxY: -Infinity, fell: false };
  const L = polylineLength(pts);
  const at = { x: 0, y: 0, z: 0 };
  pointAlong(pts, 0, at);
  let p = { x: at.x, y: 0.2, z: at.z };
  for (let s = 2; s <= L; s += 2) {
    pointAlong(pts, s, at);
    const r = walk(collision, p, { x: at.x, z: at.z }, opts);
    out.walls += r.walls;
    if (r.p.y === -Infinity) { out.fell = true; break; }
    out.minY = Math.min(out.minY, r.minY); out.maxY = Math.max(out.maxY, r.maxY);
    p = r.p;
  }
  return out;
}

let city;
beforeAll(async () => { city = await buildCoreCityHeadless(); }, 120000);

describe('the west side is walkable and drivable', () => {
  it('from the core over the -150 South Branch bascule into Chinatown', () => {
    const r = walk(city.collision, { x: -220, y: 0, z: -150 }, { x: -440, z: -150 });
    expect(r.walls).toBe(0);
    expect(r.minY).toBeGreaterThan(-0.1);
    expect(r.p.x).toBeCloseTo(-440, 3);
  });
  it('from Lower Gotham\'s west plaza over the -298 bascule across the Narrows and the channel into Park Row', () => {
    const r = walk(city.collision, { x: -258, y: 0, z: -298 }, { x: -560, z: -298 });
    expect(r.walls).toBe(0);
    expect(r.minY).toBeGreaterThan(-0.1);
  });
  it('from the Loop row\'s El street over the -359 bascule into the Narrows', () => {
    const r = walk(city.collision, { x: -250, y: 0, z: -359 }, { x: -410, z: -359 });
    expect(r.walls).toBe(0);
    expect(r.minY).toBeGreaterThan(-0.1);
  });
  it('the whole El corridor, the branch to the west edge (over the fixed span and the channel bridge)', () => {
    const r = walk(city.collision, { x: -268, y: 0, z: -479 }, { x: -575, z: -479 }, { radius: 1.3, height: 1.6 });
    expect(r.walls).toBe(0);
    expect(r.minY).toBeGreaterThan(-0.1);
  });
  it('down the riverside drive from Bristol\'s edge to the harbour road, over both cuts', () => {
    const r = walk(city.collision, { x: -310, y: 0, z: -598 }, { x: -310, z: 196 }, { radius: 1.3, height: 1.6 });
    expect(r.walls).toBe(0);
    expect(r.minY).toBeGreaterThan(-0.1);
  });
  it('down the -460 street from Park Row through Odessa and across the tracks to the harbour', () => {
    const r = walk(city.collision, { x: -460, y: 0, z: -598 }, { x: -460, z: 196 }, { radius: 1.3, height: 1.6 });
    expect(r.walls).toBe(0);
    expect(r.minY).toBeGreaterThan(-0.1);
  });
  it('drives graph routes from the core to every district without a wall or a fall', () => {
    const g = city.streetGraph;
    // North of the river the routes start where the west side joins Lower Gotham's plaza (the
    // proof region's own corner there is not this workstream's to test); south of it, in the core.
    for (const [from, to] of [
      [{ x: -258, z: -298 }, { x: -370, z: -500 }], [{ x: -258, z: -298 }, { x: -520, z: -480 }], [{ x: -262, z: -359 }, { x: -460, z: -580 }],
      [{ x: -150, z: 0 }, { x: -415, z: -90 }], [{ x: -150, z: 0 }, { x: -520, z: -120 }], [{ x: -150, z: 0 }, { x: -460, z: 150 }], [{ x: -150, z: 0 }, { x: -261, z: 60 }],
    ]) {
      const route = g.routeBetween({ ...from, y: 0 }, { ...to, y: 0 });
      // Keep to the left lane like the city's traffic (3 m off the centre line).
      const d = drive(city.collision, route.points);
      expect(d.fell, `${to.x},${to.z}`).toBe(false);
      expect(d.walls, `${to.x},${to.z}`).toBe(0);
      expect(d.minY).toBeGreaterThan(-0.1);
      expect(d.maxY).toBeLessThan(0.5);
    }
  });
  it('down the stairs to the quay river walk and along it under the bridges', () => {
    const down = walk(city.collision, { x: -269.5, y: 0.15, z: -229.5 }, { x: -269.5, z: -205 });
    expect(down.walls).toBe(0);
    expect(down.p.y).toBeCloseTo(WEST.walkY, 2);
    const along = walk(city.collision, { x: -269.5, y: WEST.walkY, z: -205 }, { x: -269.5, z: 120 });
    expect(along.walls).toBe(0);
    expect(along.minY).toBeCloseTo(WEST.walkY, 2);
    // Headroom under the bascule decks.
    for (const b of WEST_BRIDGES.bascules.filter((q) => q.z > -230 && q.z < WEST.quayWalk.stairs[1][0])) expect(city.collision.groundBelow(-269.5, -2.5, b.z, 0.3)).toBeCloseTo(WEST.walkY, 2);
  });
  it('railings stop a walk off the quay and off the river walk into the branch', () => {
    // (walk() counts the walls it meets; as in riverfront.test.js it does not stop at them)
    expect(walk(city.collision, { x: -262, y: 0, z: 40 }, { x: -285, z: 40 }).walls).toBeGreaterThan(0);
    expect(walk(city.collision, { x: -269.5, y: WEST.walkY, z: 20 }, { x: -285, z: 20 }).walls).toBeGreaterThan(0);
    expect(walk(city.collision, { x: -305, y: 0, z: -500 }, { x: -290, z: -500 }).walls).toBeGreaterThan(0);
  });
  it('across a shut lock gate from the quay to the Yards', () => {
    for (const u of city.ctx.updaters) u(100); // both gate pairs shut (the chamber is draining)
    const r = walk(city.collision, { x: -262, y: 0, z: WEST.lock.lowerZ }, { x: -312, z: WEST.lock.lowerZ });
    expect(r.walls).toBe(0);
    expect(r.minY).toBeGreaterThan(-0.7);
    for (const u of city.ctx.updaters) u(0);
  });
  it('water has nothing to stand on: the branch, the channel, the cuts', () => {
    for (const [x, z] of [[-283, -400], [-283, 40], [-440, -360], [-400, -239], [-380, -594]]) expect(city.collision.groundBelow(x, 2, z, 0.3), `${x},${z}`).toBe(-Infinity);
  });
  it('every site stands on something within 2 m', () => {
    for (const r of WEST_REGION_DATA) for (const [k, s] of Object.entries(r.sites)) {
      const g = city.collision.groundBelow(s.x, s.y + 1.5, s.z, 0.3);
      expect(Math.abs(g - s.y), `${k} ground ${g} site ${s.y}`).toBeLessThan(2);
    }
  });
  it('nothing tall stands in the El corridor envelope or the station plots', () => {
    const E = WEST.el;
    const bad = city.collision.boxes.filter((b) => b && b.maxY > 4.5 && b.minY < 9 && b.maxX > E.minX && b.minX < E.maxX
      && ((b.maxZ > E.envelope.minZ && b.minZ < E.envelope.maxZ) || E.stations.some((s) => b.maxX > s.minX && b.minX < s.maxX && b.maxZ > s.minZ && b.minZ < s.maxZ))
      && !['prop', 'bound', 'tree'].includes(b.tag)
      && !(b.maxX - b.minX < 0.5 && b.maxZ - b.minZ < 0.5)); // lamp posts may stand on the sidewalks
    expect(bad.map((b) => `${b.tag} ${b.minX.toFixed(0)},${b.minZ.toFixed(0)}`)).toEqual([]);
  });
  it('rooftop routes: grapple points, ladders and zip lines in every district', () => {
    const count = (x0, x1, z0, z1) => city.ctx.grapple.filter((p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1).length;
    expect(count(-430, -300, -588, -246)).toBeGreaterThan(300); // the Narrows
    expect(count(-580, -450, -600, -226)).toBeGreaterThan(150); // Park Row
    expect(count(-580, -300, -226, -30)).toBeGreaterThan(200);  // Chinatown + Odessa
    expect(count(-580, -300, -30, 205)).toBeGreaterThan(150);   // the Yards
    expect(count(-300, -236, -236, 205)).toBeGreaterThan(80);   // the branch and the quay
    const west = city.ctx.climbables.ziplines.filter((z) => z.a.x < -300);
    expect(west.length).toBeGreaterThanOrEqual(2);
    expect(city.ctx.climbables.ladders.filter((l) => l.x < -236).length).toBeGreaterThan(200);
  });
});
