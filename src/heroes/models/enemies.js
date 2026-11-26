// Enemy role looks for the combat roles in the research doc (shield, baton, heavy, gunner,
// sniper, ninja, medic, lieutenant) in any district gang's colours. Figures (one skinned mesh +
// hull) with the goon API the combat code reads: ch.xray / ch.xrays (detective-vision silhouette
// of the whole figure), ch.muzzle for guns, ch.type, ch.prop. createGoon() routes these types here.
//
// Accessibility: every role must be tellable from the others at 20 m by SILHOUETTE alone (not
// colour), so each has a role kit of its own registered as a wardrobe extra ('role:<name>'), and
// the gang only ever adds colour and a face piece; it never replaces a role's head silhouette.
//   shield      riot helmet with a visor and neck guard, shoulder pads, the big shield
//   baton       beanie with a tall bobble, jacket collar up, the baton
//   heavy       brute bulk, huge pauldrons, a gorget that swallows the neck, caged helmet
//   gunner      cap, chest rig with magazine pouches, the rifle
//   sniper      hood with goggles up, ghillie strips over the shoulders, pack + bedroll (hunched)
//   ninja       slim, hood and mask, two long scarf tails, sash, a sword across the back
//   medic       cap, backpack with a tall antenna and a white pennant, hip satchel, armband
//   lieutenant  taller, long coat, peaked officer's cap, epaulettes, armband
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { addXray } from '../../render/toon.js';
import { figureFromSpec, rng as makeRng } from '../../actors/civilians/generator.js';
import { registerExtra } from '../../actors/civilians/wardrobe.js';
import { box, cyl, sphere, torus } from './kit.js';
import { createProp, attachProp } from './props.js';

export const ENEMY_ROLES = ['shield', 'baton', 'heavy', 'gunner', 'sniper', 'ninja', 'medic', 'lieutenant'];

// District gangs (city-and-content.md 5.4): colours plus a head piece each.
export const GANGS = {
  joker: { top: 0x6c3fa3, outer: 0x62c141, bottom: 0x4a2a78, vest: 0x3c7a2a, hat: 0x6c3fa3, head: 'clownmask', accent: 0xc8323c },
  penguin: { top: 0xe8e2d6, outer: 0x1e1e24, bottom: 0x1e1e24, vest: 0x2a2a30, hat: 0x111116, head: 'bowler', accent: 0x5a2a6a },
  twoFace: { top: 0xe8e2d6, outer: 0x16171c, outer2: 0xe0dcd0, bottom: 0x16171c, vest: 0x3a3a40, hat: 0x16171c, head: 'split', accent: 0x6a1a26 },
  blackMask: { top: 0x2a2a30, outer: 0x111116, bottom: 0x111116, vest: 0x1a1a1f, hat: 0x0b0b10, head: 'mercmask', accent: 0x8a1a1a },
  scarecrow: { top: 0x5a4a32, outer: 0x4a3f2c, bottom: 0x3f3a2c, vest: 0x5a4a32, hat: 0xb89a62, head: 'burlap', accent: 0x7a6a44 },
  firefly: { top: 0x4a3a2a, outer: 0x6a3a1a, bottom: 0x3a3a30, vest: 0xb85a1a, hat: 0x3a3a30, head: 'welder', accent: 0xf08a24 },
  riddler: { top: 0x2a3a2a, outer: 0x2f8a3a, bottom: 0x23252e, vest: 0x24702e, hat: 0x2f8a3a, head: 'bowler', accent: 0x7dff4a },
  freeze: { top: 0xa8b8c8, outer: 0x5a7a9a, bottom: 0x6a7a8a, vest: 0x5a7a9a, hat: 0xd8e0e8, head: 'goggles', accent: 0x7fd8ff },
  ivy: { top: 0x3a5a2a, outer: 0x2a4a22, bottom: 0x2a3a22, vest: 0x3a5a2a, hat: 0x2a4a22, head: 'vines', accent: 0x5aa83a },
  croc: { top: 0x4a4a3a, outer: 0x3a4a3a, bottom: 0x3a3a2a, vest: 0x5a5a3a, hat: 0x2a2a22, head: 'lamp', accent: 0x6a6a4a },
};

