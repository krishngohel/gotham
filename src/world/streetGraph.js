// The street graph: intersections (nodes) joined by street segments (edges) carrying lane data,
// shared by traffic, civilians' sidewalks, the GPS route, vehicle AI and crime spawn points
// (Long Night 2 contract 4.2). Pure (no three.js) and unit-tested.
//
//   node = { id, x, y, z, deck, region }
//   edge = { id, a, b, length, width, lanes, oneway, sidewalk, deck, kind, region, bridge, y0, y1 }
//     width     kerb to kerb, metres; lanes: total lanes (split evenly unless oneway)
//     oneway    true: traffic runs a -> b only
//     sidewalk  sidewalk width each side (0: none); sidewalkLines(edge) gives the walking lines
//     deck      'street' | 'lower' | 'bridge' | 'ramp' | 'el' ... (which level it is on)
//     kind      'street' | 'drive' | 'bridge' | 'ramp' | 'plaza'
//     bridge    id of a movable bridge the edge crosses (traffic and routes check it is down)
// Positions are on the road surface (y), so a route polyline can be drawn straight onto it.

export function createStreetGraph() {
  const nodes = [];
  const edges = [];
  const adj = []; // node id -> edge ids

  // Reuses a node within 0.5 m on the same deck: streets meeting at an intersection share it.
  function addNode(x, z, { y = 0, deck = 'street', region = null } = {}) {
    for (const n of nodes) if (n.deck === deck && Math.abs(n.x - x) < 0.5 && Math.abs(n.z - z) < 0.5 && Math.abs(n.y - y) < 0.5) return n.id;
    const id = nodes.length;
    nodes.push({ id, x, y, z, deck, region });
    adj.push([]);
    return id;
  }

  function addEdge(a, b, { width = 14, lanes = 2, oneway = false, sidewalk = 0, deck = null, kind = 'street', region = null, bridge = null } = {}) {
    if (a === b) return -1;
    for (const e of adj[a]) { const E = edges[e]; if ((E.a === a && E.b === b) || (!E.oneway && E.a === b && E.b === a)) return e; }
    const A = nodes[a], B = nodes[b];
    const id = edges.length;
    edges.push({
      id, a, b, length: Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z), width, lanes, oneway, sidewalk,
      deck: deck ?? A.deck, kind, region: region ?? A.region, bridge, y0: A.y, y1: B.y,
    });
    adj[a].push(id);
    adj[b].push(id);
    return id;
  }

  // A straight street through a list of points; consecutive points become edges.
  function addStreet(points, opts = {}) {
    const ids = points.map((p) => addNode(p.x, p.z, { y: p.y ?? 0, deck: p.deck ?? 'street', region: opts.region ?? null }));
    for (let i = 0; i + 1 < ids.length; i++) addEdge(ids[i], ids[i + 1], opts);
    return ids;
  }

  const other = (e, n) => (e.a === n ? e.b : e.a);
  const canTravel = (e, from, blocked) => (!e.oneway || e.a === from) && !(blocked && blocked(e));

  // A* from node `start` to node `goal`. blocked(edge) -> true skips an edge (a raised bridge).
  // Returns { nodes: [ids], edges: [ids], length } or null.
  function route(start, goal, { blocked = null } = {}) {
    if (start === goal) return { nodes: [start], edges: [], length: 0 };
    const G = nodes[goal];
    const h = (n) => Math.hypot(nodes[n].x - G.x, nodes[n].y - G.y, nodes[n].z - G.z);
    const g = new Map([[start, 0]]);
    const came = new Map();
    const open = [[h(start), start]];
    const closed = new Set();
    while (open.length) {
      // Small graphs (hundreds of nodes): a linear pop beats a heap's bookkeeping.
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, n] = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (n === goal) break;
      if (closed.has(n)) continue;
      closed.add(n);
      for (const eid of adj[n]) {
        const e = edges[eid];
        if (!canTravel(e, n, blocked)) continue;
        const m = other(e, n);
        if (closed.has(m)) continue;
        const cost = g.get(n) + e.length;
        if (cost < (g.get(m) ?? Infinity)) {
          g.set(m, cost);
          came.set(m, [n, eid]);
          open.push([cost + h(m), m]);
        }
      }
    }
    if (!came.has(goal)) return null;
    const outN = [goal], outE = [];
    for (let n = goal; n !== start;) { const [p, e] = came.get(n); outE.push(e); outN.push(p); n = p; }
    outN.reverse(); outE.reverse();
    return { nodes: outN, edges: outE, length: g.get(goal) };
  }

  // Nearest node to (x, z) (y breaks ties between decks: pass the height you are at).
  function nearestNode(x, z, { y = null, deck = null, maxDist = Infinity } = {}) {
    let best = -1, bd = maxDist * maxDist;
    for (const n of nodes) {
      if (deck && n.deck !== deck) continue;
      const dy = y === null ? 0 : (n.y - y) * 3; // a deck 5 m away is "far"
      const d = (n.x - x) ** 2 + (n.z - z) ** 2 + dy * dy;
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }

  // Nearest point on any edge: { edge, t (0..1 from a), x, y, z, dist } or null.
  function nearestEdge(x, z, { y = null, maxDist = Infinity, filter = null } = {}) {
    let best = null, bd = maxDist;
    for (const e of edges) {
      if (filter && !filter(e)) continue;
      const A = nodes[e.a], B = nodes[e.b];
      const dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - A.x) * dx + (z - A.z) * dz) / L2)) : 0;
      const px = A.x + dx * t, pz = A.z + dz * t, py = A.y + (B.y - A.y) * t;
      const dy = y === null ? 0 : (py - y) * 3;
      const d = Math.sqrt((px - x) ** 2 + (pz - z) ** 2 + dy * dy);
      if (d < bd) { bd = d; best = { edge: e.id, t, x: px, y: py, z: pz, dist: d }; }
    }
    return best;
  }

  // Route between two world points: snaps both to the nearest edge, routes between the edge
  // ends, and returns a polyline on the road surface from the snap point to the snap point,
  // { points: [{ x, y, z }], length, edges } or null. `lane` (metres) shifts the line to the right
  // of the direction of travel, so it can be painted on a lane instead of the centre line.
  function routeBetween(from, to, { blocked = null, lane = 0 } = {}) {
    const sa = nearestEdge(from.x, from.z, { y: from.y ?? null });
    const sb = nearestEdge(to.x, to.z, { y: to.y ?? null });
    if (!sa || !sb) return null;
    const ea = edges[sa.edge], eb = edges[sb.edge];
    let best = null;
    if (ea.id === eb.id) {
      best = { mid: [], length: Math.hypot(sb.x - sa.x, sb.z - sa.z), edges: [ea.id] };
    } else {
      for (const na of [ea.a, ea.b]) {
        if (ea.oneway && na === ea.a) continue; // can only leave a one-way edge at its b end
        for (const nb of [eb.a, eb.b]) {
          if (eb.oneway && nb === eb.b) continue; // and enter one at its a end
          const r = route(na, nb, { blocked });
          if (!r) continue;
          const A = nodes[na], B = nodes[nb];
          const len = Math.hypot(A.x - sa.x, A.z - sa.z) + r.length + Math.hypot(B.x - sb.x, B.z - sb.z);
          if (!best || len < best.length) best = { mid: r.nodes, length: len, edges: [ea.id, ...r.edges, eb.id] };
        }
      }
    }
    if (!best) return null;
    const pts = [{ x: sa.x, y: sa.y, z: sa.z }, ...best.mid.map((n) => ({ x: nodes[n].x, y: nodes[n].y, z: nodes[n].z })), { x: sb.x, y: sb.y, z: sb.z }];
    const clean = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z) > 0.05);
    return { points: lane ? offsetPolyline(clean, lane) : clean, length: best.length, edges: best.edges };
  }

  // The two walking lines of an edge (centre of each sidewalk), as [[a, b], [a, b]] or [].
  function sidewalkLines(e) {
    if (!e.sidewalk) return [];
    const A = nodes[e.a], B = nodes[e.b];
    const L = Math.hypot(B.x - A.x, B.z - A.z) || 1;
    const nx = -(B.z - A.z) / L, nz = (B.x - A.x) / L;
    const off = e.width / 2 + e.sidewalk / 2;
    return [1, -1].map((s) => [
      { x: A.x + nx * off * s, y: A.y, z: A.z + nz * off * s },
      { x: B.x + nx * off * s, y: B.y, z: B.z + nz * off * s },
    ]);
  }

  // Distinct centre-line coordinates of the straight x- and z-running streets of a region (the
  // core's traffic still drives these lines one at a time; see src/world/cityLife.js).
  function axisLines(region) {
    const xs = new Set(), zs = new Set();
    for (const e of edges) {
      if (region && e.region !== region) continue;
      const A = nodes[e.a], B = nodes[e.b];
      if (Math.abs(A.x - B.x) < 0.01) xs.add(A.x);
      else if (Math.abs(A.z - B.z) < 0.01) zs.add(A.z);
    }
    return { x: [...xs].sort((p, q) => p - q), z: [...zs].sort((p, q) => p - q) };
  }

  return { nodes, edges, adj, addNode, addEdge, addStreet, route, routeBetween, nearestNode, nearestEdge, sidewalkLines, axisLines, other: (eid, n) => other(edges[eid], n) };
}

