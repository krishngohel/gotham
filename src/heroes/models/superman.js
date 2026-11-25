// The flying man: an original take. Blue, a long red cape, red boots and trunks, a yellow belt,
// and a five-sided chest shield with our own ribbon glyph (not the official mark). Unmasked: his
// own eyes, black hair with one curl on the forehead.
import * as THREE from 'three';
import { costumeBody, hairLocks, collar, chestDecal } from './costume.js';
import { torus } from './kit.js';
import { frontHeightField } from './shape.js';

// The glyph: a comet's tail, one rising sweep from lower left to upper right, as a closed band
// polygon (metres). It sits under a five-point star on an upright oval badge: our own mark,
// deliberately nothing like the comics' letter-in-a-pentagon.
export function ribbonGlyph(s = 1) {
  const centre = [[-0.05, -0.04], [-0.034, -0.026], [-0.018, -0.016], [-0.002, -0.006], [0.012, 0.004], [0.022, 0.014], [0.03, 0.026], [0.034, 0.038]];
  const w = 0.011;
  const left = [], right = [];
  for (let i = 0; i < centre.length; i++) {
    const a = centre[Math.max(0, i - 1)], b = centre[Math.min(centre.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    left.push([(centre[i][0] + nx * w) * s, (centre[i][1] + ny * w) * s]);
    right.push([(centre[i][0] - nx * w) * s, (centre[i][1] - ny * w) * s]);
  }
  return [...left, ...right.reverse()];
}

export function createSuperman(assets) {
  const { ch, src, kit, B, lm, fwd } = costumeBody(assets, 'superman', { eyes: true, height: 1.03 });
  hairLocks(kit, src, lm, { color: 0x0e0e16, volume: 0.016, fringe: false, locks: 10, sweep: 0.9 });
  // The curl.
  // A lock falling from the hairline onto the forehead, its tip hooked back on itself (it used to
  // be a ring floating on the skin and read as a tattoo).
  const fz = lm.headCenter.z + lm.headRadius * 1.02 * fwd;
  kit.rigid(new THREE.ConeGeometry(0.014, 0.065, 6).translate(0, -0.0325, 0), { bone: 'Head', color: 0x0e0e16, outline: 0.003, pos: [0.008, lm.eyeY + 0.085, fz], rot: [0.5 * fwd, 0, -0.35] });
  kit.rigid(torus(0.011, 0.0045, 4, 10, Math.PI * 1.4), { bone: 'Head', color: 0x0e0e16, outline: 0.002, pos: [0.024, lm.eyeY + 0.035, fz + 0.012 * fwd], rot: [0, fwd < 0 ? Math.PI : 0, 1.2] });
  // The badge: an upright red oval, a yellow inset, the red comet sweep and its star, each wrapped
  // onto the chest and skinned like the chest under it (chestDecal), so they flex with the torso.
  const hf = frontHeightField(src, lm, lm.chestY, fwd);
  const oval = (rx, ry) => Array.from({ length: 28 }, (_, k) => { const a = (k / 28) * Math.PI * 2; return [Math.cos(a) * rx, Math.sin(a) * ry]; });
  const star = (R, x0, y0) => Array.from({ length: 10 }, (_, k) => { const a = Math.PI / 2 + (k / 10) * Math.PI * 2, rr = k % 2 ? R * 0.42 : R; return [x0 + Math.cos(a) * rr, y0 + Math.sin(a) * rr]; });
  const y = lm.chestY + 0.03;
  kit.skinned(chestDecal(src, lm, oval(0.095, 0.075), { y, lift: 0.004, color: 0xc8262f, hf }), { outline: 0.002 });
  kit.skinned(chestDecal(src, lm, oval(0.08, 0.06), { y, lift: 0.007, color: 0xf2d24b, hf }), { outline: 0 });
  kit.skinned(chestDecal(src, lm, ribbonGlyph(1.1), { y: y - 0.004, x: -0.008, lift: 0.01, color: 0xc8262f, hf }), { outline: 0 });
  kit.skinned(chestDecal(src, lm, star(0.024, 0.032, 0.032), { y: y - 0.004, lift: 0.01, color: 0xc8262f, hf }), { outline: 0 });
  collar(kit, B, lm, 0xb8222b, { r: 0.1, h: 0.035 });
  kit.build();
  ch.suit = 'superman';
  ch.colors = { suit: 0x2c56b0, cape: 0xb8222b };
  ch.meta = { heightScale: 1.03, cape: { color: 0xb8222b, options: { topWidth: 0.58, bottomWidth: 1.15, length: 1.35, pointDrop: 0.0 } }, hands: { l: 'hand_l', r: 'hand_r' }, props: 'none', traversal: 'flight', palette: ch.colors };
  ch.animator.play('Idle_Loop');
  ch.dressed();
  return ch;
}
