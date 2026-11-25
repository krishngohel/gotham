// The rogues gallery as figures (one skinned mesh each, see src/actors/civilians/figure.js):
// original takes on the research doc's villains. Models only; behaviour comes later. Names are
// data keys so the project can be renamed.
//   createVillain(assets, id) -> character (createBat shape) with meta.props for their weapon
//
// The campaign's boss fights load four of these (src/bosses/defs: penguin -> crimeBoss, riddler ->
// puzzler, scarecrow -> scarecrow, freeze -> coldScientist); each has a silhouette kit of its own,
// registered as a wardrobe extra ('villain:<id>') so it bakes into the figure's one mesh:
//   crimeBoss      short and round: a belly, a long white scarf, top hat, cigarette holder, umbrella
//   puzzler        lean and tall: bowler, domino mask, question-mark pin, the hooked cane
//   scarecrow      tall and gaunt: sack head under a floppy wide hat, a noose, a coat in tatters, straw
//   coldScientist  bulky: a glass dome open at the face, red goggles, pauldrons, gauntlets, tanks
import * as THREE from 'three';
import { figureFromSpec } from '../../actors/civilians/generator.js';
import { registerExtra } from '../../actors/civilians/wardrobe.js';
import { box, cyl, sphere, torus } from './kit.js';
import { createProp, attachProp } from './props.js';

const base = { eyeWhite: 0xeeeae0, iris: 0x2a2018, belt: 0x1e1a18, metal: 0xb8bcc4, white: 0xf2f0e8, ink: 0x0b0b12, lens: 0x2a3a4a, glove: 0x1e1e24, stripe: 0xd8dde6 };
const pal = (skin, hair, extra) => ({ ...base, skin, hair, brow: hair, stubble: skin, ...extra });

