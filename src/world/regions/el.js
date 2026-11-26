// The El (research 1.2, long-night-2.md 8 "one rail system"): the Loop rectangle's west, north
// and east legs (the south leg is the proof region's stretch on z -359), the West Line out along
// z -479 to the region edge, six stations with platforms at car-floor height, stairs, canopies and
// signs, and the running trains. Layout numbers come from loopLayout.js (shared with the street
// graph, the tests and the western districts).
//
// Trains: consists from src/vehicles (createElTrain), placed car by car along the track on a
// pure timetable (elSchedule.js). Each car carries moving collision boxes (collision movers) so a
// body can stand, fight and ride on the roof and inside; anything grounded on a car is carried
// with it (collision.js carriers). Cars are skinned meshes, so the shadow system treats them as
// dynamic casters; they are drawn only within the LOD distance (chunk details with a moving box).
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { box, cylinder } from '../buckets.js';
import { solid, glow, lightSpot, edgeGrapples } from '../cityBuilder.js';
import { createElTrain, EL_CAR } from '../../vehicles/models/elTrain.js';
import { EL, EL_STATIONS, EL_WEST_STATIONS, LOOP, loopTrack, westTrack, pathTable, pathPoint, pathProject } from './loopLayout.js';
import { createSchedule } from './elSchedule.js';
import { slab, railing, stair, signPlane, EL_STEEL } from './loopKit.js';

const DECK_TOP = EL.deckTop + 0.16; // the deck's walkable top (the proof stretch's collision box)

// ======================================================================================
// Structure
// ======================================================================================

// A straight run of El structure along x (alongX, z = at) or along z (x = at) from a to b: steel
// bents every 12 m (none inside a crossing street, where the girders span it), lattice bracing,
// longitudinal girders, the deck, and lamps hung under it.
function elRun(ctx, alongX, a, b, at, crossings = []) {
  const D0 = EL.deckBottom, D1 = EL.deckTop;
  const P = (s, off) => (alongX ? [s, at + off] : [at + off, s]);
  let k = 0;
  for (let s = a + 4; s <= b - 2; s += EL.bent) {
    if (crossings.some((c) => Math.abs(s - c) < 8.5)) continue;
    for (const off of [-EL.column, EL.column]) {
      const [x, z] = P(s, off);
      solid(ctx, 'painted', box(0.55, D0, 0.55, x, D0 / 2, z), { color: EL_STEEL, tag: 'elColumn' });
      ctx.buckets.add('painted', box(0.9, 0.3, 0.9, x, 0.15, z), 0x2b3330);
      for (const sg of [-1, 1]) {
        const g = box(0.06, 3.6, 0.06, 0, 0, 0);
        if (alongX) g.rotateX(sg * 0.32); else g.rotateZ(sg * 0.32);
        ctx.buckets.add('painted', g.translate(x, D0 - 2.2, z), EL_STEEL);
      }
    }
    const [cx, cz] = P(s, 0);
    ctx.buckets.add('painted', alongX ? box(0.7, 0.8, 2 * EL.column + 0.8, cx, D0 - 0.4, cz) : box(2 * EL.column + 0.8, 0.8, 0.7, cx, D0 - 0.4, cz), EL_STEEL);
    if (k++ % 2 === 0) {
      const [lx, lz] = P(s + 6, 0);
      glow(ctx, box(0.5, 0.15, 0.5, lx, D0 - 0.3, lz), PALETTE.sodium);
      ctx.halos.add(lx, D0 - 0.45, lz, PALETTE.sodium, 2.6);
      lightSpot(ctx, lx, D0 - 0.8, lz, PALETTE.sodium, 22, 14);
      ctx.buckets.add('pool', new THREE.PlaneGeometry(8, 7).rotateX(-Math.PI / 2).translate(lx, 0.04, lz), 0x6b4520);
    }
  }
  const L = b - a, m = (a + b) / 2, H = EL.deckHalf;
  for (const off of [-H + 0.4, H - 0.4]) {
    const [x, z] = P(m, off);
    ctx.buckets.add('painted', alongX ? box(L, 1.0, 0.5, x, D0 + 0.5, z) : box(0.5, 1.0, L, x, D0 + 0.5, z), EL_STEEL);
  }
  const [x, z] = P(m, 0);
  const hY = D1 - D0 - 1.0;
  solid(ctx, 'painted', alongX ? box(L, hY, 2 * H, x, D0 + 1.0 + hY / 2, z) : box(2 * H, hY, L, x, D0 + 1.0 + hY / 2, z), { color: 0x2f2a24, tag: 'elDeck' });
  if (alongX) ctx.collision.addBox(a, D1, at - H, b, DECK_TOP, at + H, 'elDeck');
  else ctx.collision.addBox(at - H, D1, a, at + H, DECK_TOP, b, 'elDeck');
  edgeGrapples(ctx, x, z, alongX ? L : 2 * H, alongX ? 2 * H : L, DECK_TOP, 12);
}

