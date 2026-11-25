// The wardrobe: a figure's cut of clothes, hair, hat and extras as data, turned into body paint,
// shells, skirts and rigid parts on a figure context (figure.js). Every piece paints by region
// name; the palette decides the colours, so one cut serves any number of colourways.
//
//   cut = {
//     top:    'tee' | 'shirt' | 'tank' | 'sweater' | 'turtleneck' | 'tunic' | 'bare' | null
//     sleeves:'short' | 'long' | 'rolled'                    (tee/shirt/sweater)
//     outer:  null | 'jacket' | 'blazer' | 'coat' | 'trench' | 'tailcoat' | 'waistcoat' | 'hivis'
//             | 'tactical' | 'apron' | 'labcoat' | 'hoodie' | 'tux' | 'gown'
//     bottom: 'trousers' | 'jeans' | 'shorts' | 'skirt' | 'longskirt'
//     shoes:  'shoes' | 'boots' | 'sneakers'
//     hair:   'short' | 'buzz' | 'bald' | 'thinning' | 'swept' | 'long' | 'bob' | 'bun' | 'ponytail'
//             | 'curly' | 'afro' | 'mohawk' | 'slick'
//     hat:    null | 'cap' | 'beanie' | 'police' | 'swat' | 'fire' | 'chef' | 'fedora' | 'bowler'
//             | 'tophat' | 'hardhat' | 'hood' | 'beret'
//     extras: ['glasses', 'monocle', 'moustache', 'beard', 'stubble', 'tie', 'bowtie', 'badge',
//              'bag', 'camera', 'lanyard', 'gloves', 'scarf', 'belt', 'stethoscope', 'radio',
//              'holster', 'kneepads', 'pocketsquare', 'headset', 'armband', 'backpack', ...]
//   }
//
// Regions a palette may colour: skin, hair, brow, eyeWhite, iris, top, outer, outer2 (lapels,
// lining), vest, bottom, shoes, belt, hat, hat2, accent (tie, scarf), metal (badges, buckles),
// white, ink, stripe (reflective bands), glove, bag, lens.
import * as THREE from 'three';
import { slab, box, cyl, sphere, torus } from '../../heroes/models/kit.js';
import { frontHeightField } from '../../heroes/models/shape.js';
import { tailor } from './tailor.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Shape key: everything about a cut that changes geometry (colours never do).
export const cutKey = (body, build, cut) => [body, build, cut.top, cut.sleeves, cut.outer, cut.bottom, cut.shoes, cut.hair, cut.hat, ...(cut.extras ?? []).slice().sort()].join('|');

// dress(ctx) for a cut: the function the figure template is built from.
export function dresser(cut, assets) {
  return (ctx) => {
    const L = landmarks(ctx);
    tailor(ctx, L, cut);
    hair(ctx, L, cut, assets);
    hat(ctx, L, cut);
    for (const e of cut.extras ?? []) extra(ctx, L, e, cut);
    ctx.meta = { ...(ctx.meta ?? {}), cut };
  };
}

function landmarks(ctx) {
  const { lm, bp } = ctx;
  const hand = bp('hand_l'), elbow = bp('lowerarm_l'), arm = bp('upperarm_l'), thigh = bp('thigh_l'), pelvis = bp('pelvis');
  // The front of the (reshaped) torso along the centre line, for buttons, buckles, collar points.
  const hf = frontHeightField(ctx.src, lm, (lm.neckY + lm.beltY) / 2 - 0.02, lm.fwd);
  return {
    chestFront: (y) => hf(0, y), waistFront: (y) => hf(0, y), neckFrontZ: hf(0, lm.neckY - 0.015),
    lm, fwd: lm.fwd,
    wristX: Math.abs(hand.x) - 0.03, elbowX: Math.abs(elbow.x), armY: arm.y, armZ: arm.z,
    hipY: thigh.y, hipZ: pelvis.z, thighX: Math.abs(thigh.x),
    inArm: (p) => Math.abs(p.x) > lm.shoulderX - 0.02 && p.y > lm.chestY - 0.12,
    isHead: (p) => p.y > lm.neckY + 0.005 && Math.abs(p.x) < 0.16,
    front: (p) => (p.z - pelvis.z) * lm.fwd,
    headFront: (p) => (p.z - lm.headCenter.z) * lm.fwd / lm.headRadius,
  };
}

// ---------------------------------------------------------------- hair and hats

