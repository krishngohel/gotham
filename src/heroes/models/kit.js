// The character kit: everything the model builders share for dressing the one 65-bone body.
//
// Why it exists: a character used to be the body plus one mesh (and one ink hull) per rigid
// part, so Batman's fins, pouches, ears and lenses alone were 34 draw calls. Here every part a
// character wears is baked into skinned geometry bound to the body's own skeleton and merged:
//
//   - rigid(geo, { bone, pos, rot })  a primitive placed in bind space and bound 100% to one
//     bone (what attachRigid does, but as vertices instead of a child mesh);
//   - skinned(geo)                     geometry already carrying skinIndex/skinWeight for the
//     body's skeleton: a shell lifted off the body surface (cowl, coat, trousers), a skirt
//     weighted between the thighs, or the painted body itself;
//
// and kit.build() turns them into one SkinnedMesh per material slot ('lit' toon + rim,
// 'unlit' for lenses and emblems that must stay paper-white at night) plus one ink hull for the
// lot, whose width is a per-vertex attribute so ears can ink heavier than a lapel. Colours are
// vertex colours, so every character with the same slot settings shares one material.
//
// The other helpers here are pure geometry on the bind pose (metres, Y up, the model faces
// lm.fwd on z): shells, skirts, radial body reshaping around the bone segments (slimmer or
// heavier builds without touching the skeleton, so every clip still fits), crisp region paint.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from '../../render/toon.js';
import { LAYER_FX } from '../../render/layers.js';
import { PALETTE } from '../../config/palette.js';
import { addRim } from '../../actors/outfitParts.js';
import { bindPosition } from '../../actors/rig.js';

const _c = new THREE.Color();
export const linear = (hex) => _c.setHex(hex); // THREE.Color converts sRGB hex to working (linear) space

// ---------------------------------------------------------------- shared materials

const MATS = new Map();
// The lit slot: a toon material on vertex colours with the hero rim. `lift` is the shadow floor
// (heroes 0.55 so a dark suit keeps its colour on the unlit side, the cast 0.32).
export function kitMaterial({ lift = 0.32, rim = 0x9fc3ff, rimStrength = 0.8, map = null } = {}) {
  const key = `lit|${lift}|${rim}|${rimStrength}|${map?.uuid ?? ''}`;
  let m = MATS.get(key);
  if (!m) {
    m = addRim(toonMaterial({ vertexColors: true, map }), rim, rimStrength, [0.5, 0.62], lift);
    MATS.set(key, m);
  }
  return m;
}
export function unlitMaterial() {
  let m = MATS.get('unlit');
  if (!m) { m = new THREE.MeshBasicMaterial({ vertexColors: true }); MATS.set('unlit', m); }
  return m;
}
// Ink hull for merged kit meshes: pushes each vertex out along a smoothed normal (shared by all
// vertices at one position, so box corners do not split the line) by its own outlineW.
export function kitHullMaterial(color = PALETTE.ink) {
  const key = `hull|${color}`;
  let m = MATS.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute float outlineW;\nattribute vec3 outlineN;\n' + shader.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>
	#ifdef USE_SKINNING
	transformed += normalize((skinMatrix * vec4(outlineN, 0.0)).xyz) * outlineW;
	#else
	transformed += normalize(outlineN) * outlineW;
	#endif`);
    };
    m.customProgramCacheKey = () => 'kit-hull';
    MATS.set(key, m);
  }
  return m;
}

// ---------------------------------------------------------------- geometry helpers

const boneIndexCache = new WeakMap();
export function boneIndex(skeleton, name) {
  let map = boneIndexCache.get(skeleton);
  if (!map) { map = new Map(skeleton.bones.map((b, i) => [b.name, i])); boneIndexCache.set(skeleton, map); }
  const i = map.get(name);
  if (i === undefined) throw new Error(`No bone named ${name}`);
  return i;
}

// Normals averaged over every vertex sharing a position (quantised to 0.1 mm).
function smoothNormals(pos, nrm) {
  const sum = new Map();
  const key = (i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const k = key(i);
    let s = sum.get(k);
    if (!s) { s = [0, 0, 0]; sum.set(k, s); }
    s[0] += nrm[i * 3]; s[1] += nrm[i * 3 + 1]; s[2] += nrm[i * 3 + 2];
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = sum.get(key(i));
    const l = Math.hypot(s[0], s[1], s[2]) || 1;
    out[i * 3] = s[0] / l; out[i * 3 + 1] = s[1] / l; out[i * 3 + 2] = s[2] / l;
  }
  return out;
}