// Rails and ties along a track polyline (any direction: corners are short segments).
function trackBed(ctx, pts, { skip = null } = {}) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if (skip && skip(mx, mz)) continue;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.01) continue;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const ux = Math.sin(yaw), uz = Math.cos(yaw);   // along
    const rx = uz, rz = -ux;                        // across
    for (const s of [-0.72, 0.72]) {
      ctx.buckets.add('painted', box(0.1, 0.24, len + 0.05, 0, 0, 0).rotateY(yaw).translate(mx + rx * s, EL.railTop - 0.12, mz + rz * s), 0x6e6a62);
    }
    for (let t = 0.6; t < len; t += 1.5) {
      ctx.buckets.add('wood', box(2.6, 0.16, 0.22, 0, 0, 0).rotateY(yaw).translate(a.x + ux * t, EL.deckTop + 0.08, a.z + uz * t));
    }
  }
}

// A station: two side platforms at car-floor height (EL.platformTop), canopies, name signs facing
// the tracks and the street, benches, lamps, railings, and one stair per platform down onto the
// block sidewalk. Returns the platform sites (for fast travel).
function elStation(ctx, st) {
  const alongX = st.along === 'x';
  const c0 = alongX ? st.x : st.z, at = alongX ? st.z : st.x;
  const L = EL.platformLen, a = c0 - L / 2, b = c0 + L / 2;
  const PT = EL.platformTop;
  const sites = [];
  const sides = st.north ? [-1] : [-1, 1];
  const P = (s, off) => (alongX ? [s, at + off] : [at + off, s]);
  const rect = (s0, s1, o0, o1) => {
    const [xa, za] = P(s0, o0), [xb, zb] = P(s1, o1);
    return [Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)];
  };
  for (const side of sides) {
    const oIn = side * EL.platformIn, oOut = side * EL.platformOut;
    const [x0, z0, x1, z1] = rect(a, b, oIn, oOut);
    slab(ctx, 'wood', x0, PT - 0.3, z0, x1, PT, z1, { tag: 'platform', uv: [3, 3] });
    // Yellow edge strip on the boarding side, steel hangers down to the deck girder.
    const [ex0, ez0, ex1, ez1] = rect(a, b, oIn, oIn + side * 0.35);
    ctx.buckets.add('painted', box(ex1 - ex0, 0.03, ez1 - ez0, (ex0 + ex1) / 2, PT + 0.01, (ez0 + ez1) / 2), 0xd9b43a);
    for (let s = a + 2; s < b; s += 8) {
      const [hx, hz] = P(s, side * (EL.platformOut - 0.3));
      ctx.buckets.add('painted', box(0.25, PT - EL.deckBottom, 0.25, hx, (PT + EL.deckBottom) / 2 - 0.15, hz), EL_STEEL);
    }
    // Canopy: a wooden roof on steel posts along the outer edge, the blue name band on its fascia.
    const cy = PT + 3.1;
    const [cx0, cz0, cx1, cz1] = rect(a + 6, b - 6, side * (EL.platformIn + 0.2), side * (EL.platformOut + 0.3));
    solid(ctx, 'painted', box(cx1 - cx0, 0.25, cz1 - cz0, (cx0 + cx1) / 2, cy, (cz0 + cz1) / 2), { color: 0x4a3a2a, tag: 'roof' });
    ctx.buckets.add('painted', box(cx1 - cx0 + 0.2, 0.08, cz1 - cz0 + 0.2, (cx0 + cx1) / 2, cy + 0.16, (cz0 + cz1) / 2), 0x2a2d33);
    for (let s = a + 7; s <= b - 7 + 1e-6; s += 6.25) {
      const [px, pz] = P(s, side * (EL.platformOut - 0.35));
      solid(ctx, 'painted', box(0.16, 3.0, 0.16, px, PT + 1.5, pz), { color: EL_STEEL, tag: 'post' });
    }
    edgeGrapples(ctx, (cx0 + cx1) / 2, (cz0 + cz1) / 2, cx1 - cx0, cz1 - cz0, cy + 0.12, 8);
    // Name signs: one hanging over the platform facing the tracks, one on the street face.
    const [sx, sz] = P(c0, side * (EL.platformIn + 0.4));
    signPlane(ctx, st.name, sx, cy - 0.6, sz, alongX ? 0 : -side, alongX ? -side : 0, { height: 0.75, panel: 0x2c3f6e });
    const [ox, oz] = P(c0, side * (EL.platformOut + 0.36));
    signPlane(ctx, st.name, ox, cy - 0.15, oz, alongX ? 0 : side, alongX ? side : 0, { height: 0.9, panel: 0x2c3f6e, halo: 2.2, haloColor: PALETTE.windowCool });
    // Lamps under the canopy (glow strips) and two halos.
    for (const s of [a + 16, b - 16]) {
      const [lx, lz] = P(s, side * (EL.platformIn + 1.2));
      glow(ctx, box(alongX ? 2.4 : 0.3, 0.08, alongX ? 0.3 : 2.4, lx, cy - 0.18, lz), PALETTE.windowCool);
      ctx.halos.add(lx, cy - 0.35, lz, PALETTE.windowCool, 2.4);
      lightSpot(ctx, lx, cy - 0.6, lz, PALETTE.windowCool, 18, 12);
    }
    // Benches against the outer railing.
    for (const s of [c0 - 6, c0 + 6]) {
      const [bx, bz] = P(s, side * (EL.platformOut - 0.6));
      solid(ctx, 'wood', box(alongX ? 1.8 : 0.45, 0.08, alongX ? 0.45 : 1.8, bx, PT + 0.45, bz), { tag: 'prop' });
    }
    // The stair for this side (if any), its landing, and the outer railing with a gap for it.
    const sd = st.stairs.find((q) => q.side === side);
    const oStair = side * (EL.platformOut + 1.85);
    let gap = null;
    if (sd) {
      const s0 = c0 + sd.top;
      const [lx0, lz0, lx1, lz1] = rect(s0 - sd.dir * 2.2, s0, side * (EL.platformOut - 0.1), side * (EL.platformOut + 2.8));
      slab(ctx, 'painted', lx0, PT - 0.3, lz0, lx1, PT, lz1, { tag: 'landing', color: 0x3a3c40 });
      stair(ctx, alongX, s0, sd.dir, at + oStair, PT, { w: 1.8, rail: alongX ? side : side });
      gap = [Math.min(s0 - sd.dir * 2.2, s0), Math.max(s0 - sd.dir * 2.2, s0)];
      // A lit entrance sign at the foot of the stair.
      const foot = s0 + sd.dir * (Math.ceil((PT - 0.15) / 0.3) * 0.4 - 0.4);
      const [fx, fz] = P(foot, oStair + side * 1.25);
      solid(ctx, 'painted', box(0.14, 2.6, 0.14, fx, 1.45, fz), { color: EL_STEEL, tag: 'prop' });
      glow(ctx, box(0.5, 0.5, 0.5, fx, 3.0, fz), 0x3b6ed8);
      ctx.halos.add(fx, 3.0, fz, 0x5a8af0, 2.6);
    }
    const oRail = side * (EL.platformOut - 0.05);
    const runs = gap ? [[a, gap[0]], [gap[1], b]] : [[a, b]];
    for (const [r0, r1] of runs) railing(ctx, alongX, r0, r1, at + oRail, PT, { color: EL_STEEL });
    for (const s of [a, b]) {
      const [q0, q1] = [Math.min(oIn, oOut), Math.max(oIn, oOut)];
      railing(ctx, !alongX, at + q0, at + q1, s, PT, { color: EL_STEEL });
    }
    const [fx, fz] = P(c0, side * ((EL.platformIn + EL.platformOut) / 2));
    sites.push({ id: `${st.id}${sides.length > 1 ? (side < 0 ? 'A' : 'B') : ''}`, x: fx, y: PT, z: fz });
  }
  return sites;
}