function hairline(L, p, top = 0.05, side = 0.018, napeAdd = 0.07) {
  const { lm } = L;
  const f = L.headFront(p);
  const t = lm.eyeY + top, s = lm.eyeY + side, nape = lm.neckY + napeAdd;
  if (f > 0.35) return t;
  if (f > -0.25) return s + (t - s) * clamp01((f + 0.25) / 0.6);
  return nape + (s - nape) * clamp01((f + 0.9) / 0.65);
}

function hair(ctx, L, cut, assets) {
  const { lm } = L;
  const h = cut.hair ?? 'short';
  if (h === 'bald' || cut.hat === 'hood' || cut.hat === 'swat') return;
  const hc = lm.headCenter, r = lm.headRadius, fwd = L.fwd;
  const scalp = (opts) => ctx.layer({ pick: (p) => p.y > lm.neckY + 0.02 && Math.abs(p.x) < 0.14 && p.y > hairline(L, p, opts.top, opts.side, opts.nape) && (!opts.crown || p.y < lm.eyeY + opts.crown), offset: opts.offset, push: opts.push }, 'hair', 0.004);
  if (h === 'thinning') {
    // A fringe of hair round the back and sides; the crown bald.
    scalp({ top: 0.2, side: 0.012, nape: 0.05, crown: 0.075, offset: 0.006 });
    return;
  }
  if (h === 'buzz') { scalp({ top: 0.05, side: 0.02, nape: 0.06, offset: 0.0035 }); return; }
  const volume = { short: 0.012, swept: 0.016, slick: 0.007, curly: 0.02, afro: 0.03, long: 0.01, bob: 0.014, bun: 0.01, ponytail: 0.009, mohawk: 0.003 }[h] ?? 0.012;
  scalp({ top: h === 'slick' ? 0.06 : 0.048, side: 0.018, nape: h === 'long' || h === 'bob' ? 0.0 : 0.07, offset: (p) => 0.005 + volume * clamp01((p.y - lm.eyeY) / 0.1),
    push: h === 'swept' || h === 'slick' ? (p, n, d) => { d.z -= 0.006 * fwd * clamp01((p.y - lm.eyeY) / 0.1); } : null });
  const head = (dx, dy, dz) => [hc.x + dx, hc.y + dy, hc.z + dz * fwd];
  if (h === 'curly' || h === 'afro') {
    const n = h === 'afro' ? 16 : 11, R = h === 'afro' ? 0.05 : 0.032;
    for (let k = 0; k < n; k++) {
      const a = k * 2.399, el = 0.35 + (k / n) * 0.9;
      ctx.rigid(sphere(R, 8, 6), { bone: 'Head', pos: head(Math.sin(a) * Math.cos(el) * r * 1.05, 0.015 + Math.sin(el) * r * 0.95, Math.cos(a) * Math.cos(el) * r * 0.95 - 0.01), outline: 0.003 }, 'hair');
    }
  }
  if (h === 'bun') ctx.rigid(sphere(0.045, 10, 8), { bone: 'Head', pos: head(0, 0.07, -0.085), outline: 0.004 }, 'hair');
  if (h === 'ponytail') {
    ctx.rigid(sphere(0.03, 8, 6), { bone: 'Head', pos: head(0, 0.035, -0.105), outline: 0.003 }, 'hair');
    ctx.rigid(new THREE.ConeGeometry(0.035, 0.22, 8).translate(0, -0.11, 0), { bone: 'Head', pos: head(0, 0.03, -0.115), rot: [0.35 * fwd, 0, 0], outline: 0.004 }, 'hair');
  }
  if (h === 'bob') {
    for (const side of [-1, 1]) ctx.rigid(sphere(0.07, 10, 8), { bone: 'Head', pos: head(side * 0.06, -0.035, -0.02), scale: [0.55, 1.15, 0.95], outline: 0.004 }, 'hair');
    ctx.rigid(sphere(0.085, 10, 8), { bone: 'Head', pos: head(0, -0.03, -0.055), scale: [1.05, 1.0, 0.6], outline: 0.004 }, 'hair');
  }
  if (h === 'long' && assets?.hair) {
    assets.hair.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().translate(-hc.x, -hc.y, -hc.z).scale(0.98, 0.98, 1.0).translate(hc.x, hc.y, hc.z);
      g.deleteAttribute('uv');
      ctx.rigid(g, { bone: 'Head', outline: 0.005, smooth: false }, 'hair');
    });
  }
  if (h === 'mohawk') {
    for (let k = 0; k < 7; k++) {
      const a = -0.5 + k * 0.42;
      ctx.rigid(new THREE.ConeGeometry(0.018, 0.09, 4).translate(0, 0.045, 0), { bone: 'Head', pos: head(0, Math.cos(a) * r * 0.98 + 0.01, Math.sin(a) * r * 0.98), rot: [a * fwd, 0, 0], outline: 0.003 }, 'hair');
    }
  }
}