// headLock: the role's head piece is part of its silhouette; a gang hat never replaces it.
const ROLE_CUTS = {
  shield: { top: 'sweater', outer: 'tactical', bottom: 'trousers', shoes: 'boots', hair: 'bald', hat: null, extras: ['kneepads', 'gloves', 'role:shield'], prop: 'shield', hand: 'l', build: 'heavy', headLock: true },
  baton: { top: 'tee', sleeves: 'short', outer: 'jacket', bottom: 'jeans', shoes: 'boots', hair: 'short', hat: 'beanie', extras: ['gloves', 'role:baton'], prop: 'baton', hand: 'r', build: 'average' },
  heavy: { top: 'tank', outer: 'tactical', bottom: 'trousers', shoes: 'boots', hair: 'bald', hat: null, extras: ['kneepads', 'gloves', 'role:heavy'], prop: null, build: 'brute', height: 1.18, headLock: true },
  gunner: { top: 'shirt', sleeves: 'rolled', outer: 'tactical', bottom: 'trousers', shoes: 'boots', hair: 'short', hat: 'cap', extras: ['holster', 'gloves', 'role:gunner'], prop: 'rifle', hand: 'r', build: 'average' },
  sniper: { top: 'sweater', bottom: 'trousers', shoes: 'boots', hair: 'bald', hat: 'hood', extras: ['backpack', 'gloves', 'role:sniper'], prop: 'sniper', hand: 'r', build: 'slim', headLock: true },
  ninja: { top: 'tunic', bottom: 'trousers', shoes: 'boots', hair: 'bald', hat: 'hood', extras: ['ninja', 'belt', 'gloves', 'role:ninja'], prop: 'sword', hand: 'r', build: 'slim', headLock: true },
  medic: { top: 'shirt', sleeves: 'long', outer: 'hivis', bottom: 'trousers', shoes: 'boots', hair: 'short', hat: 'cap', extras: ['redcross', 'armband', 'backpack', 'gloves', 'role:medic'], prop: 'medkit', hand: 'l', build: 'average', headLock: true },
  lieutenant: { top: 'shirt', sleeves: 'long', outer: 'coat', bottom: 'trousers', shoes: 'boots', hair: 'short', hat: 'police', extras: ['armband', 'gloves', 'radio', 'role:lieutenant'], prop: null, build: 'heavy', height: 1.05, headLock: true },
};
const HEAD_EXTRAS = new Set(['clownmask', 'mercmask', 'burlap', 'welder', 'goggles', 'vines', 'lamp', 'split']);
// Gang pieces that would bury a role's head silhouette (a sack or a full mask under a hood is
// fine; a welding visor in front of a riot visor is not).
const CLASHES = { shield: ['welder', 'lamp', 'goggles'], heavy: ['welder', 'lamp', 'goggles'], sniper: ['welder', 'lamp', 'goggles'], ninja: ['welder', 'lamp', 'goggles', 'clownmask'], medic: ['welder', 'lamp'], lieutenant: ['welder', 'lamp'] };

// ---------------------------------------------------------------- role kits (wardrobe extras)

const PI = Math.PI;
// three's sphere: phi = PI/2 is +z. A segment centred on the model's front (or back).
const frontSeg = (R, halfW, t0, t1, back = false) => sphere(R, 18, 6, (back ? PI * 1.5 : PI * 0.5) - halfW, halfW * 2, t0, t1 - t0);

function kitTools(ctx, L) {
  const { lm } = L;
  const hc = lm.headCenter, r = lm.headRadius, fwd = L.fwd;
  return {
    lm, hc, r, fwd, yaw: fwd < 0 ? PI : 0,
    head: (dx, dy, dz) => [hc.x + dx, hc.y + dy, hc.z + dz * fwd],
    back: ctx.bp('spine_03').z - 0.0,
    neck: ctx.bp('neck_01'),
    ua: (side) => ctx.bp(side > 0 === ctx.bp('upperarm_l').x > 0 ? 'upperarm_l' : 'upperarm_r'),
  };
}

