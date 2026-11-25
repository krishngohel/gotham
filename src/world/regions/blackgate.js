// Blackgate Penitentiary (Long Night 2, workstream H): a grim prison on a rock in the harbour,
// south-east of the freighter, lit like a threat you can see from the docks. Walls with a walk
// along the top, four searchlight towers (a lamp, a halo and a sweeping beam each: no real
// lights), two cell blocks either side of an exercise yard with a watchtower, an admin block, a
// gatehouse with its portcullis down, a ferry landing on the east shore, and a low causeway from
// the docks road (x 90). Doors are registered sites (regions/data.js); nothing is hollow yet.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { LAYER_FX } from '../../render/layers.js';
import { box, cylinder, tiledBox } from '../buckets.js';
import { solid, glow, lightSpot, edgeGrapples, waterTower } from '../cityBuilder.js';
import { addLadder } from '../climbables.js';
import { createBoat } from '../../vehicles/vehicleModels.js';
import { billboardTexture } from '../textures.js';
import { parkedFleetCar } from '../parkedCars.js';
import { BLACKGATE as BG } from './blackgateLayout.js';
import { block, boulder, house, lantern, IRON } from './hillBuild.js';

const CONCRETE = 0x6a6c6e, GRIM = 0x55585c, DARK = 0x2e3134, RUST = 0x5a3a2a, FLOOD = 0xf2ecd2;
const G = BG.ground;
const flat = () => G;

export function buildBlackgate(ctx) {
  causeway(ctx);
  islet(ctx);
  walls(ctx);
  inside(ctx);
  dock(ctx);
}

// ---------------------------------------------------------------- the causeway

function causeway(ctx) {
  const D = BG.deck;
  // The landing at the docks end (covers the jog from x 90 to x 84) and the long straight.
  block(ctx, 78, -3, 204, 96, D, 216, 0x6e6a62, { tag: 'causeway', key: 'concrete' });
  block(ctx, 78, -3, 216, 90, D, 300, 0x6e6a62, { tag: 'causeway', key: 'concrete' });
  ctx.buckets.add('asphalt', tiledBox(10, 0.04, 96, 84, D + 0.02, 252, { uvScale: [17, 17], faces: [2] }));
  ctx.buckets.add('asphalt', tiledBox(18, 0.04, 12, 87, D + 0.02, 210, { uvScale: [17, 17], faces: [2] }));
  // The ramp up onto the rock (1 m steps of ~6 cm, like the framework's ramps), drawn as one slope.
  for (let z = 300; z < 330; z++) {
    const y = D + ((G - D) * (z + 1 - 300)) / 30;
    ctx.collision.addBox(78, -3, z, 90, y, z + 1, 'ramp');
  }
  const slope = new THREE.PlaneGeometry(12, Math.hypot(30, G - D)).rotateX(-Math.PI / 2).rotateX(-Math.atan2(G - D, 30)).translate(84, (D + G) / 2, 315);
  ctx.buckets.add('asphalt', slope);
  ctx.buckets.add('concrete', box(12, 3 + G, 30, 84, (G - 3) / 2 - 0.05, 315));
  // Parapets along both sides (1.1 m: nobody drives or walks off), with sodium lamps every 24 m.
  for (const x of [78.25, 89.75]) {
    for (let z = 216; z < 330; z += 6) {
      const y = z < 300 ? D : D + ((G - D) * (z - 300)) / 30;
      ctx.buckets.add('painted', box(0.5, 1.1, 6.02, x, y + 0.55, z + 3), GRIM);
      // Collides a metre thick (outward), so nothing fast slips through it.
      const out = x < 84 ? -1 : 1;
      ctx.collision.addBox(Math.min(x - 0.25, x - 0.25 + out * 1), y, z, Math.max(x + 0.25, x + 0.25 + out * 1), y + 1.1, z + 6, 'railing');
    }
  }
  for (let z = 222; z < 300; z += 24) {
    const x = 89.6, y = D;
    solid(ctx, 'painted', cylinder(0.09, 0.13, 6, x, y + 3, z, 8), { color: IRON, tag: 'prop' });
    ctx.buckets.add('painted', box(1.6, 0.1, 0.1, x - 0.8, y + 6, z), IRON);
    glow(ctx, box(0.5, 0.12, 0.4, x - 1.5, y + 5.9, z), PALETTE.sodium);
    ctx.halos.add(x - 1.5, y + 5.75, z, PALETTE.sodium, 3);
    if (z % 48 === 30) lightSpot(ctx, x - 1.5, y + 5.4, z, PALETTE.sodium, 22, 15);
    ctx.reflect.push({ x: x - 1.5, y: -0.55, z, h: 6, color: PALETTE.sodium, w: 0.5, len: 10, k: 0.4 });
  }
  // Lane dashes and a sign at the docks end.
  for (let z = 218; z < 298; z += 8) ctx.buckets.add('lane', new THREE.PlaneGeometry(0.22, 3.4).rotateX(-Math.PI / 2).translate(84, D + 0.05, z));
  sign(ctx, 'BLACKGATE PENITENTIARY', 'NO VISITORS AFTER DARK. OR BEFORE.', 0x2e3134, 96.2, D + 2.6, 214, Math.PI / 2, 4.6);
  for (const s of [-1.9, 1.9]) ctx.buckets.add('painted', cylinder(0.07, 0.07, 3, 96.2, D + 1.5, 214 + s, 6), IRON);
  // Riprap: boulders along the causeway's flanks at the waterline.
  for (let z = 218; z < 330; z += 7) for (const x of [76.6, 91.4]) {
    const s = ctx.rng.range(1.2, 2.2);
    rock(ctx, x, -1.6, z + ctx.rng.range(-1, 1), s, 1.6 + ctx.rng.range(0, 0.5), GRIM);
  }
}

