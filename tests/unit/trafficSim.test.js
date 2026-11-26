import { describe, it, expect } from 'vitest';
import { createStreetGraph } from '../../src/world/streetGraph.js';
import { buildStreetGraph } from '../../src/world/regions/streets.js';
import { createRng } from '../../src/core/rng.js';
import {
  buildLaneNetwork, createTrafficSim, pickType, signalState, SIGNAL, leanType, LEAN_TYPES, MIX_TYPES, TRAFFIC_MIX, districtGroup,
} from '../../src/world/trafficSim.js';
import { FLEET } from '../../src/vehicles/models/fleet.js';

// A plus-shaped junction at the origin with 120 m arms (region decides lights or give-way).
function plus(region = 'test') {
  const g = createStreetGraph();
  for (const [x, z] of [[-120, 0], [120, 0], [0, -120], [0, 120]]) g.addStreet([{ x, z }, { x: 0, z: 0 }], { width: 14, lanes: 2, region });
  return g;
}
const laneFrom = (sim, fx, fz) => sim.lanes.find((l) => l.from !== l.to && Math.abs(l.fx - fx) < 1e-6 && Math.abs(l.fz - fz) < 1e-6 && sim.net.deg[l.to] >= 3);
const run = (sim, secs, { t0 = 0, anchors = [{ x: 0, y: 0, z: 0 }], obstacles = [], emit = null, dt = 1 / 30, each = null } = {}) => {
  let t = t0;
  for (let k = 0; k < secs / dt; k++) { t += dt; sim.update(dt, t, anchors, anchors.length, obstacles, obstacles.length, emit); each?.(t); }
  return t;
};
const quiet = (g, extra = {}) => createTrafficSim({ graph: g, cap: 8, rng: createRng(5), spawn: { min: 5000, max: 5001, despawn: 9000 }, junctionInfo: () => ({ phase: 0, primaryAxis: 'z' }), ...extra });

describe('traffic mix', () => {
  it('every type in the mixes is a fleet vehicle', () => {
    for (const t of MIX_TYPES) expect(FLEET[t], t).toBeDefined();
    for (const t of LEAN_TYPES) expect(FLEET[t], t).toBeDefined();
  });
  it('downtown is cabs and buses, the industrial districts trucks, Bristol no buses', () => {
    const count = (d, type) => { let n = 0; for (let i = 0; i < 2000; i++) if (pickType(d, (i + 0.5) / 2000, { hour: 15 }) === type) n++; return n / 2000; };
    expect(count('loop', 'taxi')).toBeGreaterThan(0.15);
    expect(count('loop', 'bus')).toBeGreaterThan(0.04);
    expect(count('ace', 'box_truck')).toBeGreaterThan(0.15);
    expect(count('bristol', 'bus')).toBe(0);
    expect(count('bristol', 'limousine')).toBeGreaterThan(0);
    expect(count('gcpd', 'police')).toBeGreaterThan(0.02);
    expect(districtGroup('somewhereNew')).toBe('residential');
  });
  it('time of day: fewer buses at night, bin lorries before dawn', () => {
    const share = (hour, type) => { let n = 0; for (let i = 0; i < 4000; i++) if (pickType('loop', (i + 0.5) / 4000, { hour }) === type) n++; return n; };
    expect(share(23, 'bus')).toBeLessThan(share(14, 'bus'));
    expect(share(4, 'garbage_truck')).toBeGreaterThan(share(14, 'garbage_truck'));
  });
  it('the lean tiers map every type onto six', () => {
    for (const t of MIX_TYPES) expect(LEAN_TYPES).toContain(leanType(t));
    for (let i = 0; i < 200; i++) expect(LEAN_TYPES).toContain(pickType('ace', i / 200, { lean: true }));
    expect(Object.keys(TRAFFIC_MIX)).toContain('prison');
  });
});

describe('signals', () => {
  it('match the city lights: own axis green 0-5 s, amber to 6.5, crossing axis green 7-11', () => {
    expect(signalState(0, 'z', 'z', 1)).toBe(SIGNAL.GREEN);
    expect(signalState(0, 'z', 'z', 5.5)).toBe(SIGNAL.AMBER);
    expect(signalState(0, 'z', 'z', 8)).toBe(SIGNAL.RED);
    expect(signalState(0, 'z', 'x', 1)).toBe(SIGNAL.RED);
    expect(signalState(0, 'z', 'x', 8)).toBe(SIGNAL.GREEN);
    expect(signalState(0, 'z', 'x', 11.5)).toBe(SIGNAL.AMBER);
    // Never green both ways at once, at any phase and time.
    for (let p = 0; p < 1; p += 0.13) for (let t = 0; t < 30; t += 0.25) expect(signalState(p, 'z', 'x', t) === 0 && signalState(p, 'z', 'z', t) === 0).toBe(false);
  });
});

