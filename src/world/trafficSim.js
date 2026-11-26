// Ambient traffic as pure simulation (no three.js), driven only by the street graph, so it runs on
// every region that exists now and on any region added later. cityLife.js draws what this moves.
//
//   lanes      one per direction per drivable graph edge, kept LEFT (this city keeps left: the core's
//              cars always did, docs/design/world-framework.md 6), shortened at both ends by a
//              junction setback so cars stop at a line and turn on a curve through the junction
//   junctions  graph nodes where three or more drivable edges meet: signalised (a 12 s cycle in step
//              with the core's and the Loop row's existing traffic lights) or give-way (country
//              lanes: one car in the junction at a time, first come first served)
//   vehicles   a fixed pool (cap by quality tier); spawned out of sight around every anchor (each
//              player, plus the camera) and despawned when no anchor is near
//
// Behaviour: follow lanes, keep a gap to whatever is ahead (queues form behind red lights),
// stop at red and amber, wait for a raised bridge, give way at unsignalised junctions, pull over
// for a siren behind them, brake for a hero or the Batmobile in the road and honk if it stays.
// update() allocates nothing: vehicles and scratch are made once.

// ---------------------------------------------------------------- traffic mix (pure data)

// Weights per district group. Types are fleet ids (src/vehicles/models/fleet.js FLEET).
export const TRAFFIC_MIX = {
  downtown: { taxi: 22, bus: 7, sedan: 16, sedan_deco: 8, sedan_compact: 8, coupe: 6, suv: 7, hatchback: 5, van_delivery: 6, box_truck: 3, police: 5, limousine: 2, garbage_truck: 1.5, wagon: 2 },
  industrial: { box_truck: 20, pickup: 14, van_delivery: 14, sedan: 10, garbage_truck: 4, police: 3, wagon: 5, sedan_compact: 6, suv: 4, taxi: 2, armored_truck: 2 },
  residential: { sedan: 18, sedan_deco: 8, sedan_compact: 10, coupe: 5, hatchback: 8, wagon: 6, suv: 8, pickup: 4, van_delivery: 6, box_truck: 4, taxi: 8, bus: 3, police: 4, garbage_truck: 1, limousine: 0.5 },
  bristol: { suv: 14, wagon: 12, sedan_deco: 14, sedan: 10, coupe: 8, limousine: 5, pickup: 6, police: 3, van_delivery: 3, hatchback: 4 },
  prison: { police_van: 30, police: 20, armored_truck: 10, box_truck: 10, sedan: 6 },
};
const DISTRICT_GROUP = {
  loop: 'downtown', gcpd: 'downtown', neon: 'downtown', mile: 'downtown', river: 'downtown', lowerGotham: 'downtown', clock: 'downtown', city: 'downtown',
  ace: 'industrial', docks: 'industrial', yards: 'industrial',
  bristol: 'bristol', wayneManor: 'bristol', bristolVillage: 'bristol',
  blackgate: 'prison',
};
export const districtGroup = (d) => DISTRICT_GROUP[d] ?? 'residential';

// The cheap tiers draw fewer vehicle types (each type is its own draws): everything maps onto
// these six.
export const LEAN_TYPES = ['sedan', 'suv', 'taxi', 'box_truck', 'bus', 'police'];
const LEAN_MAP = { sedan_deco: 'sedan', sedan_compact: 'sedan', coupe: 'sedan', hatchback: 'sedan', limousine: 'sedan', wagon: 'suv', pickup: 'suv', van_delivery: 'box_truck', garbage_truck: 'box_truck', armored_truck: 'box_truck', police_van: 'police' };
export const leanType = (t) => (LEAN_TYPES.includes(t) ? t : LEAN_MAP[t] ?? 'sedan');

// Every type the mixes can produce (cityLife makes one instanced set per type in this list).
export const MIX_TYPES = [...new Set(Object.values(TRAFFIC_MIX).flatMap((m) => Object.keys(m)))];

// Time of day bends the mix: fewer buses late at night, more cabs, the bin lorries before dawn.
function hourFactor(type, hour) {
  const night = hour >= 22 || hour < 5;
  if (type === 'bus') return night ? 0.4 : 1;
  if (type === 'taxi') return night ? 1.3 : 1;
  if (type === 'garbage_truck') return hour >= 3 && hour < 7 ? 3 : 1;
  return 1;
}

