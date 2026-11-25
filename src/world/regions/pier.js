// Amusement Mile (workstream H2): a long pleasure pier into the lake, and the lake around it.
// A turning Ferris wheel whose gondola roofs are moving platforms (and moving grapple perches), a
// carousel, a funhouse front, a roller-coaster track you can run along, arcades and food stalls
// with punning signs, string lights, the Starlight Pavilion at the tip, and an undercroft of
// pilings and catwalks under the deck (a stealth space). Half-derelict toward the far end:
// boarded stalls, dead bulbs, a collapsed section of deck. Out on the lake: a breakwater with a
// lighthouse whose beam sweeps, and a couple of boats on their rounds.
//
// Movers (wheel, gondolas, carousel, the lighthouse beam, boats) are a handful of dynamic meshes
// registered with the chunk set (culled at the draw distance) and cast no shadows; the gondola
// roofs collide through movingBox() (eastKit.js), which allocates nothing per frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '../../config/palette.js';
import { box, cylinder } from '../buckets.js';
import { solid, glow, lightSpot, graffiti } from '../cityBuilder.js';
import { addLadder } from '../climbables.js';
import { createBoat } from '../../vehicles/models/marine.js';
import { EAST, SHORE_X, LAKE_LEVEL } from './eastLayout.js';
import { slab, railing, railLine, neonWord, board, stringLights, movingBox, setMovingBox, parkBench, globeLamp, STONE, IRON } from './eastKit.js';

const P = EAST.pier, W = EAST.wheel;
const DECK = P.deck, UNDER = DECK - 0.6;
const RED = 0xb0302c, YEL = 0xd8a62a, CREAM = 0xf0e2c4, TEAL = 0x2f8f88;
const HOLE = { minX: 572, maxX: 580, minZ: -446, maxZ: -438 }; // the collapsed section

// Vertex-coloured geometry for a dynamic mesh on the shared painted material.
function colored(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}
function dynMesh(ctx, geos, name) {
  const m = new THREE.Mesh(mergeGeometries(geos, false), ctx.materials.painted);
  m.name = name;
  m.castShadow = false;
  m.receiveShadow = true;
  m.userData.dynamic = true;
  return m;
}

export function buildPier(ctx) {
  deck(ctx);
  entrance(ctx);
  ferrisWheel(ctx);
  coaster(ctx);
  carousel(ctx, 500, -450);
  funhouse(ctx, 536, -454);
  stalls(ctx);
  pavilion(ctx, 611, -450);
  undercroft(ctx);
  lighthouse(ctx);
  if (ctx.quality?.name !== 'potato') boats(ctx);
}

// ---- the deck ----

function deck(ctx) {
  const X0 = 386, X1 = P.x1, Z0 = P.z0, Z1 = P.z1;
  // The deck slab, cut round the collapsed section.
  const parts = [
    [X0, Z0, HOLE.minX, Z1], [HOLE.maxX, Z0, X1, Z1],
    [HOLE.minX, Z0, HOLE.maxX, HOLE.minZ], [HOLE.minX, HOLE.maxZ, HOLE.maxX, Z1],
  ];
  for (const [a, b, c, d] of parts) slab(ctx, 'wood', a, UNDER, b, c, DECK, d, { tag: 'pier', uv: [3, 3] });
  // Broken planks hanging into the hole, caution tape round it.
  for (let k = 0; k < 5; k++) ctx.buckets.add('wood', new THREE.BoxGeometry(0.3, 0.08, 4).rotateX(0.5 + k * 0.1).translate(HOLE.minX + 1 + k * 1.5, DECK - 1.2, HOLE.minZ + 1.5));
  for (const z of [HOLE.minZ - 0.6, HOLE.maxZ + 0.6]) for (let x = HOLE.minX - 1; x < HOLE.maxX + 1; x += 1) ctx.buckets.add('painted', box(0.9, 0.08, 0.04, x + 0.45, DECK + 0.9, z), (Math.round(x) % 2) ? PALETTE.crimson : CREAM);
  // Edge railings (open where the undercroft ladders come up on the north side) and the ramp from
  // the seawall promenade (0.15 -> 3 m over 20 m: a gentle slope in 0.1 m steps).
  railing(ctx, true, X0, 398, Z0 + 0.2, DECK, { color: CREAM });
  railing(ctx, true, 402, 598, Z0 + 0.2, DECK, { color: CREAM });
  railing(ctx, true, 602, X1, Z0 + 0.2, DECK, { color: CREAM });
  railing(ctx, true, X0, X1, Z1 - 0.2, DECK, { color: CREAM });
  railing(ctx, false, Z0, Z1, X1 - 0.2, DECK, { color: CREAM });
  railing(ctx, false, Z0, -458, X0 + 0.2, DECK, { color: CREAM });
  railing(ctx, false, -442, Z1, X0 + 0.2, DECK, { color: CREAM });
  const r0 = SHORE_X, r1 = X0, rz0 = -458, rz1 = -442, n = Math.ceil((DECK - 0.15) / 0.1);
  for (let k = 0; k < n; k++) {
    const xa = r0 + ((r1 - r0) * k) / n, xb = r0 + ((r1 - r0) * (k + 1)) / n;
    ctx.collision.addBox(xa, -1, rz0, xb, 0.15 + (DECK - 0.15) * ((k + 1) / n), rz1, 'ramp');
  }
  const ramp = new THREE.PlaneGeometry(Math.hypot(r1 - r0, DECK - 0.15), rz1 - rz0).rotateX(-Math.PI / 2).rotateZ(Math.atan2(DECK - 0.15, r1 - r0)).translate((r0 + r1) / 2, (0.15 + DECK) / 2 + 0.02, (rz0 + rz1) / 2);
  ctx.buckets.add('wood', ramp);
  ctx.buckets.add('wood', box(r1 - r0, 1.2, rz1 - rz0, (r0 + r1) / 2, -0.4, (rz0 + rz1) / 2));
  railLine(ctx, [{ x: r0, z: rz0 + 0.2, y: 0.15 }, { x: r1, z: rz0 + 0.2, y: DECK }], 0, { color: CREAM });
  railLine(ctx, [{ x: r0, z: rz1 - 0.2, y: 0.15 }, { x: r1, z: rz1 - 0.2, y: DECK }], 0, { color: CREAM });
  // Lamps along both edges, string lights between them; dead bulbs and flicker past x 560.
  const north = [], south = [];
  for (let x = X0 + 6; x < X1 - 4; x += 16) {
    const derelict = x > 560;
    for (const [z, list] of [[Z0 + 1.2, north], [Z1 - 1.2, south]]) {
      solid(ctx, 'painted', cylinder(0.1, 0.14, 5.5, x, DECK + 2.75, z, 8), { color: CREAM, tag: 'prop' });
      glow(ctx, new THREE.IcosahedronGeometry(0.3, 1).translate(x, DECK + 5.7, z), derelict ? 0x5a4a3a : PALETTE.window);
      if (!derelict) ctx.halos.add(x, DECK + 5.7, z, PALETTE.window, 2.4);
      list.push({ x, y: DECK + 5.4, z });
    }
    if (!derelict && Math.round(x) % 32 < 16) lightSpot(ctx, x, DECK + 4.5, -450, PALETTE.window, 22, 18);
  }
  const chase = [];
  for (const list of [north, south]) for (let i = 0; i + 1 < list.length; i++) {
    const ids = stringLights(ctx, list[i], list[i + 1], { n: 8, sag: 0.7, dead: list[i].x > 550 ? 0.6 : 0 });
    if (list[i].x < 550) chase.push(...ids);
  }
  // Cross strings over the promenade, every other lamp pair.
  for (let i = 0; i < north.length; i += 2) stringLights(ctx, north[i], south[i], { n: 14, sag: 1.4, dead: north[i].x > 550 ? 0.5 : 0 });
  // Chasing bulbs (cheap: halo sizes only).
  ctx.updaters.push((t) => { const f = Math.floor(t * 5); for (let i = 0; i < chase.length; i++) ctx.halos.setSize(chase[i], (i + f) % 4 === 0 ? 0.4 : 1.1); });
  for (let x = 410; x < 560; x += 24) { parkBench(ctx, x, DECK, -440, 0, -1); }
}

