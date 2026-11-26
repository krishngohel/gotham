// The river's North and South Branches (region 'westRiver') and the South Branch quay (region
// 'quay'), workstream H3. The branch is a canal-walled channel 34 m wide with the river 6 m down,
// running from the Bristol edge to the harbour and joining the main stem at the fork (Wolf Point).
// Eight working bascules carry the Loop's and the core's 60 m street lines west (the proof
// region's leaf, schedule, gates and collision swap: westBascules.js); a fixed steel span carries
// the El corridor street. A river walk shelf runs under the bridges along the quay with barges
// moored to it. At the harbour end a working lock lifts boats the 5.4 m from river to harbour:
// the chamber level and both pairs of mitre gates follow lockState(), and a gate's top is a
// footway while it is shut.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '../../config/palette.js';
import { box, cylinder } from '../buckets.js';
import { solid, glow, lightSpot, building, edgeGrapples } from '../cityBuilder.js';
import { trashBags } from '../streetDressing.js';
import { addLadder } from '../climbables.js';
import { createBoat } from '../../vehicles/models/marine.js';
import { WEST, WEST_BRIDGES, LANDMARKS, lockState } from './westLayout.js';
import { createWestBascules, mergeBridges } from './westBascules.js';
import { slab, railing, lampAt, dashes, ground, around, signPlane, dumpster } from './westKit.js';

const STONE = 0x8c877d;
const COPPER = 0x3f6b5c;
const RUST = 0x7a3e22;
const E = WEST.branch.maxX, W = WEST.branch.minX; // -266 east wall line, -300 west wall line
const WY = WEST.waterY;

const bridgeGaps = (half = 10.4) => [
  ...WEST_BRIDGES.bascules.map((b) => [b.z - half, b.z + half]),
  ...WEST_BRIDGES.fixed.filter((b) => b.kind === 'truss').map((b) => [b.z - b.width / 2 - 0.4, b.z + b.width / 2 + 0.4]),
];

