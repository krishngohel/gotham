// Garments that read as clothing: a skinned shell lifted off the body like kit.shell, but draped
// instead of painted on. What makes a painted or thin shell look like a bodysuit is that it keeps
// every bump of the superhero body under it (pecs, abs, the split of the deltoid) in both its
// shape and its normals. A drape:
//
//   1. welds the picked body triangles (the body is split at its UV seams) so the cloth is one
//      surface, and lifts each vertex off the body by `offset`;
//   2. relaxes it OUTWARD ONLY: each pass a vertex may rise along a smoothed normal toward the
//      average of its neighbours, never sink. Concave creases between muscles fill in, convex
//      forms stay just covered, and the surface tends to the body's convex hull: cloth pulled
//      taut over the figure, not paint on it (on a test limb it settles within 0.2 mm of the
//      hull; tests/unit/garments.test.js). A clamp keeps it `minOffset` off the body;
//   3. optionally hangs `tubes`: from a joint down, a sleeve or trouser leg is held at least as
//      wide as it is at the joint (a straight leg, a straight sleeve) instead of following the
//      calf or the forearm;
//   4. snaps the cut edges (hems, cuffs, necklines) onto the line `edge(p) = 0` so a hem is a
//      clean line instead of the body's triangle staircase, and smooths the edge along itself;
//   5. adds a `lip`: a narrow band turning from the edge in to the body, so the cloth has a
//      visible thickness and you never see into it;
//   6. recomputes normals from the draped surface: the shading follows the cloth.
//
// Every vertex keeps the skin weights of the body vertex it came from, so the garment moves
// exactly with the body on the shared skeleton (no new bones, no retargeting).
import * as THREE from 'three';
import { bindPosition } from '../../actors/rig.js';
import { linear } from './kit.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Bone segments (bind space): index -> { name, head, tail } for every bone (tail = first child).
const SEGS = new WeakMap();
function segments(body) {
  let s = SEGS.get(body.skeleton);
  if (s) return s;
  s = body.skeleton.bones.map((b) => {
    const kid = b.children.find((c) => c.isBone);
    const head = bindPosition(body, b.name);
    return { name: b.name, head, tail: kid ? bindPosition(body, kid.name) : head.clone() };
  });
  SEGS.set(body.skeleton, s);
  return s;
}

// Welded view of a geometry: one id per distinct position (0.05 mm), cached per geometry.
const WELDS = new WeakMap();
function weld(src) {
  let w = WELDS.get(src);
  if (w) return w;
  const P = src.attributes.position;
  const id = new Int32Array(P.count);
  const map = new Map();
  const first = [];
  for (let i = 0; i < P.count; i++) {
    const k = `${Math.round(P.getX(i) * 2e4)},${Math.round(P.getY(i) * 2e4)},${Math.round(P.getZ(i) * 2e4)}`;
    let j = map.get(k);
    if (j === undefined) { j = first.length; first.push(i); map.set(k, j); }
    id[i] = j;
  }
  // Averaged normals per welded vertex.
  const N = src.attributes.normal;
  const nrm = new Float32Array(first.length * 3);
  for (let i = 0; i < P.count; i++) { const j = id[i]; nrm[j * 3] += N.getX(i); nrm[j * 3 + 1] += N.getY(i); nrm[j * 3 + 2] += N.getZ(i); }
  for (let j = 0; j < first.length; j++) {
    const l = Math.hypot(nrm[j * 3], nrm[j * 3 + 1], nrm[j * 3 + 2]) || 1;
    nrm[j * 3] /= l; nrm[j * 3 + 1] /= l; nrm[j * 3 + 2] /= l;
  }
  w = { id, first, nrm, count: first.length };
  WELDS.set(src, w);
  return w;
}

