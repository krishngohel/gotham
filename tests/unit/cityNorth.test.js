import { describe, it, expect, beforeAll } from 'vitest';
import { buildCoreCityHeadless } from './helpers/headlessCity.js';
import { BRISTOL, BRISTOL_ENTRIES, ROCK_SLOPE, bristolGrid, bristolHeight, bristolRoads, baseHeight } from '../../src/world/regions/bristolLayout.js';
import { BLACKGATE } from '../../src/world/regions/blackgateLayout.js';
import { REGION_SITES, districtAt, floorAt, killYAt, regionAt } from '../../src/world/regions/index.js';

// Bristol and Blackgate (workstream H, city north): the hills' heightfield and roads are pure and
// checked here; the walks run a character (or a car-sized cylinder) through the real collision
// the way hero.js integrates: move, resolve against boxes and the floor, stand on what is below.
function walk(collision, from, to, { radius = 0.35, height = 1.8, step = 0.25 } = {}) {
  const p = { ...from };
  const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(L / step));
  let walls = 0, minY = Infinity, maxY = -Infinity;
  // Like the hero: each step moves on from where collision left it (pushed back by a wall).
  for (let i = 1; i <= n; i++) {
    const prevY = p.y;
    p.x += dx / n; p.z += dz / n;
    const r = collision.resolveCylinder(p, radius, height, { prevY });
    if (r.hitWall) walls++;
    if (r.groundY > -Infinity && p.y > r.groundY) p.y = r.groundY;
    if (r.groundY === -Infinity) { p.y = -Infinity; break; }
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { p, walls, minY, maxY };
}
// Drives a cylinder along a route polyline (the road's centre line), leg by leg.
function follow(collision, points, opts) {
  let p = { x: points[0].x, y: points[0].y + 0.05, z: points[0].z };
  let walls = 0, minDrop = Infinity;
  for (let i = 1; i < points.length; i++) {
    const r = walk(collision, p, points[i], opts);
    walls += r.walls;
    if (r.p.y === -Infinity) return { fell: true, at: points[i], walls };
    minDrop = Math.min(minDrop, r.p.y - points[i].y);
    p = r.p;
  }
  return { fell: false, walls, end: p, minDrop };
}

let city;
beforeAll(async () => { city = await buildCoreCityHeadless(); }, 120000);

describe('Bristol terrain', () => {
  it('meets every neighbouring region at street level and rises to the Manor plateau', () => {
    for (let x = BRISTOL.minX; x <= BRISTOL.maxX; x += 9) expect(Math.abs(bristolHeight(x, BRISTOL.maxZ))).toBeLessThan(0.05);
    for (let z = BRISTOL.minZ; z <= BRISTOL.maxZ; z += 9) expect(Math.abs(bristolHeight(BRISTOL.maxX, z))).toBeLessThan(0.05);
    expect(bristolHeight(BRISTOL.manor.x, BRISTOL.manor.z)).toBeCloseTo(BRISTOL.plateau, 1);
    expect(bristolHeight(BRISTOL.cemetery.x, BRISTOL.cemetery.z)).toBeCloseTo(BRISTOL.plateau, 1);
    expect(bristolHeight(BRISTOL.lake.x, BRISTOL.lake.z)).toBeLessThan(BRISTOL.lake.level - 0.6); // deep in the middle
    expect(floorAt(BRISTOL.manor.x, BRISTOL.manor.z)).toBeCloseTo(BRISTOL.plateau, 1);
    expect(baseHeight(-100, -605)).toBeGreaterThanOrEqual(0);
  });
  it('every cell too steep to walk is under a rock box at least as high as its top', () => {
    const { H, NX, NZ, step, minX, minZ } = bristolGrid();
    const at = (i, j) => H[j * (NX + 1) + i];
    let steep = 0, covered = 0;
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
      if (Math.max(Math.abs(a - b), Math.abs(c - d), Math.abs(a - c), Math.abs(b - d)) / step < ROCK_SLOPE) continue;
      const x = minX + (i + 0.5) * step, z = minZ + (j + 0.5) * step;
      // The cave mouth's slot and the stream's channel are built by hand.
      if (Math.abs(x - BRISTOL.cave.x) < BRISTOL.cave.w / 2 + 2 && z > BRISTOL.cave.z - BRISTOL.cave.depth - 1 && z < BRISTOL.cave.z + 4) continue;
      if (z > -656 && z < -598 && x > -446 && x < -394) continue;
      steep++;
      const top = Math.max(a, b, c, d);
      if (city.collision.query(x - 0.1, z - 0.1, x + 0.1, z + 0.1).some((bx) => bx.maxY >= top - 0.05 && bx.minY < top - 1)) covered++;
    }
    expect(steep).toBeGreaterThan(50); // the cliff is there
    expect(covered / steep).toBeGreaterThan(0.97);
  });
  it('roads are graded, flat across, and join at shared junctions', () => {
    for (const r of bristolRoads()) {
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1], b = r.points[i], ds = Math.hypot(b.x - a.x, b.z - a.z);
        expect(Math.abs(b.y - a.y) / ds, `${r.id} at ${i}`).toBeLessThan(0.13);
        // The ground under the road is the road (the carve), so cars and the floor agree (within
        // a few centimetres, a little more where two roads cross at a junction).
        expect(Math.abs(bristolHeight(b.x, b.z) - b.y), `${r.id} ground at ${i}`).toBeLessThan(0.4);
      }
    }
    const ends = BRISTOL_ENTRIES.map((e) => city.streetGraph.nearestNode(e.x, e.z, { y: 0 }));
    for (const [k, e] of BRISTOL_ENTRIES.entries()) {
      const n = city.streetGraph.nodes[ends[k]];
      expect(Math.hypot(n.x - e.x, n.z - e.z), e.id).toBeLessThan(0.5);
      expect(n.y).toBeCloseTo(0, 3);
    }
  });
});