// A rounded rock (a squashed, jittered icosahedron) standing on y0, `s` across and `h` high.
function rock(ctx, x, y0, z, s, h, color) {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * s * ctx.rng.range(0.85, 1.15), p.getY(i) * h, p.getZ(i) * s * ctx.rng.range(0.85, 1.15));
  g.computeVertexNormals();
  ctx.buckets.add('painted', g.rotateY(ctx.rng.range(0, 3)).translate(x, y0 + h / 2, z), color);
}

const signMats = new Map();
function sign(ctx, text, sub, bg, x, y, z, yaw, w) {
  let mat = signMats.get(text);
  if (!mat) { mat = new THREE.MeshBasicMaterial({ map: billboardTexture(text, sub, bg), transparent: true }); signMats.set(text, mat); }
  for (const s of [0, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.39), mat);
    m.position.set(x - Math.sin(yaw) * 0.02 * s, y, z - Math.cos(yaw) * 0.02 * s);
    m.rotation.y = yaw + s * Math.PI;
    ctx.scene.add(m);
  }
}

// ---------------------------------------------------------------- the rock

function islet(ctx) {
  const r = BG.rock;
  // The rock's flat top (concrete over it, the yard inside the walls) and the plaza before the gate.
  block(ctx, r.minX, -6, r.minZ, r.maxX, G, r.maxZ, 0x3e3c38, { tag: 'rock', key: 'concrete' });
  block(ctx, 78, -6, 330, 130, G, 350, 0x3e3c38, { tag: 'rock', key: 'concrete' });
  ctx.buckets.add('asphalt', tiledBox(52, 0.04, 16, 104, G + 0.02, 342, { uvScale: [17, 17], faces: [2] }));
  // Broken rock round the shore, piled higher on the seaward (south and east) sides.
  const ring = [];
  for (let x = r.minX; x <= r.maxX; x += 6) { ring.push([x, r.minZ - 1.5, 0]); ring.push([x, r.maxZ + 1.5, 1]); }
  for (let z = r.minZ + 6; z < r.maxZ; z += 6) { ring.push([r.minX - 1.5, z, 0]); ring.push([r.maxX + 1.5, z, 1]); }
  for (const [x, z, sea] of ring) {
    if (z > 370 && z < 390 && x > r.maxX - 2) continue; // the ferry landing
    if (z < r.minZ && x < 132) continue; // the plaza at the causeway's end
    const s = ctx.rng.range(2.5, 4.5), h = sea ? ctx.rng.range(2.6, 5.5) : ctx.rng.range(1.5, 3.2);
    rock(ctx, x, -2.5, z, s, h + 1.2, ctx.rng.chance(0.5) ? 0x45433e : 0x3a3834);
    if (h + 1.2 - 2.5 > G - 0.1) ctx.collision.addBox(x - s / 2, -2.5, z - s / 2, x + s / 2, -1.3 + h, z + s / 2, 'prop');
  }
  // Car park: a prison van and a couple of staff cars, lamp posts, a guard hut.
  parkedFleetCar(ctx, 98, 337.5, true, null, { y: G, types: ['police_van'] });
  ctx.collision.addBox(95, G + 0.3, 336.4, 101, G + 1.4, 338.6, 'car');
  parkedFleetCar(ctx, 106, 337.5, true, null, { y: G, types: ['sedan', 'sedan_compact', 'suv'] });
  ctx.collision.addBox(103.8, G + 0.3, 336.5, 108.2, G + 1.1, 338.5, 'car');
  for (const x of [96, 112]) floodPole(ctx, x, 349, 0, -1);
  house(ctx, flat, { x: 131, z: 345, w: 4, d: 4, h: 3, y: G, style: 'concrete', roof: 'flat', door: 'w', id: 'bgHut', district: 'blackgate' });
}

