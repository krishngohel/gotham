import { describe, it, expect } from 'vitest';
import { createStreetGraph } from '../../src/world/streetGraph.js';
import { buildStreetGraph } from '../../src/world/regions/streets.js';
import { createEdgeIndex, snapToRoad, predictRoute, roadblockSpots, spikeSpot, spawnSpot } from '../../src/wanted/placement.js';
import { capsFor, unitBudget, tierIndexOf } from '../../src/wanted/caps.js';
import { TIERS, getQuality } from '../../src/render/quality.js';

// A 6 x 6 grid of 60 m blocks on the street deck, plus a lower deck under row z=120 (like Lower
// Gotham) and a footpath and a bridge span.
function grid() {
  const g = createStreetGraph();
  const n = (x, z, deck = 'street', y = 0) => g.addNode(x, z, { deck, y });
  for (let i = 0; i <= 5; i++) for (let j = 0; j <= 5; j++) {
    if (i < 5) g.addEdge(n(i * 60, j * 60), n((i + 1) * 60, j * 60), { width: 14, lanes: 2 });
    if (j < 5) g.addEdge(n(i * 60, j * 60), n(i * 60, (j + 1) * 60), { width: 14, lanes: 2 });
  }
  for (let i = 0; i < 5; i++) g.addEdge(n(i * 60, 120, 'lower', -5.5), n((i + 1) * 60, 120, 'lower', -5.5), { width: 12, lanes: 2 });
  g.addEdge(n(0, 360), n(60, 360), { lanes: 0, kind: 'walk', deck: 'walk' });
  return g;
}

describe('placement on the street graph', () => {
  const g = grid();
  const idx = createEdgeIndex(g);

  it('snaps to the hero\'s own deck', () => {
    const top = snapToRoad(idx, 130, 0, 121);
    const low = snapToRoad(idx, 130, -5.5, 121);
    expect(g.edges[top.edge].deck).toBe('street');
    expect(g.edges[low.edge].deck).toBe('lower');
  });
  it('predicts the straightest road ahead', () => {
    const r = predictRoute(idx, { x: 30, y: 0, z: 0 }, { x: 1, z: 0 }, 200);
    expect(r).toBeTruthy();
    // Heading east along z = 0: every point stays on that street.
    for (const p of r.points) expect(Math.abs(p.z)).toBeLessThan(1e-6);
    expect(r.points[r.points.length - 1].x).toBeGreaterThan(200);
    expect(r.junctions.length).toBeGreaterThan(1);
  });
  it('places roadblocks ahead of the hero, at junction mouths, facing him', () => {
    const route = predictRoute(idx, { x: 30, y: 0, z: 60 }, { x: 1, z: 0 }, 220);
    const spots = roadblockSpots(idx, route, { count: 2, minAhead: 60, maxAhead: 200 });
    expect(spots.length).toBe(2);
    for (const s of spots) {
      expect(s.x).toBeGreaterThan(30 + 40); // ahead, not behind
      expect(Math.abs(s.z - 60)).toBeLessThan(1e-6);
      // Faces west (back toward the hero coming from the west): yaw -PI/2.
      expect(Math.sin(s.yaw)).toBeLessThan(-0.99);
      expect(s.deck).toBe('street');
    }
  });
  it('never places one inside a building (okAt rejects) or on another deck', () => {
    const route = predictRoute(idx, { x: 30, y: 0, z: 60 }, { x: 1, z: 0 }, 220);
    const building = { minX: 100, maxX: 130, minZ: 40, maxZ: 80 };
    const okAt = (x, y, z) => !(x > building.minX && x < building.maxX && z > building.minZ && z < building.maxZ);
    const spots = roadblockSpots(idx, route, { count: 3, minAhead: 40, maxAhead: 260, okAt });
    for (const s of spots) expect(okAt(s.x, s.y, s.z)).toBe(true);
    const low = predictRoute(idx, { x: 30, y: -5.5, z: 120 }, { x: 1, z: 0 }, 220);
    for (const s of roadblockSpots(idx, low, { count: 3, minAhead: 20, maxAhead: 260 })) expect(s.deck).toBe('lower');
  });
  it('never on a bridge span', () => {
    const b = createStreetGraph();
    const n = (x, z) => b.addNode(x, z);
    b.addEdge(n(0, 0), n(60, 0)); b.addEdge(n(60, 0), n(120, 0), { bridge: 'bridgeX' }); b.addEdge(n(120, 0), n(180, 0));
    b.addEdge(n(120, 0), n(120, 60)); b.addEdge(n(120, 0), n(120, -60)); b.addEdge(n(60, 0), n(60, 60)); b.addEdge(n(60, 0), n(60, -60));
    const bi = createEdgeIndex(b);
    const r = predictRoute(bi, { x: 10, y: 0, z: 0 }, { x: 1, z: 0 }, 200);
    const spots = roadblockSpots(bi, r, { count: 3, minAhead: 20, maxAhead: 200 });
    for (const s of spots) expect(b.edges[s.edge].bridge).toBeNull();
  });
  it('puts spike strips mid-block ahead', () => {
    const route = predictRoute(idx, { x: 0, y: 0, z: 180 }, { x: 1, z: 0 }, 200);
    const s = spikeSpot(idx, route, { minAhead: 40, maxAhead: 120 });
    expect(s).toBeTruthy();
    expect(s.x).toBeGreaterThan(30);
    expect(s.x % 60).not.toBe(0); // mid-block, not at a junction
  });
  it('spawns units out of sight, at range, facing the target', () => {
    let k = 0;
    const rnd = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
    const target = { x: 150, z: 150 };
    const visible = (x) => x > 150; // everything east of the target is in view
    const s = spawnSpot(idx, target, { min: 60, max: 140, visible, rnd });
    expect(s).toBeTruthy();
    expect(s.x).toBeLessThanOrEqual(150);
    const d = Math.hypot(s.x - 150, s.z - 150);
    expect(d).toBeGreaterThanOrEqual(60);
    expect(d).toBeLessThanOrEqual(140);
    // Heading points toward the target (or along the road that leads there).
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    expect(fx * (150 - s.x) + fz * (150 - s.z)).toBeGreaterThanOrEqual(-1e-6);
  });
  it('works on the real city graph: roadblocks ahead in the Loop are on drivable streets', () => {
    const city = buildStreetGraph();
    const ci = createEdgeIndex(city);
    const route = predictRoute(ci, { x: 30, y: 0, z: -400 }, { x: 0, z: -1 }, 250);
    expect(route).toBeTruthy();
    const spots = roadblockSpots(ci, route, { count: 2, minAhead: 50, maxAhead: 240 });
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) {
      const e = city.edges[s.edge];
      expect(e.lanes).toBeGreaterThan(0);
      expect(e.bridge ?? null).toBeNull();
      expect(s.z).toBeLessThan(-400);
    }
  });
});