describe('Bristol on the street graph', () => {
  const targets = { gates: BRISTOL.gates, village: { x: -112, z: -672 }, cemetery: { x: -500, z: -730 }, overlook: { x: -214, z: -758 }, forecourt: BRISTOL.forecourt };
  it('every way in reaches the Manor, the village, the cemetery and the overlook', () => {
    const g = city.streetGraph;
    for (const e of BRISTOL_ENTRIES) {
      for (const [name, t] of Object.entries(targets)) {
        const r = g.routeBetween({ x: e.x, y: 0, z: e.z }, { x: t.x, y: bristolHeight(t.x, t.z), z: t.z });
        expect(r, `${e.id} -> ${name}`).not.toBe(null);
      }
    }
  });
  it('the old city reaches Wayne Manor on the graph (through the Loop) and Blackgate by the causeway', () => {
    const g = city.streetGraph;
    const toManor = g.routeBetween({ x: 0, y: 0, z: 0 }, { x: BRISTOL.forecourt.x + 11, y: BRISTOL.plateau, z: BRISTOL.forecourt.z });
    expect(toManor).not.toBe(null);
    const regions = new Set(toManor.edges.map((e) => g.edges[e].region));
    for (const r of ['core', 'loop', 'bristol']) expect(regions.has(r), r).toBe(true);
    // And the Bristol part of that drive, from the Loop's stub up to the forecourt, is clear.
    const from = toManor.points.findIndex((q) => q.z < BRISTOL.maxZ - 2);
    const d = follow(city.collision, toManor.points.slice(from), { radius: 1.2, height: 1.6 });
    expect(d.fell).toBe(false);
    expect(d.walls).toBe(0);
    expect(g.routeBetween({ x: 150, y: 0, z: -713 }, { x: -112, y: bristolHeight(-112, -672), z: -672 })).not.toBe(null); // from the Mile
    // From Park Row and the Narrows' riverside drive, north into Bristol.
    for (const x of [-460, -310]) {
      const r = g.routeBetween({ x, y: 0, z: -560 }, { x: -500, y: 18, z: -730 });
      expect(r, `from x ${x}`).not.toBe(null);
      expect(r.length).toBeLessThan(600);
    }
  });
  it('a car-sized cylinder drives every way in up to the Manor forecourt without hitting a wall or falling', () => {
    const g = city.streetGraph;
    for (const e of BRISTOL_ENTRIES) {
      // From just inside the edge (beyond it, until the neighbour region exists, is the edge wall).
      const r = g.routeBetween({ x: e.x - (e.x === BRISTOL.maxX ? 3 : 0), y: 0, z: e.z - (e.z === BRISTOL.maxZ ? 3 : 0) }, { x: BRISTOL.forecourt.x + 11, y: BRISTOL.plateau, z: BRISTOL.forecourt.z });
      const d = follow(city.collision, r.points, { radius: 1.2, height: 1.6 });
      expect(d.fell, e.id).toBe(false);
      expect(d.walls, e.id).toBe(0);
      expect(d.end.y).toBeGreaterThan(BRISTOL.plateau - 1);
    }
  });
  it('on foot from Bristol Road down the west shore to the cave mouth behind the waterfall', () => {
    const g = city.streetGraph;
    const r = g.routeBetween({ x: -440, y: 0.5, z: -619 }, { x: BRISTOL.cave.x, y: 0.3, z: BRISTOL.cave.z + 4.5 });
    expect(r).not.toBe(null);
    const d = follow(city.collision, r.points, { radius: 0.35, height: 1.8 });
    expect(d.fell).toBe(false);
    expect(d.end.y).toBeLessThan(1);
    expect(Math.hypot(d.end.x - BRISTOL.cave.x, d.end.z - (BRISTOL.cave.z + 4.5))).toBeLessThan(2);
    // Into the cave mouth itself (its floor is a ledge at y 0.3, under the rock roof).
    const into = walk(city.collision, d.end, { x: BRISTOL.cave.x, z: BRISTOL.cave.z - 5 });
    expect(into.p.y).toBeCloseTo(0.3, 1);
  });
  it('the hills are walkable off the road, the cliff is not climbable, a long fall lands on the slope', () => {
    // Up the open slope through the woods (no road) from the lowland to the ridge: somewhere
    // between the trees a straight walk climbs all the way, standing on the slope as it goes.
    let best = null;
    for (let x = -330; x <= -150 && !best; x += 3) {
      const up = walk(city.collision, { x, y: bristolHeight(x, -640), z: -640 }, { x, z: -705 });
      if (up.walls === 0 && up.p.y > 8) best = up;
    }
    expect(best).not.toBe(null);
    expect(Math.abs(best.p.y - bristolHeight(best.p.x, best.p.z))).toBeLessThan(0.1);
    // Into the cliff from the lake shore: rock stops you at its foot.
    const cliff = walk(city.collision, { x: -370, y: 0.3, z: -684 }, { x: -370, z: -712 });
    expect(cliff.walls).toBeGreaterThan(0);
    expect(cliff.p.y).toBeLessThan(3);
    // Dropping 40 m onto the hillside at 2.4 m a frame (terminal fall at 20 fps) stops on it.
    const p = { x: -500, y: 60, z: -660 };
    let landed = false;
    for (let k = 0; k < 40 && !landed; k++) {
      const prevY = p.y;
      p.y -= 2.4;
      const r = city.collision.resolveCylinder(p, 0.35, 1.8, { prevY });
      if (r.grounded) landed = true;
    }
    expect(landed).toBe(true);
    expect(Math.abs(p.y - bristolHeight(-500, -660))).toBeLessThan(0.5);
  });
});

