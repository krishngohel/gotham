// Things that move: traffic on the streets, the GCPD blimp, searchlights sweeping the clouds.
//
// Traffic (Long Night 2, workstream H): the street fleet from src/vehicles/models (instanced, one
// set of draws per vehicle type, a one-draw silhouette LOD past ~a third of the LOD distance)
// driven by src/world/trafficSim.js on the shared street graph, so every region's streets get
// traffic, including regions added later. Vehicles spawn out of sight around every player (and
// the camera) and despawn behind them; the pool size follows quality.crowdDensity. Junction
// signals cycle in step with the city's existing traffic lights; junctions without one get a
// hanging four-way head (emissive lenses plus halos). Events for the audio: 'trafficPassBy'
// ({ kind, speed, closest, side, gain, pos }: audio.passBy's options) and 'trafficHonk' ({ pos }).
import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { LAYER_FX } from '../render/layers.js';
import { toonMaterial } from '../render/toon.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRID, WORLD } from './mapData.js';
import { detailCellOf } from './chunks.js';
import { createRng } from '../core/rng.js';
import { CORE_LINES, RIVERFRONT } from './regions/streets.js';
import { WORLD_BOUNDS, REGION_DATA, districtAt } from './regions/data.js';
import { createTrafficSim, MIX_TYPES, LEAN_TYPES, SIGNAL } from './trafficSim.js';
import { createTrafficInstances, createBlimpModel, FLEET } from '../vehicles/vehicleModels.js';

function beamMaterial(color, strength = 0.22) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: 'varying float vA; varying float vE; void main(){ vA = uv.y; vec3 n = normalize(normalMatrix * normal); vec3 v = normalize(-(modelViewMatrix * vec4(position,1.0)).xyz); vE = abs(dot(n, v)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; varying float vA; varying float vE; void main(){ float a = pow(vE, 1.3) * (1.0 - vA) * ${strength.toFixed(2)}; gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------- signals in step with the city

// The core's traffic lights (streetDressing.dressStreets) stand on each block's south-east corner,
// over the north-south street, phase (cx * 0.13 + cz * 0.07) % 1; the Loop row's (riverfront
// buildLoopRow) over the El street, phase (x * 0.13) % 1. Junctions there run on those phases, so
// what drivers do matches the lights you see; they get no extra head.
const LAMP_E = GRID.block / 2 - 0.8;
const LOOP_LIGHTS = [[-150, -419], [-150, -479], [150, -419], [150, -479], [-30, -539], [30, -539]];
function existingLight(n) {
  if (n.region === 'core' && n.deck === 'street') {
    const cx = n.x - 30, cz = n.z - 30;
    const inGrid = GRID.centers.includes(cx) && GRID.centers.includes(cz);
    const inCompound = (cx > 36 && cz < -95) || (cx < -36 && cz < -95);
    const existing = inGrid && !inCompound && cz + LAMP_E - 3.2 < WORLD.waterZ - 8 && cx + 30 < WORLD.maxX;
    return { phase: (cx * 0.13 + cz * 0.07) % 1, primaryAxis: 'z', existing };
  }
  // The Loop's rows 2-5 (regions/loop.js): lights at these junctions, over the cross street.
  if (n.region === 'loop' && LOOP_LIGHTS.some(([x, z]) => Math.abs(n.x - x) < 0.5 && Math.abs(n.z - z) < 0.5)) {
    return { phase: (n.x * 0.13 + n.z * 0.07) % 1, primaryAxis: 'x', existing: true };
  }
  if (n.region === 'loop' && Math.abs(n.z - RIVERFRONT.loopStreetZ) < 0.5 && CORE_LINES.includes(n.x)) {
    const [X0, X1] = RIVERFRONT.loopX;
    return { phase: (n.x * 0.13) % 1, primaryAxis: 'x', existing: n.x > X0 + 10 && n.x < X1 - 10 };
  }
  return null;
}

const HEAD_Y = 6.4;
const LENS = [PALETTE.crimson, PALETTE.sodium, PALETTE.neonCyan]; // red, amber, green (as trafficLight)
const LENS_ORDER = [2, 1, 0]; // signal state (0 green, 1 amber, 2 red) -> lens row (0 top red)