describe('lane network', () => {
  it('two lanes per two-way drivable edge, none on the river walk, all kept left', () => {
    const g = buildStreetGraph();
    const net = buildLaneNetwork(g);
    const drivable = g.edges.filter((e) => e.lanes > 0 && e.deck !== 'walk');
    expect(net.lanes.length).toBe(drivable.reduce((n, e) => n + (e.oneway ? 1 : 2), 0));
    for (const l of net.lanes) {
      const A = g.nodes[l.from];
      // Left of travel is (fz, -fx): the lane's offset from the centre line points that way.
      const ox = l.ax - A.x, oz = l.az - A.z;
      expect(ox * l.fz - oz * l.fx).toBeGreaterThan(0);
      expect(l.s1).toBeGreaterThan(l.s0);
      expect(l.reverse).toBeGreaterThanOrEqual(0);
    }
    expect(net.junctions.length).toBeGreaterThan(30);
    // The city's junctions have lights; Bristol's lanes and the causeway give way.
    for (const j of net.junctions) expect(j.signal, `${j.region} ${j.x},${j.z}`).toBe(!['bristol', 'blackgate'].includes(j.region));
    expect(net.junctions.some((j) => j.region === 'bristol' && !j.signal)).toBe(true);
  });
  it('junction info syncs a junction with an existing light', () => {
    const net = buildLaneNetwork(plus(), { junctionInfo: (n) => (n.x === 0 && n.z === 0 ? { phase: 0.25, primaryAxis: 'x', existing: true } : null) });
    expect(net.junctions).toHaveLength(1);
    expect(net.junctions[0]).toMatchObject({ phase: 0.25, primaryAxis: 'x', existing: true, signal: true });
  });
});

describe('driving', () => {
  it('stops at a red light and goes on green', () => {
    const sim = quiet(plus());
    const lane = laneFrom(sim, 1, 0); // heading east: the x axis, red from 0 to 7 s at phase 0
    const v = sim.spawnOn(lane.id, lane.s0 + 75);
    sim.markFilled();
    let maxS = 0;
    run(sim, 6.5, { each: () => { if (!v.onTurn && v.lane === lane.id) maxS = Math.max(maxS, v.s); } });
    expect(v.lane).toBe(lane.id);
    expect(v.onTurn).toBe(false);
    expect(v.speed).toBeLessThan(0.2);
    expect(maxS).toBeLessThanOrEqual(lane.s1);
    run(sim, 6, { t0: 6.5 });
    expect(v.lane === lane.id && !v.onTurn).toBe(false); // through the junction
  });
  it('queues behind a stopped car with a gap', () => {
    const sim = quiet(plus());
    const lane = laneFrom(sim, 1, 0);
    const a = sim.spawnOn(lane.id, lane.s1 - 4);
    const b = sim.spawnOn(lane.id, lane.s0 + 2);
    sim.markFilled();
    a.cruise = 0; a.speed = 0; a.next = -1;
    run(sim, 12);
    const gap = (a.s - b.s) - (a.length + b.length) / 2;
    expect(b.speed).toBeLessThan(0.3);
    expect(gap).toBeGreaterThan(1);
    expect(gap).toBeLessThan(8);
  });
  it('brakes for a hero standing in the road, and honks', () => {
    const sim = quiet(plus());
    const lane = laneFrom(sim, 0, 1); // heading south on the z axis (green at first)
    const v = sim.spawnOn(lane.id, lane.s0 + 2);
    sim.markFilled();
    const t = (lane.s0 + 40) / lane.len;
    const hero = { x: lane.ax + (lane.bx - lane.ax) * t, y: 0, z: lane.az + (lane.bz - lane.az) * t, r: 0.4 };
    const honks = [];
    run(sim, 6, { obstacles: [hero], emit: (n, p) => { if (n === 'trafficHonk') honks.push(p.type); } });
    expect(v.speed).toBeLessThan(0.3);
    expect(Math.hypot(v.x - hero.x, v.z - hero.z)).toBeGreaterThan(v.length / 2);
    expect(honks.length).toBeGreaterThan(0);
  });
  it('pulls over for a siren behind it', () => {
    const sim = quiet(plus());
    const lane = laneFrom(sim, 0, 1);
    const a = sim.spawnOn(lane.id, lane.s0 + 40);
    const cop = sim.spawnOn(lane.id, lane.s0 + 10, { type: 'police', siren: true });
    expect(cop.siren).toBe(true);
    sim.markFilled();
    a.cruise = 8;
    let pulled = 0;
    run(sim, 3, { each: () => { pulled = Math.max(pulled, a.pull); } });
    expect(pulled).toBeGreaterThan(0.5);
  });
  it('waits for a raised bridge', () => {
    const g = createStreetGraph();
    g.addStreet([{ x: 0, z: 0 }, { x: 0, z: -100 }], { width: 14, lanes: 2 });
    g.addStreet([{ x: 0, z: -100 }, { x: 0, z: -140 }], { width: 14, lanes: 2, bridge: 'b', kind: 'bridge', deck: 'bridge' });
    g.addStreet([{ x: 0, z: -140 }, { x: 0, z: -240 }], { width: 14, lanes: 2 });
    let down = false;
    const sim = quiet(g, { bridges: { isDown: () => down } });
    const lane = sim.lanes.find((l) => l.fz < -0.9 && l.from === 0);
    const v = sim.spawnOn(lane.id, 10);
    sim.markFilled();
    v.next = sim.lanes.find((l) => l.bridge === 'b' && l.fz < 0).id;
    run(sim, 15);
    expect(v.lane).toBe(lane.id);
    expect(v.speed).toBeLessThan(0.2);
    down = true;
    run(sim, 12);
    expect(v.lane).not.toBe(lane.id);
  });
  it('gives way at a country junction: one car in it at a time', () => {
    const sim = quiet(plus('bristol'));
    expect(sim.junctions[0].signal).toBe(false);
    const cars = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([fx, fz]) => { const l = laneFrom(sim, fx, fz); return sim.spawnOn(l.id, l.s1 - 14); });
    sim.markFilled();
    let maxIn = 0, passed = 0;
    const startLane = cars.map((c) => c.lane);
    run(sim, 25, { each: () => {
      let n = 0;
      for (const c of cars) if (c.onTurn && Math.hypot(c.x, c.z) < 15) n++;
      maxIn = Math.max(maxIn, n);
    } });
    cars.forEach((c, k) => { if (c.lane !== startLane[k]) passed++; });
    expect(maxIn).toBe(1);
    expect(passed).toBe(4);
  });
});

