// A gaslight-era Batman: a stitched cowl with round brass-rimmed goggles, a long dark frock coat
// open at the front, a short shoulder cape (the cloth), leather gauntlets and riding boots.
// [polish] Built on the reworked Batman's chassis (batman.js: the hero body, cowl, chest plate,
// gauntlets, belt and boots) in leather and wool, with the coat and goggles added on top.
import * as THREE from 'three';
import { createBatmanModel } from './batman.js';
import { collar } from './costume.js';
import { shell, skirt, torus } from './kit.js';

const COAT = 0x2c2b31;
const LOOK = {
  palette: {
    suit: 0x4d4f57, dark: 0x1c1b1f, accent: 0x6a4626, emblem: 0x1c1b1f, line: 0x141317,
    cape: COAT, lens: 0xe6e0c8, skin: 0xc99a7c, glove: 0x4a3324, fin: 0x8a6a3a, plate: 0x3e4048,
  },
  ears: 0.72, collar: 'none', mantle: false, lenses: false,
  // The coat's broad flat tails took the full fresnel rim edge-on and flashed pale blue.
  rimStrength: 0.35,
  cape: { topWidth: 0.6, bottomWidth: 1.0, length: 0.62, pointDrop: 0.03 },
  extra({ ch, body, src, kit, lm, fwd, cowl, B }) {
    // Goggles: a brass ring and a pale glass over each eye, seated on the cowl.
    const P = cowl.attributes.position;
    for (const side of [-1, 1]) {
      const x = side * lm.eyeSpread, y = lm.eyeY + 0.004;
      let z = -Infinity;
      for (let i = 0; i < P.count; i++) if (Math.abs(P.getX(i) - x) < 0.012 && Math.abs(P.getY(i) - y) < 0.012) z = Math.max(z, P.getZ(i) * fwd);
      z = (z + 0.004) * fwd;
      kit.rigid(torus(0.019, 0.005, 6, 16), { bone: 'Head', color: 0xc09a46, outline: 0.002, pos: [x, y, z], rot: [0, fwd < 0 ? Math.PI : 0, 0] });
      kit.rigid(new THREE.CircleGeometry(0.017, 16), { bone: 'Head', slot: 'unlit', color: 0xe6e0c8, outline: 0, pos: [x, y, z + 0.001 * fwd], rot: [0, fwd < 0 ? Math.PI : 0, 0] });
    }
    // The frock coat: sleeves to the wrist, the body open down the front (the chest plate and its
    // bat show between the lapels), skirts to the knee.
    const inArm = (p) => Math.abs(p.x) > lm.shoulderX - 0.02 && p.y > lm.chestY - 0.12;
    const wristX = Math.abs(B('hand_l').x) - 0.12;
    kit.skinned(shell(src, {
      pick: (p, n) => (inArm(p) ? Math.abs(p.x) < wristX : p.y > lm.beltY - 0.06 && p.y < lm.neckY - 0.01 && !(n.z * fwd > -0.1 && Math.abs(p.x) < 0.07 + Math.max(0, p.y - (lm.chestY - 0.1)) * 0.5)),
      offset: 0.02, color: COAT, uv: false,
    }), { outline: 0.005 });
    const tails = { top: lm.beltY - 0.03, bottom: lm.kneeY - 0.16, rTop: lm.hipHalfWidth * 0.74, rBottom: lm.hipHalfWidth * 1.05, depth: 0.85, open: 0.3, segs: 22, rows: 6 };
    kit.skinned(skirt(ch.body, lm, { ...tails, color: COAT }), { outline: 0.005 });
    // A dark lining facing in: the bare inside of the tails caught the rim light and flashed
    // pale blue in profile.
    const lining = skirt(ch.body, lm, { ...tails, rTop: tails.rTop * 0.97, rBottom: tails.rBottom * 0.97, color: 0x16151a });
    const ix = lining.index.array;
    for (let t = 0; t < ix.length; t += 3) { const s = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = s; }
    lining.computeVertexNormals();
    kit.skinned(lining, { outline: 0 });
    collar(kit, B, lm, COAT, { r: 0.112, h: 0.11 });
    void body;
  },
};

export function createGaslightBat(assets) {
  const ch = createBatmanModel(assets, 'm', { id: 'gaslightBat', look: LOOK });
  ch.suit = 'gaslightBat';
  ch.colors = { ...ch.colors, suit: LOOK.palette.suit, coat: COAT, cape: COAT };
  ch.meta = { ...ch.meta, traversal: 'glide' };
  return ch;
}
