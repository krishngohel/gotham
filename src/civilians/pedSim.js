// Pedestrians as pure simulation (no three.js), on the street graph's sidewalks (workstream M).
// crowd.js draws what this moves; civilians.js wires it to the game.
//
//   network   every street edge with a sidewalk gives two walking lines (sidewalkLines: the centre
//             of each sidewalk), trimmed back at junctions so they end at the corners; footpaths
//             (deck 'walk') give one line. Line ends meeting at a graph node connect: ends within
//             a few metres are a corner (walk round it); ends straight across a street are a
//             crossing, taken on the walk signal of the junction (the traffic sim's 12 s cycle:
//             walk while the traffic parallel to you has green) or, without a signal, when no car
//             is close. A crossing pedestrian is an obstacle the traffic brakes for (cityLife.js).
//   agents    a fixed pool; spawned out of sight around every anchor (each player, plus the camera)
//             up to a target from the district's spawn table, the hour and the weather; despawned
//             when no anchor is near. They walk, stop for activities (window-shopping, a phone
//             call, a chat with a passer-by, a photo, waiting, a registered spot such as a bench,
//             a newsstand or an El platform), and react to heroes, fights, gunfire and gadgets
//             (reactions.js). Police officers walk beats and run to crimes.
// update() allocates nothing: agents and scratch are made once.
import { ARCHETYPES, mixAt, pickWeighted, targetCount, umbrellaShare } from './archetypes.js';
import { decideReaction, REACTION_TIME, URGENCY } from './reactions.js';

const CORNER = 3.2;      // m: line ends closer than this are one corner
const CROSS_MAX = 26;    // m: farthest crossing (a 20 m avenue plus both sidewalks)
const CELL = 48;         // m: spawn grid

// ---------------------------------------------------------------- the sidewalk network (pure)

const isWalk = (e) => e.lanes === 0 && (e.kind === 'walk' || e.deck === 'walk');

export function buildSidewalkNetwork(graph) {
  const { nodes, edges, adj } = graph;
  // Widest street at each node (for trimming lines back to the corner).
  const deg = new Int32Array(nodes.length);
  for (const e of edges) { if (e.sidewalk > 0 || isWalk(e)) { deg[e.a]++; deg[e.b]++; } }
  const widthAt = (node, except) => {
    let w = 0;
    for (const id of adj[node]) { const e = edges[id]; if (id !== except && e.lanes > 0) w = Math.max(w, e.width); }
    return w;
  };
  const lines = [], ends = [];
  const byNode = nodes.map(() => []);
  for (const e of edges) {
    const walk = isWalk(e);
    if (!(e.sidewalk > 0) && !walk) continue;
    const A = nodes[e.a], B = nodes[e.b];
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz);
    if (L < 2) continue;
    const ux = dx / L, uz = dz / L;
    const nx = -uz, nz = ux;
    const off = walk ? 0 : e.width / 2 + e.sidewalk / 2;
    // Trim at junctions so the line ends at the corner of the crossing street's sidewalk.
    const trimA = !walk && deg[e.a] >= 3 ? Math.min(L * 0.45, widthAt(e.a, e.id) / 2 + e.sidewalk / 2) : 0;
    const trimB = !walk && deg[e.b] >= 3 ? Math.min(L * 0.45, widthAt(e.b, e.id) / 2 + e.sidewalk / 2) : 0;
    if (L - trimA - trimB < 2) continue;
    for (const side of walk ? [0] : [1, -1]) {
      const id = lines.length;
      const ax = A.x + ux * trimA + nx * off * side, az = A.z + uz * trimA + nz * off * side;
      const bx = B.x - ux * trimB + nx * off * side, bz = B.z - uz * trimB + nz * off * side;
      const ay = A.y + (B.y - A.y) * (trimA / L), by = B.y - (B.y - A.y) * (trimB / L);
      const line = {
        id, edge: e.id, side, region: e.region, walk, width: walk ? e.width : e.sidewalk,
        ax, ay, az, bx, by, bz, len: Math.hypot(bx - ax, bz - az), ux, uz, nx: nx * (side || 1), nz: nz * (side || 1),
        nodeA: e.a, nodeB: e.b, endA: ends.length, endB: ends.length + 1, mx: (ax + bx) / 2, mz: (az + bz) / 2,
      };
      ends.push({ id: line.endA, line: id, atB: false, node: e.a, x: ax, y: ay, z: az, links: null });
      ends.push({ id: line.endB, line: id, atB: true, node: e.b, x: bx, y: by, z: bz, links: null });
      byNode[e.a].push(line.endA);
      byNode[e.b].push(line.endB);
      lines.push(line);
    }
  }
  // Links: [{ to: endId, cross: bool, axis: 'x'|'z' }] per end.
  for (const end of ends) {
    end.links = [];
    for (const o of byNode[end.node]) {
      if (o === end.id) continue;
      const q = ends[o];
      if (q.line === end.line) continue;
      const dx = q.x - end.x, dz = q.z - end.z, d = Math.hypot(dx, dz);
      const walkish = lines[end.line].walk || lines[q.line].walk;
      if (d < CORNER || (walkish && d < 9)) end.links.push({ to: o, cross: false, axis: null, d });
      else if (d < CROSS_MAX && Math.min(Math.abs(dx), Math.abs(dz)) < 0.3 * d) end.links.push({ to: o, cross: true, axis: Math.abs(dx) > Math.abs(dz) ? 'x' : 'z', d });
    }
  }
  // Spawn grid.
  const cells = new Map();
  for (const l of lines) {
    const k = cellKey(Math.floor(l.mx / CELL), Math.floor(l.mz / CELL));
    let c = cells.get(k);
    if (!c) cells.set(k, c = []);
    c.push(l.id);
  }
  return { lines, ends, byNode, cells, cellKey };
}
function cellKey(i, j) { return (i + 512) * 1024 + (j + 512); }

