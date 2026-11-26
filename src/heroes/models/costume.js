// Shared build steps for the code-painted roster heroes (Robin, Batgirl, Red Hood, the other
// Batmen, Superman): the body painted from hero_<id>.webp (scripts/paint-suits.mjs, from the
// region maps in costumes.js) or, until that texture is loaded, the same regions as crisp vertex
// colours; optional palette swaps for alternate suits; and the head pieces several heroes share
// (cowl shell, domino mask, lenses, hair locks).
//
// Roster textures are not fetched at boot: call loadHeroTextures(assets, ['robin', ...]) when a
// hero is picked (the co-op lobby), then build. Building without them works and looks the same
// at a distance.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { toonMaterial, addHullOutline } from '../../render/toon.js';
import { makeCharacter } from '../../actors/characters.js';
import { addRim } from '../../actors/outfitParts.js';
import { bindPosition } from '../../actors/rig.js';
import { COSTUMES, costumeTexName } from './costumes.js';
import { createKit, shell, reshape, paintCrisp, linear } from './kit.js';
import { frontHeightField, decal } from './shape.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export async function loadHeroTextures(assets, ids) {
  const loader = new THREE.TextureLoader();
  const base = assets.base ?? './assets/';
  assets.suitTex ??= {};
  await Promise.all(ids.map(async (id) => {
    const key = costumeTexName(id);
    if (assets.suitTex[key]) return;
    try {
      const t = await loader.loadAsync(`${base}tex/${key}.webp`);
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      assets.suitTex[key] = t;
    } catch { /* the vertex-paint fallback covers it */ }
  }));
}

const MATS = new Map();
// The costume texture, with up to six colours swapped (alternate suits): a texel near a `from`
// colour takes the matching `to` colour at its own brightness.
function costumeMaterial(map, normalMap, swaps, key) {
  let mat = MATS.get(key);
  if (mat) return mat;
  mat = toonMaterial({ map, normalMap, normalScale: 0.4 });
  if (swaps?.length) {
    const from = swaps.map(([f]) => linear(f).clone()), to = swaps.map(([, t]) => linear(t).clone());
    while (from.length < 6) { from.push(new THREE.Color(-10, -10, -10)); to.push(new THREE.Color(0, 0, 0)); }
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFrom = { value: from };
      shader.uniforms.uTo = { value: to };
      shader.fragmentShader = 'uniform vec3 uFrom[6];\nuniform vec3 uTo[6];\n' + shader.fragmentShader.replace('#include <map_fragment>', `
	vec4 texel = texture2D(map, vMapUv);
	vec3 outC = texel.rgb;
	float bestD = 0.02;
	for (int i = 0; i < 6; i++) {
		vec3 d = texel.rgb - uFrom[i];
		float dd = dot(d, d);
		if (dd < bestD) { bestD = dd; outC = uTo[i] * (dot(texel.rgb, vec3(0.3, 0.6, 0.1)) / max(dot(uFrom[i], vec3(0.3, 0.6, 0.1)), 1e-3)); }
	}
	diffuseColor.rgb *= outC;`);
    };
    mat.customProgramCacheKey = () => 'costume-swap';
  }
  mat = addRim(mat, 0x9fc3ff, 0.8, [0.5, 0.62], 0.45);
  MATS.set(key, mat);
  return mat;
}

