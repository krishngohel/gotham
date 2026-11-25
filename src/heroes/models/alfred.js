// Alfred: a tall, narrow, upright old man in tailoring. Built as a figure (one skinned mesh, see
// src/actors/civilians/figure.js) on the male body slimmed to an elder's build.
//
//   variant 'butler'      tailcoat with tails, grey waistcoat, white shirt, dark tie
//   variant 'shirtsleeves' waistcoat over a white shirt, sleeves rolled to the elbow (Batcave,
//                          patching wounds)
//   variant 'overcoat'    a long dark overcoat and scarf over the suit (the Manor grounds, the city)
//   glasses: reading glasses on; moustache: true by default
//   prop: 'tray' | 'medkit' | 'umbrella' | null, held in the right hand (meta.hands.r)
import { figureFromSpec } from '../../actors/civilians/generator.js';
import { createProp, attachProp } from './props.js';
import { holdProp } from '../../actors/carryPoses.js';
import { bindPosition } from '../../actors/rig.js';
import * as THREE from 'three';

const PALETTE = {
  skin: 0xe6b896, hair: 0xb8b6b0, brow: 0x9a9690, stubble: 0xd2a684, eyeWhite: 0xeeeae0, iris: 0x3a4a5a,
  top: 0xf2f0e8, outer: 0x16171c, outer2: 0x22232a, vest: 0x5a5c66, bottom: 0x2a2b33, shoes: 0x0e0e12,
  accent: 0x2a2236, belt: 0x16171c, metal: 0xc8c8c0, white: 0xffffff, ink: 0x0b0b12, lens: 0x2a3a4a,
};

const CUTS = {
  butler: { top: 'shirt', sleeves: 'long', outer: 'tailcoat', bottom: 'trousers', shoes: 'shoes', hair: 'thinning', extras: ['tie', 'pocketsquare'] },
  shirtsleeves: { top: 'shirt', sleeves: 'rolled', outer: 'waistcoat', bottom: 'trousers', shoes: 'shoes', hair: 'thinning', extras: ['tie'] },
  overcoat: { top: 'shirt', sleeves: 'long', outer: 'coat', bottom: 'trousers', shoes: 'shoes', hair: 'thinning', extras: ['scarf', 'gloves'] },
};

export function createAlfred(assets, { variant = 'butler', glasses = false, moustache = true, prop = null } = {}) {
  const cut = { ...(CUTS[variant] ?? CUTS.butler) };
  cut.extras = [...cut.extras, ...(moustache ? ['moustache'] : []), ...(glasses ? ['glasses'] : [])];
  const palette = { ...PALETTE, ...(variant === 'overcoat' ? { outer: 0x23252e, outer2: 0x16171c, accent: 0x5a2a2a, glove: 0x1a1410 } : {}) };
  // A touch taller than the average figure and narrow across: the silhouette is a straight line.
  const ch = figureFromSpec(assets, { type: 'alfred', body: 'm', build: 'elder', cut, palette, height: 1.02, width: 0.96 }, { layer: 0, lift: 0.4, rimStrength: 0.3 });
  ch.variant = variant;
  if (prop === 'tray') {
    // Held level on the fist (thumb up in the hold pose): the disc turned to face along the thumb
    // and pushed out along the fingers so it rests over the forearm's end.
    const tray = createProp('tray');
    const side = Math.sign(bindPosition(ch.body, 'hand_r').x) || 1;
    tray.position.set(side * 0.13, 0.12, 0.09);
    tray.rotation.x = Math.PI / 2;
    const holder = new THREE.Group();
    holder.name = 'prop-tray';
    holder.add(tray);
    ch.prop = attachProp(ch, holder, 'r');
  } else if (prop) ch.prop = attachProp(ch, createProp(prop), 'r');
  // [polish] Tray and umbrella are carried, not dangled: an upper-body hold pose over any base clip.
  if (prop) holdProp(ch, assets, prop);
  ch.meta = { ...ch.meta, name: 'Alfred', props: prop ?? 'none', heightScale: 1.02 };
  return ch;
}
