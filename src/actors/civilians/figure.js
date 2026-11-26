// Dressed figures for crowds and the unmasked cast (civilians, police, Alfred, Bruce Wayne,
// story NPCs, most villains): ONE skinned mesh per figure plus one ink hull, two draw calls.
//
// A figure is plain data (see generator.js): which body, build, cut of clothes, hair, hat and
// extras (its *shape*), and a palette (its *colours*). Everything is painted by region name:
// the body's own triangles get a region from where they are on the bind pose (crisp borders,
// see kit.paintCrisp), and every shell, skirt and rigid part carries a region too. The merged
// geometry for a shape is built once and cached; a figure is a new BufferGeometry that shares
// every attribute of that template except its colour, which comes from its palette. So forty
// pedestrians in a dozen shapes upload a dozen geometries and forty small colour buffers, and all
// of them draw with one shared material (vertex colours times a shared face-lines texture).
//
// LOD: lod 1 is the same template vertex-clustered to ~3 cm (about a quarter of the triangles,
// region and bone borders kept), for figures past ~25 m. Beyond that use impostors.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '../../config/palette.js';
import { LAYER_FX } from '../../render/layers.js';
import { makeCharacter } from '../characters.js';
import { bindPosition } from '../rig.js';
import { createKitGeometry, kitMaterial, kitHullMaterial, shell, skirt, reshape, boneIndex, slab, box, cyl, sphere, torus, linear } from '../../heroes/models/kit.js';
import { frontHeightField, decal } from '../../heroes/models/shape.js';
import { drape } from '../../heroes/models/drape.js';
import { FACE_PIVOTS, faceLandmarks, createFaceRig, installFace, lidGeometry, mouthGeometry } from '../face.js';

// Regions every figure may carry that a palette need not name.
const REGION_DEFAULTS = { mouth: 0x3a1e22 };

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Body builds: radial factors around the bones (see kit.reshape).
// The base bodies are superheroes; a civilian build takes the bulk off (the clothes, drape.js,
// then hide what is left). Per-bone factors scale the flesh about each bone's axis: the skeleton,
// its rest pose and every clip are untouched, so strikes, foot planting and retargeting work on
// every build exactly as on the hero.
const pair = (o) => Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (k.endsWith('_') ? [[`${k}l`, v], [`${k}r`, v]] : [[k, v]])));
export const BUILDS = {
  // Bruce Wayne: the man in the suit, a touch less pumped than the costume's sculpt.
  athletic: pair({ spine_02: 0.96, spine_03: 0.93, clavicle_: 0.9, upperarm_: 0.8, lowerarm_: 0.86, thigh_: 0.93, calf_: 0.93, neck_01: 0.93 }),
  average: pair({ spine_01: 0.96, spine_02: 0.93, spine_03: 0.9, clavicle_: 0.9, upperarm_: 0.82, lowerarm_: 0.86, thigh_: 0.9, calf_: 0.9, neck_01: 0.9, pelvis: 0.97 }),
  slim: pair({ spine_01: 0.88, spine_02: 0.85, spine_03: 0.84, clavicle_: 0.86, upperarm_: 0.74, lowerarm_: 0.8, thigh_: 0.84, calf_: 0.86, neck_01: 0.86, pelvis: 0.93 }),
  heavy: pair({ spine_01: 1.22, spine_02: 1.16, spine_03: 1.0, pelvis: 1.1, thigh_: 1.06, calf_: 0.98, upperarm_: 0.9, lowerarm_: 0.92, neck_01: 1.04 }),
  // An older man: narrow shoulders, thin limbs, a little weight at the middle.
  elder: pair({ spine_01: 1.0, spine_02: 0.9, spine_03: 0.82, clavicle_: 0.84, upperarm_: 0.72, lowerarm_: 0.78, thigh_: 0.82, calf_: 0.84, neck_01: 0.84, pelvis: 0.95 }),
  brute: { spine_01: 1.12, spine_02: 1.15, spine_03: 1.18, clavicle_l: 1.1, clavicle_r: 1.1, upperarm_l: 1.2, upperarm_r: 1.2, lowerarm_l: 1.18, lowerarm_r: 1.18, thigh_l: 1.12, thigh_r: 1.12, calf_l: 1.1, calf_r: 1.1, neck_01: 1.2, pelvis: 1.06 },
};