// Builds the painted body. opts: { build: { bone: factor }, swaps: [[fromHex, toHex], ...],
// eyes: keep the eyeballs (unmasked heroes), height }. Returns { ch, src, kit, B }.
export function costumeBody(assets, id, { build = null, swaps = null, eyes: keepEyes = false, height = 1, lift = 0.45 } = {}) {
  const cos = COSTUMES[id];
  const ch = makeCharacter(assets, cos.body);
  const { body, eyes, brows, lm } = ch;
  body.geometry = body.geometry.clone();
  if (build) reshape(body, (name) => build[name] ?? 1);
  const src = body.geometry;
  const B = (n) => bindPosition(body, n);
  const bones = new Map();
  const Bc = (n) => { let v = bones.get(n); if (!v) { v = B(n); bones.set(n, v); } return v; };
  const tex = assets.suitTex?.[costumeTexName(id)];
  if (tex) {
    body.material = costumeMaterial(tex, body.material.normalMap, swaps, `${id}|${JSON.stringify(swaps ?? [])}`);
  } else {
    const swapTo = new Map((swaps ?? []).map(([f, t]) => [f, t]));
    body.geometry = paintCrisp(src, (p, n) => { const c = cos.colors[cos.region(p, n, lm, Bc)]; return swapTo.get(c) ?? c; });
    body.material = addRim(toonMaterial({ vertexColors: true, map: assets.lineTex?.[`lines_${cos.body}`] ?? null }), 0x9fc3ff, 0.8, [0.5, 0.62], lift);
  }
  body.castShadow = true;
  eyes.visible = keepEyes;
  brows.visible = false;
  addHullOutline(body, 0.01);
  ch.root.scale.setScalar(height);
  const kit = createKit(ch, { lift, rimStrength: 0.8 });
  return { ch, src, kit, B: Bc, lm, fwd: lm.fwd };
}

// ---------------------------------------------------------------- shared head pieces

// A cowl: the head lifted off the body above a lower-face cut, a brow ridge, and its V edge.
export function cowl(src, lm, { color, frown = 1, depthV = 0.04 }) {
  const fwd = lm.fwd;
  const faceEdge = (x) => { const t = clamp01((Math.abs(x) - 0.004) / 0.046); return lm.eyeY - 0.056 + 0.02 * t * t * (3 - 2 * t); };
  const line = (x, z) => ((z - lm.headCenter.z) * fwd > 0 ? lm.neckY - depthV + Math.abs(x) * 0.7 : lm.neckY - 0.012 + Math.abs(x) * 0.5);
  return shell(src, {
    pick(p, n) {
      const ax = Math.abs(p.x);
      if (!(p.y > lm.neckY - 0.07 && ax < 0.17) || p.y <= line(p.x, p.z) - 0.004) return false;
      const front = (p.z - lm.headCenter.z) * fwd;
      return !(p.y < faceEdge(p.x) && p.y > lm.eyeY - 0.14 && ax < 0.08 && front > lm.headRadius * 0.08 && n.z * fwd > -0.1);
    },
    offset: (p) => 0.0035 + 0.003 * clamp01((p.y - lm.neckY) / 0.06),
    push(p, n, d) {
      const nz = n.z * fwd;
      if (nz < 0.15) return;
      const ax = Math.abs(p.x);
      const k = Math.exp(-(((p.y - (lm.eyeY + 0.01 + ax * 0.22)) / 0.011) ** 2)) * clamp01(1 - ax / 0.075) * clamp01((nz - 0.15) / 0.4);
      d.z += 0.009 * frown * k * fwd;
      d.y -= 0.002 * frown * k;
    },
    color, uv: false,
  });
}

// A domino mask over the eyes with swept-up wings.
export function domino(src, lm, color = 0x0c0c12) {
  const fwd = lm.fwd;
  return shell(src, {
    pick: (p, n) => {
      if (n.z * fwd < 0.15 || p.y < lm.neckY + 0.05) return false;
      const ax = Math.abs(p.x);
      if (ax > 0.088 || (p.z - lm.headCenter.z) * fwd < lm.headRadius * 0.15) return false;
      const lo = ax < 0.012 ? lm.eyeY - 0.006 : lm.eyeY - 0.022 + ax * 0.12;
      return p.y > lo && p.y < lm.eyeY + 0.026 + ax * 0.25;
    },
    offset: 0.004, color, uv: false,
  });
}

