// Working double-leaf bascule bridges (research 1.3): each leaf pivots on a trunnion at the
// canal wall and lifts to 70 degrees on a schedule (and on demand: bridges.hold(id, 'up')).
// While a bridge's leaves are off the deck its deck collision is gone; barrier gates close both
// approaches (cars stop at them, people cannot walk off the edge); fully raised, each leaf
// collides as four stepped boxes, so its tip is a perch. Leaves are small dynamic meshes (the
// shared city materials, four draws per leaf) culled with their chunk.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '../../config/palette.js';
import { box } from '../buckets.js';

export const BASCULE = { cycle: 240, close: 6, lift: 12, hold: 8, maxAngle: (70 * Math.PI) / 180 };

// Pure schedule: the leaf angle (0..maxAngle) and phase of a bridge at time t.
export function basculeState(t, offset = 0, hold = null, B = BASCULE) {
  if (hold === 'down') return { angle: 0, phase: 'down', gates: false };
  if (hold === 'up') return { angle: B.maxAngle, phase: 'up', gates: true };
  const c = (((t + offset) % B.cycle) + B.cycle) % B.cycle;
  const down = B.cycle - (2 * B.close + 2 * B.lift + B.hold);
  if (c < down) return { angle: 0, phase: 'down', gates: false };
  let k = c - down;
  if (k < B.close) return { angle: 0, phase: 'closing', gates: true };
  k -= B.close;
  if (k < B.lift) return { angle: B.maxAngle * smooth(k / B.lift), phase: 'raising', gates: true };
  k -= B.lift;
  if (k < B.hold) return { angle: B.maxAngle, phase: 'up', gates: true };
  k -= B.hold;
  if (k < B.lift) return { angle: B.maxAngle * (1 - smooth(k / B.lift)), phase: 'lowering', gates: true };
  return { angle: 0, phase: 'opening', gates: true };
}
const smooth = (x) => x * x * (3 - 2 * x);

function leafGeometry(L) {
  // Local frame: hinge at the origin, deck top at y 0, the leaf running toward -z.
  const painted = [], asphalt = [], walk = [], lane = [];
  const col = (g, hex) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  painted.push(col(box(20, 1.1, L, 0, -0.75, -L / 2), 0x2d3238));
  // Riveted plate girders along both edges, doubling as the railing (1.1 m above the walk).
  for (const s of [-1, 1]) {
    painted.push(col(box(0.35, 2.4, L, s * 10.2, -0.1, -L / 2), 0x3a4048));
    for (let z = -1; z > -L; z -= 2.2) painted.push(col(box(0.42, 0.18, 0.18, s * 10.2, 0.9, z), 0x24282e));
  }
  // Counterweight hanging below the hinge, and the pivot drum.
  painted.push(col(box(18, 3.5, 4.5, 0, -3.6, 2.3), 0x26292d));
  painted.push(col(new THREE.CylinderGeometry(0.9, 0.9, 20.6, 16).rotateZ(Math.PI / 2).translate(0, -0.8, 0), 0x1d2024));
  asphalt.push(box(14, 0.06, L, 0, -0.17, -L / 2));
  for (const s of [-1, 1]) walk.push(box(2.9, 0.34, L, s * 8.55, -0.03, -L / 2));
  for (let z = -2; z > -L + 1; z -= 6) lane.push(new THREE.PlaneGeometry(0.25, 3).rotateX(-Math.PI / 2).translate(0, -0.13, z));
  return { painted, asphalt, walk, lane };
}