// Shoulder pads / pauldrons: a dome over each shoulder joint, riding the upper arm.
function pads(ctx, T, { R, sx = 1.2, sy = 0.8, sz = 1.1, lift = 0.04, out = 0.02, region = 'vest', layers = 1 }) {
  for (const name of ['upperarm_l', 'upperarm_r']) {
    const u = ctx.bp(name);
    const side = Math.sign(u.x) || 1;
    for (let k = 0; k < layers; k++) {
      ctx.rigid(sphere(R * (1 - k * 0.12), 12, 6, 0, PI * 2, 0, PI * 0.5), { bone: name, pos: [u.x + side * (out + k * 0.05), u.y + lift - k * 0.05, u.z], scale: [sx, sy, sz], rot: [0, 0, -side * (0.35 + k * 0.25)], outline: 0.005 }, region);
    }
  }
}

registerExtra('role:shield', (ctx, L) => {
  const T = kitTools(ctx, L);
  const { r, head, yaw } = T;
  // Riot helmet: a tall crown, a clear visor over the face, a neck guard behind.
  ctx.rigid(sphere(r * 1.24, 18, 10, 0, PI * 2, 0, PI * 0.56), { bone: 'Head', pos: head(0, 0.01, -0.006), scale: [1, 1.12, 1.06], outline: 0.006 }, 'hat');
  ctx.rigid(cyl(r * 1.25, r * 1.25, 0.022, 18, true), { bone: 'Head', pos: head(0, 0.012, -0.006), outline: 0.004 }, 'hat2');
  ctx.rigid(frontSeg(r * 1.34, PI * 0.36, PI * 0.42, PI * 0.74), { bone: 'Head', pos: head(0, 0.0, 0.006), rot: [0, yaw, 0], outline: 0.004 }, 'lens');
  ctx.rigid(frontSeg(r * 1.26, PI * 0.42, PI * 0.5, PI * 0.8, true), { bone: 'Head', pos: head(0, 0.0, -0.01), rot: [0, yaw, 0], outline: 0.004 }, 'hat2');
  pads(ctx, T, { R: 0.085, lift: 0.045 });
});

registerExtra('role:baton', (ctx, L) => {
  const { r, head, neck, fwd } = kitTools(ctx, L);
  // A tall bobble on the beanie and a turned-up collar: a knob on top of the head at any range.
  ctx.rigid(cyl(r * 0.55, r * 0.95, 0.06, 12), { bone: 'Head', pos: head(0, r * 1.12 + 0.03, -0.01), outline: 0.004 }, 'hat');
  ctx.rigid(sphere(0.042, 10, 8), { bone: 'Head', pos: head(0, r * 1.12 + 0.085, -0.01), outline: 0.004 }, 'hat2');
  ctx.rigid(new THREE.CylinderGeometry(0.105, 0.09, 0.075, 14, 1, true, PI * 0.3, PI * 1.4), { bone: 'spine_03', pos: [0, neck.y + 0.0, neck.z - 0.006 * fwd], rot: [0, fwd < 0 ? PI : 0, 0], outline: 0.004 }, 'outer');
  ctx.rigid(new THREE.CylinderGeometry(0.103, 0.088, 0.075, 14, 1, true, PI * 0.3, PI * 1.4), { bone: 'spine_03', pos: [0, neck.y + 0.0, neck.z - 0.006 * fwd], rot: [0, fwd < 0 ? PI : 0, 0], scale: [-1, 1, 1], outline: 0 }, 'outer2');
  // [polish] A padded riot vest: broad shoulder pads and a thick quilted front. At 20 m the baton
  // man is wide-shouldered and round-topped; the gunner beside him is square-chested and packed.
  const T = kitTools(ctx, L);
  pads(ctx, T, { R: 0.092, sx: 1.25, sy: 0.85, sz: 1.15, lift: 0.05, out: 0.03 });
  ctx.layer({ pick: (p, n) => !L.inArm(p) && !L.isHead(p) && p.y > L.lm.beltY + 0.02 && p.y < L.lm.neckY - 0.04 && n.z * fwd > -0.2, offset: 0.03 }, 'vest', 0.005);
});