function entrance(ctx) {
  const x = 389;
  for (const z of [-460, -440]) {
    solid(ctx, 'painted', box(2, 10, 2, x, DECK + 5, z), { color: RED, tag: 'pylon' });
    ctx.buckets.add('painted', new THREE.ConeGeometry(1.6, 3, 4).rotateY(Math.PI / 4).translate(x, DECK + 11.5, z), YEL);
    glow(ctx, new THREE.IcosahedronGeometry(0.5, 1).translate(x, DECK + 13.3, z), PALETTE.signal);
    ctx.halos.add(x, DECK + 13.3, z, PALETTE.signal, 4);
    ctx.grapple.push({ x, y: DECK + 10, z, nx: -1, nz: 0, perch: true });
  }
  solid(ctx, 'painted', box(1.2, 2.4, 22, x, DECK + 9, -450), { color: 0x2a1a22, tag: 'sign' });
  neonWord(ctx, 'AMUSEMENT MILE', x - 0.7, DECK + 9, -450, -1, 0, { h: 2, color: PALETTE.signal, back: false, twoSided: true, halo: 7 });
  board(ctx, 'FUN GUARANTEED', 'GUARANTEE VOID AFTER DARK', 395, DECK + 2.2, -441, 0, -1, { w: 3.4, bg: RED, base: DECK });
}

// ---- the Ferris wheel ----

