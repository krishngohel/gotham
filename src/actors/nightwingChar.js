// Nightwing: the story's entry point and the vertex-region fallback palette. The model itself is
// src/heroes/models/nightwing.js (painted from public/assets/tex/nightwing.webp when loaded;
// classifyNightwingVertex below paints the regions when it is not).
//
// mode 'ally': the real Nightwing suit, escrima sticks drawn.
// mode 'courier': the same suit under a dark hooded cloak and a purple gang mask, holding a
// stolen Wayne Tech crate, for the masked Courier misdirect (src/allies/nightwing.js drives the reveal).
import { PALETTE } from '../config/palette.js';
import { createNightwing } from '../heroes/models/nightwing.js';

// Suit colors: black with the classic bright-blue chevron (PALETTE.detective is already the
// game's one saturated "hero blue", used nowhere else on a costume, so it reads as Nightwing's
// signature color at a glance instead of Batman's grey or gold).
export const NIGHTWING_COLORS = {
  suit: 0x121218, wing: PALETTE.detective, hair: 0x0c0c14, skin: PALETTE.skin, boot: 0x0c0c12, belt: 0x232430,
};

// Region classifier (bind-pose meters, like classifySuitVertex): black suit everywhere, the
// whole arm from the shoulder to the fingers in the wing color, and a chevron on the chest that
// is wide at the collar and narrows to a point above the belt (the classic Nightwing "V").
export function classifyNightwingVertex(p, lm) {
  if (p.y > lm.neckY) {
    const front = (p.z - lm.headCenter.z) * lm.fwd;
    const face = front > lm.headRadius * 0.45 && p.y < lm.eyeY - 0.02 && p.y > lm.eyeY - 0.13;
    return face ? 'skin' : 'hair';
  }
  const ax = Math.abs(p.x);
  // The whole arm, shoulder to hand: the wing runs "down to the fingers".
  if (ax > lm.shoulderX - 0.05) return 'wing';
  if (p.y < lm.kneeY - 0.05) return 'boot';
  if (Math.abs(p.y - lm.beltY) < 0.04 && ax < lm.hipHalfWidth + 0.05) return 'belt';
  const front = (p.z - lm.chestFrontZ) * lm.fwd > -0.12;
  if (front) {
    const yTop = lm.neckY + 0.02, yBot = lm.chestY - 0.14;
    if (p.y < yTop && p.y > yBot) {
      const t = Math.max(0, Math.min(1, (yTop - p.y) / (yTop - yBot)));
      const half = (lm.shoulderX - 0.05) * (1 - t) + 0.012 * t;
      if (ax < half) return 'wing';
    }
  }
  return 'suit';
}

// The rebuilt model lives in src/heroes/models/nightwing.js (textured suit, athletic build, hair,
// domino mask, holstered sticks); this keeps the story's entry point and the region classifier
// above as its no-texture fallback.
export function createNightwingCharacter(assets, mode = 'ally', suit = 'nightwing') {
  return createNightwing(assets, { mode, suit });
}
