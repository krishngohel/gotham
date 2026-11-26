// Bristol (Long Night 2, workstream H): the wooded hills north-west of the city, the one place in
// Gotham that is not dense. Terrain that really rises (bristolLayout.js), winding lanes with dry
// stone walls, instanced autumn woods, a village street (church, pub, garage), two walled
// estates, a cemetery with the Wayne family plot, an overlook back over the whole city, and
// Wayne Manor on the highest ground (wayneManor.js) above a cliff, a lake and a waterfall with
// the cave mouth behind it. Built on its own rng (seed 112); see docs/design/world-framework.md.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { LAYER_FX } from '../../render/layers.js';
import { box, cylinder } from '../buckets.js';
import { solid, glow, lightSpot } from '../cityBuilder.js';
import { addLadder, addZipline } from '../climbables.js';
import { addGargoyle } from '../gargoyles.js';
import { chunkOf, CHUNK_SIZE } from '../chunks.js';
import { billboardTexture } from '../textures.js';
import { parkedFleetCar, ROOMY_TYPES } from '../parkedCars.js';
import { BRISTOL, ROCK_SLOPE, STREAM, FOOTPATHS, bristolGrid, bristolHeight, bristolRoads, distToPolyline, roundAndDensify } from './bristolLayout.js';
import { block, house, stoneWall, gatePiers, lampPost, lantern, roadRibbon, boulder, STONE, DARK_STONE, IRON, LIME, SLATE } from './hillBuild.js';
import { buildWayneManor } from './wayneManor.js';

const ground = bristolHeight;

export function buildBristol(ctx) {
  const roads = bristolRoads();
  const keepOut = []; // rects { minX, maxX, minZ, maxZ } where no tree grows
  const rockCells = terrain(ctx);
  roadsAndWalls(ctx, roads);
  lakeAndFalls(ctx);
  buildWayneManor(ctx, keepOut);
  village(ctx, keepOut);
  estates(ctx, keepOut);
  cemetery(ctx, keepOut);
  overlook(ctx, keepOut);
  woods(ctx, roads, keepOut, rockCells);
}

// ---------------------------------------------------------------- the ground

// The terrain mesh (the collision floor's own vertices), net boxes under the hills, and rock where
// the ground is steeper than anyone can walk.
function terrain(ctx) {
  const { H, NX, NZ, step, minX, minZ } = bristolGrid();
  const at = (i, j) => H[j * (NX + 1) + i];
  const col = new THREE.Color(), tmp = new THREE.Color();
  const GRASS = new THREE.Color(0x3b4630), LITTER = new THREE.Color(0x5c4630), LAWN = new THREE.Color(0x4b5c34), EARTH = new THREE.Color(0x4e4236), MUD = new THREE.Color(0x35322a);
  const vcol = (i, j) => {
    const x = minX + i * step, z = minZ + j * step, h = at(i, j);
    const sl = Math.max(Math.abs(at(Math.min(NX, i + 1), j) - at(Math.max(0, i - 1), j)), Math.abs(at(i, Math.min(NZ, j + 1)) - at(i, Math.max(0, j - 1)))) / (2 * step);
    const n = Math.sin(x * 0.071 + Math.sin(z * 0.043) * 2) * 0.5 + Math.sin(z * 0.09 + x * 0.02) * 0.5;
    col.copy(GRASS).lerp(LITTER, Math.max(0, Math.min(1, 0.45 + n * 0.5)));
    if (x > -480 && x < -270 && z < -702 && h > 15) col.lerp(LAWN, 0.65); // the Manor's lawns
    col.lerp(EARTH, Math.min(1, Math.max(0, (sl - 0.22) * 3)));
    if (h < 0.35) col.lerp(MUD, 0.7);
    col.multiplyScalar(0.92 + ((i * 7 + j * 13) % 5) * 0.03);
    return col;
  };
  // Tiles of 30 x 30 cells, so each sits in its chunk.
  const T = 30;
  for (let tj = 0; tj < NZ; tj += T) for (let ti = 0; ti < NX; ti += T) {
    const i1 = Math.min(NX, ti + T), j1 = Math.min(NZ, tj + T);
    const w = i1 - ti + 1;
    const pos = [], colors = [], idx = [];
    for (let j = tj; j <= j1; j++) for (let i = ti; i <= i1; i++) {
      pos.push(minX + i * step, at(i, j), minZ + j * step);
      const c = vcol(i, j);
      colors.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < j1 - tj; j++) for (let i = 0; i < i1 - ti; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      idx.push(a, c, b, b, c, d); // the floor's own split (bristolHeight)
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    ctx.buckets.add('turf', g);
  }
  tmp.set(0);
  // Net boxes 6 m square under the hills, top at the lowest ground in the square: a fast fall
  // that overshoots the floor in one frame lands on them and is lifted back onto the slope.
  for (let j = 0; j < NZ; j += 2) for (let i = 0; i < NX; i += 2) {
    let lo = Infinity;
    for (let q = 0; q <= 2; q++) for (let p = 0; p <= 2; p++) lo = Math.min(lo, at(Math.min(NX, i + p), Math.min(NZ, j + q)));
    if (lo < 0.8) continue;
    const x0 = minX + i * step, z0 = minZ + j * step;
    ctx.collision.addBox(x0, lo - 4, z0, x0 + 2 * step, lo - 0.05, z0 + 2 * step, 'prop');
  }
  // Rock on every cell too steep to walk (the cliff, the lake bowl's sides, a few road cuts).
  const stream = roundAndDensify(STREAM, 2);
  const c = BRISTOL.cave;
  const cells = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const a = at(i, j), b = at(i + 1, j), cc = at(i, j + 1), d = at(i + 1, j + 1);
    const slope = Math.max(Math.abs(a - b), Math.abs(cc - d), Math.abs(a - cc), Math.abs(b - d)) / step;
    if (slope < ROCK_SLOPE) continue;
    const x0 = minX + i * step, z0 = minZ + j * step, xm = x0 + step / 2, zm = z0 + step / 2;
    if (Math.abs(xm - c.x) < c.w / 2 + 1.6 && zm > c.z - c.depth - 1 && zm < c.z + 3.5) continue; // the cave mouth is built by hand
    if (distToPolyline(stream, xm, zm) < 3) continue;
    const hi = Math.max(a, b, cc, d), lo = Math.min(a, b, cc, d);
    cells.push({ i, j, x0, z0, hi, lo });
  }
  // Merge runs along x of similar height into one box each.
  cells.sort((p, q) => p.j - q.j || p.i - q.i);
  for (let k = 0; k < cells.length;) {
    const s = cells[k];
    let e = k, hi = s.hi, lo = s.lo;
    while (e + 1 < cells.length && cells[e + 1].j === s.j && cells[e + 1].i === cells[e].i + 1 && Math.abs(cells[e + 1].hi - hi) < 1.2 && e - k < 4) { e++; hi = Math.max(hi, cells[e].hi); lo = Math.min(lo, cells[e].lo); }
    const x1 = cells[e].x0 + step;
    ctx.collision.addBox(s.x0 - 0.2, lo - 1.5, s.z0 - 0.2, x1 + 0.2, hi + 0.12, s.z0 + step + 0.2, 'prop');
    boulder(ctx, ctx.rng, s.x0 - 0.2, lo - 1.5, s.z0 - 0.2, x1 + 0.2, hi + 0.12, s.z0 + step + 0.2, ctx.rng.chance(0.3) ? 0x5a564e : DARK_STONE);
    k = e + 1;
  }
  return cells;
}