// bridges: [{ id, x, z0, z1 }] (z0 the south canal wall, z1 the north one). Returns the runtime
// object exposed as world.bridges.
export function createBascules(ctx, bridges, { offsets = [70, 190] } = {}) {
  const { scene, materials, collision } = ctx;
  const holds = new Map();
  const list = bridges.map((b, bi) => {
    const L = Math.abs(b.z1 - b.z0) / 2;
    const leaves = [];
    for (const [hingeZ, facing] of [[b.z0, 0], [b.z1, Math.PI]]) {
      const outer = new THREE.Group();
      outer.position.set(b.x, 0, hingeZ);
      outer.rotation.y = facing;
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
      outer.name = `bascule:${b.id}`;
      outer.userData.region = 'river';
      scene.add(outer);
      ctx.chunks?.addDetail(outer, { minX: b.x - 11, minY: -6, minZ: Math.min(b.z0, b.z1) - 6, maxX: b.x + 11, maxY: L + 2, maxZ: Math.max(b.z0, b.z1) + 6 }, 'draw');
      // Lamp on the leaf's free end (a halo that rides with it).
      const halo = ctx.halos.add(b.x, 1.5, hingeZ, PALETTE.sodium, 2.2);
      leaves.push({ outer, pivot, hingeZ, dir: facing ? 1 : -1, halo, L });
    }
    // Down: deck, walks and edge girders collide (tag 'bridge').
    const zMin = Math.min(b.z0, b.z1), zMax = Math.max(b.z0, b.z1);
    const deckBoxes = () => [
      collision.addBox(b.x - 7, -1.2, zMin, b.x + 7, 0, zMax, 'bridge'),
      collision.addBox(b.x - 10, -1.2, zMin, b.x - 7, 0.15, zMax, 'bridge'),
      collision.addBox(b.x + 7, -1.2, zMin, b.x + 10, 0.15, zMax, 'bridge'),
      collision.addBox(b.x - 10.4, 0.15, zMin, b.x - 10, 1.3, zMax, 'railing'),
      collision.addBox(b.x + 10, 0.15, zMin, b.x + 10.4, 1.3, zMax, 'railing'),
    ];
    // Gate arms across both approaches (visual + collision while the bridge is not down).
    const gateMeshes = [];
    for (const gz of [b.z0 + 2.5, b.z1 - 2.5]) {
      const g = new THREE.Mesh(mergeGeometries([0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
        const seg = box(2.4, 0.22, 0.22, b.x - 9 + k * 2.5, 1.1, gz);
        seg.deleteAttribute('uv');
        const c = new THREE.Color(k % 2 ? 0xe8e2d4 : PALETTE.crimson), n = seg.attributes.position.count, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
        seg.setAttribute('color', new THREE.BufferAttribute(a, 3));
        seg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
        return seg;
      })), materials.painted);
      g.visible = false;
      g.userData.dynamic = true;
      scene.add(g);
      gateMeshes.push({ mesh: g, z: gz });
    }
    return {
      id: b.id, x: b.x, z0: b.z0, z1: b.z1, L, leaves, gateMeshes, offset: offsets[bi % offsets.length],
      angle: 0, phase: 'down', down: true, boxes: deckBoxes(), gateBoxes: [], stepBoxes: [], deckBoxes,
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
    if (wantGates && !br.gateBoxes.length) {
      br.gateBoxes = br.gateMeshes.map((g) => collision.addBox(br.x - 10, 0, g.z - 0.2, br.x + 10, 1.25, g.z + 0.2, 'gate'));
    }
    if (!wantGates && br.gateBoxes.length) { for (const x of br.gateBoxes) collision.removeBox(x); br.gateBoxes = []; }
    if (wantSteps && !br.stepBoxes.length) {
      for (const leaf of br.leaves) {
        const c = Math.cos(BASCULE.maxAngle), sn = Math.sin(BASCULE.maxAngle);
        for (let k = 0; k < 4; k++) {
          const s0 = (k / 4) * leaf.L, s1 = ((k + 1) / 4) * leaf.L;
          const za = leaf.hingeZ + leaf.dir * s0 * c, zb = leaf.hingeZ + leaf.dir * s1 * c;
          br.stepBoxes.push(collision.addBox(br.x - 10, s0 * sn - 1.2, Math.min(za, zb) - 0.6, br.x + 10, s1 * sn, Math.max(za, zb) + 0.6, 'leaf'));
        }
      }
    }
    if (!wantSteps && br.stepBoxes.length) { for (const x of br.stepBoxes) collision.removeBox(x); br.stepBoxes = []; }
  }

  const api = {
    list,
    isDown: (id) => list.find((b) => b.id === id)?.down ?? true,
    // hold(id, 'up' | 'down' | null): pin a bridge (story moments, chases); null resumes the schedule.
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
            const tipS = leaf.L - 1;
            ctx.halos.set(leaf.halo, br.x, 1.4 + Math.sin(s.angle) * tipS, leaf.hingeZ + leaf.dir * Math.cos(s.angle) * tipS);
          }
        }
        for (const g of br.gateMeshes) g.mesh.visible = s.gates;
        setCollision(br, s);
      }
    },
  };
  // Initial pose (leaf lamps at their tips).
  for (const br of list) for (const leaf of br.leaves) ctx.halos.set(leaf.halo, br.x, 1.4, leaf.hingeZ + leaf.dir * (leaf.L - 1));
  return api;
}