// Normalises any geometry into the kit's attribute layout (all float, indexed).
function kitGeometry(src, { color, outline, smooth = true, skinIndex = null, skinWeight = null, uv = null }) {
  const g = src.index ? src : src.setIndex([...Array(src.attributes.position.count).keys()]);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), ow = new Float32Array(n), uvs = new Float32Array(n * 2);
  const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, UV = g.attributes.uv;
  const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const base = linear(typeof color === 'number' ? color : 0xffffff).clone();
  for (let i = 0; i < n; i++) {
    pos[i * 3] = P.getX(i); pos[i * 3 + 1] = P.getY(i); pos[i * 3 + 2] = P.getZ(i);
    const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i), l = Math.hypot(nx, ny, nz) || 1;
    nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l;
    if (C) { col[i * 3] = C.getX(i); col[i * 3 + 1] = C.getY(i); col[i * 3 + 2] = C.getZ(i); } else { col[i * 3] = base.r; col[i * 3 + 1] = base.g; col[i * 3 + 2] = base.b; }
    if (SI) { for (let k = 0; k < 4; k++) { si[i * 4 + k] = SI.getComponent(i, k); sw[i * 4 + k] = SW.getComponent(i, k); } } else { si[i * 4] = skinIndex; sw[i * 4] = skinWeight ?? 1; }
    ow[i] = typeof outline === 'function' ? outline(i) : outline;
    if (UV && !uv) { uvs[i * 2] = UV.getX(i); uvs[i * 2 + 1] = UV.getY(i); } else if (uv) { uvs[i * 2] = uv[0]; uvs[i * 2 + 1] = uv[1]; }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  out.setAttribute('outlineW', new THREE.BufferAttribute(ow, 1));
  out.setAttribute('outlineN', new THREE.BufferAttribute(smooth ? smoothNormals(pos, nrm) : nrm.slice(), 3));
  out.setIndex(g.index.array.slice ? Array.from(g.index.array) : g.index);
  return out;
}

// Kit geometry from any source. With `bone` (and a skeleton) the geometry is a rigid part placed
// in bind space by pos/rot (Euler or array)/quat/scale and bound 100% to that bone; without, it
// must carry its own skin attributes (a shell, a skirt, a painted body).
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
export function createKitGeometry(geo, { bone = null, skeleton = null, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, quat = null, color, outline = 0.006, smooth = true }) {
  if (!bone) return kitGeometry(geo, { color, outline, smooth });
  const g = geo.clone();
  _q.copy(quat ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...(Array.isArray(rot) ? rot : [rot.x, rot.y, rot.z]))));
  _s.set(...(typeof scale === 'number' ? [scale, scale, scale] : scale));
  _m.compose(new THREE.Vector3(...(Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z])), _q, _s);
  g.applyMatrix4(_m);
  // A mirrored placement turns the triangles inside out: flip them back.
  if (_s.x * _s.y * _s.z < 0) {
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    const a = g.index.array;
    for (let t = 0; t < a.length; t += 3) { const s = a[t]; a[t] = a[t + 2]; a[t + 2] = s; }
    g.computeVertexNormals();
  }
  return kitGeometry(g, { color, outline, smooth, skinIndex: boneIndex(skeleton, bone), uv: [0.001, 0.001] });
}

// ---------------------------------------------------------------- the kit