// ---------------------------------------------------------------- shape templates

const TEMPLATES = new Map(); // shape key -> { geo, region: Uint8Array, names: [] }
const BODIES = new Map(); // body|build -> reshaped geometry

function bodyGeometry(ch, key, build) {
  const k = `${key}|${build}`;
  let g = BODIES.get(k);
  if (!g) {
    g = ch.body.geometry;
    if (BUILDS[build]) {
      const tmp = { geometry: g.clone(), skeleton: ch.body.skeleton, bindMatrixInverse: ch.body.bindMatrixInverse };
      reshape(tmp, (name) => BUILDS[build][name] ?? 1);
      g = tmp.geometry;
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    BODIES.set(k, g);
  }
  return g;
}

// The context a dresser works in: landmarks, the body it paints, and the part list.
// [perf2] The heavy part builds (draped garments, shells, skirts) are queued in `deferred` and run
// one per step by templateSteps(), so a crowd figure can be made a slice at a time; their slots in
// `parts` are reserved at once, so the merged order is the same as building them on the spot.
function makeContext(ch, src) {
  const { lm, body } = ch;
  const deferred = [];
  const later = (fn) => { deferred.push(fn); };
  const fwd = lm.fwd;
  const names = ['skin'];
  const nameId = (n) => { let i = names.indexOf(n); if (i < 0) { i = names.length; names.push(n); } return i; };
  const parts = []; // kit geometries tagged with a region per vertex
  const ctx = {
    lm, body, src, fwd, ch,
    bp: (n) => bindPosition(body, n),
    // Body paint: region(p, n) -> name. Several painters stack: the last one that returns a name wins.
    painters: [],
    paint(fn) { ctx.painters.push(fn); return ctx; },
    // A shell (kit.shell) painted one region (or region(p, n)), with its outline width.
    layer(opts, region, outline = 0.005) {
      const part = { geo: null, outline, skinned: true };
      parts.push(part);
      later(() => { const g = shell(src, { ...opts, color: 0xffffff, uv: opts.uv ?? false }); tag(g, region); part.geo = g; });
      return ctx;
    },
    // A garment (drape.js): a relaxed, clean-edged shell; the body under its pick is dropped.
    // region: a name, or (p, n, isLip) => name per vertex.
    garment(opts, region, outline = 0.005, { hide = true } = {}) {
      const part = { geo: null, outline, skinned: true };
      parts.push(part);
      later(() => {
        const g = drape(body, src, { ...opts, color: 0xffffff, region: typeof region === 'string' ? () => region : region });
        g.userData.region = Uint8Array.from(g.userData.regionOf, (n) => nameId(n));
        part.geo = g;
      });
      if (hide) ctx.hiders.push(opts.pick);
      return ctx;
    },
    // Body triangles whose three vertices pass any hider are not drawn (they are under cloth).
    hiders: [],
    hide(pick) { ctx.hiders.push(pick); return ctx; },
    skirt(opts, region, outline = 0.005) {
      const part = { geo: null, outline, skinned: true };
      parts.push(part);
      later(() => { const g = skirt(body, lm, { ...opts, color: 0xffffff }); tag(g, region); part.geo = g; });
      return ctx;
    },
    rigid(geo, opts, region) {
      parts.push({ geo, opts: { outline: 0.004, ...opts }, rigid: true, region });
      return ctx;
    },
    decal(points, { y, x = 0, lift = 0.005, bone = 'spine_03' }, region, outline = 0.002) {
      ctx._hf ??= frontHeightField(src, lm, lm.chestY - 0.05, fwd);
      return ctx.rigid(decal(points, ctx._hf, { y, x, lift, fwd }), { bone, outline }, region);
    },
    names, nameId, parts, deferred,
  };
  // Region per vertex for a skinned part: a fixed name, or region(p, n) per vertex.
  function tag(g, region) {
    const P = g.attributes.position, N = g.attributes.normal;
    const r = new Uint8Array(P.count);
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      if (typeof region === 'string') r[i] = nameId(region);
      else { p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i); r[i] = nameId(region(p, n)); }
    }
    g.userData.region = r;
  }
  return ctx;
}