// ---------------------------------------------------------------- lanes

function roadsAndWalls(ctx, roads) {
  roads.forEach((r, k) => {
    roadRibbon(ctx, r.points, r.width, { key: r.kind === 'drive' ? 'yard' : 'asphalt', lift: 0.04 + k * 0.002 });
    if (r.kind === 'lane') centreDashes(ctx, r.points, 0.05 + k * 0.002);
  });
  // Dry-stone walls along the lanes (both sides of Bristol Road, the outer side of the climbing
  // lanes), broken at junctions, gateways and wherever another road comes close.
  const junctions = roads.flatMap((r) => [r.nodes[0], r.nodes[r.nodes.length - 1]]);
  const paths = FOOTPATHS.map((f) => ({ x: f.pts[0][0], z: f.pts[0][1] }));
  const otherRoad = (r, x, z) => roads.some((q) => q !== r && distToPolyline(q.points, x, z) < q.width / 2 + 2.5);
  const lined = { bristolRoadW: [1, -1], bristolRoadM: [1, -1], bristolRoadE: [1, -1], bristolRoadF: [1, -1], ridgeRoadE: [1], ridgeRoadW: [1, -1], cemeteryLane: [1, -1], churchLane: [-1], manorDrive: [] };
  for (const r of roads) {
    const sides = lined[r.id];
    if (!sides) continue;
    for (const side of sides) {
      const off = r.width / 2 + 1.7;
      let run = [];
      const flush = () => {
        if (run.length >= 2) for (let q = 0; q + 1 < run.length; q++) stoneWall(ctx, ground, run[q].x, run[q].z, run[q + 1].x, run[q + 1].z);
        run = [];
      };
      for (let i = 0; i < r.points.length; i += 2) {
        const p = r.points[i], a = r.points[Math.max(0, i - 1)], b = r.points[Math.min(r.points.length - 1, i + 1)];
        const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
        const x = p.x - (dz / L) * off * side, z = p.z + (dx / L) * off * side;
        const ok = !junctions.some((j) => Math.hypot(j.x - p.x, j.z - p.z) < 16) && !otherRoad(r, x, z)
          && !paths.some((q) => Math.hypot(q.x - x, q.z - z) < 7)
          && Math.sin(p.s * 0.045 + side * 2 + r.width) > -0.55 && distToPolyline(STREAM_PTS, x, z) > 4
          && z < BRISTOL.maxZ - 3 && x < BRISTOL.maxX - 3;
        if (ok) run.push({ x, z }); else flush();
      }
      flush();
    }
  }
  // The stone bridge where Bristol Road crosses the stream: parapets either side.
  const br = roads.find((r) => r.id === 'bristolRoadW');
  const near = br.points.filter((p) => distToPolyline(STREAM_PTS, p.x, p.z) < 6);
  if (near.length >= 2) {
    const a = near[0], b = near[near.length - 1];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
    for (const s of [-1, 1]) {
      const ox = -(dz / L) * (br.width / 2 + 0.4) * s, oz = (dx / L) * (br.width / 2 + 0.4) * s;
      stoneWall(ctx, ground, a.x + ox - (dx / L) * 2, a.z + oz - (dz / L) * 2, b.x + ox + (dx / L) * 2, b.z + oz + (dz / L) * 2, { h: 0.9, color: LIME });
    }
  }
  // A road sign at each way in.
  sign(ctx, 'BRISTOL', 'PLEASE DRIVE SLOWLY. OUR BUTLERS ARE OLD.', 0x3a5a3a, -205, ground(-205, -606) + 2.2, -606, 0, 4.2);
  sign(ctx, 'BRISTOL', 'TWINNED WITH NOWHERE YOU CAN AFFORD', 0x3a5a3a, -47, ground(-47, -722) + 2.2, -722, Math.PI / 2, 4.2);
  for (const [x, z] of [[-205, -606], [-47, -722]]) for (const s of [-1.9, 1.9]) {
    const px = x + (z === -606 ? s : 0), pz = z + (z === -606 ? 0 : s);
    ctx.buckets.add('painted', cylinder(0.06, 0.06, 2.6, px, ground(px, pz) + 1.3, pz, 6), IRON);
  }
}
const STREAM_PTS = roundAndDensify(STREAM, 2);

