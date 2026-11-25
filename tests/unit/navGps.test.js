// Workstream L2: the GPS (routes, reroutes off-route and around raised bridges, turns) and the
// route ribbon's geometry, checked against the real built city: the strip stays on the road
// surface (upper deck, ramps, lower deck, bridges) within a few centimetres.
import { describe, it, expect, beforeAll } from 'vitest';
import { buildStreetGraph } from '../../src/world/regions/streets.js';
import { createGps, projectOnPolyline, cumulative, routeTurns, GPS } from '../../src/nav/gps.js';
import { createRibbonBuffers, fillRibbon, ribbonWindow, laneFor, RIBBON } from '../../src/nav/ribbonGeometry.js';
import { buildCoreCityHeadless } from './helpers/headlessCity.js';

const graph = buildStreetGraph();

describe('gps', () => {
  it('projects onto a polyline and finds turns (right and left on a north-up map)', () => {
    const pts = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 200, z: 100 }];
    const cum = cumulative(pts);
    expect(cum[3]).toBe(300);
    const p = projectOnPolyline(pts, cum, 50, 7);
    expect(p.s).toBeCloseTo(50, 6); expect(p.d).toBeCloseTo(7, 6);
    const turns = routeTurns(pts, cum);
    expect(turns.map((t) => t.dir)).toEqual(['right', 'left']); // east then south: right; south then east: left
    expect(turns[0].s).toBe(100);
  });
  it('routes to a target, keeps the route while on it, and reroutes after leaving it', () => {
    const gps = createGps({ graph });
    const target = { x: 150, y: 0, z: -770 };
    let st = gps.update(0, { x: -146, y: 0, z: -222 }, target, 0.016);
    expect(st.route).toBeTruthy();
    expect(st.reason).toBe('target');
    const v = st.version;
    // Driving along it: no reroute.
    const mid = st.route.points[2];
    for (let i = 0; i < 100; i++) st = gps.update(0, mid, target, 0.05);
    expect(st.version).toBe(v);
    expect(st.off).toBeLessThan(1);
    // Off the route (a block over) for longer than offRouteTime: a reroute.
    const off = { x: mid.x + 45, y: 0, z: mid.z + 45 };
    for (let i = 0; i < Math.ceil((GPS.offRouteTime + GPS.minGap) / 0.05) + 2; i++) st = gps.update(0, off, target, 0.05);
    expect(st.version).toBeGreaterThan(v);
    expect(st.reason).toBe('offRoute');
    // The new route starts near where the player is now.
    expect(Math.hypot(st.route.points[0].x - off.x, st.route.points[0].z - off.z)).toBeLessThan(40);
    // A new target reroutes at once; no target clears.
    st = gps.update(0, off, { x: 0, y: 0, z: -426 }, 0.016);
    expect(st.reason).toBe('target');
    st = gps.update(0, off, null, 0.016);
    expect(st.route).toBe(null);
  });
  it('reroutes around a bascule bridge that goes up while the route crosses it', () => {
    const up = new Set();
    const blocked = (e) => !!(e.bridge && up.has(e.bridge));
    const gps = createGps({ graph, blocked });
    const from = { x: -30, y: 0, z: -200 }, to = { x: -30, y: 0, z: -330 };
    let st = gps.update(0, from, to, 0.016);
    const crosses = (r) => r.edges.map((id) => graph.edges[id].bridge).filter(Boolean);
    expect(crosses(st.route)).toContain('bridgeE');
    up.add('bridgeE');
    for (let i = 0; i < 20; i++) st = gps.update(0, from, to, 0.05);
    expect(st.reason).toBe('blocked');
    expect(crosses(st.route)).not.toContain('bridgeE');
    expect(st.route.length).toBeGreaterThan(130);
  });
  it('keeps one route per player', () => {
    const gps = createGps({ graph });
    gps.update(0, { x: 0, y: 0, z: -30 }, { x: 0, y: 0, z: -426 }, 0.016);
    gps.update(1, { x: 0, y: 0, z: -30 }, { x: 150, y: 0, z: -770 }, 0.016);
    expect(gps.stateOf(0).route.length).toBeLessThan(gps.stateOf(1).route.length);
  });
});

