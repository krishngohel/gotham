// The Narrows (workstream H3): the densest, poorest neighbourhood, an island between the North
// Branch and a 20 m channel, closed by two cuts. Blocks are split into four courts by 5 m
// alleys; tenements 4-6 floors crowd every street face with fire escapes, shuttered shops,
// grilles and graffiti; roofs sit an alley apart and are joined by planks, washing lines are
// strung across every alley, and water tanks and pigeon coops stand on the roofs. Landmarks: the
// Stack (an overbuilt tenement tower), Wolf Point (Black Mask's tower on the fork), the street
// market court, the free clinic, the boxing gym. The El West Line corridor (z -479) crosses the island with
// a station plot at x -370 left clear for workstream H1.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { box, cylinder } from '../buckets.js';
import { solid, glow, lightSpot, building, edgeGrapples, graffiti, streetLamp } from '../cityBuilder.js';
import { trashBags } from '../streetDressing.js';
import { addGargoyle, plinth } from '../gargoyles.js';
import { WEST, WEST_BRIDGES, LANDMARKS as L } from './westLayout.js';
import { slab, railing, ground, paveStreets, block, kerb, parkCars, dressAlley, canalWall, around, signPlane, grille, zip, waterTank, plank, washingLine } from './westKit.js';
import { fillSub, rooftopLinks, fireEscapeLite } from './westBlocks.js';

export const NARROWS_COLS = [[-414, -377], [-363, -317]];
export const NARROWS_ROWS = [[-291, -246], [-352, -305], [-412, -366], [-469, -426], [-532, -489], [-573, -546]];
const TAVERNS = ['THE RUSTY NAIL', 'LAST CALL', 'BAD PENNY', 'THE DROWNED RAT', 'ONE MORE', 'BAIL OR BUST', 'CASH 4 GOLD 4 CASH', 'ROOMS', 'PAWN', 'LIQUOR', 'NO CREDIT', 'TATTOO'];
const TAGS = ['NARROWS', 'NO COPS', 'FEAR', 'RAT KING', 'WHO WATCHES', 'BAT GO HOME', 'HA HA HA', 'SCARED?'];
const SIGN_COLS = [PALETTE.neonPink, PALETTE.neonCyan, 0xe0b84a, 0x9be23c, 0xff6a3a];