function floodPole(ctx, x, z, nx, nz, h = 7) {
  solid(ctx, 'painted', cylinder(0.1, 0.16, h, x, G + h / 2, z, 8), { color: IRON, tag: 'prop' });
  ctx.buckets.add('painted', box(0.9, 0.5, 0.5, x + nx * 0.3, G + h, z + nz * 0.3), DARK);
  glow(ctx, box(0.7, 0.3, 0.06, x + nx * 0.56, G + h - 0.05, z + nz * 0.56), FLOOD);
  ctx.halos.add(x + nx * 0.8, G + h - 0.1, z + nz * 0.8, FLOOD, 4);
  lightSpot(ctx, x + nx * 3, G + h - 1, z + nz * 3, FLOOD, 26, 18);
  ctx.buckets.add('pool', new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2).translate(x + nx * 5, G + 0.06, z + nz * 5), 0x5a5a48);
}

// ---------------------------------------------------------------- walls, towers, gatehouse

function walls(ctx) {
  const W = BG.walls, top = G + W.h, t = W.t;
  const gx = BG.gate.x, gap = 8;
  const run = (minX, minZ, maxX, maxZ) => {
    block(ctx, minX, G - 0.5, minZ, maxX, top, maxZ, CONCRETE, { tag: 'wall', key: 'concrete' });
    ctx.facades.push({ minX, minY: G, minZ, maxX, maxY: top, maxZ, style: 'concrete' });
    // A dark stain band at the base, a coping on top, and a railing on the inside of the walk.
    ctx.buckets.add('painted', box(maxX - minX + 0.04, 1.6, maxZ - minZ + 0.04, (minX + maxX) / 2, G + 0.8, (minZ + maxZ) / 2), 0x3a3c3e);
    ctx.buckets.add('painted', box(maxX - minX + 0.3, 0.3, maxZ - minZ + 0.3, (minX + maxX) / 2, top + 0.15, (minZ + maxZ) / 2), GRIM);
  };
  run(W.minX, W.minZ, gx - gap / 2, W.minZ + t);
  run(gx + gap / 2, W.minZ, W.maxX, W.minZ + t);
  run(W.minX, W.maxZ - t, W.maxX, W.maxZ);
  run(W.minX, W.minZ, W.minX + t, W.maxZ);
  run(W.maxX - t, W.minZ, W.maxX, W.maxZ);
  // Grapple points along the outside of the wall walk.
  for (let x = W.minX + 4; x < W.maxX; x += 8) {
    if (Math.abs(x - gx) > gap / 2 + 3) ctx.grapple.push({ x, y: top + 0.3, z: W.minZ, nx: 0, nz: -1 });
    ctx.grapple.push({ x, y: top + 0.3, z: W.maxZ, nx: 0, nz: 1 });
  }
  for (let z = W.minZ + 4; z < W.maxZ; z += 8) {
    ctx.grapple.push({ x: W.minX, y: top + 0.3, z, nx: -1, nz: 0 });
    ctx.grapple.push({ x: W.maxX, y: top + 0.3, z, nx: 1, nz: 0 });
  }
  // Coils of wire along the outer edge (ink silhouettes against the sky).
  for (const [x0, z0, x1, z1] of [[W.minX, W.minZ - 0.1, W.maxX, W.minZ - 0.1], [W.minX, W.maxZ + 0.1, W.maxX, W.maxZ + 0.1], [W.minX - 0.1, W.minZ, W.minX - 0.1, W.maxZ], [W.maxX + 0.1, W.minZ, W.maxX + 0.1, W.maxZ]]) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0; s < L; s += 1.2) {
      const x = x0 + ((x1 - x0) * s) / L, z = z0 + ((z1 - z0) * s) / L;
      if (Math.abs(x - gx) < gap / 2 + 4 && z < W.minZ + 1) continue;
      ctx.buckets.add('painted', new THREE.TorusGeometry(0.32, 0.03, 3, 8).rotateY(x0 === x1 ? 0 : Math.PI / 2).translate(x, top + 0.62, z), 0x8a8c8e);
    }
  }
  // Corner towers with searchlight cabins.
  const beams = [];
  for (const [cx, cz] of [[W.minX, W.minZ], [W.maxX, W.minZ], [W.minX, W.maxZ], [W.maxX, W.maxZ]]) beams.push(tower(ctx, cx, cz));
  // The gatehouse: twin towers, the arch, the portcullis down, a lamp and the crest of the state.
  for (const s of [-1, 1]) {
    const tx = gx + s * (gap / 2 + 2);
    block(ctx, tx - 2, G - 0.5, W.minZ - 2.4, tx + 2, G + 11, W.minZ + t + 1, CONCRETE, { tag: 'building', key: 'concrete' });
    ctx.facades.push({ minX: tx - 2, minY: G, minZ: W.minZ - 2.4, maxX: tx + 2, maxY: G + 11, maxZ: W.minZ + t + 1, style: 'concrete' });
    for (let k = 0; k < 3; k++) solid(ctx, 'painted', box(0.9, 1, 0.9, tx - 1.4 + k * 1.4, G + 11.5, W.minZ - 1.9), { color: GRIM, tag: 'parapet' });
    edgeGrapples(ctx, tx, W.minZ - 0.7, 4, 3.4 + t, G + 11, 2);
    glow(ctx, box(0.6, 1.4, 0.06, tx, G + 7.5, W.minZ - 2.44), 0xd8c070);
  }
  block(ctx, gx - gap / 2, G + 5.4, W.minZ - 2.4, gx + gap / 2, G + 10, W.minZ + t + 1, CONCRETE, { tag: 'building', key: 'concrete' });
  for (let k = 0; k <= 10; k++) ctx.buckets.add('painted', box(0.1, 5.4, 0.1, gx - gap / 2 + 0.4 + k * 0.72, G + 2.7, W.minZ - 0.4), IRON);
  for (let k = 0; k < 6; k++) ctx.buckets.add('painted', box(gap - 0.4, 0.08, 0.1, gx, G + 0.5 + k * 0.9, W.minZ - 0.4), IRON);
  ctx.collision.addBox(gx - gap / 2, G, W.minZ - 0.8, gx + gap / 2, G + 5.4, W.minZ + 0.6, 'gate');
  for (const s of [-1, 1]) lantern(ctx, gx + s * (gap / 2 + 0.3), G + 4.6, W.minZ - 2.7, FLOOD, 3);
  lightSpot(ctx, gx, G + 4, W.minZ - 5, FLOOD, 24, 16);
  sign(ctx, 'BLACKGATE', 'PLEASE CHECK YOUR CAPE AT THE GATE', 0x3a3c3e, gx, G + 7.6, W.minZ - 2.46, Math.PI, 5);
  // Sweeping beams: additive cones from each tower lamp, out over the yard and the sea.
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(FLOOD) } },
    vertexShader: 'varying float vA; varying float vE; void main(){ vA = uv.y; vec3 n = normalize(normalMatrix * normal); vec3 v = normalize(-(modelViewMatrix * vec4(position,1.0)).xyz); vE = abs(dot(n, v)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; varying float vA; varying float vE; void main(){ float a = pow(vE, 1.4) * (1.0 - vA) * 0.32; gl_FragColor = vec4(uColor * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const geo = new THREE.CylinderGeometry(0.3, 6, 60, 14, 1, true).translate(0, -30, 0).rotateX(-Math.PI / 2 + 0.35);
  const meshes = beams.map((b, k) => {
    const m = new THREE.Mesh(geo, beamMat);
    m.position.set(b.x, b.y, b.z);
    m.layers.set(LAYER_FX);
    m.userData.dynamic = true;
    m.frustumCulled = false;
    ctx.scene.add(m);
    ctx.chunks.addDetail(m, { minX: b.x - 60, minY: 0, minZ: b.z - 60, maxX: b.x + 60, maxY: b.y + 2, maxZ: b.z + 60 });
    return { m, phase: k * 1.7, base: b.yaw };
  });
  ctx.updaters.push((tm) => { for (const b of meshes) b.m.rotation.y = b.base + Math.sin(tm * 0.35 + b.phase) * 1.1; });
}