describe('route ribbon geometry', () => {
  it('lays a strip in the left lane, with chevrons at turns, inside its window', () => {
    const pts = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -100 }, { x: 100, y: 0, z: -100 }];
    const cum = cumulative(pts);
    const buf = createRibbonBuffers();
    const n = fillRibbon(buf, pts, cum, 0, 200, { turns: routeTurns(pts, cum), widthOf: () => 14 });
    expect(n).toBe(buf.count);
    expect(n % 3).toBe(0);
    expect(n).toBeLessThanOrEqual(buf.maxVerts);
    // Heading north (-z): left of travel is west (-x). Strip centre sits laneFor(14) to the west.
    const strip = [];
    for (let v = 0; v < n; v++) if (buf.info[v * 3 + 2] === 0) strip.push({ x: buf.position[v * 3], y: buf.position[v * 3 + 1], z: buf.position[v * 3 + 2], s: buf.info[v * 3] });
    const firstLeg = strip.filter((p) => p.s < 90);
    const meanX = firstLeg.reduce((a, p) => a + p.x, 0) / firstLeg.length;
    expect(meanX).toBeCloseTo(-laneFor(14), 1);
    for (const p of strip) expect(p.y).toBeCloseTo(RIBBON.lift, 6);
    expect([...buf.info].filter((_, i) => i % 3 === 2 && buf.info[i] === 1).length).toBeGreaterThan(0);
    // A window: nothing outside [s0, s1].
    fillRibbon(buf, pts, cum, 50, 120, {});
    for (let v = 0; v < buf.count; v++) { expect(buf.info[v * 3]).toBeGreaterThanOrEqual(50 - 1e-3); expect(buf.info[v * 3]).toBeLessThanOrEqual(120 + 1e-3); }
    expect(ribbonWindow(10, 1000)).toEqual([0, 10 + RIBBON.ahead]);
    expect(fillRibbon(buf, [pts[0]], cumulative([pts[0]]), 0, 10)).toBe(0);
  });
  it('allocates nothing when refilled (same arrays)', () => {
    const pts = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -400 }];
    const buf = createRibbonBuffers();
    const P = buf.position;
    fillRibbon(buf, pts, cumulative(pts), 0, 300, {});
    fillRibbon(buf, pts, cumulative(pts), 100, 400, {});
    expect(buf.position).toBe(P);
    expect(buf.samples).toBeLessThanOrEqual(buf.maxSamples);
  });

  describe('on the real city', () => {
    let city;
    beforeAll(async () => { city = await buildCoreCityHeadless(); }, 120000);
    // Every strip vertex sits on a surface: within tol above the ground directly below it.
    function check(route, s0, s1) {
      const groundAt = (x, y, z) => city.collision.groundBelow(x, y, z, 0.2);
      const cum = cumulative(route.points);
      const buf = createRibbonBuffers();
      fillRibbon(buf, route.points, cum, s0, s1 ?? cum[cum.length - 1], { groundAt, widthOf: (i) => graph.edges[route.edges[Math.min(i, route.edges.length - 1)]]?.width ?? 14 });
      // The strip's centre line: every sample on the surface.
      let worst = 0, minY = Infinity;
      for (let k = 0; k < buf.samples; k++) {
        const g = city.collision.groundBelow(buf.sx[k], buf.sy[k] + 0.05, buf.sz[k], 0.05);
        worst = Math.max(worst, Math.abs(buf.sy[k] - RIBBON.lift - g));
        minY = Math.min(minY, buf.sy[k]);
      }
      // Its edges (1.1 m either side): on the surface too, but for a corner's tip at a deck end.
      let count = 0, edgeOk = 0;
      for (let v = 0; v < buf.count; v++) {
        if (buf.info[v * 3 + 2] !== 0) continue;
        const x = buf.position[v * 3], y = buf.position[v * 3 + 1], z = buf.position[v * 3 + 2];
        const g = city.collision.groundBelow(x, y + 0.05, z, 0.05);
        if (Math.abs(y - RIBBON.lift - g) < 0.35) edgeOk++;
        count++;
      }
      return { worst, count, minY, edges: edgeOk / count, samples: buf.samples };
    }
    it('stays on the road from the old city over a bridge, down the ramp and along the lower deck', () => {
      city.ctx.world.bridges.hold('bridgeE', 'down'); city.ctx.world.bridges.hold('bridgeW', 'down');
      city.ctx.world.bridges.update(0);
      const route = graph.routeBetween({ x: -30, y: 0, z: -150 }, { x: 100, y: -5.5, z: -291 });
      expect(route).toBeTruthy();
      expect(route.edges.some((id) => graph.edges[id].deck === 'lower')).toBe(true);
      expect(route.edges.some((id) => graph.edges[id].bridge)).toBe(true);
      const r = check(route, 0);
      expect(r.count).toBeGreaterThan(60);
      expect(r.minY).toBeLessThan(-5); // it really is down on the lower deck
      expect(r.worst).toBeLessThan(0.35);
      expect(r.edges).toBeGreaterThan(0.97);
    }, 60000);
    it('stays on the road through the Loop', () => {
      const route = graph.routeBetween({ x: -146, y: 0, z: -330 }, { x: 150, y: 0, z: -560 });
      const r = check(route, 0);
      expect(r.count).toBeGreaterThan(60);
      expect(r.worst).toBeLessThan(0.35);
      expect(r.edges).toBeGreaterThan(0.97);
    }, 60000);
  });
});
