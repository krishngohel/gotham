// Batman, every suit but Batwoman's: the male body painted from one region mask
// (public/assets/tex/bat_m_mask.webp, see scripts/paint-suits.mjs) recoloured per suit, plus a
// modelled costume merged into two skinned meshes (see kit.js):
//
//   cowl     a shell lifted off the head: a frowning brow ridge, the nose and cheek guards, the
//            lower edge a V on the chest; the jaw and mouth stay bare skin;
//   lenses   angular white lenses sitting on the shell, unlit so they read at 30 m;
//   ears     tall, narrow and swept back, part of the cowl;
//   collar   a raised cape collar round the back of the neck and a mantle over each shoulder
//            that the cloth cape (cape.js, via meta.cape) hangs from;
//   belt     pouches and canisters following the measured waist, a buckle;
//   gauntlets Quaternius ranger bracers recoloured, three swept blades on the outer edge;
//   boots    the body's own, painted with treads, a raised cuff and a thick sole;
//   suit extras from the suit table (suits.js): armour plates, fur collar, trunks, oval emblem.
//
// createBat(assets, id) in characters.js dispatches here; this file only builds.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '../../config/palette.js';
import { batOutline } from '../../config/batShape.js';
import { toonMaterial, addHullOutline } from '../../render/toon.js';
import { LAYER_FX } from '../../render/layers.js';
import { makeCharacter, paintRegions, splitBody, HERO_LIFT, heroRim } from '../../actors/characters.js';
import { wear, duotone, hideBody, addRim, isSkinMaterial } from '../../actors/outfitParts.js';
import { bindPosition } from '../../actors/rig.js';
import { classifySuitVertex } from '../../actors/outfits.js';
import { suitById } from './suits.js';
import { createKit, shell, slab, box, cyl, sphere, torus, linear, reshape } from './kit.js';
import { drape, relaxBody } from './drape.js';
import { waistProfile, frontHeightField, decal } from './shape.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------------------------------------------------------------- the recoloured suit material

const MASK_MATS = new Map();
// The mask texture is raw data (NoColorSpace): R/G pick the region, B the ink.
function maskMaterial(map, normalMap, pal, key, head = false) {
  const k = `${key}|${head}`;
  let mat = MASK_MATS.get(k);
  if (mat) return mat;
  mat = toonMaterial({ map, normalMap: head ? null : normalMap, normalScale: 0.45 });
  const u = {
    uSuit: { value: linear(head ? pal.skin : pal.suit).clone() }, uDark: { value: linear(pal.dark).clone() },
    uAccent: { value: linear(head ? pal.skin : pal.accent).clone() }, uEmblem: { value: linear(head ? pal.skin : pal.emblem).clone() },
    uLine: { value: linear(head ? PALETTE.ink : pal.line).clone() },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = 'uniform vec3 uSuit, uDark, uAccent, uEmblem, uLine;\n' + shader.fragmentShader.replace('#include <map_fragment>', `
	vec4 mk = texture2D(map, vMapUv);
	float rr = smoothstep(0.3, 0.7, mk.r), gg = smoothstep(0.3, 0.7, mk.g), bb = smoothstep(0.25, 0.75, mk.b);
	vec3 region = mix(mix(uDark, uSuit, rr), mix(uAccent, uEmblem, rr), gg);
	diffuseColor.rgb *= mix(region, uLine, bb);`);
  };
  mat.customProgramCacheKey = () => 'bat-mask';
  mat = head ? addRim(mat, 0x9fc3ff, 0.8, [0.5, 0.62], HERO_LIFT) : heroRim(mat);
  MASK_MATS.set(k, mat);
  return mat;
}

// ---------------------------------------------------------------- shapes

// Cowl lower edge (bind-pose height at x, z): a V down the chest in front, shallower behind.
const cowlLine = (lm, x, z) => {
  const front = (z - lm.headCenter.z) * lm.fwd;
  const ax = Math.abs(x);
  return front > 0 ? lm.neckY - 0.045 + ax * 0.75 : lm.neckY - 0.015 + ax * 0.5;
};
// The bare lower face: under one smooth curve that dips under the nose and rises over the cheeks.
const faceEdge = (lm, x) => { const t = clamp01((Math.abs(x) - 0.004) / 0.046); return lm.eyeY - 0.058 + 0.022 * t * t * (3 - 2 * t); };