export const VILLAINS = {
  // A short, round crime boss: tuxedo tails, top hat, monocle, an umbrella.
  crimeBoss: { name: 'The Penguin-like boss', body: 'm', build: 'heavy', height: 0.8, width: 1.22, prop: 'bossUmbrella',
    cut: { top: 'shirt', sleeves: 'long', outer: 'tailcoat', bottom: 'trousers', shoes: 'shoes', hair: 'thinning', hat: 'tophat', extras: ['monocle', 'gloves', 'villain:crimeBoss'] },
    palette: pal(0xe8c0a0, 0x2a2420, { top: 0xf2f0e8, outer: 0x111116, outer2: 0x1c1c24, vest: 0x5a2a6a, bottom: 0x111116, shoes: 0x08080c, hat: 0x111116, hat2: 0x5a2a6a, accent: 0xe8923a, metal: 0xd9b84a, glove: 0xe8e4da, white: 0xf4f1e8 }) },
  // The riddle-obsessed one: green suit, bowler, question-mark tie, a hooked cane.
  puzzler: { name: 'The Riddler-like puzzler', body: 'm', build: 'slim', height: 1.05, width: 0.9, prop: 'cane',
    cut: { top: 'shirt', sleeves: 'long', outer: 'blazer', bottom: 'trousers', shoes: 'shoes', hair: 'short', hat: 'bowler', extras: ['questionmark', 'gloves', 'villain:puzzler'] },
    palette: pal(0xe0ac86, 0xa8562a, { top: 0x3a2a4a, outer: 0x2f8a3a, outer2: 0x24702e, bottom: 0x2f8a3a, shoes: 0x1a1a1f, hat: 0x2f8a3a, hat2: 0x111116, accent: 0x7dff4a, glove: 0x6a3fa3, lens: 0x1a4a22 }) },
  // The scarecrow: a burlap sack head, a ragged long coat, rope at the waist, a gas tank.
  scarecrow: { name: 'The Scarecrow-like doctor', body: 'm', build: 'slim', height: 1.1, width: 0.86, prop: null,
    cut: { top: 'shirt', sleeves: 'long', outer: 'coat', bottom: 'trousers', shoes: 'boots', hair: 'bald', extras: ['burlap', 'gloves', 'belt', 'villain:scarecrow'] },
    palette: pal(0xd8b090, 0x3a2a1a, { top: 0x6a5a3a, outer: 0x4a3f2c, outer2: 0x3a3022, bottom: 0x3f3a2c, shoes: 0x2a1f18, hat: 0xb89a62, hat2: 0x2a2219, accent: 0x7a6a44, belt: 0x8a7a52, glove: 0x3a3022 }) },
  // The two-faced district attorney: a suit split dark and light, one side of his face scarred.
  twoFace: { name: 'The two-faced DA', body: 'm', build: 'average', height: 1.0, prop: null,
    cut: { top: 'shirt', sleeves: 'long', outer: 'blazer', bottom: 'trousers', shoes: 'shoes', hair: 'slick', extras: ['split', 'splitface', 'tie'] },
    palette: pal(0xe0ac86, 0x2a2420, { top: 0xe8e2d6, outer: 0xe0dcd0, outer2: 0x16171c, bottom: 0xe0dcd0, shoes: 0x111116, accent: 0x6a1a26, scar: 0x9a4a6a }) },
  // The cold-suit scientist: insulated armour, a glass dome, tanks on the back.
  coldScientist: { name: 'The cold-suit scientist', body: 'm', build: 'brute', height: 1.08, prop: null,
    cut: { top: 'sweater', sleeves: 'long', outer: 'tactical', bottom: 'trousers', shoes: 'boots', hair: 'bald', extras: ['kneepads', 'gloves', 'villain:coldScientist'] },
    palette: pal(0xb8c8d8, 0x9a9690, { top: 0xa8b8c8, vest: 0x5a7a9a, bottom: 0x8a9aa8, shoes: 0x3a4a5a, lens: 0x9fd8f0, metal: 0x7fd8ff, glove: 0x3a4a5a, accent: 0xd8323c, hat: 0xc8d4de, hat2: 0x2a3644 }) },
  // The clay brute: the scaled body, mud-grey skin, torn trousers, nothing else.
  clayBrute: { name: 'The clay brute', body: 'm', build: 'brute', height: 1.3, width: 1.12, prop: null,
    cut: { top: 'bare', bottom: 'shorts', shoes: 'boots', hair: 'bald', extras: [] },
    palette: pal(0x8a7a62, 0x6a5a46, { bottom: 0x3a3a40, shoes: 0x6a5a46, eyeWhite: 0xe8d23a, iris: 0x2a2a10 }) },
  // The venom-fed wrestler variant of the brute: a luchador mask, tubes, green veins.
  venomBrute: { name: 'The venom brute', body: 'm', build: 'brute', height: 1.32, width: 1.15, prop: null,
    cut: { top: 'bare', bottom: 'trousers', shoes: 'boots', hair: 'bald', extras: ['mercmask', 'vines', 'belt'] },
    palette: pal(0xc99a7c, 0x1a1a1f, { bottom: 0x1a1a1f, shoes: 0x1a1a1f, hat: 0x1a1a1f, hat2: 0x2a2a30, accent: 0x62c141, belt: 0x5a4a2a }) },
  // The cat burglar: black catsuit, cat-eared hood, goggles, a whip coiled at the hip.
  catBurglar: { name: 'The cat burglar', body: 'f', build: 'slim', height: 0.98, prop: null,
    cut: { top: 'turtleneck', sleeves: 'long', bottom: 'trousers', shoes: 'boots', hair: 'bob', extras: ['catears', 'goggles', 'gloves', 'belt'] },
    palette: pal(0xe0ac86, 0x16120f, { top: 0x16161c, bottom: 0x16161c, shoes: 0x0e0e12, hat: 0x16161c, lens: 0x6a8a3a, glove: 0x0e0e12, belt: 0x3a3a40 }) },
  // The masked mercenary: armour, a two-tone full mask, a sword in the hand.
  mercenary: { name: 'The masked mercenary', body: 'm', build: 'heavy', height: 1.04, prop: 'sword',
    cut: { top: 'sweater', sleeves: 'long', outer: 'tactical', bottom: 'trousers', shoes: 'boots', hair: 'bald', extras: ['mercmask', 'kneepads', 'gloves', 'holster', 'belt'] },
    palette: pal(0xc99a7c, 0xd8d4cc, { top: 0x2a2a30, vest: 0x1a2a4a, bottom: 0x2a2a30, shoes: 0x111116, hat: 0xd06a2c, hat2: 0x111116, glove: 0x111116 }) },
  // The jester and his harlequin, as figures (the boss fight keeps characters.js createJoker).
  jester: { name: 'The Joker (figure)', body: 'm', build: 'slim', height: 1.04, prop: null,
    cut: { top: 'shirt', sleeves: 'long', outer: 'tailcoat', bottom: 'trousers', shoes: 'shoes', hair: 'swept', extras: ['bowtie', 'gloves'] },
    palette: pal(0xf4f1e8, 0x3f9e34, { top: 0xe8923a, outer: 0x6c3fa3, outer2: 0x4a2a78, vest: 0x62c141, bottom: 0x6c3fa3, shoes: 0x3a2a24, accent: 0x62c141, glove: 0x8f5fcf, iris: 0x2a4a2a, stubble: 0xf4f1e8 }) },
  harlequin: { name: 'Harley (figure)', body: 'f', build: 'slim', height: 0.97, prop: 'mallet',
    cut: { top: 'tee', sleeves: 'long', bottom: 'trousers', shoes: 'boots', hair: 'ponytail', extras: ['split', 'gloves', 'belt'] },
    palette: pal(0xf6f0e6, 0xf2d24b, { top: 0xc8323c, outer2: 0x16161c, bottom: 0xc8323c, shoes: 0x16161c, glove: 0x16161c, belt: 0x2a2430 }) },
  // [story2] Act IV and V bosses (workstream J2): the botanist, the flying arsonist, the masked strategist.
  ivy: { name: 'The botanist', body: 'f', build: 'slim', height: 0.99, prop: null,
    cut: { top: 'turtleneck', sleeves: 'long', bottom: 'trousers', shoes: 'boots', hair: 'long', extras: ['vines', 'gloves', 'belt'] },
    palette: pal(0xe8d0b0, 0xb8321e, { top: 0x2f6a2a, bottom: 0x2a4a22, shoes: 0x1e2a18, hat: 0x3a7a2a, accent: 0x5aa83a, glove: 0x2a4a22, belt: 0x6a3a1e }) },
  firebug: { name: 'The flying arsonist', body: 'm', build: 'average', height: 1.02, prop: null,
    cut: { top: 'sweater', sleeves: 'long', outer: 'tactical', bottom: 'trousers', shoes: 'boots', hair: 'bald', hat: 'swat', extras: ['goggles', 'backpack', 'gloves', 'kneepads'] },
    palette: pal(0xd8a888, 0x3a2a1a, { top: 0x4a3a2a, vest: 0x6a3a1a, bottom: 0x3a3a30, shoes: 0x1a1a1f, hat: 0x6a3a1a, lens: 0xf08a24, glove: 0x2a2420, accent: 0xf08a24 }) },
  blackMask: { name: 'The masked strategist', body: 'm', build: 'average', height: 1.02, prop: null,
    cut: { top: 'shirt', sleeves: 'long', outer: 'blazer', bottom: 'trousers', shoes: 'shoes', hair: 'bald', extras: ['mercmask', 'tie', 'gloves'] },
    palette: pal(0xd8b090, 0x111116, { top: 0xe8e2d6, outer: 0x16161c, outer2: 0x0b0b10, bottom: 0x16161c, shoes: 0x08080c, hat: 0x0b0b10, hat2: 0x2a2a30, accent: 0x8a1a1a, glove: 0x16161c }) },
};