export function buildNarrows(ctx) {
  const { rng } = ctx;
  const I = WEST.island;
  ground(ctx, I);
  ground(ctx, { minX: -450, maxX: -300, minZ: -232, maxZ: -226 });
  waterEdges(ctx);
  for (const b of WEST_BRIDGES.fixed) if (b.kind === 'small') smallBridge(ctx, b);

  // Riverside and channel-side sidewalks between the crossing streets.
  const zCross = WEST.zNorth.map((z) => [z - 7, z + 7]);
  for (const [a, b] of around(I.minZ, I.maxZ, zCross)) {
    slab(ctx, 'sidewalk', -303, 0, a, -300, 0.15, b, { tag: 'sidewalk' });
    if (b <= -305) slab(ctx, 'sidewalk', -430, 0, a, -428, 0.15, b, { tag: 'sidewalk' });
  }
  slab(ctx, 'sidewalk', -450, 0, -232, -300, 0.15, -226, { tag: 'sidewalk' });
  slab(ctx, 'sidewalk', I.minX, 0, I.minZ, I.maxX, 0.15, -587, { tag: 'sidewalk' });
  for (let z = -566; z < -250; z += 36) if (!zCross.some(([a, b]) => z > a - 2 && z < b + 2)) streetLamp(ctx, -301.2, z, 1, 0);

  const all = [];
  const avoid = [
    rect(L.stack, 2), rect(L.wolfPoint, 3), rect(L.clinic, 0.5), rect(L.gym, 0.5),
    { minX: L.market.minX - 0.5, maxX: L.market.maxX + 0.5, minZ: L.market.minZ - 0.5, maxZ: L.market.maxZ + 0.5 },
    // the market's passages (east to the riverside, north to -359)
    { minX: L.market.maxX, maxX: -317, minZ: -331, maxZ: -325 }, { minX: -343, maxX: -337, minZ: -352, maxZ: L.market.minZ },
  ];
  for (const [x0, x1] of NARROWS_COLS) {
    for (const [z0, z1] of NARROWS_ROWS) {
      const b = { minX: x0, maxX: x1, minZ: z0, maxZ: z1 };
      const isMarket = x0 === -363 && z0 === -352;
      const isWolf = x0 === -363 && z0 === -291;
      const alleysX = isMarket ? [] : [(x0 + x1) / 2];
      const alleysZ = isMarket || isWolf || z1 - z0 < 40 ? [] : [(z0 + z1) / 2];
      const { subs, alleys } = block(ctx, b, { alleysX, alleysZ });
      const list = [];
      for (const sub of subs) {
        const faces = [];
        if (sub.minZ === b.minZ) faces.push('n');
        if (sub.maxZ === b.maxZ) faces.push('s');
        if (sub.minX === b.minX) faces.push('w');
        if (sub.maxX === b.maxX) faces.push('e');
        if (rng.chance(0.5)) faces.reverse();
        list.push(...fillSub(ctx, sub, faces, {
          depth: isMarket ? [9.5, 10] : [14, 20], lot: [8, 5], floors: [4, 7], styles: ['brick', 'brick', 'brick', 'stone'],
          storefront: 0.45, fireEscape: 0.85, parapet: false, props: 'none', district: 'narrows', tag: 'nar', avoid,
          onBuilt: (bb) => dressTenement(ctx, bb),
        }));
      }
      for (const a of alleys) dressAlley(ctx, a, { fence: rng.chance(0.25) ? rng.range(8, 16) : null });
      rooftopLinks(ctx, list, { planks: 0.75, lines: 0.8, tanks: 0.45, coops: 0.2 });
      for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        kerb(ctx, b, nx, nz, 2);
        if (rng.chance(0.35)) parkCars(ctx, b, nx, nz, 1);
      }
      all.push(...list);
    }
  }
  paveStreets(ctx, { minX: -430, maxX: -300, minZ: -588, maxZ: -246 });

  stack(ctx);
  wolfPoint(ctx);
  market(ctx);
  clinic(ctx);
  gym(ctx);
  // Washing lines across the narrow streets too (Kowloon over Chicago), high up.
  const streetsZ = WEST.zNorth.filter((q) => q !== WEST.el.z && q > -580);
  for (let k = 0; k < 16; k++) {
    const z = rng.pick(streetsZ), x = rng.range(-410, -322), y = rng.range(9, 13);
    washingLine(ctx, { x, y, z: z - 10.1 }, { x: x + rng.range(-3, 3), y: y + rng.range(-1, 1), z: z + 10.1 }, { items: rng.int(4, 8) });
  }
  zipFromRoofs(ctx, all);
}

const rect = (b, pad = 0) => ({ minX: b.x - b.w / 2 - pad, maxX: b.x + b.w / 2 + pad, minZ: b.z - b.d / 2 - pad, maxZ: b.z + b.d / 2 + pad });

// Shopfronts, grilles, graffiti and the odd neon sign on a tenement.
function dressTenement(ctx, b) {
  const { rng } = ctx;
  const f = b.face;
  const nx = f === 'e' ? 1 : f === 'w' ? -1 : 0, nz = f === 's' ? 1 : f === 'n' ? -1 : 0;
  const px = b.x + nx * b.w / 2, pz = b.z + nz * b.d / 2;
  const width = nz ? b.w : b.d;
  if (b.storefront) {
    if (rng.chance(0.4)) grille(ctx, px, pz, nx, nz, Math.min(4.5, width - 1.5), { tag: rng.chance(0.6) ? rng.pick(TAGS) : null });
    if (rng.chance(0.3)) signPlane(ctx, rng.pick(TAVERNS), rng.pick(SIGN_COLS), px + nx * 0.3, 5.4, pz + nz * 0.3, nx, nz, 1.1);
  } else if (rng.chance(0.25)) {
    graffiti(ctx, px + nx * 0.02, rng.range(1.4, 2.4), pz + nz * 0.02, nx, nz, Math.min(4, width - 1), rng.pick(TAGS));
  }
  if (rng.chance(0.2)) trashBags(ctx, px + nx * 1.2, pz + nz * 1.2);
}

