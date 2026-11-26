// Bruce Wayne out of the suit: the same body as Batman (no reshaping: he is the man in it), built
// as a figure (one skinned mesh) per outfit, with an injury layer the double-life system turns on
// and off without a rebuild:
//
//   outfit 'tux' | 'suit' | 'casual' | 'training'
//   ch.setInjuries({ bruise, lip, ribs, sling })   bruise/lip recolour regions painted into every
//     Bruce template (a black eye, a split lip); ribs (taped, shows on bare skin) and sling are a
//     small separate mesh shown only when on.
import { figureFromSpec } from '../../actors/civilians/generator.js';
import { createKit, shell, slab, torus } from './kit.js';
import { bindPosition } from '../../actors/rig.js';

const SKIN = 0xd9a882;
const BASE = {
  skin: SKIN, hair: 0x121014, brow: 0x121014, stubble: 0xc0906c, eyeWhite: 0xeeeae0, iris: 0x2a3a4a,
  belt: 0x111116, metal: 0xc8c8c0, white: 0xffffff, ink: 0x0b0b12, lens: 0x2a3a4a,
  bruise: SKIN, lip: SKIN,
};
const OUTFITS = {
  tux: { cut: { top: 'shirt', sleeves: 'long', outer: 'tux', bottom: 'trousers', shoes: 'shoes', hair: 'slick', extras: ['bowtie', 'pocketsquare'] },
    palette: { top: 0xf6f4ee, outer: 0x15161c, outer2: 0x2c2d38, vest: 0x111116, bottom: 0x111116, shoes: 0x08080c, accent: 0x08080c } },
  suit: { cut: { top: 'shirt', sleeves: 'long', outer: 'blazer', bottom: 'trousers', shoes: 'shoes', hair: 'slick', extras: ['tie'] },
    palette: { top: 0xdfe6ef, outer: 0x2a3142, outer2: 0x232a38, bottom: 0x2a3142, shoes: 0x1a120e, accent: 0x6a1a26 } },
  casual: { cut: { top: 'turtleneck', outer: 'coat', bottom: 'trousers', shoes: 'boots', hair: 'swept', extras: [] },
    palette: { top: 0x1e1e24, outer: 0x6a5a44, outer2: 0x4a3e30, bottom: 0x33363f, shoes: 0x2a1f18 } },
  training: { cut: { top: 'tank', bottom: 'trousers', shoes: 'sneakers', hair: 'swept', extras: ['gloves'] },
    palette: { top: 0x2a2c34, bottom: 0x1e1e24, shoes: 0x2a2a30, glove: 0xe8e4da } },
};

export function createBruce(assets, { outfit = 'suit', injuries = null } = {}) {
  const o = OUTFITS[outfit] ?? OUTFITS.suit;
  const cut = { ...o.cut, extras: [...o.cut.extras, 'injuries'] };
  const palette = { ...BASE, ...o.palette };
  const ch = figureFromSpec(assets, { type: 'bruce', body: 'm', build: 'athletic', cut, palette, height: 1.02 }, { layer: 0, lift: 0.4, rimStrength: 0.3 });
  ch.outfit = outfit;

  // The optional pieces: tape round the ribs (seen only where the top leaves skin bare) and a sling.
  const { lm, body } = ch;
  const fwd = lm.fwd;
  const kit = createKit(ch, { lift: 0.4, rimStrength: 0.55 }).slot('sling', { lift: 0.4, rimStrength: 0.55 });
  kit.skinned(shell(ch.body.geometry, { pick: (p) => !(Math.abs(p.x) > lm.shoulderX - 0.02 && p.y > lm.chestY - 0.12) && p.y > lm.beltY + 0.05 && p.y < lm.chestY - 0.04 && (Math.floor((p.y - lm.beltY) / 0.035) % 2 === 0), offset: 0.004, color: 0xefe9dc, uv: false }), { outline: 0.002 });
  const ua = bindPosition(body, 'upperarm_r');
  kit.rigid(slab([[-0.16, 0.06], [0.05, 0.06], [0.0, -0.2]], 0.03, 0.006), { bone: 'spine_03', slot: 'sling', color: 0xf2f0e8, outline: 0.004, pos: [-0.02 * Math.sign(ua.x), lm.chestY - 0.06, lm.chestFrontZ + 0.07 * fwd], rot: [0, fwd < 0 ? Math.PI : 0, 0] });
  kit.rigid(torus(0.17, 0.012, 4, 20, Math.PI), { bone: 'spine_03', slot: 'sling', color: 0xf2f0e8, outline: 0.002, pos: [0, lm.neckY - 0.1, bindPosition(body, 'neck_01').z], rot: [0.3 * fwd, 0, Math.PI], scale: [0.8, 1.1, 1] });
  const [tape, sling] = kit.build();
  tape.visible = false;
  sling.visible = false;
  const state = { bruise: false, lip: false, ribs: false, sling: false };
  ch.setInjuries = (next = {}) => {
    Object.assign(state, next);
    ch.setPalette({ ...ch.palette, bruise: state.bruise ? 0x6a4a7a : SKIN, lip: state.lip ? 0xa8323a : SKIN });
    tape.visible = state.ribs && outfit === 'training';
    sling.visible = state.sling;
  };
  ch.injuries = state;
  if (injuries) ch.setInjuries(injuries);
  ch.meta = { ...ch.meta, name: 'Bruce Wayne', heightScale: 1.02, props: 'none' };
  return ch;
}

export const BRUCE_OUTFITS = Object.keys(OUTFITS);