// A weighted pick from the district's mix. r in [0, 1).
export function pickType(district, r, { hour = 23, lean = false } = {}) {
  const mix = TRAFFIC_MIX[districtGroup(district)];
  let total = 0;
  for (const t in mix) total += mix[t] * hourFactor(t, hour);
  let x = r * total;
  let out = 'sedan';
  for (const t in mix) { x -= mix[t] * hourFactor(t, hour); if (x <= 0) { out = t; break; } }
  return lean ? leanType(out) : out;
}

// Cruise speeds, m/s (old traffic drove 9-15).
const CRUISE = { bus: [8, 10], box_truck: [9, 11.5], garbage_truck: [7, 9], armored_truck: [9, 11], police_van: [10, 12], pickup: [10, 13], van_delivery: [10, 12.5], limousine: [9, 11] };
const LENGTH = { bus: 11.8, box_truck: 7.6, garbage_truck: 8.6, fire_engine: 9.8, armored_truck: 6.6, police_van: 6.1, ambulance: 6.5, limousine: 6.8, van_delivery: 5.5, pickup: 5.6 };
export const vehicleLength = (t) => LENGTH[t] ?? 4.8;

// ---------------------------------------------------------------- signals (pure)

// The 12 s cycle of the city's traffic lights (streetDressing.dressStreets, riverfront.buildLoopRow):
// the light's own axis is green 0-5 s, amber 5-6.5, red after; the crossing axis gets green 7-11,
// amber 11-12 (an all-red second between them). 0 green, 1 amber, 2 red.
export const SIGNAL = { cycle: 12, GREEN: 0, AMBER: 1, RED: 2 };
export function signalState(phase, primaryAxis, axis, t) {
  const c = ((t / SIGNAL.cycle + phase) % 1 + 1) % 1 * SIGNAL.cycle;
  if (axis === primaryAxis) return c < 5 ? 0 : c < 6.5 ? 1 : 2;
  return c >= 7 && c < 11 ? 0 : c >= 11 ? 1 : 2;
}

// ---------------------------------------------------------------- the lane network

const DRIVABLE = (e) => e.lanes > 0 && e.deck !== 'walk' && e.kind !== 'walk';
// Regions whose junctions give way instead of having lights (lanes through woods and villages).
const GIVE_WAY_REGIONS = new Set(['bristol', 'blackgate']);