function ferrisWheel(ctx) {
  const { x: cx, z: cz, axle: AY, radius: R, gondolas: N, period } = W;
  // A-frame towers either side of the wheel plane, the axle between them (static, collide).
  for (const s of [-1, 1]) {
    const z = cz + s * 3.2;
    for (const dx of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.9, Math.hypot(14, AY - DECK), 0.9).rotateZ(dx * Math.atan2(14, AY - DECK)).translate(cx + dx * 7, (AY + DECK) / 2, z);
      ctx.buckets.add('painted', g, 0xe6e0d6);
      for (let k = 0; k < 6; k++) {
        const t = (k + 0.5) / 6, y = DECK + (AY - DECK) * t, xx = cx + dx * 14 * (1 - t);
        ctx.collision.addBox(xx - 0.6, y - 2.5, z - 0.5, xx + 0.6, y + 2.5, z + 0.5, 'wheelFrame');
      }
    }
    ctx.buckets.add('painted', box(30, 0.6, 0.8, cx, DECK + 0.3, z), 0x8a8478);
    ctx.buckets.add('painted', box(12, 0.5, 0.5, cx, DECK + (AY - DECK) * 0.45, z), 0xe6e0d6);
  }
  ctx.buckets.add('painted', new THREE.CylinderGeometry(0.9, 0.9, 7.2, 12).rotateX(Math.PI / 2).translate(cx, AY, cz), 0x6a6458);
  ctx.collision.addBox(cx - 1, AY - 1, cz - 3.6, cx + 1, AY + 0.9, cz + 3.6, 'wheelAxle');
  ctx.grapple.push({ x: cx, y: AY + 0.9, z: cz + 3.2, nx: 0, nz: 1, perch: true });
  glow(ctx, new THREE.IcosahedronGeometry(1.2, 1).translate(cx, AY, cz + 3.7), PALETTE.signal);
  ctx.halos.add(cx, AY, cz + 4, PALETTE.signal, 8);
  // Boarding platform: stairs up to a landing the lowest gondola roofs pass just above.
  const py = 6.6;
  slab(ctx, 'wood', cx - 4, DECK, cz + 2.4, cx + 4, py, cz + 6, { tag: 'platform' });
  for (let k = 1; k <= 9; k++) slab(ctx, 'wood', cx + 4, DECK, cz + 2.4, cx + 4 + (10 - k) * 0.45, DECK + k * 0.4, cz + 6, { tag: 'step' });
  railing(ctx, true, cx - 4, cx + 4, cz + 5.8, py, { color: CREAM });
  board(ctx, 'THE BIG WHEEL', 'GOING NOWHERE SLOWLY SINCE 1923', cx - 8, DECK + 2.2, cz + 7.5, 0, 1, { w: 4, bg: TEAL, base: DECK });

  // The rotating wheel: two rims, spokes, a hub star (one mesh, turned about z every frame).
  const geos = [];
  for (const s of [-1.3, 1.3]) {
    geos.push(colored(new THREE.TorusGeometry(R, 0.35, 4, 48).translate(0, 0, s), 0xe6e0d6));
    geos.push(colored(new THREE.TorusGeometry(R * 0.55, 0.22, 4, 32).translate(0, 0, s), RED));
  }
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    for (const s of [-1.3, 1.3]) geos.push(colored(new THREE.BoxGeometry(R, 0.16, 0.16).translate(R / 2, 0, s).rotateZ(a), 0xd8d2c4));
    geos.push(colored(new THREE.BoxGeometry(0.16, 0.16, 2.8).translate(R, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationZ(a)), 0xd8d2c4));
  }
  const wheel = dynMesh(ctx, geos, 'ferrisWheel');
  wheel.position.set(cx, AY, cz);
  ctx.scene.add(wheel);
  // Gondolas: one instanced mesh (one draw), each cabin hanging plumb from its pivot.
  const cab = [
    colored(new THREE.BoxGeometry(2.4, 1.9, 2.0).translate(0, -1.55, 0), RED),
    colored(new THREE.BoxGeometry(2.6, 0.25, 2.2).translate(0, -0.45, 0), CREAM),
    colored(new THREE.BoxGeometry(2.0, 0.7, 2.06).translate(0, -1.1, 0), 0x2a2d36),
    colored(new THREE.BoxGeometry(0.12, 0.5, 0.12).translate(0, -0.2, 0), 0x6a6458),
  ];
  const gondolas = new THREE.InstancedMesh(mergeGeometries(cab, false), ctx.materials.painted, N);
  gondolas.name = 'gondolas';
  gondolas.castShadow = false;
  gondolas.frustumCulled = false;
  gondolas.userData.dynamic = true;
  ctx.scene.add(gondolas);
  const span = { minX: cx - 30, maxX: cx + 30, minY: AY - R - 3, maxY: AY + R + 1, minZ: cz - 1.4, maxZ: cz + 1.4 };
  ctx.chunks.addDetail(wheel, span, 'draw');
  ctx.chunks.addDetail(gondolas, span, 'draw');
  // Each gondola roof: a moving collision box and a moving perch; a bulb on each spoke end.
  const roofs = [], perches = [], bulbs = [];
  for (let i = 0; i < N; i++) {
    roofs.push(movingBox(ctx.collision, span, 'gondola'));
    const p = { x: cx, y: AY, z: cz, nx: 0, nz: 1, perch: true, moving: true };
    perches.push(p);
    ctx.grapple.push(p);
    bulbs.push(ctx.halos.add(cx, AY, cz + 1.5, i % 3 === 0 ? PALETTE.signal : i % 3 === 1 ? PALETTE.crimson : PALETTE.neonCyan, 2.2));
  }
  const m = new THREE.Matrix4();
  // Platforms the hero rides: ctx.world.platforms lists each roof box with its velocity this frame
  // (see eastKit / hand-back: game.js carries a hero standing on one).
  const platforms = roofs.map((b) => ({ box: b, vx: 0, vy: 0, vz: 0 }));
  if (ctx.world) (ctx.world.platforms ??= []).push(...platforms);
  let lastT = null;
  const place = (t) => {
    const ang = (t / period) * Math.PI * 2;
    wheel.rotation.z = ang;
    const dt = lastT === null ? 0 : t - lastT;
    lastT = t;
    for (let i = 0; i < N; i++) {
      const a = ang + (i / N) * Math.PI * 2;
      const px = cx + Math.cos(a) * R, py = AY + Math.sin(a) * R;
      m.makeTranslation(px, py, cz);
      gondolas.setMatrixAt(i, m);
      const b = roofs[i], pl = platforms[i];
      if (dt > 0) { pl.vx = (px - (b.minX + 1.3)) / dt; pl.vy = (py - 0.32 - b.maxY) / dt; } else { pl.vx = 0; pl.vy = 0; }
      setMovingBox(b, px - 1.3, py - 0.6, cz - 1.1, px + 1.3, py - 0.32, cz + 1.1);
      const g = perches[i];
      g.x = px; g.y = py - 0.32; g.z = cz;
      ctx.halos.set(bulbs[i], cx + Math.cos(a) * (R + 0.4), AY + Math.sin(a) * (R + 0.4), cz + 1.5, 2.2);
    }
    gondolas.instanceMatrix.needsUpdate = true;
  };
  place(0);
  ctx.updaters.push(place);
}

