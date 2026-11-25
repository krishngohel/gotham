// [sandbox] Destructible street furniture with pooled debris. Bins, traffic cones, oil barrels,
// newspaper boxes, hydrants (they spout) and short work fences stand at the kerb along every
// street with a sidewalk, generated per 64 m cell from the street graph with a fixed hash (the same
// street always has the same props) the first time a hero comes near, and drawn as one instanced
// mesh per kind within ~70 m. A car through one, or a fight knocking into it, breaks it: a burst of
// pooled debris, a spout for a hydrant, and `streetDamage` { pos, kind, big } (collateral: police
// attention, src/wanted/wanted.js). Broken props come back after two minutes.
// Costs: one cheap cell check a frame; matrices rewritten 4 times a second; debris only when flying.
import * as THREE from 'three';
import { toonMaterial } from '../render/toon.js';
import { LAYER_FX } from '../render/layers.js';
import { withPlayer } from '../core/events.js';

export const PROP_KINDS = Object.freeze({
  bin: { r: 0.42, h: 1.0, color: 0x3e5a46, debris: 0x2e4436 },
  cone: { r: 0.3, h: 0.75, color: 0xff7a1a, debris: 0xff7a1a },
  barrel: { r: 0.45, h: 1.1, color: 0x8a3a2a, debris: 0x5a2a20 },
  newsBox: { r: 0.4, h: 1.15, color: 0x2c5aa0, debris: 0xd8dde6 },
  hydrant: { r: 0.3, h: 0.85, color: 0xc8323c, debris: 0x8a2a2a, spout: true },
  fence: { r: 1.1, h: 1.0, color: 0xf2f0e8, debris: 0xff7a1a, wide: true },
});
const KIND_LIST = Object.keys(PROP_KINDS);
const WEIGHTS = { bin: 4, cone: 2, barrel: 1.2, newsBox: 2, hydrant: 1.5, fence: 0.8 };
const CELL = 64;
const DRAW_R = 70;
const RESPAWN = 120;

const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function pickKind(r) {
  let total = 0;
  for (const k of KIND_LIST) total += WEIGHTS[k];
  let x = r * total;
  for (const k of KIND_LIST) { x -= WEIGHTS[k]; if (x <= 0) return k; }
  return 'bin';
}

// Kerb slots along one edge (pure: tested). Returns [{ kind, x, y, z, yaw }].
export function slotsForEdge(graph, e) {
  const out = [];
  if (!(e.sidewalk > 0) || !(e.lanes > 0) || e.bridge) return out;
  const A = graph.nodes[e.a], B = graph.nodes[e.b];
  const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz);
  if (L < 24) return out;
  const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  let s = 9 + hash(e.id, 1) * 8;
  let k = 0;
  while (s < L - 9) {
    const side = hash(e.id, 10 + k) < 0.5 ? 1 : -1;
    const off = e.width / 2 + 0.75;
    const t = s / L;
    out.push({ kind: pickKind(hash(e.id, 100 + k)), x: A.x + dx * t + nx * off * side, y: A.y + (B.y - A.y) * t, z: A.z + dz * t + nz * off * side, yaw: Math.atan2(ux, uz) });
    s += 15 + hash(e.id, 200 + k) * 14;
    k++;
  }
  return out;
}