// Canal walls round the island: the channel (both sides) and both cuts, railings on the land
// sides, open where the small bridges land.
function waterEdges(ctx) {
  const C = WEST.channel, N = WEST.northCut, S = WEST.southCut;
  const fixed = WEST_BRIDGES.fixed;
  const gz = fixed.filter((b) => b.axis === 'x' && b.x0 === -450).map((b) => [b.z - b.width / 2, b.z + b.width / 2]);
  const gxN = fixed.filter((b) => b.axis === 'z' && b.z0 === -600).map((b) => [b.x - b.width / 2, b.x + b.width / 2]);
  const gxS = fixed.filter((b) => b.axis === 'z' && b.z0 === -246).map((b) => [b.x - b.width / 2, b.x + b.width / 2]);
  wallWithGaps(ctx, false, N.minZ, S.maxZ, C.minX, -1, gz);   // channel, Park Row side
  wallWithGaps(ctx, false, C.minZ, S.minZ, C.maxX, 1, gz);    // channel, island side
  wallWithGaps(ctx, true, N.minX, N.maxX, N.minZ, -1, gxN);   // north cut, Bristol side
  wallWithGaps(ctx, true, C.maxX, N.maxX, N.maxZ, 1, gxN);    // north cut, island side
  wallWithGaps(ctx, true, C.maxX, S.maxX, S.minZ, -1, gxS);   // south cut, island side
  wallWithGaps(ctx, true, S.minX, S.maxX, S.maxZ, 1, gxS);    // south cut, Chinatown side
}
function wallWithGaps(ctx, alongX, a, b, at, land, gaps) {
  for (const [p, q] of around(a, b, gaps)) canalWall(ctx, alongX, p, q, at, land);
  for (const [g0, g1] of gaps) if (Math.min(b, g1) > Math.max(a, g0)) canalWall(ctx, alongX, Math.max(a, g0), Math.min(b, g1), at, land, { rail: false });
}