// ---- the coaster: a track on red trestles along the north edge you can run along ----

export function coasterHeight(x) {
  // Station (6 m) -> lift hill to 22 m -> drop -> hump -> dip -> a broken run toward the tip.
  const pts = [[392, 6], [410, 6], [470, 22], [508, 8], [534, 15], [556, 9], [588, 13], [610, 7]];
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (x <= x1) { const t = (x - x0) / (x1 - x0), s = t * t * (3 - 2 * t); return y0 + (y1 - y0) * (0.65 * t + 0.35 * s); }
  }
  return pts[pts.length - 1][1];
}
const GAP = [574, 578]; // a missing length of track (derelict end): jump it

function coaster(ctx) {
  const z = -466, X0 = 392, X1 = 610;
  for (let x = X0; x < X1; x += 1) {
    if (x >= GAP[0] && x < GAP[1]) continue;
    const y0 = DECK + coasterHeight(x), y1 = DECK + coasterHeight(x + 1), top = Math.max(y0, y1);
    const L = Math.hypot(1, y1 - y0), ang = Math.atan2(y1 - y0, 1);
    for (const s of [-0.8, 0.8]) ctx.buckets.add('painted', new THREE.BoxGeometry(L + 0.02, 0.18, 0.16).rotateZ(ang).translate(x + 0.5, (y0 + y1) / 2, z + s), 0xcfc8b8);
    ctx.buckets.add('wood', new THREE.BoxGeometry(0.25, 0.12, 2.2).rotateZ(ang).translate(x + 0.5, (y0 + y1) / 2 - 0.12, z));
    // Walkable: one box per metre, its top on the higher end (each step under 0.45 m).
    ctx.collision.addBox(x, top - 0.5, z - 1.2, x + 1, top, z + 1.2, 'coaster');
    if (x % 6 === 0) {
      const h = y0 - DECK;
      for (const s of [-1.4, 1.4]) solid(ctx, 'painted', box(0.35, h - 0.2, 0.35, x, DECK + (h - 0.2) / 2, z + s), { color: RED, tag: 'trestle' });
      ctx.buckets.add('painted', box(0.25, 0.25, 3.2, x, y0 - 0.35, z), RED);
      if (h > 9) for (const yy of [DECK + h * 0.33, DECK + h * 0.66]) ctx.buckets.add('painted', box(0.2, 0.2, 3, x, yy, z), RED);
      ctx.grapple.push({ x, y: y0, z, nx: 0, nz: 1 });
    }
    if (x % 12 === 3 && x < 560) ctx.halos.add(x, y0 + 0.4, z + 1.3, x % 24 === 3 ? PALETTE.signal : PALETTE.crimson, 1.3);
  }
  // Dangling rails over the gap.
  ctx.buckets.add('painted', new THREE.BoxGeometry(2.2, 0.16, 0.16).rotateZ(-0.9).translate(GAP[0] + 0.6, DECK + coasterHeight(GAP[0]) - 0.8, z - 0.8), 0xcfc8b8);
  // The station: a striped roof over the platform at the start, with a parked train.
  slab(ctx, 'wood', X0 - 2, DECK, z - 4, X0 + 16, DECK + 6, z - 1.3, { tag: 'station' });
  for (let k = 1; k <= 14; k++) slab(ctx, 'wood', X0 + 16 + (14 - k) * 0.5, DECK, z - 4, X0 + 16.5 + (14 - k) * 0.5, DECK + k * 6 / 14, z - 1.3, { tag: 'step' });
  for (let x = X0; x < X0 + 16; x += 2) ctx.buckets.add('painted', box(2, 0.3, 4.4, x + 1, DECK + 10.4, z), (x / 2) % 2 ? RED : CREAM);
  for (const x of [X0, X0 + 15]) for (const s of [-2, 2]) solid(ctx, 'painted', box(0.3, 4.2, 0.3, x, DECK + 8.2, z + s), { color: CREAM, tag: 'post' });
  ctx.collision.addBox(X0 - 1, DECK + 10.2, z - 2.4, X0 + 17, DECK + 10.6, z + 2.4, 'roof');
  for (let k = 0; k < 3; k++) ctx.buckets.add('painted', box(2.6, 1.1, 1.6, X0 + 3 + k * 2.8, DECK + 6.9, z), k === 0 ? YEL : RED);
  neonWord(ctx, 'THE LAKE MONSTER', X0 + 8, DECK + 11.6, z + 2.3, 0, 1, { h: 1.2, color: PALETTE.neonCyan, back: false });
  board(ctx, 'YOU MUST BE THIS TALL', 'OR THIS BRAVE. OR THIS BROKE.', X0 + 20, DECK + 1.8, z + 4, 0, 1, { w: 2.6, bg: YEL, base: DECK });
}

// ---- carousel (its canopy and horses turn) ----