// drape(body, src, opts) -> BufferGeometry (position, normal, color, uv, skinIndex, skinWeight)
//   body     the character's body SkinnedMesh (for its skeleton and bone segments)
//   src      the (possibly reshaped) body geometry the garment is lifted from
//   pick(p, n)          which body vertices the garment covers (bind pose)
//   offset   number | (p, n) => metres: how far the cloth starts off the body
//   minOffset           the clamp: never closer than this (default 0.6 * offset)
//   smooth   relaxation passes (0 = a plain shell with recomputed normals)
//   edge(p)  signed distance-like function (or an array of them, one per cut); cut-edge
//            vertices within 5 cm of a cut are moved onto its line edge = 0
//   tubes    [{ bone, from = 0.05, taper = 1, k = 1 }]: from `from` (0..1 along the bone) on, the
//            radius about the bone axis is at least k * the radius measured at `from`, times a
//            taper toward the bone's end
//   push(p, n, d)       extra shaping of the starting lift (adds to d)
//   lip      true: a band from the edge in to the body surface
//   color    hex or (p, n) => hex per vertex (figure.js uses region names instead; see region)
//   region   (p, n) => any: stored per vertex in geometry.userData.region (figure.js)
export function drape(body, src, {
  pick, offset = 0.005, minOffset = null, smooth = 10, edge = null, tubes = null, push = null, lip = true,
  color = 0xffffff, region = null, relax = 0.9,
}) {
  const P = src.attributes.position, SI = src.attributes.skinIndex, SW = src.attributes.skinWeight;
  const W = weld(src);
  const idx = src.index.array;
  const p = new THREE.Vector3(), n = new THREE.Vector3(), d = new THREE.Vector3();
  // 1. Which welded vertices the garment covers, and its triangles in welded ids.
  const ok = new Uint8Array(W.count);
  for (let j = 0; j < W.count; j++) {
    const i = W.first[j];
    p.fromBufferAttribute(P, i); n.fromArray(W.nrm, j * 3);
    ok[j] = pick(p, n) ? 1 : 0;
  }
  const local = new Int32Array(W.count).fill(-1);
  const verts = []; // welded id per local vertex
  const tris = [];
  const seen = new Set();
  for (let t = 0; t < idx.length; t += 3) {
    const a = W.id[idx[t]], b = W.id[idx[t + 1]], c = W.id[idx[t + 2]];
    if (!(ok[a] && ok[b] && ok[c]) || a === b || b === c || a === c) continue;
    const key = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(key)) continue; // the body doubles some triangles at seams
    seen.add(key);
    for (const v of [a, b, c]) { if (local[v] < 0) { local[v] = verts.length; verts.push(v); } tris.push(local[v]); }
  }
  const m = verts.length;
  if (!m) return emptyGeometry();
  // Body position and normal per local vertex; the garment position starts lifted.
  const base = new Float32Array(m * 3), bn = new Float32Array(m * 3), pos = new Float32Array(m * 3), minOff = new Float32Array(m);
  for (let k = 0; k < m; k++) {
    const j = verts[k], i = W.first[j];
    p.fromBufferAttribute(P, i); n.fromArray(W.nrm, j * 3);
    const off = typeof offset === 'function' ? offset(p, n) : offset;
    minOff[k] = minOffset == null ? off * 0.6 : (typeof minOffset === 'function' ? minOffset(p, n) : minOffset);
    d.copy(n).multiplyScalar(off);
    if (push) push(p, n, d);
    p.toArray(base, k * 3); n.toArray(bn, k * 3);
    pos[k * 3] = p.x + d.x; pos[k * 3 + 1] = p.y + d.y; pos[k * 3 + 2] = p.z + d.z;
  }
  // Adjacency (edge list per vertex) and the boundary (edges used by one triangle).
  const edgeUse = new Map();
  const ek = (a, b) => (a < b ? a * m + b : b * m + a);
  for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = tris[t + e], b = tris[t + (e + 1) % 3], k = ek(a, b);
    edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
  }
  const nbr = Array.from({ length: m }, () => []);
  const bnd = new Uint8Array(m);
  const bnbr = Array.from({ length: m }, () => []);
  for (const [k, uses] of edgeUse) {
    const a = Math.floor(k / m), b = k % m;
    nbr[a].push(b); nbr[b].push(a);
    if (uses === 1) { bnd[a] = 1; bnd[b] = 1; bnbr[a].push(b); bnbr[b].push(a); }
  }
  // 4a. Snap the cut edge onto edge(p) = 0 (a few Newton steps on a numeric gradient).
  if (edge) {
    const edges = Array.isArray(edge) ? edge : [edge];
    const q = new THREE.Vector3(), g = new THREE.Vector3();
    const h = 0.002;
    for (let k = 0; k < m; k++) {
      if (!bnd[k]) continue;
      q.fromArray(pos, k * 3);
      // The nearest cut (a sleeve end vs. the hem); none near: a cut we do not straighten.
      let edge = null, best = 0.05;
      for (const f of edges) { const v = Math.abs(f(q)); if (v < best) { best = v; edge = f; } }
      if (!edge) continue;
      for (let it = 0; it < 4; it++) {
        const f = edge(q);
        g.set(edge(q.clone().setX(q.x + h)) - f, edge(q.clone().setY(q.y + h)) - f, edge(q.clone().setZ(q.z + h)) - f).divideScalar(h);
        const g2 = g.lengthSq();
        if (g2 < 1e-10) break;
        q.addScaledVector(g, -f / g2);
      }
      // Carry the body anchor along so the clamp below measures from under the moved vertex.
      base[k * 3] += q.x - pos[k * 3]; base[k * 3 + 1] += q.y - pos[k * 3 + 1]; base[k * 3 + 2] += q.z - pos[k * 3 + 2];
      q.toArray(pos, k * 3);
    }
  }
  // 2. Relax with the clamp. The clamp pushes along a SMOOTHED normal field, not each body
  // vertex's own normal: on a muscle's flank the raw normal tilts sideways, so clamping along it
  // shoved the cloth across the surface every pass and undid the smoothing (a draped ring came
  // out rougher than the body under it; tests/unit/garments.test.js measures this).
  const cn = bn.slice();
  {
    const acc = new Float32Array(m * 3);
    for (let s = 0; s < 6; s++) {
      for (let k = 0; k < m; k++) {
        const o = k * 3;
        let x = cn[o], y = cn[o + 1], z = cn[o + 2];
        for (const j of nbr[k]) { x += cn[j * 3]; y += cn[j * 3 + 1]; z += cn[j * 3 + 2]; }
        const l = Math.hypot(x, y, z) || 1;
        acc[o] = x / l; acc[o + 1] = y / l; acc[o + 2] = z / l;
      }
      cn.set(acc);
    }
  }
  const tmp = new Float32Array(m * 3);
  const clampOut = () => {
    for (let k = 0; k < m; k++) {
      const o = k * 3;
      const dd = (pos[o] - base[o]) * cn[o] + (pos[o + 1] - base[o + 1]) * cn[o + 1] + (pos[o + 2] - base[o + 2]) * cn[o + 2];
      if (dd < minOff[k]) { const s = minOff[k] - dd; pos[o] += cn[o] * s; pos[o + 1] += cn[o + 1] * s; pos[o + 2] += cn[o + 2] * s; }
    }
  };
  const relaxPass = (amount) => {
    for (let k = 0; k < m; k++) {
      const list = bnd[k] ? bnbr[k] : nbr[k];
      const o = k * 3;
      if (!list.length) { tmp[o] = pos[o]; tmp[o + 1] = pos[o + 1]; tmp[o + 2] = pos[o + 2]; continue; }
      let sx = 0, sy = 0, sz = 0;
      for (const j of list) { sx += pos[j * 3]; sy += pos[j * 3 + 1]; sz += pos[j * 3 + 2]; }
      const inv = 1 / list.length;
      // Outward only, along the smoothed normal: a vertex in a hollow rises toward its
      // neighbours, a vertex on a bump or on a plain convex form never sinks. (Plain Laplacian
      // smoothing shrinks every convex limb, so the clamp caught the whole garment at its minimum
      // offset and the cloth collapsed back onto the muscles; tests/unit/garments.test.js.)
      // The result tends to the body's convex hull: cloth pulled taut between the high points.
      const a = bnd[k] ? amount * 0.6 : amount;
      const lift = Math.max(0, (sx * inv - pos[o]) * cn[o] + (sy * inv - pos[o + 1]) * cn[o + 1] + (sz * inv - pos[o + 2]) * cn[o + 2]) * a;
      tmp[o] = pos[o] + cn[o] * lift;
      tmp[o + 1] = pos[o + 1] + cn[o + 1] * lift;
      tmp[o + 2] = pos[o + 2] + cn[o + 2] * lift;
    }
    pos.set(tmp);
    clampOut();
  };
  for (let s = 0; s < smooth; s++) relaxPass(relax);
  // 3. Tubes: straight sleeves and trouser legs.
  if (tubes?.length) {
    const segs = segments(body);
    const boneOf = new Int32Array(m);
    for (let k = 0; k < m; k++) {
      const i = W.first[verts[k]];
      let best = 0, bw = -1;
      for (let c = 0; c < 4; c++) { const w = SW.getComponent(i, c); if (w > bw) { bw = w; best = SI.getComponent(i, c); } }
      boneOf[k] = best;
    }
    const a = new THREE.Vector3(), ab = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3();
    for (const tube of tubes) {
      const bi = segs.findIndex((s) => s.name === tube.bone);
      if (bi < 0) continue;
      const seg = segs[bi];
      a.copy(seg.head); ab.subVectors(seg.tail, seg.head);
      const len2 = ab.lengthSq();
      if (len2 < 1e-8) continue;
      const from = tube.from ?? 0.05;
      const along = (k) => { q.fromArray(pos, k * 3); return c.subVectors(q, a).dot(ab) / len2; };
      // Radius measured at the joint: the widest point of a thin band around `from`.
      let r0 = 0;
      for (let k = 0; k < m; k++) {
        if (boneOf[k] !== bi) continue;
        const t = along(k);
        if (Math.abs(t - from) > 0.06) continue;
        c.copy(a).addScaledVector(ab, t);
        r0 = Math.max(r0, q.distanceTo(c));
      }
      if (!r0) continue;
      for (let k = 0; k < m; k++) {
        if (boneOf[k] !== bi) continue;
        const t = along(k);
        if (t < from) continue;
        c.copy(a).addScaledVector(ab, Math.min(1.2, t));
        const want = r0 * (tube.k ?? 1) * (1 - (1 - (tube.taper ?? 1)) * clamp01((t - from) / (1 - from)));
        d.subVectors(q, c);
        const r = d.length();
        if (r < want && r > 1e-5) { q.copy(c).addScaledVector(d, want / r); q.toArray(pos, k * 3); }
      }
    }
    for (let s = 0; s < 3; s++) relaxPass(0.35);
  }
  // 6. Normals from the draped surface (welded: smooth across what were the body's seams).
  const nrm = new Float32Array(m * 3);
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let t = 0; t < tris.length; t += 3) {
    va.fromArray(pos, tris[t] * 3); vb.fromArray(pos, tris[t + 1] * 3); vc.fromArray(pos, tris[t + 2] * 3);
    fn.subVectors(vc, vb).cross(va.clone().sub(vb));
    for (let e = 0; e < 3; e++) { const o = tris[t + e] * 3; nrm[o] += fn.x; nrm[o + 1] += fn.y; nrm[o + 2] += fn.z; }
  }
  for (let k = 0; k < m; k++) {
    const o = k * 3, l = Math.hypot(nrm[o], nrm[o + 1], nrm[o + 2]) || 1;
    nrm[o] /= l; nrm[o + 1] /= l; nrm[o + 2] /= l;
    // Keep the cloth's normal on the body's side of outward (thin slivers can flip).
    if (nrm[o] * bn[o] + nrm[o + 1] * bn[o + 1] + nrm[o + 2] * bn[o + 2] < 0) { nrm[o] = bn[o]; nrm[o + 1] = bn[o + 1]; nrm[o + 2] = bn[o + 2]; }
  }
  // 5. The lip: for each boundary edge a quad from the cloth edge down to the body.
  const outPos = Array.from(pos), outNrm = Array.from(nrm), outTris = tris.slice();
  const src0 = Array.from(verts); // welded source per output vertex (skin weights)
  const isLip = [];
  for (let k = 0; k < m; k++) isLip.push(0);
  if (lip) {
    const inner = new Map();
    const innerOf = (k) => {
      let v = inner.get(k);
      if (v !== undefined) return v;
      v = outPos.length / 3;
      const o = k * 3;
      outPos.push(base[o] + bn[o] * 0.0006, base[o + 1] + bn[o + 1] * 0.0006, base[o + 2] + bn[o + 2] * 0.0006);
      outNrm.push(nrm[o], nrm[o + 1], nrm[o + 2]);
      src0.push(verts[k]);
      isLip.push(1);
      inner.set(k, v);
      return v;
    };
    for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = tris[t + e], b = tris[t + (e + 1) % 3];
      if (edgeUse.get(ek(a, b)) !== 1) continue;
      // The triangle runs a -> b; the lip on its far side runs b -> a so it faces outward.
      const ia = innerOf(a), ib = innerOf(b);
      outTris.push(b, a, ia, b, ia, ib);
    }
  }
  const N = outPos.length / 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(outNrm, 3));
  const si = new Uint16Array(N * 4), sw = new Float32Array(N * 4), uv = new Float32Array(N * 2).fill(0.001), col = new Float32Array(N * 3);
  const fixed = typeof color === 'number' ? linear(color).clone() : null;
  const reg = region ? new Array(N) : null;
  for (let k = 0; k < N; k++) {
    const i = W.first[src0[k]];
    for (let c = 0; c < 4; c++) { si[k * 4 + c] = SI.getComponent(i, c); sw[k * 4 + c] = SW.getComponent(i, c); }
    p.fromArray(outPos, k * 3); n.fromArray(outNrm, k * 3);
    const cc = fixed ?? linear(color(p, n));
    col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b;
    if (reg) reg[k] = region(p, n, !!isLip[k]);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(outTris);
  if (reg) g.userData.regionOf = reg;
  return g;
}

