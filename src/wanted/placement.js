// [wanted] Where police units and props go, on the shared street graph (pure: no three.js; tested
// in tests/unit/wantedPlacement.test.js). The runtime calls these a few times a second at most.
//
//   createEdgeIndex(graph)            a 64 m grid of drivable edges, for fast nearest-edge lookups
//   snapToRoad(index, x, y, z)        the nearest drivable point on the hero's deck
//   predictRoute(index, from, dir, d) the street path a fleeing hero is most likely to take
//   roadblockSpots(index, route, o)   junction mouths ahead on that path, never inside a building,
//                                     never on a bridge span, never on another deck
//   spikeSpot(index, route, o)        a mid-block spot further on for a spike strip
//   spawnSpot(index, target, o)       a lane out of sight, a set distance away, facing the target

const DRIVABLE = (e) => e.lanes > 0 && e.deck !== 'walk' && e.kind !== 'walk';
const CELL = 64;
const key = (i, j) => (i + 1024) * 4096 + (j + 1024);

export function createEdgeIndex(graph, { filter = DRIVABLE } = {}) {
  const cells = new Map();
  const list = [];
  for (const e of graph.edges) {
    if (!filter(e)) continue;
    list.push(e);
    const A = graph.nodes[e.a], B = graph.nodes[e.b];
    const i0 = Math.floor((Math.min(A.x, B.x) - 2) / CELL), i1 = Math.floor((Math.max(A.x, B.x) + 2) / CELL);
    const j0 = Math.floor((Math.min(A.z, B.z) - 2) / CELL), j1 = Math.floor((Math.max(A.z, B.z) + 2) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      let c = cells.get(k);
      if (!c) cells.set(k, c = []);
      c.push(e.id);
    }
  }
  return { graph, cells, list, filter };
}

const snapOut = { edge: -1, t: 0, x: 0, y: 0, z: 0, dist: Infinity };
// Nearest drivable point to (x, y, z) within `maxDist` (default 80 m): { edge, t, x, y, z, dist } or
// null. y weighs decks apart (a deck 5 m away counts as 15 m). `out` is reused when given.
// dir ({ x, z } unit): break near-ties toward edges running along the heading (at a junction the
// hero's own street wins over the cross street).
export function snapToRoad(index, x, y, z, { maxDist = 80, out = null, dir = null } = {}) {
  const { graph, cells } = index;
  const r = out ?? { ...snapOut };
  r.edge = -1; r.dist = maxDist;
  const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
  const reach = Math.ceil(maxDist / CELL);
  for (let i = ci - reach; i <= ci + reach; i++) for (let j = cj - reach; j <= cj + reach; j++) {
    const c = cells.get(key(i, j));
    if (!c) continue;
    for (let k = 0; k < c.length; k++) {
      const e = graph.edges[c[k]];
      const A = graph.nodes[e.a], B = graph.nodes[e.b];
      const dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - A.x) * dx + (z - A.z) * dz) / L2)) : 0;
      const px = A.x + dx * t, pz = A.z + dz * t, py = A.y + (B.y - A.y) * t;
      const dy = y === null || y === undefined ? 0 : (py - y) * 3;
      let d = Math.sqrt((px - x) ** 2 + (pz - z) ** 2 + dy * dy);
      if (dir && L2 > 0) d += (1 - Math.abs((dx * dir.x + dz * dir.z) / Math.sqrt(L2))) * 4;
      if (d < r.dist) { r.dist = d; r.edge = e.id; r.t = t; r.x = px; r.y = py; r.z = pz; }
    }
  }
  return r.edge >= 0 ? r : null;
}

