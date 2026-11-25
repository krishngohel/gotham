// Nightwing, rebuilt: the male body reshaped to an acrobat's build (slimmer torso and limbs
// around the same skeleton, so every clip still fits), painted from nightwing.webp (an original
// bird in flight whose wings sweep over the shoulders and down the arms to two finger stripes;
// see scripts/paint-suits.mjs), with modelled parts merged by the kit:
//
//   hair      a cap lifted off the scalp for volume plus swept-back locks and a fringe;
//   mask      a domino shell over the eyes with swept-up wings and white lenses;
//   sticks    two escrima sticks holstered across the back (their own mesh, so they hide when
//             drawn) and a pair for the hands (ch.setSticks('held' | 'holstered'));
//   suit extras per suit: the wing colour, and pads on the tactical suit.
//
// mode 'courier' is the story's disguise: the same man under a hooded cloak and a purple gang
// mask, carrying a stolen crate (src/allies/nightwing.js swaps to 'ally' for the reveal).
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { toonMaterial, addHullOutline } from '../../render/toon.js';
import { makeCharacter, paintRegions } from '../../actors/characters.js';
import { addRim } from '../../actors/outfitParts.js';
import { attachRigid, bindPosition } from '../../actors/rig.js';
import { classifyNightwingVertex, NIGHTWING_COLORS } from '../../actors/nightwingChar.js';
import { suitById } from './suits.js';
import { createKit, shell, reshape, slab, box, cyl, sphere, linear } from './kit.js';
import { waistProfile } from './shape.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const DEFAULT_WING = 0x49b4ff;
const HAIR = 0x111118;

// An acrobat: narrower chest and shoulders, leaner arms and legs. Factors scale each vertex's
// distance from the bone it is weighted to.
export const ATHLETE = {
  spine_01: 0.92, spine_02: 0.9, spine_03: 0.9, clavicle_l: 0.9, clavicle_r: 0.9, neck_01: 0.92,
  upperarm_l: 0.85, upperarm_r: 0.85, lowerarm_l: 0.88, lowerarm_r: 0.88,
  pelvis: 0.95, thigh_l: 0.9, thigh_r: 0.9, calf_l: 0.92, calf_r: 0.92,
};

const MATS = new Map();
function suitMaterial(map, normalMap, wing) {
  const key = `${map.uuid}|${wing}`;
  let mat = MATS.get(key);
  if (mat) return mat;
  mat = toonMaterial({ map, normalMap, normalScale: 0.4 });
  if (wing !== DEFAULT_WING) {
    // Repaint the painted blue: texels well bluer than they are red or green take the new
    // colour at their own brightness.
    const from = linear(DEFAULT_WING).clone(), to = linear(wing).clone();
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFrom = { value: from };
      shader.uniforms.uTo = { value: to };
      shader.fragmentShader = 'uniform vec3 uFrom, uTo;\n' + shader.fragmentShader.replace('#include <map_fragment>', `
	vec4 texel = texture2D(map, vMapUv);
	float wingK = smoothstep(0.18, 0.4, texel.b - max(texel.r, texel.g * 0.7));
	vec3 recol = uTo * (texel.b / max(uFrom.b, 1e-3));
	diffuseColor.rgb *= mix(texel.rgb, recol, wingK);`);
    };
    mat.customProgramCacheKey = () => 'nw-wing';
  }
  mat = addRim(mat, 0x9fc3ff, 0.75, [0.5, 0.62], 0.45);
  MATS.set(key, mat);
  return mat;
}

