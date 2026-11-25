// [wanted] GCPD units as real, cheap actors: cruisers and SWAT vans driving the street graph
// (instanced: one set of draws for every cruiser), officers on foot (pooled skinned figures from the
// civilian generator's GCPD and SWAT looks, built one per frame at most), the searchlight helicopter
// (one model; its light cone is a real detection volume, its mesh only on tiers that allow it), and
// props placed ahead on the route (roadblocks, spike strips). Units spawn out of sight and leave out
// of sight, like the traffic pool. The director (wanted.js) sets the budget and the mode; this file
// moves, draws and reports. Nothing here can harm anyone: contacts shove, stun and immobilise.
//
// Per frame with no units: one early return. With units: no allocation (routes are recomputed a few
// times a second and those allocate a little; that is not per frame).
import * as THREE from 'three';
import { createTrafficInstances, createHelicopter } from '../vehicles/vehicleModels.js';
import { createLook } from '../actors/civilians/looks.js';
import { loadCivAnims } from '../actors/animPacks.js';
import { LAYER_FX } from '../render/layers.js';
import { toonMaterial } from '../render/toon.js';
import { snapToRoad, spawnSpot, predictRoute, roadblockSpots, spikeSpot } from './placement.js';
import { convertAttack } from './rules.js';
import { lerpAngle } from './netCodec.js'; // [verify]
import { createAvoidState, avoidSteer, avoidIdle, STUCK_REROUTE, STUCK_GIVE_UP } from '../nav/avoid.js'; // [balance]

const CRUISE = { police: 23, police_van: 19 };
const yAxis = new THREE.Vector3(0, 1, 0);
const LOOKS = ['gcpd', 'gcpdF', 'gcpd'];

