// Procedural block fill for the west side's neighbourhoods (workstream H3): lots along the
// street faces of a sub-block, each a building() with district-specific options, a light fire
// escape of our own (fewer rungs than cityBuilder's, same ladders), and the bookkeeping the
// rooftop pass needs (roof rectangles, heights) to lay planks and washing lines across alleys.
// Pure placement maths (lotsAlong, facingPairs) is exported for the unit tests.
import * as THREE from 'three';
import { box } from '../buckets.js';
import { solid, building } from '../cityBuilder.js';
import { addLadder } from '../climbables.js';
import { plank, washingLine, waterTank, pigeonCoop } from './westKit.js';
import { inElEnvelope, WEST } from './westLayout.js';

export const FLOOR = 3.4;

// Splits a length into lots of roughly `target` metres (at least `min`), returns [start, end]s.
export function lotsAlong(a, b, target, min, rng) {
  const len = b - a;
  const n = Math.max(1, Math.round(len / target));
  const cuts = [a];
  for (let i = 1; i < n; i++) cuts.push(a + (len * i) / n + (rng ? rng.range(-0.15, 0.15) * (len / n) : 0));
  cuts.push(b);
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i++) if (cuts[i + 1] - cuts[i] >= min) out.push([cuts[i], cuts[i + 1]]);
  return out;
}

// Clips a footprint out of the El envelope / station plots (pulls its El-facing side back).
export function clipEl(r) {
  if (!inElEnvelope(r)) return r;
  const E = WEST.el;
  const out = { ...r };
  let zLo = E.envelope.minZ, zHi = E.envelope.maxZ;
  for (const s of E.stations) if (r.maxX > s.minX && r.minX < s.maxX) { zLo = Math.min(zLo, s.minZ); zHi = Math.max(zHi, s.maxZ); }
  if (r.minZ >= (zLo + zHi) / 2) out.minZ = Math.max(r.minZ, zHi);
  else out.maxZ = Math.min(r.maxZ, zLo);
  return out.maxZ - out.minZ < 6 ? null : out;
}

// A lighter fire escape on a face ('n','s','e','w'): landings every 3.4 m from 6.8, zigzag
// stairs, a drop ladder (unless a storefront), ladders between landings and up to the roof.
// Same climbables as cityBuilder's; the rungs are drawn every 0.6 m instead of 0.3.
export function fireEscapeLite(ctx, b, face, { drop = true } = {}) {
  const f = face === 'n' ? { px: b.x, pz: b.z - b.d / 2, nx: 0, nz: -1, width: b.w }
    : face === 's' ? { px: b.x, pz: b.z + b.d / 2, nx: 0, nz: 1, width: b.w }
      : face === 'e' ? { px: b.x + b.w / 2, pz: b.z, nx: 1, nz: 0, width: b.d }
        : { px: b.x - b.w / 2, pz: b.z, nx: -1, nz: 0, width: b.d };
  const along = { x: -f.nz, z: f.nx };
  const width = Math.min(6, f.width - 3);
  if (width < 2.5 || b.h < 10) return;
  const levels = [];
  for (let y = 6.8; y < b.h - 2.5; y += FLOOR) levels.push(y);
  if (!levels.length) return;
  const ax = Math.abs(along.x) > 0;
  for (const y of levels) {
    const cx = f.px + f.nx * 0.7, cz = f.pz + f.nz * 0.7;
    solid(ctx, 'steel', box(ax ? width : 1.3, 0.08, ax ? 1.3 : width, cx, y, cz));
    const rx = f.px + f.nx * 1.32, rz = f.pz + f.nz * 1.32;
    ctx.buckets.add('steel', box(ax ? width : 0.05, 0.05, ax ? 0.05 : width, rx, y + 1, rz));
    const st = box(0.5, 0.06, 3.6, 0, 0, 0).rotateX(0.75);
    if (ax) st.rotateY(Math.PI / 2);
    ctx.buckets.add('steel', st.translate(cx, y + 1.7, cz));
  }
  const outer = { x: f.px + f.nx * 1.32, z: f.pz + f.nz * 1.32 };
  const endOffset = (i) => (i % 2 ? -1 : 1) * (width / 2 - 0.5);
  const rungs = (lx, lz, nx, nz, y0, y1) => {
    const sx = -nz * 0.25, sz = nx * 0.25;
    for (const s of [-1, 1]) ctx.buckets.add('steel', box(0.05, y1 - y0, 0.05, lx + sx * s, (y0 + y1) / 2, lz + sz * s));
    for (let k = y0 + 0.3; k < y1; k += 0.6) ctx.buckets.add('steel', box(Math.abs(nz) > 0 ? 0.5 : 0.04, 0.04, Math.abs(nx) > 0 ? 0.5 : 0.04, lx, k, lz));
  };
  if (drop) {
    const dx = outer.x + along.x * endOffset(0), dz = outer.z + along.z * endOffset(0);
    rungs(dx, dz, f.nx, f.nz, 2.2, levels[0]); // a drop ladder pulled up 2.2 m off the sidewalk
    addLadder(ctx.climbables, { x: dx, z: dz, nx: f.nx, nz: f.nz, bottom: 0, top: levels[0] });
  }
  for (let i = 0; i < levels.length - 1; i++) {
    const lx = outer.x + along.x * endOffset(i + 1), lz = outer.z + along.z * endOffset(i + 1);
    rungs(lx, lz, f.nx, f.nz, levels[i], levels[i + 1]);
    addLadder(ctx.climbables, { x: lx, z: lz, nx: f.nx, nz: f.nz, bottom: levels[i], top: levels[i + 1] });
  }
  const last = levels[levels.length - 1];
  const rx2 = f.px + along.x * endOffset(levels.length), rz2 = f.pz + along.z * endOffset(levels.length);
  rungs(rx2, rz2, f.nx, f.nz, last, b.h);
  addLadder(ctx.climbables, { x: rx2, z: rz2, nx: f.nx, nz: f.nz, bottom: last, top: b.h });
}

