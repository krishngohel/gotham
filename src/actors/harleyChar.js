// Harley Quinn's look, code-painted like Nightwing (src/actors/nightwingChar.js): the female
// hero body (hero_f.glb) via the shared character factory, painted through vertex regions rather
// than a baked UV texture. A clean left/right harlequin split (one side red, one black), white
// greasepaint face, a black eye mask, blonde hair in two pigtails (one red-tipped, one
// black-tipped), a pointed jester ruff, split boots with white cuffs, and a big wooden mallet held
// in her right hand. Every worn part is merged into one skinned kit mesh (src/heroes/models/kit.js),
// so she costs a handful of draw calls instead of one per primitive.
import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { toonMaterial, addHullOutline } from '../render/toon.js';
import { attachRigid, bindPosition } from './rig.js';
import { addRim } from './outfitParts.js';
import { makeCharacter, paintRegions } from './characters.js';
import { createKit, shell, sphere, cyl } from '../heroes/models/kit.js';
import { hairLocks } from '../heroes/models/costume.js';

export const HARLEY_COLORS = {
  red: PALETTE.crimson, black: PALETTE.ink, belt: 0x2a2430, face: PALETTE.paper, mask: 0x14121a, hair: PALETTE.signal,
};

// Region classifier (bind-pose meters): a straight left/right split for the suit (the classic
// harlequin costume), white greasepaint on the face, a black band across the eyes, and a coarse
// diamond checker on the legs in the opposite color from that leg's base side.
export function classifyHarleyVertex(p, lm) {
  if (p.y > lm.neckY) {
    const front = (p.z - lm.headCenter.z) * lm.fwd;
    const face = front > lm.headRadius * 0.42 && p.y < lm.eyeY + 0.02 && p.y > lm.eyeY - 0.15;
    if (!face) return 'hair';
    const eyeBand = p.y < lm.eyeY + 0.03 && p.y > lm.eyeY - 0.055;
    return eyeBand ? 'mask' : 'face';
  }
  const ax = Math.abs(p.x);
  const side = p.x >= 0 ? 'red' : 'black';
  const opposite = side === 'red' ? 'black' : 'red';
  if (p.y < lm.kneeY - 0.05) return side;
  if (Math.abs(p.y - lm.beltY) < 0.04 && ax < lm.hipHalfWidth + 0.06) return 'belt';
  if (p.y < lm.beltY - 0.02 && p.y > lm.kneeY - 0.05) {
    const gx = Math.floor(p.x * 9), gy = Math.floor(p.y * 9);
    return (gx + gy) % 2 === 0 ? opposite : side;
  }
  return side;
}

