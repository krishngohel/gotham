// World queries the crime composer needs (crimeTypes.js `geo`), answered from the real city: the
// street graph (getaway routes, foot chases, tails), the roof records (rooftop chases, sniper
// nests), the El's live train records, the bascule bridges. Pure given its inputs (the world
// object), so a unit test can hand it a small graph. Paths are plain arrays of { x, y, z, hop? }.
export function createGeo({ graph = null, roofs = [], el = null, bridges = null, rng }) {
  const rand = () => rng.next();

  // A walk along the street graph from the node nearest `from`, `len` metres long, never turning
  // straight back and preferring streets that carry lanes (cars) unless on foot.
  function streetPath(from, len = 150, { foot = false } = {}) {
    const start = { x: from.x, y: from.y ?? 0, z: from.z };
    if (!graph?.nodes?.length) return [start, { x: from.x + len, y: start.y, z: from.z }];
    let n = graph.nearestNode(from.x, from.z, { y: from.y ?? 0 });
    if (n == null || n < 0) return [start, { x: from.x + len, y: start.y, z: from.z }];
    if (typeof n === 'object') n = n.id;
    const pts = [start];
    let acc = 0, prev = -1;
    const seen = new Set([n]);
    for (let guard = 0; guard < 40 && acc < len; guard++) {
      const N = graph.nodes[n];
      pts.push({ x: N.x, y: N.y ?? 0, z: N.z });
      const options = [];
      for (const eid of graph.adj[n]) {
        const e = graph.edges[eid];
        const m = e.a === n ? e.b : e.a;
        if (e.oneway && e.a !== n) continue;
        if (m === prev || seen.has(m)) continue;
        if (!foot && e.lanes === 0) continue;
        options.push(m);
      }
      if (!options.length) break;
      const m = options[Math.floor(rand() * options.length)];
      const M = graph.nodes[m];
      acc += Math.hypot(M.x - N.x, M.z - N.z);
      prev = n; n = m; seen.add(m);
    }
    const last = graph.nodes[n];
    pts.push({ x: last.x, y: last.y ?? 0, z: last.z });
    return dedupe(pts);
  }

  // Roof hops: from the roof nearest `from`, `hops` jumps to neighbouring roofs (gap under 22 m,
  // height change under 7 m), never back. Points sit on the roof centres at roof height; a hop
  // flag arcs the segment over the gap.
  function roofPath(from, hops = 5) {
    const near = (x, z, r) => roofs.filter((o) => Math.hypot(o.x - x, o.z - z) < r && o.y > 6 && o.w > 5 && o.d > 5);
    let cur = near(from.x, from.z, 60).sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))[0];
    if (!cur) return [{ x: from.x, y: from.y ?? 0, z: from.z }, { x: from.x + 80, y: from.y ?? 0, z: from.z }];
    const pts = [{ x: cur.x, y: cur.y, z: cur.z }];
    const used = new Set([cur]);
    for (let i = 0; i < hops; i++) {
      const next = roofs.filter((o) => !used.has(o) && o.y > 6 && Math.abs(o.y - cur.y) < 7 && gap(cur, o) < 22 && Math.hypot(o.x - cur.x, o.z - cur.z) > 10);
      if (!next.length) break;
      const o = next[Math.floor(rand() * next.length)];
      used.add(o);
      pts.push({ x: o.x, y: o.y, z: o.z, hop: true });
      cur = o;
    }
    return pts;
  }
  const gap = (a, b) => Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2, Math.abs(a.z - b.z) - (a.d + b.d) / 2);

  // Sniper nests: the n highest roofs 25-70 m from `at`, spread around it.
  function roofsNear(at, n = 3) {
    const cand = roofs.filter((o) => { const d = Math.hypot(o.x - at.x, o.z - at.z); return d > 25 && d < 70 && o.y > 10; })
      .sort((a, b) => b.y - a.y);
    const out = [];
    for (const o of cand) {
      if (out.some((p) => Math.hypot(p.x - o.x, p.z - o.z) < 25)) continue;
      out.push({ x: o.x, y: o.y, z: o.z });
      if (out.length >= n) break;
    }
    while (out.length < n) out.push({ x: at.x + (out.length - 1) * 20, y: at.y ?? 0, z: at.z + 30 });
    return out;
  }

  // The El train nearest `at` (its id), or null.
  function train(at) {
    const list = el?.state ?? [];
    let best = null, bd = Infinity;
    for (const s of list) { if (s.line !== 'loop') continue; const d = Math.hypot(s.x - at.x, s.z - at.z); if (d < bd) { bd = d; best = s.id; } }
    return best ?? list[0]?.id ?? null;
  }
  const trainState = (id) => (el?.state ?? []).find((s) => s.id === id) ?? null;

  // The bascule bridge nearest `at` within 260 m: its id, the bridgehouse (the canal wall's
  // street end) and where the hanging car is (on the leaf's near end).
  function bridge(at) {
    const list = bridges?.list ?? [];
    let best = null, bd = Infinity;
    for (const b of list) { const c = mid(b); if (!c) continue; const d = Math.hypot(c.x - at.x, c.z - at.z); if (d < bd) { bd = d; best = b; } }
    if (!best || bd > 260) return null;
    // A bridge runs north-south (x, z0..z1: the river) or east-west (axis 'x', z, x0..x1: the
    // branches). The bridgehouse stands at the near end, the car hangs on the leaf.
    if (best.axis === 'x') {
      const east = Math.max(best.x0, best.x1);
      return { id: best.id, house: { x: east + 5, y: 0, z: best.z + 9 }, car: { x: east - 4, y: 0, z: best.z } };
    }
    const south = Math.max(best.z0, best.z1);
    return { id: best.id, house: { x: best.x + 9, y: 0, z: south + 5 }, car: { x: best.x, y: 0, z: south - 4 } };
  }
  const mid = (b) => (b.axis === 'x' ? (Number.isFinite(b.x0) ? { x: (b.x0 + b.x1) / 2, z: b.z } : null) : Number.isFinite(b.z0) ? { x: b.x, z: (b.z0 + b.z1) / 2 } : null);

  return { streetPath, roofPath, roofsNear, train, trainState, bridge };
}

function dedupe(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = out[out.length - 1];
    if (Math.hypot(pts[i].x - p.x, pts[i].z - p.z) > 0.5) out.push(pts[i]);
  }
  if (out.length < 2) out.push({ x: out[0].x + 10, y: out[0].y, z: out[0].z });
  return out;
}
