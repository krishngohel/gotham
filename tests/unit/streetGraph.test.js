import { describe, it, expect } from 'vitest';
import { createStreetGraph, offsetPolyline, polylineLength, pointAlong } from '../../src/world/streetGraph.js';
import { buildStreetGraph, coreTrafficLines, CORE_LINES, RIVERFRONT } from '../../src/world/regions/streets.js';
import { LINES as VEHICLE_LINES } from '../../src/vehicles/vehicles.js';

describe('street graph basics', () => {
  const g = createStreetGraph();
  // A 3 x 2 grid with one one-way edge and a "bridge".
  const n = (x, z) => g.addNode(x, z);
  g.addEdge(n(0, 0), n(60, 0)); g.addEdge(n(60, 0), n(120, 0));
  g.addEdge(n(0, 60), n(60, 60)); g.addEdge(n(60, 60), n(120, 60));
  g.addEdge(n(0, 0), n(0, 60)); g.addEdge(n(120, 0), n(120, 60));
  const bridge = g.addEdge(n(60, 0), n(60, 60), { bridge: 'b1' });
  const one = g.addEdge(n(120, 60), n(180, 60), { oneway: true });

  it('reuses nodes at the same spot', () => {
    expect(g.addNode(60.2, 0.1)).toBe(n(60, 0));
    expect(g.nodes.length).toBe(7);
  });
  it('finds the shortest route', () => {
    const r = g.route(n(60, 0), n(60, 60));
    expect(r.edges).toEqual([bridge]);
    expect(r.length).toBeCloseTo(60);
  });
  it('goes round a raised bridge', () => {
    const r = g.route(n(60, 0), n(60, 60), { blocked: (e) => e.bridge === 'b1' });
    expect(r.length).toBeCloseTo(180);
    expect(r.edges).not.toContain(bridge);
  });
  it('respects one-way edges', () => {
    expect(g.route(n(120, 60), n(180, 60)).edges).toEqual([one]);
    expect(g.route(n(180, 60), n(120, 60))).toBe(null);
  });
  it('snaps to the nearest node and edge', () => {
    expect(g.nearestNode(58, 3)).toBe(n(60, 0));
    const e = g.nearestEdge(30, 4);
    expect(e.z).toBeCloseTo(0);
    expect(e.x).toBeCloseTo(30);
    expect(e.dist).toBeCloseTo(4);
  });
  it('routes between two world points as a polyline on the road', () => {
    const r = g.routeBetween({ x: 10, z: 3 }, { x: 110, z: 58 });
    expect(r.points[0]).toMatchObject({ x: 10, z: 0 });
    expect(r.points[r.points.length - 1]).toMatchObject({ x: 110, z: 60 });
    expect(polylineLength(r.points)).toBeCloseTo(r.length, 5);
    // Every corner of the line is on a street: consecutive points share an axis.
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1], b = r.points[i];
      expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.z - b.z) < 1e-6).toBe(true);
    }
  });
  it('offsets a polyline to one side of travel', () => {
    const p = offsetPolyline([{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }], 2);
    // Heading east, right of travel is +z (south) here.
    expect(p[0]).toMatchObject({ x: 0, z: 2 });
    expect(p[1].x).toBeCloseTo(8); expect(p[1].z).toBeCloseTo(2);
    expect(p[2]).toMatchObject({ x: 8, z: 10 });
    const at = pointAlong(p, 3);
    expect(at.x).toBeCloseTo(3); expect(at.z).toBeCloseTo(2);
  });
  it('gives two sidewalk lines per edge', () => {
    const g2 = createStreetGraph();
    const e = g2.addEdge(g2.addNode(0, 0), g2.addNode(0, 50), { width: 14, sidewalk: 3 });
    const [l, r] = g2.sidewalkLines(g2.edges[e]);
    expect(Math.abs(l[0].x)).toBeCloseTo(8.5);
    expect(l[0].x).toBeCloseTo(-r[0].x);
  });
});

describe('the city street graph', () => {
  const g = buildStreetGraph();
  it('core traffic lines come from the graph and match the old hard-coded list', () => {
    const old = [-210, -150, -90, -30, 30, 90, 150, 210];
    expect(CORE_LINES).toEqual(old);
    expect(coreTrafficLines(g)).toEqual(old);
    expect(VEHICLE_LINES).toEqual(old);
  });
  it('has no street through the merged compounds', () => {
    for (const e of g.edges) {
      if (e.region !== 'core') continue;
      const A = g.nodes[e.a], B = g.nodes[e.b];
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
      const inside = (mx > 36 && mx < 204 && mz > -204 && mz < -96) || (mx > -144 && mx < -36 && mz > -204 && mz < -96);
      expect(inside, `${mx},${mz}`).toBe(false);
    }
  });
  it('drives from the GCPD over a bridge to the Loop, and on both decks of Lower Gotham', () => {
    const r = g.routeBetween({ x: -30, y: 0, z: 0 }, { x: 30, y: 0, z: -359 });
    expect(r).toBeTruthy();
    expect(r.edges.some((e) => g.edges[e].kind === 'bridge')).toBe(true);
    // Upper deck to lower deck uses a ramp.
    const down = g.routeBetween({ x: 0, y: 0, z: -291 }, { x: 0, y: -5.5, z: -291 });
    expect(down.edges.some((e) => g.edges[e].kind === 'ramp')).toBe(true);
    expect(down.points.some((p) => p.y < -5)).toBe(true);
    // With both bridges up, the only way left from the core to the Loop is the long way round over
    // Lakeshore Drive's fixed viaduct at the river mouth (workstream H2); without it, cut off.
    const round = g.routeBetween({ x: -30, y: 0, z: 0 }, { x: 30, y: 0, z: -359 }, { blocked: (e) => !!e.bridge });
    expect(round.edges.some((e) => g.edges[e].kind === 'drive')).toBe(true);
    expect(g.routeBetween({ x: -30, y: 0, z: 0 }, { x: 30, y: 0, z: -359 }, { blocked: (e) => !!e.bridge || e.kind === 'drive' })).toBe(null);
  });
  it('tells the decks apart by height', () => {
    const lower = g.nodes[g.nearestNode(30, -291, { y: -5.5 })];
    const upper = g.nodes[g.nearestNode(30, -291, { y: 0 })];
    expect(lower.deck).toBe('lower');
    expect(upper.deck).toBe('street');
    expect(g.nearestEdge(10, -291, { y: -5.5 }).y).toBeCloseTo(-5.5);
  });
  it('every bridge in the layout is in the graph', () => {
    for (const b of RIVERFRONT.bridges) expect(g.edges.some((e) => e.bridge === b.id)).toBe(true);
  });
});
