import { describe, it, expect } from 'vitest';
import { WEST, RECTS, X_STREETS, Z_STREETS, WEST_BRIDGES, BOUNDARY, LANDMARKS, lockState, inElEnvelope, westWaterAt, blocksBetween } from '../../src/world/regions/westLayout.js';
import { WEST_REGION_DATA } from '../../src/world/regions/westData.js';
import { REGIONS, districtAt, floorAt, killYAt, DISTRICT_IDS } from '../../src/world/regions/index.js';
import { buildStreetGraph } from '../../src/world/regions/streets.js';
import { WEST_TRAFFIC } from '../../src/world/regions/westStreets.js';
import { lotsAlong, facingPairs, clipEl } from '../../src/world/regions/westBlocks.js';
import { DISTRICT_PROFILES } from '../../src/audio/cityAmbience.js';
import { createRng } from '../../src/core/rng.js';

// The west side (workstream H3): regions match the district table, the street graph reaches every
// district from the core and offers its neighbours their endpoints, bridges and locks follow
// their schedules, and the El corridor stays clear.

describe('west regions', () => {
  it('cover the district table rectangles exactly and do not overlap anything', () => {
    const ids = WEST_REGION_DATA.map((r) => r.id);
    expect(ids).toEqual(['westRiver', 'quay', 'narrows', 'parkRow', 'chinatown', 'yards']);
    expect(RECTS.westRiver).toEqual({ minX: -300, maxX: -266, minZ: -600, maxZ: 205 });
    expect(RECTS.quay).toEqual({ minX: -266, maxX: -236, minZ: -236, maxZ: 205 });
    expect(RECTS.chinatown).toEqual({ minX: -580, maxX: -300, minZ: -226, maxZ: -30 });
    expect(RECTS.yards).toEqual({ minX: -580, maxX: -300, minZ: -30, maxZ: 205 });
    for (const r of WEST_REGION_DATA) expect(REGIONS.find((q) => q.id === r.id)).toBeTruthy();
  });
  it('name their districts (ids the audio profiles already know)', () => {
    expect(districtAt(-370, -400)).toBe('narrows');
    expect(districtAt(-520, -400)).toBe('parkRow');
    expect(districtAt(-380, -120)).toBe('chinatown');
    expect(districtAt(-520, -120)).toBe('littleOdessa');
    expect(districtAt(-440, 90)).toBe('yards');
    expect(districtAt(-250, 0)).toBe('quay');
    expect(districtAt(-283, -400)).toBe('river');
    for (const id of ['narrows', 'parkRow', 'chinatown', 'littleOdessa', 'yards']) {
      expect(DISTRICT_IDS).toContain(id);
      expect(DISTRICT_PROFILES[id], id).toBeTruthy();
    }
  });
  it('water: the branch, the channel and the cuts have no floor; land does', () => {
    expect(floorAt(-283, -400)).toBe(-Infinity);
    expect(floorAt(-440, -400)).toBe(-Infinity);
    expect(floorAt(-370, -239)).toBe(-Infinity);
    expect(floorAt(-370, -594)).toBe(-Infinity);
    expect(floorAt(-370, -400)).toBe(0);
    expect(floorAt(-500, -400)).toBe(0);
    expect(floorAt(-250, 0)).toBe(0);
    expect(westWaterAt(-283, 0)).toBe(true);
    expect(killYAt(-283, -400)).toBeLessThan(WEST.walkY);
    expect(killYAt(-283, -400)).toBeGreaterThan(WEST.waterY - 1);
  });
  it('every site and crime spot sits in its own region and district', () => {
    for (const r of WEST_REGION_DATA) {
      for (const [k, s] of Object.entries(r.sites)) {
        const owner = REGIONS.find((q) => s.x >= q.bounds.minX && s.x <= q.bounds.maxX && s.z >= q.bounds.minZ && s.z <= q.bounds.maxZ);
        expect(owner?.id, k).toBe(r.id);
      }
      expect(Object.keys(r.sites).length, r.id).toBeGreaterThanOrEqual(r.id === 'westRiver' ? 4 : 6);
      for (const c of r.spawnTables.crimes) expect(districtAt(c.x, c.z), c.id).toBe(c.district);
    }
  });
});