// A small fixed bridge over the channel or a cut: a brick-faced arch with a road deck and
// sidewalks, iron railings.
function smallBridge(ctx, b) {
  const hw = b.width / 2;
  const ax = b.axis === 'x';
  const lo = ax ? Math.min(b.x0, b.x1) : Math.min(b.z0, b.z1), hi = ax ? Math.max(b.x0, b.x1) : Math.max(b.z0, b.z1);
  const c = ax ? b.z : b.x;
  const S = (a0, a1, c0, c1, y0, y1, key, opts) => (ax ? slab(ctx, key, a0, y0, c + c0, a1, y1, c + c1, opts) : slab(ctx, key, c + c0, y0, a0, c + c1, y1, a1, opts));
  const road = hw > 10 ? 10 : hw - 3;
  S(lo, hi, -road, road, -1.2, 0, 'asphalt', { tag: 'bridge', uv: [17, 17], faces: [2] });
  S(lo, hi, -road, road, -1.4, -1.2, 'concrete', { collide: false });
  for (const s of [-1, 1]) {
    const c0 = s < 0 ? -hw : road, c1 = s < 0 ? -road : hw;
    S(lo, hi, c0, c1, -1.2, 0.15, 'sidewalk', { tag: 'bridge' });
    railing(ctx, ax, lo, hi, c + s * (hw - 0.3), 0.15, { color: 0x2a2d33 });
    // Brick spandrel faces with a dark arch below the deck.
    const at = c + s * (hw - 0.3);
    ctx.buckets.add('painted', ax ? box(hi - lo, 4.6, 0.6, (lo + hi) / 2, -3.5, at) : box(0.6, 4.6, hi - lo, at, -3.5, (lo + hi) / 2), 0x6e3a2c);
    const arch = new THREE.CylinderGeometry((hi - lo) * 0.42, (hi - lo) * 0.42, 0.64, 14, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(-Math.PI / 2);
    if (!ax) arch.rotateY(Math.PI / 2);
    ctx.buckets.add('painted', arch.translate(ax ? (lo + hi) / 2 : at, -5.8, ax ? at : (lo + hi) / 2), 0x14151a);
  }
}

// ---- landmarks ----

// The Stack: a 36 m brick tenement block with a crust of add-on shacks bolted to its roof and
// walls, planks between them, a tank and a mast on top. The district's silhouette.
function stack(ctx) {
  const { rng } = ctx;
  const S = L.stack;
  const b = { id: 'stack', x: S.x, z: S.z, w: S.w, d: S.d, h: S.h, style: 'brick', roof: 'flat', parapet: false, cornice: true, storefront: true, tiers: [], props: 'none', neon: [], district: 'narrows' };
  building(ctx, b);
  fireEscapeLite(ctx, b, 'w', { drop: false });
  fireEscapeLite(ctx, b, 's', { drop: false });
  const colors = [0x7a3e22, 0x5a4a3c, 0x6a6e74, 0x8a6a3a, 0x4a5a3a, 0x7a2e2e];
  // Roof shacks, in two storeys, each a standable box with a lit window.
  const shacks = [];
  for (let k = 0; k < 12 && shacks.length < 8; k++) {
    const w = rng.range(3.5, 6), d = rng.range(3.5, 6), h = rng.range(2.6, 3.2);
    const lvl = shacks.length < 5 ? 0 : 1;
    const base = lvl ? 0 : S.h;
    const host = lvl ? rng.pick(shacks.filter((s) => s.lvl === 0)) : null;
    const x = host ? host.x + rng.range(-0.8, 0.8) : S.x + rng.range(-S.w / 2 + w / 2 + 0.5, S.w / 2 - w / 2 - 0.5);
    const z = host ? host.z + rng.range(-0.8, 0.8) : S.z + rng.range(-S.d / 2 + d / 2 + 0.5, S.d / 2 - d / 2 - 0.5);
    const y0 = host ? host.top : base;
    if (!host && shacks.some((s) => Math.abs(s.x - x) < (s.w + w) / 2 + 1.5 && Math.abs(s.z - z) < (s.d + d) / 2 + 1.5)) continue;
    if (host && shacks.some((s) => s.lvl === 1 && s.host === host)) continue;
    const ww = host ? Math.min(w, host.w - 0.6) : w, dd = host ? Math.min(d, host.d - 0.6) : d;
    solid(ctx, 'painted', box(ww, h, dd, x, y0 + h / 2, z), { color: rng.pick(colors), tag: 'shack' });
    ctx.buckets.add('painted', box(ww + 0.5, 0.12, dd + 0.5, x, y0 + h + 0.06, z), 0x3a3e44);
    glow(ctx, box(Math.min(1.2, ww - 1), 0.8, 0.06, x, y0 + 1.6, z + dd / 2 + 0.03), rng.chance(0.5) ? 0xc89a52 : 0x8fa8c8);
    const top = y0 + h;
    shacks.push({ x, z, w: ww, d: dd, lvl, top, host });
    edgeGrapples(ctx, x, z, ww, dd, top, 3);
  }
  // Planks from the roof up onto each lower shack, and from shack to shack.
  const low = shacks.filter((q) => q.lvl === 0);
  for (let i = 0; i + 1 < low.length; i++) {
    const a = low[i], c = low[i + 1];
    plank(ctx, { x: a.x, y: a.top, z: a.z }, { x: c.x, y: c.top, z: c.z }, 1);
  }
  // Wall-hung shacks on brackets off the north and east faces, reached from the fire escapes.
  for (const [nx, nz, y] of [[0, -1, 22], [1, 0, 27], [0, -1, 30], [1, 0, 16]]) {
    const w = 5, d = 2.6, h = 2.8;
    const x = S.x + nx * (S.w / 2 + d / 2) + (nz ? rng.range(-6, 6) : 0);
    const z = S.z + nz * (S.d / 2 + d / 2) + (nx ? rng.range(-6, 6) : 0);
    const sx = nz ? w : d, sz = nz ? d : w;
    solid(ctx, 'painted', box(sx, h, sz, x, y + h / 2, z), { color: rng.pick(colors), tag: 'shack' });
    for (const s of [-1, 1]) {
      const strut = box(0.12, 2.6, 0.12, 0, 0, 0).rotateX(nz ? -nz * 0.6 : 0).rotateZ(nx ? nx * 0.6 : 0);
      ctx.buckets.add('steel', strut.translate(x + (nz ? s * (w / 2 - 0.4) : -nx * 0.6), y - 1, z + (nx ? s * (w / 2 - 0.4) : -nz * 0.6)));
    }
    glow(ctx, box(nz ? 1.2 : 0.06, 0.8, nz ? 0.06 : 1.2, x + nx * (d / 2 + 0.03), y + 1.5, z + nz * (d / 2 + 0.03)), 0xc89a52);
    ctx.grapple.push({ x, y: y + h, z, nx, nz, perch: true });
  }
  waterTank(ctx, S.x - S.w / 2 + 3, S.h, S.z - S.d / 2 + 3, 1);
  const mx = S.x + S.w / 2 - 2.5, mz = S.z + S.d / 2 - 2.5;
  solid(ctx, 'steel', cylinder(0.12, 0.2, 12, mx, S.h + 6, mz, 6));
  for (let k = 1; k < 5; k++) ctx.buckets.add('steel', box(1.6 - k * 0.25, 0.05, 0.05, mx, S.h + k * 2.4, mz));
  const i = ctx.halos.add(mx, S.h + 12.2, mz, PALETTE.crimson, 3.2);
  ctx.blinkers.push({ i, size: 3.2, phase: 1.3 });
  signPlane(ctx, 'ROOMS', 0xe0b84a, S.x + S.w / 2 + 0.2, 18, S.z, 1, 0, 2.2, { vertical: true });
  ctx.facades.push({ minX: S.x - S.w / 2 + 2, minY: S.h, minZ: S.z - S.d / 2 + 2, maxX: S.x + S.w / 2 - 2, maxY: S.h + 6, maxZ: S.z + S.d / 2 - 2, style: 'brick' });
}

// Wolf Point: Black Mask's dark deco tower on the island's corner at the fork, floodlit red,
// gargoyles on the setback, ledges up the river face, a fire escape the whole way up.
function wolfPoint(ctx) {
  const W = L.wolfPoint;
  const base = 40;
  const b = {
    id: 'wolfPoint', x: W.x, z: W.z, w: W.w, d: W.d, h: base, style: 'deco', roof: 'flat', parapet: true, cornice: true, storefront: true,
    tiers: [{ w: 18, d: 18, h: W.h - base - 6 }, { w: 10, d: 10, h: 6 }], props: 'none', neon: [{ text: 'WOLF POINT', face: 'e', y: 12, color: PALETTE.crimson, vertical: true }], district: 'narrows',
  };
  building(ctx, b);
  fireEscapeLite(ctx, b, 'n', { drop: true });
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = W.x + sx * (W.w / 2 - 0.9), z = W.z + sz * (W.d / 2 - 0.9);
    plinth(ctx, x, base, z);
    addGargoyle(ctx, x, base + 0.9, z, Math.atan2(sx, sz));
    ctx.halos.add(x, base + 1.4, z, PALETTE.crimson, 8);
  }
  // Ledges every third floor on the east (river) face: standable, grapple points along them.
  for (let y = 13.6; y < base - 4; y += 10.2) {
    solid(ctx, 'trim', box(0.6, 0.3, W.d + 0.8, W.x + W.w / 2 + 0.3, y, W.z), { tag: 'ledge' });
    for (let t = -W.d / 2 + 3; t < W.d / 2; t += 6) ctx.grapple.push({ x: W.x + W.w / 2 + 0.3, y: y + 0.15, z: W.z + t, nx: 1, nz: 0 });
  }
  const i = ctx.halos.add(W.x, W.h + 14, W.z, PALETTE.crimson, 4);
  ctx.blinkers.push({ i, size: 4, phase: 0.4 });
  solid(ctx, 'steel', cylinder(0.15, 0.25, 12, W.x, W.h + 6, W.z, 6), { collide: false });
}