// ---------------------------------------------------------------- silhouette kits

const PI = Math.PI;
const tools = (ctx, L) => {
  const { lm } = L;
  const hc = lm.headCenter, r = lm.headRadius, fwd = L.fwd;
  return { lm, hc, r, fwd, yaw: fwd < 0 ? PI : 0, head: (dx, dy, dz) => [hc.x + dx, hc.y + dy, hc.z + dz * fwd], neck: ctx.bp('neck_01'), back: ctx.bp('spine_03').z };
};

registerExtra('villain:crimeBoss', (ctx, L) => {
  const { lm, r, head, neck, fwd, yaw } = tools(ctx, L);
  // A round belly in the waistcoat, pushing the tailcoat open.
  ctx.rigid(sphere(0.2, 16, 12), { bone: 'spine_01', pos: [0, lm.beltY + 0.1, L.hipZ + 0.05 * fwd], scale: [1.05, 1.0, 0.85], outline: 0.005 }, 'vest');
  for (const dy of [0.17, 0.1, 0.03]) ctx.rigid(sphere(0.012, 6, 4), { bone: 'spine_01', pos: [0, lm.beltY + dy, L.hipZ + (0.05 + 0.17 * Math.cos((dy - 0.1) * 4)) * fwd], outline: 0 }, 'metal');
  // A long white scarf round the neck, both ends down the front.
  ctx.rigid(torus(0.085, 0.03, 6, 16), { bone: 'spine_03', pos: [0, lm.neckY - 0.02, neck.z], rot: [PI / 2, 0, 0], scale: [1, 0.9, 1], outline: 0.004 }, 'white');
  for (const s of [-1, 1]) ctx.rigid(box(0.065, 0.36, 0.02).translate(0, -0.18, 0), { bone: 'spine_03', pos: [s * 0.06, lm.neckY - 0.04, lm.chestFrontZ + 0.04 * fwd], rot: [-0.12 * fwd, 0, s * 0.1], outline: 0.004 }, 'white');
  // A big hooked nose and a cigarette holder at a jaunty angle.
  ctx.rigid(new THREE.ConeGeometry(0.02, 0.07, 8).rotateX(PI / 2), { bone: 'Head', pos: [0, lm.eyeY - 0.03, lm.eyeFrontZ + 0.045 * fwd], rot: [0.35 * fwd, yaw, 0], outline: 0.003 }, 'skin');
  ctx.rigid(cyl(0.004, 0.004, 0.16, 5).rotateX(PI / 2), { bone: 'Head', pos: [0.05, lm.eyeY - 0.085, lm.eyeFrontZ + 0.07 * fwd], rot: [-0.3 * fwd, 0.5 * fwd, 0], outline: 0.002 }, 'ink');
  ctx.rigid(cyl(0.006, 0.006, 0.03, 6).rotateX(PI / 2), { bone: 'Head', pos: [0.095, lm.eyeY - 0.06, lm.eyeFrontZ + 0.14 * fwd], rot: [-0.3 * fwd, 0.5 * fwd, 0], outline: 0 }, 'accent');
  void r; void head;
});