export function buildElStructure(ctx) {
  const { minX, maxX, minZ, maxZ } = EL.loop;
  const H = EL.deckHalf;
  // West and east legs on the x -90 / 90 streets, the north leg on the z -539 street. Each crosses
  // the streets between; deck ends overlap at the corners.
  // Crossing streets (the corners included) keep their intersections clear of columns.
  const zCross = LOOP.zLines.filter((z) => z <= maxZ + 1 && z >= minZ - 1);
  elRun(ctx, false, minZ - H, maxZ - H, minX, zCross);
  elRun(ctx, false, minZ - H, maxZ - H, maxX, zCross);
  elRun(ctx, true, minX - H, maxX + H, minZ, LOOP.xLines.filter((x) => x >= minX - 1 && x <= maxX + 1));
  // Corner fills on the inside of each curve (the inner track's cars swing over them).
  for (const [cx, cz, sx, sz] of [[minX, maxZ, 1, -1], [minX, minZ, 1, 1], [maxX, minZ, -1, 1], [maxX, maxZ, -1, -1]]) {
    const x0 = cx + sx * H, x1 = cx + sx * (H + 5), z0 = cz + sz * H, z1 = cz + sz * (H + 5);
    solid(ctx, 'painted', box(Math.abs(x1 - x0), 0.6, Math.abs(z1 - z0), (x0 + x1) / 2, EL.deckTop - 0.3, (z0 + z1) / 2), { color: 0x2f2a24, tag: 'elDeck' });
  }
  // West Line: from the region edge to the junction, beside the west leg.
  const W = EL.westLine;
  elRun(ctx, true, W.regionEdgeX, W.eastX + 6, W.z, LOOP.xLines.filter((x) => x < W.eastX + 20));
  // Buffer stops at the junction end of both West Line tracks.
  for (const off of [-EL.track, EL.track]) {
    solid(ctx, 'painted', box(0.5, 1.0, 2.2, W.eastX - 1.2, EL.railTop + 0.4, W.z + off), { color: 0xb8342c, tag: 'buffer' });
    glow(ctx, box(0.12, 0.25, 0.25, W.eastX - 1.5, EL.railTop + 1.1, W.z + off), PALETTE.crimson);
  }
  // Track bed: both Loop tracks (except the proof stretch's straight on the south leg, which has
  // its own rails) and both West Line tracks.
  const southStraight = (x, z) => Math.abs(z - maxZ) < 3.5 && Math.abs(x) < 96;
  for (const off of [-EL.track, EL.track]) {
    trackBed(ctx, loopTrack(off), { skip: southStraight });
    trackBed(ctx, westTrack(off, W.regionEdgeX));
  }
  // Stations.
  const sites = [];
  for (const st of EL_STATIONS) sites.push(...elStation(ctx, st));
  return sites;
}