function carousel(ctx, cx, cz) {
  const r = 7;
  solid(ctx, 'painted', cylinder(r, r, 0.5, cx, DECK + 0.25, cz, 20), { color: 0x6a3a5a, tag: 'carousel' });
  solid(ctx, 'painted', cylinder(0.6, 0.6, 6, cx, DECK + 3.3, cz, 10), { color: YEL, tag: 'carousel' });
  ctx.collision.addBox(cx - 5.5, DECK + 6.3, cz - 5.5, cx + 5.5, DECK + 7.2, cz + 5.5, 'roof');
  ctx.grapple.push({ x: cx, y: DECK + 9.4, z: cz, nx: 0, nz: 1, perch: true });
  ctx.collision.addBox(cx - 0.8, DECK + 7.2, cz - 0.8, cx + 0.8, DECK + 9.4, cz + 0.8, 'roof');
  const geos = [colored(new THREE.ConeGeometry(r + 0.6, 2.8, 16).translate(0, 7.6, 0), CREAM)];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    geos.push(colored(new THREE.BoxGeometry(2.4, 0.6, 0.12).translate(r + 0.1, 6.1, 0).rotateY(a), k % 2 ? RED : YEL));
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, x = Math.cos(a) * 4.8, z = Math.sin(a) * 4.8;
    geos.push(colored(new THREE.CylinderGeometry(0.05, 0.05, 5.6, 4).translate(x, 3.3, z), BRASSY));
    geos.push(colored(new THREE.BoxGeometry(0.4, 0.7, 1.5).rotateY(-a).translate(x, 1.9 + (k % 2) * 0.5, z), [CREAM, 0x3a3a44, 0xa8823a][k % 3]));
    geos.push(colored(new THREE.BoxGeometry(0.3, 0.6, 0.4).rotateY(-a).translate(x - Math.sin(a) * 0.7, 2.5 + (k % 2) * 0.5, z + Math.cos(a) * 0.7), [CREAM, 0x3a3a44, 0xa8823a][k % 3]));
  }
  const top = dynMesh(ctx, geos, 'carousel');
  top.position.set(cx, DECK, cz);
  ctx.scene.add(top);
  ctx.chunks.addDetail(top, { minX: cx - r, minY: DECK, minZ: cz - r, maxX: cx + r, maxY: DECK + 10, maxZ: cz + r }, 'lod');
  const bulbs = [];
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; bulbs.push(ctx.halos.add(cx + Math.cos(a) * (r + 0.3), DECK + 6.4, cz + Math.sin(a) * (r + 0.3), k % 2 ? PALETTE.window : PALETTE.signal, 1.4)); }
  lightSpot(ctx, cx, DECK + 5, cz, PALETTE.window, 24, 16);
  ctx.updaters.push((t) => { top.rotation.y = t * 0.35; const f = Math.floor(t * 4); for (let i = 0; i < bulbs.length; i++) ctx.halos.setSize(bulbs[i], (i + f) % 2 ? 0.6 : 1.5); });
  board(ctx, 'MERRY-GO-ROUND', 'NOW 40% LESS MERRY', cx + 9, DECK + 2.2, cz + 7, 0, 1, { w: 3, bg: 0x6a3a5a, base: DECK });
}
const BRASSY = 0xc8a050;

// ---- the funhouse front: a giant grinning face whose mouth is the door ----

function funhouse(ctx, cx, cz) {
  const w = 24, d = 14, h = 11;
  const zf = cz + d / 2; // facade faces +z (the promenade)
  solid(ctx, 'painted', box(w, h, d, cx, DECK + h / 2, cz), { color: 0x4a2f5c, tag: 'building' });
  ctx.facades.push({ minX: cx - w / 2, minY: DECK, minZ: cz - d / 2, maxX: cx + w / 2, maxY: DECK + h, maxZ: cz + d / 2, style: 'brick' });
  // Scalloped crown and stripes.
  for (let k = 0; k < 6; k++) ctx.buckets.add('painted', new THREE.CylinderGeometry(2, 2, 0.6, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).translate(cx - w / 2 + 2 + k * 4, DECK + h, zf - 0.2), k % 2 ? YEL : PALETTE.jokerGreen);
  for (let x = cx - w / 2 + 1; x < cx + w / 2; x += 2) ctx.buckets.add('painted', box(1, h - 1, 0.1, x, DECK + (h - 1) / 2, zf + 0.06), 0x5d3a72);
  // The face: two eyes (lit), a nose, a great grin framing the doorway.
  for (const s of [-1, 1]) {
    ctx.buckets.add('painted', new THREE.CircleGeometry(1.8, 16).translate(cx + s * 4.5, DECK + 7.6, zf + 0.12), CREAM);
    glow(ctx, new THREE.CircleGeometry(0.7, 12).translate(cx + s * 4.5 + 0.3, DECK + 7.4, zf + 0.15), PALETTE.jokerGreen);
    ctx.halos.add(cx + s * 4.5, DECK + 7.5, zf + 0.6, PALETTE.jokerGreen, 3.5);
  }
  ctx.buckets.add('painted', new THREE.ConeGeometry(0.9, 2, 4).rotateX(-Math.PI / 2).translate(cx, DECK + 6, zf + 1), PALETTE.crimson);
  ctx.buckets.add('painted', new THREE.TorusGeometry(5, 0.9, 6, 20, Math.PI).rotateZ(Math.PI).translate(cx, DECK + 4.6, zf + 0.3), PALETTE.crimson);
  for (let k = 0; k < 7; k++) ctx.buckets.add('painted', box(0.9, 0.9, 0.2, cx - 3.6 + k * 1.2, DECK + 3.9, zf + 0.35), CREAM);
  ctx.buckets.add('painted', box(3.2, 3.2, 0.1, cx, DECK + 1.6, zf + 0.08), 0x0e0a12);
  glow(ctx, box(3, 0.1, 0.1, cx, DECK + 3.25, zf + 0.15), PALETTE.jokerGreen);
  neonWord(ctx, 'THE GIGGLEWORKS', cx, DECK + h + 1.6, zf, 0, 1, { h: 1.8, color: PALETTE.jokerGreen, back: true, halo: 6 });
  board(ctx, 'MIRROR MAZE INSIDE', 'FIND YOURSELF. THEN LEAVE.', cx + 10, DECK + 2.2, zf + 2.5, 0, 1, { w: 3, bg: PALETTE.jokerPurple, base: DECK });
  for (const x of [cx - w / 2 + 2, cx, cx + w / 2 - 2]) ctx.grapple.push({ x, y: DECK + h, z: zf, nx: 0, nz: 1 });
  ctx.grapple.push({ x: cx, y: DECK + h, z: cz, nx: 0, nz: 1, perch: true });
  graffiti(ctx, cx - w / 2 - 0.02, DECK + 4, cz, -1, 0, 5, 'HA HA HA');
  lightSpot(ctx, cx, DECK + 4, zf + 4, PALETTE.jokerGreen, 22, 16);
}