registerExtra('villain:puzzler', (ctx, L) => {
  const { lm, fwd } = tools(ctx, L);
  // A domino mask, and a question-mark pin on the bowler's band.
  ctx.layer({ pick: (p, n) => {
    if (n.z * fwd < 0.15 || !L.isHead(p) || L.headFront(p) < 0.2) return false;
    const ax = Math.abs(p.x);
    return ax < 0.085 && p.y > lm.eyeY - 0.022 + ax * 0.1 && p.y < lm.eyeY + 0.026 + ax * 0.2;
  }, offset: 0.004 }, 'lens', 0.003);
  ctx.rigid(torus(0.014, 0.004, 4, 10, PI * 1.4), { bone: 'Head', pos: [0.03, lm.eyeY + 0.09, lm.eyeFrontZ + 0.04 * fwd], rot: [0, fwd < 0 ? PI : 0, -0.6], outline: 0 }, 'accent');
});

registerExtra('villain:scarecrow', (ctx, L) => {
  const { lm, r, head, neck, fwd } = tools(ctx, L);
  // A floppy wide-brimmed hat, the brim drooping all round, a dent in the crown.
  ctx.rigid(cyl(r * 0.9, r * 1.12, 0.13, 12), { bone: 'Head', pos: head(0, 0.11, -0.01), rot: [-0.12 * fwd, 0, 0.1], outline: 0.005 }, 'hat2');
  ctx.rigid(sphere(r * 0.92, 10, 4, 0, PI * 2, 0, PI * 0.35), { bone: 'Head', pos: head(0, 0.13, -0.012), rot: [-0.12 * fwd, 0, 0.1], scale: [1, 0.5, 1], outline: 0.004 }, 'hat2');
  // The brim: nearly flat round the crown, the outer band flopping down, lower at the front.
  const brim = (r0, r1, h, y, sign) => ctx.rigid(new THREE.CylinderGeometry(r0, r1, h, 18, 1, true), { bone: 'Head', pos: head(0, y, -0.01), rot: [-0.16 * fwd, 0, 0.1], scale: [sign, 1, 1.1], outline: sign > 0 ? 0.005 : 0 }, 'hat2');
  brim(r * 1.1, r * 1.75, 0.018, 0.05, 1); brim(r * 1.09, r * 1.74, 0.018, 0.05, -1);
  brim(r * 1.75, r * 2.05, 0.06, 0.011, 1); brim(r * 1.74, r * 2.04, 0.06, 0.011, -1);
  // Straw sticking out from under the hat and the sack, at the cuffs and the collar.
  const up = new THREE.Vector3(0, 1, 0);
  const tuft = (pos, dir, bone, len = 0.08) => ctx.rigid(new THREE.ConeGeometry(0.012, len, 4).translate(0, len / 2, 0), { bone, pos, quat: new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()), outline: 0.002 }, 'hat');
  for (let k = 0; k < 7; k++) { const a = -1.2 + k * 0.4; tuft(head(Math.sin(a) * r * 1.05, -0.02, -Math.abs(Math.cos(a)) * r * 0.9), new THREE.Vector3(Math.sin(a), -0.8, -0.4 * fwd), 'Head', 0.07 + (k % 2) * 0.04); }
  for (const name of ['hand_l', 'hand_r']) {
    const h = ctx.bp(name);
    const s = Math.sign(h.x) || 1;
    for (let k = 0; k < 4; k++) tuft([h.x - s * 0.06, h.y + (k - 1.5) * 0.015, h.z + (k % 2 ? 0.02 : -0.02)], new THREE.Vector3(s, (k - 1.5) * 0.4, (k % 2 ? 0.3 : -0.3)), name, 0.07);
  }
  // A noose round the neck, its knot at the side and a frayed end hanging down the chest.
  ctx.rigid(torus(0.075, 0.013, 5, 16), { bone: 'spine_03', pos: [0, lm.neckY - 0.01, neck.z], rot: [PI / 2 - 0.1 * fwd, 0, 0], outline: 0.003 }, 'belt');
  ctx.rigid(cyl(0.022, 0.022, 0.07, 8), { bone: 'spine_03', pos: [0.06, lm.neckY - 0.04, neck.z + 0.05 * fwd], rot: [0, 0, 0.3], outline: 0.003 }, 'belt');
  ctx.rigid(cyl(0.012, 0.012, 0.28, 6).translate(0, -0.14, 0), { bone: 'spine_03', pos: [0.065, lm.neckY - 0.07, lm.chestFrontZ + 0.05 * fwd], rot: [-0.08 * fwd, 0, 0.12], outline: 0.003 }, 'belt');
  // The coat's hem torn into tatters of uneven length.
  const hem = lm.kneeY - 0.1, R0 = lm.hipHalfWidth * 0.95;
  for (let k = 0; k < 16; k++) {
    const a = 0.3 + (k / 15) * (PI * 2 - 0.6);
    const len = 0.08 + ((k * 7) % 5) * 0.03;
    ctx.rigid(new THREE.ConeGeometry(0.045, len, 3).translate(0, -len / 2, 0), { bone: 'pelvis', pos: [Math.sin(a) * R0, hem + 0.01, L.hipZ + Math.cos(a) * R0 * 0.8 * fwd], rot: [0, a * fwd, 0], scale: [1, 1, 0.25], outline: 0.003 }, 'outer');
  }
});