// White lenses seated on a shell (cowl or mask) over each eye.
export function lenses(kit, shellGeo, lm, { color = PALETTE.paper, w = 0.017, h = 0.0085, angular = false } = {}) {
  const fwd = lm.fwd;
  const P = shellGeo.attributes.position;
  for (const side of [-1, 1]) {
    const x = side * lm.eyeSpread, y = lm.eyeY + 0.003;
    let z = -Infinity;
    for (let i = 0; i < P.count; i++) if (Math.abs(P.getX(i) - x) < 0.012 && Math.abs(P.getY(i) - y) < 0.012) z = Math.max(z, P.getZ(i) * fwd);
    const geo = angular
      ? new THREE.ShapeGeometry(new THREE.Shape([[-0.021, -0.004], [-0.014, 0.004], [0.019, 0.01], [0.025, 0.004], [0.012, -0.007], [-0.011, -0.008]].map(([u, v]) => new THREE.Vector2(u * side * fwd, v))))
      : new THREE.CircleGeometry(1, 16).scale(w, h, 1);
    kit.rigid(geo, { bone: 'Head', slot: 'unlit', color, outline: 0, pos: [x, y, (z + 0.0015) * fwd], rot: [0, (fwd < 0 ? Math.PI : 0) + side * 0.4 * fwd, angular ? 0 : -side * 0.18] });
  }
}

// Hair: a cap lifted off the scalp plus swept locks and an optional fringe (see nightwing.js).
export function hairLocks(kit, src, lm, { color = 0x111118, volume = 0.014, fringe = true, locks = 10, sweep = 1 } = {}) {
  const fwd = lm.fwd, hc = lm.headCenter, r = lm.headRadius;
  const hairline = (p) => {
    const front = (p.z - hc.z) * fwd / r;
    const top = lm.eyeY + 0.05, side = lm.eyeY + 0.018, nape = lm.neckY + 0.07;
    if (front > 0.35) return top;
    if (front > -0.25) return side + (top - side) * clamp01((front + 0.25) / 0.6);
    return nape + (side - nape) * clamp01((front + 0.9) / 0.65);
  };
  kit.skinned(shell(src, { pick: (p) => p.y > lm.neckY + 0.02 && Math.abs(p.x) < 0.14 && p.y > hairline(p), offset: (p) => 0.006 + volume * clamp01((p.y - lm.eyeY) / 0.12), push: (p, n, d) => { d.z -= 0.007 * sweep * clamp01((p.y - lm.eyeY - 0.03) / 0.1) * fwd; }, color, uv: false }), { outline: 0.005 });
  const up = new THREE.Vector3(0, 1, 0);
  const lock = (len, rad) => new THREE.ConeGeometry(rad, len, 5).translate(0, len / 2, 0).scale(1, 1, 0.45);
  const place = (az, el, dir, len, rad) => {
    const d = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el) * fwd);
    const pos = new THREE.Vector3(hc.x, hc.y + 0.01, hc.z).addScaledVector(d, r * 0.98);
    kit.rigid(lock(len, rad), { bone: 'Head', color, outline: 0.004, pos: [pos.x, pos.y, pos.z], quat: new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()) });
  };
  const L = [[0.35, 0.95, 0.11, 0.2], [-0.3, 1.0, 0.12, 0.22], [0.05, 0.75, 0.11, 0.25], [0.9, 0.7, 0.1, 0.12], [-0.85, 0.72, 0.1, 0.12], [1.5, 0.45, 0.09, 0.0], [-1.5, 0.45, 0.09, 0.0], [2.3, 0.5, 0.1, 0.05], [-2.3, 0.5, 0.1, 0.05], [3.0, 0.55, 0.1, 0.1]];
  for (const [az, el, len, lift] of L.slice(0, locks)) place(az, el, new THREE.Vector3(Math.sin(az) * 0.35, lift, -1 * fwd * sweep), len, 0.03);
  if (fringe) for (const [az, el, sx] of [[0.3, 0.62, 0.4], [-0.15, 0.66, -0.25], [0.65, 0.5, 0.7]]) place(az, el, new THREE.Vector3(sx, -0.75, 0.5 * fwd), 0.08, 0.022);
}