// Builds (or fetches) the merged template for a shape. dress(ctx) paints and adds the parts.
function template(ch, key, bodyKey, build, dress, lod) {
  const full = `${key}|${lod}`;
  const t = TEMPLATES.get(full);
  if (t) return t;
  for (const _ of templateSteps(ch, key, bodyKey, build, dress, lod)) { /* all at once */ }
  return TEMPLATES.get(full);
}

// [perf2] The same build as a generator: each yield is a point where a crowd builder may hand the
// rest of the frame back (src/civilians/crowd.js builds figures a few milliseconds per frame).
function* templateSteps(ch, key, bodyKey, build, dress, lod) {
  const full = `${key}|${lod}`;
  let t = TEMPLATES.get(full);
  if (t) return;
  if (lod) {
    yield* templateSteps(ch, key, bodyKey, build, dress, 0);
    t = clusterTemplate(TEMPLATES.get(`${key}|0`), 0.03);
    TEMPLATES.set(full, t);
    return;
  }
  const src = bodyGeometry(ch, bodyKey, build);
  const ctx = makeContext(ch, src);
  dress(ctx);
  for (const job of ctx.deferred) { yield 'dress'; job(); }
  yield 'deferred';
  const skel = ch.body.skeleton;
  const geos = [];
  // 1. The body, painted with crisp regions.
  const paintFn = (p, n) => { let name = 'skin'; for (const f of ctx.painters) { const r = f(p, n); if (r) name = r; } return ctx.nameId(name); };
  let hidden = null;
  if (ctx.hiders.length) {
    const P = src.attributes.position, N = src.attributes.normal;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    hidden = new Uint8Array(P.count);
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i).normalize();
      for (const h of ctx.hiders) if (h(p, n)) { hidden[i] = 1; break; }
    }
  }
  geos.push(paintedBody(src, paintFn, 0.008, hidden));
  yield 'body';
  // 2. Eyes and brows, re-skinned onto the face pivots (face.js: indices after the body's bones
  //    in the figure's extended skeleton), plus eyelids and a mouth for blinks, looks and talk.
  if (!ctx.noFace) {
    const F = faceLandmarks(ch);
    const pivot = (name) => skel.bones.length + FACE_PIVOTS.indexOf(name);
    const sideOf = (p) => (Math.sign(p.x) === F.side_l ? 'l' : 'r');
    if (ch.eyes) geos.push(reskin(ch.eyes, skel, eyeRegion(ch, ctx), (p) => pivot(`eye_${sideOf(p)}`)));
    if (ch.brows) geos.push(reskin(ch.brows, skel, () => ctx.nameId('brow'), (p) => pivot(`brow_${sideOf(p)}`)));
    const yaw = ch.lm.fwd < 0 ? Math.PI : 0;
    const part = (geo, name, pos, region) => {
      const g = createKitGeometry(geo, { bone: 'Head', skeleton: skel, pos, rot: [0, yaw, 0], outline: 0, smooth: false });
      const si = g.attributes.skinIndex;
      for (let i = 0; i < si.count; i++) si.setX(i, pivot(name));
      g.userData.region = new Uint8Array(si.count).fill(ctx.nameId(region));
      geos.push(g);
    };
    const at = facePivotPositions(ch, src);
    for (const s of ['l', 'r']) part(lidGeometry(F[`eyeR_${s}`]), `lid_${s}`, at[`lid_${s}`].toArray(), 'skin');
    part(mouthGeometry(), 'jaw', at.jaw.toArray(), 'mouth');
  }
  // 3. Shells, skirts and rigid parts.
  for (const part of ctx.parts) {
    yield 'face/part';
    if (part.rigid) {
      const g = createKitGeometry(part.geo, { ...part.opts, skeleton: skel });
      const id = ctx.nameId(part.region);
      g.userData.region = new Uint8Array(g.attributes.position.count).fill(id);
      geos.push(g);
    } else {
      const g = createKitGeometry(part.geo, { outline: part.outline });
      g.userData.region = part.geo.userData.region;
      geos.push(g);
    }
  }
  const region = new Uint8Array(geos.reduce((s, g) => s + g.attributes.position.count, 0));
  let o = 0;
  for (const g of geos) { region.set(g.userData.region, o); o += g.attributes.position.count; }
  for (const g of geos) g.deleteAttribute('color');
  yield 'part';
  const geo = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  geo.computeBoundingSphere();
  t = { geo, region, names: ctx.names, meta: ctx.meta ?? {} };
  TEMPLATES.set(full, t);
}