// Hanging four-way heads over the junctions that have no light of their own: a span wire between
// two corner poles, a dark head, 12 lenses (one InstancedMesh, recoloured only when a phase
// changes) and a halo on each lit lens.
function createSignalHeads(scene, halos, junctions, chunks, collision) {
  // No head where something is overhead (under the El, on the lower deck): the lights there are
  // the drivers' business only.
  const clear = (j) => {
    if (!collision) return true;
    const e = j.width / 2 + 1.1;
    for (const [dx, dz] of [[0, 0], [e, e], [-e, -e]]) {
      const hits = collision.query(j.x + dx - 0.5, j.z + dz - 0.5, j.x + dx + 0.5, j.z + dz + 0.5);
      if (hits.some((b) => b.minY > j.y + 2 && b.minY < j.y + HEAD_Y + 2.5)) return false;
    }
    return true;
  };
  const list = junctions.filter((j) => j.signal && !j.existing && clear(j));
  if (!list.length) return { count: 0, update() {} };
  // Heads and poles merged per 512 m cell, culled past the LOD distance like other street detail.
  const cells = new Map();
  for (const j of list) {
    const [cx, cz] = detailCellOf(j.x, j.z);
    const key = `${cx},${cz}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(j);
  }
  const headMat = toonMaterial({ color: 0x1e2026 });
  for (const group of cells.values()) {
  const parts = [];
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, maxY = -Infinity;
  for (const j of group) {
    minX = Math.min(minX, j.x - 12); maxX = Math.max(maxX, j.x + 12); minZ = Math.min(minZ, j.z - 12); maxZ = Math.max(maxZ, j.z + 12); maxY = Math.max(maxY, j.y + 9);
    const y = j.y + HEAD_Y, e = j.width / 2 + 1.1;
    parts.push(new THREE.BoxGeometry(0.62, 1.3, 0.62).translate(j.x, y, j.z));
    parts.push(new THREE.BoxGeometry(0.7, 0.06, 0.7).translate(j.x, y + 0.68, j.z));
    for (const s of [-1, 1]) {
      const px = j.x + s * e, pz = j.z + s * e;
      parts.push(new THREE.CylinderGeometry(0.1, 0.13, HEAD_Y + 1.2, 6).translate(px, j.y + (HEAD_Y + 1.2) / 2, pz));
      // The wire from the pole top to the head.
      const len = Math.hypot(e, e);
      const w = new THREE.BoxGeometry(0.04, 0.04, len).rotateY(Math.atan2(-s * e, -s * e)).translate((px + j.x) / 2, y + 1.15, (pz + j.z) / 2);
      parts.push(w);
    }
    parts.push(new THREE.BoxGeometry(0.03, 0.5, 0.03).translate(j.x, y + 0.9, j.z));
  }
  const head = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))), headMat);
  head.name = 'signalHeads';
  head.geometry.computeBoundingSphere();
  scene.add(head);
  chunks?.addDetail(head, { minX, minY: -10, minZ, maxX, maxY, maxZ }, 'lod');
  }
  // Lenses: per junction 4 faces x 3 rows. Faces 0/1 look along x (x-axis traffic), 2/3 along z.
  const n = list.length * 12;
  const lens = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.24, 0.24), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
  lens.name = 'signalLenses';
  lens.userData.noShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const FACES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const haloIds = new Int32Array(n).fill(-1);
  // A halo on each lit lens facing the approach (one face per axis), while the shared pool has room.
  list.forEach((j, k) => {
    FACES.forEach(([fx, fz], f) => {
      for (let row = 0; row < 3; row++) {
        const i = k * 12 + f * 3 + row;
        p.set(j.x + fx * 0.325, j.y + HEAD_Y + 0.4 - row * 0.4, j.z + fz * 0.325);
        q.setFromAxisAngle(up, Math.atan2(fx, fz));
        lens.setMatrixAt(i, m.compose(p, q, one));
        lens.setColorAt(i, new THREE.Color(LENS[row]).multiplyScalar(0.18));
        if ((f === 0 || f === 2) && halos.count < 5400) haloIds[i] = halos.add(p.x + fx * 0.08, p.y, p.z + fz * 0.08, LENS[row], 0.01);
      }
    });
  });
  lens.instanceMatrix.needsUpdate = true;
  lens.computeBoundingSphere();
  scene.add(lens);
  const last = new Int8Array(list.length * 2).fill(-1);
  const lit = new THREE.Color(), dim = new THREE.Color();
  return {
    count: list.length,
    update(t, stateOf) {
      let dirty = false;
      for (let k = 0; k < list.length; k++) {
        for (let a = 0; a < 2; a++) {
          const st = stateOf(list[k], a === 0 ? 'x' : 'z', t);
          if (st === last[k * 2 + a]) continue;
          last[k * 2 + a] = st;
          dirty = true;
          const onRow = LENS_ORDER[st];
          for (let f = a * 2; f < a * 2 + 2; f++) {
            for (let row = 0; row < 3; row++) {
              const i = k * 12 + f * 3 + row;
              const on = row === onRow;
              lit.set(LENS[row]);
              lens.setColorAt(i, on ? lit : dim.copy(lit).multiplyScalar(0.18));
              if (haloIds[i] >= 0) halos.setSize(haloIds[i], on ? 1.3 : 0.01);
            }
          }
        }
      }
      if (dirty) lens.instanceColor.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- traffic

const yAxis = new THREE.Vector3(0, 1, 0);

function createTraffic(scene, halos, { graph, bridges, quality, camera0, chunks, collision }) {
  const density = quality?.crowdDensity ?? 1;
  const cap = Math.max(10, Math.min(48, Math.round(48 * density)));
  const lean = density < 0.6;
  const draw = quality?.drawDistance ?? 420;
  const lodNear = (quality?.lodDistance ?? 240) * 0.35;
  const spawnMin = Math.max(60, Math.min(110, draw * 0.3));
  const spawnMax = Math.max(spawnMin + 50, Math.min(230, draw * 0.6));
  const densityOf = Object.fromEntries(REGION_DATA.map((r) => [r.id, r.spawnTables?.traffic?.density ?? 1]));
  let clock = () => 23;
  // The camera's view cone, for spawning out of sight (set each frame, read by the sim).
  const cam = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, cos: 0.6, on: false };
  const sim = createTrafficSim({
    graph, cap, rng: createRng(404), bridges, lean,
    districtAt, regionDensity: (id) => densityOf[id] ?? 1, junctionInfo: existingLight, hour: () => clock(),
    spawn: {
      min: spawnMin, max: spawnMax, despawn: spawnMax + 30,
      visible: (x, y, z) => {
        if (!cam.on) return false;
        const dx = x - cam.x, dy = y + 1 - cam.y, dz = z - cam.z, L = Math.hypot(dx, dy, dz) || 1;
        return (dx * cam.fx + dy * cam.fy + dz * cam.fz) / L > cam.cos;
      },
    },
  });

  // One instanced set per type at full detail and one at the silhouette LOD.
  const types = lean ? LEAN_TYPES : MIX_TYPES;
  const sets = {};
  for (const t of types) {
    const near = createTrafficInstances(t, cap);
    const far = createTrafficInstances(t, cap, { lod: 1 });
    for (const m of [...near.meshes, ...far.meshes]) { m.count = 0; m.visible = false; scene.add(m); }
    far.body.castShadow = false;
    sets[t] = { near, far, nNear: 0, nFar: 0 };
  }
  const setList = Object.values(sets);
  const paint = (type, pal) => { const ps = FLEET[type].palettes; return ps[pal % ps.length][0]; };

  // Halos: two heads and two tails per vehicle slot, two beacons per siren.
  const head = [], tail = [];
  for (let i = 0; i < cap; i++) {
    head.push(halos.add(0, -50, 0, 0xfff3d0, 0.01), halos.add(0, -50, 0, 0xfff3d0, 0.01));
    tail.push(halos.add(0, -50, 0, 0xff3030, 0.01), halos.add(0, -50, 0, 0xff3030, 0.01));
  }
  const beacons = [];
  for (let i = 0; i < 4; i++) beacons.push(halos.add(0, -50, 0, i % 2 ? 0x3a6dff : 0xff2a3a, 0.01));
  const shown = new Uint8Array(cap);

  const signals = createSignalHeads(scene, halos, sim.junctions, chunks, collision);

  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  // Anchors (players, then the camera) and obstacles, reused every frame.
  const anchors = Array.from({ length: 6 }, () => ({ x: 0, y: 0, z: 0 }));
  const obstacles = Array.from({ length: 24 }, () => ({ x: 0, y: 0, z: 0, r: 0.5 }));
  let attached = null, emit = null, pedestrians = null;

  function gather(hero, camera) {
    let n = 0;
    const list = attached?.players?.list ?? attached?.players ?? null;
    if (Array.isArray(list) && list.length) {
      for (let k = 0; k < list.length; k++) { const h = list[k]?.hero; if (h?.pos && n < 4) { anchors[n].x = h.pos.x; anchors[n].y = h.pos.y; anchors[n].z = h.pos.z; n++; } }
    } else if (hero?.pos) { anchors[0].x = hero.pos.x; anchors[0].y = hero.pos.y; anchors[0].z = hero.pos.z; n = 1; }
    const nPlayers = n;
    const c = camera ?? camera0;
    cam.on = !!c;
    if (c) {
      cam.x = c.position.x; cam.y = c.position.y; cam.z = c.position.z;
      const e = c.matrixWorld.elements; // camera looks down its -z
      cam.fx = -e[8]; cam.fy = -e[9]; cam.fz = -e[10];
      const half = ((c.fov ?? 60) * Math.PI) / 360;
      cam.cos = Math.cos(Math.min(1.3, half * Math.max(1, c.aspect ?? 1.6) * 0.95));
      // The camera counts as a spectator when it is away from every player (photo mode, shots).
      let far = true;
      for (let k = 0; k < n; k++) if (Math.hypot(anchors[k].x - cam.x, anchors[k].z - cam.z) < 40) far = false;
      if (far && n < anchors.length) { anchors[n].x = cam.x; anchors[n].y = cam.y; anchors[n].z = cam.z; n++; }
    }
    return { n, nPlayers };
  }
  function gatherObstacles() {
    let k = 0;
    const put = (p, r) => { if (k < obstacles.length && p) { const o = obstacles[k++]; o.x = p.x; o.y = p.y; o.z = p.z; o.r = r; } };
    const list = attached?.players?.list ?? attached?.players ?? null;
    if (Array.isArray(list)) for (let i = 0; i < list.length; i++) { const h = list[i]?.hero; if (h?.pos && !h.dead) put(h.pos, 0.5); }
    // [env] Pedestrians on a crossing: the traffic brakes for them (src/civilians/civilians.js).
    pedestrians?.(put);
    const veh = attached?.vehicles;
    if (veh) {
      const bm = veh.batmobile;
      if (bm?.group?.visible) put(bm.group.position, 1.7);
      const act = veh.active;
      if (act?.group && act !== bm) put(act.group.position, 1.3);
      const cars = veh.streetCars;
      if (Array.isArray(cars)) for (let i = 0; i < cars.length; i++) { const c = cars[i]; if (c?.group && c !== act) put(c.group.position, 1.2); }
    }
    return k;
  }
  let soloHero = null;
  function showSet(inst, cnt) {
    for (let k = 0; k < inst.meshes.length; k++) { const m = inst.meshes[k]; m.count = cnt; m.visible = cnt > 0; }
    if (cnt > 0) inst.commit();
  }

  return {
    sim,
    cap,
    signals,
    get active() { return sim.active; },
    // Game-side wiring (src/game/game.js, once): { events, players, vehicles, clock }.
    // [env] The pedestrian yield hook: fn(put) calls put(pos, radius) for each person in the road.
    setPedestrians(fn) { pedestrians = fn; },
    // [env] A police car with its siren on, spawned out of sight 90-200 m from (x, z) on a lane
    // pointing toward it (a crime: civilians.js on crimeSpawn / crimeActive).
    dispatchSiren(x, z) {
      let best = -1, bs = 0;
      for (let k = 0; k < sim.lanes.length; k++) {
        const l = sim.lanes[k];
        if (l.deck === 'bridge' || l.s1 - l.s0 < 20) continue;
        const dx = x - l.mx, dz = z - l.mz, d = Math.hypot(dx, dz);
        if (d < 90 || d > 200) continue;
        const toward = (dx * l.fx + dz * l.fz) / d;
        if (toward < 0.6) continue;
        const sc = toward - d / 400 + Math.random() * 0.2;
        if (sc > bs) { bs = sc; best = k; }
      }
      if (best < 0) return null;
      if (sim.active >= sim.cap) {
        // Make room: the farthest ordinary car goes.
        let far = null, fd = 0;
        for (const v of sim.vehicles) { if (!v.active || v.siren) continue; const d = Math.hypot(v.x - x, v.z - z); if (d > fd) { fd = d; far = v; } }
        if (far) sim.despawn(far);
      }
      const l = sim.lanes[best];
      return sim.spawnOn(best, l.s0 + 2, { type: 'police', siren: true });
    },
    attach(opts = {}) {
      attached = opts;
      emit = opts.events ? (name, payload) => opts.events.emit(name, payload) : null;
      if (typeof opts.clock === 'function') clock = opts.clock;
    },
    update(t, dt, hero = null, camera = null) {
      soloHero = hero;
      const { n, nPlayers } = gather(soloHero, camera);
      let nObs = gatherObstacles();
      if (!attached && hero?.pos && nObs < obstacles.length) { const o = obstacles[nObs++]; o.x = hero.pos.x; o.y = hero.pos.y; o.z = hero.pos.z; o.r = 0.5; }
      sim.update(dt, t, anchors, n, obstacles, nObs, emit, nPlayers);
      signals.update(t, sim.signalState);
      // Draw.
      for (let k = 0; k < setList.length; k++) { setList[k].nNear = 0; setList[k].nFar = 0; }
      let b = 0;
      for (let i = 0; i < sim.vehicles.length; i++) {
        const v = sim.vehicles[i];
        if (!v.active) {
          if (shown[i]) {
            shown[i] = 0;
            halos.set(head[i * 2], 0, -50, 0, 0.01); halos.set(head[i * 2 + 1], 0, -50, 0, 0.01);
            halos.set(tail[i * 2], 0, -50, 0, 0.01); halos.set(tail[i * 2 + 1], 0, -50, 0, 0.01);
          }
          continue;
        }
        const set = sets[v.type] ?? sets.sedan ?? sets[types[0]];
        let dA = Infinity;
        for (let k = 0; k < n; k++) { const d = Math.hypot(anchors[k].x - v.x, anchors[k].y - v.y, anchors[k].z - v.z); if (d < dA) dA = d; }
        const yaw = Math.atan2(v.fx, v.fz);
        let slope = 0;
        if (!v.onTurn) { const l = sim.lanes[v.lane]; slope = (l.by - l.ay) / l.planLen; } else slope = (v.p2y - v.p0y) / v.segLen;
        euler.set(-Math.atan(slope), yaw, 0);
        q.setFromEuler(euler);
        mtx.compose(pos.set(v.x, v.y, v.z), q, sc);
        const near = dA < lodNear;
        if (near) set.near.setInstance(set.nNear++, mtx, paint(v.type, v.palette));
        else set.far.setInstance(set.nFar++, mtx, paint(v.type, v.palette));
        // Lamps: heads always, tails brighter under braking.
        shown[i] = 1;
        const A = set.near.lampAnchors;
        for (let s = 0; s < 2; s++) {
          const h = A.head[Math.min(s, A.head.length - 1)], tl = A.tail[Math.min(s, A.tail.length - 1)];
          halos.set(head[i * 2 + s], v.x + h.x * v.fz + h.z * v.fx, v.y + h.y, v.z - h.x * v.fx + h.z * v.fz, 1.9);
          halos.set(tail[i * 2 + s], v.x + tl.x * v.fz + tl.z * v.fx, v.y + tl.y, v.z - tl.x * v.fx + tl.z * v.fz, v.braking ? 1.9 : 1.1);
        }
        if (v.siren && b < beacons.length) {
          const on = Math.floor(t * 6) % 2;
          halos.set(beacons[b], v.x - 0.4 * v.fz, v.y + 1.75, v.z + 0.4 * v.fx, on ? 2.6 : 0.4);
          halos.set(beacons[b + 1], v.x + 0.4 * v.fz, v.y + 1.75, v.z - 0.4 * v.fx, on ? 0.4 : 2.6);
          b += 2;
        }
      }
      for (; b < beacons.length; b++) halos.set(beacons[b], 0, -50, 0, 0.01);
      for (let k = 0; k < setList.length; k++) {
        const s = setList[k];
        showSet(s.near, s.nNear);
        showSet(s.far, s.nFar);
      }
    },
  };
}

// ---------------------------------------------------------------- the blimp

// The blimp's orbit follows the world's extent (the region list): centred on it, with radii that
// for the old city alone were the old 190 x 170 m. The new model (src/vehicles/models/aircraft.js)
// flies nose first along the orbit with the GCPD name boards on its sign anchors.
function createBlimp(scene, halos, bounds = WORLD_BOUNDS) {
  // [env] Back over the city: the world grew to ~2 km and an orbit at 80% of it put the blimp at
  // the horizon, tiny. It now circles downtown (the core and the Loop) at the old 190 x 170 m
  // scale, a little wider, where it is seen from the streets the story uses.
  void bounds;
  const cx = -20, cz = -160, rx = 240, rz = 210;
  const model = createBlimpModel();
  const g = model.group;
  g.userData.dynamic = true;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#6a7489'; x.fillRect(0, 0, 512, 128);
  x.font = '96px Bangers, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#efe6cf'; x.strokeStyle = '#0b0b12'; x.lineWidth = 8;
  x.strokeText('GCPD', 256, 68); x.fillText('GCPD', 256, 68);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const boardMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  for (const a of model.signAnchors) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), boardMat);
    side.position.z = 0.12;
    a.add(side);
  }
  const light = new THREE.Mesh(new THREE.CylinderGeometry(9, 0.5, 90, 20, 1, true).translate(0, -45, 0), beamMaterial(0xdfe8ff, 0.16));
  light.rotation.x = 0.35;
  light.layers.set(LAYER_FX);
  light.frustumCulled = false;
  model.searchlight.add(light);
  const blink = halos.add(0, 0, 0, PALETTE.crimson, 3);
  scene.add(g);
  return {
    model,
    update(t, dt) {
      const a = t * 0.03;
      g.position.set(cx + Math.cos(a) * rx, 118, cz + Math.sin(a) * rz);
      g.rotation.y = Math.atan2(-Math.sin(a) * rx, Math.cos(a) * rz);
      light.rotation.z = Math.sin(t * 0.4) * 0.35;
      model.update(dt);
      halos.set(blink, g.position.x, g.position.y + 5.6, g.position.z, Math.sin(t * 3) > 0 ? 3 : 0.01);
    },
  };
}

function createSearchlights(scene) {
  const beams = [[-420, -300], [380, -350], [-350, 420]].map(([x, z], i) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(14, 1, 520, 20, 1, true).translate(0, 260, 0), beamMaterial(0xcfe0ff, 0.12));
    m.position.set(x, 0, z);
    m.layers.set(LAYER_FX);
    m.frustumCulled = false;
    scene.add(m);
    return { m, phase: i * 2.1 };
  });
  return {
    update(t) {
      for (const b of beams) { b.m.rotation.z = Math.sin(t * 0.21 + b.phase) * 0.45; b.m.rotation.x = Math.cos(t * 0.17 + b.phase) * 0.3; }
    },
  };
}

// opts: { graph, bridges, bounds, quality, camera }. `rng` (the world's seed-11 rng) is no longer
// drawn from: traffic has its own (seed 404), so nothing after this call depends on it.
export function createCityLife(scene, halos, rng, { graph = null, bridges = null, bounds = WORLD_BOUNDS, quality = null, camera = null, chunks = null, collision = null } = {}) {
  const traffic = graph ? createTraffic(scene, halos, { graph, bridges, quality, camera0: camera, chunks, collision }) : null;
  const blimp = createBlimp(scene, halos, bounds);
  const lights = createSearchlights(scene);
  return {
    traffic,
    blimp,
    update(t, dt, hero, camera = null) {
      traffic?.update(t, dt, hero, camera);
      blimp.update(t, dt);
      lights.update(t);
    },
  };
}