function centreDashes(ctx, pts, lift) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    acc += Math.hypot(b.x - a.x, b.z - a.z);
    if (acc % 9 > 3) continue;
    const g = new THREE.PlaneGeometry(0.2, Math.hypot(b.x - a.x, b.z - a.z)).rotateX(-Math.PI / 2);
    g.rotateY(Math.atan2(b.x - a.x, b.z - a.z) + Math.PI);
    ctx.buckets.add('lane', g.translate((a.x + b.x) / 2, (a.y + b.y) / 2 + lift, (a.z + b.z) / 2));
  }
}

// A painted sign on two posts (an unlit-looking board read from the road).
const signMats = new Map();
function sign(ctx, text, sub, bg, x, y, z, yaw, w = 4) {
  let mat = signMats.get(text + sub);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ map: billboardTexture(text, sub, bg), transparent: true, depthWrite: true });
    signMats.set(text + sub, mat);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.39), mat);
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  ctx.scene.add(m);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.39), mat);
  back.position.set(x - Math.sin(yaw) * 0.02, y, z - Math.cos(yaw) * 0.02);
  back.rotation.y = yaw + Math.PI;
  ctx.scene.add(back);
}

// ---------------------------------------------------------------- lake, waterfall, cave mouth

function lakeAndFalls(ctx) {
  const c = BRISTOL.cave, L = BRISTOL.lake;
  // The cave mouth: a slot into the cliff's foot, rock walls and roof, a black depth at the back.
  const x0 = c.x - c.w / 2, x1 = c.x + c.w / 2, zBack = c.z - c.depth, zFront = c.z + 1;
  for (const [a, b] of [[x0 - 2.4, x0], [x1, x1 + 2.4]]) {
    ctx.collision.addBox(a, -1, zBack - 1, b, BRISTOL.plateau + 0.12, zFront + 1.5, 'prop');
    boulder(ctx, ctx.rng, a, -1, zBack - 1, b, BRISTOL.plateau + 0.12, zFront + 1.5, DARK_STONE);
  }
  ctx.collision.addBox(x0, -1, zBack - 2, x1, BRISTOL.plateau + 0.12, zBack, 'prop');
  ctx.buckets.add('painted', box(c.w, 6, 0.2, c.x, 3, zBack + 0.15), 0x050608);
  ctx.collision.addBox(x0, 5.2, zBack, x1, BRISTOL.plateau + 0.12, zFront, 'prop');
  boulder(ctx, ctx.rng, x0 - 0.5, 5.2, zBack - 0.5, x1 + 0.5, BRISTOL.plateau + 0.12, zFront + 0.6, DARK_STONE);
  ctx.buckets.add('painted', box(c.w - 0.2, 0.1, c.depth, c.x, 5.15, (zBack + zFront) / 2), 0x08090b);
  block(ctx, x0, -1, zBack, x1, 0.3, zFront + 2.5, 0x2c2a26, { tag: 'prop' }); // the ledge floor
  for (const s of [-1, 1]) ctx.buckets.add('painted', box(0.1, 5.2, c.depth, c.x + s * (c.w / 2 - 0.05), 2.6, (zBack + zFront) / 2), 0x0d0e10);
  // The waterfall: a sheet off the cliff top in front of the mouth, falling into the lake.
  const fallMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){ float s = fract(vUv.y * 6.0 + uTime * 1.6 + sin(vUv.x * 23.0) * 0.15); float streak = smoothstep(0.55, 0.95, fract(vUv.x * 9.0 + sin(vUv.y * 4.0) * 0.3));
        float a = (0.28 + 0.4 * smoothstep(0.6, 1.0, s) * streak) * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        gl_FragColor = vec4(vec3(0.75, 0.85, 0.95) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const top = BRISTOL.plateau;
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(c.w + 1.5, top + 0.3, 1, 8).translate(0, (top + 0.3) / 2 - 0.3, 0), fallMat);
  fall.position.set(c.x, 0, zFront + 1.3);
  fall.layers.set(LAYER_FX);
  fall.userData.dynamic = true;
  ctx.scene.add(fall);
  ctx.chunks.addDetail(fall, { minX: x0 - 1, minY: 0, minZ: zFront, maxX: x1 + 1, maxY: top, maxZ: zFront + 2 });
  ctx.updaters.push((t) => { fallMat.uniforms.uTime.value = t; });
  for (let k = 0; k < 4; k++) ctx.halos.add(c.x - 2.4 + k * 1.6, 0.6, zFront + 1.8, 0xcfe0ff, 3.4);
  ctx.steam.push({ x: c.x, y: 0.2, z: zFront + 2.2, s: 1.6 }, { x: c.x - 2, y: 0.2, z: zFront + 2.4, s: 1.3 });
  // A rock spring at the top where the water leaves the plateau.
  boulder(ctx, ctx.rng, c.x - 4, top - 0.4, -704, c.x + 4, top + 0.8, -700.5, 0x5a564e);
  // The north bank of the Narrows' north cut and the head of the North Branch (both end against
  // Bristol at z -600): a stone face down to the water, a railing, a gap where the riverside
  // drive's bridge lands, and the stream's weir pouring into the cut.
  for (const [a, b] of [[-450, -318], [-302, -266]]) {
    block(ctx, a, -7, BRISTOL.maxZ - 3, b, 0.05, BRISTOL.maxZ, 0x5a5650, { tag: 'quay' });
    ctx.collision.addBox(a, 0, BRISTOL.maxZ - 1.2, b, 1.1, BRISTOL.maxZ - 0.9, 'railing');
    for (let x = a; x <= b; x += 2.4) ctx.buckets.add('painted', box(0.07, 1.1, 0.07, x, 0.55, BRISTOL.maxZ - 1.05), IRON);
    ctx.buckets.add('painted', box(b - a, 0.08, 0.1, (a + b) / 2, 1.1, BRISTOL.maxZ - 1.05), IRON);
  }
  const weir = new THREE.Mesh(new THREE.PlaneGeometry(4, 6, 1, 4).translate(0, -3, 0), fallMat);
  weir.position.set(-440, 0, BRISTOL.maxZ + 0.1);
  weir.layers.set(LAYER_FX);
  ctx.scene.add(weir);
  // Reeds and a few stepping stones at the lake's south shore.
  for (let k = 0; k < 18; k++) {
    const a = ctx.rng.range(0.2, Math.PI - 0.2);
    const x = L.x + Math.cos(a) * L.rx * 0.98, z = L.z + Math.sin(a) * L.rz * 1.02;
    for (let q = 0; q < 4; q++) ctx.buckets.add('painted', new THREE.ConeGeometry(0.05, ctx.rng.range(0.8, 1.6), 3).translate(x + ctx.rng.range(-0.6, 0.6), 0.4, z + ctx.rng.range(-0.4, 0.4)), 0x4a5a2e);
  }
}