// ======================================================================================
// The branches: walls, bridges, tender houses, the river walk shelf, barges, the tug, the locks.
// ======================================================================================
export function buildWestRiver(ctx) {
  const gaps = bridgeGaps();
  const QW = WEST.quayWalk;
  // The lock gates' footways meet the walls: the railings open there.
  const lockGaps = [WEST.lock.lowerZ, WEST.lock.upperZ].map((z) => [z - 1, z + 1]);
  // ---- canal walls (railings on top except at bridge decks and where the walk meets the quay)
  // East wall: open water at the main stem mouth (z -266..-241).
  for (const [a, b] of [[-600, -266], [-241, 205]]) {
    slab(ctx, 'concrete', E - 1, WY - 1, a, E, 0, b, { tag: 'quay', uv: [6, 6] });
    ctx.buckets.add('painted', box(0.7, 0.35, b - a, E - 0.5, -0.15, (a + b) / 2), STONE);
    const railGaps = [...gaps, ...lockGaps, [QW.minZ, QW.minZ + 3], [QW.maxZ - 3, QW.maxZ]];
    for (const [p, q] of around(a, b, railGaps)) railing(ctx, false, p, q, E - 0.35, 0);
  }
  // West wall: open water where the two cuts round the Narrows join (z -600..-588, -246..-232).
  for (const [a, b] of [[-588, -246], [-232, 205]]) {
    slab(ctx, 'concrete', W, WY - 1, a, W + 1, 0, b, { tag: 'quay', uv: [6, 6] });
    ctx.buckets.add('painted', box(0.7, 0.35, b - a, W + 0.5, -0.15, (a + b) / 2), STONE);
    for (const [p, q] of around(a, b, [...gaps, ...lockGaps])) railing(ctx, false, p, q, W + 0.35, 0);
  }
  // Stains and mooring rings down both faces.
  for (let z = -594; z < 200; z += 15) {
    if (z > -268 && z < -239) continue;
    ctx.buckets.add('painted', box(0.06, 4.6, 1.2, E - 1.03, -3.4, z), 0x2e3236);
    if (z < -590 || (z > -250 && z < -228)) continue;
    ctx.buckets.add('painted', box(0.06, 4.6, 1.2, W + 1.03, -3.4, z + 7), 0x2e3236);
  }

  // ---- bascule bridges (working) and the fixed El span
  const mine = createWestBascules(ctx, WEST_BRIDGES.bascules);
  ctx.world.bridges = mergeBridges(ctx.world.bridges, mine);
  ctx.updaters.push((t) => mine.update(t));
  for (const b of WEST_BRIDGES.bascules) {
    tenderHouse(ctx, W + 3.2, b.z - 12.6, true);
    tenderHouse(ctx, W + 3.2, b.z + 12.6, false);
    // Counterweight pits under both hinges (dark in the wall face).
    for (const x of [E - 1.2, W + 1.2]) ctx.buckets.add('painted', box(1.2, 5.2, 21, x, -3.2, b.z), 0x2a2c30);
  }
  elSpan(ctx, WEST_BRIDGES.fixed.find((b) => b.id === 'elBridge'));

  // ---- the river walk shelf along the quay (y -4.5), stairs up to the apron at both ends
  const [n0, n1] = QW.stairs[0], [s0, s1] = QW.stairs[1];
  slab(ctx, 'sidewalk', QW.minX, WEST.walkY - 0.3, n1, QW.maxX, WEST.walkY, s0, { tag: 'riverWalk' });
  for (let z = n1 + 4; z < s0; z += 8) ctx.buckets.add('painted', box(0.4, 1.4, 0.4, QW.minX + 0.4, WEST.walkY - 1, z), 0x3e4146);
  ctx.buckets.add('painted', box(0.5, 0.3, s0 - n1, QW.minX + 0.25, WEST.walkY - 0.15, (n1 + s0) / 2), STONE);
  stairs(ctx, n0, n1, -1); // rising north to the landing at z -230..-228
  stairs(ctx, s0, s1, 1);  // rising south to the landing at z 136..138
  slab(ctx, 'sidewalk', QW.minX, WY - 1, QW.minZ, QW.maxX, 0.15, n0, { tag: 'landing' });
  slab(ctx, 'sidewalk', QW.minX, WY - 1, s1, QW.maxX, 0.15, QW.maxZ, { tag: 'landing' });
  // Water-side railing: one tall collider the length of the walk, rails drawn at walk level,
  // open at the barges' gangplanks.
  const barges = [{ z0: -96, z1: -66 }, { z0: 44, z1: 74 }];
  const plankGaps = barges.map((b) => [(b.z0 + b.z1) / 2 - 1.5, (b.z0 + b.z1) / 2 + 1.5]);
  for (const [p, q] of around(n1, s0, plankGaps)) railing(ctx, false, p, q, QW.minX + 0.15, WEST.walkY);
  // Along the stairs and landings the rail rises with them: one collider to street-level rail height.
  for (const [p, q] of [[QW.minZ, n1], [s0, QW.maxZ]]) ctx.collision.addBox(QW.minX, WEST.walkY, p, QW.minX + 0.3, 1.3, q, 'railing');
  railing(ctx, false, QW.minZ, n0, QW.minX + 0.15, 0.15);
  railing(ctx, false, s1, QW.maxZ, QW.minX + 0.15, 0.15);
  for (let z = n1 + 14; z < s0 - 4; z += 26) {
    if (gaps.some(([g0, g1]) => z > g0 - 2 && z < g1 + 2)) continue;
    lampAt(ctx, QW.minX + 0.6, WEST.walkY, z, 1, 0, PALETTE.sodium, { pole: 3.4, halo: 2.4 });
  }
  ctx.steam.push({ x: -269, y: WEST.walkY + 0.2, z: -10, s: 1 });
  for (const b of barges) barge(ctx, -277.5, (b.z0 + b.z1) / 2, b.z1 - b.z0);

  // The tug, moored off the walk near the -30 bridge (a moving boat would meet the bridge decks).
  const tug = createBoat('tug');
  tug.group.position.set(-288, WY, 6);
  tug.group.rotation.y = Math.PI;
  tug.group.name = 'quayTug';
  ctx.scene.add(tug.group);
  ctx.chunks?.addDetail(tug.group, { minX: -296, minY: WY - 2, minZ: -6, maxX: -280, maxY: WY + 10, maxZ: 18 }, 'draw');

  // ---- the locks
  buildLocks(ctx);
}