// ---- stalls and the arcade along the south edge ----

const STALLS = [
  ['FRY ME A RIVER', 'FRIES - ALSO DEEP-FRIED FRIES'], ['CORN DOGGONE IT', 'CORN DOGS ON A STICK'], ['ICE SCREAM', 'FREEZE-APPROVED'],
  ['RING TOSS', 'EVERYONE WINS (TERMS APPLY)'], ['POP GOES THE WEASEL', 'POPCORN. NO WEASEL.'], ['LAKE EFFECT', 'SNOW CONES'],
  ['DEEP DISH DESPAIR', 'PIZZA BY THE SLAB'], ['WHACK-A-HENCHMAN', 'PRACTICE FOR THE REAL THING'], ['FORTUNES', 'YOU WILL MEET A TALL DARK STRANGER'],
  ['CLOSED', 'BY ORDER OF THE GCPD'], ['CLOSED', 'BY ORDER OF NOBODY'],
];

function stalls(ctx) {
  const z = -433.5, rng = ctx.rng;
  let k = 0;
  for (let x = 398; x < 566; x += 9, k++) {
    if (x > 466 && x < 496) continue; // the arcade
    const derelict = x > 540;
    const [title, sub] = derelict ? STALLS[9 + (k % 2)] : STALLS[k % 9];
    const col = derelict ? 0x4a4540 : [RED, TEAL, YEL, 0x6a3a5a][k % 4];
    solid(ctx, 'painted', box(6.4, 3.2, 5, x, DECK + 1.6, z), { color: derelict ? 0x5a5048 : CREAM, tag: 'stall' });
    ctx.buckets.add('painted', box(6.8, 0.25, 5.6, x, DECK + 3.3, z - 0.3), col);
    for (let s = -3; s < 3.2; s += 1.1) ctx.buckets.add('painted', box(1.1, 0.5, 0.1, x + s + 0.55, DECK + 3.0, z - 3.05), (Math.round(s * 10) % 2) ? col : CREAM);
    ctx.collision.addBox(x - 3.4, DECK + 3.2, z - 2.8, x + 3.4, DECK + 3.45, z + 2.5, 'roof');
    ctx.grapple.push({ x, y: DECK + 3.45, z: z - 2.5, nx: 0, nz: -1 });
    if (derelict) {
      for (let s = -2.6; s < 2.8; s += 0.9) ctx.buckets.add('wood', new THREE.BoxGeometry(0.8, 2.2, 0.08).rotateZ(rng.range(-0.08, 0.08)).translate(x + s, DECK + 1.3, z - 2.54));
      board(ctx, title, sub, x, DECK + 4.3, z - 2.6, 0, -1, { w: 3.2, bg: 0x3a3632, posts: false });
    } else {
      glow(ctx, box(5.2, 1.4, 0.06, x, DECK + 1.9, z - 2.52), PALETTE.window);
      ctx.halos.add(x, DECK + 2.4, z - 3, PALETTE.window, 2.2);
      board(ctx, title, sub, x, DECK + 4.3, z - 2.6, 0, -1, { w: 3.6, bg: col, posts: false });
    }
  }
  // The arcade: a low hall with a marquee, buzzing neon.
  const ax = 481, aw = 26;
  solid(ctx, 'painted', box(aw, 6, 8, ax, DECK + 3, -433), { color: 0x2a2d4a, tag: 'building' });
  ctx.facades.push({ minX: ax - aw / 2, minY: DECK, minZ: -437, maxX: ax + aw / 2, maxY: DECK + 6, maxZ: -429, style: 'concrete' });
  glow(ctx, box(aw - 4, 2.4, 0.06, ax, DECK + 1.6, -437.04), 0x3a2a6a);
  for (let x = ax - aw / 2 + 2; x < ax + aw / 2; x += 3) ctx.halos.add(x, DECK + 1.6, -437.5, x % 2 ? PALETTE.neonPink : PALETTE.neonCyan, 1.8);
  const m = neonWord(ctx, 'GAME OVER ARCADE', ax, DECK + 7.3, -437.1, 0, -1, { h: 1.6, color: PALETTE.neonPink, halo: 6 });
  ctx.flickers.push({ mat: m, phase: 2.1 });
  board(ctx, 'INSERT COIN', 'LOSE TICKETS. GAIN NOTHING.', ax - 15, DECK + 2.2, -438.5, 0, -1, { w: 3, bg: 0x2a2d4a, base: DECK });
  edgeTop(ctx, ax, -433, aw, 8, DECK + 6);
}

function edgeTop(ctx, x, z, w, d, y) {
  for (let t = -w / 2 + 3; t < w / 2; t += 6) ctx.grapple.push({ x: x + t, y, z: z - d / 2, nx: 0, nz: -1 });
}

// ---- the Starlight Pavilion at the tip: a domed rotunda, half its bulbs gone ----

