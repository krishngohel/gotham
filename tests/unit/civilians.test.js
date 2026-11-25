import { describe, it, expect } from 'vitest';
import { createStreetGraph } from '../../src/world/streetGraph.js';
import { buildStreetGraph } from '../../src/world/regions/streets.js';
import { createRng } from '../../src/core/rng.js';
import { buildSidewalkNetwork, createPedSim, mayCross, pointOnLine } from '../../src/civilians/pedSim.js';
import { ARCHETYPES, KIND_MAP, mixAt, hourFactor, weatherFactor, targetCount, umbrellaShare, CROWD_TIERS, ACTIVITIES } from '../../src/civilians/archetypes.js';
import { decideReaction, REACTIONS, REACTION_TIME, REACTION_CLIP, URGENCY } from '../../src/civilians/reactions.js';
import { CIVILIAN_TYPES } from '../../src/actors/civilians/generator.js';
import { MOCAP_DATA as CIV } from '../../src/config/mocapData.civ.js';
import { REGION_DATA } from '../../src/world/regions/data.js';
import { signalState } from '../../src/world/trafficSim.js';
import { districtTable } from '../../src/civilians/archetypes.js';

// A plus-shaped junction at the origin: 14 m streets with 3 m sidewalks, 120 m arms.
function plus() {
  const g = createStreetGraph();
  for (const [x, z] of [[-120, 0], [120, 0], [0, -120], [0, 120]]) g.addStreet([{ x, z }, { x: 0, z: 0 }], { width: 14, lanes: 2, sidewalk: 3, region: 'test' });
  return g;
}

describe('pedestrian data', () => {
  it('every archetype clip, type and activity resolves', () => {
    for (const [id, A] of Object.entries(ARCHETYPES)) {
      for (const c of [...A.walks, ...A.idles]) expect(CIV[c], `${id}: ${c}`).toBeTruthy();
      for (const t of A.types) expect(CIVILIAN_TYPES[t], `${id}: ${t}`).toBeTruthy();
      for (const act of Object.keys(A.activities)) expect(ACTIVITIES).toContain(act);
    }
    for (const r of REACTIONS) { expect(REACTION_TIME[r]).toBeTruthy(); expect(URGENCY[r]).toBeGreaterThanOrEqual(0); }
    for (const c of Object.values(REACTION_CLIP)) if (c && c.startsWith('Civ_')) expect(CIV[c], c).toBeTruthy();
  });
  it('every region spawn-table kind maps to archetypes', () => {
    for (const r of REGION_DATA) for (const k of r.spawnTables?.civilians?.kinds ?? []) expect(KIND_MAP[k], `${r.id}: ${k}`).toBeTruthy();
    for (const m of Object.values(KIND_MAP)) for (const a of Object.keys(m)) expect(ARCHETYPES[a]).toBeTruthy();
  });
  it('density: almost nobody at 4 a.m. in the rain, busy at 6 p.m.', () => {
    const fourRain = targetCount({ regionDensity: 1, hour: 4, weather: { rain: 1 }, cap: 100 });
    const sixDry = targetCount({ regionDensity: 1, hour: 18, weather: { rain: 0 }, cap: 100 });
    expect(fourRain).toBeLessThan(5);
    expect(sixDry).toBeGreaterThan(90);
    expect(hourFactor(12)).toBeGreaterThan(hourFactor(3));
    expect(weatherFactor({ rain: 1 })).toBeLessThan(weatherFactor({ rain: 0 }));
    expect(umbrellaShare({ rain: 0.8 })).toBeGreaterThan(0.5);
    expect(umbrellaShare({ rain: 0 })).toBe(0);
    expect(CROWD_TIERS.potato.full).toBeLessThanOrEqual(12);
    expect(CROWD_TIERS.ultra.full).toBeGreaterThanOrEqual(60);
  });
  it('mixes follow the hour and the district', () => {
    const loopNight = mixAt(['office', 'walker'], 'loop', 21, {});
    expect(loopNight.theatregoer).toBeGreaterThan(1);
    const loopNoon = mixAt(['office', 'walker'], 'loop', 12, {});
    expect(loopNoon.theatregoer ?? 0).toBe(0);
    expect(mixAt(['walker'], 'yards', 2, {}).worker).toBeGreaterThan(1);
    expect(mixAt(['walker'], 'chinatown', 11, {}).vendor).toBeGreaterThan(0.5);
    const rush = mixAt(['walker'], 'gcpd', 8, {}), late = mixAt(['walker'], 'gcpd', 3, {});
    expect(rush.commuter).toBeGreaterThan(late.commuter ?? 0);
  });
  it('core districts have a spawn table', () => {
    for (const d of ['gcpd', 'neon', 'docks', 'ace', 'clock']) expect(districtTable(d).density).toBeGreaterThan(0);
  });
});