function cowlShell(src, lm, color) {
  const fwd = lm.fwd;
  return shell(src, {
    pick(p, n) {
      const ax = Math.abs(p.x);
      if (!(p.y > lm.neckY - 0.07 && ax < 0.17)) return false;
      if (p.y <= cowlLine(lm, p.x, p.z) - 0.004) return false;
      const front = (p.z - lm.headCenter.z) * fwd;
      const face = p.y < faceEdge(lm, p.x) && p.y > lm.eyeY - 0.14 && ax < 0.08 && front > lm.headRadius * 0.08 && n.z * fwd > -0.1;
      return !face;
    },
    // Thicker over the skull, thin where it meets the neck so the lower edge hugs it.
    offset: (p) => 0.004 + 0.0045 * clamp01((p.y - lm.neckY) / 0.06),
    push(p, n, d) {
      const nz = n.z * fwd;
      if (nz < 0.15) return;
      const ax = Math.abs(p.x);
      // A hard nose ridge down the centre of the mask, ending in a point over the nose.
      const nose = clamp01(1 - ax / 0.013) * clamp01((lm.eyeY + 0.02 - p.y) / 0.02) * (p.y > lm.eyeY - 0.05 ? 1 : 0);
      d.z += 0.004 * nose * fwd;
      // Brow ridge, low at the centre and rising outward: a frown carved into the cowl.
      const browY = lm.eyeY + 0.01 + ax * 0.22;
      const k = Math.exp(-(((p.y - browY) / 0.011) ** 2)) * clamp01(1 - ax / 0.075) * clamp01((nz - 0.15) / 0.4);
      d.z += 0.011 * k * fwd;
      d.y -= 0.003 * k;
      // Cheek guards: a hard plane down the side of the face.
      const cheek = Math.exp(-(((ax - 0.06) / 0.014) ** 2)) * clamp01((lm.eyeY - 0.005 - p.y) / 0.02) * (p.y > lm.eyeY - 0.075 ? 1 : 0);
      d.z += 0.004 * cheek * fwd;
      d.x += 0.004 * cheek * Math.sign(p.x);
    },
    color,
  });
}

// Front-most z of a geometry's vertices near (x, y) (bind space), for seating parts on a surface.
function frontZ(geo, x, y, fwd, r = 0.012) {
  const P = geo.attributes.position;
  let best = -Infinity;
  for (let i = 0; i < P.count; i++) {
    if (Math.abs(P.getX(i) - x) < r && Math.abs(P.getY(i) - y) < r) best = Math.max(best, P.getZ(i) * fwd);
  }
  return best * fwd;
}

// ---------------------------------------------------------------- the hero body

const HERO_BODIES = new Map();
function heroBody(ch, bulk) {
  const key = `m|${bulk}`;
  let g = HERO_BODIES.get(key);
  if (g) return g;
  const { body, lm } = ch;
  const wristX = Math.abs(bindPosition(body, 'hand_l').x) - 0.03;
  const B = { spine_01: 0.88, spine_02: 0.95, spine_03: 1.05, pelvis: 0.95, clavicle_l: 1.08, clavicle_r: 1.08, upperarm_l: 0.98, upperarm_r: 0.98, lowerarm_l: 0.96, lowerarm_r: 0.96, thigh_l: 0.96, thigh_r: 0.96, calf_l: 0.97, calf_r: 0.97 };
  const tmp = { geometry: body.geometry.clone(), skeleton: body.skeleton, bindMatrixInverse: body.bindMatrixInverse };
  reshape(tmp, (name) => 1 + ((B[name] ?? 1) - 1) + (bulk - 1) * (name.startsWith('spine') || name.startsWith('clav') || name.startsWith('upper') ? 1 : 0.5));
  g = relaxBody(tmp.geometry, {
    passes: 5, amount: 0.5,
    // Not the face, the hands or the feet (fingers, lips and toes would melt).
    weight: (p) => (p.y > lm.neckY + 0.005 && Math.abs(p.x) < 0.15 ? 0 : Math.abs(p.x) > wristX - 0.01 ? 0 : p.y < lm.ankleY + 0.02 ? 0 : 1),
  });
  HERO_BODIES.set(key, g);
  return g;
}