// Relaxes a body geometry in place (a clone you own): Laplacian smoothing over the welded
// surface, weight(p) 0..1 per vertex (0 keeps a face or hand exactly). Lumpy sculpted limbs turn
// into clean comic forms; UVs, skin weights and the vertex count are unchanged, so a painted
// texture still fits. Normals are recomputed across the welded seams.
export function relaxBody(geo, { passes = 4, amount = 0.5, weight = () => 1 } = {}) {
  const P = geo.attributes.position, idx = geo.index.array;
  const W = weld(geo);
  const m = W.count;
  const pos = new Float32Array(m * 3), w = new Float32Array(m);
  const p = new THREE.Vector3();
  for (let j = 0; j < m; j++) { p.fromBufferAttribute(P, W.first[j]); p.toArray(pos, j * 3); w[j] = clamp01(weight(p)); }
  const nbr = Array.from({ length: m }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = W.id[idx[t + e]], b = W.id[idx[t + (e + 1) % 3]];
    if (a !== b) { nbr[a].add(b); nbr[b].add(a); }
  }
  const lists = nbr.map((s) => [...s]);
  const tmp = new Float32Array(m * 3);
  for (let s = 0; s < passes; s++) {
    // Taubin's lambda/mu pair: smooth, then inflate a little, so the figure does not shrink.
    for (const k of [amount, -amount * 1.04]) {
      for (let j = 0; j < m; j++) {
        const o = j * 3, L = lists[j];
        if (!L.length || !w[j]) { tmp[o] = pos[o]; tmp[o + 1] = pos[o + 1]; tmp[o + 2] = pos[o + 2]; continue; }
        let sx = 0, sy = 0, sz = 0;
        for (const q of L) { sx += pos[q * 3]; sy += pos[q * 3 + 1]; sz += pos[q * 3 + 2]; }
        const a = k * w[j] / L.length;
        tmp[o] = pos[o] + (sx - pos[o] * L.length) * a;
        tmp[o + 1] = pos[o + 1] + (sy - pos[o + 1] * L.length) * a;
        tmp[o + 2] = pos[o + 2] + (sz - pos[o + 2] * L.length) * a;
      }
      pos.set(tmp);
    }
  }
  const out = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) { const j = W.id[i]; out[i * 3] = pos[j * 3]; out[i * 3 + 1] = pos[j * 3 + 1]; out[i * 3 + 2] = pos[j * 3 + 2]; }
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  // Welded normals, so the old seams do not show as creases.
  geo.computeVertexNormals();
  const N = geo.attributes.normal, acc = new Float32Array(m * 3);
  for (let i = 0; i < P.count; i++) { const j = W.id[i]; acc[j * 3] += N.getX(i); acc[j * 3 + 1] += N.getY(i); acc[j * 3 + 2] += N.getZ(i); }
  for (let i = 0; i < P.count; i++) {
    const j = W.id[i], l = Math.hypot(acc[j * 3], acc[j * 3 + 1], acc[j * 3 + 2]) || 1;
    N.setXYZ(i, acc[j * 3] / l, acc[j * 3 + 1] / l, acc[j * 3 + 2] / l);
  }
  WELDS.delete(geo); // positions moved: a later drape over this geometry re-welds it
  return geo;
}

function emptyGeometry() {
  const g = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2], ['skinWeight', 4]]) g.setAttribute(name, new THREE.Float32BufferAttribute([], size));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([], 4));
  g.setIndex([]);
  return g;
}

// Covered: whether a body vertex lies under a garment's pick, for hiding the body under it.
// (The garment and the body test the same pick, so nothing of the body pokes through.)
export const covers = (pick) => (p, n) => pick(p, n);