describe('Blackgate', () => {
  it('owns its islet and answers as the harbour on the strip before it', () => {
    expect(regionAt(140, 380).id).toBe('blackgate');
    expect(districtAt(140, 380)).toBe('blackgate');
    expect(districtAt(140, 325)).toBe(districtAt(140, 300));
    expect(killYAt(140, 380)).toBe(-0.8);
  });
  it('the causeway joins the docks road to the gate plaza on the graph, and a car drives it', () => {
    const g = city.streetGraph;
    const r = g.routeBetween({ x: 0, y: 0, z: 0 }, { x: 118, y: BLACKGATE.ground, z: 343 });
    expect(r).not.toBe(null);
    expect(r.edges.some((e) => g.edges[e].region === 'blackgate')).toBe(true);
    const on = r.points.findIndex((q) => q.z > 190);
    const d = follow(city.collision, r.points.slice(on), { radius: 1.2, height: 1.6 });
    expect(d.fell).toBe(false);
    expect(d.walls).toBe(0);
    expect(d.end.y).toBeCloseTo(BLACKGATE.ground, 1);
  });
  it('parapets keep you on the causeway; the portcullis is down; the wall walk is a floor', () => {
    const off = walk(city.collision, { x: 84, y: 0.3, z: 260 }, { x: 70, z: 260 });
    expect(off.walls).toBeGreaterThan(0);
    expect(off.p.x).toBeGreaterThan(77);
    const gate = walk(city.collision, { x: BLACKGATE.gate.x, y: BLACKGATE.ground, z: 344 }, { x: BLACKGATE.gate.x, z: 360 });
    expect(gate.walls).toBeGreaterThan(0);
    expect(gate.p.z).toBeLessThan(352);
    const W = BLACKGATE.walls;
    expect(city.collision.groundBelow(140, W.h + BLACKGATE.ground + 1, W.maxZ - 0.8, 0.3)).toBeCloseTo(W.h + BLACKGATE.ground, 3);
  });
});

describe('sites', () => {
  it('every door, gate and landing stands on something', () => {
    const ids = ['wayneManorFront', 'wayneManorTerrace', 'wayneManorGarage', 'batcaveMouth', 'wayneManorGates', 'batcaveDowntown',
      'bristolOverlook', 'bristolChurch', 'bristolPub', 'bristolGarage', 'bristolCemeteryGate', 'wayneFamilyPlot',
      'blackgateGate', 'blackgateCellBlockA', 'blackgateCellBlockB', 'blackgateYard', 'blackgateDock'];
    for (const id of ids) {
      const s = REGION_SITES[id];
      expect(s, id).toBeDefined();
      // Step out of the door a little (the doorway itself is in the wall's box).
      const nx = Math.sin(s.yaw ?? 0) * (s.kind === 'door' ? 0.8 : 0), nz = Math.cos(s.yaw ?? 0) * (s.kind === 'door' ? 0.8 : 0);
      const gy = city.collision.groundBelow(s.x + nx, s.y + 1, s.z + nz, 0.3);
      expect(Math.abs(gy - s.y), `${id} ground ${gy} vs ${s.y}`).toBeLessThan(0.8);
    }
    for (const id of ['wayneManorStudyWindow', 'wayneManorClockPassage']) expect(REGION_SITES[id].interior).toBe('wayneManor');
    expect(REGION_SITES.batcaveMouth.interior).toBe('batcave');
    expect(REGION_SITES.batcaveDowntown.interior).toBe('batcave');
  });
});