// Fills a sub-block with buildings along the faces listed in `faces` (each 'n'|'s'|'e'|'w' with
// the sidewalk margin it keeps), returns the building records. opts:
//   depth [min,max] lot depth from the face, lot [target, min] frontage, floors [min,max],
//   styles [...], storefront 0..1, fireEscape 0..1, parapet bool, props 'none'|'auto',
//   district, tag, extra(b) -> more fields, onBuilt(b) callback.
export function fillSub(ctx, sub, faces, opts) {
  const { rng } = ctx;
  const out = [];
  const o = { depth: [12, 18], lot: [9, 6], floors: [4, 6], styles: ['brick'], storefront: 0.5, fireEscape: 0.8, parapet: false, props: 'none', margin: 3, ...opts };
  const taken = [];
  const free = (r) => taken.every((t) => r.maxX <= t.minX + 0.01 || r.minX >= t.maxX - 0.01 || r.maxZ <= t.minZ + 0.01 || r.minZ >= t.maxZ - 0.01);
  for (const face of faces) {
    const m = typeof face === 'object' ? face.margin : o.margin;
    const fc = typeof face === 'object' ? face.face : face;
    const alongX = fc === 'n' || fc === 's';
    const a0 = alongX ? sub.minX : sub.minZ, a1 = alongX ? sub.maxX : sub.maxZ;
    const depthMax = alongX ? sub.maxZ - sub.minZ - m : sub.maxX - sub.minX - m;
    for (const [p, q] of lotsAlong(a0 + (alongX ? 0 : 0), a1, o.lot[0], o.lot[1], rng)) {
      const dep = Math.min(depthMax, rng.range(o.depth[0], o.depth[1]));
      if (dep < 5) continue;
      let r;
      if (fc === 'n') r = { minX: p, maxX: q, minZ: sub.minZ + m, maxZ: sub.minZ + m + dep };
      else if (fc === 's') r = { minX: p, maxX: q, minZ: sub.maxZ - m - dep, maxZ: sub.maxZ - m };
      else if (fc === 'w') r = { minX: sub.minX + m, maxX: sub.minX + m + dep, minZ: p, maxZ: q };
      else r = { minX: sub.maxX - m - dep, maxX: sub.maxX - m, minZ: p, maxZ: q };
      // Respect the other faces' sidewalk margins.
      for (const g of faces) {
        const gm = typeof g === 'object' ? g.margin : o.margin, gf = typeof g === 'object' ? g.face : g;
        if (gf === 'n') r.minZ = Math.max(r.minZ, sub.minZ + gm);
        if (gf === 's') r.maxZ = Math.min(r.maxZ, sub.maxZ - gm);
        if (gf === 'w') r.minX = Math.max(r.minX, sub.minX + gm);
        if (gf === 'e') r.maxX = Math.min(r.maxX, sub.maxX - gm);
      }
      r = clipEl(r);
      if (!r || r.maxX - r.minX < 4 || r.maxZ - r.minZ < 4) continue;
      // A lot that runs into a corner building (or a landmark) gives up the overlapping end
      // along its face, so corners fill instead of leaving holes.
      r = trimLot(r, [...taken, ...(o.avoid ?? [])], alongX, o.lot[1]);
      if (!r || !free(r)) continue;
      taken.push(r);
      const floors = rng.int(o.floors[0], o.floors[1]);
      const style = rng.pick(o.styles);
      const b = {
        id: `${o.tag ?? 'w'}${Math.round(r.minX)}_${Math.round(r.minZ)}`,
        x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, w: r.maxX - r.minX, d: r.maxZ - r.minZ, h: floors * FLOOR + (o.hJitter ? rng.range(0, o.hJitter) : 0),
        style, roof: 'flat', parapet: o.parapet, cornice: style !== 'concrete', storefront: rng.chance(o.storefront), tiers: [], props: o.props, neon: [],
        district: o.district, face: fc, ...(o.extra ? o.extra(r, fc) : {}),
      };
      building(ctx, b);
      // No fire escape hanging into the El corridor or a station plot.
      const fn = fc === 'n' ? [0, -1] : fc === 's' ? [0, 1] : fc === 'w' ? [-1, 0] : [1, 0];
      const strip = { minX: fn[0] > 0 ? r.maxX : fn[0] < 0 ? r.minX - 1.6 : r.minX, maxX: fn[0] > 0 ? r.maxX + 1.6 : fn[0] < 0 ? r.minX : r.maxX,
        minZ: fn[1] > 0 ? r.maxZ : fn[1] < 0 ? r.minZ - 1.6 : r.minZ, maxZ: fn[1] > 0 ? r.maxZ + 1.6 : fn[1] < 0 ? r.minZ : r.maxZ };
      if (b.h > 10 && rng.chance(o.fireEscape) && !inElEnvelope(strip)) fireEscapeLite(ctx, b, fc, { drop: !b.storefront });
      o.onBuilt?.(b);
      out.push(b);
    }
  }
  return out;
}

