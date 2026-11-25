// The west side's bascule bridges: the proof region's working double-leaf bascules
// (regions/bascules.js: same schedule, same leaf, same gates and collision swap) generalised to
// bridges that run along x as well as z, because the North and South Branches run north-south
// and their bridges carry east-west streets. The schedule is the shared basculeState(); only the
// orientation and the per-bridge offsets are new. mergeBridges() folds this set into the
// world.bridges object the river region created, so traffic, the GPS (`blocked`) and story
// holds see every bridge through one API.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '../../config/palette.js';
import { box } from '../buckets.js';
import { BASCULE, basculeState } from './bascules.js';

// The same leaf as bascules.js (local frame: hinge at the origin, deck top y 0, leaf toward -z).
function leafGeometry(L) {
  const painted = [], asphalt = [], walk = [], lane = [];
  const col = (g, hex) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  painted.push(col(box(20, 1.1, L, 0, -0.75, -L / 2), 0x2d3238));
  for (const s of [-1, 1]) {
    painted.push(col(box(0.35, 2.4, L, s * 10.2, -0.1, -L / 2), 0x3a4048));
    for (let z = -1; z > -L; z -= 2.2) painted.push(col(box(0.42, 0.18, 0.18, s * 10.2, 0.9, z), 0x24282e));
  }
  painted.push(col(box(18, 3.5, 4.5, 0, -3.6, 2.3), 0x26292d));
  painted.push(col(new THREE.CylinderGeometry(0.9, 0.9, 20.6, 12).rotateZ(Math.PI / 2).translate(0, -0.8, 0), 0x1d2024));
  asphalt.push(box(14, 0.06, L, 0, -0.17, -L / 2));
  for (const s of [-1, 1]) walk.push(box(2.9, 0.34, L, s * 8.55, -0.03, -L / 2));
  for (let z = -2; z > -L + 1; z -= 6) lane.push(new THREE.PlaneGeometry(0.25, 3).rotateX(-Math.PI / 2).translate(0, -0.13, z));
  return { painted, asphalt, walk, lane };
}

// World box from a span along the bridge axis (a0..a1) and across it (c0..c1).
function axisBox(b, a0, a1, c0, c1, y0, y1) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  return b.axis === 'x'
    ? [lo, y0, b.z + c0, hi, y1, b.z + c1]
    : [b.x + c0, y0, lo, b.x + c1, y1, hi];
}