registerExtra('role:heavy', (ctx, L) => {
  const T = kitTools(ctx, L);
  const { r, head, neck, lm, fwd, yaw } = T;
  // Pauldrons in two plates, a gorget up to the jaw (no neck), a small caged helmet: the head
  // reads tiny between the shoulders.
  pads(ctx, T, { R: 0.12, sx: 1.3, sy: 0.9, sz: 1.2, lift: 0.06, out: 0.03, layers: 2 });
  ctx.rigid(cyl(0.115, 0.15, 0.16, 16, true), { bone: 'spine_03', pos: [0, lm.neckY + 0.0, neck.z], outline: 0.005 }, 'vest');
  ctx.rigid(torus(0.118, 0.016, 5, 16), { bone: 'spine_03', pos: [0, lm.neckY + 0.08, neck.z], rot: [PI / 2, 0, 0], outline: 0.003 }, 'metal');
  ctx.rigid(sphere(r * 1.14, 16, 8, 0, PI * 2, 0, PI * 0.52), { bone: 'Head', pos: head(0, 0.01, -0.006), outline: 0.005 }, 'hat');
  for (const dx of [-0.03, 0, 0.03]) ctx.rigid(box(0.009, 0.1, 0.009), { bone: 'Head', pos: [dx, lm.eyeY - 0.03, lm.eyeFrontZ + 0.04 * fwd], outline: 0 }, 'metal');
  ctx.rigid(torus(r * 1.0, 0.006, 4, 16, PI * 0.9), { bone: 'Head', pos: head(0, -0.035, 0.0), rot: [PI / 2, 0, (fwd > 0 ? 0 : PI) + PI * 0.05], outline: 0 }, 'metal');
  void yaw;
  // A plate over the belly.
  ctx.rigid(box(0.26, 0.16, 0.05), { bone: 'spine_01', pos: [0, lm.beltY + 0.1, L.hipZ + 0.16 * fwd], outline: 0.005 }, 'vest');
});

registerExtra('role:gunner', (ctx, L) => {
  const { lm, fwd, back } = kitTools(ctx, L);
  // A chest rig of tall magazine pouches and a radio on the back: a square-chested profile.
  for (const dx of [-0.09, -0.03, 0.03, 0.09]) ctx.rigid(box(0.05, 0.11, 0.045), { bone: 'spine_03', pos: [dx, lm.chestY - 0.06, lm.chestFrontZ + 0.045 * fwd], outline: 0.003 }, 'bag');
  // [polish] A real pack (tall, deep, a bedroll-free square block) and a brimmed cap, plus the
  // rifle's sling across the chest: a square, back-heavy profile unlike the baton's pads.
  ctx.rigid(box(0.26, 0.32, 0.14), { bone: 'spine_03', pos: [0, lm.chestY - 0.06, back - 0.19 * fwd], outline: 0.005 }, 'bag');
  ctx.rigid(box(0.2, 0.07, 0.1), { bone: 'spine_03', pos: [0, lm.chestY - 0.25, back - 0.2 * fwd], outline: 0.004 }, 'hat2');
  ctx.rigid(cyl(0.007, 0.007, 0.42, 5), { bone: 'spine_03', pos: [0.08, lm.chestY + 0.28, back - 0.2 * fwd], outline: 0.002 }, 'ink');
  const { r, head } = kitTools(ctx, L);
  ctx.rigid(new THREE.CylinderGeometry(r * 0.95, r * 1.02, 0.012, 16, 1, false, -PI * 0.42, PI * 0.84), { bone: 'Head', pos: head(0, 0.05, r * 0.55), rot: [0.12 * fwd, fwd < 0 ? PI : 0, 0], scale: [1, 1, 1.25], outline: 0.004 }, 'hat2');
  const sideL = Math.sign(ctx.bp('upperarm_l').x) || 1;
  ctx.layer({ pick: (p, n) => { if (L.inArm(p) || L.isHead(p) || p.y < lm.beltY || p.y > lm.neckY) return false; const d = (p.y - lm.beltY) - (0.2 + p.x * sideL) * 1.25; return Math.abs(d) < 0.02; }, offset: 0.035 }, 'belt', 0.003);
});