function pavilion(ctx, cx, cz) {
  const r = 13, h = 9;
  solid(ctx, 'painted', cylinder(r, r, h, cx, DECK + h / 2, cz, 20), { color: CREAM, tag: 'building' });
  ctx.facades.push({ minX: cx - r, minY: DECK, minZ: cz - r, maxX: cx + r, maxY: DECK + h, maxZ: cz + r, style: 'stone' });
  for (const [hx, hz] of [[0.72, 0.72], [1, 0.5], [0.5, 1]]) ctx.collision.addBox(cx - r * hx, DECK, cz - r * hz, cx + r * hx, DECK + h, cz + r * hz, 'building');
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    ctx.buckets.add('painted', box(0.6, h, 0.6, cx + Math.cos(a) * (r + 0.3), DECK + h / 2, cz + Math.sin(a) * (r + 0.3)), 0xd8ccb0);
    glow(ctx, box(1.2, 4, 0.08, 0, 0, 0).rotateY(-a + Math.PI / 2).translate(cx + Math.cos(a) * (r + 0.05), DECK + 4, cz + Math.sin(a) * (r + 0.05)), k % 3 ? 0x2a2026 : 0x8a6a3a);
  }
  ctx.buckets.add('painted', cylinder(r + 1, r + 1, 0.6, cx, DECK + h + 0.3, cz, 20), 0xb8ac90);
  ctx.buckets.add('painted', new THREE.SphereGeometry(r - 1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(cx, DECK + h + 0.6, cz), 0x4a6a6a);
  ctx.collision.addBox(cx - 8, DECK + h, cz - 8, cx + 8, DECK + h + 4.5, cz + 8, 'roof');
  ctx.collision.addBox(cx - 3, DECK + h + 4.5, cz - 3, cx + 3, DECK + h + 6.4, cz + 3, 'roof');
  ctx.grapple.push({ x: cx, y: DECK + h + 6.4, z: cz, nx: 0, nz: 1, perch: true });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; ctx.grapple.push({ x: cx + Math.cos(a) * r, y: DECK + h, z: cz + Math.sin(a) * r, nx: Math.cos(a), nz: Math.sin(a) }); }
  neonWord(ctx, 'STARLIGHT PAVILION', cx - r - 0.4, DECK + h + 1.6, cz, -1, 0, { h: 1.3, color: 0x7a6a50, back: false, spot: false, halo: 1 });
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; if (k % 3 === 0) ctx.halos.add(cx + Math.cos(a) * (r + 1.2), DECK + h + 0.7, cz + Math.sin(a) * (r + 1.2), PALETTE.window, 1.3); }
  graffiti(ctx, cx - r - 0.1, DECK + 2.5, cz + 4, -1, 0, 4, 'WHY SO');
  board(ctx, 'DANCING TONIGHT', 'SINCE 1931. STILL TONIGHT.', cx - r - 3, DECK + 2.2, cz - 8, -1, 0, { w: 3, bg: 0x3a3632, base: DECK });
  lightSpot(ctx, cx - r - 2, DECK + 3, cz, 0x8a6a3a, 14, 12);
}

// ---- the undercroft: pilings, cross beams, a catwalk just above the water ----

function undercroft(ctx) {
  const X0 = 388, X1 = P.x1 - 2;
  for (let x = X0; x <= X1; x += 8) {
    for (let z = P.z0 + 2; z <= P.z1 - 1; z += 8) {
      ctx.buckets.add('wood', cylinder(0.32, 0.36, UNDER + 3, x, (UNDER - 3) / 2, z, 6));
      if ((x / 8) % 2 === 0) ctx.collision.addBox(x - 0.36, -3, z - 0.36, x + 0.36, UNDER, z + 0.36, 'piling');
    }
    ctx.buckets.add('wood', box(0.4, 0.5, P.z1 - P.z0 - 2, x, UNDER - 0.25, (P.z0 + P.z1) / 2));
  }
  // The catwalk along the north side and two cross catwalks, 0.3 m over the lake.
  const cw = (minX, minZ, maxX, maxZ) => slab(ctx, 'wood', minX, -0.2, minZ, maxX, 0.3, maxZ, { tag: 'catwalk', uv: [2, 2] });
  cw(X0, P.z0 - 1.5, X1, P.z0 + 1.5);
  cw(470 - 1.2, P.z0 + 1.5, 470 + 1.2, P.z1 - 3);
  cw(560 - 1.2, P.z0 + 1.5, 560 + 1.2, P.z1 - 3);
  // Ladders up through the railing gaps at x 400 and 600, and one down from the promenade end.
  for (const x of [400, 600]) {
    for (const s of [-0.25, 0.25]) ctx.buckets.add('steel', box(0.05, DECK - 0.3, 0.05, x + s, 0.3 + (DECK - 0.3) / 2, P.z0 - 1.2));
    for (let y = 0.6; y < DECK; y += 0.3) ctx.buckets.add('steel', box(0.5, 0.04, 0.04, x, y, P.z0 - 1.2));
    addLadder(ctx.climbables, { x, z: P.z0 - 1.2, nx: 0, nz: -1, bottom: 0.3, top: DECK });
  }
  // Dim work lamps: green, few, so the dark between them is the point.
  for (const x of [430, 510, 590]) {
    glow(ctx, box(0.3, 0.15, 0.3, x, UNDER - 0.6, P.z0 + 1), 0x6f9a4a);
    ctx.halos.add(x, UNDER - 0.7, P.z0 + 1, 0x6f9a4a, 1.6);
  }
  for (const x of [440, 520]) ctx.buckets.add('wood', box(1.2, 0.9, 1.2, x, 0.75, P.z0 - 0.5));
  graffiti(ctx, 470, 1.3, P.z0 + 2.3, 0, -1, 3, 'HA HA');
}

// ---- the breakwater and the lighthouse ----