describe('reaction rules', () => {
  it('fear and love of the heroes shape the crowd', () => {
    const cheers = new Set(), boos = new Set();
    for (let i = 0; i < 20; i++) { cheers.add(decideReaction({ kind: 'heroSeen', dist: 6, rep: 95 }, i / 20)); boos.add(decideReaction({ kind: 'heroSeen', dist: 6, rep: 5 }, i / 20)); }
    expect(cheers.has('cheer')).toBe(true); expect(cheers.has('boo')).toBe(false);
    expect(boos.has('boo')).toBe(true); expect(boos.has('cheer')).toBe(false);
  });
  it('fights and gunfire send people running or cowering; police call it in; gadgets only flinch', () => {
    for (let i = 0; i < 10; i++) {
      expect(['flee', 'cower', 'callPolice', 'stare']).toContain(decideReaction({ kind: 'fight', dist: 10 }, i / 10));
      expect(['flee', 'cower']).toContain(decideReaction({ kind: 'gunfire', dist: 8 }, i / 10));
    }
    expect(decideReaction({ kind: 'fight', dist: 10, police: true }, 0.5)).toBe('callPolice');
    expect(decideReaction({ kind: 'gadget', dist: 2 }, 0.5)).toBe('flinch');
    expect(decideReaction({ kind: 'fight', dist: 60 }, 0.5)).toBe('ignore');
    expect(decideReaction({ kind: 'rescue', dist: 10, rep: 60 }, 0.2)).toBe('thank');
  });
});

describe('sidewalk network', () => {
  it('a plus junction gives 8 lines whose ends meet at corners and crossings', () => {
    const net = buildSidewalkNetwork(plus());
    expect(net.lines.length).toBe(8);
    // Lines end at the corners: 8.5 m from the centre on both axes.
    for (const e of net.ends) {
      if (e.node !== net.lines[0].nodeB && e.node !== net.lines[0].nodeA) continue;
      const centre = Math.abs(e.x) < 1e-6 && Math.abs(e.z) < 1e-6;
      expect(centre).toBe(false);
    }
    const centreNode = net.lines[0].nodeB;
    const atCentre = net.ends.filter((e) => e.node === centreNode);
    expect(atCentre.length).toBe(8);
    for (const e of atCentre) {
      expect(Math.abs(Math.abs(e.x) - 8.5) < 1e-6 && Math.abs(Math.abs(e.z) - 8.5) < 1e-6).toBe(true);
      expect(e.links.filter((l) => !l.cross).length).toBe(1); // the corner
      // Across either street, onto either line at the far corner (never the diagonal).
      const across = e.links.filter((l) => l.cross);
      expect(across.length).toBe(4);
      for (const l of across) expect(Math.abs(l.d - 17)).toBeLessThan(1e-6);
    }
  });
  it('the whole city builds a connected-enough network', () => {
    const net = buildSidewalkNetwork(buildStreetGraph());
    expect(net.lines.length).toBeGreaterThan(800);
    const linked = net.ends.filter((e) => e.links.length > 0).length;
    expect(linked / net.ends.length).toBeGreaterThan(0.85);
    const p = pointOnLine(net.lines[0], 1, 0, { x: 0, y: 0, z: 0 });
    expect(Number.isFinite(p.x)).toBe(true);
  });
  it('mayCross: walk on the parallel green only, never with a car close', () => {
    expect(mayCross(0, false)).toBe(true);
    expect(mayCross(1, false)).toBe(false);
    expect(mayCross(2, false)).toBe(false);
    expect(mayCross(0, true)).toBe(false);
    expect(mayCross(-1, false)).toBe(true);
  });
});