registerExtra('role:sniper', (ctx, L) => {
  const { lm, r, head, fwd, back } = kitTools(ctx, L);
  // Goggles pushed up on the hood.
  for (const s of [-1, 1]) ctx.rigid(cyl(0.022, 0.022, 0.02, 12).rotateX(PI / 2 - 0.5), { bone: 'Head', pos: head(s * lm.eyeSpread * 1.15, 0.065, r * 1.12), outline: 0.003 }, 'lens');
  ctx.rigid(torus(r * 1.2, 0.007, 4, 18), { bone: 'Head', pos: head(0, 0.06, 0.0), rot: [PI / 2 + 0.35 * fwd, 0, 0], outline: 0.002 }, 'ink');
  // A bedroll across the top of the pack: the hunched back.
  const packTop = lm.chestY - 0.06 + 0.17;
  ctx.rigid(cyl(0.06, 0.06, 0.4, 12).rotateZ(PI / 2), { bone: 'spine_03', pos: [0, packTop + 0.05, back - 0.2 * fwd], outline: 0.004 }, 'hat');
  // Ghillie strips: ragged tatters hanging over the shoulders and down the back.
  let k = 0;
  for (const [a, y, len] of [[-1.25, 0.1, 0.24], [-0.95, 0.12, 0.3], [-0.6, 0.13, 0.34], [-0.25, 0.14, 0.36], [0.25, 0.14, 0.34], [0.6, 0.13, 0.36], [0.95, 0.12, 0.3], [1.25, 0.1, 0.24], [-0.4, 0.0, 0.3], [0.1, 0.0, 0.32], [0.5, 0.0, 0.3]]) {
    const R = 0.19;
    const x = Math.sin(a) * R, z = back - Math.cos(a) * R * 0.75 * fwd;
    const geo = new THREE.ConeGeometry(0.03, len, 4).translate(0, -len / 2, 0);
    ctx.rigid(geo, { bone: 'spine_03', pos: [x, lm.chestY + y, z], rot: [-0.18 * fwd, 0, Math.sin(a) * 0.35 + (k++ % 2 ? 0.1 : -0.1)], scale: [1, 1, 0.5], outline: 0.003 }, k % 3 ? 'hat' : 'outer');
  }
});

registerExtra('role:ninja', (ctx, L) => {
  const { lm, neck, fwd, back } = kitTools(ctx, L);
  // Two long scarf tails streaming back from the nape.
  for (const [dx, swing, len] of [[-0.035, 0.7, 0.7], [0.035, 1.0, 0.6]]) {
    ctx.rigid(box(0.07, len, 0.014).translate(0, -len / 2, 0), { bone: 'spine_03', pos: [dx, lm.neckY - 0.01, neck.z - 0.07 * fwd], rot: [swing * fwd, 0, dx * 4], outline: 0.004 }, 'accent');
  }
  ctx.rigid(torus(0.075, 0.025, 6, 14), { bone: 'spine_03', pos: [0, lm.neckY - 0.01, neck.z], rot: [PI / 2, 0, 0], outline: 0.004 }, 'accent');
  // A sash: a wide band, a knot at the hip and two short tails.
  ctx.layer({ pick: (p) => !L.inArm(p) && p.y > lm.beltY - 0.06 && p.y < lm.beltY + 0.03, offset: 0.012 }, 'accent', 0.004);
  const hip = ctx.bp('thigh_l');
  const sx = Math.sign(hip.x) * (Math.abs(hip.x) + 0.1);
  ctx.rigid(sphere(0.035, 8, 6), { bone: 'pelvis', pos: [sx, lm.beltY - 0.015, L.hipZ + 0.03 * fwd], outline: 0.003 }, 'accent');
  for (const t of [-0.15, 0.2]) ctx.rigid(box(0.045, 0.24, 0.01).translate(0, -0.12, 0), { bone: 'pelvis', pos: [sx, lm.beltY - 0.03, L.hipZ + 0.03 * fwd], rot: [0, 0, t], outline: 0.003 }, 'accent');
  // A straight sword in its scabbard across the back, the hilt standing over the right shoulder.
  const a = 0.62, len = 0.78;
  const cx = 0, cy = lm.chestY - 0.04, z = back - 0.14 * fwd;
  ctx.rigid(box(0.04, len, 0.028), { bone: 'spine_03', pos: [cx, cy, z], rot: [0, 0, a], outline: 0.004 }, 'ink');
  const ex = cx - Math.sin(a) * (len / 2 + 0.1), ey = cy + Math.cos(a) * (len / 2 + 0.1);
  ctx.rigid(cyl(0.016, 0.016, 0.2, 8), { bone: 'spine_03', pos: [ex, ey, z], rot: [0, 0, a], outline: 0.003 }, 'hat2');
  ctx.rigid(box(0.1, 0.016, 0.03), { bone: 'spine_03', pos: [cx - Math.sin(a) * len / 2, cy + Math.cos(a) * len / 2, z], rot: [0, 0, a], outline: 0.003 }, 'metal');
});