function lighthouse(ctx) {
  const lx = 712, lz = -600, top = 1.2;
  slab(ctx, 'concrete', 470, -3, lz - 3, lx - 4, top, lz + 3, { tag: 'breakwater', uv: [4, 4] });
  for (let x = 476; x < lx - 6; x += 7) ctx.buckets.add('painted', new THREE.IcosahedronGeometry(1.3, 0).translate(x + ctx.rng.range(-2, 2), LAKE_LEVEL + 0.2, lz + (x % 2 ? 3.6 : -3.6)), 0x5a5650);
  slab(ctx, 'concrete', lx - 6, -3, lz - 6, lx + 6, top + 0.3, lz + 6, { tag: 'breakwater' });
  // The tower: a white tapered shaft with a red band, a gallery, the lantern room and its beam.
  const H = 20;
  solid(ctx, 'painted', cylinder(2.0, 2.8, H, lx, top + H / 2, lz, 12), { color: 0xe8e4da, tag: 'lighthouse' });
  ctx.buckets.add('painted', cylinder(2.25, 2.35, 3, lx, top + H * 0.6, lz, 12), PALETTE.crimson);
  ctx.facades.push({ minX: lx - 2.8, minY: 0, minZ: lz - 2.8, maxX: lx + 2.8, maxY: top + H, maxZ: lz + 2.8, style: 'stone' });
  slab(ctx, 'painted', lx - 3.4, top + H, lz - 3.4, lx + 3.4, top + H + 0.3, lz + 3.4, { color: IRON, tag: 'gallery' });
  glow(ctx, cylinder(1.4, 1.4, 2.2, lx, top + H + 1.5, lz, 10), 0xfff0c0);
  ctx.buckets.add('painted', new THREE.ConeGeometry(1.8, 1.6, 10).translate(lx, top + H + 3.4, lz), PALETTE.crimson);
  ctx.collision.addBox(lx - 1.5, top + H + 0.3, lz - 1.5, lx + 1.5, top + H + 2.6, lz + 1.5, 'lighthouse');
  ctx.grapple.push({ x: lx + 3, y: top + H + 0.3, z: lz, nx: 1, nz: 0, perch: true }, { x: lx - 3, y: top + H + 0.3, z: lz, nx: -1, nz: 0, perch: true });
  addLadder(ctx.climbables, { x: lx, z: lz + 2.9, nx: 0, nz: 1, bottom: top + 0.3, top: top + H });
  ctx.halos.add(lx, top + H + 1.5, lz, 0xfff0c0, 9);
  lightSpot(ctx, lx, top + H + 1.5, lz, 0xfff0c0, 30, 30);
  // The sweeping beam: two long additive wedges, turned every frame.
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const bg = mergeGeometries([0, Math.PI].map((a) => new THREE.ConeGeometry(9, 160, 10, 1, true).translate(0, -80, 0).rotateZ(Math.PI / 2).rotateY(a)), false);
  const beam = new THREE.Mesh(bg, beamMat);
  beam.position.set(lx, top + H + 1.5, lz);
  beam.userData.dynamic = true;
  beam.castShadow = false;
  beam.name = 'lighthouseBeam';
  ctx.scene.add(beam);
  ctx.chunks.addDetail(beam, { minX: lx - 160, minY: 0, minZ: lz - 160, maxX: lx + 160, maxY: 40, maxZ: lz + 160 }, 'draw');
  ctx.updaters.push((t) => { beam.rotation.y = t * 0.5; });
  board(ctx, 'NORTH BREAKWATER', 'KEEP OFF. WAVES DO NOT CARE.', 480, top + 1.6, lz + 3.2, 0, 1, { w: 3, bg: PALETTE.crimson, base: top });
  globeLamp(ctx, 476, top, lz, { spot: false });
}

// ---- boats on their rounds ----

function boats(ctx) {
  const rounds = [
    // A tour boat loops the pier and the breakwater; a police launch circles Arkham.
    { type: 'tour_boat', cx: 520, cz: -520, rx: 170, rz: 60, period: 210, lamp: PALETTE.window },
    { type: 'police_launch', cx: 650, cz: -80, rx: 150, rz: 125, period: 140, lamp: PALETTE.crimson },
    { type: 'speedboat', cx: 700, cz: -330, rx: 90, rz: 110, period: 55, lamp: PALETTE.windowCool },
  ];
  for (const r of rounds) {
    let boat;
    try { boat = createBoat(r.type); } catch { continue; }
    const g = boat.group;
    g.userData.dynamic = true;
    g.traverse((o) => { o.castShadow = false; });
    g.position.set(r.cx + r.rx, LAKE_LEVEL, r.cz);
    ctx.scene.add(g);
    const halo = ctx.halos.add(g.position.x, 2, g.position.z, r.lamp, 2.5);
    const span = { minX: r.cx - r.rx - 10, minY: -2, minZ: r.cz - r.rz - 10, maxX: r.cx + r.rx + 10, maxY: 8, maxZ: r.cz + r.rz + 10 };
    ctx.chunks.addDetail(g, span, 'lod');
    let last = 0;
    ctx.updaters.push((t) => {
      const a = (t / r.period) * Math.PI * 2;
      const x = r.cx + Math.cos(a) * r.rx, z = r.cz + Math.sin(a) * r.rz;
      g.position.set(x, LAKE_LEVEL + Math.sin(t * 1.3) * 0.05, z);
      g.rotation.y = Math.atan2(-Math.sin(a) * r.rx, Math.cos(a) * r.rz);
      ctx.halos.set(halo, x, 2.6, z, 2.5);
      if (g.visible) boat.update(Math.max(0, Math.min(0.1, t - last)));
      last = t;
    });
  }
}
