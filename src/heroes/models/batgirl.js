// Batgirl: an original take, distinct from Batwoman: deep purple with black cowl, gloves and
// boots, yellow belt and bat, short pointed ears, long red hair falling from the cowl, a short
// cape. On the female body.
import * as THREE from 'three';
import { costumeBody, cowl, lenses } from './costume.js';
import { slab, box } from './kit.js';
import { waistProfile } from './shape.js';

export function createBatgirl(assets) {
  const { ch, src, kit, B, lm, fwd } = costumeBody(assets, 'batgirl', { height: 1 });
  kit.slot('hair', { lift: 0.32, rim: 0xffc9a0, rimStrength: 0.4 });
  const c = cowl(src, lm, { color: 0x18161f, frown: 0.7, depthV: 0.03 });
  kit.skinned(c, { outline: 0.005 });
  lenses(kit, c, lm, { angular: true });
  for (const side of [-1, 1]) {
    const pts = [[-0.026, -0.02], [0.022, -0.02], [0.006, 0.1], [-0.016, 0.03]].map(([u, v]) => [u * side, v]);
    kit.rigid(slab(pts, 0.022, 0.003), { bone: 'Head', color: 0x18161f, outline: 0.005, pos: [side * lm.headRadius * 0.55, lm.headTop - 0.03, lm.headCenter.z - 0.01 * fwd], rot: [-0.12 * fwd, fwd < 0 ? Math.PI : 0, -side * 0.1 * fwd] });
  }
  const hc = lm.headCenter;
  assets.hair.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().translate(-hc.x, -hc.y, -hc.z).scale(0.92, 0.92, 0.97).translate(hc.x, hc.y - 0.012, hc.z - 0.012 * fwd);
    kit.rigid(g, { bone: 'Head', slot: 'hair', color: 0xa8281f, outline: 0.006, smooth: false });
  });
  // The long red hair she is known by at a distance: a mane falling from under the back of the
  // cowl to between the shoulder blades (over the cape), in three tapering locks.
  const r = lm.headRadius;
  for (const [dx, len, rad, tilt] of [[0, 0.4, 0.085, 0.22], [-0.055, 0.32, 0.055, 0.3], [0.055, 0.34, 0.055, 0.28]]) {
    const g = new THREE.ConeGeometry(rad, len, 10).rotateX(Math.PI).translate(0, -len / 2, 0).scale(1, 1, 0.5);
    kit.rigid(g, { bone: 'neck_01', slot: 'hair', color: 0xa8281f, outline: 0.005, pos: [dx, hc.y - 0.02, hc.z - r * 0.78 * fwd], rot: [tilt * fwd, 0, dx * 1.5] });
  }
  const hipZ = B('pelvis').z;
  const waist = waistProfile(src, lm.beltY, hipZ);
  for (const a of [0.8, 1.35, 1.9, -0.8, -1.35, -1.9]) {
    const r = waist(Math.sin(a), Math.cos(a)) + 0.01;
    kit.rigid(box(0.042, 0.05, 0.026), { bone: 'pelvis', color: 0xf2d24b, outline: 0.003, pos: [Math.sin(a) * r, lm.beltY - 0.004, hipZ + Math.cos(a) * r], rot: [0, a, 0] });
  }
  kit.build();
  ch.suit = 'batgirl';
  ch.colors = { suit: 0x55357e, cape: 0x221a30 };
  ch.meta = { heightScale: 1, cape: { color: 0x221a30, options: { topWidth: 0.44, bottomWidth: 0.95, length: 0.95, pointDrop: 0.12 } }, hands: { l: 'hand_l', r: 'hand_r' }, props: 'none', traversal: 'glide', palette: ch.colors };
  ch.animator.play('Idle_Loop');
  ch.dressed();
  return ch;
}