// ---------------------------------------------------------------- the village

function village(ctx, keepOut) {
  const B = BRISTOL;
  keepOut.push({ minX: -180, maxX: -48, minZ: -702, maxZ: -650 });
  // St. Swithin-in-the-Hills: nave, west tower with a spire, lit windows, a churchyard wall.
  const ch = B.church;
  const y = house(ctx, ground, { x: ch.x + 3, z: ch.z, w: 22, d: 10, h: 8, style: 'stone', ridge: 'x', rise: 6, door: 's', id: 'church' });
  const tx = ch.x - 11, tz = ch.z, tw = 6, th = 22;
  block(ctx, tx - tw / 2, y - 1, tz - tw / 2, tx + tw / 2, y + th, tz + tw / 2, STONE, { tag: 'building' });
  ctx.facades.push({ minX: tx - tw / 2, minY: y, minZ: tz - tw / 2, maxX: tx + tw / 2, maxY: y + th, maxZ: tz + tw / 2, style: 'stone' });
  for (const yy of [y + 6, y + 13]) ctx.buckets.add('painted', box(tw + 0.4, 0.35, tw + 0.4, tx, yy, tz), LIME);
  // Belfry openings, lit from inside, and the spire with a weathervane.
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.buckets.add('painted', box(Math.abs(nz) ? 1.6 : 0.1, 2.6, Math.abs(nx) ? 1.6 : 0.1, tx + nx * (tw / 2 + 0.03), y + th - 3, tz + nz * (tw / 2 + 0.03)), 0x101114);
    glow(ctx, box(Math.abs(nz) ? 0.9 : 0.08, 1.8, Math.abs(nx) ? 0.9 : 0.08, tx + nx * (tw / 2 + 0.06), y + 4, tz + nz * (tw / 2 + 0.06)), 0xc8a050);
  }
  solid(ctx, 'painted', new THREE.ConeGeometry(tw * 0.62, 11, 4).rotateY(Math.PI / 4).translate(tx, y + th + 5.5, tz), { color: SLATE, tag: 'roof' });
  ctx.buckets.add('painted', cylinder(0.05, 0.05, 2, tx, y + th + 12, tz, 6), IRON);
  ctx.buckets.add('painted', box(1.2, 0.05, 0.05, tx, y + th + 12.6, tz), IRON);
  ctx.halos.add(tx, y + th - 3, tz, 0xc8a050, 4);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    addGargoyle(ctx, tx + sx * (tw / 2 - 0.4), y + th, tz + sz * (tw / 2 - 0.4), Math.atan2(sx, sz));
  }
  ctx.grapple.push({ x: tx, y: y + th, z: tz + tw / 2, nx: 0, nz: 1 });
  // A maintenance ladder up the tower's east face, from the nave roof to the belfry ledge.
  addLadder(ctx.climbables, { x: tx + tw / 2 + 0.3, z: tz - 1.5, nx: 1, nz: 0, bottom: y, top: y + th });
  for (let k = y + 0.3; k < y + th; k += 0.3) ctx.buckets.add('painted', box(0.04, 0.04, 0.5, tx + tw / 2 + 0.3, k, tz - 1.5), IRON);
  for (const s of [-0.25, 0.25]) ctx.buckets.add('painted', box(0.05, th, 0.05, tx + tw / 2 + 0.3, y + th / 2, tz - 1.5 + s), IRON);
  for (let k = 0; k < 4; k++) glow(ctx, box(1.0, 2.4, 0.08, ch.x - 4 + k * 4.5, y + 4, ch.z + 5.06), 0xb07a3a);
  lightSpot(ctx, ch.x, y + 3, ch.z + 7, PALETTE.window, 18, 12);
  sign(ctx, 'ST. SWITHIN', 'BATS IN THE BELFRY? WE DO NOT ASK QUESTIONS.', 0x2e3a55, ch.x + 9, ground(ch.x + 9, ch.z + 8) + 1.6, ch.z + 8.5, 0, 3);
  // Graves in the churchyard behind.
  for (let k = 0; k < 14; k++) headstone(ctx, ch.x - 6 + (k % 7) * 3, ch.z - 9 - Math.floor(k / 7) * 2.6);
  // The Gargoyle's Rest.
  const pub = B.pub;
  const py = house(ctx, ground, { x: pub.x, z: pub.z, w: 16, d: 10, h: 7, style: 'brick', ridge: 'x', rise: 4.5, door: 's', chimneys: [[-5, 0], [5, 0]], id: 'pub' });
  sign(ctx, "THE GARGOYLE'S REST", 'ALES, PIES, NO CAPES AFTER TEN', 0x5a2a20, pub.x - 4, py + 4.6, pub.z + 5.3, 0, 4.6);
  lantern(ctx, pub.x + 2, py + 3.2, pub.z + 5.4, PALETTE.window, 2.4);
  lightSpot(ctx, pub.x, py + 3, pub.z + 7, PALETTE.window, 18, 12);
  // Cottages and the shop.
  house(ctx, ground, { x: -101, z: -689, w: 10, d: 8, h: 6, style: 'stone', door: 's', chimneys: [[3, 0]] });
  house(ctx, ground, { x: -84, z: -692, w: 9, d: 8, h: 5.5, style: 'brick', door: 's', chimneys: [[-2.5, 0]] });
  house(ctx, ground, { x: -140, z: -658, w: 12, d: 9, h: 7, style: 'brick', door: 'n', ridge: 'x' });
  sign(ctx, 'POST & PROVISIONS', 'STAMPS, STRING, SECRETS KEPT', 0x2f4a3a, -140, ground(-140, -662.6) + 4.3, -662.7, Math.PI, 3.4);
  house(ctx, ground, { x: -122, z: -657, w: 9, d: 8, h: 5.5, style: 'stone', door: 'n', chimneys: [[2, 0]] });
  house(ctx, ground, { x: -158, z: -657, w: 9, d: 8, h: 5.5, style: 'stone', door: 'n' });
  // Bristol Motors: workshop, a canopy over two pumps facing the street.
  const gar = B.garage;
  const gy = house(ctx, ground, { x: gar.x, z: gar.z, w: 14, d: 10, h: 5.5, style: 'warehouse', roof: 'flat', id: 'garage' });
  ctx.buckets.add('painted', box(6, 4, 0.1, gar.x - 2, gy + 2, gar.z - 5.06), 0x2a2d33);
  const cy = ground(gar.x, gar.z - 9) + 4.2;
  block(ctx, gar.x - 7, cy, gar.z - 13, gar.x + 3, cy + 0.4, gar.z - 6, 0xb8302a, { tag: 'roof' });
  glow(ctx, box(9.6, 0.08, 6.6, gar.x - 2, cy - 0.04, gar.z - 9.5), 0xd8e4ee);
  ctx.halos.add(gar.x - 2, cy - 0.3, gar.z - 9.5, PALETTE.windowCool, 5);
  edgeGrapplesAt(ctx, gar.x - 2, gar.z - 9.5, 10, 7, cy + 0.4);
  for (const s of [-5, 1]) {
    const px = gar.x + s, pz = gar.z - 10, pgy = ground(px, pz);
    solid(ctx, 'painted', box(0.7, 1.7, 0.5, px, pgy + 0.85, pz), { color: 0xd8c27a, tag: 'prop' });
    glow(ctx, box(0.5, 0.3, 0.52, px, pgy + 1.4, pz), 0xe8e0c0);
    ctx.buckets.add('painted', cylinder(0.05, 0.05, cy - pgy, px + 0.5, pgy + (cy - pgy) / 2, pz, 5), IRON);
  }
  lightSpot(ctx, gar.x - 2, cy - 0.6, gar.z - 9.5, PALETTE.windowCool, 22, 14);
  sign(ctx, 'BRISTOL MOTORS', "FILL 'ER UP AND HOPE FOR THE BEST", 0x8f2027, gar.x, gy + 6.6, gar.z + 5.2, 0, 4.4);
  sign(ctx, 'BRISTOL MOTORS', "FILL 'ER UP AND HOPE FOR THE BEST", 0x8f2027, gar.x, gy + 6.6, gar.z - 5.2, Math.PI, 4.4);
  // The village green: a war memorial (a perch) and benches.
  const mx = -108, mz = -661, my = ground(mx, mz);
  block(ctx, mx - 1.4, my - 0.3, mz - 1.4, mx + 1.4, my + 0.6, mz + 1.4, LIME, { tag: 'plinth' });
  solid(ctx, 'painted', box(0.9, 4.5, 0.9, mx, my + 2.85, mz), { color: STONE, tag: 'plinth' });
  ctx.buckets.add('painted', new THREE.ConeGeometry(0.55, 1.2, 4).rotateY(Math.PI / 4).translate(mx, my + 5.7, mz), STONE);
  ctx.grapple.push({ x: mx, y: my + 5.1, z: mz, nx: 0, nz: -1, perch: true });
  // Street lamps along the village street, alternating sides.
  const vs = bristolRoads().filter((r) => r.id === 'villageW' || r.id === 'villageE');
  let side = 1;
  for (const r of vs) {
    for (let i = 3; i < r.points.length - 2; i += 7) {
      const p = r.points[i], q = r.points[i + 1];
      const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1;
      const off = r.width / 2 + 2.2;
      lampPost(ctx, ground, p.x - (dz / L) * off * side, p.z + (dx / L) * off * side, { spot: i % 14 === 3 });
      side = -side;
    }
  }
  // Parked along the street's south kerb, and outside the pub.
  for (const x of [-150, -131, -116]) parkOn(ctx, x, -666.5, true);
  for (const x of [-115, -108]) parkOn(ctx, x, -697, false);
  // The zip line from the church tower to the garage roof.
  addZipline(ctx.climbables, { x: tx + 1, y: y + th - 1, z: tz + 3.2 }, { x: gar.x - 6, y: gy + 5.5 + 0.9, z: gar.z - 4 });
}