function trimLot(r, others, alongX, min) {
  const out = { ...r };
  for (const t of others) {
    if (!(out.maxX > t.minX && out.minX < t.maxX && out.maxZ > t.minZ && out.minZ < t.maxZ)) continue;
    if (alongX) {
      if (t.maxX - out.minX < out.maxX - t.minX) out.minX = t.maxX; else out.maxX = t.minX;
    } else if (t.maxZ - out.minZ < out.maxZ - t.minZ) out.minZ = t.maxZ; else out.maxZ = t.minZ;
    if ((alongX ? out.maxX - out.minX : out.maxZ - out.minZ) < min) return null;
  }
  return out;
}

// Pairs of buildings facing each other across a gap of `gap` (±1.5 m) along x or z, with the
// overlap span between them. Used for planks and washing lines over alleys.
export function facingPairs(list, gapMin = 3.5, gapMax = 7.5) {
  const out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const ax0 = a.x - a.w / 2, ax1 = a.x + a.w / 2, az0 = a.z - a.d / 2, az1 = a.z + a.d / 2;
    const bx0 = b.x - b.w / 2, bx1 = b.x + b.w / 2, bz0 = b.z - b.d / 2, bz1 = b.z + b.d / 2;
    const oz0 = Math.max(az0, bz0), oz1 = Math.min(az1, bz1), ox0 = Math.max(ax0, bx0), ox1 = Math.min(ax1, bx1);
    if (oz1 - oz0 > 2) {
      const g = bx0 - ax1, g2 = ax0 - bx1;
      if (g >= gapMin && g <= gapMax) out.push({ a, b, alongX: true, ea: ax1, eb: bx0, o0: oz0, o1: oz1 });
      else if (g2 >= gapMin && g2 <= gapMax) out.push({ a: b, b: a, alongX: true, ea: bx1, eb: ax0, o0: oz0, o1: oz1 });
    }
    if (ox1 - ox0 > 2) {
      const g = bz0 - az1, g2 = az0 - bz1;
      if (g >= gapMin && g <= gapMax) out.push({ a, b, alongX: false, ea: az1, eb: bz0, o0: ox0, o1: ox1 });
      else if (g2 >= gapMin && g2 <= gapMax) out.push({ a: b, b: a, alongX: false, ea: bz1, eb: az0, o0: ox0, o1: ox1 });
    }
  }
  return out;
}