registerExtra('role:medic', (ctx, L) => {
  const { lm, r, head, fwd, back } = kitTools(ctx, L);
  const packTop = lm.chestY - 0.06 + 0.17, packZ = back - 0.19 * fwd;
  // A white case on the pack with a cross, a tall radio antenna with a pennant on top.
  ctx.rigid(box(0.22, 0.2, 0.05), { bone: 'spine_03', pos: [0, lm.chestY - 0.05, packZ - 0.08 * fwd], outline: 0.004 }, 'white');
  for (const [w, h] of [[0.13, 0.04], [0.04, 0.13]]) ctx.rigid(box(w, h, 0.01), { bone: 'spine_03', pos: [0, lm.chestY - 0.05, packZ - 0.108 * fwd], outline: 0 }, 'accent');
  const ax = -0.09;
  ctx.rigid(cyl(0.009, 0.012, 0.62, 6), { bone: 'spine_03', pos: [ax, packTop + 0.31, packZ], outline: 0.002 }, 'ink');
  ctx.rigid(box(0.14, 0.09, 0.008).translate(0.07 * (ax < 0 ? -1 : 1), 0, 0), { bone: 'spine_03', pos: [ax, packTop + 0.56, packZ], outline: 0.003 }, 'white');
  ctx.rigid(box(0.04, 0.04, 0.01).translate(0.07 * (ax < 0 ? -1 : 1), 0, 0), { bone: 'spine_03', pos: [ax, packTop + 0.56, packZ + 0.004 * fwd], outline: 0 }, 'accent');
  // A satchel on the hip, the strap across the chest.
  const hip = ctx.bp('thigh_r');
  ctx.rigid(box(0.08, 0.15, 0.17), { bone: 'pelvis', pos: [hip.x * 1.95, lm.beltY - 0.05, L.hipZ], outline: 0.004 }, 'bag');
  // A red cross on the cap's front.
  for (const [w, h] of [[0.04, 0.012], [0.012, 0.04]]) ctx.rigid(box(w, h, 0.006), { bone: 'Head', pos: head(0, 0.05, r * 1.08), rot: [-0.3 * fwd, 0, 0], outline: 0 }, 'accent');
});

registerExtra('role:lieutenant', (ctx, L) => {
  const T = kitTools(ctx, L);
  const { lm, fwd } = T;
  // Epaulettes (shoulder boards with a fringe), a cross strap and a holster: an officer.
  for (const name of ['upperarm_l', 'upperarm_r']) {
    const u = ctx.bp(name);
    const side = Math.sign(u.x) || 1;
    ctx.rigid(box(0.13, 0.024, 0.09), { bone: 'clavicle_' + name.slice(-1), pos: [u.x - side * 0.02, u.y + 0.065, u.z], rot: [0, 0, -side * 0.12], outline: 0.004 }, 'metal');
    ctx.rigid(cyl(0.05, 0.06, 0.05, 10, true), { bone: name, pos: [u.x + side * 0.05, u.y + 0.045, u.z], rot: [0, 0, side * PI / 2], outline: 0.003 }, 'metal');
  }
  ctx.layer({ pick: (p, n) => { if (L.inArm(p) || L.isHead(p) || p.y < lm.beltY || p.y > lm.neckY - 0.02) return false; const d = (p.y - lm.beltY) - (0.13 - p.x * Math.sign(ctx.bp('upperarm_l').x)) * 1.6; return Math.abs(d) < 0.022; }, offset: 0.024 }, 'belt', 0.003);
  ctx.layer({ pick: (p) => !L.inArm(p) && Math.abs(p.y - (lm.beltY - 0.03)) < 0.022 && Math.abs(p.x) < 0.3, offset: 0.026 }, 'belt', 0.003);
  const hip = ctx.bp('thigh_r');
  ctx.rigid(box(0.05, 0.12, 0.08), { bone: 'pelvis', pos: [hip.x * 2.0, lm.beltY - 0.08, L.hipZ + 0.02 * fwd], outline: 0.003 }, 'ink');
});