function edgeGrapplesAt(ctx, x, z, w, d, y) {
  for (let t = -w / 2 + 2; t < w / 2; t += 4) { ctx.grapple.push({ x: x + t, y, z: z - d / 2, nx: 0, nz: -1 }); ctx.grapple.push({ x: x + t, y, z: z + d / 2, nx: 0, nz: 1 }); }
}

function parkOn(ctx, x, z, alongX, types = ROOMY_TYPES) {
  const y = ground(x, z);
  parkedFleetCar(ctx, x, z, alongX, null, { y, types });
  const sx = alongX ? 4.4 : 1.9, sz = alongX ? 1.9 : 4.4;
  ctx.collision.addBox(x - sx / 2, y + 0.3, z - sz / 2, x + sx / 2, y + 1.1, z + sz / 2, 'car');
}

function headstone(ctx, x, z, { cross = false } = {}) {
  const y = ground(x, z);
  const lean = ctx.rng.range(-0.12, 0.12);
  if (cross || ctx.rng.chance(0.2)) {
    ctx.buckets.add('painted', box(0.16, 1.2, 0.16, 0, 0.6, 0).rotateZ(lean).translate(x, y, z), LIME);
    ctx.buckets.add('painted', box(0.7, 0.14, 0.16, 0, 0.85, 0).rotateZ(lean).translate(x, y, z), LIME);
  } else {
    const h = ctx.rng.range(0.7, 1.1);
    ctx.buckets.add('painted', box(0.65, h, 0.16, 0, h / 2, 0).rotateX(lean).translate(x, y - 0.05, z), ctx.rng.chance(0.5) ? 0x8a857a : 0x6e6a62);
  }
}