// Rooftop links over the alleys of a set of buildings: planks where the roofs are within 4 m
// of each other, washing lines strung between facing walls; tanks and coops on some roofs.
export function rooftopLinks(ctx, list, { planks = 0.6, lines = 0.7, tanks = 0.4, coops = 0.15, gapMax = 7.5 } = {}) {
  const { rng } = ctx;
  for (const p of facingPairs(list, 3.5, gapMax)) {
    const t = rng.range(p.o0 + 1, p.o1 - 1);
    const dh = Math.abs(p.a.h - p.b.h);
    if (dh <= 4 && rng.chance(planks)) {
      const A = p.alongX ? { x: p.ea - 0.6, y: p.a.h, z: t } : { x: t, y: p.a.h, z: p.ea - 0.6 };
      const B = p.alongX ? { x: p.eb + 0.6, y: p.b.h, z: t } : { x: t, y: p.b.h, z: p.eb + 0.6 };
      plank(ctx, A, B, 1.1);
    }
    if (rng.chance(lines)) {
      const top = Math.min(p.a.h, p.b.h) - 2;
      for (let y = 6; y < top; y += rng.range(3.2, 5.5)) {
        const s = rng.range(p.o0 + 0.8, p.o1 - 0.8);
        const A = p.alongX ? { x: p.ea + 0.05, y, z: s } : { x: s, y, z: p.ea + 0.05 };
        const B = p.alongX ? { x: p.eb - 0.05, y: y + rng.range(-0.6, 0.6), z: s + rng.range(-1.5, 1.5) } : { x: s + rng.range(-1.5, 1.5), y: y + rng.range(-0.6, 0.6), z: p.eb - 0.05 };
        washingLine(ctx, A, B, { items: rng.int(3, 6) });
        if (rng.chance(0.5)) break;
      }
    }
  }
  for (const b of list) {
    const room = Math.min(b.w, b.d);
    if (room > 7 && rng.chance(tanks)) waterTank(ctx, b.x + rng.range(-b.w / 4, b.w / 4), b.h, b.z + rng.range(-b.d / 4, b.d / 4), room > 12 ? 1 : 0.8);
    else if (room > 6 && rng.chance(coops)) pigeonCoop(ctx, b.x, b.h, b.z, rng.range(0, Math.PI));
  }
}

// ---- low-rise pieces for Park Row, Little Odessa and the Yards ----

// A workers' cottage: a 1.5-storey frame house on a raised basement, gable end to the street
// (face), a stoop up to the door. Collides as the box plus the gable in three steps.
export function cottage(ctx, x, z, face, { w = 6.5, d = 11, color = null } = {}) {
  const { rng } = ctx;
  const along = face === 'n' || face === 's';
  const W = along ? w : d, D = along ? d : w;
  const h = 6.2;
  building(ctx, { id: `cot${Math.round(x)}_${Math.round(z)}`, x, z, w: W, d: D, h, style: rng.pick(['brick', 'stone']), roof: 'flat', parapet: false, cornice: false, storefront: false, tiers: [], props: 'none', neon: [], district: ctx.region });
  // Gable roof: ridge runs back from the street face.
  const rh = 3;
  const g = new THREE.CylinderGeometry(0.01, (along ? W : D) / 2 * Math.SQRT2, rh, 4, 1).rotateY(Math.PI / 4);
  g.scale(along ? 1 : D / W, 1, along ? D / W : 1);
  ctx.buckets.add('painted', g.translate(x, h + rh / 2, z), color ?? rng.pick([0x3a2e2a, 0x2e3438, 0x4a3a30]));
  for (let k = 0; k < 3; k++) {
    const s = 1 - (k + 0.5) / 3;
    ctx.collision.addBox(x - W / 2 * s, h, z - D / 2 * s, x + W / 2 * s, h + rh * ((k + 1) / 3), z + D / 2 * s, 'roof');
  }
  ctx.facades?.push({ minX: x - W / 2 * 0.5, minY: h, minZ: z - D / 2 * 0.5, maxX: x + W / 2 * 0.5, maxY: h + rh, maxZ: z + D / 2 * 0.5, style: 'brick' });
  ctx.grapple.push({ x, y: h + rh, z, nx: 0, nz: 1, perch: true });
  // Stoop: four steps up to a door at 1.2 m.
  const nx = face === 'e' ? 1 : face === 'w' ? -1 : 0, nz = face === 's' ? 1 : face === 'n' ? -1 : 0;
  const fx = x + nx * W / 2, fz = z + nz * D / 2;
  for (let k = 0; k < 4; k++) {
    const out = 2 - k * 0.5, top = 0.15 + (k + 1) * 0.28;
    const cx = fx + nx * out / 2, cz = fz + nz * out / 2;
    solid(ctx, 'concrete', box(nz ? 1.6 : out, top, nx ? 1.6 : out, cx, top / 2, cz), { tag: 'step' });
  }
  ctx.buckets.add('painted', box(nz ? 1.1 : 0.08, 2.1, nx ? 1.1 : 0.08, fx + nx * 0.04, 2.3, fz + nz * 0.04), 0x2a1c14);
}