function hat(ctx, L, cut) {
  const { lm } = L;
  const k = cut.hat;
  if (!k) return;
  const hc = lm.headCenter, r = lm.headRadius, fwd = L.fwd;
  const head = (dx, dy, dz) => [hc.x + dx, hc.y + dy, hc.z + dz * fwd];
  const yaw = fwd < 0 ? Math.PI : 0;
  const crown = (R, theta) => sphere(R, 16, 8, 0, Math.PI * 2, 0, theta);
  switch (k) {
    case 'cap':
      ctx.rigid(crown(r * 1.1, Math.PI * 0.5), { bone: 'Head', pos: head(0, 0.02, -0.005), outline: 0.004 }, 'hat');
      ctx.rigid(cyl(0.075, 0.075, 0.008, 14, false).scale(1, 1, 0.8), { bone: 'Head', pos: head(0, 0.03, r * 0.95), rot: [0.18 * fwd, 0, 0], outline: 0.003 }, 'hat2');
      break;
    case 'beanie':
      ctx.rigid(crown(r * 1.12, Math.PI * 0.52), { bone: 'Head', pos: head(0, 0.025, -0.01), scale: [1, 1.08, 1], outline: 0.004 }, 'hat');
      ctx.rigid(cyl(r * 1.14, r * 1.16, 0.035, 16, true), { bone: 'Head', pos: head(0, 0.028, -0.01), outline: 0.003 }, 'hat2');
      break;
    case 'police':
    case 'chauffeur':
      ctx.rigid(cyl(r * 1.22, r * 1.08, 0.07, 16), { bone: 'Head', pos: head(0, 0.085, -0.005), rot: [-0.08 * fwd, 0, 0], outline: 0.004 }, 'hat');
      ctx.rigid(cyl(r * 1.1, r * 1.1, 0.025, 16, true), { bone: 'Head', pos: head(0, 0.045, -0.005), outline: 0.003 }, 'hat2');
      ctx.rigid(cyl(0.07, 0.07, 0.006, 14).scale(1, 1, 0.75), { bone: 'Head', pos: head(0, 0.042, r * 0.95), rot: [0.25 * fwd, 0, 0], outline: 0.003 }, 'ink');
      if (k === 'police') ctx.rigid(slab([[0, 0.016], [0.013, 0], [0, -0.016], [-0.013, 0]], 0.006), { bone: 'Head', pos: head(0, 0.085, r * 1.15), rot: [-0.08 * fwd, yaw, 0], outline: 0 }, 'metal');
      break;
    case 'swat':
      ctx.rigid(crown(r * 1.2, Math.PI * 0.56), { bone: 'Head', pos: head(0, 0.02, -0.01), outline: 0.005 }, 'hat');
      ctx.rigid(sphere(r * 1.16, 16, 6, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.42, Math.PI * 0.16), { bone: 'Head', pos: head(0, 0.0, 0.004), rot: [0, yaw, 0], outline: 0.003 }, 'lens');
      break;
    case 'fire':
      ctx.rigid(crown(r * 1.18, Math.PI * 0.5), { bone: 'Head', pos: head(0, 0.03, -0.01), scale: [1, 1.1, 1.08], outline: 0.005 }, 'hat');
      ctx.rigid(cyl(r * 1.7, r * 1.7, 0.012, 18).scale(1, 1, 1.25).translate(0, 0, -0.02), { bone: 'Head', pos: head(0, 0.03, -0.02), rot: [-0.12 * fwd, 0, 0], outline: 0.004 }, 'hat');
      ctx.rigid(slab([[-0.035, -0.03], [0.035, -0.03], [0.03, 0.04], [-0.03, 0.04]], 0.008, 0.003), { bone: 'Head', pos: head(0, 0.085, r * 1.12), rot: [-0.35 * fwd, yaw, 0], outline: 0.003 }, 'accent');
      break;
    case 'hardhat':
      ctx.rigid(crown(r * 1.16, Math.PI * 0.5), { bone: 'Head', pos: head(0, 0.03, -0.005), outline: 0.004 }, 'hat');
      ctx.rigid(cyl(r * 1.32, r * 1.32, 0.01, 16), { bone: 'Head', pos: head(0, 0.03, 0.005), outline: 0.003 }, 'hat');
      break;
    case 'chef':
      ctx.rigid(cyl(r * 1.08, r * 1.04, 0.15, 16), { bone: 'Head', pos: head(0, 0.11, -0.01), outline: 0.004 }, 'white');
      ctx.rigid(sphere(r * 1.25, 14, 8), { bone: 'Head', pos: head(0, 0.2, -0.01), scale: [1, 0.55, 1], outline: 0.004 }, 'white');
      break;
    case 'fedora':
    case 'bowler':
    case 'tophat': {
      const tall = k === 'tophat' ? 0.17 : 0.09;
      if (k === 'bowler') ctx.rigid(crown(r * 1.1, Math.PI * 0.5), { bone: 'Head', pos: head(0, 0.045, -0.005), scale: [1, 1.05, 1], outline: 0.004 }, 'hat');
      else ctx.rigid(cyl(r * (k === 'tophat' ? 1.02 : 0.98), r * 1.08, tall, 16), { bone: 'Head', pos: head(0, 0.03 + tall / 2 + 0.015, -0.005), outline: 0.004 }, 'hat');
      ctx.rigid(cyl(r * (k === 'fedora' ? 1.65 : 1.45), r * (k === 'fedora' ? 1.65 : 1.45), 0.008, 18), { bone: 'Head', pos: head(0, 0.045, -0.005), rot: [k === 'fedora' ? 0.08 * fwd : 0, 0, 0], outline: 0.003 }, 'hat');
      ctx.rigid(cyl(r * 1.09, r * 1.09, 0.022, 16, true), { bone: 'Head', pos: head(0, 0.06, -0.005), outline: 0 }, 'hat2');
      break;
    }
    case 'beret':
      ctx.rigid(sphere(r * 1.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), { bone: 'Head', pos: head(0.02, 0.05, -0.01), scale: [1.05, 0.45, 1.05], rot: [0, 0, -0.25], outline: 0.004 }, 'hat');
      break;
    case 'hood':
      ctx.layer({ pick: (p, n) => p.y > lm.neckY - 0.01 && Math.abs(p.x) < 0.17 && !(L.headFront(p) > 0.35 && Math.abs(p.x) < 0.065 && p.y < lm.eyeY + 0.04 && p.y > lm.eyeY - 0.13), offset: (p) => 0.018 + 0.01 * clamp01((p.y - lm.eyeY) / 0.1) }, 'outer', 0.005);
      break;
    default:
  }
}