// ---------------------------------------------------------------- the look

let xrayGeo = null;
export function createEnemyLook(assets, role = 'baton', { gang = 'joker', rng = null } = {}) {
  const R = ROLE_CUTS[role] ?? ROLE_CUTS.baton;
  const G = GANGS[gang] ?? GANGS.joker;
  const r = rng ?? makeRng(Math.floor(Math.random() * 1e9));
  const pick = (a) => a[Math.floor((r.next ? r.next() : Math.random()) * a.length)];
  const extras = [...R.extras];
  let hat = R.hat;
  // The gang's head piece: a face piece or mask is added; a hat of its own (or a mask that is
  // also a hat) replaces the role's hat only where the role's head is not part of its silhouette.
  if (HEAD_EXTRAS.has(G.head) && !(CLASHES[role] ?? []).includes(G.head)) {
    extras.push(G.head);
    if (!R.headLock && G.head !== 'goggles' && G.head !== 'vines' && G.head !== 'split') hat = null;
  } else if (G.head === 'bowler' && !R.headLock) hat = 'bowler';
  const skin = pick([0xf1c8a6, 0xe0ac86, 0xc99a7c, 0xb07b58, 0x8d5a3b, 0x6b4129]);
  const cut = { ...R, hat, extras };
  delete cut.prop; delete cut.hand; delete cut.build; delete cut.height; delete cut.headLock;
  const palette = {
    skin, hair: 0x1a1612, brow: 0x1a1612, stubble: skin, eyeWhite: 0xeeeae0, iris: 0x2a2018,
    belt: 0x1e1a18, metal: 0x9aa0a8, white: 0xf2f0e8, ink: PALETTE.ink, lens: 0x2a3a4a, glove: 0x1a1a1f, stripe: 0xd8dde6, shoes: 0x16161a,
    hat2: 0x16161a, bag: 0x2a2a30, outer2: G.outer2 ?? G.outer, ...G,
  };
  if (role === 'medic') { palette.vest = 0xe8e8e0; palette.accent = 0xc8323c; palette.white = 0xf2f0e8; }
  if (role === 'shield') palette.lens = 0x8fa6bf;
  if (role === 'lieutenant') { palette.metal = 0xd9b84a; palette.outer = G.outer; }
  const ch = figureFromSpec(assets, { type: role, body: 'm', build: R.build, cut, palette, height: R.height ?? 1, width: 1 }, { lift: 0.36 });
  // Detective vision: one silhouette of the whole figure (shared geometry, see createGoon).
  ch.xray = addXray(ch.figure, PALETTE.sodium, ch.figure.geometry);
  ch.xrays = [ch.xray];
  if (R.prop === 'rifle') {
    ch.prop = attachProp(ch, rifle(), 'r');
    ch.muzzle = ch.prop.getObjectByName('muzzle');
  } else if (R.prop) {
    ch.prop = attachProp(ch, createProp(R.prop), R.hand);
    if (R.prop === 'sniper') { const m = new THREE.Object3D(); m.name = 'muzzle'; m.position.set(0, 0.02, 0.98); ch.prop.add(m); ch.muzzle = m; }
  }
  ch.type = role;
  ch.gang = gang;
  ch.meta = { ...ch.meta, role, gang, props: R.prop ?? 'none' };
  void xrayGeo;
  return ch;
}

// The gunner's rifle: a shorter carbine than the sniper's, with a magazine and a stock.
function rifle() {
  const g = createProp('carbine');
  const m = new THREE.Object3D();
  m.name = 'muzzle';
  m.position.set(0, 0.02, 0.7);
  g.add(m);
  return g;
}