// [perf2] Builds a shape's template a step at a time (a generator; nothing to do if it is cached).
// buildFigure() with the same shape afterwards only clones the skeleton and paints the colours.
export function* prepareFigure(assets, shape, { lod = 0 } = {}) {
  if (TEMPLATES.has(`${shape.key}|${lod}`)) return;
  const ch = makeCharacter(assets, shape.body);
  yield 'char';
  yield* templateSteps(ch, shape.key, shape.body, shape.build ?? 'average', shape.dress, lod);
}

// The body as kit geometry with a region per vertex (crisp borders: border triangles get their
// own vertices, see kit.paintCrisp).
function paintedBody(src, regionOf, outline, hidden = null) {
  const P = src.attributes.position, N = src.attributes.normal, idx = src.index.array;
  const keyOf = new Map(), srcOf = [], regOf = [], newIdx = [];
  const cen = new THREE.Vector3(), nn = new THREE.Vector3(), v = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    if (hidden && hidden[idx[t]] && hidden[idx[t + 1]] && hidden[idx[t + 2]]) continue;
    cen.set(0, 0, 0); nn.set(0, 0, 0);
    for (let k = 0; k < 3; k++) { cen.add(v.fromBufferAttribute(P, idx[t + k])); nn.add(v.fromBufferAttribute(N, idx[t + k])); }
    cen.multiplyScalar(1 / 3); nn.normalize();
    const r = regionOf(cen, nn);
    for (let k = 0; k < 3; k++) {
      const vi = idx[t + k], key = vi * 256 + r;
      let ni = keyOf.get(key);
      if (ni === undefined) { ni = srcOf.length; srcOf.push(vi); regOf.push(r); keyOf.set(key, ni); }
      newIdx.push(ni);
    }
  }
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
    const a = src.attributes[name];
    const arr = new Float32Array(srcOf.length * a.itemSize);
    for (let i = 0; i < srcOf.length; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(srcOf[i], k);
    g.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  g.setIndex(newIdx);
  const out = createKitGeometry(g, { outline });
  out.userData.region = Uint8Array.from(regOf);
  return out;
}

function eyeRegion(ch, ctx) {
  // Iris and pupil: the front of each eyeball within a small radius of its centre.
  const { lm } = ch;
  const iris = ctx.nameId('iris'), white = ctx.nameId('eyeWhite');
  return (p) => (Math.hypot(Math.abs(p.x) - lm.eyeSpread - 0.002, p.y - lm.eyeY) < 0.0075 && (p.z - lm.headCenter.z) * lm.fwd > lm.headRadius * 0.5 ? iris : white);
}