// A stair on the walk shelf, `dir` -1 rising north (toward -z), +1 rising south: 12 steps of
// 0.375 m between z a and b.
function stairs(ctx, a, b, dir) {
  const QW = WEST.quayWalk;
  const n = 12, rise = (0 - WEST.walkY) / n;
  for (let k = 0; k < n; k++) {
    const z0 = dir < 0 ? b - k - 1 : a + k, z1 = z0 + 1;
    const top = WEST.walkY + rise * (k + 1);
    slab(ctx, 'sidewalk', QW.minX + 0.3, WEST.walkY - 0.3, z0, QW.maxX, top, z1, { tag: 'step' });
  }
}

// A bridge tender's house on a pier out over the water at a bascule corner.
function tenderHouse(ctx, x, z, halo) {
  const w = 3.4, h = 4.6;
  slab(ctx, 'concrete', x - 2, WY - 1, z - 2, x + 2, 0, z + 2, { tag: 'pier', uv: [4, 4] });
  solid(ctx, 'painted', box(w, h, w, x, h / 2, z), { color: 0x7a746a, tag: 'bridgehouse' });
  ctx.buckets.add('painted', box(w + 0.4, 0.3, w + 0.4, x, h + 0.1, z), STONE);
  solid(ctx, 'painted', new THREE.ConeGeometry(w * 0.62, 1.8, 4).rotateY(Math.PI / 4).translate(x, h + 1.15, z), { color: COPPER, tag: 'roof' });
  for (const [nx, nz] of [[1, 0], [0, 1], [0, -1]]) glow(ctx, box(Math.abs(nz) ? 1.4 : 0.06, 1, Math.abs(nx) ? 1.4 : 0.06, x + nx * (w / 2 + 0.02), 3, z + nz * (w / 2 + 0.02)), 0xc89a52);
  if (halo) ctx.halos.add(x, h + 2.3, z, PALETTE.crimson, 2);
  ctx.grapple.push({ x, y: h + 2.05, z, nx: -1, nz: 0, perch: true }); // on the cap of the roof (its collider is flat-topped)
}

// The fixed steel span carrying the El corridor street over the North Branch: a 26 m deck on
// plate girders, sidewalks, railings, two lamps. Column positions for H1's El are left clear.
function elSpan(ctx, b) {
  const hw = b.width / 2, z = b.z, x0 = W, x1 = E, road = hw - 3;
  slab(ctx, 'asphalt', x0, -1.2, z - road, x1, 0, z + road, { tag: 'bridge', uv: [17, 17], faces: [2, 3] });
  for (const s of [-1, 1]) {
    slab(ctx, 'sidewalk', x0, -1.2, z + s * road + (s < 0 ? -3 : 0), x1, 0.15, z + s * road + (s < 0 ? 0 : 3), { tag: 'bridge' });
    railing(ctx, true, x0, x1, z + s * (hw - 0.3), 0.15, { color: 0x2f3a36 });
    // Plate girders under the deck, riveted stiffeners.
    ctx.buckets.add('painted', box(x1 - x0, 2.6, 0.5, (x0 + x1) / 2, -2.4, z + s * (hw - 1)), 0x2f3a36);
    for (let x = x0 + 2; x < x1; x += 3) ctx.buckets.add('painted', box(0.15, 2.4, 0.7, x, -2.4, z + s * (hw - 1)), 0x253029);
    lampAt(ctx, (x0 + x1) / 2, 0.15, z + s * (hw - 1.2), 0, -s, PALETTE.sodium, { pole: 5 });
  }
  for (let k = -2; k <= 2; k++) ctx.buckets.add('painted', box(x1 - x0, 1.4, 0.4, (x0 + x1) / 2, -1.9, z + k * 4.5), 0x2a332f);
  for (let x = x0 + 4; x < x1; x += 8) ctx.buckets.add('lane', new THREE.PlaneGeometry(3.5, 0.25).rotateX(-Math.PI / 2).translate(x, 0.02, z));
}