// A 6 m square tower, 14.3 m to its walk, a glazed searchlight cabin on top (a perch on its roof).
function tower(ctx, cx, cz) {
  const s = 6, h = 14.3, W = BG.walls;
  block(ctx, cx - s / 2, G - 0.5, cz - s / 2, cx + s / 2, G + h, cz + s / 2, CONCRETE, { tag: 'building', key: 'concrete' });
  ctx.facades.push({ minX: cx - s / 2, minY: G, minZ: cz - s / 2, maxX: cx + s / 2, maxY: G + h, maxZ: cz + s / 2, style: 'concrete' });
  ctx.buckets.add('painted', box(s + 0.6, 0.4, s + 0.6, cx, G + h - 0.2, cz), GRIM);
  // Cabin.
  const y = G + h;
  ctx.buckets.add('glass', box(3, 2.2, 3, cx, y + 1.1, cz));
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) ctx.buckets.add('painted', box(0.15, 2.2, 0.15, cx + sx * 1.5, y + 1.1, cz + sz * 1.5), DARK);
  ctx.collision.addBox(cx - 1.6, y, cz - 1.6, cx + 1.6, y + 2.2, cz + 1.6, 'building');
  ctx.buckets.add('painted', new THREE.ConeGeometry(2.6, 1.2, 4).rotateY(Math.PI / 4).translate(cx, y + 2.8, cz), DARK);
  ctx.collision.addBox(cx - 1.8, y + 2.2, cz - 1.8, cx + 1.8, y + 2.8, cz + 1.8, 'roof');
  ctx.grapple.push({ x: cx, y: y + 2.8, z: cz, nx: Math.sign(cx - 142), nz: Math.sign(cz - 379), perch: true });
  edgeGrapples(ctx, cx, cz, s, s, y, 3);
  // The lamp: toward the inside of the compound at rest.
  const yaw = Math.atan2(142 - cx, 379 - cz);
  const lx = cx + Math.sin(yaw) * 1.7, lz = cz + Math.cos(yaw) * 1.7;
  glow(ctx, cylinder(0.45, 0.45, 0.6, lx, y + 1.3, lz, 10), FLOOD);
  ctx.halos.add(lx, y + 1.3, lz, FLOOD, 20);
  ctx.blinkers.push({ i: ctx.halos.add(cx, y + 3.4, cz, PALETTE.crimson, 4.5), size: 4.5, phase: cx * 0.1 + cz });
  // A ladder up the inside face to the walk.
  const nx = Math.sign(142 - cx) * (Math.abs(cx - 142) > 1 ? 1 : 0);
  addLadder(ctx.climbables, { x: cx + nx * (s / 2 + 0.3), z: cz + (cz < 379 ? 2 : -2), nx, nz: 0, bottom: G, top: G + W.h });
  for (let k = G + 0.3; k < G + W.h; k += 0.3) ctx.buckets.add('painted', box(0.04, 0.04, 0.5, cx + nx * (s / 2 + 0.3), k, cz + (cz < 379 ? 2 : -2)), IRON);
  return { x: lx, y: y + 1.3, z: lz, yaw };
}