describe('west street plan', () => {
  it('bridges sit on street lines and span the water', () => {
    const zs = new Set(Z_STREETS.map((t) => t.z));
    for (const b of WEST_BRIDGES.bascules) {
      expect(zs.has(b.z), b.id).toBe(true);
      expect([b.x0, b.x1].sort((p, q) => p - q)).toEqual([WEST.branch.minX, WEST.branch.maxX]);
    }
    // No movable leaf under the El corridor: that crossing is the fixed span.
    expect(WEST_BRIDGES.bascules.some((b) => b.z === WEST.el.z)).toBe(false);
    expect(WEST_BRIDGES.fixed.find((b) => b.id === 'elBridge').z).toBe(WEST.el.z);
  });
  it('the El corridor is one straight street from the branch to the west edge, its envelope building-free', () => {
    const el = Z_STREETS.find((t) => t.el);
    expect(el.z).toBe(-479);
    expect(el.segs).toEqual([[-573, -266]]);
    expect(inElEnvelope({ minX: -330, maxX: -320, minZ: -488, maxZ: -484 })).toBe(true);
    expect(inElEnvelope({ minX: -330, maxX: -320, minZ: -468, maxZ: -455 })).toBe(false);
    expect(inElEnvelope({ minX: -380, maxX: -375, minZ: -468, maxZ: -455 })).toBe(true); // the Narrows station plot
    expect(clipEl({ minX: -380, maxX: -375, minZ: -469, maxZ: -440 }).minZ).toBe(-467);
    expect(clipEl({ minX: -380, maxX: -375, minZ: -520, maxZ: -489 }).maxZ).toBe(-491);
    // The corridor and stations are where the El agent's westLineData() puts them.
    expect(WEST.el.stations.map((s) => s.x)).toEqual([-370, -520]);
    for (const b of blocksBetween([-421, -370, -310], [-539, -479, -419])) {
      const inner = { minX: b.minX + 3, maxX: b.maxX - 3, minZ: b.minZ + 3, maxZ: b.maxZ - 3 };
      if (!inElEnvelope(inner)) continue;
      const c = clipEl(inner);
      expect(c === null || !inElEnvelope({ ...c, minX: c.minX, maxX: c.maxX })).toBe(true);
    }
  });
  it('landmarks stay out of streets, water and the El envelope', () => {
    for (const [k, l] of Object.entries(LANDMARKS)) {
      if (!('w' in l)) continue;
      const r = { minX: l.x - l.w / 2, maxX: l.x + l.w / 2, minZ: l.z - l.d / 2, maxZ: l.z + l.d / 2 };
      expect(inElEnvelope(r), k).toBe(false);
      for (const [x, z] of [[r.minX, r.minZ], [r.maxX, r.maxZ]]) expect(westWaterAt(x, z), k).toBe(false);
      for (const s of X_STREETS) if (s.segs.some(([a, b]) => r.maxZ > a && r.minZ < b)) expect(r.maxX <= s.x - 7 || r.minX >= s.x + 7, `${k} vs x ${s.x}`).toBe(true);
      for (const t of Z_STREETS) {
        const hw = t.el ? 10 : 7;
        if (t.segs.some(([a, b]) => r.maxX > a && r.minX < b)) expect(r.maxZ <= t.z - hw || r.minZ >= t.z + hw, `${k} vs z ${t.z}`).toBe(true);
      }
    }
  });
});