// ---------------------------------------------------------------- extras

function extra(ctx, L, e, cut) {
  const { lm } = L;
  const hc = lm.headCenter, r = lm.headRadius, fwd = L.fwd;
  const yaw = fwd < 0 ? Math.PI : 0;
  const head = (dx, dy, dz) => [hc.x + dx, hc.y + dy, hc.z + dz * fwd];
  const faceZ = lm.eyeFrontZ;
  switch (e) {
    case 'glasses':
    case 'sunglasses':
      for (const side of [-1, 1]) {
        ctx.rigid(torus(0.017, 0.0028, 4, 14).scale(1, 0.78, 1), { bone: 'Head', pos: [side * lm.eyeSpread, lm.eyeY + 0.002, faceZ + 0.012 * fwd], rot: [0, yaw, 0], outline: 0 }, 'ink');
        if (e === 'sunglasses') ctx.rigid(new THREE.CircleGeometry(0.016, 12).scale(1, 0.78, 1), { bone: 'Head', pos: [side * lm.eyeSpread, lm.eyeY + 0.002, faceZ + 0.0125 * fwd], rot: [0, yaw, 0], outline: 0 }, 'ink');
        ctx.rigid(box(0.003, 0.003, 0.09), { bone: 'Head', pos: [side * (lm.eyeSpread + 0.018), lm.eyeY + 0.006, faceZ - 0.035 * fwd], outline: 0 }, 'ink');
      }
      ctx.rigid(box(0.012, 0.003, 0.003), { bone: 'Head', pos: [0, lm.eyeY + 0.008, faceZ + 0.012 * fwd], outline: 0 }, 'ink');
      break;
    case 'monocle':
      ctx.rigid(torus(0.019, 0.003, 4, 14), { bone: 'Head', pos: [lm.eyeSpread * Math.sign(lm.eyeSpread), lm.eyeY + 0.002, faceZ + 0.012 * fwd], rot: [0, yaw, 0], outline: 0 }, 'metal');
      break;
    case 'moustache':
      ctx.rigid(slab([[-0.034, -0.008], [-0.018, 0.004], [0, 0.006], [0.018, 0.004], [0.034, -0.008], [0.016, -0.004], [0, -0.002], [-0.016, -0.004]], 0.008, 0.002), { bone: 'Head', pos: [0, lm.eyeY - 0.06, faceZ - 0.004 * fwd], rot: [0, yaw, 0], outline: 0.002 }, 'hair');
      break;
    case 'beard':
    case 'stubble':
      ctx.layer({ pick: (p, n) => L.headFront(p) > -0.1 && p.y > lm.neckY - 0.0 && p.y < lm.eyeY - 0.045 && Math.abs(p.x) < 0.085 && !(Math.abs(p.y - (lm.eyeY - 0.078)) < 0.006 && Math.abs(p.x) < 0.02), offset: e === 'beard' ? 0.007 : 0.0015 }, e === 'beard' ? 'hair' : 'stubble', e === 'beard' ? 0.003 : 0);
      break;
    case 'tie':
      ctx.decal([[-0.012, 0.0], [0.012, 0.0], [0.016, -0.05], [0.02, -0.25], [0, -0.28], [-0.02, -0.25], [-0.016, -0.05]], { y: lm.neckY - 0.03, lift: 0.017 }, 'accent');
      ctx.decal([[-0.013, 0.012], [0.013, 0.012], [0.009, -0.012], [-0.009, -0.012]], { y: lm.neckY - 0.022, lift: 0.021 }, 'accent', 0.002);
      break;
    case 'bowtie':
      // A bow tie standing proud of the collar: two wings and a knot (rigid, so it never sinks
      // into the draped shirt front).
      ctx.rigid(slab([[-0.04, 0.017], [0, 0.004], [0.04, 0.017], [0.04, -0.017], [0, -0.004], [-0.04, -0.017]], 0.012, 0.002), { bone: 'spine_03', pos: [0, lm.neckY - 0.03, L.chestFront(lm.neckY - 0.03) + 0.024 * fwd], rot: [0, yaw, 0], outline: 0.002 }, 'accent');
      ctx.rigid(box(0.014, 0.016, 0.014), { bone: 'spine_03', pos: [0, lm.neckY - 0.03, L.chestFront(lm.neckY - 0.03) + 0.031 * fwd], outline: 0.0015 }, 'accent');
      break;
    case 'pocketsquare':
      ctx.decal([[-0.018, 0], [0.018, 0], [0.012, 0.016], [0, 0.01], [-0.012, 0.016]], { y: lm.chestY + 0.05, x: 0.1, lift: 0.027 }, 'white', 0);
      break;
    case 'badge':
      ctx.decal(star(0.02, 0.009, 6), { y: lm.chestY + 0.05, x: -0.09, lift: (cut.outer ? 0.02 : 0.008) }, 'metal', 0.002);
      break;
    case 'lanyard':
      ctx.decal([[-0.022, 0.03], [0.022, 0.03], [0.022, -0.03], [-0.022, -0.03]], { y: lm.chestY - 0.06, lift: 0.012 }, 'white', 0.002);
      break;
    case 'scarf':
      ctx.rigid(torus(0.075, 0.028, 6, 16), { bone: 'neck_01', pos: [0, lm.neckY - 0.005, ctx.bp('neck_01').z], rot: [Math.PI / 2, 0, 0], scale: [1, 0.85, 1], outline: 0.004 }, 'accent');
      ctx.rigid(box(0.06, 0.24, 0.02), { bone: 'spine_03', pos: [0.05, lm.chestY - 0.03, lm.chestFrontZ + 0.025 * fwd], rot: [0, 0, 0.12], outline: 0.004 }, 'accent');
      break;
    case 'stethoscope':
      ctx.rigid(torus(0.085, 0.006, 4, 16, Math.PI * 1.3), { bone: 'spine_03', pos: [0, lm.neckY - 0.03, ctx.bp('neck_01').z + 0.02 * fwd], rot: [Math.PI / 2 + 0.3 * fwd, 0, Math.PI * 0.35], outline: 0.002 }, 'ink');
      break;
    case 'bag': {
      const hip = ctx.bp('thigh_r');
      ctx.rigid(slab([[-0.12, -0.09], [0.12, -0.09], [0.1, 0.09], [-0.1, 0.09]], 0.07, 0.01), { bone: 'pelvis', pos: [hip.x * 1.9, lm.beltY - 0.06, L.hipZ + 0.0], rot: [0, Math.PI / 2, 0], outline: 0.004 }, 'bag');
      break;
    }
    case 'backpack':
      ctx.rigid(slab([[-0.13, -0.16], [0.13, -0.16], [0.12, 0.17], [-0.12, 0.17]], 0.12, 0.02), { bone: 'spine_03', pos: [0, lm.chestY - 0.06, ctx.bp('spine_03').z - 0.19 * fwd], outline: 0.005 }, 'bag');
      break;
    case 'camera':
      ctx.rigid(box(0.1, 0.07, 0.05), { bone: 'spine_03', pos: [0.02, lm.chestY - 0.1, lm.chestFrontZ + 0.05 * fwd], outline: 0.004 }, 'ink');
      ctx.rigid(cyl(0.024, 0.024, 0.05, 12).rotateX(Math.PI / 2), { bone: 'spine_03', pos: [0.02, lm.chestY - 0.1, lm.chestFrontZ + 0.09 * fwd], outline: 0.003 }, 'metal');
      break;
    case 'radio':
      ctx.rigid(box(0.035, 0.07, 0.03), { bone: 'clavicle_l', pos: [ctx.bp('upperarm_l').x * 0.55, L.armY + 0.04, lm.chestFrontZ + 0.01 * fwd], outline: 0.003 }, 'ink');
      break;
    case 'holster': {
      const hip = ctx.bp('thigh_r');
      ctx.rigid(box(0.045, 0.13, 0.06), { bone: 'thigh_r', pos: [hip.x * 1.85, L.hipY - 0.06, L.hipZ], outline: 0.003 }, 'ink');
      break;
    }
    case 'kneepads':
      ctx.layer({ pick: (p, n) => Math.abs(p.y - lm.kneeY) < 0.055 && n.z * fwd > 0.3 && !L.inArm(p), offset: 0.012 }, 'vest', 0.004);
      break;
    case 'armband':
      ctx.layer({ pick: (p) => L.inArm(p) && p.x * Math.sign(ctx.bp('upperarm_l').x) > 0 && Math.abs(Math.abs(p.x) - (lm.shoulderX + 0.1)) < 0.03, offset: 0.006 }, (p) => (Math.abs(Math.abs(p.x) - (lm.shoulderX + 0.1)) < 0.012 && Math.abs(p.y - L.armY) < 0.012 ? 'accent' : 'white'), 0.003);
      break;
    case 'headset':
      ctx.rigid(torus(r * 1.05, 0.005, 4, 16, Math.PI), { bone: 'Head', pos: head(0, 0.01, 0), rot: [0, Math.PI / 2, 0], outline: 0.002 }, 'ink');
      for (const side of [-1, 1]) ctx.rigid(cyl(0.025, 0.025, 0.02, 12).rotateZ(Math.PI / 2), { bone: 'Head', pos: head(side * r * 1.02, 0.0, 0), outline: 0.002 }, 'ink');
      break;
    case 'injuries': {
      // Regions for the double life's marks (bruce.js): a bruise round one eye and the cheek
      // under it, and a split at one corner of the mouth. Painted skin until switched on.
      const side = Math.sign(lm.eyeSpread) || 1;
      ctx.paint((p) => {
        if (!L.isHead(p) || L.headFront(p) < 0.3) return null;
        if (p.x * side > 0 && Math.hypot(p.x * side - lm.eyeSpread - 0.006, (p.y - lm.eyeY + 0.012) * 1.2) < 0.024) return 'bruise';
        if (Math.abs(p.x * side - 0.014) < 0.009 && Math.abs(p.y - (lm.eyeY - 0.08)) < 0.007) return 'lip';
        return null;
      });
      break;
    }
    // ---- villain and gang pieces
    case 'burlap':
      // A sack over the head, cinched at the neck, with ragged eye holes and a stitched mouth.
      ctx.layer({ pick: (p) => p.y > lm.neckY - 0.02 && Math.abs(p.x) < 0.17, offset: (p) => 0.012 + 0.008 * clamp01((p.y - lm.eyeY) / 0.1) }, (p) => {
        const f = L.headFront(p) > 0.4;
        if (f && Math.hypot(Math.abs(p.x) - lm.eyeSpread, p.y - lm.eyeY) < 0.014) return 'ink';
        if (f && Math.abs(p.y - (lm.eyeY - 0.075)) < 0.004 && Math.abs(p.x) < 0.035) return 'ink';
        if (Math.abs(p.y - (lm.neckY + 0.005)) < 0.008) return 'accent';
        return 'hat';
      }, 0.005);
      break;
    case 'splitface':
      // One side of the face scarred: a region the palette paints raw pink-purple.
      ctx.paint((p) => (L.isHead(p) && p.x * (Math.sign(lm.eyeSpread) || 1) < -0.004 && L.headFront(p) > -0.2 ? 'scar' : null));
      break;
    case 'split':
      // A two-tone suit: the left half of the jacket and trousers in the second colour.
      ctx.layer({ pick: (p) => p.x * (Math.sign(ctx.bp('upperarm_l').x) || 1) > 0.004 && p.y > lm.ankleY + 0.05 && !(L.isHead(p)) && !(L.inArm(p) && Math.abs(p.x) > L.wristX), offset: (p) => (p.y > lm.beltY - 0.1 ? 0.016 : 0.004) }, 'outer2', 0.004);
      break;
    case 'colddome':
      // A clear dome over the head (drawn pale and lit), a collar ring and two cold-tank lines.
      ctx.rigid(sphere(r * 1.55, 18, 12), { bone: 'neck_01', pos: head(0, 0.0, 0.0), outline: 0.004 }, 'lens');
      ctx.rigid(torus(0.13, 0.025, 6, 18), { bone: 'spine_03', pos: [0, lm.neckY - 0.02, ctx.bp('neck_01').z], rot: [Math.PI / 2, 0, 0], outline: 0.004 }, 'metal');
      for (const side of [-1, 1]) ctx.rigid(cyl(0.045, 0.045, 0.32, 10), { bone: 'spine_03', pos: [side * 0.08, lm.chestY - 0.05, ctx.bp('spine_03').z - 0.17 * fwd], outline: 0.004 }, 'metal');
      break;
    case 'goggles':
      for (const side of [-1, 1]) ctx.rigid(cyl(0.02, 0.02, 0.018, 12).rotateX(Math.PI / 2), { bone: 'Head', pos: [side * lm.eyeSpread, lm.eyeY + 0.004, faceZ + 0.012 * fwd], outline: 0.002 }, 'lens');
      ctx.rigid(torus(r * 1.03, 0.006, 4, 18), { bone: 'Head', pos: head(0, 0.0, 0.0), rot: [Math.PI / 2 - 0.15 * fwd, 0, 0], outline: 0.002 }, 'ink');
      break;
    case 'catears':
      ctx.layer({ pick: (p, n) => p.y > lm.neckY + 0.02 && Math.abs(p.x) < 0.17 && !(L.headFront(p) > 0.35 && p.y < lm.eyeY - 0.03 && Math.abs(p.x) < 0.07), offset: 0.005 }, 'hat', 0.005);
      for (const side of [-1, 1]) ctx.rigid(new THREE.ConeGeometry(0.025, 0.06, 4), { bone: 'Head', pos: head(side * r * 0.6, r * 0.9, -0.01), rot: [0, 0, -side * 0.25], outline: 0.004 }, 'hat');
      break;
    case 'mercmask':
      // A full mask in two halves, one eye hole on the dark side.
      ctx.layer({ pick: (p) => p.y > lm.neckY - 0.02 && Math.abs(p.x) < 0.17, offset: 0.006 }, (p) => {
        if (L.headFront(p) > 0.4 && p.x * (Math.sign(lm.eyeSpread) || 1) > 0 && Math.hypot(Math.abs(p.x) - lm.eyeSpread, p.y - lm.eyeY) < 0.012) return 'ink';
        return p.x * (Math.sign(lm.eyeSpread) || 1) > 0.002 ? 'hat2' : 'hat';
      }, 0.005);
      break;
    case 'clownmask':
      ctx.layer({ pick: (p, n) => L.isHead(p) && L.headFront(p) > 0.15 && p.y < lm.eyeY + 0.05, offset: 0.006 }, (p) => {
        if (Math.hypot(Math.abs(p.x) - lm.eyeSpread, p.y - lm.eyeY) < 0.011) return 'ink';
        if (Math.abs(p.y - (lm.eyeY - 0.08) - Math.abs(p.x) * 0.5) < 0.008 && Math.abs(p.x) < 0.045) return 'accent';
        return 'white';
      }, 0.004);
      break;
    case 'gasmask':
      ctx.layer({ pick: (p) => L.isHead(p) && L.headFront(p) > 0.1 && p.y < lm.eyeY + 0.035 && p.y > lm.eyeY - 0.12, offset: 0.008 }, 'hat2', 0.004);
      ctx.rigid(cyl(0.025, 0.03, 0.04, 10).rotateX(Math.PI / 2), { bone: 'Head', pos: [0, lm.eyeY - 0.07, faceZ + 0.025 * fwd], outline: 0.003 }, 'metal');
      for (const side of [-1, 1]) ctx.rigid(cyl(0.016, 0.016, 0.01, 12).rotateX(Math.PI / 2), { bone: 'Head', pos: [side * lm.eyeSpread, lm.eyeY + 0.002, faceZ + 0.014 * fwd], outline: 0.002 }, 'lens');
      break;
    case 'welder':
      ctx.rigid(slab([[-0.075, -0.1], [0.075, -0.1], [0.085, 0.06], [-0.085, 0.06]], 0.02, 0.006), { bone: 'Head', pos: [0, lm.eyeY - 0.02, faceZ + 0.02 * fwd], rot: [0, yaw, 0], outline: 0.004 }, 'hat2');
      ctx.rigid(box(0.11, 0.025, 0.01), { bone: 'Head', pos: [0, lm.eyeY + 0.005, faceZ + 0.033 * fwd], outline: 0 }, 'lens');
      ctx.rigid(cyl(0.05, 0.05, 0.34, 10), { bone: 'spine_03', pos: [0, lm.chestY - 0.05, ctx.bp('spine_03').z - 0.17 * fwd], outline: 0.004 }, 'metal');
      break;
    case 'ninja':
      // Wraps over the lower face (with a hood for the head).
      ctx.layer({ pick: (p) => L.isHead(p) && p.y < lm.eyeY - 0.012, offset: 0.007 }, 'hat', 0.004);
      break;
    case 'vines':
      ctx.layer({ pick: (p) => { const k = Math.sin(p.y * 40 + Math.atan2(p.x, p.z) * 3); return !L.isHead(p) && k > 0.82; }, offset: 0.01 }, 'accent', 0.003);
      break;
    case 'lamp':
      ctx.rigid(cyl(0.025, 0.03, 0.04, 10).rotateX(Math.PI / 2), { bone: 'Head', pos: head(0, 0.07, r * 0.95), outline: 0.003 }, 'lens');
      ctx.rigid(torus(r * 1.08, 0.008, 4, 18), { bone: 'Head', pos: head(0, 0.065, 0), rot: [Math.PI / 2, 0, 0], outline: 0.002 }, 'ink');
      break;
    case 'redcross':
      ctx.decal([[-0.012, 0.035], [0.012, 0.035], [0.012, 0.012], [0.035, 0.012], [0.035, -0.012], [0.012, -0.012], [0.012, -0.035], [-0.012, -0.035], [-0.012, -0.012], [-0.035, -0.012], [-0.035, 0.012], [-0.012, 0.012]], { y: lm.chestY + 0.01, lift: cut.outer ? 0.024 : 0.008 }, 'accent', 0.002);
      break;
    case 'questionmark':
      ctx.decal([[-0.02, 0.05], [0.02, 0.05], [0.035, 0.03], [0.012, 0.0], [0.012, -0.015], [-0.006, -0.015], [-0.006, 0.006], [0.015, 0.028], [0.0, 0.035], [-0.02, 0.03]], { y: lm.chestY - 0.02, lift: cut.outer ? 0.016 : 0.008 }, 'accent', 0.002);
      ctx.decal([[-0.008, -0.025], [0.008, -0.025], [0.008, -0.04], [-0.008, -0.04]], { y: lm.chestY - 0.02, lift: cut.outer ? 0.016 : 0.008 }, 'accent', 0.002);
      break;
    case 'belt':
    case 'gloves':
    case 'tights':
      break;
    default:
      EXTRAS.get(e)?.(ctx, L, cut);
  }
}

// Extras registered by other builders (enemy roles, villains): name -> fn(ctx, L, cut), called
// like a built-in extra. The name goes in cut.extras, so it is part of the template's shape key.
const EXTRAS = new Map();
export function registerExtra(name, fn) { EXTRAS.set(name, fn); }

function star(R, r, n) {
  const pts = [];
  for (let k = 0; k < n * 2; k++) { const a = (k / (n * 2)) * Math.PI * 2 + Math.PI / 2; const rr = k % 2 ? r : R; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  return pts;
}
export { star };