// The street-market court: stalls under striped canopies, crates, a lamp and strings of bulbs,
// reached through passages from the riverside and from -359.
function market(ctx) {
  const { rng } = ctx;
  const M = L.market;
  const cols = [0xb84a3a, 0x3a6a9a, 0xd9b43a, 0x2e7a5e, 0x8a3e6e];
  for (let k = 0; k < 8; k++) {
    const side = k % 2 ? 1 : -1;
    const z = M.minZ + 3 + Math.floor(k / 2) * 5;
    const x = side < 0 ? M.minX + 2.2 : M.maxX - 2.2;
    solid(ctx, 'wood', box(1.6, 0.9, 3, x, 0.6, z), { tag: 'stall' });
    for (const [dx, dz] of [[-0.8, -1.4], [0.8, -1.4], [-0.8, 1.4], [0.8, 1.4]]) ctx.buckets.add('wood', box(0.08, 2.4, 0.08, x + dx, 1.35, z + dz));
    ctx.buckets.add('painted', box(2.2, 0.08, 3.4, x, 2.6, z).rotateZ(side * 0.12), rng.pick(cols));
    for (let j = 0; j < 4; j++) ctx.buckets.add('painted', box(0.4, 0.3, 0.4, x, 1.2, z - 1 + j * 0.65), rng.pick([0xd9b43a, 0x7a9a5a, 0xb84a3a, 0xc8962f]));
  }
  // Bulb strings criss-crossing the court.
  for (let k = 0; k < 4; k++) {
    const z0 = M.minZ + 2 + k * 5;
    washingLine(ctx, { x: M.minX + 0.5, y: 4.4, z: z0 }, { x: M.maxX - 0.5, y: 4.6, z: z0 + 3 }, { items: 0 });
    for (let j = 1; j < 6; j++) {
      const t = j / 6;
      glow(ctx, box(0.16, 0.16, 0.16, M.minX + 0.5 + (M.maxX - M.minX - 1) * t, 4.2 - Math.sin(t * Math.PI) * 0.5, z0 + 3 * t), j % 2 ? 0xe8c06a : 0xd86a5a);
    }
  }
  ctx.halos.add((M.minX + M.maxX) / 2, 4, (M.minZ + M.maxZ) / 2, 0xe8c06a, 9);
  lightSpot(ctx, (M.minX + M.maxX) / 2, 3.6, (M.minZ + M.maxZ) / 2, 0xe8c06a, 22, 16);
  signPlane(ctx, 'NIGHT MARKET', 0xe8c06a, -317.3, 6, -328, 1, 0, 1.2, { back: false });
}