// The likeliest street path from `from` heading `dir` ({ x, z }, need not be unit), `dist` metres
// long: snap to the road, take the edge direction closest to the heading, then at every junction
// keep going as straight as the streets allow (fleeing drivers rarely turn back). blocked(edge)
// skips an edge (a raised bridge). Returns { points: [{x,y,z}], nodes: [ids], edges: [ids],
// junctions: [{ node, at (metres along), edge (incoming), x, y, z, degree }] } or null.
export function predictRoute(index, from, dir, dist = 200, { blocked = null } = {}) {
  const { graph } = index;
  const dl = Math.hypot(dir?.x ?? 0, dir?.z ?? 0);
  const s = snapToRoad(index, from.x, from.y ?? 0, from.z, { maxDist: 60, dir: dl > 1e-3 ? { x: dir.x / dl, z: dir.z / dl } : null });
  if (!s) return null;
  const e0 = graph.edges[s.edge];
  const A = graph.nodes[e0.a], B = graph.nodes[e0.b];
  let hx = dir?.x ?? 0, hz = dir?.z ?? 0;
  const hl = Math.hypot(hx, hz);
  const ex = B.x - A.x, ez = B.z - A.z, el = Math.hypot(ex, ez) || 1;
  // Which way along the first edge: with the heading (or toward b when standing still).
  let toB = hl < 1e-3 ? true : (hx * ex + hz * ez) >= 0;
  if (e0.oneway) toB = true;
  if (hl < 1e-3) { hx = ex / el; hz = ez / el; } else { hx /= hl; hz /= hl; }
  const out = { points: [{ x: s.x, y: s.y, z: s.z }], nodes: [], edges: [e0.id], junctions: [] };
  let node = toB ? e0.b : e0.a;
  let at = Math.hypot(graph.nodes[node].x - s.x, graph.nodes[node].z - s.z);
  let cur = e0.id;
  const seen = new Set([node]);
  for (let guard = 0; guard < 64; guard++) {
    const N = graph.nodes[node];
    out.points.push({ x: N.x, y: N.y, z: N.z });
    out.nodes.push(node);
    const prev = graph.edges[cur];
    const P = graph.nodes[prev.a === node ? prev.b : prev.a];
    const ix = N.x - P.x, iz = N.z - P.z, il = Math.hypot(ix, iz) || 1;
    let deg = 0;
    for (const id of graph.adj[node]) if (index.filter(graph.edges[id])) deg++;
    if (deg >= 3) out.junctions.push({ node, at, edge: cur, x: N.x, y: N.y, z: N.z, degree: deg, ix: ix / il, iz: iz / il });
    if (at >= dist) break;
    // Straightest way on.
    let best = -1, bs = -2, bNext = -1;
    for (const id of graph.adj[node]) {
      if (id === cur) continue;
      const e = graph.edges[id];
      if (!index.filter(e) || (e.oneway && e.a !== node) || (blocked && blocked(e))) continue;
      const m = e.a === node ? e.b : e.a;
      if (seen.has(m)) continue;
      const M = graph.nodes[m];
      const ox = M.x - N.x, oz = M.z - N.z, ol = Math.hypot(ox, oz) || 1;
      const sc = (ox * ix + oz * iz) / (ol * il);
      if (sc > bs) { bs = sc; best = id; bNext = m; }
    }
    if (best < 0) break;
    out.edges.push(best);
    at += graph.edges[best].length;
    cur = best;
    node = bNext;
    seen.add(node);
  }
  out.length = at;
  return out;
}

