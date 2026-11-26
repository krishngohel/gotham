// The west side's streets for the shared street graph (workstream H3): every street the
// builders pave (westLayout.js X_STREETS / Z_STREETS), split at each crossing, the bascule and
// fixed bridges flagged on their edges, the quay river walk on foot, and the joins to the
// neighbours: the core's west edge (x -236), Lower Gotham's west plaza (-258, -298), the Loop's
// first row (-262, -359), the Loop's west edge (x -266, its 60 m lines) and Bristol (z -600).
// Pure (no three.js). Imports nothing from streets.js, so streets.js can import this file.
import { WEST, X_STREETS, Z_STREETS, WEST_BRIDGES, BOUNDARY } from './westLayout.js';

const near = (a, b) => Math.abs(a - b) < 0.01;

// Which region a street point belongs to (for edge.region; matches data.js rects).
export function westRegionAt(x, z) {
  if (x > -266) return 'quay';
  if (x > -300) return 'westRiver';
  if (z < -226) return x > -450 ? 'narrows' : 'parkRow';
  return z < -30 ? 'chinatown' : 'yards';
}

// Bridge spans as { axis, at, lo, hi, id, bascule } on the street they carry.
function spans() {
  const out = [];
  for (const b of WEST_BRIDGES.bascules) out.push({ axis: 'x', at: b.z, lo: Math.min(b.x0, b.x1), hi: Math.max(b.x0, b.x1), id: b.id, bascule: true });
  for (const b of WEST_BRIDGES.fixed) {
    if (b.axis === 'x') out.push({ axis: 'x', at: b.z, lo: Math.min(b.x0, b.x1), hi: Math.max(b.x0, b.x1), id: b.id, bascule: false });
    else out.push({ axis: 'z', at: b.x, lo: Math.min(b.z0, b.z1), hi: Math.max(b.z0, b.z1), id: b.id, bascule: false });
  }
  return out;
}

export function addWestStreets(g) {
  const S = spans();
  const opts = (x, z, extra = {}) => ({ width: WEST.street.width, lanes: 2, sidewalk: WEST.street.sidewalk, region: westRegionAt(x, z), ...extra });
  const inSeg = (segs, v) => segs.some(([a, b]) => v >= Math.min(a, b) - 0.01 && v <= Math.max(a, b) + 0.01);

  // N-S streets: stops at every crossing E-W street, the ends, and both ends of every bridge.
  for (const s of X_STREETS) {
    for (const [z0, z1] of s.segs) {
      const stops = new Set([z0, z1]);
      for (const t of Z_STREETS) if (z0 <= t.z && t.z <= z1 && inSeg(t.segs, s.x)) stops.add(t.z);
      for (const sp of S) if (sp.axis === 'z' && near(sp.at, s.x)) { stops.add(sp.lo); stops.add(sp.hi); }
      const zs = [...stops].filter((z) => z >= z0 && z <= z1).sort((a, b) => a - b);
      for (let i = 0; i + 1 < zs.length; i++) {
        const a = zs[i], b = zs[i + 1], m = (a + b) / 2;
        const sp = S.find((q) => q.axis === 'z' && near(q.at, s.x) && m > q.lo && m < q.hi);
        const extra = s.quay ? { width: 8, lanes: 2, sidewalk: 0, kind: 'drive' } : {};
        if (sp) Object.assign(extra, { kind: 'bridge', deck: 'bridge', bridge: sp.bascule ? sp.id : null });
        g.addStreet([{ x: s.x, z: a }, { x: s.x, z: b }], opts(s.x, m, extra));
      }
    }
  }
  // E-W streets: stops at every crossing N-S street, the ends, and both ends of every bridge.
  for (const t of Z_STREETS) {
    for (const [x0, x1] of t.segs) {
      const stops = new Set([x0, x1]);
      for (const s of X_STREETS) if (x0 <= s.x && s.x <= x1 && inSeg(s.segs, t.z)) stops.add(s.x);
      for (const sp of S) if (sp.axis === 'x' && near(sp.at, t.z)) { stops.add(sp.lo); stops.add(sp.hi); }
      const xs = [...stops].filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i++) {
        const a = xs[i], b = xs[i + 1], m = (a + b) / 2;
        const sp = S.find((q) => q.axis === 'x' && near(q.at, t.z) && m > q.lo && m < q.hi);
        const extra = t.el ? { width: WEST.el.streetWidth, kind: 'elStreet' } : {}; // the El West Line's street
        if (sp) Object.assign(extra, { kind: 'bridge', deck: 'bridge', bridge: sp.bascule ? sp.id : null });
        g.addStreet([{ x: a, z: t.z }, { x: b, z: t.z }], opts(m, t.z, extra));
      }
    }
  }
  // Joins to the proof region's own nodes: Lower Gotham's west plaza and the Loop row's El street.
  g.addStreet([{ x: -266, z: -298 }, { x: -258, z: -298 }], { width: 10, lanes: 2, sidewalk: 3, region: 'lowerGotham', kind: 'drive' });
  g.addStreet([{ x: -266, z: -359 }, { x: -262, z: -359 }], { width: 14, lanes: 2, sidewalk: 3, region: 'loop' });

  // The quay river walk (on foot: no lanes), with stairs up to the quay at both ends and at the
  // middle of every warehouse row's gap (the bridges pass over it).
  const walk = { width: 4, lanes: 0, sidewalk: 0, region: 'westRiver', kind: 'walk', deck: 'walk' };
  const wx = (WEST.quayWalk.minX + WEST.quayWalk.maxX) / 2;
  const wz = [-214, -120, -60, 0, 60, 122];
  g.addStreet(wz.map((z) => ({ x: wx, y: WEST.walkY, z, deck: 'walk' })), walk);
  for (const z of [wz[0], wz[wz.length - 1]]) {
    g.addStreet([{ x: wx, y: WEST.walkY, z, deck: 'walk' }, { x: -261, z: z < 0 ? -228 : 150 }], { ...walk, kind: 'stairs' });
  }
}