// [polish2] The West Line beyond the Loop (x -266 west to Park Row): the same bents, girders, deck,
// track bed and stations as the Loop's stretch, built a district at a time so each piece lands in
// its own region's chunks. `region`: 'westRiver' (over the fixed span on the North Branch),
// 'narrows' (the island and the channel bridge) or 'parkRow' (to the terminus). No rng: the
// regions' seeds draw exactly what they drew before. The cross streets come from the west layout
// (passed in, so this file keeps to the Loop's numbers).
const WEST_SPANS = { westRiver: [-300, -266], narrows: [-450, -300], parkRow: [EL.westLine.deckWestX, -450] };
export function buildElWest(ctx, region, crossX = []) {
  const W = EL.westLine;
  const [a, b] = WEST_SPANS[region];
  elRun(ctx, true, a, b, W.z, crossX);
  const t0 = Math.max(a, W.trackWestX);
  for (const off of [-EL.track, EL.track]) {
    trackBed(ctx, [{ x: t0, z: W.z + off }, { x: b, z: W.z + off }]);
    if (t0 > a) {
      // The terminus: buffer stops on both tracks, a red lamp on each.
      solid(ctx, 'painted', box(0.5, 1.0, 2.2, t0 - 0.6, EL.railTop + 0.4, W.z + off), { color: 0xb8342c, tag: 'buffer' });
      glow(ctx, box(0.12, 0.25, 0.25, t0 - 0.3, EL.railTop + 1.1, W.z + off), PALETTE.crimson);
    }
  }
  if (t0 > a) railing(ctx, false, W.z - EL.deckHalf, W.z + EL.deckHalf, a + 0.15, DECK_TOP, { color: EL_STEEL });
  const sites = [];
  for (const st of EL_WEST_STATIONS) if (st.region === region) sites.push(...elStation(ctx, st));
  return sites;
}