// Bind positions of the face pivots for a body (the same for every build: builds leave the head).
const PIVOT_AT = new WeakMap();
function facePivotPositions(ch, src) {
  let at = PIVOT_AT.get(src);
  if (at) return at;
  const F = faceLandmarks(ch);
  const fwd = ch.lm.fwd;
  at = { jaw: new THREE.Vector3(0, F.mouth.y, faceFront(src, F.mouth.y, fwd) + 0.0012 * fwd) };
  for (const s of ['l', 'r']) {
    const e = F[`eye_${s}`], r = F[`eyeR_${s}`];
    at[`eye_${s}`] = e.clone();
    at[`lid_${s}`] = new THREE.Vector3(e.x, e.y + r * 1.12, F[`eyeFront_${s}`] + 0.0016 * fwd);
    at[`brow_${s}`] = F[`brow_${s}`].clone();
  }
  PIVOT_AT.set(src, at);
  return at;
}

// Front of the face on the centre line at height y (bind space).
function faceFront(src, y, fwd) {
  const P = src.attributes.position;
  let best = -Infinity;
  for (let i = 0; i < P.count; i++) if (Math.abs(P.getX(i)) < 0.008 && Math.abs(P.getY(i) - y) < 0.008) best = Math.max(best, P.getZ(i) * fwd);
  return best * fwd;
}

function reskin(mesh, skel, regionFn, pivotFn = null) {
  const g = mesh.geometry;
  const names = new Set(skel.bones.map((b) => b.name));
  // The loader suffixes duplicate node names (pelvis_3): fall back to the base name.
  const map = mesh.skeleton.bones.map((b) => boneIndex(skel, names.has(b.name) ? b.name : b.name.replace(/_\d+$/, '')));
  const P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const si = new Float32Array(P.count * 4), sw = new Float32Array(P.count * 4);
  const r = new Uint8Array(P.count);
  const p = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i);
    const pv = pivotFn ? pivotFn(p) : -1;
    if (pv >= 0) { si[i * 4] = pv; sw[i * 4] = 1; for (let k = 1; k < 4; k++) { si[i * 4 + k] = 0; sw[i * 4 + k] = 0; } }
    else for (let k = 0; k < 4; k++) { si[i * 4 + k] = map[SI.getComponent(i, k)]; sw[i * 4 + k] = SW.getComponent(i, k); }
    r[i] = regionFn(p);
  }
  const c = new THREE.BufferGeometry();
  c.setAttribute('position', g.attributes.position);
  c.setAttribute('normal', g.attributes.normal);
  c.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  c.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  c.setIndex(g.index);
  const out = createKitGeometry(c, { outline: 0 });
  out.userData.region = r;
  return out;
}

// Vertex clustering for the far LOD: vertices that share a cell, a dominant bone and a region
// merge into one; triangles that collapse are dropped.
function clusterTemplate(base, cell) {
  const g = base.geo, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const n = P.count;
  const cluster = new Int32Array(n);
  const keys = new Map();
  const reps = [];
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; best = SI.getComponent(i, k); } }
    const key = `${Math.floor(P.getX(i) / cell)},${Math.floor(P.getY(i) / cell)},${Math.floor(P.getZ(i) / cell)},${best},${base.region[i]}`;
    let c = keys.get(key);
    if (c === undefined) { c = reps.length; reps.push(i); keys.set(key, c); }
    cluster[i] = c;
  }
  const idx = g.index.array, tris = [], seen = new Set();
  for (let t = 0; t < idx.length; t += 3) {
    const a = cluster[idx[t]], b = cluster[idx[t + 1]], c = cluster[idx[t + 2]];
    if (a === b || b === c || a === c) continue;
    const k = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(k)) continue;
    seen.add(k);
    tris.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const arr = new attr.array.constructor(reps.length * attr.itemSize);
    for (let c = 0; c < reps.length; c++) for (let k = 0; k < attr.itemSize; k++) arr[c * attr.itemSize + k] = attr.array[reps[c] * attr.itemSize + k];
    out.setAttribute(name, new THREE.BufferAttribute(arr, attr.itemSize, attr.normalized));
  }
  out.setIndex(tris);
  out.computeBoundingSphere();
  return { geo: out, region: Uint8Array.from(reps.map((i) => base.region[i])), names: base.names, meta: base.meta };
}

// ---------------------------------------------------------------- figures