// ---------------------------------------------------------------- inside the walls

function inside(ctx) {
  // Cell blocks: three storeys of slit windows, dark bars, a stencilled letter, doors on the yard.
  for (const b of BG.blocks) {
    const y = house(ctx, flat, { x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, y: G, style: 'concrete', roof: 'flat', id: `bgBlock${b.id}`, district: 'blackgate' });
    for (let f = 0; f < 3; f++) for (let k = 0; k < 11; k++) for (const s of [-1, 1]) {
      const wx = b.x - b.w / 2 + 2 + k * 4, wy = y + 2 + f * 3.8, wz = b.z + s * (b.d / 2 + 0.04);
      const lit = ((k * 7 + f * 3 + (s > 0 ? 1 : 0)) % 5) === 0;
      (lit ? glow : (c, g, col) => ctx.buckets.add('painted', g, col))(ctx, box(0.5, 1.4, 0.06, wx, wy, wz), lit ? 0xd8c070 : 0x15171a);
      for (const o of [-0.12, 0.12]) ctx.buckets.add('painted', box(0.05, 1.5, 0.08, wx + o, wy, wz + s * 0.02), IRON);
    }
    const doorZ = b.z + (b.id === 'A' ? 1 : -1) * (b.d / 2 + 0.05);
    ctx.buckets.add('painted', box(2.6, 3, 0.1, b.x, y + 1.5, doorZ), 0x2a2d30);
    for (let k = 0; k < 6; k++) ctx.buckets.add('painted', box(0.06, 3, 0.12, b.x - 1.1 + k * 0.44, y + 1.5, doorZ), IRON);
    lantern(ctx, b.x, y + 3.6, doorZ + (b.id === 'A' ? 0.3 : -0.3), FLOOD, 2.4);
    ctx.buckets.add('painted', box(2.2, 2.2, 0.06, b.x - b.w / 2 + 3, y + b.h - 2.2, b.z + (b.id === 'A' ? 1 : -1) * (b.d / 2 + 0.06)), 0xd8d0b0);
    for (const s of [-1, 1]) ctx.buckets.add('painted', box(1.6, 0.14, 1.6, b.x + s * 14, y + b.h + 0.7, b.z), DARK);
    for (const s of [-1, 1]) solid(ctx, 'painted', box(1.4, 1.4, 1.4, b.x + s * 14, y + b.h, b.z), { color: GRIM, tag: 'prop' });
  }
  // Admin block with a water tank on its roof (the collectible hides behind it).
  const a = BG.admin;
  const ay = house(ctx, flat, { x: a.x, z: a.z, w: a.w, d: a.d, h: a.h, y: G, style: 'brick', roof: 'flat', door: 'e', id: 'bgAdmin', district: 'blackgate' });
  waterTower(ctx, a.x - 2, ay + a.h, a.z - 6);
  // The exercise yard: a chain-link fence, a basketball post, benches, a watchtower in the middle.
  const Y = BG.yard;
  const fx0 = Y.x - Y.w / 2, fx1 = Y.x + Y.w / 2, fz0 = Y.z - Y.d / 2, fz1 = Y.z + Y.d / 2;
  ctx.buckets.add('painted', box(Y.w, 0.04, Y.d, Y.x, G + 0.03, Y.z), 0x4a4c4e);
  for (const [x0, z0, x1, z1] of [[fx0, fz0, fx1, fz0], [fx0, fz1, fx1, fz1], [fx1, fz0, fx1, fz1]]) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0; s <= L; s += 3) ctx.buckets.add('painted', cylinder(0.05, 0.05, 3.4, x0 + ((x1 - x0) * s) / L, G + 1.7, z0 + ((z1 - z0) * s) / L, 5), 0x7a7c7e);
    // Chain-link: fine wires every 0.35 m and three rails, inked against the yard light.
    for (let s = 0.2; s < L; s += 0.35) ctx.buckets.add('painted', box(0.025, 3.2, 0.025, x0 + ((x1 - x0) * s) / L, G + 1.6, z0 + ((z1 - z0) * s) / L), 0x8a8c8e);
    for (const yy of [0.1, 1.6, 3.2]) ctx.buckets.add('painted', box(Math.abs(x1 - x0) + 0.06, 0.06, Math.abs(z1 - z0) + 0.06, (x0 + x1) / 2, G + yy, (z0 + z1) / 2), 0x7a7c7e);
    ctx.collision.addBox(Math.min(x0, x1) - 0.05, G, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, G + 3.4, Math.max(z0, z1) + 0.05, 'fence');
  }
  solid(ctx, 'painted', cylinder(0.08, 0.08, 3.2, fx1 - 3, G + 1.6, Y.z, 6), { color: 0x7a7c7e, tag: 'prop' });
  ctx.buckets.add('painted', box(0.06, 0.9, 1.4, fx1 - 3.2, G + 3.2, Y.z), 0xd8d4c8);
  for (const s of [-1, 1]) block(ctx, Y.x - 6, G, Y.z + s * 5.5, Y.x - 2, G + 0.45, Y.z + s * 5.5 + 0.5, 0x5a4a3a, { tag: 'prop', key: 'wood' });
  const tx = BG.tower.x, tz = BG.tower.z, th = 8;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) solid(ctx, 'painted', box(0.25, th, 0.25, tx + sx * 1.3, G + th / 2, tz + sz * 1.3), { color: DARK, tag: 'prop' });
  block(ctx, tx - 1.9, G + th, tz - 1.9, tx + 1.9, G + th + 0.25, tz + 1.9, DARK, { tag: 'catwalk' });
  ctx.buckets.add('glass', box(3.2, 1.8, 3.2, tx, G + th + 1.2, tz));
  block(ctx, tx - 2, G + th + 2.1, tz - 2, tx + 2, G + th + 2.35, tz + 2, DARK, { tag: 'roof' });
  ctx.grapple.push({ x: tx, y: G + th + 2.35, z: tz, nx: 0, nz: 1, perch: true });
  addLadder(ctx.climbables, { x: tx, z: tz + 1.6, nx: 0, nz: 1, bottom: G, top: G + th });
  for (let k = G + 0.3; k < G + th; k += 0.3) ctx.buckets.add('painted', box(0.5, 0.04, 0.04, tx, k, tz + 1.6), IRON);
  glow(ctx, cylinder(0.3, 0.3, 0.4, tx + 1.7, G + th + 1.2, tz, 8), FLOOD);
  ctx.halos.add(tx + 1.9, G + th + 1.2, tz, FLOOD, 5);
  // Floodlights on the inside of the walls over the yard and the gate court.
  for (const [x, z, nx, nz] of [[178, 381, -1, 0], [142, 404.4, 0, -1], [142, 353.6, 0, 1], [105.6, 360, 1, 0]]) floodPole(ctx, x, z, nx, nz, 7.6);
  // Steam from the laundry vents, puddles of light.
  ctx.steam.push({ x: a.x + 3, y: ay + a.h + 0.8, z: a.z + 7, s: 1 }, { x: 120, y: G + 12.9, z: 394, s: 1.1 });
}