// ======================================================================================
// Trains
// ======================================================================================

// Car-local collision boxes (origin on the rail top at the car centre, +z forward): the roof, the
// floor, the underframe, side walls split by the door openings, end walls with a gangway gap.
// [polish] They turn with the car (collision moveBoxOriented): in a curve the floor and walls keep
// their true shape, where the old axis-aligned bounds swelled over the neighbouring car (a rider
// joined the wrong carrier and slid off the end) and the curve's floor squares left gaps.
const HW = EL_CAR.width / 2, HL = EL_CAR.length / 2;
const STRAIGHT_BOXES = (() => {
  const roof = EL_CAR.roofY, fl = EL_CAR.floorY, wy0 = fl, wy1 = roof - 0.12;
  const doors = EL_CAR.doorZ.map((z) => [z - EL_CAR.doorWidth / 2, z + EL_CAR.doorWidth / 2]).sort((p, q) => p[0] - q[0]);
  const wallSpans = [[-HL, doors[0][0]], [doors[0][1], doors[1][0]], [doors[1][1], HL]];
  const list = [
    { min: [-HW + 0.08, roof - 0.12, -HL + 0.15], max: [HW - 0.08, roof, HL - 0.15], tag: 'trainRoof', carry: true },
    { min: [-HW + 0.1, 0.95, -HL + 0.2], max: [HW - 0.1, fl, HL - 0.2], tag: 'trainFloor', carry: true },
    { min: [-1.2, 0.15, -HL + 0.6], max: [1.2, 0.95, HL - 0.6], tag: 'train' },
  ];
  for (const s of [-1, 1]) for (const [z0, z1] of wallSpans) list.push({ min: [s > 0 ? HW - 0.1 : -HW, wy0, z0], max: [s > 0 ? HW : -HW + 0.1, wy1, z1], tag: 'train' });
  for (const e of [-1, 1]) for (const [x0, x1] of [[-HW, -0.45], [0.45, HW]]) list.push({ min: [x0, wy0, e > 0 ? HL - 0.1 : -HL], max: [x1, wy1, e > 0 ? HL : -HL + 0.1], tag: 'train' });
  for (const L of list) {
    L.cx = (L.min[0] + L.max[0]) / 2; L.cz = (L.min[2] + L.max[2]) / 2;
    L.hx = (L.max[0] - L.min[0]) / 2; L.hz = (L.max[2] - L.min[2]) / 2;
  }
  return list;
})();
const NBOX = STRAIGHT_BOXES.length;
const FAR = 1e7;