export function createNightwing(assets, { suit = 'nightwing', mode = 'ally' } = {}) {
  const spec = suitById(suit);
  const look = spec.hero === 'nightwing' ? spec.look : suitById('nightwing').look;
  const wing = look.wing ?? DEFAULT_WING;
  const ch = makeCharacter(assets, 'm');
  const { body, eyes, brows, lm } = ch;
  const fwd = lm.fwd;
  body.geometry = body.geometry.clone();
  reshape(body, (name) => ATHLETE[name] ?? 1);
  const src = body.geometry; // reshaped, uncut: the parts are lifted off this
  const tex = assets.suitTex?.nightwing;
  if (tex) body.material = suitMaterial(tex, body.material.normalMap, wing);
  else {
    paintRegions(body, classifyNightwingVertex, { ...NIGHTWING_COLORS, wing }, lm);
    body.material = addRim(toonMaterial({ vertexColors: true, normalMap: body.material.normalMap, normalScale: 0.45, palette: Object.values({ ...NIGHTWING_COLORS, wing }) }), 0x9fc3ff, 0.55);
  }
  body.castShadow = true;
  eyes.visible = false;
  brows.visible = false;
  addHullOutline(body, 0.01);

  const kit = createKit(ch, { lift: 0.45, rimStrength: 0.75 }).slot('holster', { lift: 0.45, rimStrength: 0.75 });
  const hc = lm.headCenter, r = lm.headRadius;

  // --- hair: a cap with volume on top, swept back
  const hairline = (p) => {
    const front = (p.z - hc.z) * fwd / r;
    const top = lm.eyeY + 0.05, side = lm.eyeY + 0.018, nape = lm.neckY + 0.07;
    if (front > 0.35) return top;
    if (front > -0.25) return side + (top - side) * clamp01((front + 0.25) / 0.6);
    return nape + (side - nape) * clamp01((front + 0.9) / 0.65);
  };
  kit.skinned(shell(src, {
    pick: (p) => p.y > lm.neckY + 0.02 && Math.abs(p.x) < 0.14 && p.y > hairline(p),
    offset: (p) => 0.008 + 0.014 * clamp01((p.y - lm.eyeY) / 0.12),
    push: (p, n, d) => { d.z -= 0.008 * clamp01((p.y - lm.eyeY - 0.03) / 0.1) * fwd; },
    color: HAIR,
  }), { outline: 0.005 });
  const lock = (len, rad) => new THREE.ConeGeometry(rad, len, 5).translate(0, len / 2, 0).scale(1, 1, 0.45);
  const up = new THREE.Vector3(0, 1, 0);
  const placeLock = (az, el, dir, len, rad) => {
    const d = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el) * fwd);
    const pos = new THREE.Vector3(hc.x, hc.y + 0.01, hc.z).addScaledVector(d, r * 0.98);
    kit.rigid(lock(len, rad), { bone: 'Head', color: HAIR, outline: 0.004, pos: [pos.x, pos.y, pos.z], quat: new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()) });
  };
  // Swept-back locks lying along the crown and sides, flicking out a little at the ends, and a
  // fringe falling forward over the brow: a full head of hair rather than a helmet.
  for (const [az, el, len, lift] of [[0.35, 0.95, 0.11, 0.2], [-0.3, 1.0, 0.12, 0.22], [0.05, 0.75, 0.11, 0.25], [0.9, 0.7, 0.1, 0.12], [-0.85, 0.72, 0.1, 0.12],
    [1.5, 0.45, 0.09, 0.0], [-1.5, 0.45, 0.09, 0.0], [2.3, 0.5, 0.1, 0.05], [-2.3, 0.5, 0.1, 0.05], [3.0, 0.55, 0.1, 0.1]]) {
    const dir = new THREE.Vector3(Math.sin(az) * 0.35, lift, -1 * fwd);
    placeLock(az, el, dir, len, 0.03);
  }
  for (const [az, el, sx] of [[0.3, 0.62, 0.4], [-0.15, 0.66, -0.25], [0.65, 0.5, 0.7]]) {
    placeLock(az, el, new THREE.Vector3(sx, -0.75, 0.5 * fwd), 0.08, 0.022);
  }

  // --- domino mask and lenses
  const mask = shell(src, {
    pick: (p, n) => {
      if (n.z * fwd < 0.15 || p.y < lm.neckY + 0.05) return false;
      const ax = Math.abs(p.x);
      if (ax > 0.088 || (p.z - hc.z) * fwd < r * 0.15) return false;
      const lo = ax < 0.012 ? lm.eyeY - 0.006 : lm.eyeY - 0.022 + ax * 0.12;
      const hi = lm.eyeY + 0.026 + ax * 0.25;
      return p.y > lo && p.y < hi;
    },
    offset: 0.004,
    color: 0x0c0c12,
  });
  kit.skinned(mask, { outline: 0.003 });
  for (const side of [-1, 1]) {
    const x = side * lm.eyeSpread, y = lm.eyeY + 0.002;
    let z = -Infinity;
    const P = mask.attributes.position;
    for (let i = 0; i < P.count; i++) if (Math.abs(P.getX(i) - x) < 0.01 && Math.abs(P.getY(i) - y) < 0.01) z = Math.max(z, P.getZ(i) * fwd);
    const lens = new THREE.CircleGeometry(1, 16).scale(0.016, 0.0085, 1);
    kit.rigid(lens, { bone: 'Head', slot: 'unlit', color: PALETTE.paper, outline: 0, pos: [x, y, (z + 0.0015) * fwd], rot: [0, (fwd < 0 ? Math.PI : 0) + side * 0.38 * fwd, -side * 0.18] });
  }

  // --- escrima sticks: holstered diagonally across the back
  const spineZ = bindPosition(body, 'spine_03').z;
  const backR = waistProfile(src, lm.chestY - 0.04, spineZ)(0, -fwd);
  const backZ = spineZ - (backR + 0.012) * fwd;
  kit.rigid(slab([[-0.05, -0.17], [0.05, -0.17], [0.05, 0.17], [-0.05, 0.17]], 0.018, 0.004), { bone: 'spine_03', color: 0x22242c, outline: 0.004,
    pos: [0, lm.chestY - 0.04, backZ], rot: [0, 0, 0.5] });
  const stickGeo = (len) => {
    const g = cyl(0.014, 0.014, len, 8);
    return g;
  };
  for (const dx of [-0.03, 0.03]) {
    kit.rigid(stickGeo(0.52), { bone: 'spine_03', slot: 'holster', color: 0x2c3040, outline: 0.004,
      pos: [dx * Math.cos(0.5), lm.chestY - 0.04 + dx * Math.sin(0.5), backZ - 0.016 * fwd], rot: [0, 0, 0.5] });
    for (const end of [-1, 1]) {
      kit.rigid(cyl(0.016, 0.016, 0.05, 8), { bone: 'spine_03', slot: 'holster', color: wing, outline: 0.003,
        pos: [dx * Math.cos(0.5) - end * Math.sin(0.5) * 0.24, lm.chestY - 0.04 + dx * Math.sin(0.5) + end * Math.cos(0.5) * 0.24, backZ - 0.016 * fwd], rot: [0, 0, 0.5] });
    }
  }

  // --- tactical pads
  if (look.pads) {
    for (const bone of ['clavicle_l', 'clavicle_r']) {
      const p = bindPosition(body, bone === 'clavicle_l' ? 'upperarm_l' : 'upperarm_r');
      kit.rigid(sphere(0.075, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), { bone, color: 0x2a2d36, outline: 0.004, pos: [p.x * 1.02, p.y + 0.02, p.z], scale: [1.1, 0.7, 1] });
    }
    kit.skinned(shell(src, { pick: (p, n) => Math.abs(p.y - lm.kneeY) < 0.06 && n.z * fwd > 0.3, offset: 0.01, color: 0x2a2d36 }), { outline: 0.004 });
  }

  // --- courier disguise over the suit
  if (mode === 'courier') {
    kit.slot('disguise', { lift: 0.32, rimStrength: 0.8 });
    const cloak = new THREE.ConeGeometry(lm.hipHalfWidth * 1.7, lm.neckY - lm.beltY + 0.55, 12, 1, true);
    const cloakY = lm.beltY + (lm.neckY - lm.beltY) * 0.5;
    kit.rigid(cloak, { bone: 'spine_03', slot: 'disguise', color: 0x171320, outline: 0.008, pos: [0, cloakY, -0.02 * fwd] });
    kit.rigid(cloak, { bone: 'spine_03', slot: 'disguise', color: 0x171320, outline: 0, pos: [0, cloakY, -0.02 * fwd], scale: [-0.985, 1, 0.985] });
    kit.rigid(sphere(r * 1.3, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), { bone: 'Head', slot: 'disguise', color: 0x171320, outline: 0.006, pos: [hc.x, hc.y + 0.06, hc.z - 0.025 * fwd] });
    kit.rigid(sphere(r * 1.12, 16, 10, Math.PI * 0.05, Math.PI * 0.9, Math.PI * 0.22, Math.PI * 0.48), { bone: 'Head', slot: 'disguise', color: PALETTE.jokerPurple, outline: 0.005,
      pos: [hc.x, hc.y - 0.006, hc.z + 0.016 * fwd], rot: [0, fwd < 0 ? Math.PI : 0, 0] });
  }

  const built = kit.build();
  const holster = built.find((m) => m.name === 'kit-holster');
  if (mode === 'courier') {
    const d = built.find((m) => m.name === 'kit-disguise');
    ch.disguise = { cloak: d, hood: d, gangMask: d };
    // A stolen Wayne Tech crate, carried in front.
    const crate = new THREE.Group();
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.05, 0.27), toonMaterial({ color: PALETTE.signal }));
    lid.position.y = 0.145;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.24), toonMaterial({ color: 0x59634a }));
    crate.add(base, lid);
    addHullOutline(base, 0.004);
    addHullOutline(lid, 0.004);
    crate.position.set(0, -0.42, 0.32 * fwd);
    attachRigid(body, 'spine_03', crate);
    ch.cargoBox = crate;
  }

  // Held sticks: one per hand, through the fist and out past the thumb, hidden until drawn.
  const heldMat = addRim(toonMaterial({ color: 0x2c3040 }), 0x9fc3ff, 0.8);
  const tipMat = new THREE.MeshBasicMaterial({ color: wing });
  ch.sticks = [];
  for (const hand of ['hand_l', 'hand_r']) {
    const h = bindPosition(body, hand);
    const side = Math.sign(h.x);
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(cyl(0.014, 0.014, 0.52, 8).rotateX(Math.PI / 2), heldMat);
    const tip = new THREE.Mesh(cyl(0.016, 0.016, 0.05, 8).rotateX(Math.PI / 2).translate(0, 0, 0.24), tipMat);
    g.add(shaft, tip);
    addHullOutline(shaft, 0.004);
    g.position.set(h.x + side * 0.075, h.y - 0.012, h.z + 0.09 * fwd);
    if (fwd < 0) g.rotation.y = Math.PI;
    attachRigid(body, hand, g);
    g.visible = false;
    ch.sticks.push(g);
  }
  // Drawn sticks show in the hands and leave the holster plate empty on the back.
  ch.setSticks = (state) => {
    const held = state === 'held';
    for (const s of ch.sticks) s.visible = held;
    if (holster) holster.visible = !held;
  };
  ch.setSticks(mode === 'courier' ? 'holstered' : 'held');

  ch.mode = mode;
  ch.suit = spec.hero === 'nightwing' ? spec.id : 'nightwing';
  ch.colors = { ...NIGHTWING_COLORS, wing };
  ch.meta = { heightScale: 1, cape: null, hands: { l: 'hand_l', r: 'hand_r' }, props: 'sticks', traversal: 'acrobat', palette: ch.colors };
  ch.animator.play('Idle_Loop');
  ch.dressed();
  return ch;
}