// Slot options: { lift, rim, rimStrength, map, unlit, layer, cast }. 'lit' and 'unlit' exist
// by default; a character may add more (Batwoman keeps her ears on the cast's lift).
export function createKit(ch, { lift = 0.32, rim = 0x9fc3ff, rimStrength = 0.8, map = null, layer = 0 } = {}) {
  const body = ch.body;
  const skeleton = body.skeleton;
  const slots = new Map([
    ['lit', { lift, rim, rimStrength, map, parts: [] }],
    ['unlit', { unlit: true, parts: [] }],
  ]);
  const kit = {
    slot(name, opts) { slots.set(name, { ...opts, parts: [] }); return kit; },
    // A primitive in bind space bound rigidly to `bone`.
    rigid(geo, { slot = 'lit', color = PALETTE.ink, ...opts }) {
      slots.get(slot).parts.push(createKitGeometry(geo, { ...opts, color, skeleton }));
      return kit;
    },
    // Geometry with its own skin attributes (indices into the body's skeleton).
    skinned(geo, { color = null, outline = 0.006, slot = 'lit', smooth = true }) {
      slots.get(slot).parts.push(kitGeometry(geo, { color, outline, smooth }));
      return kit;
    },
    // Merges each slot into one skinned mesh under the body (plus one hull for all of them).
    // Returns the meshes so a caller can keep a handle (e.g. to hide a cowl).
    build({ outline = true, layer: lay = layer } = {}) {
      const made = [];
      for (const [name, s] of slots) {
        if (!s.parts.length) continue;
        const geo = mergeGeometries(s.parts, false);
        for (const p of s.parts) p.dispose();
        s.parts.length = 0;
        geo.computeBoundingSphere();
        const mat = s.unlit ? unlitMaterial() : kitMaterial(s);
        const mesh = new THREE.SkinnedMesh(geo, mat);
        mesh.name = `kit-${name}`;
        mesh.bind(skeleton, body.bindMatrix);
        mesh.frustumCulled = false;
        mesh.castShadow = !s.unlit;
        mesh.layers.set(s.layer ?? lay);
        body.parent.add(mesh);
        if (outline && !s.noHull) {
          const hull = new THREE.SkinnedMesh(geo, kitHullMaterial());
          hull.bind(skeleton, body.bindMatrix);
          hull.layers.set(LAYER_FX);
          hull.frustumCulled = false;
          hull.castShadow = false;
          mesh.add(hull);
        }
        made.push(mesh);
      }
      return made;
    },
  };
  return kit;
}

// ---------------------------------------------------------------- shells, skirts, reshaping

