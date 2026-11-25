import { describe, it, expect, beforeAll } from 'vitest';
import { buildCoreCityHeadless } from './helpers/headlessCity.js';
import { EL, EL_STATIONS, LOOP, LOOP_COLUMNS, LOOP_ROWS, MILE, loopTrack, westTrack, pathTable, pathPoint, westLineData } from '../../src/world/regions/loopLayout.js';
import { createSchedule, EL_TIMING } from '../../src/world/regions/elSchedule.js';
import { trainDefs } from '../../src/world/regions/el.js';
import { buildStreetGraph } from '../../src/world/regions/streets.js';
import { districtAt, REGION_SITES, REGION_CRIME_SPOTS, REGIONS } from '../../src/world/regions/index.js';
import { EL_CAR } from '../../src/vehicles/models/elTrain.js';

// Walks a cylinder through the real collision the way hero.js integrates (see riverfront.test.js).
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

describe('El layout (pure)', () => {
  it('the Loop tracks are closed, smooth and parallel', () => {
    for (const off of [-EL.track, EL.track]) {
      const pts = loopTrack(off);
      const a = pts[0], b = pts[pts.length - 1];
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6);
      for (let i = 0; i + 1 < pts.length; i++) {
        const turn = i + 2 < pts.length ? Math.abs(Math.atan2(Math.sin(Math.atan2(pts[i + 2].x - pts[i + 1].x, pts[i + 2].z - pts[i + 1].z) - Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z)), Math.cos(Math.atan2(pts[i + 2].x - pts[i + 1].x, pts[i + 2].z - pts[i + 1].z) - Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z)))) : 0;
        expect(turn).toBeLessThan(0.25); // no kinks: corners are arcs
      }
    }
    // The outer track runs 2.2 m outside the south leg's centre line (the proof stretch's rails).
    const p = loopTrack(EL.track)[0];
    expect(p.z).toBeCloseTo(EL.loop.maxZ + EL.track, 6);
    expect(pathTable(loopTrack(EL.track)).length).toBeGreaterThan(pathTable(loopTrack(-EL.track)).length);
  });
  it('every station stair lands on a block sidewalk, never in a road', () => {
    for (const st of EL_STATIONS) {
      for (const s of st.stairs) {
        const n = Math.ceil((EL.platformTop - 0.15) / 0.3);
        const foot = st.along === 'x' ? st.x + s.top + s.dir * n * 0.4 : st.z + s.top + s.dir * n * 0.4;
        const head = st.along === 'x' ? st.x + s.top : st.z + s.top;
        const lat = (st.along === 'x' ? st.z : st.x) + s.side * (EL.platformOut + 1.85);
        for (const t of [head, foot]) {
          const [x, z] = st.along === 'x' ? [t, lat] : [lat, t];
          const inBlock = LOOP_COLUMNS.some((c) => x >= c.x0 && x <= c.x1) && (LOOP_ROWS.some((r) => z >= r.z0 && z <= r.z1) || (z >= -352 && z <= -306));
          expect(inBlock, `${st.id} stair at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBe(true);
        }
      }
    }
  });
  it('exports the West Line for the western districts', () => {
    const w = westLineData();
    expect(w.z).toBe(EL.westLine.z);
    expect(w.railTop).toBe(EL_CAR.railTopY);
    expect(w.builtToX).toBe(LOOP.minX);
    expect(w.stations.length).toBeGreaterThanOrEqual(2);
    expect(w.planned.length).toBeGreaterThanOrEqual(3);
  });
});

describe('El timetable (pure)', () => {
  const pitch = EL_CAR.length + EL_CAR.coupleGap;
  it('a Loop train stands at every station for the dwell, centred on it', () => {
    const [def] = trainDefs({ perTrack: 1 });
    const len = 4 * pitch - EL_CAR.coupleGap;
    const S = createSchedule({ length: def.table.length, stops: def.stops.map((s) => s + len / 2), closed: true });
    const seen = new Set();
    const o = {};
    for (let t = 0; t < S.cycle; t += 0.25) {
      S.at(t, o);
      expect(o.v).toBeLessThanOrEqual(EL_TIMING.vmax + 1e-9);
      if (o.stopped) {
        const centre = o.s - len / 2;
        const k = def.stops.findIndex((s) => Math.abs(((centre - s) % def.table.length + def.table.length) % def.table.length) < 0.01);
        if (k >= 0) seen.add(k);
      }
    }
    expect(seen.size).toBe(def.stops.length);
  });
  it('two trains on one track, half a cycle apart, never close up', () => {
    const defs = trainDefs({ perTrack: 2 }).filter((d) => d.id.startsWith('loopOuter'));
    const len = 4 * pitch;
    const S = createSchedule({ length: defs[0].table.length, stops: defs[0].stops.map((s) => s + len / 2), closed: true });
    const a = {}, b = {};
    let min = Infinity;
    for (let t = 0; t < S.cycle; t += 0.5) {
      S.at(t, a); S.at(t + S.cycle / 2, b);
      const gap = ((a.s - b.s) % S.length + S.length) % S.length;
      min = Math.min(min, gap, S.length - gap);
    }
    expect(min).toBeGreaterThan(len + 20);
  });
  it('a shuttle runs end to end and back, standing at both ends', () => {
    const S = createSchedule({ length: 100, closed: false });
    const o = {};
    let sawEnd = false, sawStart = false, back = false;
    for (let t = 0; t < S.cycle; t += 0.25) {
      S.at(t, o);
      expect(o.s).toBeGreaterThanOrEqual(-1e-9);
      expect(o.s).toBeLessThanOrEqual(100 + 1e-9);
      if (o.stopped && o.s > 99.9) sawEnd = true;
      if (o.stopped && o.s < 0.1) sawStart = true;
      if (o.dir < 0 && o.v > 1) back = true;
    }
    expect(sawEnd && sawStart && back).toBe(true);
  });
});

describe('Loop and Gotham Mile: data and street graph', () => {
  it('districts, sites and crime spots', () => {
    expect(districtAt(0, -449)).toBe('loop');
    expect(districtAt(150, -700)).toBe('gothamMile');
    expect(REGIONS.find((r) => r.id === 'gothamMile')).toBeTruthy();
    const mine = REGION_CRIME_SPOTS.filter((s) => s.district === 'loop' || s.district === 'gothamMile');
    expect(mine.length).toBeGreaterThanOrEqual(16);
    expect(new Set(REGION_CRIME_SPOTS.map((s) => s.id)).size).toBe(REGION_CRIME_SPOTS.length);
    const fast = Object.entries(REGION_SITES).filter(([, s]) => s.kind === 'fastTravel');
    expect(fast.length).toBeGreaterThanOrEqual(EL_STATIONS.length);
    for (const k of ['wayneTowerLobby', 'wayneTowerRoof', 'icebergDoor', 'icebergRoof', 'pumpingTowerTop', 'oldChurchBelfry']) expect(REGION_SITES[k], k).toBeTruthy();
  });
  it('routes reach the Loop and the Mile from the old city, over the bridges', () => {
    const g = buildStreetGraph();
    for (const to of [{ x: 0, z: -449 }, { x: -150, z: -539 }, { x: 150, z: -773 }, { x: -30, z: -713 }, { x: 236, z: -593 }]) {
      const r = g.routeBetween({ x: 0, y: 0, z: 0 }, { ...to, y: 0 });
      expect(r, `${to.x},${to.z}`).toBeTruthy();
      expect(r.edges.some((e) => g.edges[e].bridge)).toBe(true);
    }
  });
  it('offers boundary edges where the neighbours attach', () => {
    const g = buildStreetGraph();
    const at = (x, z) => g.nodes.some((n) => n.deck === 'street' && Math.abs(n.x - x) < 0.5 && Math.abs(n.z - z) < 0.5);
    for (const z of [-419, -479, -539, -593]) { expect(at(LOOP.minX, z)).toBe(true); expect(at(LOOP.maxX, z)).toBe(true); }
    for (const x of [-210, -150, -90]) expect(at(x, LOOP.minZ)).toBe(true);
    for (const x of [...MILE.xLines, MILE.boulevardX]) expect(at(x, MILE.minZ)).toBe(true);
    for (const z of [-653, -713, -773]) { expect(at(MILE.minX, z)).toBe(true); expect(at(MILE.maxX, z)).toBe(true); }
  });
});

let city;
beforeAll(async () => { city = await buildCoreCityHeadless(); }, 120000);

describe('Loop and Gotham Mile: collision', () => {
  it('on foot up the canyon from the El street to the Exchange', () => {
    const r = walk(city.collision, { x: -146, y: 0, z: -362 }, { x: -146, z: -545 });
    expect(r.walls).toBe(0);
    expect(r.minY).toBeGreaterThan(-0.1);
  });
  it('a car-sized body drives the traffic lanes under the El and down the Mile boulevard', () => {
    // Traffic keeps left 3 m off the centre line (cityLife regionLoops): both lanes of each street.
    for (const [a, b] of [
      [{ x: -93, y: 0, z: -362 }, { x: -93, z: -590 }], [{ x: -87, y: 0, z: -590 }, { x: -87, z: -362 }],
      [{ x: 93, y: 0, z: -362 }, { x: 93, z: -590 }], [{ x: 87, y: 0, z: -590 }, { x: 87, z: -362 }],
      [{ x: -262, y: 0, z: -536 }, { x: 232, z: -536 }], [{ x: 232, y: 0, z: -542 }, { x: -262, z: -542 }],
      [{ x: -262, y: 0, z: -482 }, { x: 232, z: -482 }], [{ x: -150 + 3, y: 0, z: -362 }, { x: -150 + 3, z: -536 }],
      [{ x: 150 - 9, y: 0, z: -596 }, { x: 150 - 9, z: -776 }], [{ x: 150 + 9, y: 0, z: -776 }, { x: 150 + 9, z: -596 }],
      [{ x: -36, y: 0, z: -710 }, { x: 232, z: -710 }],
    ]) {
      const r = walk(city.collision, a, b, { radius: 1.0, height: 1.6 });
      expect(r.walls, `${a.x},${a.z} -> ${b.x},${b.z}`).toBe(0);
      expect(r.maxY).toBeLessThan(0.3);
    }
  });
  it('up an El station stair onto the platform', () => {
    // Lafayette, south side: the stair runs from the platform (x 10) east down to the sidewalk.
    const st = EL_STATIONS.find((s) => s.id === 'elLafayette');
    const z = st.z + EL.platformOut + 1.85;
    const r = walk(city.collision, { x: 23.5, y: 0.15, z }, { x: 9, z }, { step: 0.1 });
    expect(r.walls).toBe(0);
    expect(r.p.y).toBeCloseTo(EL.platformTop, 2);
    // and across the landing onto the platform
    const r2 = walk(city.collision, { ...r.p }, { x: r.p.x, z: st.z + 4.6 }, { step: 0.1 });
    expect(r2.p.y).toBeCloseTo(EL.platformTop, 2);
  });
  it('the region has grapple points, gargoyle perches, ladders and zip lines', () => {
    const loop = city.regionCtx.loop, mile = city.regionCtx.gothamMile;
    expect(loop.grappleEnd - loop.grappleStart).toBeGreaterThan(800);
    expect(mile.grappleEnd - mile.grappleStart).toBeGreaterThan(250);
    const mine = city.ctx.grapple.slice(loop.grappleStart, mile.grappleEnd);
    expect(mine.filter((p) => p.gargoyle).length).toBeGreaterThan(30);
    expect(mine.some((p) => p.y > 160)).toBe(true); // Wayne Tower's crown
    expect(city.ctx.climbables.ziplines.length).toBeGreaterThan(8 + 6);
  });
});

describe('the El trains: moving collision you can ride', () => {
  it('carry a body standing on a roof and one standing inside', () => {
    const el = city.ctx.world.el;
    const T = el.trains.find((t) => t.def.id === 'loopOuter0');
    const S = T.schedule;
    // A time when the train is running at speed on a straight.
    const o = {};
    let t = 0;
    for (; t < S.cycle; t += 0.5) { S.at(t, o); if (o.v > 11) break; }
    el.update(t);
    const car = T.cars[1];
    const roof = { x: car.x, y: car.y + EL_CAR.roofY + 0.3, z: car.z };
    const floor = { x: car.x + Math.sin(car.yaw) * 1, y: car.y + EL_CAR.floorY + 0.2, z: car.z + Math.cos(car.yaw) * 1 };
    for (const p of [roof, floor]) {
      const r = city.collision.resolveCylinder(p, 0.35, 1.8, { prevY: p.y });
      p.y = r.groundY; // fall onto it
      city.collision.resolveCylinder(p, 0.35, 1.8, { prevY: p.y });
    }
    expect(roof.y).toBeCloseTo(car.y + EL_CAR.roofY, 3);
    expect(floor.y).toBeCloseTo(car.y + EL_CAR.floorY, 3);
    const before = { rx: roof.x - car.x, rz: roof.z - car.z, fx: floor.x - car.x, fz: floor.z - car.z, cx: car.x, cz: car.z };
    el.update(t + 0.5);
    expect(Math.hypot(car.x - before.cx, car.z - before.cz)).toBeGreaterThan(4);
    expect(roof.x - car.x).toBeCloseTo(before.rx, 3);
    expect(roof.z - car.z).toBeCloseTo(before.rz, 3);
    expect(floor.x - car.x).toBeCloseTo(before.fx, 3);
    expect(floor.z - car.z).toBeCloseTo(before.fz, 3);
    // Still standing after the move (the boxes went with the train).
    expect(city.collision.groundBelow(roof.x, roof.y + 0.1, roof.z, 0.2)).toBeCloseTo(roof.y, 3);
  });
  it('the shell keeps a body on the track bed out of the car', () => {
    const el = city.ctx.world.el;
    const T = el.trains[0];
    el.update(3);
    const car = T.cars[0];
    // Beside the car at window height, pushed toward its centre: the wall stops it.
    const side = { x: car.x + Math.cos(car.yaw) * 1.9, y: car.y + 1.2, z: car.z - Math.sin(car.yaw) * 1.9 };
    const target = { x: car.x, z: car.z };
    const r = walk(city.collision, side, target, { step: 0.05 });
    expect(r.walls).toBeGreaterThan(0);
  });
});
