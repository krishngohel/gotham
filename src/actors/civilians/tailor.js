// The tailor: a figure's clothes as garments (drape.js) instead of paint on the body. Every
// garment is a relaxed shell with clean hems and a turned edge, layered by offset (shirt under
// waistcoat under jacket under coat), and the body under it is dropped, so a suit reads as cloth
// over a man rather than a superhero painted dark. Pure bind-pose geometry on the figure context
// (figure.js ctx); every vertex carries a region name the palette colours, so one cut still
// serves any number of colourways and the figure stays one skinned mesh.
//
// Layer offsets (metres off the body; the relaxation adds a little where it fills hollows):
//   shirt 0.004 tucked / tee 0.006 / sweater 0.009  <  trousers 0.006-0.009  <  belt 0.012
//   waistcoat 0.009  <  jacket 0.013  <  lapels 0.021  <  coat 0.016 + skirt
import * as THREE from 'three';
import { box, slab, torus } from '../../heroes/models/kit.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const JACKETS = ['jacket', 'blazer', 'tux', 'tailcoat', 'coat', 'trench', 'labcoat', 'parka', 'hoodie'];

export function tailor(ctx, L, cut) {
  const { lm } = L;
  const fwd = L.fwd;
  const ex = cut.extras ?? [];
  const o = cut.outer ?? null;
  const jacket = JACKETS.includes(o);
  const isFront = (p, n) => n.z * fwd > -0.15 && L.front(p) > -0.01;
  const ax = (p) => Math.abs(p.x);

  // Gloves stay paint on the hands (the hands keep their fingers).
  if (ex.includes('gloves')) ctx.paint((p) => (L.inArm(p) && ax(p) > L.wristX + 0.01 ? 'glove' : null));
  if (ex.includes('tights')) ctx.paint((p) => (!L.inArm(p) && p.y < lm.beltY - 0.02 && p.y > lm.ankleY + 0.04 ? 'bottom' : null));

  // ---------------------------------------------------------------- the top
  const top = cut.top ?? 'tee';
  const sleeves = cut.sleeves ?? (top === 'tee' ? 'short' : 'long');
  const tie = ex.includes('tie') || ex.includes('bowtie');
  if (top !== 'bare') {
    const reach = top === 'tank' ? 0 : top === 'tunic' ? lm.shoulderX + 0.1
      : ({ short: lm.shoulderX + 0.13, long: L.wristX, rolled: L.elbowX + 0.03 }[sleeves] ?? L.wristX);
    const tucked = top === 'shirt' && (jacket || o === 'waistcoat' || o === 'tux' || tie || ['trousers'].includes(cut.bottom));
    const hem = top === 'tunic' ? lm.beltY - 0.2 : tucked ? lm.beltY - 0.07 : lm.beltY - 0.1;
    const high = top === 'turtleneck' ? lm.neckY + 0.06 : top === 'sweater' || top === 'tee' || top === 'tank' ? lm.neckY - 0.025 : lm.neckY + 0.0;
    // A shirt without a tie is worn open at the throat.
    const vTop = top === 'shirt' && !tie ? lm.neckY - 0.075 : top === 'tank' ? lm.neckY - 0.09 : Infinity;
    const vAt = (y) => 0.012 + Math.max(0, y - vTop) * 0.5;
    const neckline = (p, n) => {
      const front = isFront(p, n);
      if (p.y > high + (front ? 0 : 0.012)) return false;
      if (front && p.y > vTop && ax(p) < vAt(p.y)) return false;
      return true;
    };
    const armhole = (p) => top === 'tank' && L.inArm(p);
    const full = (p, n) => {
      if (L.isHead(p) && p.y > high + 0.015) return false;
      if (L.inArm(p)) return !armhole(p) && ax(p) < reach;
      return p.y > hem && neckline(p, n);
    };
    // Under a jacket only the throat, the shirt front in the V and the cuffs show: the rest of
    // the shirt would be hidden cloth (triangles for nothing). The body under it is still dropped.
    const jv = jacketV(L, o);
    const pick = jacket
      ? (p, n) => full(p, n) && (L.inArm(p) ? ax(p) > L.wristX - 0.08 : (isFront(p, n) && ax(p) < jv.at(p.y) + 0.03 && p.y > jv.bottom - 0.04) || p.y > lm.neckY - 0.035)
      : full;
    const off = top === 'sweater' || top === 'turtleneck' ? 0.009 : tucked ? 0.0045 : 0.006;
    ctx.garment({
      pick, offset: off, smooth: 10,
      edge: [(p) => reach - ax(p), (p) => p.y - hem, (p) => high - p.y, (p) => (p.y > vTop ? ax(p) - vAt(p.y) : 1)],
      // Under a jacket the cuff must sit inside the jacket's sleeve (its tube is k 0.86).
      tubes: sleeves === 'long' && reach > L.elbowX ? [{ bone: 'lowerarm_l', from: 0.2, k: jacket ? 0.78 : 0.9, taper: 0.9 }, { bone: 'lowerarm_r', from: 0.2, k: jacket ? 0.78 : 0.9, taper: 0.9 }] : null,
    }, 'top', 0.004);
    if (pick !== full) ctx.hide(full);
    // A shirt collar: a band standing round the neck, its points turned down at the front.
    if (top === 'shirt') {
      const cTop = lm.neckY + (tie ? 0.03 : 0.022), cBot = lm.neckY - 0.03;
      ctx.garment({
        pick: (p, n) => ax(p) < 0.08 && n.y < 0.55 && p.y > cBot && p.y < cTop + 0.01 && !(isFront(p, n) && ax(p) < (tie ? 0.008 : 0.022) + Math.max(0, p.y - cBot) * (tie ? 0.25 : 0.6)) && !(L.headFront(p) > 0.2 && p.y > lm.neckY + 0.01),
        offset: (p) => 0.009 + 0.005 * clamp01((p.y - cBot) / 0.05), minOffset: 0.008, smooth: 3,
        edge: [(p) => cTop - p.y],
      }, 'top', 0.003, { hide: false });
      for (const side of [-1, 1]) {
        // Collar points lying flat on the shirt front either side of the knot.
        ctx.rigid(slab([[0.004, 0.004], [0.03, 0.0], [0.012, -0.03]].map(([u, v]) => [u * side, v]), 0.003, 0), {
          bone: 'spine_03', pos: [side * 0.004, lm.neckY - 0.03, L.chestFront(lm.neckY - 0.045) + 0.013 * fwd], rot: [-0.12 * fwd, fwd < 0 ? Math.PI : 0, 0], outline: 0.0015,
        }, 'top');
      }
    }
  }

  // ---------------------------------------------------------------- the bottom
  const b = cut.bottom ?? 'trousers';
  const waist = lm.beltY - 0.01;
  const shoeTop = cut.shoes === 'boots' ? lm.kneeY - 0.1 : lm.ankleY + 0.05;
  const hemY = b === 'shorts' ? lm.kneeY + 0.07 : cut.shoes === 'boots' && b !== 'trousers' ? shoeTop + 0.02 : lm.ankleY + 0.045;
  if (b === 'trousers' || b === 'jeans' || b === 'shorts') {
    ctx.garment({
      pick: (p) => !L.inArm(p) && p.y < waist && p.y > hemY,
      offset: (p) => 0.006 + 0.003 * clamp01((p.y - (lm.beltY - 0.12)) / 0.1), smooth: 12,
      edge: [(p) => waist - p.y, (p) => p.y - hemY],
      tubes: b === 'shorts'
        ? [{ bone: 'thigh_l', from: 0.35, k: 1.06 }, { bone: 'thigh_r', from: 0.35, k: 1.06 }]
        : [{ bone: 'thigh_l', from: 0.62, k: 1.0 }, { bone: 'thigh_r', from: 0.62, k: 1.0 }, { bone: 'calf_l', from: 0.02, k: 1.0, taper: b === 'jeans' ? 0.9 : 0.94 }, { bone: 'calf_r', from: 0.02, k: 1.0, taper: b === 'jeans' ? 0.9 : 0.94 }],
    }, 'bottom', 0.005);
  } else if (b === 'skirt' || b === 'longskirt') {
    // The hips under the skirt (a fitted waistband), then the skirt's hanging tube.
    ctx.garment({ pick: (p) => !L.inArm(p) && p.y < waist && p.y > L.hipY - 0.05, offset: 0.006, smooth: 8, edge: [(p) => waist - p.y] }, 'bottom', 0.004);
    const bottom = b === 'skirt' ? lm.kneeY + 0.06 : lm.ankleY + 0.12;
    ctx.skirt({ top: lm.beltY - 0.02, bottom, rTop: lm.hipHalfWidth * 0.62, rBottom: b === 'skirt' ? 0.21 : 0.26, depth: 0.78, zShift: 0, segs: 22, rows: 6 }, 'bottom', 0.005);
  }
  if (ex.includes('belt') || ((b === 'trousers' || b === 'jeans') && !['tunic'].includes(top) && !(top === 'tee' || top === 'sweater'))) {
    const by = waist - 0.018;
    ctx.garment({ pick: (p) => !L.inArm(p) && Math.abs(p.y - by) < 0.017 && ax(p) < 0.3, offset: 0.0115, minOffset: 0.0105, smooth: 3, edge: [(p) => by + 0.016 - p.y, (p) => p.y - (by - 0.016)] }, 'belt', 0.003, { hide: false });
    ctx.rigid(box(0.042, 0.03, 0.008), { bone: 'pelvis', pos: [0, by, L.waistFront(by) + 0.016 * fwd], outline: 0.002 }, 'metal');
  }
  // Shoes: the feet lose their toes under a smooth shoe; boots run up the shin straight.
  const sole = cut.shoes === 'sneakers' ? 'white' : 'ink';
  ctx.garment({
    pick: (p) => !L.inArm(p) && p.y < shoeTop + 0.005,
    offset: (p) => (p.y < 0.03 ? 0.009 : 0.007), smooth: 8,
    edge: [(p) => shoeTop - p.y],
    tubes: cut.shoes === 'boots' ? [{ bone: 'calf_l', from: 0.25, k: 1.02 }, { bone: 'calf_r', from: 0.25, k: 1.02 }] : null,
  }, (p, n, lip) => (!lip && p.y < 0.016 ? sole : 'shoes'), 0.004);

  // ---------------------------------------------------------------- outer layers
  if (jacket) jacketGarment(ctx, L, cut, o);
  if (o === 'waistcoat' || o === 'tux' || o === 'tailcoat') waistcoat(ctx, L, o);
  if (o === 'hivis' || o === 'tactical') {
    const off = o === 'tactical' ? 0.02 : 0.013;
    ctx.garment({ pick: (p, n) => !L.inArm(p) && !L.isHead(p) && p.y > lm.beltY - 0.07 && p.y < lm.neckY - 0.01 && !(isFront(p, n) && p.y > lm.chestY + 0.02 && ax(p) < 0.05), offset: off, smooth: 10, edge: [(p) => p.y - (lm.beltY - 0.07)] },
      (p) => (o === 'hivis' && (Math.abs(p.y - (lm.chestY - 0.02)) < 0.018 || Math.abs(p.y - (lm.beltY + 0.03)) < 0.018) ? 'stripe' : 'vest'), 0.005, { hide: false });
    if (o === 'tactical') for (const dx of [-0.07, 0, 0.07]) ctx.rigid(box(0.055, 0.07, 0.03), { bone: 'spine_02', pos: [dx, lm.beltY + 0.06, L.hipZ + 0.16 * fwd], outline: 0.003 }, 'vest');
  }
  if (o === 'apron') {
    ctx.skirt({ top: lm.beltY - 0.01, bottom: lm.kneeY - 0.04, rTop: lm.hipHalfWidth * 0.68, rBottom: lm.hipHalfWidth * 0.78, depth: 0.8, from: -1.05, to: 1.05, segs: 10, rows: 5 }, 'white', 0.004);
    ctx.garment({ pick: (p, n) => !L.inArm(p) && n.z * fwd > 0.2 && p.y > lm.beltY - 0.02 && p.y < lm.chestY + 0.02 && ax(p) < 0.12, offset: 0.012, smooth: 6 }, 'white', 0.004, { hide: false });
  }
  if (o === 'gown') {
    ctx.skirt({ top: lm.beltY - 0.01, bottom: 0.02, rTop: lm.hipHalfWidth * 0.62, rBottom: 0.34, depth: 0.8, segs: 24, rows: 7 }, 'outer', 0.005);
    ctx.garment({ pick: (p) => !L.inArm(p) && !L.isHead(p) && p.y > lm.beltY - 0.05 && p.y < lm.chestY + 0.03, offset: 0.007, smooth: 8, edge: [(p) => lm.chestY + 0.03 - p.y] }, 'outer', 0.004);
  }
}