// A moored barge: a flat steel hull with its deck just under the walk, coal heaps and a little
// wheelhouse on the stern. The deck is walkable from the shelf over a gangplank.
function barge(ctx, x, z, len) {
  const w = 8, top = WEST.walkY - 0.12;
  slab(ctx, 'painted', x - w / 2, WY - 1.2, z - len / 2, x + w / 2, top, z + len / 2, { tag: 'barge', color: 0x2a2c30, uv: [8, 8] });
  ctx.buckets.add('painted', box(w + 0.1, 0.5, len + 0.1, x, WY + 0.1, z), RUST);
  solid(ctx, 'painted', box(0.3, 0.6, len, x - (w / 2 - 0.15), top + 0.3, z), { color: 0x3a3f48, tag: 'gunwale' }); // outboard side only: the gangplank boards inboard
  // Coal / gravel heaps (low enough to climb), a wheelhouse at the stern.
  for (let k = 0; k < 3; k++) {
    const hz = z - len / 2 + 6 + k * 8;
    ctx.buckets.add('painted', new THREE.ConeGeometry(3.2, 1.6, 7).scale(1, 1, 1.3).translate(x, top + 0.8, hz), k % 2 ? 0x2b2a28 : 0x4a4640);
    ctx.collision.addBox(x - 2, top, hz - 2.6, x + 2, top + 0.4, hz + 2.6, 'heap');
  }
  solid(ctx, 'painted', box(4, 2.6, 3.4, x, top + 1.3, z + len / 2 - 2.4), { color: 0x6a5a44, tag: 'cabin' });
  glow(ctx, box(2.6, 0.7, 0.06, x, top + 1.9, z + len / 2 - 4.13), 0xc89a52);
  ctx.grapple.push({ x, y: top + 2.6, z: z + len / 2 - 2.4, nx: 0, nz: 1, perch: true });
  // Gangplank from the shelf.
  const pz = z;
  ctx.buckets.add('wood', box(3.4, 0.1, 1.2, WEST.quayWalk.minX - 1.6, top + 0.05, pz));
  ctx.collision.addBox(WEST.quayWalk.minX - 3.4, top - 0.2, pz - 0.6, WEST.quayWalk.minX + 0.1, top + 0.08, pz + 0.6, 'plank');
}

