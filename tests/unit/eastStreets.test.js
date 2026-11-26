import { describe, it, expect } from 'vitest';
import { buildStreetGraph } from '../../src/world/regions/streets.js';
import { EAST, lsdLine, bezier } from '../../src/world/regions/eastLayout.js';
import { EAST_TRAFFIC } from '../../src/world/regions/eastStreets.js';

// The east side joins the shared street graph: every district is reachable by road from the core
// and from the Loop, the drive is one continuous road over its viaduct, the pier is walkable.
describe('east side street graph', () => {
  const g = buildStreetGraph();
  const route = (a, b, opts) => g.routeBetween({ y: 0, ...a }, { y: 0, ...b }, opts);
  it('the drive is a continuous polyline north to south', () => {
    const pts = lsdLine();
    for (let i = 1; i < pts.length; i++) expect(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)).toBeLessThan(80);
    expect(pts[0].z).toBe(EAST.lsd.northEnd);
    expect(pts[pts.length - 1].z).toBe(EAST.lsd.southEnd);
  });
  it('bezier ends on its end points', () => {
    const b = bezier({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 1 }, { x: 3, z: 3 }, 6);
    expect(b[0]).toEqual({ x: 0, z: 0 });
    expect(b[6].x).toBeCloseTo(3); expect(b[6].z).toBeCloseTo(3);
  });
  it('core -> Robinson Park, the Museum Campus and Arkham by road', () => {
    for (const to of [{ x: 345, z: -700 }, { x: 294, z: 190 }, { x: 600, z: -80, y: EAST.arkham.plateau }, { x: 245, z: -600 }]) {
      const r = route({ x: 150, z: 30 }, to);
      expect(r, JSON.stringify(to)).toBeTruthy();
      expect(r.length).toBeLessThan(2500);
    }
  });
  it('the Loop row and Lower Gotham reach the drive without going through the core', () => {
    const r = route({ x: 150, z: -359 }, { x: 345, z: -600 }, { blocked: (e) => e.region === 'core' });
    expect(r).toBeTruthy();
    const r2 = route({ x: 360, z: -298 }, { x: 345, z: 0 }, { blocked: (e) => e.region === 'core' });
    expect(r2).toBeTruthy();
    expect(r2.edges.some((e) => g.edges[e].kind === 'drive')).toBe(true);
  });
  it('the pier is walkable from the promenade', () => {
    const a = g.nearestNode(361.5, -450, { y: 0.15, deck: 'walk' });
    const b = g.nearestNode(594, -450, { y: EAST.pier.deck, deck: 'walk' });
    expect(g.route(a, b)).toBeTruthy();
  });
  it('boundary nodes offered to the Loop builders exist on x 245', () => {
    for (const z of EAST.loopStitch) {
      const n = g.nodes[g.nearestNode(EAST.front.x, z)];
      expect(Math.abs(n.x - EAST.front.x) + Math.abs(n.z - z)).toBeLessThan(0.5);
    }
  });
  it('every traffic loop routes', () => {
    for (const def of EAST_TRAFFIC) for (let i = 0; i < def.legs.length; i++) expect(g.routeBetween(def.legs[i], def.legs[(i + 1) % def.legs.length]), def.id).toBeTruthy();
  });
});