// ---------------------------------------------------------------- the ferry landing

function dock(ctx) {
  const d = BG.dock;
  block(ctx, d.x0, d.y - 0.4, d.z - d.w / 2, d.x1, d.y, d.z + d.w / 2, 0x5a4232, { tag: 'pier', key: 'wood' });
  for (let x = d.x0 + 2; x <= d.x1; x += 4) for (const s of [-1, 1]) ctx.buckets.add('wood', cylinder(0.25, 0.25, 4, x, d.y - 2.2, d.z + s * (d.w / 2 - 0.3), 6));
  for (let x = d.x0 + 4; x <= d.x1; x += 6) for (const s of [-1, 1]) solid(ctx, 'painted', cylinder(0.22, 0.28, 0.6, x, d.y + 0.3, d.z + s * (d.w / 2 - 0.5), 8), { color: 0x1e2026, tag: 'prop' });
  // Steps up from the landing to the rock's top, a gate in a fence, a lamp.
  for (let k = 0; k < 3; k++) block(ctx, d.x0 - 4 + k * 1.2, G - 3, d.z - 3, d.x0 - 2.8 + k * 1.2, G - k * 0.33, d.z + 3, CONCRETE, { tag: 'step', key: 'concrete' });
  block(ctx, d.x0 - 0.6, d.y - 3, d.z - 3, d.x0 + 0.1, d.y, d.z + 3, CONCRETE, { tag: 'step', key: 'concrete' });
  floodPole(ctx, d.x0 + 1, d.z - d.w / 2 + 0.3, 0, 1, 6);
  sign(ctx, 'FERRY LANDING', 'ONE WAY TICKETS ONLY', 0x2e3134, d.x0 + 6, d.y + 2.1, d.z - d.w / 2 - 0.1, Math.PI, 3.2);
  for (const s of [-1.4, 1.4]) ctx.buckets.add('painted', cylinder(0.06, 0.06, 2.4, d.x0 + 6 + s, d.y + 1.2, d.z - d.w / 2 - 0.1, 6), IRON);
  // Moored: the prison launch alongside, its lamps lit.
  const boat = createBoat('police_launch');
  boat.group.position.set((d.x0 + d.x1) / 2 + 2, -0.6, d.z + d.w / 2 + 2.8);
  boat.group.rotation.y = Math.PI / 2;
  ctx.scene.add(boat.group);
}