function clinic(ctx) {
  const C = L.clinic;
  building(ctx, { id: 'clinic', x: C.x, z: C.z, w: C.w, d: C.d, h: C.h, style: 'brick', roof: 'flat', parapet: true, cornice: true, storefront: false, tiers: [], props: 'auto', neon: [], district: 'narrows' });
  const fx = C.x + C.w / 2;
  ctx.buckets.add('painted', box(0.1, 2.6, 2, fx + 0.05, 1.45, C.z), 0x1a1c20);   // the door
  ctx.buckets.add('painted', box(1.4, 0.15, 2.8, fx + 0.7, 3.05, C.z), 0x2e3a4f);  // canopy
  signPlane(ctx, 'FREE CLINIC', PALETTE.neonCyan, fx + 0.1, 4.6, C.z, 1, 0, 1.2);
  signPlane(ctx, '+', 0xff4a4a, fx + 0.1, 8.5, C.z, 1, 0, 2.2, { back: false });
  for (const dz of [-6, 6]) ctx.buckets.add('painted', box(0.1, 1.6, 2.8, fx + 0.05, 1.6, C.z + dz), 0x55657d);
}

function gym(ctx) {
  const G = L.gym;
  building(ctx, { id: 'gym', x: G.x, z: G.z, w: G.w, d: G.d, h: G.h, style: 'brick', roof: 'flat', parapet: true, cornice: true, storefront: false, tiers: [], props: 'auto', neon: [], district: 'narrows' });
  const fx = G.x - G.w / 2;
  ctx.buckets.add('painted', box(0.1, 2.6, 2, fx - 0.05, 1.45, G.z), 0x3a1a14);
  signPlane(ctx, 'KNUCKLE DOWN BOXING', 0xff6a3a, fx - 0.1, 5.6, G.z, -1, 0, 1.0);
  signPlane(ctx, 'FIGHT NIGHT FRIDAYS', 0xcdbb8a, G.x, 7.4, G.z - G.d / 2 - 0.1, 0, -1, 0.9, { back: false });
}

// Zip lines between roofs that pass the raycast (zip() drops a blocked cable).
function zipFromRoofs(ctx, all) {
  const W = L.wolfPoint, S = L.stack;
  const roofNear = (x, z) => all.filter((b) => Math.abs(b.x - x) < 20 && Math.abs(b.z - z) < 20).sort((p, q) => q.h - p.h)[0];
  const tries = [
    [{ x: W.x, y: 40 + 2.2, z: W.z - W.d / 2 + 2 }, roofNear(-340, -322)],
    [{ x: S.x + 6, y: S.h + 2.2, z: S.z + S.d / 2 - 2 }, roofNear(-395, -385)],
    [{ x: S.x - 6, y: S.h + 2.2, z: S.z - S.d / 2 + 2 }, roofNear(-395, -515)],
    [{ x: W.x - W.w / 2 + 2, y: 40 + 2.2, z: W.z }, roofNear(-395, -270)],
  ];
  ctx.narrowsZips = 0;
  for (const [a, rb] of tries) if (rb && zip(ctx, a, { x: rb.x, y: rb.h + 2.2, z: rb.z })) ctx.narrowsZips++;
}