// Point on a line at s (0..len) with a lateral offset (toward the line's outer side). Pure.
export function pointOnLine(l, s, lat, out) {
  const t = l.len > 0 ? s / l.len : 0;
  out.x = l.ax + (l.bx - l.ax) * t + l.nx * lat;
  out.y = l.ay + (l.by - l.ay) * t;
  out.z = l.az + (l.bz - l.az) * t + l.nz * lat;
  return out;
}

// May a pedestrian start across now? signal: 0 green / 1 amber / 2 red for the traffic running
// along the crossing direction (walk with the parallel green), -1 for no signal (then only when
// no car is close). Pure.
export function mayCross(signal, carClose) {
  if (signal === -1) return !carClose;
  return signal === 0 && !carClose;
}

// ---------------------------------------------------------------- the simulation

const MODES = ['walk', 'wait', 'cross', 'act', 'react', 'flee', 'respond', 'spot'];
export { MODES };

export function createPedSim({
  graph, network = buildSidewalkNetwork(graph), cap = 80, rng,
  districtAt = () => 'city', tableAt = () => ({ density: 0.6, kinds: ['walker'] }),
  signalAt = () => -1, carNear = () => false, hour = () => 12, weather = () => null,
  spawn = {}, visible = () => false, routeTo = null,
}) {
  const { lines, ends, cells } = network;
  const spawnMin = spawn.min ?? 30, spawnMax = spawn.max ?? 90, despawnR = spawn.despawn ?? spawnMax + 25;
  const agents = [];
  let limitScale = 1; // [perf3] see setLimitScale
  for (let i = 0; i < cap; i++) {
    agents.push({
      i, active: false, seed: 0, arch: 'walker', line: 0, s: 0, dir: 1, lat: 0, latGoal: 0, speed: 1.2, baseSpeed: 1.2,
      mode: 'walk', t: 0, x: 0, y: 0, z: 0, yaw: 0, fx: 0, fz: 1,
      // crossing / corner / spot legs: from (x0, z0) to (x1, z1), then onto end `nextEnd`
      x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, legT: 0, legLen: 0, nextEnd: -1, crossing: false, axis: null, node: -1,
      act: null, actT: 0, reaction: 'ignore', reactT: 0, srcX: 0, srcZ: 0, partner: -1, spot: -1,
      umbrella: false, police: false, seenAt: -1e9, speedSet: -1, walkClip: 0, idleClip: 0, route: null, routeS: 0, routeLen: 0, district: 'city', fresh: true,
    });
  }
  let active = 0, nextSeed = 1, spawnT = 0, filled = false, anchorTurn = 0, now = 0;
  const spots = []; // registered activity spots: { kind, x, y, z, yaw, cap, used, line, s }
  const mix = {};
  const tmp = { x: 0, y: 0, z: 0 };

  const nearestAnchor = (x, z, anchors, n) => { let d = Infinity; for (let k = 0; k < n; k++) { const a = anchors[k]; const q = Math.hypot(a.x - x, a.z - z); if (q < d) d = q; } return d; };

  function despawn(a) {
    if (!a.active) return;
    a.active = false; active--;
    if (a.spot >= 0) { spots[a.spot].used--; a.spot = -1; }
    if (a.partner >= 0) { const p = agents[a.partner]; if (p.partner === a.i) { p.partner = -1; if (p.mode === 'act') p.actT = 0; } a.partner = -1; }
  }

  function setOnLine(a, lineId, s, dir) {
    a.line = lineId; a.s = s; a.dir = dir;
    const l = lines[lineId];
    pointOnLine(l, s, a.lat, a);
    a.fx = l.ux * dir; a.fz = l.uz * dir;
    a.yaw = Math.atan2(a.fx, a.fz);
  }

  function spawnAt(a, lineId, s, dir) {
    const l = lines[lineId];
    a.active = true; active++;
    a.seed = nextSeed++;
    a.district = districtAt(l.mx, l.mz);
    const table = tableAt(l.mx, l.mz, a.district);
    mixAt(table.kinds, a.district, hour(), mix);
    a.arch = pickWeighted(mix, rng.next()) ?? 'walker';
    const A = ARCHETYPES[a.arch] ?? ARCHETYPES.walker;
    a.police = !!A.police;
    a.walkClip = Math.floor(rng.next() * A.walks.length);
    a.idleClip = Math.floor(rng.next() * A.idles.length);
    a.umbrella = !a.police && a.arch !== 'jogger' && rng.next() < umbrellaShare(weather());
    a.baseSpeed = a.speed = 1; // crowd.js sets the clip's natural speed (setSpeed)
    a.lat = (rng.next() - 0.5) * Math.min(1.4, l.width * 0.5);
    a.latGoal = a.lat;
    a.mode = 'walk'; a.t = 0; a.act = null; a.reaction = 'ignore'; a.reactT = 0; a.partner = -1; a.spot = -1; a.route = null; a.seenAt = -1e9;
    a.fresh = true;
    setOnLine(a, lineId, s, dir);
  }

  // A spawn on a sidewalk between rMin and rMax from `anchor`, out of sight when `hidden`.
  function trySpawn(anchors, n, anchor, rMin, rMax, hidden) {
    const a = agents.find((q) => !q.active);
    if (!a) return false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = rng.next() * Math.PI * 2, r = rMin + (rMax - rMin) * rng.next();
      const px = anchor.x + Math.cos(ang) * r, pz = anchor.z + Math.sin(ang) * r;
      const cell = cells.get(network.cellKey(Math.floor(px / CELL), Math.floor(pz / CELL)));
      if (!cell) continue;
      const l = lines[cell[Math.floor(rng.next() * cell.length)]];
      if (Math.abs(l.ay - anchor.y) > 12 && Math.abs(l.by - anchor.y) > 12 && anchor.y < 20) continue;
      const s = l.len * (0.1 + 0.8 * rng.next());
      pointOnLine(l, s, 0, tmp);
      const dA = nearestAnchor(tmp.x, tmp.z, anchors, n);
      if (dA < rMin * 0.8 || dA > rMax * 1.1) continue;
      if (hidden && visible(tmp.x, tmp.y, tmp.z)) continue;
      spawnAt(a, l.id, s, rng.next() < 0.5 ? 1 : -1);
      return true;
    }
    return false;
  }

  // At the end of a line: pick the next way on (corner, crossing, or back).
  function arrive(a) {
    const l = lines[a.line];
    const endId = a.dir > 0 ? l.endB : l.endA;
    const end = ends[endId];
    const links = end.links;
    let total = 0;
    for (let k = 0; k < links.length; k++) total += linkWeight(a, end, links[k]);
    if (total <= 0) { a.dir = -a.dir; a.fx = -a.fx; a.fz = -a.fz; a.yaw = Math.atan2(a.fx, a.fz); return; }
    let x = rng.next() * total, pick = links[links.length - 1];
    for (let k = 0; k < links.length; k++) { x -= linkWeight(a, end, links[k]); if (x <= 0) { pick = links[k]; break; } }
    const to = ends[pick.to];
    a.x0 = a.x; a.y0 = a.y; a.z0 = a.z;
    a.x1 = to.x + lines[to.line].nx * a.lat; a.y1 = to.y; a.z1 = to.z + lines[to.line].nz * a.lat;
    a.legLen = Math.max(0.01, Math.hypot(a.x1 - a.x0, a.z1 - a.z0)); a.legT = 0;
    a.nextEnd = pick.to; a.crossing = pick.cross; a.axis = pick.axis; a.node = end.node;
    a.fx = (a.x1 - a.x0) / a.legLen; a.fz = (a.z1 - a.z0) / a.legLen;
    a.mode = pick.cross ? 'wait' : 'cross';
    a.t = 0;
  }
  function linkWeight(a, end, link) {
    const q = ends[link.to];
    const ql = lines[q.line];
    // Heading out of the next line (away from the node).
    const ox = q.atB ? -ql.ux : ql.ux, oz = q.atB ? -ql.uz : ql.uz;
    const d = a.fx * ox + a.fz * oz;
    let w = d > 0.7 ? 3 : d > -0.3 ? 1.2 : 0.15;
    if (link.cross) w *= 0.8;
    // Fleeing: away from the danger only.
    if (a.mode === 'flee') { const away = (q.x - a.srcX) * ox + (q.z - a.srcZ) * oz; w = away > 0 ? w : 0.02; }
    return w;
  }
  function enterNext(a) {
    const q = ends[a.nextEnd];
    const l = lines[q.line];
    setOnLine(a, q.line, q.atB ? l.len : 0, q.atB ? -1 : 1);
    a.mode = a.reaction === 'flee' ? 'flee' : 'walk';
    if (a.reaction !== 'flee') a.speed = a.baseSpeed;
    a.crossing = false;
  }

  // An activity on the spot (no registered spot needed).
  function startActivity(a, t) {
    const A = ARCHETYPES[a.arch] ?? ARCHETYPES.walker;
    let act = pickWeighted(A.activities, rng.next()) ?? 'phone';
    if (act === 'talk') {
      // A chat needs someone close who is walking too.
      let best = -1, bd = 4;
      for (let k = 0; k < agents.length; k++) {
        const b = agents[k];
        if (!b.active || b === a || b.mode !== 'walk' || b.police) continue;
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d < bd) { bd = d; best = k; }
      }
      if (best < 0) act = 'phone';
      else {
        const b = agents[best];
        a.partner = best; b.partner = a.i;
        b.mode = 'act'; b.act = 'talk'; b.actT = a.actT = 8 + rng.next() * 10; b.t = 0;
        b.yaw = Math.atan2(a.x - b.x, a.z - b.z);
        a.yaw = Math.atan2(b.x - a.x, b.z - a.z);
      }
    }
    if (act === 'window' || act === 'loiter') a.yaw = Math.atan2(lines[a.line].nx, lines[a.line].nz); // face the shops
    if (act === 'photo') a.yaw = Math.atan2(-lines[a.line].nx, -lines[a.line].nz); // face the street
    if (['sit', 'queue', 'vendor', 'musician', 'doorman', 'newspaper'].includes(act)) act = 'wait';
    a.act = act;
    if (act !== 'talk') a.actT = 4 + rng.next() * 9;
    a.mode = 'act'; a.t = 0;
  }

  // A registered spot within reach: walk to it, do its thing, walk back.
  function trySpot(a) {
    const A = ARCHETYPES[a.arch] ?? ARCHETYPES.walker;
    for (let k = 0; k < spots.length; k++) {
      const sp = spots[k];
      if (sp.used >= sp.cap) continue;
      if (!(A.activities[sp.kind] > 0) && !(sp.kind === 'wait' || sp.kind === 'sit')) continue;
      const d = Math.hypot(sp.x - a.x, sp.z - a.z);
      if (d > 7 || Math.abs(sp.y - a.y) > 3) continue;
      sp.used++; a.spot = k;
      a.x0 = a.x; a.y0 = a.y; a.z0 = a.z; a.x1 = sp.x; a.y1 = sp.y; a.z1 = sp.z;
      a.legLen = Math.max(0.01, d); a.legT = 0;
      a.fx = (a.x1 - a.x0) / a.legLen; a.fz = (a.z1 - a.z0) / a.legLen;
      a.mode = 'spot'; a.act = sp.kind; a.actT = 8 + rng.next() * 14; a.t = 0;
      return true;
    }
    return false;
  }

  function leg(a, dt, speed) {
    a.legT += speed * dt;
    const k = Math.min(1, a.legT / a.legLen);
    a.x = a.x0 + (a.x1 - a.x0) * k; a.y = a.y0 + (a.y1 - a.y0) * k; a.z = a.z0 + (a.z1 - a.z0) * k;
    a.yaw = Math.atan2(a.fx, a.fz);
    return k >= 1;
  }

  function step(a, dt, t) {
    a.t += dt;
    if (a.reactT > 0) { a.reactT -= dt; if (a.reactT <= 0) endReaction(a); }
    // Lateral drift (stepping aside, passing room).
    a.lat += (a.latGoal - a.lat) * Math.min(1, dt * 3);
    switch (a.mode) {
      case 'walk':
      case 'flee': {
        const l = lines[a.line];
        const v = a.speed * (a.mode === 'flee' ? 1 : 1);
        a.s += v * dt * a.dir;
        if (a.s >= l.len || a.s <= 0) { a.s = Math.max(0, Math.min(l.len, a.s)); pointOnLine(l, a.s, a.lat, a); arrive(a); return; }
        pointOnLine(l, a.s, a.lat, a);
        // Now and then: stop for something.
        if (a.mode === 'walk' && !a.police && a.t > 6) {
          const A = ARCHETYPES[a.arch] ?? ARCHETYPES.walker;
          if (rng.next() < dt * 0.06 * A.pause) { if (!trySpot(a)) startActivity(a, t); }
        }
        if (a.mode === 'walk' && a.police && a.t > 20 && rng.next() < dt * 0.02) { a.act = 'loiter'; a.actT = 6 + rng.next() * 8; a.mode = 'act'; a.t = 0; }
        return;
      }
      case 'wait': {
        // At a crossing: the walk signal, and no car in the way.
        const sig = signalAt(a.node, a.axis, t);
        const close = carNear((a.x + a.x1) / 2, (a.z + a.z1) / 2, 9);
        if (mayCross(sig, close) || a.t > 40 || a.reaction === 'flee') { a.mode = 'cross'; a.t = 0; }
        return;
      }
      case 'cross': {
        const hurry = a.crossing ? 1.15 : 1;
        if (leg(a, dt, a.speed * hurry)) enterNext(a);
        return;
      }
      case 'spot': {
        if (a.actT > 0) {
          if (a.legT < a.legLen) { leg(a, dt, a.speed); if (a.legT >= a.legLen) a.yaw = spots[a.spot]?.yaw ?? a.yaw; return; }
          a.actT -= dt;
          return;
        }
        // Back to the sidewalk.
        const l = lines[a.line];
        pointOnLine(l, a.s, a.lat, tmp);
        if (a.x1 !== tmp.x || a.z1 !== tmp.z) {
          a.x0 = a.x; a.y0 = a.y; a.z0 = a.z; a.x1 = tmp.x; a.y1 = tmp.y; a.z1 = tmp.z;
          a.legLen = Math.max(0.01, Math.hypot(a.x1 - a.x0, a.z1 - a.z0)); a.legT = 0;
          a.fx = (a.x1 - a.x0) / a.legLen; a.fz = (a.z1 - a.z0) / a.legLen;
        }
        if (leg(a, dt, a.speed)) {
          if (a.spot >= 0) { spots[a.spot].used--; a.spot = -1; }
          a.mode = 'walk'; a.act = null; a.t = 0;
          setOnLine(a, a.line, a.s, a.dir);
        }
        return;
      }
      case 'act': {
        a.actT -= dt;
        if (a.actT <= 0) {
          if (a.partner >= 0) { const p = agents[a.partner]; if (p.partner === a.i) { p.partner = -1; p.actT = Math.min(p.actT, 0.5); } a.partner = -1; }
          a.mode = 'walk'; a.act = null; a.t = 0;
          setOnLine(a, a.line, a.s, a.dir);
        }
        return;
      }
      case 'react': return; // standing, facing the source, until the reaction ends
      case 'respond': {
        if (!a.route) { a.mode = 'walk'; return; }
        a.routeS += a.speed * dt;
        if (a.routeS >= a.routeLen) {
          a.route = null; a.speed = a.baseSpeed;
          snapToNetwork(a);
          a.mode = 'react'; a.reaction = 'stare'; a.reactT = 15;
          a.yaw = Math.atan2(a.srcX - a.x, a.srcZ - a.z);
          return;
        }
        routePoint(a.route, a.routeS, a);
        return;
      }
      default:
    }
  }

  function routePoint(pts, s, out) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      const L = Math.hypot(q.x - p.x, q.z - p.z);
      if (s <= L || i + 2 === pts.length) {
        const k = L > 0 ? Math.min(1, s / L) : 0;
        out.x = p.x + (q.x - p.x) * k; out.y = p.y + (q.y - p.y) * k; out.z = p.z + (q.z - p.z) * k;
        if (L > 0) { out.fx = (q.x - p.x) / L; out.fz = (q.z - p.z) / L; out.yaw = Math.atan2(out.fx, out.fz); }
        return;
      }
      s -= L;
    }
  }

  function endReaction(a) {
    const was = a.reaction;
    a.reaction = 'ignore';
    a.latGoal = Math.max(-0.7, Math.min(0.7, a.latGoal));
    if (a.mode === 'react' || (a.mode === 'flee' && was === 'flee')) {
      a.mode = 'walk'; a.t = 0; a.speed = a.baseSpeed;
      if (a.mode === 'walk') setOnLine(a, a.line, a.s, a.dir);
    }
  }

  // Snap an agent that left the network (a responder) back onto the nearest line.
  function snapToNetwork(a) {
    let best = -1, bd = Infinity, bs = 0;
    const cell = cells.get(network.cellKey(Math.floor(a.x / CELL), Math.floor(a.z / CELL)));
    const list = cell ?? [];
    for (let k = 0; k < list.length; k++) {
      const l = lines[list[k]];
      const t = Math.max(0, Math.min(1, ((a.x - l.ax) * (l.bx - l.ax) + (a.z - l.az) * (l.bz - l.az)) / (l.len * l.len || 1)));
      const px = l.ax + (l.bx - l.ax) * t, pz = l.az + (l.bz - l.az) * t;
      const d = Math.hypot(px - a.x, pz - a.z);
      if (d < bd) { bd = d; best = l.id; bs = t * l.len; }
    }
    if (best >= 0) setOnLine(a, best, bs, a.dir);
  }

  const api = {
    network, agents, spots,
    get active() { return active; },
    get cap() { return cap; },
    // Register an activity spot (a bench, a food cart queue, an El platform, a newsstand...).
    // kind: an ACTIVITIES id; cap: how many people use it at once.
    registerSpot({ kind = 'wait', x, y = 0, z, yaw = 0, cap: c = 1 }) { spots.push({ kind, x, y, z, yaw, cap: c, used: 0 }); return spots.length - 1; },
    setSpeed(a, v) { a.baseSpeed = v; if (a.mode !== 'flee' && a.mode !== 'respond') a.speed = v; },
    // anchors: [{ x, y, z }] (players, then spectator cameras); per anchor up to `perAnchor` people.
    // [perf3] Spawn share for the adaptive detail governor (src/render/detailGovernor.js): fewer
    // new people per anchor; nobody already walking is removed.
    setLimitScale(k) { limitScale = Math.max(0.1, Math.min(1, k)); },
    update(dt, t, anchors, nAnchors, { perAnchor = Math.floor(cap * limitScale / Math.max(1, nAnchors)) } = {}) {
      if (nAnchors <= 0) return;
      now = t;
      const w = weather();
      if (!filled) {
        filled = true;
        for (let k = 0; k < nAnchors; k++) {
          const want = Math.min(perAnchor, targetCount({ regionDensity: tableAt(anchors[k].x, anchors[k].z).density, hour: hour(), weather: w, cap: perAnchor }));
          for (let j = 0; j < want * 2 && countNear(anchors[k], spawnMax) < want; j++) trySpawn(anchors, nAnchors, anchors[k], 6, spawnMax, false);
        }
      }
      if (dt > 0) {
        for (let k = 0; k < agents.length; k++) {
          const a = agents[k];
          if (!a.active) continue;
          a.fresh = false;
          step(a, dt, t);
          if ((k + Math.floor(t * 4)) % 8 === 0 && nearestAnchor(a.x, a.z, anchors, nAnchors) > despawnR && a.mode !== 'respond') despawn(a);
        }
      }
      // Spawning, a few times a second, round-robin over the anchors (also refills after a jump).
      spawnT += dt;
      if (spawnT > 0.2 || dt === 0) {
        spawnT = 0;
        anchorTurn = (anchorTurn + 1) % nAnchors;
        const an = anchors[anchorTurn];
        const want = Math.min(perAnchor, targetCount({ regionDensity: tableAt(an.x, an.z).density, hour: hour(), weather: w, cap: perAnchor }));
        const near = countNear(an, spawnMax);
        if (near < want * 0.5) for (let j = 0; j < 6 && countNear(an, spawnMax) < want; j++) trySpawn(anchors, nAnchors, an, 6, spawnMax, false);
        else if (near < want && active < cap) trySpawn(anchors, nAnchors, an, spawnMin, spawnMax, true);
        // Too many for the hour or weather (the rain came): the farthest leave first.
        else if (near > want * 1.25) {
          let far = null, fd = 0;
          for (const a of agents) { if (!a.active || a.mode === 'respond') continue; const d = Math.hypot(a.x - an.x, a.z - an.z); if (d > fd && !visible(a.x, a.y, a.z)) { fd = d; far = a; } }
          if (far && fd > spawnMin) despawn(far);
        }
      }
    },
    // Something happened at (x, z): every pedestrian in range decides how to react.
    // kind: see reactions.js; opts: { rep, radius, onCall(agent) }.
    stimulus(kind, x, z, { rep = 50, radius = 45, y = null, onCall = null } = {}) {
      let n = 0;
      for (let k = 0; k < agents.length; k++) {
        const a = agents[k];
        if (!a.active) continue;
        const d = Math.hypot(a.x - x, a.z - z);
        if (d > radius || (y !== null && Math.abs(a.y - y) > 12)) continue;
        // Noticing a hero: once in a while per person, not every time someone looks round.
        if (kind === 'heroSeen') { if (now - a.seenAt < 25) continue; a.seenAt = now; }
        const A = ARCHETYPES[a.arch] ?? ARCHETYPES.walker;
        const r = decideReaction({ kind, dist: d, rep, brave: A.brave, police: a.police }, rng.next());
        if (r === 'ignore' || URGENCY[r] < URGENCY[a.reaction] || a.mode === 'respond') continue;
        if (applyReaction(a, r, x, z) && r === 'callPolice') onCall?.(a);
        n++;
      }
      return n;
    },
    // Police within `radius` run to (x, z) along the streets (routeTo returns a polyline).
    respond(x, z, { radius = 220, max = 3 } = {}) {
      let n = 0;
      for (let k = 0; k < agents.length && n < max; k++) {
        const a = agents[k];
        if (!a.active || !a.police || a.mode === 'respond') continue;
        if (Math.hypot(a.x - x, a.z - z) > radius) continue;
        const pts = routeTo?.(a, x, z);
        if (!pts || pts.length < 2) continue;
        let L = 0;
        for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
        a.route = pts; a.routeS = 0; a.routeLen = L; a.mode = 'respond'; a.speed = Math.max(3, a.baseSpeed * 2.6);
        a.srcX = x; a.srcZ = z; a.act = null;
        n++;
      }
      return n;
    },
    // Heroes walking through: people step aside (lateral shift), no stopping.
    heroPass(x, z, radius = 2.5) {
      for (let k = 0; k < agents.length; k++) {
        const a = agents[k];
        if (!a.active || (a.mode !== 'walk' && a.mode !== 'act')) continue;
        const dx = a.x - x, dz = a.z - z;
        if (dx * dx + dz * dz > radius * radius) continue;
        const l = lines[a.line];
        const side = dx * l.nx + dz * l.nz >= 0 ? 1 : -1;
        a.latGoal = side * Math.min(1.6, Math.max(0.6, l.width * 0.45));
        if (URGENCY.stepAside >= URGENCY[a.reaction]) { a.reaction = 'stepAside'; a.reactT = REACTION_TIME.stepAside[0]; }
      }
    },
    despawn, snapToNetwork,
    // Tests: put a pedestrian on a line.
    spawnOn(lineId, s, dir = 1, arch = null) {
      const a = agents.find((q) => !q.active);
      if (!a) return null;
      spawnAt(a, lineId, s, dir);
      if (arch) { a.arch = arch; a.police = !!ARCHETYPES[arch]?.police; }
      a.lat = a.latGoal = 0;
      setOnLine(a, lineId, s, dir);
      return a;
    },
    markFilled() { filled = true; },
  };

  function countNear(an, r) {
    let n = 0;
    for (let k = 0; k < agents.length; k++) { const a = agents[k]; if (a.active && Math.abs(a.x - an.x) < r && Math.abs(a.z - an.z) < r) n++; }
    return n;
  }

  function applyReaction(a, r, x, z) {
    const [dur] = REACTION_TIME[r];
    a.reaction = r; a.reactT = dur * (0.8 + 0.4 * rng.next());
    a.srcX = x; a.srcZ = z;
    if (a.partner >= 0) { const p = agents[a.partner]; if (p.partner === a.i) p.partner = -1; a.partner = -1; }
    if (a.spot >= 0 && r !== 'stepAside' && r !== 'look') { spots[a.spot].used--; a.spot = -1; if (a.mode === 'spot') snapToNetwork(a); }
    if (r === 'flee') {
      // Run along the sidewalk away from the danger (turn round if it is ahead).
      if (a.mode === 'act' || a.mode === 'react' || a.mode === 'spot') setOnLine(a, a.line, a.s, a.dir);
      if (a.mode === 'wait') { a.mode = 'cross'; }
      else if (a.mode !== 'cross') {
        const ahead = (x - a.x) * a.fx + (z - a.z) * a.fz;
        if (ahead > 0) { a.dir = -a.dir; a.fx = -a.fx; a.fz = -a.fz; a.yaw = Math.atan2(a.fx, a.fz); }
        a.mode = 'flee';
      }
      a.speed = Math.max(3.2, a.baseSpeed * 2.8);
      return true;
    }
    if (r === 'look' || r === 'stepAside') return true;
    // Everything else stops and faces the source.
    if (a.mode === 'cross') return true; // finish crossing first
    if (a.mode === 'spot') snapToNetwork(a);
    a.mode = 'react';
    a.yaw = Math.atan2(x - a.x, z - a.z);
    return true;
  }

  return api;
}