// ---------------------------------------------------------------- estates

function estates(ctx, keepOut) {
  for (const e of BRISTOL.estates) {
    const { x, z, w, d } = e;
    keepOut.push({ minX: x - w / 2 + 3, maxX: x + w / 2 - 3, minZ: z - d / 2 + 3, maxZ: z + d / 2 - 3 });
    const gx = x, gz = z + d / 2;
    const gap = [[gx, gz, 3.4]];
    stoneWall(ctx, ground, x - w / 2, z - d / 2, x + w / 2, z - d / 2, { h: 1.6, color: LIME });
    stoneWall(ctx, ground, x - w / 2, z + d / 2, x + w / 2, z + d / 2, { h: 1.6, color: LIME, gaps: gap });
    stoneWall(ctx, ground, x - w / 2, z - d / 2, x - w / 2, z + d / 2, { h: 1.6, color: LIME });
    stoneWall(ctx, ground, x + w / 2, z - d / 2, x + w / 2, z + d / 2, { h: 1.6, color: LIME });
    gatePiers(ctx, ground, gx, gz, 4.6, true, { h: 2.8 });
    const hy = house(ctx, ground, { x, z: z - 3, w: 20, d: 11, h: 8.5, style: e.id === 'kestrel' ? 'brick' : 'stone', ridge: 'x', rise: 5, door: 's', chimneys: [[-7, 0], [7, 0]], id: e.id });
    // A porch and a gravel sweep, a parked car, lit lanterns at the gate.
    block(ctx, x - 2.2, hy, z + 2.5, x + 2.2, hy + 0.25, z + 4.4, LIME, { tag: 'prop' });
    for (const s of [-1, 1]) lantern(ctx, gx + s * 3.2, ground(gx + s * 3.2, gz) + 3.2, gz, PALETTE.window, 2.2);
    parkOn(ctx, x + 6, z + 7, true, ['limousine', 'sedan_deco', 'suv', 'wagon']);
    lightSpot(ctx, gx, ground(gx, gz) + 3, gz, PALETTE.window, 16, 12);
    // A gatehouse lodge at Kestrel Hall.
    if (e.id === 'kestrel') house(ctx, ground, { x: gx + 7.5, z: gz + 3.5, w: 6, d: 5, h: 4, style: 'brick', door: 'w', chimneys: [[1.5, 0]], id: 'kestrelLodge' });
  }
}

// ---------------------------------------------------------------- the cemetery