// A chest decal (emblem, glyph, backing plate) that is skinned like the chest under it: every
// vertex copies the skin weights of the nearest front-facing body vertex, so the decal flexes with
// the torso instead of sliding into it when the spine bones bend (a decal bound rigidly to one
// spine bone crumples into the pecs on every idle breath). It sits on the local maximum of the
// front height field (5 cm window), so it rides smoothly over the chest's mesh noise.
// Returns skinned geometry for kit.skinned.
export function chestDecal(src, lm, points, { y, x = 0, lift = 0.005, color = 0xffffff, hf = null }) {
  const fwd = lm.fwd;
  const field = hf ?? frontHeightField(src, lm, lm.chestY, fwd);
  const smooth = (px, py) => { let m = -Infinity; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) m = Math.max(m, field(px + i * 0.012, py + j * 0.012)); return m; };
  let g = decal(points, smooth, { y, x, lift, fwd });
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  const P = src.attributes.position, N = src.attributes.normal, SI = src.attributes.skinIndex, SW = src.attributes.skinWeight;
  const cand = [];
  for (let i = 0; i < P.count; i++) {
    if (N.getZ(i) * fwd < 0.05 || Math.abs(P.getX(i)) > lm.shoulderX + 0.02) continue;
    const py = P.getY(i);
    if (py < y - 0.25 || py > y + 0.25) continue;
    cand.push(i);
  }
  const G = g.attributes.position, n = G.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3);
  const c = linear(color).clone();
  // Weights blended over every body vertex within 4 cm (falling off with distance) so neighbouring
  // decal vertices, and stacked decals, deform alike: no tears where the nearest vertex changes.
  const R = 0.04;
  const acc = new Map();
  for (let v = 0; v < n; v++) {
    const vx = G.getX(v), vy = G.getY(v), vz = G.getZ(v);
    acc.clear();
    let r = R;
    while (!acc.size) {
      for (const i of cand) {
        const d = Math.sqrt((P.getX(i) - vx) ** 2 + (P.getY(i) - vy) ** 2 + (P.getZ(i) - vz) ** 2);
        if (d > r) continue;
        const f = (1 - d / r) ** 2;
        for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > 0) { const b = SI.getComponent(i, k); acc.set(b, (acc.get(b) ?? 0) + w * f); } }
      }
      r *= 2;
    }
    const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
    for (let k = 0; k < 4; k++) { si[v * 4 + k] = top[k]?.[0] ?? 0; sw[v * 4 + k] = top[k] ? top[k][1] / sum : 0; }
    col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// A stiff collar standing behind the neck (capes hang from it).
export function collar(kit, B, lm, color, { r = 0.1, h = 0.08, arc = Math.PI } = {}) {
  const neck = B('neck_01');
  const fwd = lm.fwd;
  const g = new THREE.CylinderGeometry(r, r * 0.82, h, 16, 1, true, Math.PI * 0.5 + (Math.PI - arc) / 2, arc);
  kit.rigid(g, { bone: 'spine_03', color, outline: 0.005, pos: [0, neck.y + 0.005, neck.z - 0.012 * fwd], rot: [-0.18 * fwd, fwd < 0 ? Math.PI : 0, 0] });
  kit.rigid(g, { bone: 'spine_03', color, outline: 0, pos: [0, neck.y + 0.005, neck.z - 0.012 * fwd], rot: [-0.18 * fwd, fwd < 0 ? Math.PI : 0, 0], scale: [-0.97, 1, 0.97] });
}

// A teenager: narrower everywhere, a little shorter (with root height 0.9).
export const TEEN = { spine_01: 0.88, spine_02: 0.86, spine_03: 0.86, clavicle_l: 0.88, clavicle_r: 0.88, upperarm_l: 0.8, upperarm_r: 0.8, lowerarm_l: 0.84, lowerarm_r: 0.84, thigh_l: 0.86, thigh_r: 0.86, calf_l: 0.88, calf_r: 0.88, neck_01: 0.88, pelvis: 0.92 };