export function createHarleyCharacter(assets) {
  const ch = makeCharacter(assets, 'f');
  const { body, eyes, brows, lm } = ch;
  const src = body.geometry;
  paintRegions(body, classifyHarleyVertex, HARLEY_COLORS, lm);
  body.material = addRim(
    toonMaterial({ vertexColors: true, normalMap: body.material.normalMap, normalScale: 0.45, palette: Object.values(HARLEY_COLORS) }),
    0x9fc3ff, 0.55,
  );
  body.castShadow = true;
  eyes.visible = false;
  brows.visible = false;
  addHullOutline(body, 0.011);
  const fwd = lm.fwd, hc = lm.headCenter, r = lm.headRadius;
  const yaw = fwd < 0 ? Math.PI : 0;
  const C = HARLEY_COLORS;
  const kit = createKit(ch, { lift: 0.34, rimStrength: 0.55 });

  // A black domino-style band across the eyes, with little pointed wings.
  kit.rigid(new THREE.SphereGeometry(r * 1.05, 20, 6, Math.PI * 0.05, Math.PI * 0.9, Math.PI * 0.4, Math.PI * 0.14), { bone: 'Head', color: C.mask, outline: 0.003, pos: [hc.x, hc.y + 0.01, hc.z + 0.012 * fwd], rot: [0, yaw, 0] });
  for (const s of [-1, 1]) kit.rigid(new THREE.ConeGeometry(0.014, 0.05, 4), { bone: 'Head', color: C.mask, outline: 0.003, pos: [s * r * 0.88, lm.eyeY + 0.03, hc.z + r * 0.45 * fwd], rot: [0, 0, -s * 0.9] });

  // Blonde hair: a cap over the scalp, swept back, then the two pigtails (blonde into a coloured tip).
  hairLocks(kit, src, lm, { color: C.hair, volume: 0.014, fringe: true, locks: 5, sweep: 0.8 });
  for (const [side, tip] of [[1, C.red], [-1, C.black]]) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25 * fwd, 0, side * 0.55));
    const at = new THREE.Vector3(side * r * 0.95, lm.headTop - 0.07 - hc.y, -0.015 * fwd);
    const place = (geo, color, dy) => {
      const off = new THREE.Vector3(0, dy, 0).applyQuaternion(q);
      kit.rigid(geo, { bone: 'Head', color, outline: 0.005, pos: [hc.x + at.x + off.x, hc.y + at.y + off.y, hc.z + at.z + off.z], quat: q });
    };
    place(sphere(0.045, 10, 8), C.hair, 0.0);
    place(cyl(0.05, 0.045, 0.14, 10), C.hair, -0.06);
    place(cyl(0.045, 0.012, 0.32, 10), tip, -0.29);
  }

  // A jester ruff: points alternating red and black round the neck, over a white band.
  const neck = bindPosition(body, 'neck_01');
  kit.rigid(new THREE.TorusGeometry(0.085, 0.022, 6, 18), { bone: 'spine_03', color: C.face, outline: 0.003, pos: [0, lm.neckY - 0.03, neck.z], rot: [Math.PI / 2, 0, 0] });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(a), -0.55, Math.cos(a) * fwd).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const p = new THREE.Vector3(Math.sin(a) * 0.1, lm.neckY - 0.04, neck.z + Math.cos(a) * 0.085 * fwd).addScaledVector(dir, 0.04);
    kit.rigid(new THREE.ConeGeometry(0.03, 0.09, 4).scale(1, 1, 0.35), { bone: 'spine_03', color: k % 2 ? C.red : C.black, outline: 0.003, pos: [p.x, p.y, p.z], quat: q });
  }

  // Boots in the opposite colour to each leg, with a white cuff, and white wrist ruffles.
  kit.skinned(shell(src, { pick: (p) => p.y < lm.kneeY - 0.02 && Math.abs(p.x) < 0.3, offset: (p) => 0.006 + (Math.abs(p.y - (lm.kneeY - 0.04)) < 0.025 ? 0.008 : 0), color: (p) => (p.y > lm.kneeY - 0.065 ? C.face : p.x >= 0 ? C.black : C.red), uv: false }), { outline: 0.004 });
  const wristX = Math.abs(bindPosition(body, 'hand_l').x) - 0.05;
  kit.skinned(shell(src, { pick: (p) => Math.abs(p.x) > wristX - 0.03 && Math.abs(p.x) < wristX && p.y > lm.chestY - 0.2, offset: 0.014, color: C.face, uv: false }), { outline: 0.003 });

  // The mallet, two-handed in the story but bound rigidly to the right hand: part of the kit mesh.
  const handPos = bindPosition(body, 'hand_r');
  const mPos = handPos.clone().add(new THREE.Vector3(-0.03 * fwd, 0.36, 0.02 * fwd));
  const mQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, 0));
  const onMallet = (geo, color, local, outline) => {
    const p = local.clone().applyQuaternion(mQ).add(mPos);
    kit.rigid(geo, { bone: 'hand_r', color, outline, pos: [p.x, p.y, p.z], quat: mQ });
  };
  onMallet(new THREE.CylinderGeometry(0.026, 0.026, 0.78, 8), PALETTE.wood, new THREE.Vector3(), 0.005);
  onMallet(new THREE.CylinderGeometry(0.165, 0.165, 0.36, 12).rotateZ(Math.PI / 2), PALETTE.wood, new THREE.Vector3(0, 0.44, 0), 0.006);
  for (const dx of [-0.12, 0.12]) onMallet(new THREE.CylinderGeometry(0.169, 0.169, 0.045, 12).rotateZ(Math.PI / 2), dx < 0 ? C.red : C.black, new THREE.Vector3(dx, 0.44, 0), 0);
  kit.build();
  // ch.mallet: an empty anchor at the mallet head (the mesh itself is part of the kit).
  const mallet = new THREE.Object3D();
  mallet.position.copy(mPos);
  attachRigid(body, 'hand_r', mallet);
  ch.mallet = mallet;

  ch.type = 'harley';
  ch.colors = HARLEY_COLORS;
  ch.animator.play('Idle_Loop');
  ch.dressed();
  return ch;
}