// A layer lifted off the body: every body triangle whose three vertices pass pick(p, n) is copied
// with its skin weights and pushed out along the normal by offset(p, n) metres (a number or a
// function), with extra shaping from push(p, n, out) (adds to `out`, a Vector3, in metres).
// color(p, n) -> hex per vertex (or one hex). The copy's edges ink from the depth pass, which
// is what makes a cowl or a coat read as a separate piece of costume.
export function shell(srcGeo, { pick, offset = 0.006, push = null, color = PALETTE.ink, uv: keepUv = true }) {
  const P = srcGeo.attributes.position, N = srcGeo.attributes.normal, idx = srcGeo.index.array;
  const SI = srcGeo.attributes.skinIndex, SW = srcGeo.attributes.skinWeight, UV = srcGeo.attributes.uv;
  const p = new THREE.Vector3(), n = new THREE.Vector3(), d = new THREE.Vector3();
  const ok = new Uint8Array(P.count);
  for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i).normalize(); ok[i] = pick(p, n) ? 1 : 0; }
  const remap = new Int32Array(P.count).fill(-1);
  const tris = [];
  let count = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (!(ok[a] && ok[b] && ok[c])) continue;
    for (const v of [a, b, c]) { if (remap[v] < 0) remap[v] = count++; tris.push(remap[v]); }
  }
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), col = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const si = new Uint16Array(count * 4), sw = new Float32Array(count * 4);
  const fixed = typeof color === 'number' ? linear(color).clone() : null;
  for (let i = 0; i < P.count; i++) {
    const j = remap[i];
    if (j < 0) continue;
    p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i).normalize();
    const off = typeof offset === 'function' ? offset(p, n) : offset;
    d.copy(n).multiplyScalar(off);
    if (push) push(p, n, d);
    pos[j * 3] = p.x + d.x; pos[j * 3 + 1] = p.y + d.y; pos[j * 3 + 2] = p.z + d.z;
    nrm[j * 3] = n.x; nrm[j * 3 + 1] = n.y; nrm[j * 3 + 2] = n.z;
    const c = fixed ?? linear(color(p, n));
    col[j * 3] = c.r; col[j * 3 + 1] = c.g; col[j * 3 + 2] = c.b;
    // uv: false parks the shell on the line textures' white corner (a hood must not show brows).
    if (UV && keepUv) { uv[j * 2] = UV.getX(i); uv[j * 2 + 1] = UV.getY(i); } else { uv[j * 2] = 0.001; uv[j * 2 + 1] = 0.001; }
    for (let k = 0; k < 4; k++) { si[j * 4 + k] = SI.getComponent(i, k); sw[j * 4 + k] = SW.getComponent(i, k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(tris);
  return g;
}

// A skirt / coat hem: an open tube from the hips down, each vertex weighted between the pelvis
// and the thigh (then calf) on its own side, so the hem follows the legs in a stride instead of
// cutting through them. top/bottom are bind-pose heights; rTop/rBottom the radii (x, z scaled by
// depth); open: half-angle of a front opening (a coat), 0 for a closed skirt.
export function skirt(body, lm, { top, bottom, rTop = 0.17, rBottom = 0.22, depth = 0.82, open = 0, from = null, to = null, back = 0, segs = 20, rows = 5, color = 0x333333, zShift = 0 }) {
  const sk = body.skeleton;
  const bi = (n) => boneIndex(sk, n);
  const pelvis = bi('pelvis'), tl = bi('thigh_l'), tr = bi('thigh_r'), cl = bi('calf_l'), cr = bi('calf_r');
  const thighL = bindPosition(body, 'thigh_l');
  const sideL = Math.sign(thighL.x) || 1; // which sign of x is the left leg
  const hipZ = bindPosition(body, 'pelvis').z + zShift;
  const pos = [], si = [], sw = [], idx = [];
  // Angle 0 is the front: open leaves a gap there (a coat); from/to cut a panel (an apron).
  const a0 = from ?? open, a1 = to ?? Math.PI * 2 - open;
  const cols = segs + 1;
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = top + (bottom - top) * t;
    const rad = rTop + (rBottom - rTop) * t;
    for (let c = 0; c < cols; c++) {
      // Angle 0 is the front centre (toward lm.fwd), increasing toward +x.
      const a = a0 + (a1 - a0) * (c / segs);
      const x = Math.sin(a) * rad, z = hipZ + Math.cos(a) * rad * depth * lm.fwd - (back && Math.cos(a) < 0 ? back * t * -Math.cos(a) * lm.fwd : 0);
      pos.push(x, y, z);
      // Leg share grows with depth below the hips; the side decides which leg.
      const legW = Math.min(1, Math.max(0, (top - y) / 0.3));
      const left = Math.sign(x) === sideL;
      const across = Math.min(1, Math.abs(x) / (rad * 0.6 + 1e-4)); // centre-front/back hems split between both legs
      const thigh = left ? tl : tr, other = left ? tr : tl;
      const calf = left ? cl : cr;
      const below = y < lm.kneeY + 0.1 ? Math.min(1, (lm.kneeY + 0.1 - y) / 0.2) * 0.5 : 0;
      const wMine = legW * (0.5 + 0.5 * across) * (1 - below);
      const wOther = legW * (0.5 - 0.5 * across) * (1 - below);
      const wCalf = legW * below;
      const wP = 1 - wMine - wOther - wCalf;
      si.push(pelvis, thigh, other, calf); sw.push(wP, wMine, wOther, wCalf);
    }
  }
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < segs; c++) {
    const i = r * cols + c;
    // Winding so the outside faces out for either facing direction.
    if (lm.fwd > 0) idx.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1);
    else idx.push(i, i + 1, i + cols, i + 1, i + cols + 1, i + cols);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Double the sheet with a slightly inset, reversed copy so the inside is solid from any angle.
  const inner = g.clone();
  const ip = inner.attributes.position;
  for (let i = 0; i < ip.count; i++) { const x = ip.getX(i), z = ip.getZ(i) - hipZ; ip.setXYZ(i, x * 0.97, ip.getY(i), hipZ + z * 0.97); }
  const ia = inner.index.array;
  for (let t = 0; t < ia.length; t += 3) { const s = ia[t]; ia[t] = ia[t + 2]; ia[t + 2] = s; }
  inner.computeVertexNormals();
  const both = mergeGeometries([g, inner]);
  const col = new Float32Array(both.attributes.position.count * 3);
  const cc = linear(color);
  for (let i = 0; i < col.length; i += 3) { col[i] = cc.r; col[i + 1] = cc.g; col[i + 2] = cc.b; }
  both.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return both;
}

// Bone segments of the body in bind space: [boneIndex, head, tail] for every bone with a child.
const segCache = new WeakMap();
function boneSegments(body) {
  let segs = segCache.get(body.geometry);
  if (segs) return segs;
  segs = new Map();
  const bones = body.skeleton.bones;
  for (let i = 0; i < bones.length; i++) {
    const kid = bones[i].children.find((c) => c.isBone);
    const head = bindPosition(body, bones[i].name);
    const tail = kid ? bindPosition(body, kid.name) : head.clone();
    segs.set(i, { name: bones[i].name, head, tail });
  }
  segCache.set(body.geometry, segs);
  return segs;
}