function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uK: { value: 0.32 } },
    vertexShader: 'varying float vA; varying float vE; void main(){ vA = uv.y; vec3 n = normalize(normalMatrix * normal); vec3 v = normalize(-(modelViewMatrix * vec4(position,1.0)).xyz); vE = abs(dot(n, v)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uK; varying float vA; varying float vE; void main(){ float a = pow(vE, 1.2) * (0.35 + 0.65 * vA) * uK; gl_FragColor = vec4(uColor * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export function createPoliceUnits({ scene, world, assets, quality, caps, index, cameras, rng = Math.random, on = () => {} }) {
  const graph = world.streetGraph;
  const collision = world.collision;
  const halos = world.halos;
  const bridgeBlocked = (e) => !!e.bridge && world.bridges?.isDown?.(e.bridge) === false;

  // ---------------------------------------------------------------- visibility (spawn rules)
  const camTmp = { x: 0, y: 0, z: 0 };
  function visible(x, y, z) {
    for (const c of cameras()) {
      const e = c.matrixWorld.elements;
      const dx = x - c.position.x, dy = y + 1 - c.position.y, dz = z - c.position.z, L = Math.hypot(dx, dy, dz) || 1;
      if (L < 30) return true;
      if (L < 240 && (dx * -e[8] + dy * -e[9] + dz * -e[10]) / L > 0.5) return true;
    }
    return false;
  }
  void camTmp;

  // ---------------------------------------------------------------- vehicles
  const nStatic = caps.roadblocks * 2;
  const nPolice = caps.vehicles + nStatic;
  const sets = {
    police: createTrafficInstances('police', nPolice),
    police_van: caps.vans > 0 ? createTrafficInstances('police_van', Math.max(1, caps.vans)) : null,
  };
  for (const s of Object.values(sets)) if (s) for (const m of s.meshes) { m.count = 0; m.visible = false; scene.add(m); }
  const cruisers = [];
  for (let i = 0; i < caps.vehicles; i++) {
    cruisers.push({
      i, kind: 'cruiser', active: false, type: 'police', x: 0, y: 0, z: 0, yaw: 0, speed: 0, vx: 0, vz: 0,
      path: [], pi: 0, repathT: 0, mode: 'idle', stun: 0, spin: 0, target: 0, slot: i, parkT: 0, dropped: 0, leaveT: 0,
      pitT: 0, beaconA: halos.add(0, -50, 0, 0xff2a3a, 0.01), beaconB: halos.add(0, -50, 0, 0x3a6dff, 0.01), siren: true,
    });
  }
  const statics = []; // parked roadblock cruisers: { x, y, z, yaw }
  const mtx = new THREE.Matrix4(), quat = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), vpos = new THREE.Vector3();

  function freeCruiser(type) {
    for (const c of cruisers) if (!c.active) { c.type = type; return c; }
    return null;
  }
  function spawnCruiser(type, target, tgtIdx) {
    const c = freeCruiser(type);
    if (!c) return null;
    // On the hero's own deck (a cruiser on Lower Gotham's lower deck is no use to a chase upstairs).
    const at = snapToRoad(index, target.x, target.ground ?? target.y, target.z, { maxDist: 120 });
    const deck = at ? graph.edges[at.edge].deck : null;
    const sp = spawnSpot(index, target, { min: 95, max: 175, visible, rnd: rng, blocked: bridgeBlocked, deck: deck === 'ramp' ? null : deck });
    if (!sp) return null;
    c.active = true; c.x = sp.x; c.y = sp.y; c.z = sp.z; c.yaw = sp.yaw; c.speed = 12; c.mode = 'pursue';
    c.stun = 0; c.spin = 0; c.path.length = 0; c.pi = 0; c.repathT = 0; c.target = tgtIdx; c.parkT = 0; c.dropped = 0; c.leaveT = 0; c.pitT = 2;
    c.siren = true;
    return c;
  }
  function despawnCruiser(c) {
    c.active = false; c.mode = 'idle';
    halos.set(c.beaconA, 0, -50, 0, 0.01); halos.set(c.beaconB, 0, -50, 0, 0.01);
  }

  // Route along the street graph from the cruiser to (tx, ty, tz), as road points.
  const headTmp = { x: 0, z: 0 };
  function routeCruiser(c, tx, ty, tz) {
    headTmp.x = Math.sin(c.yaw); headTmp.z = Math.cos(c.yaw);
    const b = snapToRoad(index, tx, ty, tz, { maxDist: 140 });
    // Already heading for a junction ahead: keep going there and route on from it (no flip-flop
    // between the two ends of the current street on every repath).
    const ahead = c.path[c.pi];
    if (b && ahead && ahead.id !== undefined && c.speed > 2 && (ahead.x - c.x) * headTmp.x + (ahead.z - c.z) * headTmp.z > 0) {
      const eb = graph.edges[b.edge];
      let best = null, bl = Infinity;
      for (const nb of [eb.a, eb.b]) {
        if (eb.oneway && nb === eb.b) continue;
        const r = graph.route(ahead.id, nb, { blocked: bridgeBlocked });
        if (!r) continue;
        const N1 = graph.nodes[nb];
        const len = r.length + Math.hypot(N1.x - b.x, N1.z - b.z);
        if (len < bl) { bl = len; best = r; }
      }
      if (best) {
        c.path.length = 0; c.pi = 0;
        for (const n of best.nodes) c.path.push(graph.nodes[n]);
        c.path.push(pt(b));
        return true;
      }
    }
    const a = snapToRoad(index, c.x, c.y, c.z, { maxDist: 50, dir: headTmp });
    c.path.length = 0; c.pi = 0;
    if (!a || !b) return false;
    const ea = graph.edges[a.edge], eb = graph.edges[b.edge];
    if (ea.id === eb.id) { c.path.push(pt(a), pt(b)); return true; }
    const A = graph.nodes[ea.a], B = graph.nodes[ea.b];
    const fwdB = (B.x - A.x) * headTmp.x + (B.z - A.z) * headTmp.z >= 0;
    const starts = ea.oneway ? [ea.b] : fwdB ? [ea.b, ea.a] : [ea.a, ea.b];
    let best = null, bl = Infinity;
    for (let si = 0; si < starts.length; si++) {
      const na = starts[si];
      for (const nb of [eb.a, eb.b]) {
        if (eb.oneway && nb === eb.b) continue;
        const r = graph.route(na, nb, { blocked: bridgeBlocked });
        if (!r) continue;
        const N0 = graph.nodes[na], N1 = graph.nodes[nb];
        // Turning back costs extra (a U-turn in traffic).
        const len = Math.hypot(N0.x - a.x, N0.z - a.z) * (si === 0 ? 1 : 2.5) + r.length + Math.hypot(N1.x - b.x, N1.z - b.z);
        if (len < bl) { bl = len; best = r; }
      }
      if (best && si === 0 && bl < 400) break;
    }
    if (!best) return false;
    c.path.push(pt(a));
    for (const n of best.nodes) c.path.push(graph.nodes[n]);
    c.path.push(pt(b));
    return true;
  }
  const pt = (s) => ({ x: s.x, y: s.y, z: s.z });

  // Move along c.path at c.speed toward want speed; or steer straight at (sx, sz) when `direct`.
  function driveCruiser(c, dt, want, direct, sx, sz) {
    if (c.stun > 0) {
      c.stun -= dt;
      c.speed *= Math.max(0, 1 - dt * 2.5);
      c.x += c.vx * dt; c.z += c.vz * dt;
      c.vx *= Math.max(0, 1 - dt * 2); c.vz *= Math.max(0, 1 - dt * 2);
      c.yaw += c.spin * dt; c.spin *= Math.max(0, 1 - dt * 2);
      return;
    }
    const acc = want > c.speed ? 7 : 11;
    c.speed += Math.max(-acc * dt, Math.min(acc * dt, want - c.speed));
    let tx, tz, ty = c.y;
    if (direct) { tx = sx; tz = sz; }
    else {
      // Next path point (skip ones already reached).
      while (c.pi < c.path.length - 1) {
        const p = c.path[c.pi];
        if (Math.hypot(p.x - c.x, p.z - c.z) < 4 + c.speed * 0.15) c.pi++; else break;
      }
      const p = c.path[c.pi];
      if (!p) { c.speed *= Math.max(0, 1 - dt * 3); return; }
      tx = p.x; tz = p.z; ty = p.y;
      if (c.pi === c.path.length - 1 && Math.hypot(p.x - c.x, p.z - c.z) < 3) c.speed *= Math.max(0, 1 - dt * 4);
    }
    const want_yaw = Math.atan2(tx - c.x, tz - c.z);
    let dy = want_yaw - c.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const turn = (direct ? 2.2 : 3.2) * dt;
    c.yaw += Math.max(-turn, Math.min(turn, dy));
    // Slow for sharp turns.
    if (Math.abs(dy) > 0.9) c.speed = Math.min(c.speed, 9);
    c.x += Math.sin(c.yaw) * c.speed * dt;
    c.z += Math.cos(c.yaw) * c.speed * dt;
    c.y += (ty - c.y) * Math.min(1, dt * 4);
  }

  // ---------------------------------------------------------------- officers
  const officers = [];
  const clips = new Map(assets?.clips ?? []);
  const figAssets = assets ? { ...assets, clips } : null;
  let civReady = false;
  const civP = assets ? loadCivAnims({ base: assets.base ?? './assets/' }).then((pack) => { for (const [n, c] of pack.clips) clips.set(n, c); civReady = true; }).catch(() => { civReady = true; }) : null;
  void civP;
  const has = (n) => clips.has(n);
  const clipFor = (want) => {
    for (const n of want) if (has(n)) return n;
    return null;
  };
  const RUN = ['Run_Loop', 'Civ_Jog', 'Walk_Loop'];
  const WALK = ['Walk_Loop'];
  const IDLE = ['Idle_Loop'];
  const AIM = ['Pistol_Idle', 'Civ_Point', 'Idle_Loop'];
  const DOWN = ['Crouch_Idle_Loop', 'Civ_Scared', 'Idle_Loop'];
  const TALK = ['Civ_Argue', 'Civ_Idle_Look', 'Idle_Loop'];
  for (let i = 0; i < caps.officers; i++) {
    officers.push({
      i, kind: 'officer', look: i >= Math.max(2, caps.officers - 3) ? 'swat' : LOOKS[i % LOOKS.length], ch: null, active: false,
      x: 0, y: 0, z: 0, yaw: 0, speed: 0, mode: 'idle', stun: 0, restrained: false, target: 0, t: 0, clip: null, tx: 0, tz: 0,
      gy: 0, gyT: 0, prevY: 0, taserT: 0, barkT: 0, spotter: false, from: null, groundOK: true, path: null, pi: 0, repathT: 0, direct: false,
    });
  }
  let buildTurn = 0;
  // Builds at most one figure per call (each is a skinned mesh: ~ms to make).
  function ensureFigure(o) {
    if (o.ch || !figAssets) return !!o.ch;
    if (buildTurn > 0) return false;
    buildTurn = 1;
    try {
      o.ch = createLook(figAssets, o.look);
      o.ch.root.visible = false;
      o.ch.root.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
      scene.add(o.ch.root);
    } catch (err) { console.warn('[wanted] officer figure failed', err); o.ch = null; return false; }
    return true;
  }
  const look = { x: 0, y: 0, z: 0 };
  const cyl = { x: 0, y: 0, z: 0 };
  const resolveOut = { grounded: false, groundY: 0, hitWall: false, ceiling: false };
  function play(o, list, { once = false, ts = 1 } = {}) {
    const n = clipFor(list);
    if (!n || !o.ch) return;
    if (o.clip !== n) { o.clip = n; try { o.ch.animator.play(n, { fade: 0.2, once }); } catch { /* missing clip */ } }
    o.ch.animator.mixer.timeScale = ts;
  }
  function spawnOfficer(look, x, y, z, yaw, tgt, opts = {}) {
    for (const o of officers) {
      if (o.active || (look === 'swat') !== (o.look === 'swat')) continue;
      if (!ensureFigure(o)) return null;
      o.active = true; o.x = x; o.y = y; o.z = z; o.yaw = yaw; o.speed = 0; o.mode = opts.mode ?? 'chase'; o.stun = 0; o.restrained = false;
      o.target = tgt; o.t = 0; o.clip = null; o.path = null; o.pi = 0; o.repathT = 0; o.direct = false; o.gy = y; o.gyT = 0; o.prevY = y; o.taserT = 3 + rng() * 3; o.barkT = rng() * 2; o.spotter = !!opts.spotter;
      o.kind = o.spotter ? 'spotter' : 'officer';
      o.ch.root.visible = true;
      o.ch.root.position.set(x, y, z);
      o.ch.face(yaw);
      return o;
    }
    return null;
  }
  function despawnOfficer(o) {
    if (o.av) avoidIdle(o.av);
    o.active = false; o.mode = 'idle'; o.restrained = false;
    if (o.ch) o.ch.root.visible = false;
  }
  // Out of sight on a sidewalk 30..70 m from the target.
  function spawnOfficerNear(target, tgt, look = 'gcpd', mode = 'chase') {
    const sp = spawnSpot(index, target, { min: 30, max: 75, visible, rnd: rng, blocked: bridgeBlocked });
    if (!sp) return null;
    const e = graph.edges[sp.edge];
    const side = rng() < 0.5 ? 1 : -1;
    const off = (e.width ?? 12) / 2 + 1.6;
    const x = sp.x + Math.cos(sp.yaw) * off * side, z = sp.z - Math.sin(sp.yaw) * off * side;
    const gy = collision.groundBelow(x, sp.y + 2, z, 0.3);
    return spawnOfficer(look, x, gy > -Infinity ? gy : sp.y, z, sp.yaw, tgt, { mode });
  }

  // ---------------------------------------------------------------- the helicopter
  const heli = { kind: 'heli', active: false, x: 0, y: 0, z: 0, yaw: 0, mode: 'idle', stun: 0, light: { x: 0, z: 0, r: 7, y: 0 }, t: 0, model: null, beam: null, pool: null, gyT: 0, lost: 0, target: 0 };
  function ensureHeli() {
    if (heli.model) return;
    heli.model = createHelicopter('gcpd');
    heli.model.group.userData.dynamic = true;
    heli.model.group.visible = false;
    scene.add(heli.model.group);
    // The ground spot: a soft additive disc (every tier: it's how you see where the light is).
    heli.pool = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf6f0d0, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    heli.pool.layers.set(LAYER_FX);
    heli.pool.frustumCulled = false;
    heli.pool.visible = false;
    heli.pool.renderOrder = 2;
    scene.add(heli.pool);
    // The cone itself: only where the tier allows the extra transparent overdraw.
    if (caps.heliCone) {
      heli.beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.08, 1, 20, 1, true).translate(0, -0.5, 0), beamMaterial(0xdfe8ff));
      heli.beam.layers.set(LAYER_FX);
      heli.beam.frustumCulled = false;
      heli.beam.visible = false;
      scene.add(heli.beam);
    }
  }
  function spawnHeli(target) {
    ensureHeli();
    const a = rng() * Math.PI * 2;
    heli.active = true; heli.mode = 'arrive'; heli.t = 0; heli.stun = 0; heli.lost = 0;
    heli.x = target.x + Math.cos(a) * 300; heli.z = target.z + Math.sin(a) * 300; heli.y = 70;
    heli.light.x = target.x; heli.light.z = target.z; heli.light.y = target.y ?? 0;
    heli.model.group.visible = true;
    heli.pool.visible = true;
    if (heli.beam) heli.beam.visible = true;
  }
  function despawnHeli() {
    heli.active = false; heli.mode = 'idle';
    if (heli.model) { heli.model.group.visible = false; heli.pool.visible = false; if (heli.beam) heli.beam.visible = false; }
  }
  const beamDir = new THREE.Vector3(), beamTop = new THREE.Vector3();

  // ---------------------------------------------------------------- props: roadblocks and spikes
  const barricadeGeo = new THREE.BoxGeometry(2.4, 1.0, 0.22).translate(0, 0.75, 0);
  const barMat = toonMaterial({ color: 0xf2f0e8 });
  const bars = new THREE.InstancedMesh(barricadeGeo, barMat, Math.max(1, caps.roadblocks * 3));
  bars.count = 0; bars.visible = false; bars.frustumCulled = false; bars.name = 'wanted-barricades';
  const stripeCol = new THREE.Color();
  for (let i = 0; i < bars.instanceMatrix.count; i++) bars.setColorAt(i, stripeCol.set(i % 2 ? 0xff7a1a : 0xf2f0e8));
  scene.add(bars);
  const spikeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.6), toonMaterial({ color: 0x2a2c33 }));
  spikeMesh.visible = false; spikeMesh.name = 'wanted-spikes';
  scene.add(spikeMesh);
  const roadblocks = []; // { x, y, z, yaw, halfWidth, hit, beacon }
  const rbBeacons = [];
  for (let i = 0; i < caps.roadblocks * 2; i++) rbBeacons.push(halos.add(0, -50, 0, i % 2 ? 0x3a6dff : 0xff2a3a, 0.01));
  const spike = { active: false, x: 0, y: 0, z: 0, yaw: 0, halfWidth: 6, hit: false };
  const okAt = (x, y, z, yaw, hw) => {
    // Clear of buildings across the road width, from knee to roof height of a car.
    const cx = Math.cos(yaw), cz = -Math.sin(yaw);
    for (let k = -1; k <= 1; k++) {
      const px = x + cx * hw * 0.8 * k, pz = z + cz * hw * 0.8 * k;
      const g = collision.groundBelow(px, y + 1.5, pz, 0.3);
      if (!(g > y - 1.2)) return false;
      const hit = collision.raycast({ x: px, y: y + 0.6, z: pz }, { x: 0, y: 1, z: 0 }, 1.6);
      if (hit) return false;
    }
    return true;
  };
  function placeRoadblocks(from, dir, n) {
    clearRoadblocks();
    if (n <= 0) return 0;
    const route = predictRoute(index, from, dir, 240, { blocked: bridgeBlocked });
    const spots = roadblockSpots(index, route, { count: n, minAhead: 70, maxAhead: 230, okAt, deck: null });
    for (const s of spots) {
      if (visible(s.x, s.y, s.z) && Math.hypot(s.x - from.x, s.z - from.z) < 90) continue; // never pop in close view
      roadblocks.push({ x: s.x, y: s.y, z: s.z, yaw: s.yaw, halfWidth: s.halfWidth, hit: false });
    }
    layoutProps();
    return roadblocks.length;
  }
  function placeSpikes(from, dir) {
    spike.active = false;
    const route = predictRoute(index, from, dir, 160, { blocked: bridgeBlocked });
    const s = spikeSpot(index, route, { minAhead: 50, maxAhead: 130, okAt });
    if (!s || (visible(s.x, s.y, s.z) && Math.hypot(s.x - from.x, s.z - from.z) < 60)) return false;
    Object.assign(spike, { active: true, x: s.x, y: s.y, z: s.z, yaw: s.yaw, halfWidth: s.halfWidth, hit: false });
    spikeMesh.position.set(s.x, s.y + 0.05, s.z);
    spikeMesh.rotation.set(0, s.yaw + Math.PI / 2, 0);
    spikeMesh.scale.set(s.halfWidth * 1.7, 1, 1);
    spikeMesh.visible = true;
    return true;
  }
  // Dev: why a roadblock did or didn't go down (scripts, tests).
  function debugRoadblocks(from, dir) {
    const route = predictRoute(index, from, dir, 240, { blocked: bridgeBlocked });
    const raw = roadblockSpots(index, route, { count: 4, minAhead: 70, maxAhead: 230 });
    return { junctions: route?.junctions.map((j) => [Math.round(j.at), Math.round(j.x), Math.round(j.z)]) ?? null, raw: raw.map((s) => ({ x: Math.round(s.x), z: Math.round(s.z), ok: okAt(s.x, s.y, s.z, s.yaw, s.halfWidth), vis: visible(s.x, s.y, s.z) })) };
  }
  function clearRoadblocks() { roadblocks.length = 0; layoutProps(); }
  function clearProps() { clearRoadblocks(); spike.active = false; spikeMesh.visible = false; }
  function layoutProps() {
    statics.length = 0;
    let b = 0;
    for (let r = 0; r < roadblocks.length; r++) {
      const rb = roadblocks[r];
      const cx = Math.cos(rb.yaw), cz = -Math.sin(rb.yaw);
      // Two cruisers nose to nose across the road, three barricades in front.
      for (const s of [-1, 1]) statics.push({ x: rb.x + cx * rb.halfWidth * 0.45 * s - Math.sin(rb.yaw) * 2, y: rb.y, z: rb.z + cz * rb.halfWidth * 0.45 * s - Math.cos(rb.yaw) * 2, yaw: rb.yaw + Math.PI / 2 * s });
      for (let k = -1; k <= 1; k++) {
        if (b >= bars.instanceMatrix.count) break;
        vpos.set(rb.x + cx * rb.halfWidth * 0.6 * k + Math.sin(rb.yaw) * 2.5, rb.y, rb.z + cz * rb.halfWidth * 0.6 * k + Math.cos(rb.yaw) * 2.5);
        quat.setFromAxisAngle(yAxis, rb.yaw + Math.PI / 2);
        bars.setMatrixAt(b++, mtx.compose(vpos, quat, one));
      }
      if (rbBeacons[r * 2] !== undefined) {
        halos.set(rbBeacons[r * 2], rb.x - cx * 2, rb.y + 1.8, rb.z - cz * 2, 2.2);
        halos.set(rbBeacons[r * 2 + 1], rb.x + cx * 2, rb.y + 1.8, rb.z + cz * 2, 2.2);
      }
    }
    for (let r = roadblocks.length * 2; r < rbBeacons.length; r++) halos.set(rbBeacons[r], 0, -50, 0, 0.01);
    bars.count = b; bars.visible = b > 0;
    bars.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- per frame
  let anyActive = false;
  const stats = { cruisers: 0, vans: 0, officers: 0, heli: 0, roadblocks: 0, spikes: 0, statics: 0, ms: 0 };
  let flash = 0;

  // ctx: { level, mode: 'noticed'|'pursuit'|'search'|'cooldown'|'idle', heroes: [{ x, y, z, vx, vz, driving,
  //   car, carSpeed, onFoot, roof, ground, seen, airborne }], lkp: { x, z } | null, budget, t }
  function update(dt, ctx) {
    buildTurn = 0;
    const heroes = ctx.heroes;
    if (!anyActive && ctx.level === 0) return;
    const t0 = performance.now();
    flash += dt;
    anyActive = false;
    const wantLeave = ctx.mode === 'cooldown' || ctx.level === 0;
    // ---- cruisers and vans: how many of each are live; spawn one per frame at most.
    let nC = 0, nV = 0;
    for (const c of cruisers) if (c.active) { if (c.type === 'police_van') nV++; else nC++; }
    if (!wantLeave && heroes.length) {
      const tgtIdx = (nC + nV) % heroes.length;
      const tgt = heroes[tgtIdx];
      if (nV < ctx.budget.vans) spawnCruiser('police_van', tgt, tgtIdx);
      else if (nC < ctx.budget.cruisers) spawnCruiser('police', tgt, tgtIdx);
    }
    // Too many for the budget (the level dropped): the farthest leave.
    if (nC > ctx.budget.cruisers || nV > ctx.budget.vans || wantLeave) {
      for (const c of cruisers) if (c.active && c.mode !== 'leave' && (wantLeave || (c.type === 'police_van' ? nV-- > ctx.budget.vans : nC-- > ctx.budget.cruisers))) { c.mode = 'leave'; c.leaveT = 0; c.repathT = 0; }
    }
    for (let ci = 0; ci < cruisers.length; ci++) {
      const c = cruisers[ci];
      if (!c.active) continue;
      anyActive = true;
      const h = heroes[c.target % Math.max(1, heroes.length)];
      let near = Infinity;
      for (const hh of heroes) near = Math.min(near, Math.hypot(hh.x - c.x, hh.z - c.z));
      c.repathT -= dt;
      c.pitT -= dt;
      let want = CRUISE[c.type], direct = false, sx = 0, sz = 0;
      if (c.mode === 'leave' || !h) {
        c.leaveT += dt;
        if (c.repathT <= 0) { c.repathT = 3; const a = Math.atan2(c.x - (h?.x ?? c.x), c.z - (h?.z ?? c.z)); routeCruiser(c, c.x + Math.sin(a) * 260, c.y, c.z + Math.cos(a) * 260); }
        want = 14;
        if ((near > 110 && !visible(c.x, c.y, c.z)) || c.leaveT > 25 || near > 260) { despawnCruiser(c); continue; }
      } else if (ctx.mode === 'search') {
        // Patrol round the last known position, slower, sirens on.
        want = 11;
        if (c.repathT <= 0 && ctx.lkp) { c.repathT = 6 + rng() * 3; const a = rng() * Math.PI * 2, r = 25 + rng() * 55; routeCruiser(c, ctx.lkp.x + Math.cos(a) * r, h.y, ctx.lkp.z + Math.sin(a) * r); }
      } else if (ctx.level === 1) {
        // Noticed: tail at a polite distance, park when he's on foot close by.
        const d = Math.hypot(h.x - c.x, h.z - c.z);
        want = d > 60 ? 16 : d > 22 ? 8 : 0;
        if (c.repathT <= 0) { c.repathT = 1.5; routeCruiser(c, h.x, h.ground, h.z); }
      } else {
        // Pursuit: route to where he will be; close in and box when near on the road.
        // Where they think he is: his real position while someone sees him (or just did), else
        // the last known position (they converge on it).
        const lead = h.known ? (h.driving ? 1.4 : 0.6) : 0;
        const px = h.kx + h.vx * lead, pz = h.kz + h.vz * lead;
        const d = Math.hypot(h.x - c.x, h.z - c.z);
        if (c.repathT <= 0) { c.repathT = d < 60 ? 0.8 : 1.6; routeCruiser(c, px, h.ground, pz); }
        want = d > 140 ? CRUISE[c.type] * 1.2 : CRUISE[c.type];
        if (h.known && h.driving && d < 26 && h.onRoad) {
          // Box in: each cruiser takes a slot round the car (behind-left, ahead, right, left...).
          direct = true;
          const fx = Math.sin(h.carYaw), fz = Math.cos(h.carYaw);
          const S = [[-3.2, -6], [0, 9], [3.2, -2], [-3.2, 2], [3.2, -7], [0, -9]][c.slot % 6];
          sx = h.x + fz * S[0] + fx * S[1]; sz = h.z - fx * S[0] + fz * S[1];
          want = Math.max(4, h.carSpeed + (Math.hypot(sx - c.x, sz - c.z) > 3 ? 4 : 0));
          // A PIT nudge when alongside: a shove on the car, never a crash.
          const lat = (c.x - h.x) * fz - (c.z - h.z) * fx, lon = (c.x - h.x) * fx + (c.z - h.z) * fz;
          if (c.pitT <= 0 && Math.abs(lat) < 3.6 && Math.abs(lat) > 1.6 && Math.abs(lon) < 2.5 && h.carSpeed > 8) { c.pitT = 6; on('pit', { cruiser: c, side: Math.sign(lat), hero: c.target }); }
        } else if (h.known && !h.driving && d < 20) {
          // He's on foot: stop, open the doors.
          want = 0;
          if (c.speed < 1.5 && c.dropped < 2 && ctx.level >= 2) {
            const o = spawnOfficer(c.type === 'police_van' ? 'swat' : 'gcpd', c.x + Math.cos(c.yaw) * 1.8, c.y, c.z - Math.sin(c.yaw) * 1.8, c.yaw, c.target, { mode: 'chase' });
            if (o) c.dropped++;
            else c.dropped = 2;
          }
        }
      }
      driveCruiser(c, dt, want, direct, sx, sz);
      // Keep apart from each other (no stacking).
      for (let k = ci + 1; k < cruisers.length; k++) {
        const o = cruisers[k];
        if (!o.active) continue;
        const dx = o.x - c.x, dz = o.z - c.z, d2 = dx * dx + dz * dz;
        if (d2 < 9 && d2 > 1e-4) { const d = Math.sqrt(d2), push = (3 - d) * 0.5; c.x -= (dx / d) * push; c.z -= (dz / d) * push; o.x += (dx / d) * push; o.z += (dz / d) * push; }
      }
    }
    // ---- officers
    let liveOff = 0;
    for (const o of officers) if (o.active) liveOff++;
    if (!wantLeave && heroes.length && liveOff < ctx.budget.officers) {
      // Level 1: two officers walk up; 2+: on foot from nearby when he isn't driving.
      const h = heroes[liveOff % heroes.length];
      if (ctx.level === 1 && liveOff < 2 && !h.driving && h.ground > -Infinity && !h.roof) spawnOfficerNear(h, liveOff % heroes.length, 'gcpd', 'approach');
      else if (ctx.level >= 2 && !h.driving && liveOff < Math.min(ctx.budget.officers, ctx.level + 1)) spawnOfficerNear(h, liveOff % heroes.length, ctx.level >= 4 && liveOff % 2 ? 'swat' : 'gcpd', 'chase');
      // Rooftop spotters at level 3+ on a perch near him (out of sight).
      if (ctx.level >= 3 && !officers.some((o) => o.active && o.spotter) && world.grapplePoints?.length) placeSpotter(h, liveOff % heroes.length);
    }
    for (const o of officers) {
      if (!o.active) continue;
      anyActive = true;
      stepOfficer(o, dt, ctx, wantLeave);
    }
    // ---- the helicopter
    if (ctx.budget.heli && !heli.active && !wantLeave && heroes.length) spawnHeli(heroes[0]);
    if (heli.active) { anyActive = true; stepHeli(dt, ctx, wantLeave || !ctx.budget.heli); }
    // ---- props: contact with the hero's car
    if (roadblocks.length || spike.active) anyActive = true;
    for (const h of heroes) if (h.driving && h.car) contactProps(h);
    if (wantLeave && (roadblocks.length || spike.active)) {
      let seenAny = false;
      for (const rb of roadblocks) if (visible(rb.x, rb.y, rb.z)) seenAny = true;
      if (!seenAny) clearProps();
    }
    draw();
    stats.ms = stats.ms * 0.95 + (performance.now() - t0) * 0.05;
  }

  function placeSpotter(h, tgt) {
    let best = null, bs = -Infinity;
    const P = world.grapplePoints;
    // Sample a few dozen perches (cheap): high, 40..110 m away, out of view.
    for (let k = 0; k < 40; k++) {
      const p = P[Math.floor(rng() * P.length)];
      if (!p || p.y < 8) continue;
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      if (d < 40 || d > 110 || visible(p.x, p.y, p.z)) continue;
      const sc = p.y * 0.2 - Math.abs(d - 70) * 0.05;
      if (sc > bs) { bs = sc; best = p; }
    }
    if (best) spawnOfficer('gcpd', best.x - (best.nx ?? 0) * 0.8, best.y, best.z - (best.nz ?? 0) * 0.8, Math.atan2(h.x - best.x, h.z - best.z), tgt, { mode: 'spot', spotter: true });
  }

  function stepOfficer(o, dt, ctx, wantLeave) {
    const heroes = ctx.heroes;
    const h = heroes[o.target % Math.max(1, heroes.length)];
    o.t += dt;
    o.barkT -= dt;
    o.taserT -= dt;
    let near = Infinity;
    for (const hh of heroes) near = Math.min(near, Math.hypot(hh.x - o.x, hh.z - o.z));
    if (o.stun > 0) {
      o.stun -= dt;
      play(o, o.restrained ? DOWN : DOWN);
      if (o.stun <= 0 && o.restrained) { o.stun = 0; o.mode = 'leave'; o.restrained = false; }
      finishOfficer(o, dt);
      return;
    }
    if (wantLeave && o.mode !== 'leave') o.mode = 'leave';
    if (o.mode === 'leave' || !h) {
      if ((near > 45 && !visible(o.x, o.y, o.z)) || near > 140 || o.t > 60) { despawnOfficer(o); return; }
      moveOfficer(o, dt, o.x + (o.x - (h?.x ?? o.x)), o.z + (o.z - (h?.z ?? o.z)), 2.2);
      play(o, WALK);
    } else if (o.mode === 'spot') {
      o.yaw = Math.atan2(h.x - o.x, h.z - o.z);
      play(o, AIM);
      if (near > 160) despawnOfficer(o);
    } else if (ctx.mode === 'search') {
      // Fan out round the last known position.
      if (!ctx.lkp) { play(o, IDLE); }
      else {
        if (o.t > 4 || Math.hypot(o.tx - o.x, o.tz - o.z) < 2) { o.t = 0; const a = rng() * Math.PI * 2, r = 6 + rng() * 26; o.tx = ctx.lkp.x + Math.cos(a) * r; o.tz = ctx.lkp.z + Math.sin(a) * r; }
        navigate(o, dt, o.tx, o.y, o.tz, 2.6);
        play(o, WALK, { ts: 1.1 });
        if (o.barkT <= 0) { o.barkT = 9 + rng() * 6; on('bark', { officer: o, kind: 'search' }); }
      }
    } else if (o.mode === 'approach' || ctx.level === 1) {
      const d = Math.hypot(h.x - o.x, h.z - o.z);
      if (d > 3.2 && !h.roof) { navigate(o, dt, h.x, h.y, h.z, d > 25 ? 3.2 : 1.7); play(o, d > 25 ? RUN : WALK, { ts: d > 25 ? 0.8 : 1 }); }
      else { o.yaw = Math.atan2(h.x - o.x, h.z - o.z); play(o, TALK); if (o.barkT <= 0) { o.barkT = 12; on('bark', { officer: o, kind: 'question' }); } }
      if (ctx.level >= 2) o.mode = 'chase';
    } else {
      // Chase: run at him; can't follow up walls, so stand below a rooftop and look up.
      const d = Math.hypot(h.x - o.x, h.z - o.z);
      const above = h.y - o.y > 3.5;
      const speed = o.look === 'swat' ? 5.2 : 6.2;
      const kd = Math.hypot(h.kx - o.x, h.kz - o.z);
      if (!h.known && kd < 3) { o.yaw += dt * 1.5; play(o, IDLE); } // at the last known spot: look round
      else if (d > 1.4 && !(above && d < 6)) { navigate(o, dt, h.known ? h.x : h.kx, h.y, h.known ? h.z : h.kz, speed); play(o, RUN, { ts: 1.05 }); }
      else { o.yaw = Math.atan2(h.x - o.x, h.z - o.z); play(o, above ? AIM : IDLE); }
      if (o.barkT <= 0 && d < 30) { o.barkT = 6 + rng() * 5; on('bark', { officer: o, kind: o.look === 'swat' ? 'swat' : 'chase' }); }
      // Taser (beat officers) or net (SWAT) at a hero on foot within range; warning shots at a car.
      if (o.taserT <= 0 && !above && h.known) {
        if (!h.driving && !h.airborne && d < (o.look === 'swat' ? 14 : 9) && ctx.level >= 2) {
          o.taserT = o.look === 'swat' ? 10 : 7;
          on(o.look === 'swat' && ctx.level >= 4 ? 'net' : 'taser', { officer: o, hero: o.target, d });
        } else if (h.driving && d < 30 && ctx.level >= 3) {
          o.taserT = 3.5;
          on('shot', { officer: o, hero: o.target, d });
        }
      }
    }
    finishOfficer(o, dt);
  }
  // Straight at the target when it is close and in the open; otherwise along the sidewalks of the
  // street graph (a route every couple of seconds), so nobody runs into a wall for ever.
  const losEye = { x: 0, y: 0, z: 0 }, losDir = { x: 0, y: 0, z: 0 }, losOut = { t: 0, box: null, normal: { x: 0, y: 0, z: 0 } };
  const navFrom = { x: 0, y: 0, z: 0 }, navTo = { x: 0, y: 0, z: 0 };
  function navigate(o, dt, tx, ty, tz, speed) {
    o.repathT -= dt;
    const d = Math.hypot(tx - o.x, tz - o.z);
    if (o.repathT <= 0) {
      o.repathT = 1.2 + rng() * 0.6;
      o.direct = false;
      if (d < 22) {
        losEye.x = o.x; losEye.y = o.y + 1.2; losEye.z = o.z;
        losDir.x = (tx - o.x) / (d || 1); losDir.y = 0; losDir.z = (tz - o.z) / (d || 1);
        o.direct = !collision.raycast(losEye, losDir, Math.max(0.1, d - 0.5), losOut);
      }
      if (!o.direct) {
        navFrom.x = o.x; navFrom.y = o.y; navFrom.z = o.z; navTo.x = tx; navTo.y = ty; navTo.z = tz;
        const r = graph.routeBetween(navFrom, navTo, { lane: 8.2, blocked: bridgeBlocked });
        o.path = r?.points ?? null; o.pi = 0;
        if (o.path) o.path.push({ x: tx, y: ty, z: tz });
      }
    }
    // [balance] Stuck (walking on the spot for 2 s): route along the sidewalks now; stuck for good
    // where nobody can see him: he goes (a fresh officer spawns on a sidewalk if still wanted).
    if (o.av?.stuck >= STUCK_REROUTE && o.repathT > 0.2) { o.repathT = 0; o.direct = false; }
    if (o.av?.stuck >= STUCK_GIVE_UP && !visible(o.x, o.y, o.z)) { despawnOfficer(o); return; }
    if (o.direct || !o.path) { moveOfficer(o, dt, tx, tz, speed); return; }
    while (o.pi < o.path.length - 1 && Math.hypot(o.path[o.pi].x - o.x, o.path[o.pi].z - o.z) < 1.5) o.pi++;
    const p = o.path[o.pi];
    moveOfficer(o, dt, p.x, p.z, speed);
  }
  function moveOfficer(o, dt, tx, tz, speed) {
    let dx = tx - o.x, dz = tz - o.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    // [balance] Local avoidance round building corners (src/nav/avoid.js), the same goons use.
    if (d > 1.2) { o.av ??= createAvoidState(); avoidSteer(o.av, collision, o.x, o.y, o.z, dx, dz, dt); dx = o.av.dx * d; dz = o.av.dz * d; }
    const wantYaw = Math.atan2(dx, dz);
    let dy = Math.atan2(Math.sin(wantYaw - o.yaw), Math.cos(wantYaw - o.yaw));
    o.yaw += Math.max(-8 * dt, Math.min(8 * dt, dy));
    const step = Math.min(d, speed * dt);
    cyl.x = o.x + (dx / d) * step; cyl.z = o.z + (dz / d) * step; cyl.y = o.y;
    collision.resolveCylinder(cyl, 0.35, 1.7, { prevY: o.prevY }, resolveOut);
    o.x = cyl.x; o.z = cyl.z;
  }
  function finishOfficer(o, dt) {
    // Ground a few times a second (falls and stairs), not every frame.
    o.gyT -= dt;
    if (o.gyT <= 0 && o.mode !== 'spot') {
      o.gyT = 0.2;
      const g = collision.groundBelow(o.x, o.y + 0.6, o.z, 0.3);
      if (g > -Infinity) o.gy = g;
    }
    o.prevY = o.y;
    if (o.mode !== 'spot') o.y += (o.gy - o.y) * Math.min(1, dt * 10);
    if (o.ch) {
      o.ch.root.position.set(o.x, o.y, o.z);
      o.ch.face(o.yaw);
      look.x = o.x; look.y = o.y; look.z = o.z;
      o.ch.animator.update(dt);
    }
  }

  function stepHeli(dt, ctx, leave) {
    heli.t += dt;
    if (heli.stun > 0) heli.stun -= dt;
    const heroes = ctx.heroes;
    const h = heroes[heli.target % Math.max(1, heroes.length)] ?? heroes[0];
    let tx = heli.x, tz = heli.z, ty = 48;
    if (leave || !h) {
      heli.mode = 'leave';
      const a = Math.atan2(heli.x - (h?.x ?? 0), heli.z - (h?.z ?? 0));
      tx = heli.x + Math.sin(a) * 100; tz = heli.z + Math.cos(a) * 100; ty = 80;
      if (!h || (Math.hypot(heli.x - h.x, heli.z - h.z) > 320 && !visible(heli.x, heli.y, heli.z))) { despawnHeli(); return; }
    } else {
      if (heli.mode === 'arrive' && Math.hypot(heli.x - h.x, heli.z - h.z) < 80) heli.mode = 'track';
      // The light: tracks him while seen (max speed: a fast car outruns it), sweeps round the last
      // known position while searching, and wanders off when a disruptor jams it.
      let lx = h.x, lz = h.z;
      const searching = ctx.mode === 'search' || heli.stun > 0;
      if (searching && ctx.lkp) {
        const r = 10 + Math.min(45, heli.t * 0.8);
        lx = ctx.lkp.x + Math.cos(heli.t * 0.45) * r; lz = ctx.lkp.z + Math.sin(heli.t * 0.31) * r;
      }
      if (heli.stun > 0) { lx += Math.cos(heli.t * 1.7) * 60; lz += Math.sin(heli.t * 1.3) * 60; }
      const ldx = lx - heli.light.x, ldz = lz - heli.light.z, ld = Math.hypot(ldx, ldz);
      const lmax = (searching ? 9 : 17) * dt;
      if (ld > 1e-3) { const k = Math.min(1, lmax / ld); heli.light.x += ldx * k; heli.light.z += ldz * k; }
      // Hover offset behind the light, slow orbit.
      const oa = heli.t * 0.18;
      tx = heli.light.x + Math.cos(oa) * 22; tz = heli.light.z + Math.sin(oa) * 22; ty = Math.max(42, h.y + 34);
    }
    const dx = tx - heli.x, dz = tz - heli.z, d = Math.hypot(dx, dz);
    const sp = Math.min(heli.mode === 'arrive' || heli.mode === 'leave' ? 38 : 20, d * 1.2);
    if (d > 1e-3) { heli.x += (dx / d) * sp * dt; heli.z += (dz / d) * sp * dt; heli.yaw += Math.atan2(Math.sin(Math.atan2(dx, dz) - heli.yaw), Math.cos(Math.atan2(dx, dz) - heli.yaw)) * Math.min(1, dt * 1.5); }
    heli.y += (ty - heli.y) * Math.min(1, dt * 0.8);
    // The spot sits on whatever is below it (a roof, the street), sampled a few times a second.
    heli.gyT -= dt;
    if (heli.gyT <= 0) { heli.gyT = 0.2; const g = collision.groundBelow(heli.light.x, heli.y - 3, heli.light.z, 0.5); heli.light.y = g > -Infinity ? g : 0; }
    heli.light.r = heli.mode === 'track' ? 7 : 9;
    poseHeli(dt, heli.mode !== 'leave' && heli.mode !== 'arrive');
  }
  // The model, the ground spot and the cone where heli says (the host's sim, or a guest's puppet). [verify]
  function poseHeli(dt, spot) {
    const g = heli.model.group;
    g.position.set(heli.x, heli.y, heli.z);
    g.rotation.set(0.12, heli.yaw, 0);
    heli.model.update(dt);
    heli.pool.position.set(heli.light.x, heli.light.y + 0.08, heli.light.z);
    heli.pool.scale.setScalar(heli.light.r);
    heli.pool.visible = spot;
    if (heli.beam) {
      beamTop.set(heli.x, heli.y - 1, heli.z);
      beamDir.set(heli.light.x - beamTop.x, heli.light.y - beamTop.y, heli.light.z - beamTop.z);
      const L = beamDir.length();
      heli.beam.visible = heli.pool.visible;
      heli.beam.position.copy(beamTop);
      heli.beam.scale.set(heli.light.r, L, heli.light.r);
      // The cylinder hangs down its -y: turn -y onto the beam direction.
      beamDir.multiplyScalar(-1 / Math.max(1e-4, L));
      heli.beam.quaternion.setFromUnitVectors(yAxis, beamDir);
    }
  }

  // The hero's car against roadblocks and spikes.
  function contactProps(h) {
    for (const rb of roadblocks) {
      if (rb.hit) continue;
      const fx = Math.sin(rb.yaw), fz = Math.cos(rb.yaw);
      const lon = (h.x - rb.x) * fx + (h.z - rb.z) * fz, lat = (h.x - rb.x) * fz - (h.z - rb.z) * fx;
      if (Math.abs(lon) < 3.2 && Math.abs(lat) < rb.halfWidth + 1 && Math.abs(h.y - rb.y) < 3) { rb.hit = true; on('roadblock', { rb, hero: h.index }); }
    }
    if (spike.active && !spike.hit) {
      const fx = Math.sin(spike.yaw), fz = Math.cos(spike.yaw);
      const lon = (h.x - spike.x) * fx + (h.z - spike.z) * fz, lat = (h.x - spike.x) * fz - (h.z - spike.z) * fx;
      if (Math.abs(lon) < 1.6 && Math.abs(lat) < spike.halfWidth + 0.5 && Math.abs(h.y - spike.y) < 2) { spike.hit = true; on('spikes', { hero: h.index }); }
    }
  }

  function draw() {
    let n = 0, nv = 0;
    const P = sets.police, V = sets.police_van;
    const on1 = Math.floor(flash * 6) % 2;
    for (const c of cruisers) {
      if (!c.active) continue;
      quat.setFromAxisAngle(yAxis, c.yaw);
      mtx.compose(vpos.set(c.x, c.y, c.z), quat, one);
      if (c.type === 'police_van' && V) V.setInstance(nv++, mtx); else P.setInstance(n++, mtx);
      const sx = Math.cos(c.yaw) * 0.45, sz = -Math.sin(c.yaw) * 0.45;
      const by = c.y + (c.type === 'police_van' ? 2.6 : 1.75);
      halos.set(c.beaconA, c.x - sx, by, c.z - sz, c.siren ? (on1 ? 2.8 : 0.5) : 0.01);
      halos.set(c.beaconB, c.x + sx, by, c.z + sz, c.siren ? (on1 ? 0.5 : 2.8) : 0.01);
    }
    for (const s of statics) {
      if (n >= nPolice) break;
      quat.setFromAxisAngle(yAxis, s.yaw);
      P.setInstance(n++, mtx.compose(vpos.set(s.x, s.y, s.z), quat, one));
    }
    for (const m of P.meshes) { m.count = n; m.visible = n > 0; }
    if (n) P.commit();
    if (V) { for (const m of V.meshes) { m.count = nv; m.visible = nv > 0; } if (nv) V.commit(); }
    stats.cruisers = n - statics.length; stats.vans = nv; stats.statics = statics.length;
    let k = 0;
    for (const o of officers) if (o.active) k++;
    stats.officers = k; stats.heli = heli.active ? 1 : 0; stats.roadblocks = roadblocks.length; stats.spikes = spike.active ? 1 : 0;
  }

  // ---------------------------------------------------------------- attacks (non-lethal only)
  // A gadget or strike at (x, z) within r: every officer / vehicle / the helicopter in range gets
  // the converted outcome. Returns the list of outcomes (reused) for the director to cost.
  const hits = [];
  function attackArea(attack, x, y, z, r, { officersOnly = false } = {}) {
    hits.length = 0;
    for (const o of officers) {
      if (!o.active || o.restrained) continue;
      if (Math.hypot(o.x - x, o.z - z) > r || Math.abs(o.y - y) > 4) continue;
      const res = convertAttack('officer', attack);
      applyOfficer(o, res, x, z);
      hits.push({ unit: o, res });
    }
    if (!officersOnly) {
      for (const c of cruisers) {
        if (!c.active || Math.hypot(c.x - x, c.z - z) > r + 2) continue;
        const res = convertAttack('vehicle', attack);
        if (res.outcome === 'none' || res.outcome === 'refused') continue;
        c.stun = Math.max(c.stun, res.stun); c.speed *= 0.3;
        hits.push({ unit: c, res });
      }
      if (heli.active && Math.hypot(heli.light.x - x, heli.light.z - z) < Math.max(r, 60)) {
        const res = convertAttack('heli', attack);
        if (res.outcome === 'lost') { heli.stun = res.stun; hits.push({ unit: heli, res }); }
      }
    }
    return hits;
  }
  function applyOfficer(o, res, x, z) {
    o.stun = Math.max(o.stun, res.stun);
    if (res.restrain) o.restrained = true;
    if (res.outcome === 'shove' || res.outcome === 'diveClear') {
      const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz) || 1;
      cyl.x = o.x + (dx / d) * 1.2; cyl.z = o.z + (dz / d) * 1.2; cyl.y = o.y;
      collision.resolveCylinder(cyl, 0.35, 1.7, { prevY: o.y }, resolveOut);
      o.x = cyl.x; o.z = cyl.z;
    }
    o.clip = null;
  }
  // The officer nearest to (x, z) within r who can still be restrained, or null.
  function nearestOfficer(x, y, z, r) {
    let best = null, bd = r;
    for (const o of officers) {
      if (!o.active || o.restrained || o.spotter) continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < bd && Math.abs(o.y - y) < 1.8) { bd = d; best = o; }
    }
    return best;
  }
  // A shove from the hero's car: returns the cruiser hit (or null) for the director to cost.
  function carContact(h, carSpeed, carYaw, radius) {
    for (const c of cruisers) {
      if (!c.active || c.stun > 0.5) continue;
      const dx = c.x - h.x, dz = c.z - h.z, d = Math.hypot(dx, dz);
      if (d > radius + 2.2 || Math.abs(c.y - h.y) > 2.5) continue;
      const nx = dx / (d || 1), nz = dz / (d || 1);
      const mine = carSpeed * (Math.sin(carYaw) * nx + Math.cos(carYaw) * nz);
      const theirs = -c.speed * (Math.sin(c.yaw) * nx + Math.cos(c.yaw) * nz);
      // Pushed apart either way; only a hit the hero drove into counts as ramming.
      c.vx = nx * (Math.abs(mine) * 0.5 + 2); c.vz = nz * (Math.abs(mine) * 0.5 + 2);
      c.spin = (rng() < 0.5 ? -1 : 1) * (1 + Math.abs(mine) * 0.08);
      c.x += nx * Math.max(0, radius + 2.2 - d); c.z += nz * Math.max(0, radius + 2.2 - d);
      if (mine > theirs + 3 && mine > 6) { const res = convertAttack('vehicle', 'ram'); c.stun = res.stun; return { cruiser: c, res, speed: mine }; }
      c.stun = Math.max(c.stun, 0.6);
      return null;
    }
    return null;
  }
  // Officers stepping out of the way of a car (never run over: they dive clear).
  function clearRoad(x, z, fx, fz, speed) {
    for (const o of officers) {
      if (!o.active || o.stun > 0) continue;
      const dx = o.x - x, dz = o.z - z;
      const ahead = dx * fx + dz * fz, lat = dx * fz - dz * fx;
      if (ahead > -1 && ahead < 4 + speed * 0.6 && Math.abs(lat) < 2.4) {
        const s = lat >= 0 ? 1 : -1;
        cyl.x = o.x + fz * s * 2.4; cyl.z = o.z - fx * s * 2.4; cyl.y = o.y;
        collision.resolveCylinder(cyl, 0.35, 1.7, { prevY: o.y }, resolveOut);
        o.x = cyl.x; o.z = cyl.z; o.stun = Math.max(o.stun, 0.8); o.clip = null;
      }
    }
  }

  // Warm-up on a quiet frame: one beat officer, one SWAT figure and the helicopter, so the first
  // chase does not pay ~40 ms per new template mid-pursuit. Returns true while there is more to do.
  function prewarm() {
    buildTurn = 0;
    const g = officers.find((o) => !o.ch && o.look !== 'swat');
    if (g && !officers.some((o) => o.ch && o.look !== 'swat')) { ensureFigure(g); return true; }
    const sw = officers.find((o) => !o.ch && o.look === 'swat');
    if (sw && !officers.some((o) => o.ch && o.look === 'swat')) { ensureFigure(sw); return true; }
    if (!heli.model) { ensureHeli(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- online: a guest's puppets [verify]
  // The host packs its units (netCodec.packUnits) for net.registerState('police'); a guest applies
  // the blob here and draws the same cruisers, officers, helicopter, roadblocks and spikes, easing
  // between updates. A guest never runs the sim above (wanted.js isReplica), so these are visual and
  // feed the guest's minimap; being chased, caught and the non-lethal rule run on the host against
  // the guest's hero there.
  let netT = null, netProps = '';
  const POSE_CLIPS = [IDLE, RUN, AIM, DOWN, TALK, WALK];
  function applyNet(t) {
    netT = t;
    const props = JSON.stringify([t.roadblocks, t.spike]);
    if (props === netProps) return;
    netProps = props;
    roadblocks.length = 0;
    for (const rb of t.roadblocks) if (roadblocks.length < caps.roadblocks) roadblocks.push({ ...rb, hit: false });
    layoutProps();
    if (t.spike) {
      Object.assign(spike, { active: true, ...t.spike, hit: false });
      spikeMesh.position.set(spike.x, spike.y + 0.05, spike.z);
      spikeMesh.rotation.set(0, spike.yaw + Math.PI / 2, 0);
      spikeMesh.scale.set(spike.halfWidth * 1.7, 1, 1);
      spikeMesh.visible = true;
    } else { spike.active = false; spikeMesh.visible = false; }
  }
  function updateReplica(dt) {
    buildTurn = 0;
    const t = netT;
    if (!t) return;
    flash += dt;
    const k = Math.min(1, dt * 10);
    anyActive = false;
    for (const c of cruisers) {
      const want = t.cruisers.find((q) => q.slot === c.i);
      if (!want) { if (c.active) { c.active = false; halos.set(c.beaconA, 0, -50, 0, 0.01); halos.set(c.beaconB, 0, -50, 0, 0.01); } continue; }
      if (!c.active || Math.hypot(want.x - c.x, want.z - c.z) > 25) { c.x = want.x; c.y = want.y; c.z = want.z; c.yaw = want.yaw; }
      c.active = true; anyActive = true;
      c.type = want.van ? 'police_van' : 'police';
      c.x += (want.x - c.x) * k; c.y += (want.y - c.y) * k; c.z += (want.z - c.z) * k;
      c.yaw = lerpAngle(c.yaw, want.yaw, k);
      c.siren = want.siren; c.stun = want.stunned ? 1 : 0;
    }
    for (const o of officers) {
      const want = t.officers.find((q) => q.slot === o.i);
      if (!want) { if (o.active) despawnOfficer(o); continue; }
      if (!o.active) {
        if (!ensureFigure(o)) continue; // one new figure a frame, as on the host
        o.active = true; o.x = want.x; o.y = want.y; o.z = want.z; o.yaw = want.yaw; o.clip = null; o.stun = 0; o.restrained = false; o.mode = 'chase';
        o.ch.root.visible = true;
      }
      anyActive = true;
      if (Math.hypot(want.x - o.x, want.z - o.z) > 12) { o.x = want.x; o.z = want.z; }
      o.x += (want.x - o.x) * k; o.y += (want.y - o.y) * k; o.z += (want.z - o.z) * k;
      o.yaw = lerpAngle(o.yaw, want.yaw, k);
      o.stun = want.pose === 3 ? 1 : 0;
      play(o, POSE_CLIPS[want.pose] ?? IDLE);
      o.ch.root.position.set(o.x, o.y, o.z);
      o.ch.face(o.yaw);
      o.ch.animator.update(dt);
    }
    if (t.heli) {
      ensureHeli();
      const w = t.heli;
      if (!heli.active) { heli.active = true; heli.x = w.x; heli.y = w.y; heli.z = w.z; heli.yaw = w.yaw; Object.assign(heli.light, w.light); heli.model.group.visible = true; }
      anyActive = true;
      heli.x += (w.x - heli.x) * k; heli.y += (w.y - heli.y) * k; heli.z += (w.z - heli.z) * k;
      heli.yaw = lerpAngle(heli.yaw, w.yaw, k);
      heli.light.x += (w.light.x - heli.light.x) * k; heli.light.y += (w.light.y - heli.light.y) * k; heli.light.z += (w.light.z - heli.light.z) * k; heli.light.r = w.light.r;
      heli.mode = w.spot ? 'track' : 'arrive';
      poseHeli(dt, w.spot);
    } else if (heli.active) despawnHeli();
    if (roadblocks.length || spike.active) anyActive = true;
    draw();
  }

  function clearAll() {
    netT = null; netProps = ''; // [verify]
    for (const c of cruisers) if (c.active) despawnCruiser(c);
    for (const o of officers) if (o.active) despawnOfficer(o);
    if (heli.active) despawnHeli();
    clearProps();
    draw();
    anyActive = false;
  }

  return {
    cruisers, officers, heli, roadblocks, spike, stats, statics,
    get busy() { return anyActive; },
    get civReady() { return civReady; },
    update, placeRoadblocks, placeSpikes, clearProps, attackArea, nearestOfficer, carContact, clearRoad, clearAll, visible,
    spawnOfficer, despawnOfficer, prewarm, debugRoadblocks,
    applyNet, updateReplica, // [verify] online: a guest's puppets
  };
}