// Train definitions for the current track layout. Pure (tests read it): the Loop's two tracks in
// opposite directions, the West Line's two tracks as shuttles. `perTrack` trains share each Loop
// track half a cycle apart (fewer on low tiers).
// [polish2] `west`: how many West Line shuttles run (1 or 2) and how long they are. The low tiers
// run one two-car shuttle: every car is skinned meshes the Narrows and Park Row now see, and the
// perf budget for those views was recorded before the line reached them.
export function trainDefs({ perTrack = 2, west = { trains: 2, cars: 4 } } = {}) {
  const defs = [];
  const loopStops = (T) => EL_STATIONS.filter((s) => s.line === 'loop').map((s) => pathProject(T, s.x, s.z));
  for (const [off, dir, id] of [[EL.track, 1, 'loopOuter'], [-EL.track, -1, 'loopInner']]) {
    const T = pathTable(loopTrack(off, dir));
    for (let k = 0; k < perTrack; k++) defs.push({ id: `${id}${k}`, table: T, closed: true, stops: loopStops(T), cars: 4, phase: k / perTrack });
  }
  for (const [off, id, phase] of [[-EL.track, 'westNorth', 0], [EL.track, 'westSouth', 0.5]].slice(0, west.trains)) {
    const T = pathTable(westTrack(off));
    // [polish2] The shuttles call at Canal and the Narrows on the way (distances of each station's
    // centre along the track; the runtime turns them into where the train's rear end stands).
    const stops = [...EL_STATIONS.filter((s) => s.id === 'elCanal'), ...EL_WEST_STATIONS].map((s) => pathProject(T, s.x, s.z + off));
    defs.push({ id, table: T, closed: false, stops, cars: west.cars, phase });
  }
  return defs;
}

