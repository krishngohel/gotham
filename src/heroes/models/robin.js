// Robin, three ways (original takes on the bright classic, the armoured modern and the staff
// fighter), on a teenager's build (TEEN, root height 0.9). Alternate suits from suits.js
// ('robin-winter', 'robin-shadow') swap the classic's colours.
//   createRobin(assets, { variant: 'classic' | 'modern' | 'staff', suit })
import { costumeBody, domino, lenses, hairLocks, collar, TEEN } from './costume.js';
import { COSTUMES } from './costumes.js';
import { suitById } from './suits.js';
import { shell, skirt, box, torus } from './kit.js';
import { waistProfile } from './shape.js';
import { createProp, attachProp } from './props.js';

const ID = { classic: 'robin', modern: 'robinModern', staff: 'robinStaff' };
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function createRobin(assets, { variant = 'classic', suit = 'robin' } = {}) {
  const id = ID[variant] ?? 'robin';
  const C = COSTUMES[id].colors;
  const s = suitById(suit);
  const pal = s.hero === 'robin' && variant === 'classic' ? (s.look.palette ?? {}) : {};
  const swaps = [];
  if (pal.tunic) swaps.push([C.tunic, pal.tunic]);
  if (pal.sleeves) swaps.push([C.sleeves, pal.sleeves]);
  if (pal.trunks) swaps.push([C.trunks, pal.trunks]);
  if (pal.legs && pal.legs !== pal.trunks) swaps.push([C.legs, pal.legs]);
  if (pal.lining) swaps.push([C.belt, pal.lining]);
  const { ch, src, kit, B, lm, fwd } = costumeBody(assets, id, { build: TEEN, height: 0.9, swaps });
  const hipZ = B('pelvis').z;
  const capeColor = pal.cape ?? (variant === 'classic' ? 0xd9a92c : variant === 'modern' ? 0x1c1d24 : 0x16171d);

  const mask = domino(src, lm);
  kit.skinned(mask, { outline: 0.003 });
  lenses(kit, mask, lm, { w: 0.015, h: 0.008 });
  if (variant === 'modern') {
    // The hood, up: lifted off the head and shoulders, the face left open.
    kit.skinned(shell(src, {
      pick: (p) => p.y > lm.neckY - 0.03 && Math.abs(p.x) < 0.17 && !(((p.z - lm.headCenter.z) * fwd) > lm.headRadius * 0.3 && Math.abs(p.x) < 0.07 && p.y < lm.eyeY + 0.04 && p.y > lm.eyeY - 0.14),
      offset: (p) => 0.016 + 0.012 * clamp01((p.y - lm.eyeY) / 0.1), color: capeColor, uv: false,
    }), { outline: 0.005 });
    // Armour: shoulder caps and shin guards.
    kit.skinned(shell(src, { pick: (p, n) => Math.abs(p.x) > lm.shoulderX - 0.03 && Math.abs(p.x) < lm.shoulderX + 0.1 && p.y > B('upperarm_l').y - 0.02 && n.y > -0.2, offset: 0.012, color: 0x2a2b33 }), { outline: 0.005 });
    kit.skinned(shell(src, { pick: (p, n) => p.y < lm.kneeY + 0.04 && p.y > lm.ankleY + 0.08 && n.z * fwd > 0.25, offset: 0.01, color: 0x2a2b33 }), { outline: 0.004 });
  } else {
    hairLocks(kit, src, lm, { color: variant === 'staff' ? 0x1d1410 : 0x111118, volume: 0.022, locks: 10 });
    collar(kit, B, lm, variant === 'staff' ? 0x16171d : capeColor, { r: 0.09, h: 0.07 });
  }
  if (pal && suit === 'robin-winter') {
    // A scarf for the winter suit.
    kit.skinned(shell(src, { pick: (p) => Math.abs(p.y - (lm.neckY - 0.01)) < 0.035 && Math.abs(p.x) < 0.12, offset: 0.02, color: s.look.scarf, uv: false }), { outline: 0.004 });
  }

  // Belt pouches.
  const waist = waistProfile(src, lm.beltY - 0.01, hipZ);
  for (const a of [0.9, 1.5, -0.9, -1.5]) {
    const r = waist(Math.sin(a), Math.cos(a)) + 0.01;
    kit.rigid(box(0.04, 0.045, 0.026), { bone: 'pelvis', color: pal.lining ?? 0xd9a92c, outline: 0.003, pos: [Math.sin(a) * r, lm.beltY - 0.012, hipZ + Math.cos(a) * r], rot: [0, a, 0] });
  }
  if (variant === 'staff') {
    // The staff's holder on the back: a diagonal harness strap from shoulder to hip with two
    // clamp rings the folded staff locks into.
    const back = B('spine_03').z - 0.12 * fwd, a = 0.65, cy = lm.chestY - 0.05;
    kit.rigid(box(0.045, 0.62, 0.016), { bone: 'spine_03', color: 0x1a1a20, outline: 0.003, pos: [0, cy, back], rot: [0, 0, a] });
    for (const t of [-0.2, 0.2]) {
      kit.rigid(torus(0.026, 0.008, 5, 12), { bone: 'spine_03', color: 0xd9a92c, outline: 0.002, pos: [-Math.sin(a) * t, cy + Math.cos(a) * t, back - 0.012 * fwd], rot: [Math.PI / 2, 0, a] });
    }
    // Tunic flaps front and back, to mid-thigh.
    for (const [from, to] of [[-0.85, 0.85], [Math.PI - 0.85, Math.PI + 0.85]]) {
      kit.skinned(skirt(ch.body, lm, { top: lm.beltY - 0.015, bottom: lm.kneeY + 0.12, rTop: lm.hipHalfWidth * 0.6, rBottom: lm.hipHalfWidth * 0.72, depth: 0.8, from, to, segs: 8, rows: 4, color: C.tunic }), { outline: 0.004 });
    }
  }
  kit.build();
  let prop = 'none';
  if (variant === 'staff') { ch.staff = attachProp(ch, createProp('staff'), 'r'); prop = 'staff'; }
  ch.suit = s.hero === 'robin' ? s.id : 'robin';
  ch.variant = variant;
  ch.colors = { ...C, cape: capeColor };
  ch.meta = {
    heightScale: 0.9,
    cape: { color: capeColor, options: variant === 'modern' ? { topWidth: 0.42, bottomWidth: 0.8, length: 0.82, pointDrop: 0.06 } : { topWidth: 0.4, bottomWidth: 0.78, length: 0.7, pointDrop: 0.04 } },
    hands: { l: 'hand_l', r: 'hand_r' }, props: prop, traversal: 'acrobat', palette: ch.colors,
  };
  ch.animator.play('Idle_Loop');
  ch.dressed();
  return ch;
}