// Builds a figure. shape: { key, body: 'm'|'f', build, dress(ctx) }; palette: region -> hex.
// opts: { lod, layer (LAYER_FX by default: crowds skip the crease pass), lift, height, width,
// outline (false drops the hull: a mid-distance LOD) }.
export function buildFigure(assets, shape, palette, { lod = 0, layer = LAYER_FX, lift = 0.36, rimStrength = 0.45, height = 1, width = 1, outline = true, faceTex = true } = {}) {
  const ch = makeCharacter(assets, shape.body);
  const t = template(ch, shape.key, shape.body, shape.build ?? 'average', shape.dress, lod);
  // Colours: one float triple per vertex from the palette by region name.
  const cols = t.names.map((n) => linear(palette[n] ?? REGION_DEFAULTS[n] ?? palette.default ?? 0xff00ff).clone());
  const col = new Float32Array(t.region.length * 3);
  for (let i = 0; i < t.region.length; i++) { const c = cols[t.region[i]]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  const geo = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(t.geo.attributes)) geo.setAttribute(name, attr);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(t.geo.index);
  geo.boundingSphere = t.geo.boundingSphere;
  const map = faceTex ? assets.lineTex?.[`face_${shape.body}`] ?? null : null;
  const mesh = new THREE.SkinnedMesh(geo, kitMaterial({ lift, rimStrength, map }));
  mesh.name = 'figure';
  // The extended skeleton: the body's bones plus the face pivots (face.js). The hidden body mesh
  // is never drawn, so only this skeleton is updated each frame (no extra cost).
  const rig = createFaceRig(ch, facePivotPositions(ch, bodyGeometry(ch, shape.body, shape.build ?? 'average')));
  mesh.bind(rig.skeleton, ch.body.bindMatrix);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.layers.set(layer);
  ch.body.parent.add(mesh);
  let hull = null;
  if (outline) {
    hull = new THREE.SkinnedMesh(geo, kitHullMaterial());
    hull.bind(rig.skeleton, ch.body.bindMatrix);
    hull.layers.set(LAYER_FX);
    hull.frustumCulled = false;
    hull.castShadow = false;
    mesh.add(hull);
  }
  // The source body and its eyes/brows are folded into the figure mesh.
  ch.body.visible = false;
  ch.eyes.visible = false;
  ch.brows.visible = false;
  ch.figure = mesh;
  ch.hull = hull;
  ch.root.scale.set(width, height, width);
  ch.palette = palette;
  ch.shapeKey = shape.key;
  ch.meta = { heightScale: height, cape: null, hands: { l: 'hand_l', r: 'hand_r' }, props: 'none', palette, ...t.meta };
  ch.setOutline = (on) => { if (hull) hull.visible = on; };
  // Recolour in place (a bruise appearing, a gang's colours): same template, new colour buffer.
  ch.setPalette = (next) => {
    const cs = t.names.map((n) => linear(next[n] ?? REGION_DEFAULTS[n] ?? next.default ?? 0xff00ff).clone());
    for (let i = 0; i < t.region.length; i++) { const c = cs[t.region[i]]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.attributes.color.needsUpdate = true;
    ch.palette = next;
  };
  ch.budget = () => figureBudget(ch);
  installFace(ch, rig);
  ch.animator.play('Idle_Loop');
  ch.dressed();
  return ch;
}

// What one figure costs: draw calls (colour pass; crowds sit on LAYER_FX so there is no normal
// pass draw), triangles drawn (mesh + hull), bones, and the bytes unique to this figure.
export function figureBudget(ch) {
  const tris = ch.figure.geometry.index.count / 3;
  return {
    drawCalls: 1 + (ch.hull?.visible ? 1 : 0),
    triangles: tris * (ch.hull?.visible ? 2 : 1),
    vertices: ch.figure.geometry.attributes.position.count,
    bones: ch.figure.skeleton.bones.length,
    uniqueBytes: ch.figure.geometry.attributes.color.array.byteLength,
    template: ch.shapeKey,
  };
}

export const templateCount = () => TEMPLATES.size;