// The runtime: builds the consists, their mover boxes, and an updater that moves everything from
// the timetable. Returns { trains, state, update(t) }: `state` is the per-train live record the
// audio (El layer) and anything else can poll: { id, x, y, z, speed, yaw, stopped, visible }.
export function createElTrains(ctx, { perTrack = null } = {}) {
  const density = ctx.quality?.crowdDensity ?? 1;
  const defs = trainDefs({ perTrack: perTrack ?? (density >= 0.5 ? 2 : 1), west: density >= 0.75 ? { trains: 2, cars: 4 } : { trains: 1, cars: 2 } });
  const pitch = EL_CAR.length + EL_CAR.coupleGap;
  const trains = [];
  const tmp = { x: 0, y: 0, z: 0, yaw: 0 };
  const tmpB = { x: 0, y: 0, z: 0, yaw: 0 };
  const sched = { s: 0, v: 0, dir: 1, stopped: true, leg: 0 };

  for (const def of defs) {
    const consist = createElTrain(def.cars);
    const n = consist.cars.length;
    const length = n * pitch - EL_CAR.coupleGap;
    // Closed tracks: stop with the train's middle at the station (head = station + half length).
    // Open tracks: the schedule runs the train's rear end from 0 to (track - train length).
    const schedule = def.closed
      ? createSchedule({ length: def.table.length, stops: def.stops.map((s) => s + length / 2), closed: true })
      : createSchedule({ length: Math.max(1, def.table.length - length), stops: def.stops.map((s) => s - length / 2), closed: false });
    const group = ctx.collision.addMoverGroup();
    const cars = consist.cars.map((car, i) => {
      car.group.removeFromParent();
      car.group.userData.dynamic = true;
      car.group.name = `elCar:${def.id}:${i}`;
      car.group.userData.parkHidden = true; // [perf2] off its stretch of line: no matrix updates (inkPipeline)
      ctx.scene.add(car.group);
      const carrier = { riders: [] };
      const boxes = [];
      for (let k = 0; k < NBOX; k++) boxes.push(ctx.collision.addMover(group, FAR, FAR, FAR, FAR, FAR, FAR, 'train', carrier));
      const cull = { minX: 0, minY: EL.railTop, minZ: 0, maxX: 0, maxY: EL.railTop + 4, maxZ: 0 };
      ctx.chunks?.addDetail(car.group, cull, 'lod');
      return { car, i, flip: i === n - 1, boxes, carrier, cull, x: 0, y: 0, z: 0, yaw: 0, placed: false };
    });
    // Lamp halos start inside the Loop (halos.freeze files each halo under the 512 m cell it sits
    // in at build time; the trains never leave that cell's cull box).
    // [polish2] The West Line's trains spend most of their run west of the Loop: theirs start there.
    const hx = def.closed ? 0 : -400, hz = def.closed ? -449 : EL.westLine.z;
    const head = ctx.halos.add(hx, EL.railTop + 1.4, hz, 0xfff2c8, 3.2);
    const tail = ctx.halos.add(hx, EL.railTop + 1.3, hz, PALETTE.crimson, 1.6);
    const state = { id: def.id, x: 0, y: EL.railTop, z: 0, speed: 0, yaw: 0, stopped: true, visible: false, line: def.id.startsWith('west') ? 'west' : 'loop' };
    trains.push({ def, consist, cars, schedule, length, group, head, tail, state, dir: 0, lastS: 0 });
  }

  // Positions one car at path distance s (its centre), facing along the path (+ PI if flipped),
  // swings its bogies onto the curve, and moves its collision boxes and riders.
  function placeCar(T, c, s, closed, dirSign) {
    pathPoint(T.def.table, s, closed, tmp);
    const yaw = tmp.yaw + (c.flip ? Math.PI : 0) + (dirSign < 0 ? Math.PI : 0);
    const x = tmp.x, y = tmp.y, z = tmp.z;
    const g = c.car.group;
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    // Bogies follow the track 5 m either side of the centre.
    for (let b = 0; b < 2; b++) {
      const off = (b === 0 ? 1 : -1) * EL_CAR.bogieZ * (c.flip ? -1 : 1) * (dirSign < 0 ? -1 : 1);
      pathPoint(T.def.table, s + off, closed, tmpB);
      const by = tmpB.yaw + (c.flip ? Math.PI : 0) + (dirSign < 0 ? Math.PI : 0);
      c.car.bogies[b].rotation.y = Math.atan2(Math.sin(by - yaw), Math.cos(by - yaw));
    }
    // Carry riders from the old pose to the new one (rotate about the old centre, then translate).
    if (c.placed && c.carrier.riders.length) {
      const dy = yaw - c.yaw, cs = Math.cos(dy), sn = Math.sin(dy);
      for (const p of c.carrier.riders) {
        const lx = p.x - c.x, lz = p.z - c.z;
        p.x = x + lx * cs + lz * sn;
        p.z = z - lx * sn + lz * cs;
        p.y += y - c.y;
      }
    }
    c.carrier.riders.length = 0;
    c.x = x; c.y = y; c.z = z; c.yaw = yaw; c.placed = true;
    // Collision boxes, turned with the car.
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    for (let k = 0; k < NBOX; k++) {
      const bx = c.boxes[k], L = STRAIGHT_BOXES[k];
      bx.carrier = L.carry ? c.carrier : null;
      bx.tag = L.tag;
      ctx.collision.moveBoxOriented(bx, x + L.cx * cy + L.cz * sy, z - L.cx * sy + L.cz * cy, sy, cy, L.hx, L.hz, y + L.min[1], y + L.max[1]);
    }
    c.cull.minX = x - HL; c.cull.maxX = x + HL; c.cull.minZ = z - HL; c.cull.maxZ = z + HL;
  }

  function update(t) {
    for (const T of trains) {
      const S = T.schedule;
      S.at(t + T.def.phase * S.cycle, sched);
      const closed = T.def.closed;
      // Head (front end in the direction of travel) and per-car centres.
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const c of T.cars) {
        // Car 0 is the lead car when running forward; on a shuttle running back the consist keeps
        // its order along the track, so car 0 stays at the high-s end.
        const centre = closed ? sched.s - (c.i + 0.5) * (EL_CAR.length + EL_CAR.coupleGap) + EL_CAR.coupleGap / 2
          : sched.s + T.length - (c.i + 0.5) * (EL_CAR.length + EL_CAR.coupleGap) + EL_CAR.coupleGap / 2;
        placeCar(T, c, centre, closed, 1);
        if (c.x - HL < minX) minX = c.x - HL; if (c.x + HL > maxX) maxX = c.x + HL;
        if (c.z - HL < minZ) minZ = c.z - HL; if (c.z + HL > maxZ) maxZ = c.z + HL;
      }
      ctx.collision.setGroupBounds(T.group, minX, minZ, maxX, maxZ);
      // Lamps: the lead cab's headlamps on, the rear cab's tail lamps; a halo at each end.
      const fwd = closed || sched.dir > 0;
      if ((fwd ? 1 : -1) !== T.dir) {
        T.dir = fwd ? 1 : -1;
        const first = T.cars[0].car, last = T.cars[T.cars.length - 1].car;
        first.setLamps({ head: fwd, marker: true, tail: !fwd });
        last.setLamps({ head: !fwd, marker: true, tail: fwd });
      }
      const lead = fwd ? T.cars[0] : T.cars[T.cars.length - 1];
      const rear = fwd ? T.cars[T.cars.length - 1] : T.cars[0];
      const ly = lead.flip ? -1 : 1, ry = rear.flip ? -1 : 1;
      ctx.halos.set(T.head, lead.x + Math.sin(lead.yaw) * HL * 1.02, EL.railTop + 1.4, lead.z + Math.cos(lead.yaw) * HL * 1.02);
      ctx.halos.set(T.tail, rear.x + Math.sin(rear.yaw) * HL * 1.02, EL.railTop + 1.3, rear.z + Math.cos(rear.yaw) * HL * 1.02);
      void ly; void ry;
      // Wheels roll with the distance travelled.
      const ds = sched.s - T.lastS;
      if (Math.abs(ds) < 20) T.consist.roll(Math.abs(ds));
      T.lastS = sched.s;
      const st = T.state;
      st.x = lead.x; st.y = EL.railTop; st.z = lead.z; st.yaw = lead.yaw;
      st.speed = sched.v; st.stopped = sched.stopped; st.visible = lead.car.group.visible;
    }
  }
  // Placed by the first update (the world runs its updaters before the first frame is drawn).
  return { trains, state: trains.map((T) => T.state), update, defs };
}

// Nearest train to a point: { state, distance } (for the ambience's El layer). Allocation-free
// with `out`.
export function nearestTrain(runtime, x, y, z, out = { state: null, distance: Infinity }) {
  out.state = null; out.distance = Infinity;
  for (const s of runtime.state) {
    const d = Math.hypot(s.x - x, s.y - y, s.z - z);
    if (d < out.distance) { out.distance = d; out.state = s; }
  }
  return out;
}
