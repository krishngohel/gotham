// Pursuit targets on the street graph (workstream L3, `[move]`): a getaway car, a convoy truck, a
// car being tailed. Pure: it drives a point along graph edges (src/world/streetGraph.js) and picks
// where to turn at each node; the runtime (src/vehicles/chases.js) moves a model to it and snaps it
// to the ground. Deterministic for a given rng.
//
// Escape logic: at a node it scores each way out by how much it opens the gap to the pursuer, a
// bias to carry straight on, and a little randomness; it never U-turns unless boxed in, never takes
// a footpath, a lane-less edge, or a raised bridge (opts.blocked). In 'tail' mode it is not
// fleeing: it drives a calm route and only bolts (switching to 'flee') once it has spotted the tail.
// Rubber band: it eases off when far ahead and pushes harder when the pursuer is close, inside the
// [minSpeed, maxSpeed] limits, so a chase stays a chase without ever cheating past those numbers.

export const CHASE_DEFAULTS = {
  speed: 20, minSpeed: 9, maxSpeed: 30, near: 16, far: 85, accel: 8, cornerSlow: 0.55,
  straightBias: 0.6, fleeWeight: 1.2, jitter: 0.35, mode: 'flee',
};

const drivable = (e) => e.lanes > 0 && e.deck !== 'walk' && e.kind !== 'walk';

export function createPursuitTarget(graph, start, rng, opts = {}) {
  const o = { ...CHASE_DEFAULTS, ...opts };
  const snap = graph.nearestEdge(start.x, start.z, { y: start.y ?? null, filter: drivable });
  if (!snap) return null;
  const E = graph.edges[snap.edge];
  // Head toward whichever end leads away from `opts.awayFrom` (default: toward b).
  let from = E.a, to = E.b;
  if (opts.awayFrom) {
    const A = graph.nodes[E.a], B = graph.nodes[E.b];
    const dA = Math.hypot(A.x - opts.awayFrom.x, A.z - opts.awayFrom.z), dB = Math.hypot(B.x - opts.awayFrom.x, B.z - opts.awayFrom.z);
    if (dA > dB) { from = E.b; to = E.a; }
  }
  const len = E.length || 1;
  const s = from === E.a ? snap.t * len : (1 - snap.t) * len;
  const t = { o, edge: E.id, from, to, s, len, speed: o.speed * 0.6, x: 0, y: 0, z: 0, yaw: 0, mode: o.mode, nodesVisited: 0, lastTurn: 0 };
  pose(graph, t);
  return t;
}

// One step: pursuer = { x, y, z } (the player's car), or null. Mutates t.
export function stepPursuitTarget(graph, t, dt, pursuer, rng, blocked = null) {
  const o = t.o;
  const d = pursuer ? Math.hypot(pursuer.x - t.x, pursuer.z - t.z) : o.far;
  // Rubber band on the cruise speed.
  let want = o.speed;
  if (t.mode === 'flee') {
    if (d > o.far) want = o.speed * 0.65;
    else if (d < o.near) want = o.speed * 1.25;
    else want = o.speed * (1.25 - 0.6 * (d - o.near) / (o.far - o.near));
  } else want = o.speed * 0.75;
  // Slow for the turn coming up at the end of this edge.
  const left = t.len - t.s;
  if (left < 18 && Math.abs(t.lastTurn) > 0.6) want *= 1 - o.cornerSlow * Math.min(1, Math.abs(t.lastTurn) / Math.PI) * (1 - left / 18);
  want = Math.max(o.minSpeed, Math.min(o.maxSpeed, want));
  t.speed += Math.max(-o.accel * 2 * dt, Math.min(o.accel * dt, want - t.speed));
  let travel = t.speed * dt;
  for (let guard = 0; guard < 4 && travel > 0; guard++) {
    if (t.s + travel < t.len) { t.s += travel; travel = 0; break; }
    travel -= t.len - t.s;
    nextEdge(graph, t, pursuer, rng, blocked);
  }
  pose(graph, t);
  return t;
}

function nextEdge(graph, t, pursuer, rng, blocked) {
  const node = graph.nodes[t.to];
  const cur = graph.edges[t.edge];
  const A0 = graph.nodes[t.from];
  const inX = node.x - A0.x, inZ = node.z - A0.z, inL = Math.hypot(inX, inZ) || 1;
  let best = -1, bestScore = -Infinity, bestTurn = 0, fallback = -1;
  for (const eid of graph.adj[t.to]) {
    const e = graph.edges[eid];
    if (!drivable(e) || (blocked && blocked(e))) continue;
    if (e.oneway && e.a !== t.to) continue;
    if (eid === cur.id) { fallback = eid; continue; } // a U-turn only when boxed in
    const m = graph.nodes[e.a === t.to ? e.b : e.a];
    const ox = m.x - node.x, oz = m.z - node.z, oL = Math.hypot(ox, oz) || 1;
    const straight = (ox * inX + oz * inZ) / (oL * inL);
    let away = 0;
    if (pursuer && t.mode === 'flee') {
      const px = node.x - pursuer.x, pz = node.z - pursuer.z, pL = Math.hypot(px, pz) || 1;
      away = (ox * px + oz * pz) / (oL * pL);
    }
    const score = straight * t.o.straightBias + away * (t.mode === 'flee' ? t.o.fleeWeight : 0) + (rng.next() - 0.5) * 2 * t.o.jitter;
    if (score > bestScore) {
      bestScore = score; best = eid;
      const cross = inX * oz - inZ * ox;
      bestTurn = Math.atan2(cross / (oL * inL), straight);
    }
  }
  if (best < 0) best = fallback >= 0 ? fallback : cur.id;
  const e = graph.edges[best];
  t.from = t.to;
  t.to = e.a === t.from ? e.b : e.a;
  t.edge = e.id;
  t.len = e.length || 1;
  t.s = 0;
  t.lastTurn = bestTurn;
  t.nodesVisited++;
}

function pose(graph, t) {
  const A = graph.nodes[t.from], B = graph.nodes[t.to];
  const k = Math.min(1, t.s / t.len);
  t.x = A.x + (B.x - A.x) * k;
  t.y = A.y + (B.y - A.y) * k;
  t.z = A.z + (B.z - A.z) * k;
  t.yaw = Math.atan2(B.x - A.x, B.z - A.z);
}

// "Follow without being seen": the tail meter. state: { suspicion 0..1, farT, status }.
// dist: metres to the target; seen: the target has line of sight to the tail (the runtime's test).
// Too close and seen fills the meter (spotted at 1); too far for too long loses it.
export const TAIL = { tooClose: 24, lost: 150, fill: 0.45, drain: 0.2, lostT: 6 };
export function stepTail(state, dist, seen, dt, k = TAIL) {
  if (state.status !== 'tailing') return state;
  const close = dist < k.tooClose;
  if (close && seen) state.suspicion = Math.min(1, state.suspicion + k.fill * dt * (1 + (k.tooClose - dist) / k.tooClose));
  else state.suspicion = Math.max(0, state.suspicion - k.drain * dt);
  state.farT = dist > k.lost ? state.farT + dt : 0;
  if (state.suspicion >= 1) state.status = 'spotted';
  else if (state.farT > k.lostT) state.status = 'lost';
  return state;
}
export const createTail = () => ({ suspicion: 0, farT: 0, status: 'tailing' });
