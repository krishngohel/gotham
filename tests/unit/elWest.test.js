// [polish2] The El West Line beyond the Loop (x -266 west to the Park Row terminus): the deck is
// one continuous walkable surface, both new stations can be reached on foot up their stairs,
// nothing else stands in the stairs' way, the street under the structure stays drivable, and the
// shuttle trains stand centred on every station of the line.
import { describe, it, expect, beforeAll } from 'vitest';
import { buildCoreCityHeadless } from './helpers/headlessCity.js';
import { EL, EL_STATIONS, EL_WEST_STATIONS, westLineData } from '../../src/world/regions/loopLayout.js';
import { WEST } from '../../src/world/regions/westLayout.js';
import { trainDefs } from '../../src/world/regions/el.js';
import { EL_CAR } from '../../src/vehicles/models/elTrain.js';

// Walks a cylinder through the real collision the way hero.js integrates (see loopRegion.test.js).
function walk(collision, from, to, { radius = 0.35, height = 1.8, step = 0.1 } = {}) {
  const p = { ...from };
  const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz);
  const n = Math.ceil(L / step);
  let walls = 0, maxY = -Infinity;
  for (let i = 1; i <= n; i++) {
    const prevY = p.y;
    p.x = from.x + (dx * i) / n; p.z = from.z + (dz * i) / n;
    const r = collision.resolveCylinder(p, radius, height, { prevY });
    if (r.hitWall) walls++;
    if (r.groundY > -Infinity && p.y > r.groundY) p.y = r.groundY;
    if (r.groundY === -Infinity) { p.y = -Infinity; break; }
    maxY = Math.max(maxY, p.y);
  }
  return { p, walls, maxY };
}

let city;
beforeAll(async () => { city = await buildCoreCityHeadless(); }, 120000);

describe('El West Line beyond the Loop', () => {
  it('the layout agrees with the western districts\' reserved corridor', () => {
    const w = westLineData();
    expect(w.z).toBe(WEST.el.z);
    expect(EL_WEST_STATIONS.map((s) => s.x)).toEqual(WEST.el.stations.map((s) => s.x));
    expect(EL_WEST_STATIONS.map((s) => s.id)).toEqual(WEST.el.stations.map((s) => s.id));
    expect(w.deckWestX).toBeGreaterThanOrEqual(WEST.el.minX);
    expect(w.trackWestX).toBeGreaterThan(w.deckWestX);
    // Platforms and stairs stay inside the station plots.
    for (const st of EL_WEST_STATIONS) {
      const plot = WEST.el.stations.find((s) => s.id === st.id);
      expect(st.x - EL.platformLen / 2).toBeGreaterThanOrEqual(plot.minX);
      expect(st.x + EL.platformLen / 2).toBeLessThanOrEqual(plot.maxX);
      expect(st.z - EL.platformOut - 2.8).toBeGreaterThanOrEqual(plot.minZ);
      expect(st.z + EL.platformOut + 2.8).toBeLessThanOrEqual(plot.maxZ);
    }
  });

  it('the deck is one walkable surface from the Loop to the terminus', () => {
    const top = EL.deckTop + 0.16;
    for (let x = EL.westLine.deckWestX + 1; x <= EL.westLine.eastX; x += 2) {
      for (const dz of [-3.5, 0, 3.5]) {
        expect(city.collision.groundBelow(x, top + 1, EL.westLine.z + dz, 0.2), `x ${x} dz ${dz}`).toBeCloseTo(top, 2);
      }
    }
    // It ends at the terminus: open street beyond it.
    expect(city.collision.groundBelow(EL.westLine.deckWestX - 3, top + 1, EL.westLine.z, 0.2)).toBeLessThan(1);
  });

  it('both stations: up each stair from the sidewalk, across the landing, onto the platform', () => {
    const n = Math.ceil((EL.platformTop - 0.15) / 0.3), run = n * 0.4;
    for (const st of EL_WEST_STATIONS) {
      for (const sd of st.stairs) {
        const z = st.z + sd.side * (EL.platformOut + 1.85);
        const head = st.x + sd.top, foot = head + sd.dir * (run + 1.2);
        const r = walk(city.collision, { x: foot, y: 0.15, z }, { x: head - sd.dir * 1.1, z });
        expect(r.walls, `${st.id} side ${sd.side}`).toBe(0);
        expect(r.p.y, `${st.id} side ${sd.side}`).toBeCloseTo(EL.platformTop, 2);
        const r2 = walk(city.collision, { ...r.p }, { x: r.p.x, z: st.z + sd.side * 4.6 });
        expect(r2.p.y, `${st.id} side ${sd.side} platform`).toBeCloseTo(EL.platformTop, 2);
        // The sidewalk at the foot is clear ground a body can walk off along.
        const r3 = walk(city.collision, { x: foot, y: 0.15, z }, { x: foot + sd.dir * 3, z });
        expect(r3.walls, `${st.id} side ${sd.side} foot`).toBe(0);
      }
    }
  });

  it('the street under the structure stays drivable between the column lines', () => {
    for (const dz of [-3.2, 3.2]) {
      const z = EL.westLine.z + dz;
      const r = walk(city.collision, { x: -262, y: 0, z }, { x: -566, z }, { radius: 1.0, height: 1.6, step: 0.25 });
      expect(r.walls, `lane ${dz}`).toBe(0);
      expect(r.maxY).toBeLessThan(0.3);
    }
    // And the cross streets pass under it without meeting a column (kerb to kerb of the El's
    // street: the cross streets' own parked cars stand beyond it).
    for (const x of [-310, -370, -421, -460, -520]) {
      for (const dx of [-3.2, 3.2]) {
        const r = walk(city.collision, { x: x + dx, y: 0, z: -471 }, { x: x + dx, z: -487 }, { radius: 1.0, height: 1.6, step: 0.25 });
        expect(r.walls, `cross ${x}`).toBe(0);
      }
    }
  });

  it('the shuttles stand centred on every station of the line', () => {
    const pitch = EL_CAR.length + EL_CAR.coupleGap, len = 4 * pitch - EL_CAR.coupleGap;
    const stations = [...EL_STATIONS.filter((s) => s.line === 'west'), ...EL_WEST_STATIONS];
    const el = city.ctx.world.el;
    for (const id of ['westNorth', 'westSouth']) {
      const def = trainDefs({ perTrack: 1 }).find((d) => d.id === id);
      expect(def.table.pts[0].x).toBe(EL.westLine.trackWestX);
      const T = el.trains.find((t) => t.def.id === id);
      const seen = new Set();
      const o = {};
      for (let t = 0; t < T.schedule.cycle; t += 0.5) {
        T.schedule.at(t, o);
        if (!o.stopped || o.v > 0) continue;
        const centre = EL.westLine.trackWestX + o.s + len / 2;
        const st = stations.find((s) => Math.abs(s.x - centre) < 1.5);
        expect(st, `${id} stands at x ${centre.toFixed(1)}`).toBeTruthy();
        seen.add(st.id);
      }
      expect([...seen].sort()).toEqual(stations.map((s) => s.id).sort());
    }
  });

  it('the low tiers run one short shuttle (the perf budget for the Narrows and Park Row views)', () => {
    const lite = trainDefs({ perTrack: 1, west: { trains: 1, cars: 2 } }).filter((d) => !d.closed);
    expect(lite.map((d) => [d.id, d.cars])).toEqual([['westNorth', 2]]);
    const full = trainDefs({ perTrack: 1 }).filter((d) => !d.closed);
    expect(full.map((d) => [d.id, d.cars])).toEqual([['westNorth', 4], ['westSouth', 4]]);
  });
});