// The opening of a jacket's front: the V from the collar down to the top button.
function jacketV(L, o) {
  const { lm } = L;
  const bottom = o === 'tux' || o === 'tailcoat' ? lm.chestY - 0.17 : o === 'blazer' ? lm.chestY - 0.15 : o === 'hoodie' || o === 'parka' ? lm.beltY + 0.0 : lm.chestY - 0.12;
  const w0 = o === 'hoodie' || o === 'parka' ? 0.012 : 0.008;
  const slope = o === 'hoodie' || o === 'parka' ? 0.02 : 0.15;
  return { bottom, at: (y) => w0 + Math.max(0, y - bottom) * slope };
}

function jacketGarment(ctx, L, cut, o) {
  const { lm } = L;
  const fwd = L.fwd;
  const ax = (p) => Math.abs(p.x);
  const isFront = (p, n) => n.z * fwd > -0.15 && L.front(p) > -0.01;
  const long = o === 'coat' || o === 'trench' || o === 'labcoat' || o === 'parka';
  const hem = o === 'tailcoat' ? lm.beltY + 0.02 : long ? lm.beltY - 0.07 : o === 'hoodie' ? lm.beltY - 0.1 : lm.beltY - 0.12;
  const sleeveEnd = L.wristX - (o === 'hoodie' || o === 'parka' ? 0.0 : 0.028);
  const V = jacketV(L, o);
  const collarBack = lm.neckY + (long ? 0.05 : 0.03);
  const open = (p, n) => isFront(p, n) && (p.y > V.bottom ? ax(p) < V.at(p.y) : (o === 'tailcoat' ? ax(p) < 0.006 + (V.bottom - p.y) * 2 : o !== 'hoodie' && o !== 'parka' && p.y < hem + 0.05 && ax(p) < 0.6 * (hem + 0.05 - p.y)));
  const pick = (p, n) => {
    if (L.inArm(p)) return ax(p) < sleeveEnd;
    if (L.isHead(p) && p.y > collarBack) return false;
    if (p.y < hem || p.y > (isFront(p, n) ? lm.neckY + 0.01 : collarBack)) return false;
    return !open(p, n);
  };
  const base = long ? 0.016 : o === 'hoodie' ? 0.016 : 0.013;
  const shoulder = (p, n, d) => {
    // Shoulder pads: a squared line from the collar to the sleeve head.
    const s = clamp01(1 - Math.abs(ax(p) - (lm.shoulderX + 0.02)) / 0.09) * clamp01(n.y * 2);
    d.y += 0.007 * s;
    d.x += 0.004 * s * Math.sign(p.x);
  };
  ctx.garment({
    pick, offset: (p) => base + 0.003 * clamp01((p.y - lm.chestY + 0.05) / 0.12), smooth: 16, push: o === 'hoodie' || o === 'labcoat' ? null : shoulder,
    edge: [(p) => p.y - hem, (p) => sleeveEnd - ax(p), (p) => (p.y > V.bottom ? ax(p) - V.at(p.y) : 1)],
    tubes: [{ bone: 'lowerarm_l', from: 0.2, k: 0.86, taper: 0.84 }, { bone: 'lowerarm_r', from: 0.2, k: 0.86, taper: 0.84 }],
  }, o === 'trench' ? 'outer' : 'outer', 0.006);
  // Lapels: a raised band along each side of the V, widest at the chest, satin on a dinner jacket.
  if (['blazer', 'tux', 'tailcoat', 'jacket', 'coat', 'trench'].includes(o)) {
    const lapel = o === 'tux' || o === 'tailcoat' ? 'outer2' : 'outer';
    const top = lm.neckY - 0.005;
    const width = (y) => 0.012 + 0.04 * clamp01((y - V.bottom) / 0.12) - 0.018 * clamp01((y - (top - 0.06)) / 0.06);
    ctx.garment({
      pick: (p, n) => isFront(p, n) && !L.inArm(p) && p.y > V.bottom - 0.01 && p.y < top && ax(p) > V.at(p.y) - 0.004 && ax(p) < V.at(p.y) + width(p.y),
      offset: base + 0.009, minOffset: base + 0.007, smooth: 6,
      edge: [(p) => ax(p) - V.at(p.y) + 0.004, (p) => V.at(p.y) + width(p.y) - ax(p)],
    }, lapel, 0.004, { hide: false });
  }
  if (long) {
    const bottom = o === 'trench' || o === 'coat' ? lm.kneeY - 0.1 : lm.kneeY + 0.02;
    ctx.skirt({ top: lm.beltY - 0.05, bottom, rTop: lm.hipHalfWidth * 0.68, rBottom: lm.hipHalfWidth * 0.98, depth: 0.82, open: 0.2, segs: 24, rows: 7 }, 'outer', 0.005);
  }
  if (o === 'tailcoat') {
    // Two tails behind, split at the centre seam, from the waist to the back of the knee.
    for (const [a, b] of [[Math.PI * 0.6, Math.PI * 0.985], [Math.PI * 1.015, Math.PI * 1.4]]) {
      ctx.skirt({ top: lm.beltY + 0.03, bottom: lm.kneeY + 0.02, rTop: lm.hipHalfWidth * 0.66, rBottom: lm.hipHalfWidth * 0.78, depth: 0.84, from: a, to: b, segs: 8, rows: 6 }, 'outer', 0.004);
    }
  }
  if (o === 'trench' || o === 'coat' || o === 'parka') {
    // A turned-up collar standing round the back of the neck.
    const neck = ctx.bp('neck_01');
    ctx.rigid(new THREE.CylinderGeometry(0.098, 0.088, 0.075, 14, 1, true, Math.PI * 0.35, Math.PI * 1.3), { bone: 'spine_03', pos: [0, neck.y + 0.005, neck.z - 0.008 * fwd], rot: [0, fwd < 0 ? Math.PI : 0, 0], outline: 0.004 }, 'outer');
    ctx.rigid(new THREE.CylinderGeometry(0.096, 0.086, 0.075, 14, 1, true, Math.PI * 0.35, Math.PI * 1.3), { bone: 'spine_03', pos: [0, neck.y + 0.005, neck.z - 0.008 * fwd], rot: [0, fwd < 0 ? Math.PI : 0, 0], scale: [-1, 1, 1], outline: 0 }, 'outer2');
  }
  if (o === 'trench') {
    // The trench's belt, buttoned double-breast and epaulettes.
    ctx.garment({ pick: (p) => !L.inArm(p) && Math.abs(p.y - (lm.beltY + 0.01)) < 0.022 && ax(p) < 0.28, offset: 0.024, minOffset: 0.022, smooth: 3 }, 'outer2', 0.004, { hide: false });
    for (const side of [-1, 1]) for (const dy of [0.05, 0.13]) {
      ctx.rigid(new THREE.CylinderGeometry(0.008, 0.008, 0.005, 8).rotateX(Math.PI / 2), { bone: 'spine_03', pos: [side * 0.055, lm.beltY + dy + 0.12, L.chestFront(lm.beltY + dy + 0.12) + 0.03 * fwd], outline: 0 }, 'ink');
    }
    for (const side of [-1, 1]) ctx.rigid(box(0.09, 0.008, 0.035), { bone: side * Math.sign(ctx.bp('clavicle_l').x) > 0 ? 'clavicle_l' : 'clavicle_r', pos: [side * (lm.shoulderX + 0.02), ctx.bp('upperarm_l').y + 0.075, ctx.bp('upperarm_l').z], outline: 0.002 }, 'outer2');
  }
  if (o === 'hoodie') {
    const neck = ctx.bp('neck_01');
    ctx.rigid(torus(0.08, 0.035, 6, 14, Math.PI * 1.2), { bone: 'spine_03', pos: [0, neck.y - 0.005, neck.z - 0.02 * fwd], rot: [Math.PI / 2, 0, Math.PI * 0.9], scale: [1, 1.15, 0.7] }, 'outer');
  }
  // Buttons down the closed front (jackets) - a dark dot reads as a button at 8 m.
  if (['blazer', 'tux', 'jacket', 'coat'].includes(o)) {
    const ys = o === 'coat' ? [V.bottom - 0.02, V.bottom - 0.12, V.bottom - 0.22] : [V.bottom - 0.03, V.bottom - 0.1];
    for (const y of ys) if (y > hem + 0.02) ctx.rigid(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 8).rotateX(Math.PI / 2), { bone: 'spine_01', pos: [0, y, L.chestFront(y) + (base + 0.006) * fwd], outline: 0 }, 'ink');
  }
}