// The locks: chamber walls are the canal walls; two pairs of mitre gates (lower at z 160 on the
// river side, upper at z 200 on the harbour side), a moving chamber surface, signal lamps.
function buildLocks(ctx) {
  const L = WEST.lock;
  const mats = ctx.materials;
  const span = E - W, leafL = span / 2 - 0.5;
  // Chamber surface: a dark plane that rides the level (not part of the static water mesh).
  const water = new THREE.Mesh(new THREE.PlaneGeometry(span - 2, L.upperZ - L.lowerZ - 1.2).rotateX(-Math.PI / 2), mats.painted);
  colorize(water.geometry, 0x1a2630);
  water.position.set((E + W) / 2, WY, (L.lowerZ + L.upperZ) / 2);
  water.receiveShadow = false;
  water.userData.dynamic = true;
  water.name = 'lockChamber';
  ctx.scene.add(water);
  ctx.chunks?.addDetail(water, { minX: W, minY: WY - 1, minZ: L.lowerZ, maxX: E, maxY: 0, maxZ: L.upperZ }, 'draw');
  // Gate leaf (local: hinge at the origin, leaf along +x, top at y 0.15), merged into one mesh.
  const leafGeo = () => {
    const parts = [];
    const add = (g, c) => { colorize(g, c); parts.push(g); };
    add(box(leafL, 7, 0.9, leafL / 2, -3.35, 0), 0x3a2e24);
    for (let y = -6; y < 0; y += 1.5) add(box(leafL, 0.25, 1.05, leafL / 2, y, 0), 0x24282e);
    add(box(leafL, 0.12, 1.3, leafL / 2, 0.09, 0), 0x6a5a44);
    for (const s of [-1, 1]) {
      add(box(leafL, 0.06, 0.06, leafL / 2, 1.2, s * 0.6), 0x8a8e96);
      for (let x = 0.4; x < leafL; x += 2.2) add(box(0.06, 1.1, 0.06, x, 0.7, s * 0.6), 0x8a8e96);
    }
    add(cylinder(0.25, 0.25, 7.3, 0, -3.3, 0, 8), 0x1d2024);
    return mergeGeometries(parts, false);
  };
  const gates = [];
  for (const [gz, inward] of [[L.lowerZ, 1], [L.upperZ, -1]]) {
    const leaves = [];
    for (const [hx, out] of [[W + 0.5, 1], [E - 0.5, -1]]) {
      const g = new THREE.Group();
      g.position.set(hx, 0, gz);
      const m = new THREE.Mesh(leafGeo(), mats.painted);
      m.castShadow = true;
      m.receiveShadow = true;
      if (out < 0) m.rotation.y = Math.PI; // the east leaf runs toward -x
      g.add(m);
      g.userData.dynamic = true;
      g.name = 'lockGate';
      ctx.scene.add(g);
      ctx.chunks?.addDetail(g, { minX: W, minY: WY - 2, minZ: gz - 18, maxX: E, maxY: 2, maxZ: gz + 18 }, 'draw');
      // Open: the leaf swings into the chamber and lies along its wall.
      leaves.push({ g, open: out * inward * -Math.PI / 2 });
    }
    // Signal lamps on the gate's west pier: red while shut, green while open.
    const red = ctx.halos.add(W - 1.5, 4.2, gz, PALETTE.crimson, 2.4);
    const green = ctx.halos.add(W - 1.5, 3.6, gz, PALETTE.neonCyan, 0.01);
    ctx.buckets.add('steel', box(0.2, 4.6, 0.2, W - 1.5, 2.3, gz));
    gates.push({ z: gz, leaves, red, green, boxes: [], k: -1 });
  }
  const walkBoxes = (gz) => [
    ctx.collision.addBox(W, -0.6, gz - 0.65, E, 0.15, gz + 0.65, 'lockGate'),
    ctx.collision.addBox(W, 0.15, gz - 0.75, E, 1.3, gz - 0.6, 'railing'),
    ctx.collision.addBox(W, 0.15, gz + 0.6, E, 1.3, gz + 0.75, 'railing'),
  ];
  ctx.updaters.push((t) => {
    const s = lockState(t);
    water.position.y = s.level;
    for (const [i, g] of gates.entries()) {
      const k = i === 0 ? s.lower : s.upper;
      const walk = i === 0 ? s.lowerWalk : s.upperWalk;
      if (k !== g.k) {
        g.k = k;
        for (const leaf of g.leaves) { leaf.g.rotation.y = leaf.open * k; leaf.g.updateMatrixWorld(true); }
        ctx.halos.setSize(g.red, k > 0.99 ? 0.01 : 2.4);
        ctx.halos.setSize(g.green, k > 0.99 ? 2.4 : 0.01);
      }
      if (walk && !g.boxes.length) g.boxes = walkBoxes(g.z);
      if (!walk && g.boxes.length) { for (const b of g.boxes) ctx.collision.removeBox(b); g.boxes = []; }
    }
  });
  // Recesses in the chamber walls where the open leaves lie, and the lock-keeper's lamp posts.
  for (const gz of [L.lowerZ, L.upperZ]) {
    for (const x of [W + 0.4, E - 0.4]) ctx.buckets.add('painted', box(0.3, 6, leafL, x, -3, gz + (gz === L.lowerZ ? 1 : -1) * leafL / 2), 0x23262b);
    lampAt(ctx, W - 1.6, 0, gz + 3, 1, 0, PALETTE.sodium, { pole: 5 });
  }
  ctx.buckets.add('painted', box(span, 0.4, 0.8, (E + W) / 2, -0.25, L.upperZ + 4.6), STONE); // sill at the outfall
}