// Chicago's stacked wooden back porches on a building's alley side (face): a deck per floor,
// a zigzag stair, and a ladder line the hero can climb from the yard to the roof.
export function rearPorch(ctx, b, face) {
  const f = face === 'n' ? { px: b.x, pz: b.z - b.d / 2, nx: 0, nz: -1, width: b.w }
    : face === 's' ? { px: b.x, pz: b.z + b.d / 2, nx: 0, nz: 1, width: b.w }
      : face === 'e' ? { px: b.x + b.w / 2, pz: b.z, nx: 1, nz: 0, width: b.d }
        : { px: b.x - b.w / 2, pz: b.z, nx: -1, nz: 0, width: b.d };
  const width = Math.min(5, f.width - 1.5);
  if (width < 3 || b.h < 6) return;
  const ax = !!f.nz;
  const depth = 2.2;
  const cx = f.px + f.nx * depth / 2, cz = f.pz + f.nz * depth / 2;
  const top = b.h - 1;
  for (let y = FLOOR; y < top; y += FLOOR) {
    solid(ctx, 'wood', box(ax ? width : depth, 0.14, ax ? depth : width, cx, y, cz), { tag: 'porch' });
    ctx.buckets.add('wood', box(ax ? width : 0.06, 1, ax ? 0.06 : width, f.px + f.nx * (depth - 0.05), y + 0.55, f.pz + f.nz * (depth - 0.05)));
  }
  for (const s of [-1, 1]) {
    const px = cx + (ax ? s * (width / 2 - 0.1) : f.nx * (depth / 2 - 0.1)), pz = cz + (ax ? f.nz * (depth / 2 - 0.1) : s * (width / 2 - 0.1));
    ctx.buckets.add('wood', box(0.14, top, 0.14, px, top / 2, pz));
  }
  // A ladder at one end of the porch stack, from the yard to the roof.
  const lx = f.px + f.nx * depth + (ax ? width / 2 - 0.4 : 0), lz = f.pz + f.nz * depth + (ax ? 0 : width / 2 - 0.4);
  addLadder(ctx.climbables, { x: lx, z: lz, nx: f.nx, nz: f.nz, bottom: 0, top: b.h });
  for (let k = 0.4; k < b.h; k += 0.6) ctx.buckets.add('wood', box(ax ? 0.5 : 0.05, 0.05, ax ? 0.05 : 0.5, lx, k, lz));
}

// An alley garage: a low brick box with a roller door onto the alley (face), a flat roof perch.
export function garage(ctx, x, z, face, w = 5.5, d = 5.5) {
  const along = face === 'n' || face === 's';
  const W = along ? w : d, D = along ? d : w;
  solid(ctx, 'painted', box(W, 2.9, D, x, 1.45, z), { color: ctx.rng.pick([0x6e3a2c, 0x5a4a3c, 0x7a6a5a]), tag: 'garage' });
  ctx.buckets.add('roof', box(W + 0.2, 0.15, D + 0.2, x, 2.97, z));
  const nx = face === 'e' ? 1 : face === 'w' ? -1 : 0, nz = face === 's' ? 1 : face === 'n' ? -1 : 0;
  ctx.buckets.add('painted', box(nz ? W - 1 : 0.06, 2.2, nx ? D - 1 : 0.06, x + nx * (W / 2 + 0.03), 1.25, z + nz * (D / 2 + 0.03)), 0x8a8e96);
  ctx.grapple.push({ x, y: 3.05, z, nx, nz, perch: true });
}