// ---------------------------------------------------------------- the build

// custom: { id, look } builds a Batman-family hero (future, gaslight) on the same chassis; its
// look may add lenses: false, fins: false, emblemScale/emblemDrop, palette.glove and extra(ctx),
// a hook that adds the hero's own pieces to the kit before it is merged.
export function createBatmanModel(assets, suitId = 'm', custom = null) {
  const suit = custom ?? suitById(suitId);
  const look = suit.look;
  const pal = look.palette;
  const ch = makeCharacter(assets, 'm');
  const { body, eyes, brows, lm } = ch;
  const fwd = lm.fwd;
  // The hero's proportions: the sculpt re-cut (wider lats and shoulders, a tapered waist) and
  // relaxed (the lumpy muscle groups smoothed into clean comic forms). Shared by every suit with
  // the same bulk; shells and drapes are lifted from it, so everything sits on the new body.
  const src = heroBody(ch, look.bulk ?? 1);
  const mask = assets.suitTex?.m_mask;
  body.geometry = src.clone();
  if (mask) {
    body.material = maskMaterial(mask, body.material.normalMap, pal, suit.id);
    // Only the head itself: the head material paints the mask's suit code as skin, so the
    // shoulders and trapezius must stay on the body.
    ch.head = splitBody(body, (p) => p.y > lm.eyeY - 0.15 && Math.abs(p.x) < 0.11, maskMaterial(mask, null, pal, suit.id, true));
    ch.head.layers.set(LAYER_FX);
    addHullOutline(ch.head, 0.004);
  } else {
    // No texture (a test page, a failed fetch): the same regions as vertex colours.
    const colors = { suit: pal.suit, cowl: pal.dark, skin: pal.skin, belt: pal.accent, glove: pal.dark, boot: pal.dark };
    paintRegions(body, classifySuitVertex, colors, lm);
    body.material = heroRim(toonMaterial({ vertexColors: true, normalMap: body.material.normalMap, palette: Object.values(colors) }));
  }
  body.castShadow = true;
  eyes.visible = false;
  brows.visible = false;
  addHullOutline(body, 0.011);
  // Forearms go under the gauntlets; the body keeps its own boots.
  hideBody(body, (p) => Math.abs(p.x) > lm.elbowX + 0.07);

  const kit = createKit(ch, { lift: HERO_LIFT, rimStrength: look.rimStrength ?? 0.9 });
  const dark = pal.dark;

  // --- cowl, ears, lenses
  const cowl = cowlShell(src, lm, dark);
  kit.skinned(cowl, { outline: 0.005 });
  const earScale = look.ears ?? 1;
  for (const side of [-1, 1]) {
    // Ears with presence: a broad base on the skull, a straight outer edge, a concave inner one.
    const pts = [[-0.036, -0.024], [0.03, -0.024], [0.02, 0.06], [0.008, 0.162], [-0.004, 0.1], [-0.018, 0.05], [-0.028, 0.02]].map(([u, v]) => [u * side, v]);
    kit.rigid(slab(pts, 0.03, 0.004), {
      bone: 'Head', color: dark, outline: 0.007,
      pos: [side * lm.headRadius * 0.55, lm.headTop - 0.038, lm.headCenter.z - 0.01 * fwd],
      rot: [-0.14 * fwd, fwd < 0 ? Math.PI : 0, -side * 0.1 * fwd],
      scale: [1, earScale, 1],
    });
  }
  for (const side of look.lenses === false ? [] : [-1, 1]) {
    // Angular lens: inner corner low, rising to a point at the outer edge (a fixed glare).
    const pts = [[-0.021, -0.004], [-0.014, 0.004], [0.019, 0.01], [0.025, 0.004], [0.012, -0.007], [-0.011, -0.008]].map(([u, v]) => [u * side * fwd, v]);
    const x = side * (lm.eyeSpread + 0.002), y = lm.eyeY + 0.003;
    const z = frontZ(cowl, x, y, fwd) + 0.0015 * fwd;
    kit.rigid(new THREE.ShapeGeometry(new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)))), {
      bone: 'Head', slot: 'unlit', color: pal.lens, outline: 0,
      pos: [x, y, z], rot: [0, (fwd < 0 ? Math.PI : 0) + side * 0.42 * fwd, 0], scale: [1.08, 1.08, 1],
    });
  }

  // --- cape collar and shoulder mantle (cape colour), or a fur ruff
  const ul = bindPosition(body, 'upperarm_l'), ur = bindPosition(body, 'upperarm_r');
  const neck = bindPosition(body, 'neck_01');
  const capeColor = pal.cape;
  if (look.collar === 'fur') {
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (0.15 + 0.7 * (k / 8));
      kit.rigid(sphere(0.045, 8, 6), { bone: 'spine_03', color: pal.fur, outline: 0.005,
        pos: [Math.cos(a) * 0.12, neck.y - 0.03 + Math.sin(a * 3) * 0.005, neck.z - Math.sin(a) * 0.075 * fwd], scale: [1, 0.75, 1] });
    }
  } else if (look.collar !== 'none') {
    // A stiff half-collar standing up behind the neck, flaring out at the top.
    const collar = new THREE.CylinderGeometry(0.105, 0.085, 0.085, 16, 1, true, Math.PI * 0.5, Math.PI);
    kit.rigid(collar, { bone: 'spine_03', color: capeColor, outline: 0.005, pos: [0, neck.y + 0.005, neck.z - 0.012 * fwd], rot: [-0.18 * fwd, fwd < 0 ? Math.PI : 0, 0] });
    kit.rigid(collar, { bone: 'spine_03', color: capeColor, outline: 0, pos: [0, neck.y + 0.005, neck.z - 0.012 * fwd], rot: [-0.18 * fwd, fwd < 0 ? Math.PI : 0, 0], scale: [-0.97, 1, 0.97] });
  }
  for (const [p, bone] of look.mantle === false ? [] : [[ul, 'clavicle_l'], [ur, 'clavicle_r']]) {
    kit.rigid(sphere(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), { bone, color: capeColor, outline: 0.005,
      pos: [p.x * 0.9, p.y + 0.03, p.z - 0.014 * fwd], scale: [1.12, 0.72, 1.05] });
  }

  // --- utility belt: pouches round the measured waist, canisters at the hips, a buckle
  const hipZ = bindPosition(body, 'pelvis').z;
  const waist = waistProfile(src, lm.beltY, hipZ);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    // Not the front centre (the buckle) nor the back (under the cape, where they poke through).
    if ((Math.abs(Math.cos(a)) > 0.9 && Math.cos(a) * fwd > 0) || Math.cos(a) * fwd < -0.5) continue;
    const r = waist(Math.sin(a), Math.cos(a)) + 0.019;
    const canister = Math.abs(Math.sin(a)) > 0.85;
    // Stealth carries flat pouches (a clean silhouette); the rest carry boxy ones.
    const depth = look.pouches === 'flat' ? 0.018 : 0.038;
    const geo = canister ? cyl(0.025, 0.025, 0.085, 10) : slab([[-0.03, -0.038], [0.03, -0.038], [0.034, 0.034], [-0.034, 0.034]], depth, 0.006);
    kit.rigid(geo, { bone: 'pelvis', color: pal.accent, outline: 0.004,
      pos: [Math.sin(a) * r, lm.beltY - 0.006, hipZ + Math.cos(a) * r], rot: [0, a, 0] });
    if (!canister) kit.rigid(box(0.062, 0.018, 0.034), { bone: 'pelvis', color: linearMix(pal.accent, 0x000000, 0.25), outline: 0.003,
      pos: [Math.sin(a) * (r + 0.004), lm.beltY + 0.024, hipZ + Math.cos(a) * (r + 0.004)], rot: [0.12 * Math.sign(Math.cos(a)), a, 0] });
  }
  // The belt itself: a band lifted off the waist, so it stands proud of the suit in silhouette.
  kit.skinned(shell(src, { pick: (p) => Math.abs(p.y - lm.beltY) < 0.028 && Math.abs(p.x) < lm.hipHalfWidth + 0.06, offset: 0.011, color: pal.accent }), { outline: 0.005 });
  const buckleZ = hipZ + (waist(0, fwd) + 0.008) * fwd;
  kit.rigid(slab([[-0.042, -0.026], [0.042, -0.026], [0.042, 0.026], [-0.042, 0.026]], 0.016, 0.005), { bone: 'pelvis', color: pal.accent, outline: 0.004,
    pos: [0, lm.beltY, buckleZ], rot: [0, fwd < 0 ? Math.PI : 0, 0] });

  // --- gauntlets: the ranger bracers, recoloured, and three blades on the outer edge
  const glove = pal.glove ?? dark;
  const gloveTone = { a: [0x0b0b12, glove], b: [0x0b0b12, glove] };
  const bracers = wear(ch, assets.outfits, 'Male_Ranger_Arms', (m) => (isSkinMaterial(m) ? heroRim(toonMaterial({ color: glove })) : duotone(m.map, m.normalMap, gloveTone, HERO_LIFT)));
  // The back (pinky) edge of the forearm at x: the furthest-back vertex of the body or bracer
  // within a thin slice, so each blade's root sits on the surface whatever the arm's girth.
  const geos = [src, ...bracers.map((m) => m.geometry)];
  const backAt = (x, y) => {
    let best = Infinity;
    for (const g of geos) {
      const P = g.attributes.position;
      for (let i = 0; i < P.count; i++) if (Math.abs(P.getX(i) - x) < 0.012 && Math.abs(P.getY(i) - y) < 0.06) best = Math.min(best, P.getZ(i) * fwd);
    }
    return best * fwd;
  };
  for (const [arm, hand] of look.fins === false ? [] : [['lowerarm_l', 'hand_l'], ['lowerarm_r', 'hand_r']]) {
    const e = bindPosition(body, arm), w = bindPosition(body, hand);
    const side = Math.sign(e.x);
    for (let k = 0; k < 3; k++) {
      const t = 0.34 + k * 0.18;
      const x = e.x + (w.x - e.x) * t, y = e.y + (w.y - e.y) * t;
      const pts = [[0, -0.012], [0.055, -0.012], [0.09, 0.07 - k * 0.008], [0.03, 0.01]].map(([u, v]) => [-u * side, v]);
      // Gunmetal, not the glove black: the rim light catches the fins' edges at play distance.
      kit.rigid(slab(pts, 0.009, 0.002), { bone: arm, color: pal.fin ?? 0x525a68, outline: 0.004,
        // Behind the forearm (the pinky edge in the T-pose), swept back toward the elbow.
        pos: [x, y + 0.004, backAt(x, y) + 0.006 * fwd], rot: [-Math.PI / 2 * fwd, 0, 0] });
    }
  }

  // --- boots: a smooth boot (no toes) up to a raised cuff under the knee, a thick sole,
  // a knee guard and a shin plate that break the leg's silhouette.
  const bootTop = lm.kneeY - 0.06;
  const bootPick = (p) => p.y < bootTop && Math.abs(p.x) < lm.hipHalfWidth + 0.1;
  kit.skinned(drape(body, src, { pick: bootPick, offset: 0.005, smooth: 10, edge: [(p) => bootTop - p.y], color: dark, tubes: [{ bone: 'calf_l', from: 0.55, k: 1.0 }, { bone: 'calf_r', from: 0.55, k: 1.0 }] }), { outline: 0.004 });
  hideBody(body, (p) => p.y < bootTop - 0.01 && p.y > 0.04);
  kit.skinned(drape(body, src, { pick: (p) => p.y < lm.kneeY - 0.045 && p.y > lm.kneeY - 0.1, offset: 0.011, smooth: 3, color: dark, edge: [(p) => lm.kneeY - 0.045 - p.y, (p) => p.y - (lm.kneeY - 0.1)] }), { outline: 0.004 });
  kit.skinned(shell(src, { pick: (p) => p.y < 0.034, offset: 0.007, color: 0x22232a }), { outline: 0.003 });
  const guard = pal.plate ?? dark;
  kit.skinned(drape(body, src, { pick: (p, n) => Math.abs(p.y - (lm.kneeY + 0.01)) < 0.05 && n.z * fwd > 0.25, offset: 0.014, minOffset: 0.012, smooth: 4, color: guard }), { outline: 0.004 });
  kit.skinned(drape(body, src, { pick: (p, n) => p.y < lm.kneeY - 0.12 && p.y > lm.ankleY + 0.1 && n.z * fwd > 0.45, offset: 0.011, minOffset: 0.01, smooth: 4, color: guard }), { outline: 0.004 });

  // --- the face under the cowl: a stubbled jaw, a hard mouth line
  const faceZ = (y) => frontZ(src, 0, y, fwd, 0.01);
  kit.skinned(shell(src, {
    pick: (p, n) => Math.abs(p.x) < 0.075 && p.y < faceEdge(lm, p.x) - 0.022 && p.y > lm.neckY + 0.005 && (p.z - lm.headCenter.z) * fwd > -0.02 && !(Math.abs(p.x) < 0.024 && Math.abs(p.y - (lm.eyeY - 0.078)) < 0.008),
    offset: 0.0012, color: linearMix(pal.skin, 0x3a3040, 0.35), uv: false,
  }), { outline: 0 });
  const mouthY = lm.eyeY - 0.079;
  kit.rigid(slab([[-0.02, 0.0015], [0.02, 0.0015], [0.016, -0.0025], [-0.016, -0.0025]], 0.002, 0), { bone: 'Head', color: 0x3a2224, outline: 0, pos: [0, mouthY, faceZ(mouthY) + 0.0015 * fwd], rot: [0, fwd < 0 ? Math.PI : 0, 0] });

  // --- layered chest armour with the bat raised on it, and segmented abdominal plates
  const plateCol = linearMix(pal.suit, 0x000000, 0.1);
  const chestTop = lm.neckY - 0.055;
  const chestPlate = drape(body, src, {
    pick: (p, n) => n.z * fwd > -0.05 && (p.z - bindPosition(body, 'spine_03').z) * fwd > -0.02 && p.y > lm.chestY - 0.13 && p.y < chestTop + Math.abs(p.x) * 0.25 && Math.abs(p.x) < lm.shoulderX - 0.02,
    offset: 0.007, minOffset: 0.006, smooth: 8, color: plateCol,
    edge: [(p) => p.y - (lm.chestY - 0.13), (p) => chestTop + Math.abs(p.x) * 0.25 - p.y],
  });
  kit.skinned(chestPlate, { outline: 0.004 });
  for (let row = 0; row < 3; row++) {
    const y1 = lm.chestY - 0.15 - row * 0.058, y0 = y1 - 0.048;
    if (y0 < lm.beltY + 0.035) break;
    for (const side of [-1, 1]) {
      kit.skinned(drape(body, src, {
        pick: (p, n) => n.z * fwd > 0.3 && p.y > y0 && p.y < y1 && p.x * side > 0.006 && p.x * side < 0.075 - row * 0.004,
        offset: 0.005, minOffset: 0.0045, smooth: 3, color: linearMix(pal.suit, 0x000000, 0.16),
        edge: [(p) => p.y - y0, (p) => y1 - p.y, (p) => p.x * side - 0.006, (p) => 0.075 - row * 0.004 - p.x * side],
      }), { outline: 0.003 });
    }
  }
  if (look.emblemStyle !== 'oval') {
    // Wrapped onto the plate's own surface (not the body's), so it never sinks into it.
    // [polish] Skinned like the plate under it (each vertex copies the nearest plate vertex's
    // weights): bound rigidly to spine_03 the plate slid through the bat as the chest breathed,
    // cutting gaps at the wing and ear tips.
    // The plate's surface is lumpy at the millimetre scale; the bat follows a blurred copy of it
    // (lifted clear of the bumps) so the ink pass does not crease it all over.
    const hf0 = frontHeightField(chestPlate, lm, lm.chestY, fwd);
    const hf = (x, y) => { let s = 0; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) s += hf0(x + i * 0.007, y + j * 0.007); return s / 25; };
    const es = look.emblemScale ?? 0.0026;
    const bat = decal(batOutline().map(([x, y]) => [x * es, y * es]), hf, { y: lm.chestY + 0.014 + (look.emblemDrop ?? 0), lift: look.emblemLift ?? (look.armour ? 0.016 : 0.009), fwd });
    // An ink-dark bat (or one marked emblemUnlit) goes in the unlit slot: flat colour, no toon
    // bands or self-shadow chewing its edges. Other coloured bats stay lit so they do not glow.
    const inkBat = new THREE.Color(pal.emblem).getHSL({}).l < 0.16;
    kit.skinned(skinLike(bat, chestPlate), { color: pal.emblem, outline: 0.002, slot: inkBat || look.emblemUnlit ? 'unlit' : 'lit' });
  }

  // --- suit extras
  if (look.seams) {
    // Ember seams: thin glowing panel lines (unlit, so they glow at night) down the flanks,
    // round the chest plate's lower edge and along the outer thigh.
    const seam = (pick) => kit.skinned(shell(src, { pick, offset: 0.0085, color: look.seams, uv: false }), { outline: 0, slot: 'unlit' });
    seam((p, n) => Math.abs(Math.abs(p.x) - 0.13) < 0.006 && p.y > lm.beltY + 0.04 && p.y < lm.chestY - 0.02 && n.z * fwd > -0.3);
    seam((p, n) => Math.abs(p.y - (lm.chestY - 0.135)) < 0.0045 && Math.abs(p.x) < 0.15 && n.z * fwd > 0.2);
    seam((p, n) => Math.abs(p.x) > 0.08 && Math.abs(p.x) < lm.hipHalfWidth && p.y < lm.beltY - 0.1 && p.y > lm.kneeY + 0.08 && Math.abs(n.x) > 0.75);
  }
  if (look.coat) {
    // A harbour slicker's capelet: a short waterproof shoulder cape over the chest and back,
    // with a high collar, under the long cloth cape. Changes the shoulder line at any distance.
    const capeletBottom = lm.chestY - 0.07;
    const hemAt = (p) => capeletBottom - Math.max(0, Math.abs(p.x) - 0.15) * 0.4;
    kit.skinned(drape(body, src, {
      pick: (p) => Math.abs(p.x) < lm.shoulderX + 0.14 && p.y > hemAt(p) && p.y < lm.neckY + 0.02 && !(p.y > lm.neckY + 0.005 && Math.abs(p.x) < 0.15),
      offset: 0.02, minOffset: 0.016, smooth: 14, color: pal.cape,
      edge: [(p) => p.y - hemAt(p), (p) => lm.shoulderX + 0.14 - Math.abs(p.x)],
    }), { outline: 0.006 });
    kit.rigid(new THREE.CylinderGeometry(0.1, 0.092, 0.1, 16, 1, true), { bone: 'spine_03', color: pal.cape, outline: 0.005, pos: [0, neck.y + 0.03, neck.z] });
    for (let k = 0; k < 3; k++) kit.rigid(cyl(0.008, 0.008, 0.005, 8).rotateX(Math.PI / 2), { bone: 'spine_03', color: pal.accent, outline: 0, pos: [0, lm.chestY + 0.03 - k * 0.04, lm.chestFrontZ + 0.04 * fwd] });
  }
  if (look.patches) {
    // Field repairs: mismatched patches over the suit (shoulder, thigh, knee) and a tape strip.
    // Breaks the clean suit up in silhouette and colour.
    const sideL = Math.sign(bindPosition(body, 'thigh_l').x) || 1;
    const patch = (pick) => kit.skinned(drape(body, src, { pick, offset: 0.006, minOffset: 0.0055, smooth: 3, color: look.patches }), { outline: 0.003 });
    patch((p, n) => p.x * sideL > lm.shoulderX - 0.04 && p.x * sideL < lm.shoulderX + 0.09 && p.y > ul.y - 0.02 && n.y > 0.1);
    patch((p, n) => p.x * sideL < -0.06 && p.x * sideL > -0.2 && p.y < lm.beltY - 0.14 && p.y > lm.beltY - 0.27 && n.z * fwd > 0.1);
    patch((p, n) => Math.abs(p.y - lm.kneeY) < 0.018 && p.x * sideL > 0.03 && n.z * fwd > 0.3);
  }
  if (look.pouches === 'extra') {
    // Thigh rigs: a pouch strapped to each outer thigh.
    for (const t of ['thigh_l', 'thigh_r']) {
      const th = bindPosition(body, t);
      kit.rigid(slab([[-0.035, -0.05], [0.035, -0.05], [0.038, 0.05], [-0.038, 0.05]], 0.045, 0.006), { bone: t, color: pal.accent, outline: 0.004, pos: [th.x * 1.75, th.y - 0.16, th.z + 0.005 * fwd], rot: [0, Math.sign(th.x) * Math.PI / 2, 0] });
      kit.skinned(shell(src, { pick: (p) => Math.abs(p.y - (th.y - 0.16)) < 0.012 && p.x * Math.sign(th.x) > 0.03 && p.y < lm.beltY - 0.1, offset: 0.006, color: pal.dark }), { outline: 0.002 });
    }
  }
  if (look.armour) {
    const plate = pal.plate;
    const torsoFront = (p, n) => n.z * fwd > 0.1 && p.y > lm.chestY - 0.17 && p.y < lm.neckY - 0.04 && Math.abs(p.x) < 0.16;
    kit.skinned(shell(src, { pick: torsoFront, offset: 0.012, color: plate }), { outline: 0.006 });
    kit.skinned(shell(src, { pick: (p, n) => Math.abs(p.x) > lm.shoulderX - 0.03 && Math.abs(p.x) < lm.shoulderX + 0.11 && p.y > bindPosition(body, 'upperarm_l').y - 0.02 && n.y > -0.2, offset: 0.016, color: plate }), { outline: 0.006 });
    kit.skinned(shell(src, { pick: (p, n) => p.y < lm.kneeY + 0.06 && p.y > lm.ankleY + 0.06 && n.z * fwd > 0.25, offset: 0.012, color: plate }), { outline: 0.005 });
  }
  if (look.trunks) {
    const thighY = bindPosition(body, 'thigh_l').y;
    kit.skinned(shell(src, { pick: (p) => p.y < lm.beltY - 0.02 && p.y > thighY - 0.1 + Math.abs(p.x) * 0.25 && Math.abs(p.x) < 0.25, offset: 0.0045, color: look.trunks }), { outline: 0.004 });
  }
  if (look.emblemStyle === 'oval') {
    const hf = frontHeightField(src, lm, lm.chestY, fwd);
    const oval = [];
    for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; oval.push([Math.cos(a) * 0.1, Math.sin(a) * 0.058]); }
    kit.rigid(decal(oval, hf, { y: lm.chestY + 0.004, lift: 0.012, fwd }), { bone: 'spine_03', color: pal.oval, outline: 0.003 });
    kit.rigid(decal(batOutline().map(([x, y]) => [x * 0.0017, y * 0.0017]), hf, { y: lm.chestY + 0.004, lift: 0.0145, fwd }), { bone: 'spine_03', color: pal.emblem, outline: 0 });
  }

  look.extra?.({ ch, body, src, kit, lm, fwd, pal, cowl, B: (n) => bindPosition(body, n) });
  kit.build();
  ch.suit = suit.id;
  ch.colors = { suit: pal.suit, cowl: dark, skin: pal.skin, belt: pal.accent, glove: dark, boot: dark, emblem: pal.emblem, cape: capeColor };
  ch.meta = batMeta(ch, capeColor, look.cape);
  ch.animator.play('Idle_Loop');
  ch.dressed();
  return ch;
}