function colorize(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

// ======================================================================================
// The South Branch quay (x -266..-236): the apron lane along the water with crane rails, three
// portal cranes, a row of warehouses whose loading doors face the river, the lock-keeper's house.
// ======================================================================================
export function buildQuay(ctx) {
  const { rng } = ctx;
  const X0 = -266, X1 = -236, Z0 = -236, Z1 = 205;
  ground(ctx, { minX: X0, maxX: X1, minZ: Z0, maxZ: Z1 });
  const lines = [-210, -150, -90, -30, 30, 90, 150];
  const bridged = WEST_BRIDGES.bascules.filter((b) => b.z > -240).map((b) => b.z);
  // Apron: crane rails, bollards on the edge, lane paint.
  for (const x of [-264.6, -258.6]) ctx.buckets.add('painted', box(0.18, 0.04, Z1 - Z0 - 30, x, 0.02, (Z0 + Z1) / 2), 0x5d636d);
  for (let z = Z0 + 8; z < 190; z += 8) {
    if (bridged.some((bz) => Math.abs(z - bz) < 12)) continue;
    solid(ctx, 'painted', cylinder(0.22, 0.28, 0.7, -265.4, 0.35, z, 8), { color: 0x2a2c30, tag: 'bollard' });
  }
  dashes(ctx, false, -228, 190, -261, 0.02, { gap: 10, len: 3 });
  // Warehouse rows between the cross streets: loading docks on the river face (x -255).
  const rows = [[-233, -217], ...lines.slice(0, -1).map((z, i) => [z + 7, lines[i + 1] - 7]), [157, 188]];
  const signs = ['KESTREL ROPE & TACKLE', "O'MALLEY BROS COFFEE", 'SALT & SONS', 'BRANCH LINE FREIGHT', 'GOTHAM TWINE CO'];
  let si = 0;
  for (const [a, b] of rows) {
    const len = b - a;
    const pieces = len > 30 ? [[a, a + len * 0.55 - 1], [a + len * 0.55 + 1, b]] : [[a, b]];
    for (const [p, q] of pieces) {
      const h = rng.pick([10.2, 12, 13.6, 16]);
      const bz = (p + q) / 2, d = q - p;
      const style = rng.chance(0.55) ? 'warehouse' : 'brick';
      building(ctx, {
        id: `quay${Math.round(bz)}`, x: -246, z: bz, w: 18, d, h, style, roof: style === 'warehouse' && rng.chance(0.5) ? 'sawtooth' : 'flat',
        parapet: style === 'brick', cornice: style === 'brick', storefront: false, tiers: [], props: rng.chance(0.5) ? 'industrial' : 'auto', neon: [],
        fireEscape: style === 'brick' && h > 12 ? 'e' : undefined, district: 'quay',
      });
      // Loading docks: a 1.2 m platform along the river face, roller doors, bumpers, a lamp.
      slab(ctx, 'concrete', -257, 0, p + 0.5, -255, 1.2, q - 0.5, { tag: 'dock' });
      for (let z = p + 4; z < q - 2; z += 7) {
        ctx.buckets.add('painted', box(0.1, 3.2, 4, -255.06, 2.8, z), rng.chance(0.3) ? 0x3a2c1c : 0x1a1c20);
        ctx.buckets.add('painted', box(0.2, 0.5, 0.42, -257.1, 0.6, z - 2.2), 0xd9b43a);
        ctx.buckets.add('painted', box(0.2, 0.5, 0.42, -257.1, 0.6, z + 2.2), 0xd9b43a);
        if (rng.chance(0.5)) solid(ctx, 'wood', box(1.1, 1.0, 1.1, -256, 1.7, z + rng.range(-1, 1)), { tag: 'crate' });
      }
      glow(ctx, box(0.3, 0.12, 0.5, -255.3, 4.6, bz), 0xd9a24a);
      ctx.halos.add(-255.6, 4.5, bz, 0xd9a24a, 1.8);
      lightSpot(ctx, -256.5, 4.2, bz, 0xd9a24a, 16, 12);
      // Steps up onto the dock at its north end.
      for (let k = 1; k <= 3; k++) slab(ctx, 'concrete', -257, 0, p + 0.5 - (4 - k) * 0.4, -255, k * 0.4, p + 0.5, { tag: 'step' });
      if (si < signs.length && d > 20) signPlane(ctx, signs[si++], 0xcdbb8a, -255.1, h - 2.5, bz, -1, 0, 1.3);
      if (rng.chance(0.5)) dumpster(ctx, -238.5, bz + rng.range(-6, 6), false);
      if (rng.chance(0.6)) trashBags(ctx, -238, bz + rng.range(-8, 8));
    }
  }
  // Portal cranes straddling the apron lane, their jibs out over the water.
  for (const c of LANDMARKS.cranes) portalCrane(ctx, c.x, c.z);
  // Lamps along the apron (river side) between the bridges.
  for (let z = -214; z < 186; z += 30) {
    if (bridged.some((bz) => Math.abs(z - bz) < 14)) continue;
    lampAt(ctx, -265.2, 0, z, 1, 0, PALETTE.sodium, { pole: 6 });
  }
  // The lock-keeper's house at the south end of the apron.
  building(ctx, { id: 'lockKeeper', x: -258, z: 196.5, w: 8, d: 7, h: 6, style: 'brick', roof: 'flat', parapet: false, cornice: true, storefront: false, tiers: [], props: 'none', neon: [], district: 'quay' });
  solid(ctx, 'painted', new THREE.ConeGeometry(6.2, 2.6, 4).rotateY(Math.PI / 4).scale(1, 1, 0.85).translate(-258, 7.3, 196.5), { color: COPPER, tag: 'roof' });
  glow(ctx, box(0.06, 1, 1.6, -262.03, 3, 196.5), 0xc89a52);
  // Seawall at the harbour edge.
  slab(ctx, 'concrete', X0, -1.4, 203, X1, 0.3, 205, { tag: 'seawall' });
  railing(ctx, true, X0, X1, 204.4, 0.3);
}

// A portal crane on rails: four legs either side of the lane, a slewing cab, a mast and a
// hammerhead jib out over the water (walkable on top), counterweight inboard, hook and cable.
function portalCrane(ctx, x, z) {
  const legX = [-265, -258.6], H = 9;
  for (const lx of legX) for (const s of [-1, 1]) {
    solid(ctx, 'painted', box(0.6, H, 0.6, lx, H / 2, z + s * 3), { color: 0xc8962f, tag: 'craneLeg' });
    ctx.buckets.add('painted', box(0.08, H * 1.05, 0.08, 0, 0, 0).rotateX(s * 0.55).translate(lx, H / 2, z), 0xa87a24);
  }
  solid(ctx, 'painted', box(7.6, 1, 7.6, (legX[0] + legX[1]) / 2, H + 0.5, z), { color: 0xc8962f, tag: 'crane' });
  const cx = (legX[0] + legX[1]) / 2;
  solid(ctx, 'painted', box(4.4, 3.4, 4.2, cx, H + 2.7, z), { color: 0xb8862a, tag: 'crane' });
  glow(ctx, box(0.06, 1, 2.4, cx - 2.23, H + 3, z), 0xc89a52);
  solid(ctx, 'painted', box(1.4, 4.2, 1.4, cx, H + 6.5, z), { color: 0xa87a24, tag: 'crane' });
  const jy = H + 9.2, j0 = -290, j1 = -252;
  solid(ctx, 'painted', box(j1 - j0, 0.9, 1.4, (j0 + j1) / 2, jy, z), { color: 0xc8962f, tag: 'jib' });
  for (let jx = j0 + 1.5; jx < j1; jx += 3) ctx.buckets.add('painted', box(0.08, 1.3, 0.08, 0, 0, 0).rotateZ(0.6).translate(jx, jy - 0.9, z), 0xa87a24);
  solid(ctx, 'painted', box(3, 2.2, 2.2, j1 + 1, jy - 1.4, z), { color: 0x3a3f48, tag: 'counterweight' });
  // Hook on a cable over the water (ink line), a beacon on the tip.
  const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(j0 + 3, jy - 0.5, z), new THREE.Vector3(j0 + 3, 3.5, z)]), new THREE.LineBasicMaterial({ color: 0x0b0b12 }));
  ctx.scene.add(cable);
  ctx.buckets.add('painted', box(0.8, 0.9, 0.5, j0 + 3, 3.1, z), 0x2a2c30);
  const i = ctx.halos.add(j0 + 0.5, jy + 0.9, z, PALETTE.crimson, 2.4);
  ctx.blinkers.push({ i, size: 2.4, phase: z * 0.1 });
  ctx.grapple.push({ x: j0 + 1, y: jy + 0.45, z, nx: -1, nz: 0, perch: true });
  edgeGrapples(ctx, (j0 + j1) / 2, z, j1 - j0, 1.4, jy + 0.45, 6);
  ctx.grapple.push({ x: cx, y: H + 4.4, z, nx: 0, nz: 1, perch: true });
  addLadder(ctx.climbables, { x: legX[1] + 0.31, z: z + 3, nx: 1, nz: 0, bottom: 0, top: H });
  for (let k = 0.4; k < H; k += 0.4) ctx.buckets.add('steel', box(0.04, 0.04, 0.5, legX[1] + 0.33, k, z + 3));
}