// Every endpoint this side offers its neighbours (hand-back list, boundary tests).
export const WEST_BOUNDARY = BOUNDARY;

// Ambient traffic loops (as RIVERFRONT_TRAFFIC: legs routed through the graph, cars keep left,
// wait at a raised bridge).
export const WEST_TRAFFIC = [
  // Over the South Branch on the -150 bascule, down the riverside drive, back over the -30 one.
  { id: 'southBranchCircuit', cars: 5, speed: [9, 12], legs: [
    { x: -236, y: 0, z: -150 }, { x: -370, y: 0, z: -150 }, { x: -370, y: 0, z: -30 }, { x: -236, y: 0, z: -30 },
  ] },
  // The Loop row's El street over the North Branch, down the riverside, back over the -298 one.
  { id: 'northBranchCircuit', cars: 4, speed: [8, 11], legs: [
    { x: -262, y: 0, z: -359 }, { x: -310, y: 0, z: -359 }, { x: -310, y: 0, z: -298 }, { x: -258, y: 0, z: -298 },
  ] },
  { id: 'narrowsCircuit', cars: 4, speed: [7, 10], legs: [
    { x: -310, y: 0, z: -298 }, { x: -310, y: 0, z: -539 }, { x: -421, y: 0, z: -539 }, { x: -421, y: 0, z: -298 },
  ] },
  { id: 'parkRowCircuit', cars: 4, speed: [8, 11], legs: [
    { x: -460, y: 0, z: -298 }, { x: -573, y: 0, z: -298 }, { x: -573, y: 0, z: -539 }, { x: -460, y: 0, z: -539 },
  ] },
  { id: 'chinatownCircuit', cars: 5, speed: [7, 10], legs: [
    { x: -310, y: 0, z: -210 }, { x: -573, y: 0, z: -210 }, { x: -573, y: 0, z: -90 }, { x: -310, y: 0, z: -90 },
  ] },
  { id: 'yardsCircuit', cars: 4, speed: [9, 13], legs: [
    { x: -460, y: 0, z: -30 }, { x: -460, y: 0, z: 197 }, { x: -310, y: 0, z: 197 }, { x: -310, y: 0, z: -30 },
  ] },
];