// Radial reshaping: each vertex moves toward/away from the bone segment it is weighted to most,
// by factor(boneName, p) (1 = unchanged, 0.9 = 10 % slimmer). Clips only rotate bones, so the
// reshaped bind pose animates exactly like the original. Works on a geometry clone.
export function reshape(body, factor) {
  const g = body.geometry;
  const P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const segs = boneSegments(body);
  const p = new THREE.Vector3(), a = new THREE.Vector3(), ab = new THREE.Vector3(), c = new THREE.Vector3(), off = new THREE.Vector3();
  const out = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i);
    off.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = SW.getComponent(i, k);
      if (w <= 0) continue;
      const seg = segs.get(SI.getComponent(i, k));
      const f = factor(seg.name, p);
      if (f === 1) continue;
      a.copy(seg.head); ab.subVectors(seg.tail, seg.head);
      const len2 = ab.lengthSq();
      const t = len2 > 1e-8 ? Math.max(0, Math.min(1, c.subVectors(p, a).dot(ab) / len2)) : 0;
      c.copy(a).addScaledVector(ab, t); // closest point on the segment
      // Toward the axis for f < 1, away for f > 1, in proportion to this bone's weight.
      off.addScaledVector(c.sub(p), (1 - f) * w);
    }
    p.add(off);
    out[i * 3] = p.x; out[i * 3 + 1] = p.y; out[i * 3 + 2] = p.z;
  }
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  g.computeVertexNormals();
  return g;
}

// Crisp vertex-colour regions: each triangle takes the colour of region(centroid, normal); a
// vertex shared by triangles of different regions is duplicated, so region borders are hard
// edges instead of a one-triangle blur (the posterize shader does this for fixed palettes; a crowd
// of different palettes on one material cannot use it). Returns a new indexed geometry.
export function paintCrisp(src, regionColor) {
  const P = src.attributes.position, N = src.attributes.normal, idx = src.index.array;
  const names = Object.keys(src.attributes);
  const keyOf = new Map(); // vertex*1024 + colourId -> new index
  const colours = [];
  const colourId = new Map();
  const newIdx = [];
  const srcOf = [];
  const cen = new THREE.Vector3(), nn = new THREE.Vector3(), v = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    cen.set(0, 0, 0); nn.set(0, 0, 0);
    for (let k = 0; k < 3; k++) { cen.add(v.fromBufferAttribute(P, idx[t + k])); nn.add(v.fromBufferAttribute(N, idx[t + k])); }
    cen.multiplyScalar(1 / 3); nn.normalize();
    const hex = regionColor(cen, nn);
    let id = colourId.get(hex);
    if (id === undefined) { id = colours.length; colours.push(linear(hex).clone()); colourId.set(hex, id); }
    for (let k = 0; k < 3; k++) {
      const vi = idx[t + k];
      const key = vi * 1024 + id;
      let ni = keyOf.get(key);
      if (ni === undefined) { ni = srcOf.length; srcOf.push([vi, id]); keyOf.set(key, ni); }
      newIdx.push(ni);
    }
  }
  const g = new THREE.BufferGeometry();
  for (const name of names) {
    if (name === 'color') continue;
    const a = src.attributes[name];
    const arr = new (a.array.constructor)(srcOf.length * a.itemSize);
    for (let i = 0; i < srcOf.length; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.array[srcOf[i][0] * a.itemSize + k];
    g.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
  }
  const col = new Float32Array(srcOf.length * 3);
  for (let i = 0; i < srcOf.length; i++) { const c = colours[srcOf[i][1]]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(newIdx);
  return g;
}

// ---------------------------------------------------------------- primitives

// Extruded outline in the XY plane (points [[x,y],...]), centred on z, `depth` thick.
export function slab(points, depth, bevel = 0) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const capsule = (r, len, cap = 4, rad = 8) => new THREE.CapsuleGeometry(r, len, cap, rad);
export const cyl = (rt, rb, h, seg = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const sphere = (r, ws = 12, hs = 8, phiStart = 0, phiLen = Math.PI * 2, thetaStart = 0, thetaLen = Math.PI) => new THREE.SphereGeometry(r, ws, hs, phiStart, phiLen, thetaStart, thetaLen);
export const torus = (r, tube, rs = 6, ts = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(r, tube, rs, ts, arc);

// Bone origin in bind space as a plain array (for rigid placements).
export const at = (body, bone, dx = 0, dy = 0, dz = 0) => { const v = bindPosition(body, bone); return [v.x + dx, v.y + dy, v.z + dz]; };

// Hand attach points for props, in bind space relative to each hand bone: a builder records
// where a held stick, staff or tray sits so gameplay code can parent props consistently.
export function handPoints(body) {
  return { l: { bone: 'hand_l', pos: bindPosition(body, 'hand_l') }, r: { bone: 'hand_r', pos: bindPosition(body, 'hand_r') } };
}