describe('caps by quality tier', () => {
  it('reads the tier from flags, not the name', () => {
    expect(tierIndexOf(getQuality('potato'))).toBe(0);
    expect(tierIndexOf(getQuality('ultra'))).toBe(4);
  });
  it('potato: at most 2 cruisers and 3 officers, no light cone mesh; ultra: 6 vehicles, 10 officers', () => {
    const p = capsFor(getQuality('potato'));
    expect(p.cruisers).toBeLessThanOrEqual(2);
    expect(p.officers).toBeLessThanOrEqual(3);
    expect(p.heliCone).toBe(false);
    const u = capsFor(getQuality('ultra'));
    expect(u.vehicles).toBe(6);
    expect(u.officers).toBe(10);
    expect(u.heliCone).toBe(true);
  });
  it('the level\'s wish never exceeds the caps on any tier', () => {
    for (const t of TIERS) {
      const caps = capsFor(getQuality(t));
      for (let lv = 0; lv <= 5; lv++) for (const units of [-1, 0, 2]) for (const split of [false, true]) {
        const b = unitBudget(lv, caps, { units, split });
        expect(b.cruisers + b.vans).toBeLessThanOrEqual(caps.vehicles);
        expect(b.officers).toBeLessThanOrEqual(caps.officers);
        expect(b.roadblocks).toBeLessThanOrEqual(caps.roadblocks);
        if (lv === 0) expect(b.cruisers + b.officers).toBe(0);
      }
    }
  });
  it('the helicopter comes at level 4', () => {
    const caps = capsFor(getQuality('high'));
    expect(unitBudget(3, caps).heli).toBe(false);
    expect(unitBudget(4, caps).heli).toBe(true);
  });
});