describe('the whole city', () => {
  it('spawns around every player, keeps to the cap and to the roads, and despawns what is left behind', () => {
    const g = buildStreetGraph();
    const net = buildLaneNetwork(g);
    const sim = createTrafficSim({ graph: g, cap: 30, rng: createRng(9), districtAt: () => 'loop' });
    const anchors = [{ x: 0, y: 0, z: 0 }, { x: -60, y: 0, z: -300 }];
    const onRoad = (v) => {
      let best = Infinity;
      for (const l of net.lanes) {
        const dx = l.bx - l.ax, dz = l.bz - l.az, L2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((v.x - l.ax) * dx + (v.z - l.az) * dz) / L2));
        best = Math.min(best, Math.hypot(l.ax + dx * t - v.x, l.az + dz * t - v.z));
      }
      return best;
    };
    let worst = 0, overlaps = 0, samples = 0;
    run(sim, 40, { anchors, each: (t) => {
      if (Math.round(t * 30) % 30 !== 0) return;
      expect(sim.active).toBeLessThanOrEqual(30);
      const act = sim.vehicles.filter((v) => v.active);
      for (const v of act) worst = Math.max(worst, onRoad(v));
      for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
        samples++;
        if (Math.hypot(act[i].x - act[j].x, act[i].z - act[j].z) < 1.5 && Math.abs(act[i].y - act[j].y) < 2) overlaps++;
      }
    } });
    expect(sim.active).toBeGreaterThan(15);
    // On a lane, a curve through a junction or pulled over to the kerb: never more than ~8 m off.
    expect(worst).toBeLessThan(8);
    expect(overlaps / Math.max(1, samples)).toBeLessThan(0.01);
    // Both players have traffic near them.
    for (const a of anchors) expect(sim.vehicles.some((v) => v.active && Math.hypot(v.x - a.x, v.z - a.z) < 240)).toBe(true);
    // Player 2 leaves: within a few seconds nothing is left far from everyone.
    anchors[1].x = 0; anchors[1].z = 0;
    run(sim, 6, { anchors, t0: 40 });
    for (const v of sim.vehicles) if (v.active) expect(Math.hypot(v.x, v.z)).toBeLessThan(260);
  });
});