// Shifts a polyline sideways by `d` metres (positive: to the right of travel, looking down +y
// with x east and z south). Corners are mitred.
export function offsetPolyline(pts, d) {
  if (pts.length < 2) return pts.map((p) => ({ ...p }));
  const seg = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const dx = pts[i + 1].x - pts[i].x, dz = pts[i + 1].z - pts[i].z, L = Math.hypot(dx, dz) || 1;
    // Right of travel for a heading (dx, dz) in this frame is (-dz, dx).
    seg.push({ x: -dz / L, z: dx / L });
  }
  return pts.map((p, i) => {
    const a = seg[Math.max(0, i - 1)], b = seg[Math.min(seg.length - 1, i)];
    let nx = a.x + b.x, nz = a.z + b.z;
    const L = Math.hypot(nx, nz);
    if (L < 1e-6) { nx = b.x; nz = b.z; } else { nx /= L; nz /= L; }
    const k = Math.max(0.5, nx * b.x + nz * b.z); // mitre, capped at 2x
    return { x: p.x + (nx * d) / k, y: p.y, z: p.z + (nz * d) / k };
  });
}

// Length of a polyline, and the point and heading `s` metres along it (wrapping when closed).
export function polylineLength(pts) {
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y, pts[i + 1].z - pts[i].z);
  return L;
}
export function pointAlong(pts, s, out = { x: 0, y: 0, z: 0, yaw: 0 }) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (s <= L || i + 2 === pts.length) {
      const t = L > 0 ? Math.min(1, Math.max(0, s / L)) : 0;
      out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t;
      out.yaw = Math.atan2(b.x - a.x, b.z - a.z);
      return out;
    }
    s -= L;
  }
  const p = pts[pts.length - 1];
  out.x = p.x; out.y = p.y; out.z = p.z;
  return out;
}