registerExtra('villain:coldScientist', (ctx, L) => {
  const { lm, r, head, neck, fwd, yaw, back } = tools(ctx, L);
  // The dome: glass over the crown and the back of the head, open at the face (so his face reads),
  // in a metal frame; red goggles under it.
  ctx.rigid(sphere(r * 1.55, 20, 12, PI * 0.5 + PI * 0.36, PI * 2 - PI * 0.72, 0, PI * 0.78), { bone: 'Head', pos: head(0, 0.0, -0.01), rot: [0, yaw, 0], outline: 0.004 }, 'lens');
  ctx.rigid(torus(r * 1.42, 0.014, 5, 20, PI * 1.05), { bone: 'Head', pos: head(0, 0.0, r * 0.62), rot: [0, yaw, -PI * 0.025], scale: [0.72, 1.05, 1], outline: 0.003 }, 'metal');
  ctx.rigid(torus(r * 1.56, 0.012, 5, 24), { bone: 'Head', pos: head(0, 0.0, -0.01), rot: [0, PI / 2, 0], outline: 0.002 }, 'metal');
  for (const s of [-1, 1]) ctx.rigid(cyl(0.022, 0.022, 0.02, 12).rotateX(PI / 2), { bone: 'Head', pos: [s * lm.eyeSpread, lm.eyeY + 0.004, lm.eyeFrontZ + 0.012 * fwd], outline: 0.003 }, 'accent');
  ctx.rigid(torus(r * 1.03, 0.007, 4, 18), { bone: 'Head', pos: head(0, 0.004, 0.0), rot: [PI / 2, 0, 0], outline: 0.002 }, 'hat2');
  // A thick collar ring the dome seats on.
  ctx.rigid(torus(0.14, 0.035, 8, 20), { bone: 'spine_03', pos: [0, lm.neckY - 0.03, neck.z], rot: [PI / 2, 0, 0], outline: 0.005 }, 'metal');
  // Pauldrons, gauntlets and a chest unit.
  for (const name of ['upperarm_l', 'upperarm_r']) {
    const u = ctx.bp(name);
    const s = Math.sign(u.x) || 1;
    ctx.rigid(sphere(0.13, 14, 8, 0, PI * 2, 0, PI * 0.55), { bone: name, pos: [u.x + s * 0.04, u.y + 0.05, u.z], scale: [1.25, 0.85, 1.15], rot: [0, 0, -s * 0.35], outline: 0.005 }, 'hat');
  }
  for (const name of ['lowerarm_l', 'lowerarm_r']) {
    const e = ctx.bp(name), h = ctx.bp(name === 'lowerarm_l' ? 'hand_l' : 'hand_r');
    const mid = e.clone().lerp(h, 0.6);
    ctx.rigid(cyl(0.075, 0.065, e.distanceTo(h) * 0.7, 12).rotateZ(PI / 2), { bone: name, pos: [mid.x, mid.y, mid.z], outline: 0.005 }, 'hat');
  }
  ctx.rigid(box(0.2, 0.14, 0.07), { bone: 'spine_03', pos: [0, lm.chestY - 0.02, lm.chestFrontZ + 0.07 * fwd], outline: 0.005 }, 'hat');
  ctx.rigid(box(0.12, 0.05, 0.01), { bone: 'spine_03', pos: [0, lm.chestY - 0.01, lm.chestFrontZ + 0.108 * fwd], outline: 0 }, 'lens');
  // Two cold tanks on the back with domed ends, hoses arching over the shoulders to the collar.
  for (const s of [-1, 1]) {
    const x = s * 0.1, z = back - 0.2 * fwd, y = lm.chestY - 0.06;
    ctx.rigid(cyl(0.075, 0.075, 0.4, 14), { bone: 'spine_03', pos: [x, y, z], outline: 0.005 }, 'metal');
    for (const dy of [-0.2, 0.2]) ctx.rigid(sphere(0.075, 12, 6, 0, PI * 2, dy > 0 ? 0 : PI / 2, PI / 2), { bone: 'spine_03', pos: [x, y + dy, z], outline: 0.004 }, 'metal');
    ctx.rigid(torus(0.13, 0.018, 6, 12, PI), { bone: 'spine_03', pos: [x, y + 0.2, z + 0.13 * fwd], rot: [0, PI / 2, 0], outline: 0.003 }, 'hat2');
  }
  ctx.rigid(box(0.26, 0.06, 0.12), { bone: 'spine_03', pos: [0, lm.chestY - 0.27, back - 0.2 * fwd], outline: 0.004 }, 'hat2');
});

export function createVillain(assets, id, opts = {}) {
  const v = VILLAINS[id];
  if (!v) throw new Error(`Unknown villain ${id}`);
  const ch = figureFromSpec(assets, { type: id, ...v }, { layer: 0, lift: 0.4, ...opts });
  if (v.prop) ch.prop = attachProp(ch, createProp(v.prop), 'r');
  ch.meta = { ...ch.meta, name: v.name, props: v.prop ?? 'none', heightScale: v.height };
  return ch;
}