export function createStreetFurniture({ scene, world, events, caps, players }) {
  const graph = world.streetGraph;
  const collision = world.collision;
  const list = () => players?.list ?? players ?? [];
  // Edges by cell of their midpoint.
  const edgesByCell = new Map();
  const ck = (i, j) => (i + 1024) * 4096 + (j + 1024);
  for (const e of graph.edges) {
    if (!(e.sidewalk > 0) || !(e.lanes > 0)) continue;
    const A = graph.nodes[e.a], B = graph.nodes[e.b];
    const k = ck(Math.floor((A.x + B.x) / 2 / CELL), Math.floor((A.z + B.z) / 2 / CELL));
    let c = edgesByCell.get(k);
    if (!c) edgesByCell.set(k, c = []);
    c.push(e);
  }
  const cells = new Map(); // key -> slots
  const live = []; // slots of the cells near the heroes (rebuilt when a hero changes cell)
  const up = { x: 0, y: 1, z: 0 }, eye = { x: 0, y: 0, z: 0 }, rayOut = { t: 0, box: null, normal: { x: 0, y: 0, z: 0 } };
  function cellSlots(i, j) {
    const k = ck(i, j);
    let c = cells.get(k);
    if (c) return c;
    c = [];
    for (const e of edgesByCell.get(k) ?? []) {
      for (const s of slotsForEdge(graph, e)) {
        // Standing on the pavement, nothing in the way (a lamp post, a building corner, a pillar).
        const g = collision.groundBelow(s.x, s.y + 1.2, s.z, 0.25);
        if (!(g > s.y - 0.5 && g < s.y + 0.6)) continue;
        s.y = g;
        eye.x = s.x; eye.y = g + 0.3; eye.z = s.z;
        if (collision.raycast(eye, up, 1.8, rayOut)) continue;
        s.broken = -1; s.i = c.length;
        c.push(s);
      }
    }
    cells.set(k, c);
    return c;
  }
  // Meshes: one instanced mesh per kind.
  const cap = Math.max(24, Math.round((caps?.props ?? 18) * 4));
  const meshes = {};
  const geos = {
    bin: new THREE.CylinderGeometry(0.4, 0.34, 1.0, 10).translate(0, 0.5, 0),
    cone: new THREE.ConeGeometry(0.28, 0.75, 10).translate(0, 0.375, 0),
    barrel: new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12).translate(0, 0.55, 0),
    newsBox: new THREE.BoxGeometry(0.55, 1.15, 0.5).translate(0, 0.575, 0),
    hydrant: new THREE.CylinderGeometry(0.17, 0.22, 0.85, 8).translate(0, 0.425, 0),
    fence: new THREE.BoxGeometry(2.2, 0.9, 0.12).translate(0, 0.6, 0),
  };
  for (const k of KIND_LIST) {
    const m = new THREE.InstancedMesh(geos[k], toonMaterial({ color: PROP_KINDS[k].color }), cap);
    m.count = 0; m.frustumCulled = false; m.name = `sandbox-${k}`; m.castShadow = false;
    scene.add(m);
    meshes[k] = m;
  }
  // Debris: small shards, one instanced mesh, coloured per piece.
  const nDebris = Math.max(8, caps?.debris ?? 16) * 2;
  const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), toonMaterial({ color: 0xffffff }), nDebris);
  debris.count = 0; debris.frustumCulled = false; debris.name = 'sandbox-debris';
  const dcol = new THREE.Color();
  for (let i = 0; i < nDebris; i++) debris.setColorAt(i, dcol.set(0x888888));
  scene.add(debris);
  const shards = Array.from({ length: nDebris }, () => ({ t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, gy: 0 }));
  let shardTurn = 0;
  // Hydrant spouts (two at most): a tall additive column.
  const spouts = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 1, 8, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.layers.set(LAYER_FX); m.visible = false; m.frustumCulled = false;
    scene.add(m);
    return { m, t: 0 };
  });
  let spoutTurn = 0;

  const mtx = new THREE.Matrix4(), quat = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0), euler = new THREE.Euler();
  const heroCells = new Int32Array(8).fill(-999999);
  let layoutT = 0, simT = 0, dirty = true;

  function refreshLive() {
    live.length = 0;
    const seen = new Set();
    for (const pl of list()) {
      const h = pl.hero?.pos;
      if (!h) continue;
      const ci = Math.floor(h.x / CELL), cj = Math.floor(h.z / CELL);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
        const k = ck(i, j);
        if (seen.has(k)) continue;
        seen.add(k);
        for (const s of cellSlots(i, j)) live.push(s);
      }
    }
  }
  function layout() {
    const counts = {};
    for (const k of KIND_LIST) counts[k] = 0;
    const pl = list();
    for (const s of live) {
      if (s.broken > simT) continue;
      let near = false;
      for (const q of pl) { const h = q.hero?.pos; if (h && Math.abs(h.x - s.x) < DRAW_R && Math.abs(h.z - s.z) < DRAW_R) { near = true; break; } }
      if (!near) continue;
      const m = meshes[s.kind];
      const n = counts[s.kind];
      if (n >= cap) continue;
      quat.setFromAxisAngle(yAxis, s.yaw);
      m.setMatrixAt(n, mtx.compose(p.set(s.x, s.y, s.z), quat, one));
      counts[s.kind] = n + 1;
    }
    for (const k of KIND_LIST) { const m = meshes[k]; m.count = counts[k]; m.visible = counts[k] > 0; m.instanceMatrix.needsUpdate = true; }
  }

  function breakSlot(s, from, player, speed = 6) {
    if (s.broken > simT) return;
    s.broken = simT + RESPAWN;
    dirty = true;
    const P = PROP_KINDS[s.kind];
    // A burst of shards away from whatever hit it.
    const dx = s.x - from.x, dz = s.z - from.z, d = Math.hypot(dx, dz) || 1;
    const n = Math.min(6, shards.length);
    for (let k = 0; k < n; k++) {
      const sh = shards[shardTurn]; const idx = shardTurn;
      shardTurn = (shardTurn + 1) % shards.length;
      const spread = (Math.random() - 0.5) * 1.4;
      const v = 2 + speed * 0.35 * Math.random();
      sh.t = 1.4 + Math.random() * 0.5;
      sh.x = s.x; sh.y = s.y + P.h * 0.6; sh.z = s.z;
      sh.vx = (dx / d) * v + spread * 2; sh.vz = (dz / d) * v - spread * 2; sh.vy = 2.5 + Math.random() * 3;
      sh.rx = Math.random() * 6; sh.ry = Math.random() * 6; sh.gy = s.y;
      debris.setColorAt(idx, dcol.set(k % 2 ? P.debris : P.color));
    }
    debris.instanceColor.needsUpdate = true;
    if (P.spout) { const sp = spouts[spoutTurn]; spoutTurn = (spoutTurn + 1) % spouts.length; sp.t = 8; sp.m.position.set(s.x, s.y + 0.4, s.z); sp.m.visible = true; }
    events?.emit('streetDamage', withPlayer({ pos: { x: s.x, y: s.y, z: s.z }, kind: s.kind, big: false }, player));
    events?.emit('word', { text: s.kind === 'hydrant' ? 'FSSSH!' : s.kind === 'cone' ? 'BONK' : 'CLANG!', pos: { x: s.x, y: s.y + 1.4, z: s.z } });
  }

  // Fights knock bins over: an impact within a metre of a prop.
  events?.on('impact', (e) => {
    const q = e?.pos;
    if (!q) return;
    for (const s of live) if (s.broken <= simT && Math.abs(s.x - q.x) < 1.3 && Math.abs(s.z - q.z) < 1.3 && Math.abs(s.y - (q.y ?? s.y)) < 2) breakSlot(s, q, e?.player ?? null, 4);
  });

  const api = {
    get live() { return live; },
    breakSlot,
    // Cars passed in from the sandbox: [{ x, y, z, speed, radius, player }].
    update(dt, cars) {
      simT += dt;
      // Which cells: rebuilt when a hero crosses a cell line.
      let moved = false;
      const pl = list();
      for (let i = 0; i < pl.length && i < 4; i++) {
        const h = pl[i].hero?.pos;
        if (!h) continue;
        const k = ck(Math.floor(h.x / CELL), Math.floor(h.z / CELL));
        if (heroCells[i] !== k) { heroCells[i] = k; moved = true; }
      }
      if (moved) { refreshLive(); dirty = true; }
      for (const c of cars) {
        if (c.speed < 3) continue;
        for (const s of live) {
          if (s.broken > simT) continue;
          const r = c.radius + PROP_KINDS[s.kind].r;
          if (Math.abs(s.x - c.x) < r && Math.abs(s.z - c.z) < r && Math.abs(s.y - c.y) < 2.2) breakSlot(s, c, c.player, c.speed);
        }
      }
      layoutT -= dt;
      if (dirty || layoutT <= 0) {
        // Respawn: broken props whose time is up come back (they were out of sight for a while).
        layoutT = 0.25; dirty = false; layout();
      }
      // Debris.
      let nd = 0;
      for (let i = 0; i < shards.length; i++) {
        const sh = shards[i];
        if (sh.t <= 0) continue;
        sh.t -= dt;
        sh.vy -= 14 * dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.z += sh.vz * dt;
        if (sh.y < sh.gy + 0.08) { sh.y = sh.gy + 0.08; sh.vy *= -0.3; sh.vx *= 0.6; sh.vz *= 0.6; }
        sh.rx += dt * 5; sh.ry += dt * 4;
        euler.set(sh.rx, sh.ry, 0); quat.setFromEuler(euler);
        debris.setMatrixAt(i, mtx.compose(p.set(sh.x, sh.y, sh.z), quat, one));
        nd = i + 1;
      }
      if (nd || debris.count) { debris.count = nd; debris.visible = nd > 0; debris.instanceMatrix.needsUpdate = true; }
      for (const sp of spouts) if (sp.t > 0) { sp.t -= dt; const k = Math.min(1, sp.t / 2); sp.m.scale.set(1, 4 * k + 0.3 * Math.sin(simT * 20), 1); if (sp.t <= 0) sp.m.visible = false; }
    },
  };
  return api;
}