describe('pedestrian simulation', () => {
  const run = (sim, secs, { t0 = 0, dt = 1 / 20, anchors = [{ x: 0, y: 0, z: 0 }], each = null } = {}) => {
    let t = t0;
    for (let k = 0; k < secs / dt; k++) { t += dt; sim.update(dt, t, anchors, anchors.length); each?.(t); }
    return t;
  };
  it('crosses only on the walk signal at a junction with lights', () => {
    const graph = plus();
    const net = buildSidewalkNetwork(graph);
    const centre = net.lines[0].nodeB;
    // Signal: phase 0, primary axis z (as the core's lights).
    const sim = createPedSim({ graph, network: net, cap: 8, rng: createRng(3), signalAt: (node, axis, t) => (node === centre ? signalState(0, 'z', axis, t) : -1) });
    sim.markFilled();
    let crossings = 0, bad = 0;
    for (let i = 0; i < 4; i++) {
      const line = net.lines.find((l) => l.nodeB === centre && l.side === (i % 2 ? 1 : -1) && (i < 2 ? Math.abs(l.ux) > 0.5 : Math.abs(l.uz) > 0.5));
      const a = sim.spawnOn(line.id, line.len - 1, 1, 'walker');
      sim.setSpeed(a, 1.3);
    }
    const was = new Map();
    run(sim, 120, {
      dt: 0.05,
      each: (t) => {
        for (const a of sim.agents) {
          if (!a.active) continue;
          const prev = was.get(a.i);
          if (a.mode === 'cross' && a.crossing && prev !== 'cross') {
            crossings++;
            if (signalState(0, 'z', a.axis, t) !== 0 && a.t < 0.2) bad++;
          }
          was.set(a.i, a.mode);
          // Keep them out of activities so the test only sees walking.
          if (a.mode === 'act') a.actT = 0;
        }
      },
    });
    expect(crossings).toBeGreaterThan(2);
    expect(bad).toBe(0);
  });
  it('fills the streets around an anchor to the target, fewer at 4 a.m. in the rain', () => {
    const graph = buildStreetGraph();
    const net = buildSidewalkNetwork(graph);
    const mk = (hour, rain) => createPedSim({ graph, network: net, cap: 60, rng: createRng(9), hour: () => hour, weather: () => ({ rain }), tableAt: () => ({ density: 1, kinds: ['walker', 'office'] }), spawn: { min: 25, max: 80 } });
    const day = mk(18, 0), night = mk(4, 1);
    const an = [{ x: 150, y: 0, z: 10 }];
    run(day, 5, { anchors: an }); run(night, 5, { anchors: an });
    expect(day.active).toBeGreaterThan(30);
    expect(night.active).toBeLessThan(day.active / 4);
    // They stay on the sidewalks (never in the middle of a street's roadway).
    for (const a of day.agents) if (a.active && a.mode === 'walk') {
      const l = net.lines[a.line];
      expect(Math.hypot(a.x - (l.ax + (l.bx - l.ax) * (a.s / l.len)), a.z - (l.az + (l.bz - l.az) * (a.s / l.len)))).toBeLessThan(2);
    }
  });
  it('flees a fight and cowers close to it; nobody is ever hurt', () => {
    const graph = buildStreetGraph();
    const sim = createPedSim({ graph, cap: 40, rng: createRng(5), hour: () => 18, tableAt: () => ({ density: 1, kinds: ['walker'] }), spawn: { min: 10, max: 50 } });
    const an = [{ x: 150, y: 0, z: 10 }];
    run(sim, 3, { anchors: an });
    const before = new Map(sim.agents.filter((a) => a.active).map((a) => [a.i, Math.hypot(a.x - 150, a.z - 10)]));
    const n = sim.stimulus('fight', 150, 10, { radius: 28 });
    expect(n).toBeGreaterThan(3);
    const reacting = sim.agents.filter((a) => a.active && (a.reaction === 'flee' || a.reaction === 'cower'));
    expect(reacting.length).toBeGreaterThan(2);
    run(sim, 3, { anchors: an });
    const fled = sim.agents.filter((a) => a.active && a.reaction === 'flee');
    let further = 0;
    for (const a of fled) if (Math.hypot(a.x - 150, a.z - 10) > (before.get(a.i) ?? 0)) further++;
    expect(further).toBeGreaterThanOrEqual(Math.ceil(fled.length * 0.6));
    for (const a of sim.agents) expect('health' in a).toBe(false);
  });
  it('police respond to a crime along the streets', () => {
    const graph = buildStreetGraph();
    const sim = createPedSim({ graph, cap: 10, rng: createRng(2), routeTo: (a, x, z) => graph.routeBetween(a, { x, z })?.points ?? null });
    sim.markFilled();
    const l = sim.network.lines.find((q) => q.region === 'core' && q.len > 30);
    const cop = sim.spawnOn(l.id, 10, 1, 'police');
    sim.setSpeed(cop, 1.2);
    const far = sim.network.lines.find((q) => q.region === 'core' && Math.hypot(q.mx - cop.x, q.mz - cop.z) > 90 && Math.hypot(q.mx - cop.x, q.mz - cop.z) < 140);
    const target = { x: far.mx, z: far.mz };
    expect(sim.respond(target.x, target.z)).toBe(1);
    run(sim, 60, { anchors: [{ x: target.x, y: 0, z: target.z }] });
    expect(Math.hypot(cop.x - target.x, cop.z - target.z)).toBeLessThan(25);
  });
  it('two anchors far apart are both populated', () => {
    const graph = buildStreetGraph();
    const sim = createPedSim({ graph, cap: 80, rng: createRng(4), hour: () => 13, tableAt: () => ({ density: 1, kinds: ['walker'] }), spawn: { min: 25, max: 70 } });
    const an = [{ x: 150, y: 0, z: 10 }, { x: -90, y: 0, z: -398 }];
    run(sim, 6, { anchors: an });
    const near = (p) => sim.agents.filter((a) => a.active && Math.hypot(a.x - p.x, a.z - p.z) < 75).length;
    expect(near(an[0])).toBeGreaterThan(15);
    expect(near(an[1])).toBeGreaterThan(15);
  });
});

import { pickHeadline, HEADLINES } from '../../src/civilians/headlines.js';
describe('headlines hook', () => {
  it('follows reputation and recent rescues', () => {
    expect(HEADLINES.loved).toContain(pickHeadline({ rep: 90 }, 0.1));
    expect(HEADLINES.feared).toContain(pickHeadline({ rep: 10 }, 0.1));
    expect(pickHeadline({ recent: [{ kind: 'robbery', district: 'loop', outcome: 'stopped' }] }, 0.2)).toBe('ROBBERY FOILED IN LOOP');
  });
});