function waistcoat(ctx, L, o) {
  const { lm } = L;
  const fwd = L.fwd;
  const ax = (p) => Math.abs(p.x);
  const isFront = (p, n) => n.z * fwd > -0.15 && L.front(p) > -0.01;
  // Pointed front hem, a deep V; a dinner waistcoat is lower cut.
  const vBottom = o === 'waistcoat' ? lm.chestY - 0.08 : lm.chestY - 0.14;
  const hemAt = (p, n) => lm.beltY - 0.055 - (isFront(p, n) ? 0.03 * clamp01(1 - ax(p) / 0.09) : 0);
  ctx.garment({
    pick: (p, n) => !L.inArm(p) && !L.isHead(p) && p.y > hemAt(p, n) && p.y < lm.neckY - 0.02 && !(isFront(p, n) && p.y > vBottom && ax(p) < 0.01 + (p.y - vBottom) * 0.42)
      && !(Math.abs(p.x) > lm.shoulderX - 0.05 && p.y > lm.chestY - 0.06),
    offset: 0.0085, minOffset: 0.0075, smooth: 10,
    edge: [(p) => p.y - (lm.beltY - 0.055), (p) => (p.y > vBottom ? ax(p) - (0.01 + (p.y - vBottom) * 0.42) : 1)],
  }, 'vest', 0.004, { hide: false });
  for (let k = 0; k < 4; k++) {
    const y = vBottom - 0.02 - k * 0.042;
    if (y < lm.beltY - 0.04) break;
    ctx.rigid(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 8).rotateX(Math.PI / 2), { bone: 'spine_01', pos: [0, y, L.chestFront(y) + 0.015 * fwd], outline: 0 }, 'metal');
  }
}