// bridges: [{ id, axis: 'x', z, x0, x1 } | { id, axis: 'z', x, z0, z1 }] (x0 / z0 one canal wall,
// x1 / z1 the other). Returns { list, isDown, hold, update } like createBascules.
export function createWestBascules(ctx, bridges, { offsets = [20, 140, 80, 200, 50, 170, 110, 230] } = {}) {
  const { scene, materials, collision } = ctx;
  const holds = new Map();
  const list = bridges.map((b, bi) => {
    const w0 = b.axis === 'x' ? b.x0 : b.z0, w1 = b.axis === 'x' ? b.x1 : b.z1;
    const L = Math.abs(w1 - w0) / 2;
    const leaves = [];
    for (const wall of [w0, w1]) {
      const toward = Math.sign((w0 + w1) / 2 - wall); // leaf runs from its wall toward the middle
      const outer = new THREE.Group();
      if (b.axis === 'x') { outer.position.set(wall, 0, b.z); outer.rotation.y = toward < 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { outer.position.set(b.x, 0, wall); outer.rotation.y = toward < 0 ? 0 : Math.PI; }
      const pivot = new THREE.Group();
      outer.add(pivot);
      const parts = leafGeometry(L);
      for (const [key, geos] of [['painted', parts.painted], ['asphalt', parts.asphalt], ['sidewalk', parts.walk], ['lane', parts.lane]]) {
        const geo = mergeGeometries(geos.map((g) => {
          for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n);
          if (!materials[key].vertexColors && g.attributes.color) g.deleteAttribute('color');
          return g;
        }), false);
        const m = new THREE.Mesh(geo, materials[key]);
        m.castShadow = key === 'painted';
        m.receiveShadow = true;
        if (materials[key].userData.layer) m.layers.set(materials[key].userData.layer);
        pivot.add(m);
      }
      outer.userData.dynamic = true;
      outer.userData.region = ctx.region;
      outer.name = `bascule:${b.id}`;
      scene.add(outer);
      const [x0, y0, z0, x1, y1, z1] = axisBox(b, wall - toward * 6, wall + toward * (L + 1), -11, 11, -6, L + 2);
      ctx.chunks?.addDetail(outer, { minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1 }, 'draw');
      const halo = ctx.halos.add(outer.position.x, 1.5, outer.position.z, PALETTE.sodium, 2.2);
      leaves.push({ outer, pivot, wall, dir: toward, halo, L });
    }
    const lo = Math.min(w0, w1), hi = Math.max(w0, w1);
    const add = (a0, a1, c0, c1, y0, y1, tag) => { const r = axisBox(b, a0, a1, c0, c1, y0, y1); return collision.addBox(r[0], r[1], r[2], r[3], r[4], r[5], tag); };
    const deckBoxes = () => [
      add(lo, hi, -7, 7, -1.2, 0, 'bridge'),
      add(lo, hi, -10, -7, -1.2, 0.15, 'bridge'),
      add(lo, hi, 7, 10, -1.2, 0.15, 'bridge'),
      add(lo, hi, -10.4, -10, 0.15, 1.3, 'railing'),
      add(lo, hi, 10, 10.4, 0.15, 1.3, 'railing'),
    ];
    // Barrier gates 2.5 m back from each wall on the land side.
    const gateMeshes = [];
    for (const wall of [w0, w1]) {
      const g0 = wall + 2.5 * Math.sign(wall - (w0 + w1) / 2);
      const segs = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
        const along = -9 + k * 2.5;
        const seg = b.axis === 'x' ? box(0.22, 0.22, 2.4, g0, 1.1, b.z + along) : box(2.4, 0.22, 0.22, b.x + along, 1.1, g0);
        seg.deleteAttribute('uv');
        const c = new THREE.Color(k % 2 ? 0xe8e2d4 : PALETTE.crimson), n = seg.attributes.position.count, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
        seg.setAttribute('color', new THREE.BufferAttribute(a, 3));
        seg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
        return seg;
      });
      const g = new THREE.Mesh(mergeGeometries(segs), materials.painted);
      g.visible = false;
      g.userData.dynamic = true;
      scene.add(g);
      gateMeshes.push({ mesh: g, at: g0 });
    }
    return {
      id: b.id, axis: b.axis, x: b.x, z: b.z, L, leaves, gateMeshes, offset: offsets[bi % offsets.length],
      angle: 0, phase: 'down', down: true, boxes: deckBoxes(), gateBoxes: [], stepBoxes: [], deckBoxes, add,
    };
  });

  function setCollision(br, s) {
    // [polish] The deck is solid while the leaves are down (closing and opening included), not only
    // while the gates are up: walkers and traffic fell through during `closing`.
    const wantDeck = s.angle < 0.004;
    const wantGates = s.gates || s.angle >= 0.004;
    const wantSteps = s.angle >= BASCULE.maxAngle - 0.01;
    if (wantDeck && !br.boxes.length) br.boxes = br.deckBoxes();
    if (!wantDeck && br.boxes.length) { for (const x of br.boxes) collision.removeBox(x); br.boxes = []; }
    if (wantGates && !br.gateBoxes.length) br.gateBoxes = br.gateMeshes.map((g) => br.add(g.at - 0.2, g.at + 0.2, -10, 10, 0, 1.25, 'gate'));
    if (!wantGates && br.gateBoxes.length) { for (const x of br.gateBoxes) collision.removeBox(x); br.gateBoxes = []; }
    if (wantSteps && !br.stepBoxes.length) {
      const c = Math.cos(BASCULE.maxAngle), sn = Math.sin(BASCULE.maxAngle);
      for (const leaf of br.leaves) {
        for (let k = 0; k < 4; k++) {
          const s0 = (k / 4) * leaf.L, s1 = ((k + 1) / 4) * leaf.L;
          const a0 = leaf.wall + leaf.dir * s0 * c, a1 = leaf.wall + leaf.dir * s1 * c;
          br.stepBoxes.push(br.add(Math.min(a0, a1) - 0.6, Math.max(a0, a1) + 0.6, -10, 10, s0 * sn - 1.2, s1 * sn, 'leaf'));
        }
      }
    }
    if (!wantSteps && br.stepBoxes.length) { for (const x of br.stepBoxes) collision.removeBox(x); br.stepBoxes = []; }
  }

  const api = {
    list,
    isDown: (id) => list.find((b) => b.id === id)?.down ?? true,
    hold(id, mode) { if (mode) holds.set(id, mode); else holds.delete(id); },
    update(t) {
      for (const br of list) {
        const s = basculeState(t, br.offset, holds.get(br.id) ?? null);
        br.phase = s.phase;
        br.down = s.angle === 0 && !s.gates;
        if (s.angle !== br.angle) {
          br.angle = s.angle;
          for (const leaf of br.leaves) {
            leaf.pivot.rotation.x = s.angle;
            leaf.outer.updateMatrixWorld(true);
            tipHalo(br, leaf, s.angle);
          }
        }
        for (const g of br.gateMeshes) g.mesh.visible = s.gates;
        setCollision(br, s);
      }
    },
  };
  function tipHalo(br, leaf, angle) {
    const tipS = leaf.L - 1, a = leaf.wall + leaf.dir * Math.cos(angle) * tipS, y = 1.4 + Math.sin(angle) * tipS;
    if (br.axis === 'x') ctx.halos.set(leaf.halo, a, y, br.z); else ctx.halos.set(leaf.halo, br.x, y, a);
  }
  for (const br of list) for (const leaf of br.leaves) tipHalo(br, leaf, 0);
  return api;
}

// One world.bridges for several bridge sets (the river region's and this one): list, isDown and
// hold reach every bridge; update() updates both (each set also has its own updater, and an
// update is idempotent for a given t).
export function mergeBridges(a, b) {
  if (!a) return b;
  if (!b) return a;
  const owner = (id) => (b.list.some((x) => x.id === id) ? b : a);
  return {
    list: [...a.list, ...b.list],
    isDown: (id) => owner(id).isDown(id),
    hold(id, mode) { owner(id).hold(id, mode); },
    update(t) { a.update(t); b.update(t); },
  };
}