// Builds lanes and junctions from a street graph. `junctionInfo(node)` may return
// { phase, primaryAxis, existing } to sync a junction with lights the world already has.
export function buildLaneNetwork(graph, { junctionInfo = null } = {}) {
  const { nodes, edges } = graph;
  const deg = new Int32Array(nodes.length);
  const maxW = new Float32Array(nodes.length);
  for (const e of edges) {
    if (!DRIVABLE(e)) continue;
    deg[e.a]++; deg[e.b]++;
    maxW[e.a] = Math.max(maxW[e.a], e.width); maxW[e.b] = Math.max(maxW[e.b], e.width);
  }
  // Junctions.
  const junctionOf = new Int32Array(nodes.length).fill(-1);
  const junctions = [];
  for (const n of nodes) {
    if (deg[n.id] < 3) continue;
    const give = GIVE_WAY_REGIONS.has(n.region) || n.deck === 'ramp';
    const info = junctionInfo?.(n) ?? null;
    const j = {
      id: junctions.length, node: n.id, x: n.x, y: n.y, z: n.z, region: n.region,
      signal: !give, phase: info?.phase ?? hash01(n.x * 0.37 + n.z * 1.13), primaryAxis: info?.primaryAxis ?? 'z',
      existing: !!info?.existing, radius: maxW[n.id] / 2 + 1, holder: -1, holdT: 0, width: maxW[n.id],
    };
    junctionOf[n.id] = j.id;
    junctions.push(j);
  }
  // Setback at a node: through a junction's box, or a short bend radius on a winding road.
  const setback = (nodeId, len) => {
    if (deg[nodeId] >= 3) return Math.min(len * 0.45, maxW[nodeId] / 2 + 1.5);
    if (deg[nodeId] === 2) return Math.min(len * 0.3, 5);
    return 0;
  };
  const lanes = [];
  const outOf = nodes.map(() => []);
  for (const e of edges) {
    if (!DRIVABLE(e)) continue;
    for (const dir of e.oneway ? [1] : [1, -1]) {
      const from = dir > 0 ? e.a : e.b, to = dir > 0 ? e.b : e.a;
      const A = nodes[from], B = nodes[to];
      const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1;
      const fx = dx / L, fz = dz / L;
      // Keep left: the left of travel is (fz, -fx) in this frame (x east, z south, y up).
      const off = e.oneway ? 0 : Math.min(3, e.width * 0.215);
      const lx = fz * off, lz = -fx * off;
      const len = Math.hypot(L, B.y - A.y);
      const lane = {
        id: lanes.length, edge: e.id, from, to, fx, fz,
        ax: A.x + lx, ay: A.y, az: A.z + lz, bx: B.x + lx, by: B.y, bz: B.z + lz, len, planLen: L,
        s0: 0, s1: len, axis: Math.abs(fx) > Math.abs(fz) ? 'x' : 'z',
        bridge: e.bridge ?? null, region: e.region, reverse: -1, deck: e.deck,
        endJunction: junctionOf[to], mx: (A.x + B.x) / 2, mz: (A.z + B.z) / 2,
      };
      lane.s0 = setback(from, len);
      lane.s1 = Math.max(lane.s0 + 0.5, len - setback(to, len));
      outOf[from].push(lane.id);
      lanes.push(lane);
    }
  }
  for (const l of lanes) {
    for (const o of outOf[l.to]) { const m = lanes[o]; if (m.edge === l.edge && m.to === l.from) { l.reverse = o; break; } }
  }
  return { lanes, outOf, junctions, junctionOf, deg };
}

function hash01(v) { const s = Math.sin(v * 12.9898) * 43758.5453; return s - Math.floor(s); }

// ---------------------------------------------------------------- the simulation

const ACCEL = 2.8, BRAKE = 7, PANIC = 12;
const LOOK = 42;             // m: how far ahead a driver looks for something to stop behind
const STOP_GAP = 2.2;        // m: bumper to bumper when queued