// Shared meta for the Batman family: the cape is the hero's own cloth (cape.js reads it).
export function batMeta(ch, capeColor, cape = {}) {
  return {
    heightScale: 1,
    cape: { color: capeColor, options: { cols: 13, rows: 14, topWidth: 0.6, bottomWidth: 1.34, length: 1.28, pointDrop: 0.22, ...cape } },
    hands: { l: 'hand_l', r: 'hand_r' },
    props: 'none',
    palette: ch.colors,
  };
}

// Gives geo the skin weights of the nearest vertex of `like` (a skinned kit part it sits on).
// Welded first: the tessellated decal's faceted normals inked every facet edge.
function skinLike(geo, like) {
  geo = mergeVertices(geo, 1e-5);
  geo.computeVertexNormals();
  const P = geo.attributes.position, Q = like.attributes.position;
  const SI = like.attributes.skinIndex, SW = like.attributes.skinWeight;
  const si = new Uint16Array(P.count * 4), sw = new Float32Array(P.count * 4);
  for (let i = 0; i < P.count; i++) {
    let best = Infinity, bj = 0;
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    for (let j = 0; j < Q.count; j++) {
      const d = (Q.getX(j) - x) ** 2 + (Q.getY(j) - y) ** 2 + (Q.getZ(j) - z) ** 2;
      if (d < best) { best = d; bj = j; }
    }
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = SI.getComponent(bj, k); sw[i * 4 + k] = SW.getComponent(bj, k); }
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return geo;
}

function linearMix(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return ca.lerp(cb, t).getHex();
}