function cemetery(ctx, keepOut) {
  const c = BRISTOL.cemetery;
  const x0 = c.x - c.w / 2, x1 = c.x + c.w / 2, z0 = c.z - c.d / 2, z1 = c.z + c.d / 2;
  keepOut.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
  const gateZ = -737;
  stoneWall(ctx, ground, x0, z0, x1, z0, { h: 1.2 });
  stoneWall(ctx, ground, x0, z1, x1, z1, { h: 1.2 });
  stoneWall(ctx, ground, x0, z0, x0, z1, { h: 1.2 });
  stoneWall(ctx, ground, x1, z0, x1, z1, { h: 1.2, gaps: [[x1, gateZ, 3]] });
  gatePiers(ctx, ground, x1, gateZ, 4, false, { h: 3 });
  // Iron gates standing open, and a lantern.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 9; k++) ctx.buckets.add('painted', box(0.04, 2.2, 0.04, x1 - 0.2 - k * 0.2, ground(x1, gateZ) + 1.1, gateZ + s * 2), IRON);
  }
  lampPost(ctx, ground, x1 + 2.5, gateZ + 3.2);
  // Rows of headstones, two mausoleums, a yew.
  for (let zz = z0 + 4; zz < z1 - 3; zz += 3.2) {
    for (let xx = x0 + 4; xx < x1 - 4; xx += 2.4) {
      if (Math.abs(zz - gateZ) < 2.5) continue; // the central path
      if (Math.hypot(xx - BRISTOL.familyPlot.x, zz - BRISTOL.familyPlot.z) < 6) continue;
      if (xx > -528 && xx < -518 && zz > -766 && zz < -752) continue;
      if (ctx.rng.chance(0.78)) headstone(ctx, xx + ctx.rng.range(-0.3, 0.3), zz);
    }
  }
  for (const [mx, mz] of [[-523, -759], [-523, -745 + 9]]) {
    const my = house(ctx, ground, { x: mx, z: mz, w: 5, d: 6, h: 3.6, style: 'stone', ridge: 'z', rise: 2, id: `mausoleum${mz}` });
    ctx.buckets.add('painted', box(0.1, 2.4, 1.6, mx + 2.55, my + 1.2, mz), 0x1a1c20);
    for (const s of [-1, 1]) ctx.buckets.add('painted', cylinder(0.22, 0.22, 3.4, mx + 2.9, my + 1.7, mz + s * 1.3, 8), LIME);
  }
  // The Wayne family plot: two headstones under a stone angel, a low iron railing, a yew.
  const f = BRISTOL.familyPlot, fy = ground(f.x, f.z);
  block(ctx, f.x - 3, fy - 0.3, f.z - 2, f.x + 3, fy + 0.12, f.z + 2, 0x6e6a62, { tag: 'prop' });
  for (const s of [-1, 1]) {
    ctx.buckets.add('painted', box(1.0, 1.25, 0.22, f.x + s * 1.1, fy + 0.75, f.z - 0.9), 0x9a958a);
    ctx.buckets.add('painted', new THREE.CylinderGeometry(0.5, 0.5, 0.22, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(f.x + s * 1.1, fy + 1.38, f.z - 0.9), 0x9a958a);
    // A rose on each grave.
    ctx.buckets.add('painted', box(0.3, 0.05, 0.08, f.x + s * 1.1, fy + 0.16, f.z + 0.4), 0x8f2027);
  }
  for (const [ax, az, bx, bz] of [[-3.4, -2.4, 3.4, -2.4], [-3.4, 2.4, 3.4, 2.4], [-3.4, -2.4, -3.4, 2.4], [3.4, -2.4, 3.4, 2.4]]) {
    const L = Math.hypot(bx - ax, bz - az);
    for (let k = 0; k <= L / 0.3; k++) { const t = k / (L / 0.3); ctx.buckets.add('painted', box(0.04, 0.8, 0.04, f.x + ax + (bx - ax) * t, fy + 0.5, f.z + az + (bz - az) * t), IRON); }
    ctx.buckets.add('painted', box(Math.abs(bx - ax) + 0.05, 0.05, Math.abs(bz - az) + 0.05, f.x + (ax + bx) / 2, fy + 0.9, f.z + (az + bz) / 2), IRON);
  }
  const ay = fy + 0.12;
  solid(ctx, 'painted', box(1.2, 1.4, 1.2, f.x, ay + 0.7, f.z - 2.6), { color: STONE, tag: 'plinth' });
  ctx.buckets.add('painted', cylinder(0.25, 0.42, 1.7, f.x, ay + 2.25, f.z - 2.6, 8), 0xb0aba0);
  ctx.buckets.add('painted', new THREE.SphereGeometry(0.22, 8, 6).translate(f.x, ay + 3.3, f.z - 2.6), 0xb0aba0);
  for (const s of [-1, 1]) ctx.buckets.add('painted', box(0.08, 1.3, 0.7, 0, 0, 0).rotateZ(s * 0.5).translate(f.x + s * 0.55, ay + 2.7, f.z - 2.8), 0xb0aba0);
  ctx.grapple.push({ x: f.x, y: ay + 1.4, z: f.z - 2.6, nx: 0, nz: 1, perch: true });
  yew(ctx, f.x - 5, f.z + 2);
  yew(ctx, x0 + 5, z1 - 5);
}

function yew(ctx, x, z) {
  const y = ground(x, z);
  solid(ctx, 'painted', cylinder(0.3, 0.45, 2.2, x, y + 1.1, z, 6), { color: 0x2a2018, tag: 'tree' });
  ctx.buckets.add('painted', new THREE.IcosahedronGeometry(2.6, 0).scale(1, 1.3, 1).translate(x, y + 4.2, z), 0x1f2a1e);
}

// ---------------------------------------------------------------- the overlook

function overlook(ctx, keepOut) {
  const o = BRISTOL.overlook;
  const x = o.x, z = o.z - 1, y = ground(x, z);
  keepOut.push({ minX: x - 12, maxX: x + 70, minZ: z - 4, maxZ: z + 70 }); // the view to the south-east stays open
  block(ctx, x - 9, y - 1.2, z - 5, x + 9, y + 0.3, z + 5, 0x5e5a53, { tag: 'sidewalk' });
  // Balustrade on the city side (south and east), coin telescopes, benches, a lamp.
  for (const [ax, az, bx, bz] of [[-9, 5, 9, 5], [9, -5, 9, 5]]) {
    const minX = x + Math.min(ax, bx) - 0.25, maxX = x + Math.max(ax, bx) + 0.25, minZ = z + Math.min(az, bz) - 0.25, maxZ = z + Math.max(az, bz) + 0.25;
    ctx.buckets.add('painted', box(maxX - minX, 0.2, maxZ - minZ, (minX + maxX) / 2, y + 1.3, (minZ + maxZ) / 2), LIME);
    ctx.buckets.add('painted', box(maxX - minX, 0.18, maxZ - minZ, (minX + maxX) / 2, y + 0.45, (minZ + maxZ) / 2), LIME);
    const L = Math.hypot(bx - ax, bz - az);
    for (let k = 0; k <= L / 0.55; k++) { const t = k / (L / 0.55); ctx.buckets.add('painted', cylinder(0.08, 0.12, 0.7, x + ax + (bx - ax) * t, y + 0.9, z + az + (bz - az) * t, 6), LIME); }
    ctx.collision.addBox(minX, y + 0.3, minZ, maxX, y + 1.4, maxZ, 'balustrade');
    ctx.grapple.push({ x: (minX + maxX) / 2, y: y + 1.4, z: (minZ + maxZ) / 2, nx: ax === bx ? 1 : 0, nz: ax === bx ? 0 : 1, perch: true });
  }
  for (const s of [-4, 4]) {
    const tx = x + s, tz = z + 3.6;
    solid(ctx, 'painted', cylinder(0.1, 0.16, 1.2, tx, y + 0.9, tz, 6), { color: IRON, tag: 'prop' });
    ctx.buckets.add('painted', cylinder(0.14, 0.2, 0.9, 0, 0, 0, 8).rotateX(Math.PI / 2 - 0.3).rotateY(0.5).translate(tx, y + 1.65, tz), 0x2f5a3c);
  }
  lampPost(ctx, ground, x - 7, z - 3.2);
  sign(ctx, 'BRISTOL OVERLOOK', 'GOTHAM LOOKS BETTER FROM UP HERE', 0x2e3a55, x - 3, y + 1.9, z - 4.6, 0, 3.6);
}

