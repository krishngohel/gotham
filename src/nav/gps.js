// The GPS (workstream L2): one route per player over the street graph, recomputed only when it
// has to be: the target moved, the player left the route, or a movable bridge on it went up.
// Pure (no three.js); route computation is local to each machine.
//
//   gps.update(id, pos, target, dt) -> state { route, cum, s, off, version, reason }
//     route    { points: [{ x, y, z }], length, edges } from graph.routeBetween (or null)
//     s        how far along the route the player is (metres)
//     off      distance from the player to the route (metres)
//     version  bumps on every reroute (the ribbon rebuilds on a change)
//     reason   why the last reroute happened: 'target' | 'offRoute' | 'blocked' | 'none'
export const GPS = {
  offRoute: 14,        // metres past the road's half width before the player counts as off it
  offRouteTime: 1.0,   // seconds off it before a reroute
  minGap: 0.6,         // seconds between reroutes
  targetMoved: 6,      // metres a target must move to reroute
  turnAngle: 0.5,      // radians of heading change that make a junction a turn (about 29 degrees)
};

// Nearest point of a polyline to (x, z): { s, d, i } (distance along, distance to, segment).
// `hint` (a segment index) narrows the search to a window around it when given.
export function projectOnPolyline(pts, cum, x, z, hint = -1, window = 24) {
  let best = Infinity, bs = 0, bi = 0;
  const i0 = hint >= 0 ? Math.max(0, hint - window) : 0;
  const i1 = hint >= 0 ? Math.min(pts.length - 1, hint + window) : pts.length - 1;
  for (let i = i0; i < i1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2)) : 0;
    const d = (a.x + dx * t - x) ** 2 + (a.z + dz * t - z) ** 2;
    if (d < best) { best = d; bs = cum[i] + Math.sqrt(L2) * t; bi = i; }
  }
  return { s: bs, d: Math.sqrt(best), i: bi };
}

export function cumulative(pts) {
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return cum;
}

// The turns along a route: junctions where the heading changes by more than GPS.turnAngle.
// [{ i, s, x, y, z, yaw (the new heading), dir: 'left' | 'right' }]
export function routeTurns(pts, cum, angle = GPS.turnAngle) {
  const out = [];
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const h0 = Math.atan2(b.x - a.x, b.z - a.z), h1 = Math.atan2(c.x - b.x, c.z - b.z);
    let d = h1 - h0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) < angle) continue;
    // Heading = atan2(x, z): with x east and z south, a positive change turns to the right... of a
    // walker looking down -z? Check with east (h=PI/2) to south (h=0): d = -PI/2, and heading east
    // then south is a right turn on a north-up map. So a negative d is a right turn.
    out.push({ i, s: cum[i], x: b.x, y: b.y ?? 0, z: b.z, yaw: h1, dir: d < 0 ? 'right' : 'left' });
  }
  return out;
}

export function createGps({ graph, blocked = null } = {}) {
  const states = new Map();
  function S(id) {
    let s = states.get(id);
    if (!s) { s = { route: null, cum: null, s: 0, off: 0, hint: -1, version: 0, reason: 'none', target: null, offT: 0, gap: 0, turns: [] }; states.set(id, s); }
    return s;
  }
  function compute(st, pos, target, reason) {
    const r = graph.routeBetween({ x: pos.x, y: pos.y, z: pos.z }, { x: target.x, y: target.y, z: target.z }, { blocked });
    st.route = r && r.points.length >= 2 ? r : null;
    st.cum = st.route ? cumulative(st.route.points) : null;
    st.turns = st.route ? routeTurns(st.route.points, st.cum) : [];
    st.target = { x: target.x, y: target.y ?? 0, z: target.z };
    st.hint = -1;
    st.offT = 0;
    st.gap = GPS.minGap;
    st.version++;
    st.reason = reason;
  }
  const routeBlocked = (st) => !!(blocked && st.route && st.route.edges.some((eid) => blocked(graph.edges[eid])));
  const api = {
    stateOf: S,
    clear(id) { const st = S(id); if (st.route || st.target) { st.route = null; st.cum = null; st.target = null; st.turns = []; st.version++; st.reason = 'none'; } },
    // halfWidth: half the width of the road under the player (a wide avenue tolerates more).
    update(id, pos, target, dt, { halfWidth = 7, force = false } = {}) {
      const st = S(id);
      st.gap = Math.max(0, st.gap - dt);
      if (!target) { if (st.route || st.target) api.clear(id); return st; }
      const moved = !st.target || Math.hypot(target.x - st.target.x, target.z - st.target.z) > GPS.targetMoved;
      if (force || moved) { compute(st, pos, target, moved ? 'target' : 'forced'); }
      else if (st.gap <= 0 && routeBlocked(st)) { compute(st, pos, target, 'blocked'); }
      if (!st.route) return st;
      const pr = projectOnPolyline(st.route.points, st.cum, pos.x, pos.z, st.hint);
      // A far jump (fast travel, a teleport) loses the window: search the whole route once.
      const p = pr.d > 40 && st.hint >= 0 ? projectOnPolyline(st.route.points, st.cum, pos.x, pos.z) : pr;
      st.s = p.s; st.off = p.d; st.hint = p.i;
      if (p.d > halfWidth + GPS.offRoute) st.offT += dt; else st.offT = 0;
      if (st.offT > GPS.offRouteTime && st.gap <= 0) compute(st, pos, target, 'offRoute');
      return st;
    },
  };
  return api;
}