describe('west street graph', () => {
  const g = buildStreetGraph();
  const node = (x, z) => g.nodes.find((n) => n.deck !== 'walk' && Math.abs(n.x - x) < 0.6 && Math.abs(n.z - z) < 0.6);
  it('offers endpoints on the shared lines: core west edge, Loop west edge, Bristol', () => {
    for (const p of [...BOUNDARY.core, ...BOUNDARY.loop, ...BOUNDARY.bristol]) expect(node(p.x, p.z), `${p.x},${p.z}`).toBeTruthy();
    // and joins the proof region's own nodes: Lower Gotham's west plaza, the Loop row's El street.
    for (const [x, z] of [[-258, -298], [-262, -359]]) expect(g.adj[node(x, z).id].length).toBeGreaterThanOrEqual(2);
  });
  it('every district is reachable by road from the core, over the bridges', () => {
    const from = { x: -150, y: 0, z: 0 };
    for (const [d, to] of [['quay', { x: -261, z: 60 }], ['chinatown', { x: -415, z: -150 }], ['littleOdessa', { x: -520, z: -120 }], ['yards', { x: -460, z: 150 }], ['narrows', { x: -370, z: -500 }], ['parkRow', { x: -520, z: -480 }]]) {
      const r = g.routeBetween(from, { ...to, y: 0 });
      expect(r, d).toBeTruthy();
      expect(r.length, d).toBeLessThan(1600);
      expect(districtAt(to.x, to.z)).toBe(d);
    }
  });
  it('a raised bascule closes its road and the route goes round', () => {
    const blocked = (e) => e.bridge === 'sbr150';
    const open = g.routeBetween({ x: -236, y: 0, z: -150 }, { x: -310, y: 0, z: -150 });
    expect(open.edges.some((e) => g.edges[e].bridge === 'sbr150')).toBe(true);
    const round = g.routeBetween({ x: -236, y: 0, z: -150 }, { x: -310, y: 0, z: -150 }, { blocked });
    expect(round.edges.some((e) => g.edges[e].bridge === 'sbr150')).toBe(false);
    expect(round.length).toBeGreaterThan(open.length);
  });
  it('the quay river walk is on foot only and joins the quay by stairs', () => {
    const walk = g.edges.filter((e) => e.deck === 'walk' && e.region === 'westRiver');
    expect(walk.length).toBeGreaterThan(4);
    for (const e of walk) expect(e.lanes).toBe(0);
  });
  it('every west traffic loop routes', () => {
    for (const def of WEST_TRAFFIC) {
      for (let i = 0; i < def.legs.length; i++) expect(g.routeBetween(def.legs[i], def.legs[(i + 1) % def.legs.length]), def.id).toBeTruthy();
    }
  });
});

describe('locks and lots (pure)', () => {
  it('the lock cycle: gates shut while the chamber moves, a footway only when shut', () => {
    expect(lockState(0)).toMatchObject({ level: WEST.waterY, lower: 1, upper: 0, lowerWalk: false, upperWalk: true });
    const filling = lockState(46);
    expect(filling.level).toBeGreaterThan(WEST.waterY);
    expect(filling.level).toBeLessThan(-0.6);
    expect(filling.lowerWalk && filling.upperWalk).toBe(true);
    expect(lockState(80)).toMatchObject({ level: -0.6, lower: 0, upper: 1, upperWalk: false });
    expect(lockState(150).level).toBe(lockState(0).level);
  });
  it('lotsAlong splits a frontage into lots of about the target width', () => {
    const lots = lotsAlong(0, 40, 8, 5, createRng(3));
    expect(lots.length).toBe(5);
    expect(lots[0][0]).toBe(0);
    expect(lots[lots.length - 1][1]).toBe(40);
    for (const [a, b] of lots) expect(b - a).toBeGreaterThanOrEqual(5);
  });
  it('facingPairs finds buildings across an alley, not across a street', () => {
    const a = { x: 0, z: 0, w: 10, d: 10, h: 12 }, b = { x: 15, z: 2, w: 10, d: 10, h: 14 }, c = { x: 40, z: 0, w: 10, d: 10, h: 12 };
    const p = facingPairs([a, b, c]);
    expect(p.length).toBe(1);
    expect(p[0]).toMatchObject({ alongX: true, ea: 5, eb: 10 });
  });
});