// Junction mouths `minAhead`..`maxAhead` metres ahead on a predicted route where a roadblock can
// stand: on the incoming edge, `back` metres short of the junction, across the road. Skips bridge
// spans, other decks than the route's, and any spot okAt(x, y, z, yaw, halfWidth) rejects (the
// runtime tests the collision boxes: never inside a building). Returns up to `count` spots
// { x, y, z, yaw (facing the oncoming hero), halfWidth, edge, node, deck, at }.
export function roadblockSpots(index, route, { count = 1, minAhead = 60, maxAhead = 180, back = 9, okAt = null, deck = null } = {}) {
  if (!route) return [];
  const { graph } = index;
  const out = [];
  const startDeck = deck ?? graph.edges[route.edges[0]]?.deck ?? 'street';
  for (const j of route.junctions) {
    if (out.length >= count) break;
    if (j.at < minAhead || j.at > maxAhead) continue;
    const e = graph.edges[j.edge];
    if (!e || e.bridge || e.deck !== startDeck || e.length < back + 4) continue;
    const x = j.x - j.ix * back, z = j.z - j.iz * back;
    const t = back / e.length;
    const y = j.y + ((e.a === j.node ? graph.nodes[e.b].y : graph.nodes[e.a].y) - j.y) * t;
    // Facing back down the road toward the hero.
    const yaw = Math.atan2(-j.ix, -j.iz);
    const halfWidth = Math.max(3, (e.width ?? 12) / 2);
    if (okAt && !okAt(x, y, z, yaw, halfWidth)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 30)) continue;
    out.push({ x, y, z, yaw, halfWidth, edge: e.id, node: j.node, deck: e.deck, at: j.at - back });
  }
  return out;
}

// A spike strip mid-block `minAhead`..`maxAhead` metres ahead (straight, away from junctions).
export function spikeSpot(index, route, { minAhead = 45, maxAhead = 110, okAt = null, deck = null } = {}) {
  if (!route) return null;
  const { graph } = index;
  const startDeck = deck ?? graph.edges[route.edges[0]]?.deck ?? 'street';
  let at = 0;
  for (let i = 0; i + 1 < route.points.length; i++) {
    const a = route.points[i], b = route.points[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const e = graph.edges[route.edges[i]];
    const mid = at + L / 2;
    if (e && !e.bridge && e.deck === startDeck && L > 20 && mid >= minAhead && mid <= maxAhead) {
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2, z = (a.z + b.z) / 2;
      const yaw = Math.atan2(a.x - b.x, a.z - b.z);
      const halfWidth = Math.max(3, (e.width ?? 12) / 2);
      if (!okAt || okAt(x, y, z, yaw, halfWidth)) return { x, y, z, yaw, halfWidth, edge: e.id, deck: e.deck, at: mid };
    }
    at += L;
    if (at > maxAhead) break;
  }
  return null;
}

// A lane `min`..`max` metres from target, not visible(x, y, z), on the target's deck when given,
// facing roughly toward it. rnd(): a [0,1) source so tests are deterministic. Returns
// { x, y, z, yaw, edge, deck } or null. Scans the index cells in a ring (no full edge scan).
export function spawnSpot(index, target, { min = 90, max = 180, visible = null, rnd = Math.random, deck = null, blocked = null } = {}) {
  const { graph, cells } = index;
  const ci = Math.floor(target.x / CELL), cj = Math.floor(target.z / CELL);
  const reach = Math.ceil(max / CELL);
  let best = null, bs = -Infinity;
  for (let i = ci - reach; i <= ci + reach; i++) for (let j = cj - reach; j <= cj + reach; j++) {
    const c = cells.get(key(i, j));
    if (!c) continue;
    for (let k = 0; k < c.length; k++) {
      const e = graph.edges[c[k]];
      if (e.bridge || (deck && e.deck !== deck) || (blocked && blocked(e)) || e.length < 12) continue;
      const A = graph.nodes[e.a], B = graph.nodes[e.b];
      const t = 0.3 + rnd() * 0.4;
      const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t, y = A.y + (B.y - A.y) * t;
      const d = Math.hypot(x - target.x, z - target.z);
      if (d < min || d > max) continue;
      if (visible && visible(x, y, z)) continue;
      // Drive toward the target along the edge.
      const ex = B.x - A.x, ez = B.z - A.z;
      const toward = (target.x - x) * ex + (target.z - z) * ez >= 0;
      if (e.oneway && !toward) continue;
      const sc = -Math.abs(d - (min + max) / 2) / max + rnd() * 0.3;
      if (sc > bs) { bs = sc; best = { x, y, z, yaw: toward ? Math.atan2(ex, ez) : Math.atan2(-ex, -ez), edge: e.id, deck: e.deck }; }
    }
  }
  return best;
}