// ---------------------------------------------------------------- the woods

// Instanced stylised trees, one InstancedMesh per 128 m chunk (a detail member, culled at the draw
// distance). One trunk-and-crown geometry; instance scale makes poplars and broad oaks of it, the
// instance colour the autumn. Trunks collide.
function woods(ctx, roads, keepOut, rockCells) {
  const rng = ctx.rng;
  const geo = treeGeometry();
  const B = BRISTOL, L = B.lake;
  const rock = new Set(rockCells.map((c) => `${c.i},${c.j}`));
  const per = new Map();
  const blocked = (x, z) => {
    if (z > B.maxZ - 7 || x > B.maxX - 9 || z < B.minZ + 2 || x < B.minX + 2) return true;
    if (keepOut.some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ)) return true;
    if (Math.hypot((x - L.x) / (L.rx + 4), (z - L.z) / (L.rz + 4)) < 1.05) return true;
    if (distToPolyline(STREAM_PTS, x, z) < 4) return true;
    const i = Math.floor((x - B.minX) / B.step), j = Math.floor((z - B.minZ) / B.step);
    if (rock.has(`${i},${j}`) || rock.has(`${i + 1},${j}`) || rock.has(`${i},${j + 1}`)) return true;
    for (const r of roads) if (distToPolyline(r.points, x, z) < r.width / 2 + 3.5) return true;
    return false;
  };
  const SP = 6.2;
  for (let z = B.minZ + 3; z < B.maxZ; z += SP) for (let x = B.minX + 3; x < B.maxX; x += SP) {
    const px = x + rng.range(-2.4, 2.4), pz = z + rng.range(-2.4, 2.4);
    const dense = Math.sin(px * 0.031 + Math.sin(pz * 0.02) * 2.5) + Math.sin(pz * 0.047 - px * 0.012);
    if (dense < -0.35 || rng.next() > 0.4 + dense * 0.35) continue;
    if (blocked(px, pz)) continue;
    const [cx, cz] = chunkOf(px, pz, CHUNK_SIZE);
    const key = `${cx},${cz}`;
    if (!per.has(key)) per.set(key, []);
    const poplar = rng.chance(0.28);
    const s = rng.range(0.85, 1.3);
    per.get(key).push({ x: px, y: ground(px, pz) - 0.2, z: pz, sx: (poplar ? 0.62 : 1) * s * rng.range(0.9, 1.15), sy: (poplar ? 1.35 : 1) * s, yaw: rng.range(0, Math.PI * 2), poplar });
  }
  const AUTUMN = [0x7a4a22, 0x8a5a26, 0x6a3c1e, 0x9a6a2a, 0x5a4a2a, 0x7a3020];
  const EVER = [0x2a3a26, 0x334430, 0x283426];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  for (const list of per.values()) {
    const mesh = new THREE.InstancedMesh(geo, ctx.materials.painted, list.length);
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    list.forEach((t, k) => {
      q.setFromAxisAngle(up, t.yaw);
      mesh.setMatrixAt(k, m.compose(p.set(t.x, t.y, t.z), q, sc.set(t.sx, t.sy, t.sx)));
      mesh.setColorAt(k, c.set(t.poplar ? rng.pick(EVER) : rng.pick(AUTUMN)));
      ctx.collision.addBox(t.x - 0.3, t.y, t.z - 0.3, t.x + 0.3, t.y + 3.2 * t.sy, t.z + 0.3, 'tree');
      // Every few tall trees carry a perch on the crown: grapple to a treetop, glide on.
      if (k % 3 === 0 && t.sy > 0.95) {
        const top = t.y + 12.9 * t.sy;
        ctx.collision.addBox(t.x - 0.7, top - 0.4, t.z - 0.7, t.x + 0.7, top, t.z + 0.7, 'tree');
        ctx.grapple.push({ x: t.x, y: top, z: t.z, nx: 0, nz: 1, perch: true });
      }
      minX = Math.min(minX, t.x - 5); maxX = Math.max(maxX, t.x + 5); minZ = Math.min(minZ, t.z - 5); maxZ = Math.max(maxZ, t.z + 5);
      minY = Math.min(minY, t.y); maxY = Math.max(maxY, t.y + 17 * t.sy);
    });
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'trees';
    mesh.matrixAutoUpdate = false;
    ctx.scene.add(mesh);
    ctx.chunks.addDetail(mesh, { minX, minY, minZ, maxX, maxY, maxZ });
  }
}

// Trunk (dark, unaffected by the instance colour's hue as it is near black) and a crown of three
// faceted blobs, ~56 triangles.
let TREE = null;
function treeGeometry() {
  if (TREE) return TREE;
  const parts = [];
  const add = (g, hex) => {
    const ng = g.index ? g.toNonIndexed() : g;
    const col = new THREE.Color(hex), n = ng.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'color'].includes(k)) ng.deleteAttribute(k);
    parts.push(ng);
  };
  add(new THREE.CylinderGeometry(0.16, 0.3, 5.5, 5, 1, true).translate(0, 2.75, 0), 0x2a221c);
  add(new THREE.IcosahedronGeometry(3.4, 0).scale(1, 0.85, 1).translate(0, 7.2, 0), 0xffffff);
  add(new THREE.IcosahedronGeometry(2.6, 0).scale(1, 0.9, 1).translate(0.8, 9.6, -0.4), 0xe8e8e8);
  add(new THREE.IcosahedronGeometry(1.8, 0).translate(-0.6, 11.4, 0.5), 0xf4f4f4);
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  TREE = new THREE.BufferGeometry();
  TREE.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  TREE.setAttribute('color', new THREE.BufferAttribute(col, 3));
  TREE.computeVertexNormals();
  return TREE;
}