export function createTrafficSim({ graph, cap = 40, rng, bridges = null, districtAt = () => 'city', regionDensity = () => 1, junctionInfo = null, lean = false, spawn = {}, hour = () => 23 }) {
  const net = buildLaneNetwork(graph, { junctionInfo });
  const { lanes, outOf, junctions } = net;
  const spawnMin = spawn.min ?? 85, spawnMax = spawn.max ?? 210, despawnR = spawn.despawn ?? 240;
  // Lanes in a 64 m grid, for picking a spawn lane near an anchor without scanning them all.
  const CELL = 64;
  const cells = new Map();
  const cellKey = (i, j) => (i + 512) * 1024 + (j + 512);
  for (const l of lanes) {
    if (l.deck === 'bridge' || l.s1 - l.s0 < 8) continue;
    const k = cellKey(Math.floor(l.mx / CELL), Math.floor(l.mz / CELL));
    let c = cells.get(k);
    if (!c) cells.set(k, c = []);
    c.push(l.id);
  }

  const vehicles = [];
  let limit = cap; // [perf3] see setLimit
  for (let i = 0; i < cap; i++) {
    vehicles.push({
      i, active: false, type: 'sedan', palette: 0, color: 0, length: 4.8,
      lane: -1, next: -1, onTurn: false, s: 0, segLen: 0,
      p0x: 0, p0y: 0, p0z: 0, cx: 0, cy: 0, cz: 0, p2x: 0, p2y: 0, p2z: 0,
      speed: 0, cruise: 12, x: 0, y: 0, z: 0, fx: 1, fz: 0, pull: 0, siren: false,
      braking: false, blockedBy: 0, ghostT: 0, blockedT: 0, honkT: 0, stuckT: 0, farT: 0, lastD: Infinity, passT: 0, holding: -1, age: 0,
    });
  }
  let active = 0, sirens = 0, spawnTick = 0, anchorTurn = 0, burstTurn = 0, filled = false;

  const bridgeUp = (l) => l.bridge && bridges && bridges.isDown(l.bridge) === false;

  // Next lane after `l`: straight on is likeliest, turns less, a U-turn only at a dead end.
  function chooseNext(l, avoidBridges) {
    const outs = outOf[l.to];
    let total = 0;
    for (let k = 0; k < outs.length; k++) total += weightOf(l, lanes[outs[k]], avoidBridges);
    if (total <= 0) return l.reverse;
    let x = rng.next() * total;
    for (let k = 0; k < outs.length; k++) { x -= weightOf(l, lanes[outs[k]], avoidBridges); if (x <= 0) return outs[k]; }
    return outs[outs.length - 1];
  }
  function weightOf(l, m, avoidBridges) {
    if (m.id === l.reverse) return 0;
    if (avoidBridges && bridgeUp(m)) return 0.05;
    const d = l.fx * m.fx + l.fz * m.fz;
    return d > 0.7 ? 3 : d > -0.3 ? 1 : 0.2;
  }

  // Sets the vehicle on its lane at s (straight segment).
  function poseOnLane(v) {
    const l = lanes[v.lane];
    const t = v.s / l.len;
    v.x = l.ax + (l.bx - l.ax) * t; v.y = l.ay + (l.by - l.ay) * t; v.z = l.az + (l.bz - l.az) * t;
    v.fx = l.fx; v.fz = l.fz;
  }
  // A quadratic curve from the end of v.lane to the start of v.next.
  function beginTurn(v) {
    const a = lanes[v.lane], b = lanes[v.next];
    const t0 = a.s1 / a.len, t2 = b.s0 / b.len;
    v.p0x = a.ax + (a.bx - a.ax) * t0; v.p0y = a.ay + (a.by - a.ay) * t0; v.p0z = a.az + (a.bz - a.az) * t0;
    v.p2x = b.ax + (b.bx - b.ax) * t2; v.p2y = b.ay + (b.by - b.ay) * t2; v.p2z = b.az + (b.bz - b.az) * t2;
    const dot = a.fx * b.fx + a.fz * b.fz;
    if (dot > 0.985) {
      v.cx = (v.p0x + v.p2x) / 2; v.cz = (v.p0z + v.p2z) / 2;
    } else if (dot < -0.7) {
      // U-turn at a dead end: swing out past the end of the road.
      const reach = 6;
      v.cx = (v.p0x + v.p2x) / 2 + a.fx * reach; v.cz = (v.p0z + v.p2z) / 2 + a.fz * reach;
    } else {
      // Where the two lane lines cross.
      const rx = v.p2x - v.p0x, rz = v.p2z - v.p0z;
      const den = a.fx * b.fz - a.fz * b.fx;
      const tt = (rx * b.fz - rz * b.fx) / den;
      v.cx = v.p0x + a.fx * tt; v.cz = v.p0z + a.fz * tt;
      if (!(tt > 0 && tt < 40)) { v.cx = (v.p0x + v.p2x) / 2; v.cz = (v.p0z + v.p2z) / 2; }
    }
    v.cy = (v.p0y + v.p2y) / 2;
    const c1 = Math.hypot(v.cx - v.p0x, v.cz - v.p0z) + Math.hypot(v.p2x - v.cx, v.p2z - v.cz);
    const c0 = Math.hypot(v.p2x - v.p0x, v.p2z - v.p0z);
    v.segLen = Math.max(0.5, (c0 + c1) / 2);
    v.onTurn = true;
    v.s = 0;
  }
  function poseOnTurn(v) {
    const t = Math.min(1, v.s / v.segLen), u = 1 - t;
    v.x = u * u * v.p0x + 2 * u * t * v.cx + t * t * v.p2x;
    v.y = u * u * v.p0y + 2 * u * t * v.cy + t * t * v.p2y;
    v.z = u * u * v.p0z + 2 * u * t * v.cz + t * t * v.p2z;
    let dx = 2 * u * (v.cx - v.p0x) + 2 * t * (v.p2x - v.cx), dz = 2 * u * (v.cz - v.p0z) + 2 * t * (v.p2z - v.cz);
    const L = Math.hypot(dx, dz);
    if (L > 1e-5) { dx /= L; dz /= L; v.fx = dx; v.fz = dz; }
  }
  function enterLane(v, laneId, s) {
    v.lane = laneId; v.onTurn = false;
    const l = lanes[laneId];
    v.s = s ?? l.s0;
    v.segLen = l.s1;
    v.next = chooseNext(l, true);
  }

  function release(v) {
    if (v.holding >= 0) { const j = junctions[v.holding]; if (j.holder === v.i) j.holder = -1; v.holding = -1; }
  }
  function despawn(v) {
    release(v);
    if (v.siren) sirens--;
    v.active = false; v.siren = false;
    active--;
  }

  function spawnAt(v, laneId, s, opts) {
    const l = lanes[laneId];
    const t = s / l.len;
    const px = l.ax + (l.bx - l.ax) * t, pz = l.az + (l.bz - l.az) * t;
    const d = districtAt(px, pz);
    v.type = opts?.type ?? pickType(d, rng.next(), { hour: hour(), lean });
    v.siren = false;
    if (v.type === 'police' && sirens < 2 && (opts?.siren ?? rng.chance(0.25))) { v.siren = true; sirens++; }
    v.palette = Math.floor(rng.next() * 8);
    v.length = vehicleLength(v.type);
    const c = CRUISE[v.type] ?? [11, 14.5];
    v.cruise = (c[0] + rng.next() * (c[1] - c[0])) * (districtGroup(d) === 'bristol' ? 0.92 : 1);
    if (v.siren) v.cruise = 17;
    v.speed = v.cruise * 0.8;
    v.pull = 0; v.ghostT = 0; v.blockedBy = 0; v.blockedT = 0; v.honkT = 0; v.stuckT = 0; v.farT = 0; v.lastD = Infinity; v.passT = 0; v.holding = -1; v.age = 0;
    v.active = true;
    active++;
    enterLane(v, laneId, s);
    poseOnLane(v);
  }

  // Free space on the lane around s (no vehicle within `gap` metres of the spawn point).
  function clearAround(x, z, gap) {
    for (let k = 0; k < vehicles.length; k++) {
      const o = vehicles[k];
      if (o.active && Math.abs(o.x - x) < gap && Math.abs(o.z - z) < gap) return false;
    }
    return true;
  }
  function nearestAnchor(x, z, anchors, n) {
    let best = Infinity;
    for (let k = 0; k < n; k++) { const a = anchors[k]; const d = Math.hypot(a.x - x, a.z - z); if (d < best) best = d; }
    return best;
  }
  // One spawn attempt near anchor `a`: a random point in the band, a random lane from its cell.
  function trySpawn(anchors, n, a, rMin, rMax, hidden = true) {
    let v = null;
    for (let k = 0; k < vehicles.length; k++) if (!vehicles[k].active) { v = vehicles[k]; break; }
    if (!v) return false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = rng.next() * Math.PI * 2, r = rMin + rng.next() * (rMax - rMin);
      const cx = Math.floor((a.x + Math.cos(ang) * r) / CELL), cz = Math.floor((a.z + Math.sin(ang) * r) / CELL);
      const list = cells.get(cellKey(cx, cz));
      if (!list) continue;
      const l = lanes[list[Math.floor(rng.next() * list.length)]];
      if (bridgeUp(l)) continue;
      const dens = regionDensity(l.region);
      if (dens <= 0 || rng.next() > dens) continue;
      const s = l.s0 + rng.next() * (l.s1 - l.s0);
      const t = s / l.len;
      const x = l.ax + (l.bx - l.ax) * t, z = l.az + (l.bz - l.az) * t;
      const d = nearestAnchor(x, z, anchors, n);
      if (d < rMin || d > rMax + 20) continue;
      // Out of sight: not inside the camera's view unless far into the fog.
      if (hidden && spawn.visible && d < rMax * 0.8 && spawn.visible(x, l.ay, z)) continue;
      if (!clearAround(x, z, 16)) continue;
      spawnAt(v, l.id, s);
      return true;
    }
    return false;
  }

  // ---- per-frame decisions ----

  // Distance to the nearest thing ahead in this vehicle's path (another vehicle, an obstacle), or
  // Infinity. Sets v.blockedBy: 1 vehicle, 2 obstacle.
  function aheadGap(v, obstacles, nObs) {
    let best = Infinity;
    v.blockedBy = 0;
    const lat = v.siren ? 1.4 : 2.0;
    for (let k = 0; v.ghostT <= 0 && k < vehicles.length; k++) {
      const o = vehicles[k];
      if (!o.active || o === v) continue;
      const rx = o.x - v.x, rz = o.z - v.z;
      if (Math.abs(rx) > LOOK + 12 || Math.abs(rz) > LOOK + 12 || Math.abs(o.y - v.y) > 3) continue;
      const along = rx * v.fx + rz * v.fz;
      if (along <= 0) continue;
      const side = Math.abs(rx * v.fz - rz * v.fx);
      if (side > lat) continue;
      // A car pulled over for us does not block a siren.
      if (v.siren && o.pull > 0.5) continue;
      // Something coming straight at us in the other lane is not "ahead".
      if (o.fx * v.fx + o.fz * v.fz < -0.5 && side > 0.8) continue;
      // Two cars each in the other's path (crossing in a junction): the one further back waits.
      const alongO = -rx * o.fx - rz * o.fz;
      if (alongO > 0 && Math.abs(rx * o.fz - rz * o.fx) < 2 && (alongO > along || (alongO === along && o.i > v.i))) continue;
      const gap = along - (o.length + v.length) / 2;
      if (gap < best) { best = gap; v.blockedBy = 1; }
    }
    for (let k = 0; k < nObs; k++) {
      const o = obstacles[k];
      const rx = o.x - v.x, rz = o.z - v.z;
      if (Math.abs(o.y - v.y) > 2.2) continue;
      const along = rx * v.fx + rz * v.fz;
      if (along <= -1 || along > LOOK) continue;
      const side = Math.abs(rx * v.fz - rz * v.fx);
      if (side > 1.4 + (o.r ?? 0.5)) continue;
      const gap = along - v.length / 2 - (o.r ?? 0.5);
      if (gap < best) { best = gap; v.blockedBy = 2; }
    }
    return best;
  }

  // Speed allowed to stop `d` metres ahead, given decel b.
  const stopSpeed = (d, b = BRAKE * 0.6) => (d <= 0 ? 0 : Math.sqrt(2 * b * d));

  function stopLine(v, t) {
    // Only while on a lane approaching its end.
    if (v.onTurn) return Infinity;
    const l = lanes[v.lane];
    const toEnd = l.s1 - v.s;
    if (toEnd > 60) return Infinity;
    const nl = v.next >= 0 ? lanes[v.next] : null;
    // A raised bridge ahead (or one about to rise: its gates are down).
    if (nl && bridgeUp(nl) && !(lanes[v.lane].bridge)) return toEnd - 1;
    const j = l.endJunction >= 0 ? junctions[l.endJunction] : null;
    if (!j) return Infinity;
    if (j.signal) {
      const st = signalState(j.phase, j.primaryAxis, l.axis, t);
      if (st === SIGNAL.GREEN) return Infinity;
      if (v.siren) return Infinity; // responders go through (they slow, below)
      // Amber: stop if there is room to, go if not.
      if (st === SIGNAL.AMBER && stopSpeed(toEnd, PANIC * 0.5) < v.speed) return Infinity;
      return toEnd - 1;
    }
    // Give way: one vehicle in the junction at a time.
    if (toEnd < 14) {
      if (j.holder === -1 || j.holder === v.i) { j.holder = v.i; j.holdT = 0; v.holding = j.id; return Infinity; }
      return toEnd - 1;
    }
    return Infinity;
  }

  function sirenBehind(v) {
    if (sirens === 0 || v.siren) return false;
    for (let k = 0; k < vehicles.length; k++) {
      const o = vehicles[k];
      if (!o.active || !o.siren) continue;
      const rx = v.x - o.x, rz = v.z - o.z;
      const along = rx * o.fx + rz * o.fz;
      if (along < 0 || along > 45) continue;
      if (Math.abs(rx * o.fz - rz * o.fx) > 3) continue;
      if (o.fx * v.fx + o.fz * v.fz < 0.3) continue;
      return true;
    }
    return false;
  }

  function step(v, dt, t, obstacles, nObs) {
    v.age += dt;
    let want = v.cruise;
    const gap = aheadGap(v, obstacles, nObs);
    if (gap < LOOK) want = Math.min(want, stopSpeed(gap - STOP_GAP, BRAKE * 0.7));
    const line = stopLine(v, t);
    if (line < Infinity) want = Math.min(want, stopSpeed(line));
    // Responders slow through junctions; everyone slows into tight turns.
    if (v.onTurn) {
      const tight = Math.abs((v.p2x - v.p0x) * v.fz - (v.p2z - v.p0z) * v.fx) > 4;
      if (tight) want = Math.min(want, v.siren ? 9 : 7);
    }
    const pullTo = sirenBehind(v) ? 1 : 0;
    v.pull += (pullTo - v.pull) * Math.min(1, dt * 1.5);
    if (pullTo) want = Math.min(want, 3);
    // Accelerate gently, brake as hard as it takes.
    const dv = want - v.speed;
    const lim = dv > 0 ? ACCEL : (gap < 6 ? PANIC : BRAKE);
    v.speed += Math.max(-lim * dt, Math.min(lim * dt, dv));
    if (v.speed < 0) v.speed = 0;
    v.braking = dv < -0.5 || v.speed < 0.5;
    // Blocked by a hero or the Batmobile: honk if it does not move.
    if (v.blockedBy === 2 && v.speed < 1) v.blockedT += dt; else v.blockedT = 0;
    v.honkT -= dt;
    if (v.speed < 0.3) v.stuckT += dt; else v.stuckT = 0;
    // Wedged behind another car for a long time (a knot nobody can untie): creep through it.
    v.ghostT -= dt;
    if (v.stuckT > 10 && v.blockedBy === 1) { v.ghostT = 2.5; v.stuckT = 0; }
    // Move along the path, never over a stop line we have to stop at.
    let travel = v.speed * dt;
    if (line < Infinity && travel > line + 0.9) { travel = Math.max(0, line + 0.9); if (travel === 0) v.speed = 0; }
    for (let guard = 0; guard < 4 && travel > 0; guard++) {
      const room = v.segLen - v.s;
      if (travel < room) { v.s += travel; travel = 0; break; }
      travel -= room;
      if (!v.onTurn) {
        if (v.next < 0) { v.s = v.segLen; travel = 0; break; }
        v.s = lanes[v.lane].s1;
        beginTurn(v);
      } else {
        release(v);
        enterLane(v, v.next);
      }
    }
    if (v.onTurn) poseOnTurn(v); else poseOnLane(v);
    // Pulled over toward the kerb (the left of travel here).
    if (v.pull > 0.01) { v.x += v.fz * v.pull * 1.8; v.z -= v.fx * v.pull * 1.8; }
  }

  // ---- public ----
  const passOut = { kind: 'car', speed: 0, closest: 0, side: 1, gain: 1, pos: { x: 0, y: 0, z: 0 } };
  const honkOut = { pos: { x: 0, y: 0, z: 0 }, type: 'sedan' };

  return {
    lanes, junctions, vehicles, net,
    get active() { return active; },
    get cap() { return cap; },
    // [perf3] Soft cap for the adaptive detail governor (src/render/detailGovernor.js): no new
    // spawns past it; cars already out finish their trips and despawn out of sight as usual.
    get limit() { return limit; },
    setLimit(n) { limit = Math.max(1, Math.min(cap, Math.round(n))); },
    // anchors: [{ x, y, z }] (players first, then extra spectators such as the camera), nPlayers:
    // how many of them are players (pass-bys are heard by players only). obstacles: [{ x, y, z, r }].
    // emit(name, payload): optional event sink (payload objects are reused: read them, don't keep them).
    update(dt, t, anchors, nAnchors, obstacles = [], nObs = 0, emit = null, nPlayers = nAnchors) {
      if (nAnchors <= 0) return;
      // Initial fill: the streets around the players are busy from the first frame.
      if (!filled) {
        filled = true;
        for (let k = 0; k < cap * 3 && active < limit; k++) trySpawn(anchors, nAnchors, anchors[k % nAnchors], 22, spawnMax, false);
      }
      // An anchor with (almost) no traffic around it has jumped there (a teleport, fast travel, a
      // photo camera): recycle what is left far behind and fill its streets at once, as at the
      // start. One anchor per frame; also while time is frozen (photo mode, screenshots).
      burstTurn = (burstTurn + 1) % nAnchors;
      const ba = anchors[burstTurn];
      let around = 0;
      for (let k = 0; k < vehicles.length; k++) { const v = vehicles[k]; if (v.active && Math.abs(v.x - ba.x) < spawnMax && Math.abs(v.z - ba.z) < spawnMax) around++; }
      if (around < 3) {
        for (let k = 0; k < vehicles.length; k++) { const v = vehicles[k]; if (v.active && nearestAnchor(v.x, v.z, anchors, nAnchors) > despawnR) despawn(v); }
        for (let k = 0; k < 8 && active < limit; k++) trySpawn(anchors, nAnchors, ba, 22, spawnMax, false);
      }
      if (dt <= 0) return;
      for (let k = 0; k < vehicles.length; k++) {
        const v = vehicles[k];
        if (!v.active) continue;
        step(v, dt, t, obstacles, nObs);
        const dA = nearestAnchor(v.x, v.z, anchors, nAnchors);
        v.farT = dA > despawnR ? v.farT + dt : 0;
        if (v.farT > 1.5 || (v.stuckT > 45 && dA > 70)) { despawn(v); continue; }
        if (emit) {
          // Honk at whatever stands in the road.
          if (v.blockedT > 1.2 && v.honkT <= 0) {
            v.honkT = 3.5 + rng.next() * 2;
            honkOut.pos.x = v.x; honkOut.pos.y = v.y + 1; honkOut.pos.z = v.z; honkOut.type = v.type;
            emit('trafficHonk', honkOut);
          }
          // A pass-by: closest approach to a player, heard once.
          let dP = Infinity, px = 0, pz = 0;
          for (let a = 0; a < nPlayers; a++) { const an = anchors[a]; const d = Math.hypot(an.x - v.x, an.y - v.y, an.z - v.z); if (d < dP) { dP = d; px = an.x; pz = an.z; } }
          v.passT -= dt;
          if (dP > v.lastD && v.lastD < 14 && v.speed > 5 && v.passT <= 0) {
            v.passT = 6;
            const truck = v.length > 6;
            passOut.kind = v.siren ? 'siren' : truck ? 'truck' : 'car';
            passOut.speed = v.speed; passOut.closest = Math.max(1.5, v.lastD);
            passOut.side = (v.x - px) * v.fz - (v.z - pz) * v.fx > 0 ? 1 : -1;
            passOut.gain = truck ? 1 : 0.8;
            passOut.pos.x = v.x; passOut.pos.y = v.y; passOut.pos.z = v.z;
            emit('trafficPassBy', passOut);
          }
          v.lastD = dP;
        }
      }
      // Give-way junctions: a holder that has gone (despawned, or never entered) frees it.
      for (let k = 0; k < junctions.length; k++) {
        const j = junctions[k];
        if (j.signal || j.holder < 0) continue;
        j.holdT += dt;
        const h = vehicles[j.holder];
        if (!h.active || h.holding !== j.id || j.holdT > 20) { if (h.holding === j.id) h.holding = -1; j.holder = -1; }
      }
      // Spawn: a couple of attempts a frame, round-robin over the anchors.
      spawnTick += dt;
      if (active < limit && spawnTick > 0.1) {
        spawnTick = 0;
        anchorTurn = (anchorTurn + 1) % nAnchors;
        trySpawn(anchors, nAnchors, anchors[anchorTurn], spawnMin, spawnMax);
      }
    },
    signalState: (j, axis, t) => signalState(j.phase, j.primaryAxis, axis, t),
    // Test hooks.
    spawnOn(laneId, s, opts) {
      const v = vehicles.find((q) => !q.active);
      if (!v) return null;
      spawnAt(v, laneId, s, opts);
      return v;
    },
    despawn,
    markFilled() { filled = true; },
  };
}
